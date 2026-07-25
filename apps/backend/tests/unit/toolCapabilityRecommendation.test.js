const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilityCandidateMatchResultSchema,
  CapabilityGovernanceResultSchema,
  CapabilityReadinessResultSchema,
  CapabilityRecommendationContextSchema,
  CapabilityRankingResultSchema,
  CapabilitySuggestionResponseSchema,
  CapabilitySuppressionResultSchema,
  CAPABILITY_MINIMUM_USEFUL_SCORE,
  CAPABILITY_RANKING_COMPONENT_WEIGHTS,
  applyCapabilityGovernancePolicy,
  applyCapabilitySuppressionPolicy,
  buildCapabilitySuggestionResponse,
  buildCapabilityRecommendationContext,
  canonicalCapabilityRegistry,
  createToolCapabilityRegistry,
  evaluateCapabilityCandidateReadiness,
  matchCapabilityCandidates,
  rankCapabilityCandidates,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  goldenTestHomes,
} = require('../fixtures/productFramework/goldenTestHomes.js');
const {
  buildCapabilityActionSourceMetadata,
  aggregateCapabilityLifecycleEvents,
  isRecommendationDefinitionOperational,
  getCapabilitySuggestions,
  getCapabilitySuggestionsFromAuthorizedSources,
} = require('../../src/services/capabilityRecommendation.service.ts');
const {
  CapabilityCompletionNextBodySchema,
  CapabilitySuggestionsQuerySchema,
} = require('../../src/routes/capabilitySuggestions.routes.ts');
const {
  recordCapabilityCompletionAndResolveNext,
} = require('../../src/services/capabilityCompletion.service.ts');
const capabilitySuggestionsRouter =
  require('../../src/routes/capabilitySuggestions.routes.ts').default;
const {
  authenticate,
} = require('../../src/middleware/auth.middleware.ts');
const {
  propertyAuthMiddleware,
} = require('../../src/middleware/propertyAuth.middleware.ts');

const NOW = '2026-07-24T12:00:00.000Z';

test('CAP-704 paused and out-of-window recommendation definitions are suppressed', () => {
  const now = new Date(NOW);
  const active = {
    status: 'ACTIVE',
    pausedAt: null,
    effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-08-01T00:00:00.000Z'),
  };
  assert.equal(isRecommendationDefinitionOperational(active, now), true);
  assert.equal(isRecommendationDefinitionOperational({
    ...active,
    pausedAt: new Date('2026-07-20T00:00:00.000Z'),
  }, now), false);
  assert.equal(isRecommendationDefinitionOperational({
    ...active,
    effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
  }, now), false);
  assert.equal(isRecommendationDefinitionOperational({
    ...active,
    status: 'RETIRED',
  }, now), false);
});

function action(overrides = {}) {
  return {
    ...structuredClone(goldenTestHomes[0].action),
    id: 'action-1',
    propertyId: 'property-1',
    lineageId: 'lineage-1',
    state: 'OPEN',
    lastEvaluatedAt: NOW,
    ranking: { rank: 2 },
    ...overrides,
  };
}

function propertyContext(overrides = {}) {
  return {
    propertyId: 'property-1',
    contextVersion: 'context-v7',
    generatedAt: NOW,
    scopes: ['CORE', 'SYSTEMS', 'OPTIONAL_HOUSEHOLD'],
    facts: {
      'core.yearBuilt': {
        key: 'core.yearBuilt',
        value: 1987,
        state: 'KNOWN',
        source: 'PUBLIC_RECORD',
        verified: true,
        confidence: 0.92,
        observedAt: NOW,
        validUntil: null,
        correctionPath: '/private/edit/path',
      },
      'systems.hasCooling': {
        key: 'systems.hasCooling',
        value: true,
        state: 'STALE',
        source: 'SYSTEM_DERIVED',
        verified: false,
        confidence: 0.7,
        observedAt: NOW,
        validUntil: '2026-07-23T12:00:00.000Z',
        correctionPath: '/private/system/path',
      },
    },
    warnings: [{ code: 'STALE_SOURCE', factKeys: ['systems.hasCooling'] }],
    ...overrides,
  };
}

test('CAP-400 builds a deterministic normalized evaluator source contract', () => {
  const result = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [
      action({ id: 'action-b', ranking: { rank: 2 } }),
      action({ id: 'action-a', ranking: { rank: 1 } }),
    ],
    actionSourceMetadata: [{
      actionId: 'action-a',
      signalIntentFamilies: ['coverage_gap', 'coverage_gap'],
      sourceEntityType: 'INVENTORY_ITEM',
      ctaCapabilityIds: ['coverage-options'],
      recommendationDefinitionCodes: ['coverage_gap_review'],
      missingFactKeys: ['coverage.insurancePolicies'],
    }],
    journeys: [{
      id: 'journey-1',
      kind: 'ASSET_LIFECYCLE',
      status: 'ACTIVE',
      stage: 'OPTIONS',
      sourceActionId: 'action-a',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: 'item-1',
      signalIntentFamily: 'coverage_gap',
    }],
    projects: [{
      id: 'project-1',
      kind: 'RENOVATION',
      status: 'IN_PROGRESS',
      milestoneKind: 'PERMIT_REVIEW',
    }],
    personalizationRecommendations: [{
      id: 'recommendation-1',
      definitionCode: 'coverage_gap_review',
      status: 'ACTIVE',
      recommendationVersion: 'r2:c3',
      contextVersion: 'context-v7',
      lastEvaluatedAt: NOW,
    }],
    completions: [{
      id: 'completion-1',
      capabilityId: 'inspection-hub',
      capabilityVersion: 1,
      completionSignal: 'inspection_report_reviewed',
      outputEntityType: 'INSPECTION_REPORT',
      outputEntityId: 'report-1',
      verifiedAt: NOW,
    }],
    availableCapabilityIds: ['seller-prep', 'coverage-options', 'coverage-options'],
    availabilityPolicyVersion: 'rollout-v2',
    lifecycle: [{
      capabilityId: 'coverage-options',
      impressionCount30Days: 2,
      lastImpressionAt: NOW,
      lastDismissedAt: null,
      lastCompletedAt: null,
    }],
    sourceContext: {
      kind: 'HOME_ACTION',
      id: 'action-a',
      actionId: 'action-a',
      entityType: 'INVENTORY_ITEM',
      entityId: 'item-1',
    },
    surface: 'HOME',
    limit: 99,
  });

  assert.doesNotThrow(() => CapabilityRecommendationContextSchema.parse(result));
  assert.equal(result.contractVersion, 'capability-recommendation-context-v1');
  assert.equal(result.limit, 10);
  assert.deepEqual(result.actions.map((item) => item.id), ['action-a', 'action-b']);
  assert.deepEqual(result.actions[0].signalIntentFamilies, ['coverage_gap']);
  assert.deepEqual(result.availability.availableCapabilityIds, [
    'coverage-options',
    'seller-prep',
  ]);
  assert.equal(result.propertyContext.knownFactCount, 1);
  assert.equal(result.propertyContext.staleFactCount, 1);
  assert.deepEqual(result.propertyContext.readinessMetrics, {
    trackedSystemCount: null,
    coverageGapCount: null,
    jurisdictionStatus: 'UNKNOWN',
  });
  assert.equal(result.availability.status, 'EVALUATED');
  assert.deepEqual(result.governance, {
    canUseCapabilities: false,
    allowedSafetyTiers: [],
    enforceApprovals: false,
    approvedCapabilityIds: [],
    evidenceAccess: 'DENIED',
    contextFreshness: 'CURRENT',
  });
});

test('CAP-400 excludes raw values, action prose/evidence, and optional household scope', () => {
  const rawAction = action();
  rawAction.signal = 'SECRET ACTION SIGNAL';
  rawAction.whyItMatters = 'SECRET WHY';
  rawAction.evidence[0].label = 'SECRET EVIDENCE';
  const context = propertyContext();
  context.facts['core.yearBuilt'].value = 'SECRET FACT VALUE';

  const result = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: context,
    actions: [rawAction],
    surface: 'PROPERTY',
  });
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(serialized, /SECRET/);
  assert.doesNotMatch(serialized, /correctionPath/);
  assert.doesNotMatch(serialized, /OPTIONAL_HOUSEHOLD/);
  assert.equal('value' in result.propertyContext.facts[0], false);
  assert.equal('signal' in result.actions[0], false);
  assert.equal('evidence' in result.actions[0], false);
});

test('CAP-400 rejects property-crossing snapshots and Home Actions', () => {
  assert.throws(
    () => buildCapabilityRecommendationContext({
      propertyId: 'property-2',
      propertyContext: propertyContext(),
      actions: [],
      surface: 'HOME',
    }),
    /authorized snapshot/,
  );

  assert.throws(
    () => buildCapabilityRecommendationContext({
      propertyId: 'property-1',
      propertyContext: propertyContext(),
      actions: [action({ propertyId: 'property-2' })],
      surface: 'HOME',
    }),
    /different property/,
  );
});

function matcherRegistry() {
  const coverage = structuredClone(
    canonicalCapabilityRegistry.getById('coverage-options'),
  );
  const inspection = structuredClone(
    canonicalCapabilityRegistry.getById('inspection-hub'),
  );
  coverage.recommendation.recommendationDefinitionCodes = ['coverage_gap_review'];
  coverage.destination.acceptedContext = ['PROPERTY', 'INVENTORY_ITEM', 'DOCUMENT'];
  coverage.recommendation.explicitRelatedCapabilityIds = [];
  inspection.recommendation.explicitRelatedCapabilityIds = ['coverage-options'];
  inspection.lifecycle.outputEntityTypes = ['DOCUMENT'];
  return createToolCapabilityRegistry([coverage, inspection]);
}

function matcherContext(overrides = {}) {
  return buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'COVERAGE',
        entityId: 'item-1',
        version: 'action-v2',
      },
      job: 'DECIDE',
      ranking: { rank: 1 },
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
      sourceEntityType: 'INVENTORY_ITEM',
      ctaCapabilityIds: ['coverage-options'],
      recommendationDefinitionCodes: ['coverage_gap_review'],
    }],
    journeys: [{
      id: 'journey-1',
      kind: 'COVERAGE_GAPS_PRESENT',
      status: 'ACTIVE',
      signalIntentFamily: 'COVERAGE_GAPS_PRESENT',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: 'item-1',
    }],
    projects: [{
      id: 'project-1',
      kind: 'INSURANCE_REVIEW',
      status: 'IN_PROGRESS',
      milestoneKind: 'COVERAGE_GAPS_PRESENT',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    personalizationRecommendations: [{
      id: 'recommendation-1',
      definitionCode: 'coverage_gap_review',
      status: 'ACTIVE',
      recommendationVersion: 'r2:c3',
      contextVersion: 'context-v7',
      lastEvaluatedAt: NOW,
    }],
    completions: [{
      id: 'completion-1',
      capabilityId: 'inspection-hub',
      capabilityVersion: 1,
      completionSignal: 'inspection_report_reviewed',
      outputEntityType: 'DOCUMENT',
      outputEntityId: 'report-1',
      verifiedAt: NOW,
    }],
    surface: 'HOME',
    ...overrides,
  });
}

test('CAP-401 matches every reviewed structured source with stable precedence', () => {
  const result = matchCapabilityCandidates({
    registry: matcherRegistry(),
    context: matcherContext(),
  });

  assert.doesNotThrow(() => CapabilityCandidateMatchResultSchema.parse(result));
  const coverage = result.candidates.filter(
    (candidate) => candidate.capabilityId === 'coverage-options',
  );
  assert.deepEqual(
    coverage.map((candidate) => candidate.source.kind),
    ['HOME_ACTION', 'PERSONALIZATION', 'JOURNEY', 'PROJECT', 'COMPLETION'],
  );

  const actionCandidate = coverage.find(
    (candidate) => candidate.source.kind === 'HOME_ACTION',
  );
  assert.equal(actionCandidate.primaryMatch.kind, 'EXPLICIT_ACTION_CTA');
  assert.deepEqual(
    actionCandidate.matches.map((match) => match.kind),
    [
      'EXPLICIT_ACTION_CTA',
      'RECOMMENDATION_DEFINITION',
      'SIGNAL_INTENT_FAMILY',
      'ACTION_SOURCE_KIND_JOB',
      'SOURCE_ENTITY_TYPE',
    ],
  );
  assert.equal(actionCandidate.reasonTemplateKey, 'COVERAGE_GAPS_PRESENT');
  assert.equal(
    coverage.find((candidate) => candidate.source.kind === 'PERSONALIZATION')
      .primaryMatch.kind,
    'RECOMMENDATION_DEFINITION',
  );
  assert.equal(
    coverage.find((candidate) => candidate.source.kind === 'COMPLETION')
      .primaryMatch.kind,
    'COMPLETION_OUTPUT_RELATIONSHIP',
  );
});

test('CAP-401 is deterministic and ignores catalog-only and free-text-only matches', () => {
  const context = matcherContext({
    actions: [action({
      signal: 'Use the Value Tracker appreciation tool right now',
      source: {
        kind: 'SYSTEM',
        entityId: 'system-1',
        version: 'action-v1',
      },
      job: 'STAY_AHEAD',
    })],
    actionSourceMetadata: [],
    journeys: [],
    projects: [],
    personalizationRecommendations: [],
    completions: [],
  });

  const first = matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
  });
  const second = matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context: structuredClone(context),
  });

  assert.deepEqual(first, second);
  assert.equal(
    first.candidates.some((candidate) => candidate.capabilityId === 'appreciation'),
    false,
  );
  assert.equal(
    JSON.stringify(first).includes('Value Tracker appreciation tool'),
    false,
  );
});

test('CAP-401 ignores inactive journeys, projects, and personalization sources', () => {
  const context = matcherContext({
    actions: [],
    journeys: [{
      id: 'journey-1',
      kind: 'COVERAGE_GAPS_PRESENT',
      status: 'COMPLETED',
      signalIntentFamily: 'COVERAGE_GAPS_PRESENT',
    }],
    projects: [{
      id: 'project-1',
      kind: 'COVERAGE_GAPS_PRESENT',
      status: 'COMPLETED',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    personalizationRecommendations: [{
      id: 'recommendation-1',
      definitionCode: 'coverage_gap_review',
      status: 'DISMISSED',
      recommendationVersion: 'r2:c3',
      lastEvaluatedAt: NOW,
    }],
    completions: [],
  });

  const result = matchCapabilityCandidates({
    registry: matcherRegistry(),
    context,
  });
  assert.deepEqual(result.candidates, []);
});

function evaluateReadiness(context, registry = canonicalCapabilityRegistry) {
  const matchResult = matchCapabilityCandidates({ registry, context });
  return evaluateCapabilityCandidateReadiness({
    registry,
    context,
    matchResult,
  });
}

function candidateById(result, capabilityId) {
  const candidate = result.candidates.find(
    (item) => item.capabilityId === capabilityId,
  );
  assert.ok(candidate, `Expected ${capabilityId} candidate`);
  return candidate;
}

test('CAP-402 returns READY when required structured context is satisfied', () => {
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'COVERAGE',
        entityId: 'item-1',
        version: 'action-v2',
      },
      job: 'DECIDE',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
      ctaCapabilityIds: ['coverage-options'],
    }],
    readinessMetrics: {
      trackedSystemCount: 2,
      coverageGapCount: 1,
      jurisdictionStatus: 'KNOWN',
    },
    surface: 'HOME',
  });

  const result = evaluateReadiness(context);
  assert.doesNotThrow(() => CapabilityReadinessResultSchema.parse(result));
  const coverage = candidateById(result, 'coverage-options');
  assert.equal(coverage.readiness.state, 'READY');
  assert.equal(
    coverage.readiness.checks.every((item) => item.result === 'TRUE'),
    true,
  );
});

test('CAP-402 fails closed for false or unknown regulated and material readiness', () => {
  const coverageContext = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'COVERAGE',
        entityId: 'item-1',
        version: 'action-v2',
      },
      job: 'DECIDE',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    readinessMetrics: { coverageGapCount: 0 },
    surface: 'HOME',
  });
  const coverage = candidateById(
    evaluateReadiness(coverageContext),
    'coverage-options',
  );
  assert.equal(coverage.readiness.state, 'UNAVAILABLE');
  assert.equal(
    coverage.readiness.checks.find((item) => item.kind === 'COVERAGE_GAPS')
      .result,
    'FALSE',
  );

  const capitalContext = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'SYSTEM',
        entityId: 'system-1',
        version: 'action-v1',
      },
      job: 'MAJOR_MOMENT',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['TRACKED_SYSTEMS_AVAILABLE'],
    }],
    readinessMetrics: { trackedSystemCount: 0 },
    surface: 'HOME',
  });
  const capital = candidateById(
    evaluateReadiness(capitalContext),
    'capital-timeline',
  );
  assert.equal(capital.readiness.state, 'UNAVAILABLE');
  assert.equal(capital.readiness.safePartialValue, false);
  assert.equal(
    capital.readiness.checks.find((item) => item.kind === 'TRACKED_SYSTEMS')
      .result,
    'UNKNOWN',
  );
});

test('CAP-402 allows NEEDS_CONTEXT only for explicitly reviewed safe partial value', () => {
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'SYSTEM',
        entityId: 'system-1',
        version: 'action-v1',
      },
      job: 'DECIDE',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['PROPERTY_BENEFIT_EXPLORATION'],
      missingFactKeys: ['systems.installedItemTypes'],
    }],
    readinessMetrics: { trackedSystemCount: 0 },
    surface: 'HOME',
  });
  const hiddenAsset = candidateById(
    evaluateReadiness(context),
    'hidden-asset-finder',
  );

  assert.equal(hiddenAsset.readiness.state, 'NEEDS_CONTEXT');
  assert.equal(hiddenAsset.readiness.safePartialValue, true);
  assert.deepEqual(
    hiddenAsset.readiness.missingFactKeys,
    ['systems.installedItemTypes'],
  );
});

test('CAP-402 evaluates required source context and jurisdiction without raw facts', () => {
  const plantContext = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'MAINTENANCE',
        entityId: 'task-1',
        version: 'action-v1',
      },
      job: 'STAY_AHEAD',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['PLANT_SUITABLE_ROOM_CONTEXT'],
    }],
    surface: 'HOME',
  });
  const plant = candidateById(
    evaluateReadiness(plantContext),
    'plant-advisor',
  );
  assert.equal(plant.readiness.state, 'NEEDS_CONTEXT');
  assert.equal(
    plant.readiness.checks.find((item) => item.kind === 'SOURCE_CONTEXT')
      .result,
    'UNKNOWN',
  );

  const hiddenAsset = structuredClone(
    canonicalCapabilityRegistry.getById('hidden-asset-finder'),
  );
  hiddenAsset.recommendation.readinessRequirements = [
    { kind: 'JURISDICTION', reason: 'Confirm an eligible jurisdiction.' },
  ];
  hiddenAsset.recommendation.explicitRelatedCapabilityIds = [];
  const jurisdictionRegistry = createToolCapabilityRegistry([hiddenAsset]);
  const unsupportedContext = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'SYSTEM',
        entityId: 'system-1',
        version: 'action-v1',
      },
      job: 'DECIDE',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['PROPERTY_BENEFIT_EXPLORATION'],
    }],
    readinessMetrics: { jurisdictionStatus: 'UNSUPPORTED' },
    surface: 'HOME',
  });
  const unsupported = candidateById(
    evaluateReadiness(unsupportedContext, jurisdictionRegistry),
    'hidden-asset-finder',
  );
  assert.equal(unsupported.readiness.state, 'UNAVAILABLE');
  assert.equal(
    unsupported.readiness.checks.find((item) => item.kind === 'JURISDICTION')
      .result,
    'FALSE',
  );
  assert.doesNotMatch(JSON.stringify(unsupported), /1987|SECRET/);
});

test('CAP-402 rejects stale registry and context versions', () => {
  const context = matcherContext();
  const matchResult = matchCapabilityCandidates({
    registry: matcherRegistry(),
    context,
  });
  const staleContext = structuredClone(context);
  staleContext.contextVersion = 'context-v8';
  assert.throws(
    () => evaluateCapabilityCandidateReadiness({
      registry: matcherRegistry(),
      context: staleContext,
      matchResult,
    }),
    /context version is stale/,
  );

  const staleRegistryResult = structuredClone(matchResult);
  staleRegistryResult.registryVersion = 'registry-v0';
  assert.throws(
    () => evaluateCapabilityCandidateReadiness({
      registry: matcherRegistry(),
      context,
      matchResult: staleRegistryResult,
    }),
    /registry version/,
  );
});

function govern(context, registry = canonicalCapabilityRegistry) {
  const matchResult = matchCapabilityCandidates({ registry, context });
  const readinessResult = evaluateCapabilityCandidateReadiness({
    registry,
    context,
    matchResult,
  });
  return applyCapabilityGovernancePolicy({
    registry,
    context,
    readinessResult,
  });
}

function suppress(context, registry = canonicalCapabilityRegistry) {
  return applyCapabilitySuppressionPolicy({
    registry,
    context,
    governanceResult: govern(context, registry),
  });
}

function governedCoverageContext(overrides = {}) {
  const sourceAction = action({
    source: {
      kind: 'COVERAGE',
      entityId: 'item-1',
      version: 'action-v2',
    },
    job: 'DECIDE',
  });
  return buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [sourceAction],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
      ctaCapabilityIds: ['coverage-options'],
    }],
    readinessMetrics: {
      coverageGapCount: 1,
      jurisdictionStatus: 'KNOWN',
    },
    availableCapabilityIds: ['coverage-options'],
    availabilityPolicyVersion: 'rollout-v2',
    availabilityStatus: 'EVALUATED',
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['REGULATED_COVERAGE'],
      enforceApprovals: true,
      approvedCapabilityIds: ['coverage-options'],
      evidenceAccess: 'ALLOWED',
      contextFreshness: 'CURRENT',
    },
    surface: 'HOME',
    ...overrides,
  });
}

test('CAP-403 promotes only candidates passing release, permission, safety, and freshness gates', () => {
  const result = govern(governedCoverageContext());
  assert.doesNotThrow(() => CapabilityGovernanceResultSchema.parse(result));
  const coverage = candidateById(result, 'coverage-options');
  assert.deepEqual(coverage.policy, {
    decision: 'PROMOTABLE',
    reasonCodes: [],
    ctaAllowed: true,
    evidenceMode: 'STRUCTURED_ONLY',
    policyVersion: 'rollout-v2',
  });
  assert.deepEqual(result.diagnostics, {
    promotableCount: 1,
    withheldCount: 0,
    blockedCount: 1,
  });
});

test('CAP-403 blocks unavailable, unauthorized, unapproved, and stale candidates', () => {
  const cases = [
    {
      name: 'availability policy',
      overrides: {
        availabilityStatus: 'POLICY_UNAVAILABLE',
      },
      reason: 'RELEASE_POLICY_UNAVAILABLE',
    },
    {
      name: 'capability rollout',
      overrides: {
        availableCapabilityIds: [],
      },
      reason: 'CAPABILITY_NOT_AVAILABLE',
    },
    {
      name: 'permission',
      overrides: {
        governance: {
          canUseCapabilities: false,
          allowedSafetyTiers: ['REGULATED_COVERAGE'],
          enforceApprovals: false,
          evidenceAccess: 'ALLOWED',
          contextFreshness: 'CURRENT',
        },
      },
      reason: 'CAPABILITY_PERMISSION_DENIED',
    },
    {
      name: 'safety tier',
      overrides: {
        governance: {
          canUseCapabilities: true,
          allowedSafetyTiers: ['LOW_CONSEQUENCE'],
          enforceApprovals: false,
          evidenceAccess: 'ALLOWED',
          contextFreshness: 'CURRENT',
        },
      },
      reason: 'SAFETY_TIER_NOT_PERMITTED',
    },
    {
      name: 'approval',
      overrides: {
        governance: {
          canUseCapabilities: true,
          allowedSafetyTiers: ['REGULATED_COVERAGE'],
          enforceApprovals: true,
          approvedCapabilityIds: [],
          evidenceAccess: 'ALLOWED',
          contextFreshness: 'CURRENT',
        },
      },
      reason: 'GOVERNANCE_APPROVAL_MISSING',
    },
    {
      name: 'freshness',
      overrides: {
        governance: {
          canUseCapabilities: true,
          allowedSafetyTiers: ['REGULATED_COVERAGE'],
          enforceApprovals: false,
          evidenceAccess: 'ALLOWED',
          contextFreshness: 'STALE',
        },
      },
      reason: 'CONTEXT_STALE',
    },
  ];

  for (const fixture of cases) {
    const coverage = candidateById(
      govern(governedCoverageContext(fixture.overrides)),
      'coverage-options',
    );
    assert.equal(coverage.policy.decision, 'BLOCKED', fixture.name);
    assert.equal(coverage.policy.ctaAllowed, false, fixture.name);
    assert.equal(
      coverage.policy.reasonCodes.includes(fixture.reason),
      true,
      fixture.name,
    );
  }
});

test('CAP-403 applies degraded-response withholding without exposing evidence', () => {
  const degradedAction = action({
    source: {
      kind: 'COVERAGE',
      entityId: 'item-1',
      version: 'action-v2',
    },
    job: 'DECIDE',
    recommendationResponse: {
      ...action().recommendationResponse,
      status: 'LOW_CONFIDENCE',
      reasonCode: 'RECOMMENDATION_LOW_CONFIDENCE',
      materialActionAllowed: false,
    },
  });
  const context = governedCoverageContext({ actions: [degradedAction] });
  const coverage = candidateById(govern(context), 'coverage-options');

  assert.equal(coverage.policy.decision, 'WITHHELD');
  assert.equal(coverage.policy.ctaAllowed, false);
  assert.equal(coverage.policy.evidenceMode, 'OMIT');
  assert.deepEqual(coverage.policy.reasonCodes, [
    'SOURCE_RESPONSE_LOW_CONFIDENCE',
    'SOURCE_MATERIAL_ACTION_WITHHELD',
  ]);
});

test('CAP-403 can omit unauthorized evidence without blocking an otherwise safe CTA', () => {
  const context = governedCoverageContext({
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['REGULATED_COVERAGE'],
      enforceApprovals: false,
      evidenceAccess: 'REDACTED',
      contextFreshness: 'CURRENT',
    },
  });
  const coverage = candidateById(govern(context), 'coverage-options');

  assert.equal(coverage.policy.decision, 'PROMOTABLE');
  assert.equal(coverage.policy.ctaAllowed, true);
  assert.equal(coverage.policy.evidenceMode, 'OMIT');
  assert.deepEqual(coverage.policy.reasonCodes, [
    'EVIDENCE_ACCESS_RESTRICTED',
  ]);
});

test('CAP-403 rejects stale readiness results before applying policy', () => {
  const context = governedCoverageContext();
  const matchResult = matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
  });
  const readinessResult = evaluateCapabilityCandidateReadiness({
    registry: canonicalCapabilityRegistry,
    context,
    matchResult,
  });
  readinessResult.contextVersion = 'context-v0';
  assert.throws(
    () => applyCapabilityGovernancePolicy({
      registry: canonicalCapabilityRegistry,
      context,
      readinessResult,
    }),
    /context version is stale/,
  );
});

test('CAP-404 suppresses a capability already launched by its source action', () => {
  const result = suppress(governedCoverageContext());
  assert.doesNotThrow(() => CapabilitySuppressionResultSchema.parse(result));
  const coverage = candidateById(result, 'coverage-options');

  assert.equal(coverage.suppression.suppressed, true);
  assert.deepEqual(coverage.suppression.reasonCodes, [
    'SOURCE_ACTION_ALREADY_LAUNCHES_CAPABILITY',
  ]);
  assert.equal(
    result.diagnostics.retainedCount + result.diagnostics.suppressedCount,
    result.candidates.length,
  );
});

test('CAP-404 rejects terminal and explicitly stale source actions', () => {
  for (const fixture of [
    {
      state: 'COMPLETED',
      freshness: 'CURRENT',
      reason: 'SOURCE_ACTION_TERMINAL',
    },
    {
      state: 'OPEN',
      freshness: 'STALE',
      reason: 'SOURCE_ACTION_STALE',
    },
  ]) {
    const sourceAction = action({
      state: fixture.state,
      source: {
        kind: 'COVERAGE',
        entityId: 'item-1',
        version: 'action-v2',
      },
      job: 'DECIDE',
    });
    const context = governedCoverageContext({
      actions: [sourceAction],
      actionSourceMetadata: [{
        actionId: 'action-1',
        freshness: fixture.freshness,
        signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
      }],
    });
    const coverage = candidateById(suppress(context), 'coverage-options');
    assert.equal(coverage.suppression.suppressed, true);
    assert.equal(
      coverage.suppression.reasonCodes.includes(fixture.reason),
      true,
    );
  }
});

test('CAP-404 enforces dismissal cooldown and impression frequency caps', () => {
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    lifecycle: [{
      capabilityId: 'coverage-options',
      impressionCount30Days: 3,
      lastImpressionAt: '2026-07-23T12:00:00.000Z',
      lastDismissedAt: '2026-07-20T12:00:00.000Z',
      lastCompletedAt: null,
    }],
  });
  const coverage = candidateById(suppress(context), 'coverage-options');

  assert.deepEqual(coverage.suppression.reasonCodes, [
    'RECENTLY_DISMISSED',
    'FREQUENCY_CAP_REACHED',
  ]);
});

test('CAP-404 allows renewed relevance after completion and suppresses older signals', () => {
  const contextFor = (lastEvaluatedAt, sourceVersion = 'action-v2') => governedCoverageContext({
    actions: [action({
      lastEvaluatedAt,
      source: {
        kind: 'COVERAGE',
        entityId: 'item-1',
        version: sourceVersion,
      },
      job: 'DECIDE',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    lifecycle: [{
      capabilityId: 'coverage-options',
      impressionCount30Days: 0,
      lastImpressionAt: null,
      lastDismissedAt: null,
      lastCompletedAt: '2026-07-22T12:00:00.000Z',
      lastCompletedSourceActionId: 'action-1',
      lastCompletedSourceVersion: 'action-v2',
      lastCompletedContextVersion: 'context-v7',
    }],
  });

  const oldSignal = candidateById(
    suppress(contextFor('2026-07-21T12:00:00.000Z')),
    'coverage-options',
  );
  const renewedSignal = candidateById(
    suppress(contextFor('2026-07-23T12:00:00.000Z', 'action-v3')),
    'coverage-options',
  );
  assert.equal(
    oldSignal.suppression.reasonCodes.includes(
      'COMPLETED_WITHOUT_RENEWED_RELEVANCE',
    ),
    true,
  );
  assert.deepEqual(renewedSignal.suppression, {
    suppressed: false,
    reasonCodes: [],
  });
});

test('CAP-701 scopes frequency caps to the same source action and context version', () => {
  const lifecycle = [{
    capabilityId: 'coverage-options',
    impressionCount30Days: 6,
    lastImpressionAt: '2026-07-23T12:00:00.000Z',
    lastDismissedAt: null,
    lastCompletedAt: null,
    impressionScopes30Days: [
      {
        sourceActionId: 'action-old',
        contextVersion: 'context-v7',
        count: 3,
        lastImpressionAt: '2026-07-22T12:00:00.000Z',
      },
      {
        sourceActionId: 'action-1',
        contextVersion: 'context-v6',
        count: 3,
        lastImpressionAt: '2026-07-23T12:00:00.000Z',
      },
    ],
  }];
  const renewedScope = candidateById(
    suppress(governedCoverageContext({ lifecycle })),
    'coverage-options',
  );
  assert.equal(
    renewedScope.suppression.reasonCodes.includes('FREQUENCY_CAP_REACHED'),
    false,
  );

  lifecycle[0].impressionScopes30Days.push({
    sourceActionId: 'action-1',
    contextVersion: 'context-v7',
    count: 3,
    lastImpressionAt: '2026-07-24T10:00:00.000Z',
  });
  const cappedScope = candidateById(
    suppress(governedCoverageContext({ lifecycle })),
    'coverage-options',
  );
  assert.equal(
    cappedScope.suppression.reasonCodes.includes('FREQUENCY_CAP_REACHED'),
    true,
  );
});

test('CAP-701 applies not-relevant renewal and explicit snooze expiry', () => {
  const contextFor = (
    lastEvaluatedAt,
    generatedAt = NOW,
    sourceVersion = 'action-v2',
  ) =>
    governedCoverageContext({
      propertyContext: propertyContext({ generatedAt }),
      actions: [action({
        lastEvaluatedAt,
        source: {
          kind: 'COVERAGE',
          entityId: 'item-1',
          version: sourceVersion,
        },
        job: 'DECIDE',
      })],
      actionSourceMetadata: [{
        actionId: 'action-1',
        signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
      }],
      lifecycle: [{
        capabilityId: 'coverage-options',
        impressionCount30Days: 0,
        lastImpressionAt: null,
        lastDismissedAt: null,
        lastNotRelevantAt: '2026-07-22T12:00:00.000Z',
        lastNotRelevantSourceActionId: 'action-1',
        lastNotRelevantSourceVersion: 'action-v2',
        lastNotRelevantContextVersion: 'context-v7',
        snoozedUntil: '2026-07-25T12:00:00.000Z',
        lastCompletedAt: null,
      }],
    });

  const stale = candidateById(
    suppress(contextFor('2026-07-21T12:00:00.000Z')),
    'coverage-options',
  );
  assert.equal(
    stale.suppression.reasonCodes.includes(
      'NOT_RELEVANT_WITHOUT_RENEWED_RELEVANCE',
    ),
    true,
  );
  assert.equal(
    stale.suppression.reasonCodes.includes('SNOOZED_UNTIL'),
    true,
  );

  const renewedAfterExpiry = candidateById(
    suppress(contextFor(
      '2026-07-23T12:00:00.000Z',
      '2026-07-26T12:00:00.000Z',
      'action-v3',
    )),
    'coverage-options',
  );
  assert.equal(
    renewedAfterExpiry.suppression.reasonCodes.includes(
      'NOT_RELEVANT_WITHOUT_RENEWED_RELEVANCE',
    ),
    false,
  );
  assert.equal(
    renewedAfterExpiry.suppression.reasonCodes.includes('SNOOZED_UNTIL'),
    false,
  );
});

test('CAP-701 aggregates lifecycle feedback and scoped actual-view events', () => {
  const events = aggregateCapabilityLifecycleEvents([
    {
      featureKey: 'coverage-options',
      eventName: 'TOOL_DISCOVERED',
      occurredAt: new Date('2026-07-20T12:00:00.000Z'),
      metadataJson: {
        sourceActionId: 'action-1',
        contextVersion: 'context-v7',
      },
    },
    {
      featureKey: 'coverage-options',
      eventName: 'TOOL_DISCOVERED',
      occurredAt: new Date('2026-07-21T12:00:00.000Z'),
      metadataJson: {
        sourceActionId: 'action-1',
        contextVersion: 'context-v7',
      },
    },
    {
      featureKey: 'coverage-options',
      eventName: 'TOOL_NOT_RELEVANT',
      occurredAt: new Date('2026-07-22T12:00:00.000Z'),
      metadataJson: {},
    },
    {
      featureKey: 'coverage-options',
      eventName: 'TOOL_SNOOZED',
      occurredAt: new Date('2026-07-23T12:00:00.000Z'),
      metadataJson: { snoozedUntil: '2026-07-30T12:00:00.000Z' },
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].impressionCount30Days, 2);
  assert.deepEqual(events[0].impressionScopes30Days, [{
    sourceActionId: 'action-1',
    contextVersion: 'context-v7',
    count: 2,
    lastImpressionAt: '2026-07-21T12:00:00.000Z',
  }]);
  assert.equal(events[0].lastNotRelevantAt, '2026-07-22T12:00:00.000Z');
  assert.equal(events[0].snoozedUntil, '2026-07-30T12:00:00.000Z');
});

test('CAP-404 suppresses equivalent outcomes for one source deterministically', () => {
  const coverage = structuredClone(
    canonicalCapabilityRegistry.getById('coverage-options'),
  );
  const inspection = structuredClone(
    canonicalCapabilityRegistry.getById('inspection-hub'),
  );
  for (const capability of [coverage, inspection]) {
    capability.recommendation.sourceKinds = ['COVERAGE'];
    capability.recommendation.jobs = ['DECIDE'];
    capability.recommendation.triggerFamilies = ['COVERAGE_GAPS_PRESENT'];
    capability.recommendation.readinessRequirements = [];
    capability.presentation.outcomeCategory = 'SAVE_OPTIMIZE';
    capability.recommendation.explicitRelatedCapabilityIds = [];
  }
  const registry = createToolCapabilityRegistry([coverage, inspection]);
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    availableCapabilityIds: ['coverage-options', 'inspection-hub'],
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['LOW_CONSEQUENCE', 'REGULATED_COVERAGE'],
      enforceApprovals: false,
      evidenceAccess: 'ALLOWED',
      contextFreshness: 'CURRENT',
    },
  });
  const result = suppress(context, registry);
  const retained = result.candidates.filter(
    (candidate) => !candidate.suppression.suppressed,
  );
  const duplicate = result.candidates.find((candidate) =>
    candidate.suppression.reasonCodes.includes('EQUIVALENT_OUTCOME_DUPLICATE'));

  assert.equal(retained.length, 1);
  assert.equal(retained[0].capabilityId, 'coverage-options');
  assert.equal(duplicate.capabilityId, 'inspection-hub');
});

test('CAP-404 keeps workflow-only capabilities out of non-workflow surfaces', () => {
  const inspection = structuredClone(
    canonicalCapabilityRegistry.getById('inspection-hub'),
  );
  const quoteComparison = structuredClone(
    canonicalCapabilityRegistry.getById('quote-comparison'),
  );
  inspection.recommendation.explicitRelatedCapabilityIds = ['quote-comparison'];
  quoteComparison.recommendation.explicitRelatedCapabilityIds = [];
  const registry = createToolCapabilityRegistry([inspection, quoteComparison]);
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [],
    completions: [{
      id: 'completion-1',
      capabilityId: 'inspection-hub',
      capabilityVersion: 1,
      completionSignal: 'inspection_report_reviewed',
      outputEntityType: 'DOCUMENT',
      outputEntityId: 'report-1',
      verifiedAt: NOW,
    }],
    availableCapabilityIds: ['quote-comparison'],
    availabilityPolicyVersion: 'rollout-v2',
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['LOW_CONSEQUENCE'],
      evidenceAccess: 'ALLOWED',
    },
    surface: 'HOME',
  });
  const quote = candidateById(suppress(context, registry), 'quote-comparison');

  assert.deepEqual(quote.suppression.reasonCodes, [
    'WORKFLOW_CONTEXT_REQUIRED',
  ]);

  const completionContext = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [],
    completions: [{
      id: 'completion-1',
      capabilityId: 'inspection-hub',
      capabilityVersion: 1,
      completionKind: 'OUTPUT_VIEWED',
      completionSignal: 'inspection_report_reviewed',
      outputEntityType: 'DOCUMENT',
      outputEntityId: 'report-1',
      verifiedAt: NOW,
    }],
    availableCapabilityIds: ['quote-comparison'],
    availabilityPolicyVersion: 'rollout-v2',
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['LOW_CONSEQUENCE'],
      evidenceAccess: 'ALLOWED',
    },
    surface: 'COMPLETION',
  });
  const completionQuote = candidateById(
    suppress(completionContext, registry),
    'quote-comparison',
  );
  assert.equal(
    completionQuote.suppression.reasonCodes.includes(
      'WORKFLOW_CONTEXT_REQUIRED',
    ),
    false,
  );
});

function rankingFixture() {
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    limit: 10,
  });
  const suppressionResult = suppress(context);
  const baseCandidate = candidateById(
    suppressionResult,
    'coverage-options',
  );
  return { context, suppressionResult, baseCandidate };
}

function rankingCandidate(baseCandidate, capabilityId, overrides = {}) {
  const capability = canonicalCapabilityRegistry.getById(capabilityId);
  assert.ok(capability, `Expected ${capabilityId} manifest`);
  return {
    ...structuredClone(baseCandidate),
    capabilityId,
    manifestVersion: capability.version,
    outcomeCategory: capability.presentation.outcomeCategory,
    safetyTier: capability.governance.safetyTier,
    baseScore: capability.recommendation.baseScore,
    source: {
      kind: 'JOURNEY',
      id: `journey-${capabilityId}`,
      actionId: null,
      entityType: 'JOURNEY',
      entityId: `journey-${capabilityId}`,
      sourceVersion: 'ACTIVE',
      observedAt: NOW,
    },
    primaryMatch: {
      kind: 'RECOMMENDATION_DEFINITION',
      precedence: 2,
      value: `definition-${capabilityId}`,
    },
    matches: [{
      kind: 'RECOMMENDATION_DEFINITION',
      precedence: 2,
      value: `definition-${capabilityId}`,
    }],
    readiness: {
      state: 'READY',
      safePartialValue: false,
      reasonCodes: [],
      missingFactKeys: [],
      checks: [{
        kind: 'ACCEPTED_CONTEXT',
        result: 'TRUE',
        reasonCode: 'ACCEPTED_CONTEXT_TRUE',
        explanation: 'The source context is ready.',
        minimum: null,
        observedCount: null,
        contextType: 'JOURNEY',
      }],
    },
    policy: {
      decision: 'PROMOTABLE',
      reasonCodes: [],
      ctaAllowed: true,
      evidenceMode: 'STRUCTURED_ONLY',
      policyVersion: 'rollout-v2',
    },
    suppression: {
      suppressed: false,
      reasonCodes: [],
    },
    ...overrides,
  };
}

function rankingSuppressionResult(candidates) {
  return {
    registryVersion: canonicalCapabilityRegistry.version,
    contextVersion: 'context-v7',
    candidates,
    diagnostics: {
      retainedCount: candidates.length,
      suppressedCount: 0,
    },
  };
}

test('CAP-405 returns bounded named score components and selects useful results', () => {
  const { context, suppressionResult } = rankingFixture();
  const result = rankCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
    suppressionResult,
  });
  assert.doesNotThrow(() => CapabilityRankingResultSchema.parse(result));
  const coverage = candidateById(result, 'coverage-options');
  const componentTotal = Object.values(coverage.ranking.components)
    .reduce((sum, score) => sum + score, 0);

  assert.equal(
    Object.values(CAPABILITY_RANKING_COMPONENT_WEIGHTS)
      .reduce((sum, weight) => sum + weight, 0),
    100,
  );
  assert.equal(coverage.ranking.totalScore, componentTotal);
  assert.equal(coverage.ranking.selected, true);
  assert.equal(coverage.ranking.selectedRank, 1);
  assert.equal(coverage.ranking.totalScore >= CAPABILITY_MINIMUM_USEFUL_SCORE, true);
});

test('CAP-405 does not pad a surface with candidates below the useful threshold', () => {
  const { context, baseCandidate } = rankingFixture();
  const weak = rankingCandidate(baseCandidate, 'coverage-options', {
    baseScore: 0,
    source: {
      kind: 'PERSONALIZATION',
      id: 'weak-personalization',
      actionId: null,
      entityType: null,
      entityId: 'weak-personalization',
      sourceVersion: 'v1',
      observedAt: NOW,
    },
    primaryMatch: {
      kind: 'COMPLETION_OUTPUT_RELATIONSHIP',
      precedence: 7,
      value: 'weak-relationship',
    },
    matches: [{
      kind: 'COMPLETION_OUTPUT_RELATIONSHIP',
      precedence: 7,
      value: 'weak-relationship',
    }],
    readiness: {
      state: 'NEEDS_CONTEXT',
      safePartialValue: true,
      reasonCodes: ['ACCEPTED_CONTEXT_UNKNOWN'],
      missingFactKeys: [],
      checks: [{
        kind: 'ACCEPTED_CONTEXT',
        result: 'UNKNOWN',
        reasonCode: 'ACCEPTED_CONTEXT_UNKNOWN',
        explanation: 'More context is needed.',
        minimum: null,
        observedCount: null,
        contextType: 'PROPERTY',
      }],
    },
  });
  const result = rankCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
    suppressionResult: rankingSuppressionResult([weak]),
  });

  assert.equal(result.diagnostics.selectedCount, 0);
  assert.equal(result.diagnostics.belowQualityThresholdCount, 1);
  assert.equal(result.candidates[0].ranking.scoreBand, 'LOW');
  assert.equal(
    result.candidates[0].ranking.selectionDecision,
    'BELOW_QUALITY_THRESHOLD',
  );
});

test('CAP-405 caps Home at three and prefers an alternative outcome', () => {
  const { context, baseCandidate } = rankingFixture();
  const candidates = [
    rankingCandidate(baseCandidate, 'coverage-options', { baseScore: 100 }),
    rankingCandidate(baseCandidate, 'cost-growth', { baseScore: 90 }),
    rankingCandidate(baseCandidate, 'insurance-trend', { baseScore: 80 }),
    rankingCandidate(baseCandidate, 'inspection-hub', { baseScore: 60 }),
  ];
  const result = rankCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
    suppressionResult: rankingSuppressionResult(candidates),
  });
  const selectedIds = result.candidates
    .filter((candidate) => candidate.ranking.selected)
    .sort((left, right) =>
      left.ranking.selectedRank - right.ranking.selectedRank)
    .map((candidate) => candidate.capabilityId);

  assert.equal(result.maximumSelected, 3);
  assert.deepEqual(selectedIds, [
    'coverage-options',
    'cost-growth',
    'inspection-hub',
  ]);
  assert.equal(
    candidateById(result, 'insurance-trend').ranking.selectionDecision,
    'OUTCOME_DIVERSITY_DEFERRED',
  );
});

test('CAP-405 avoids repeated source actions and breaks ties deterministically', () => {
  const { context, baseCandidate } = rankingFixture();
  const repeatedSource = {
    kind: 'HOME_ACTION',
    id: 'action-1',
    actionId: 'action-1',
    entityType: null,
    entityId: 'item-1',
    sourceVersion: 'action-v2',
    observedAt: NOW,
  };
  const candidates = [
    rankingCandidate(baseCandidate, 'coverage-options', {
      source: repeatedSource,
    }),
    rankingCandidate(baseCandidate, 'inspection-hub', {
      source: repeatedSource,
    }),
    rankingCandidate(baseCandidate, 'plant-advisor'),
  ];
  const rank = (values) => rankCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
    suppressionResult: rankingSuppressionResult(values),
  });
  const first = rank(candidates);
  const second = rank([...candidates].reverse());

  assert.deepEqual(first, second);
  assert.equal(
    candidateById(first, 'inspection-hub').ranking.selectionDecision,
    'SOURCE_DIVERSITY_DEFERRED',
  );
  assert.equal(
    candidateById(first, 'coverage-options').ranking.selected,
    true,
  );
  assert.equal(candidateById(first, 'plant-advisor').ranking.selected, true);
});

test('CAP-405 rejects stale suppression contracts before scoring', () => {
  const { context, suppressionResult } = rankingFixture();
  const staleContextResult = structuredClone(suppressionResult);
  staleContextResult.contextVersion = 'context-v0';
  assert.throws(
    () => rankCapabilityCandidates({
      registry: canonicalCapabilityRegistry,
      context,
      suppressionResult: staleContextResult,
    }),
    /context version is stale/,
  );

  const staleRegistryResult = structuredClone(suppressionResult);
  staleRegistryResult.registryVersion = 'registry-v0';
  assert.throws(
    () => rankCapabilityCandidates({
      registry: canonicalCapabilityRegistry,
      context,
      suppressionResult: staleRegistryResult,
    }),
    /registry version/,
  );
});

function buildRankedResult(context, registry = canonicalCapabilityRegistry) {
  return rankCapabilityCandidates({
    registry,
    context,
    suppressionResult: applyCapabilitySuppressionPolicy({
      registry,
      context,
      governanceResult: govern(context, registry),
    }),
  });
}

function explain(context, registry = canonicalCapabilityRegistry) {
  return buildCapabilitySuggestionResponse({
    registry,
    context,
    rankingResult: buildRankedResult(context, registry),
  });
}

test('CAP-406 builds a narrow suggestion from reviewed copy and structured lineage', () => {
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
  });
  const result = explain(context);
  assert.doesNotThrow(() => CapabilitySuggestionResponseSchema.parse(result));
  assert.equal(result.suggestions.length, 1);
  const suggestion = result.suggestions[0];

  assert.equal(suggestion.capabilityId, 'coverage-options');
  assert.equal(suggestion.rank, 1);
  assert.equal(suggestion.reasonCode, 'COVERAGE_GAPS_PRESENT');
  assert.equal(
    suggestion.whyNow,
    'Confirmed coverage gaps make a coverage comparison useful now.',
  );
  assert.equal(suggestion.readiness.state, 'READY');
  assert.equal(suggestion.source.actionId, 'action-1');
  assert.equal(suggestion.contextVersion, 'context-v7');
  assert.equal(suggestion.manifestVersion, 1);
  assert.equal(
    suggestion.launch.href,
    '/dashboard/properties/property-1/tools/coverage-options',
  );
  assert.match(suggestion.recommendationVersion, /^capability-recommendation-v/);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /totalScore|components|suppression|policy/);
});

test('CAP-406 explains bounded missing context for safe partial-value suggestions', () => {
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [action({
      source: {
        kind: 'MAINTENANCE',
        entityId: 'plant-context-1',
        version: 'action-v1',
      },
      job: 'STAY_AHEAD',
      priority: 'NOW',
    })],
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['PLANT_SUITABLE_ROOM_CONTEXT'],
    }],
    availableCapabilityIds: ['plant-advisor'],
    availabilityPolicyVersion: 'rollout-v2',
    readinessMetrics: {
      jurisdictionStatus: 'KNOWN',
    },
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['LOW_CONSEQUENCE'],
      evidenceAccess: 'ALLOWED',
    },
    surface: 'HOME',
  });
  const suggestion = explain(context).suggestions[0];

  assert.equal(suggestion.capabilityId, 'plant-advisor');
  assert.equal(suggestion.readiness.state, 'NEEDS_CONTEXT');
  assert.equal(
    suggestion.readiness.reasonCodes.includes('SOURCE_CONTEXT_UNKNOWN'),
    true,
  );
  assert.equal(
    suggestion.readiness.explanations.includes(
      'Choose a room and provide its light context.',
    ),
    true,
  );
});

test('CAP-406 omits evidence details when evidence access is restricted', () => {
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: ['REGULATED_COVERAGE'],
      enforceApprovals: false,
      evidenceAccess: 'REDACTED',
      contextFreshness: 'CURRENT',
    },
  });
  const suggestion = explain(context).suggestions[0];

  assert.deepEqual(suggestion.evidence, {
    mode: 'OMIT',
    summary: null,
    sourceObservedAt: null,
    actionConfidence: null,
    contextWarningCodes: [],
  });
});

test('CAP-406 fails closed for unresolved route context', () => {
  const coverage = structuredClone(
    canonicalCapabilityRegistry.getById('coverage-options'),
  );
  coverage.destination.routeTemplate =
    '/dashboard/properties/[id]/rooms/[roomId]/coverage';
  coverage.recommendation.explicitRelatedCapabilityIds = [];
  const registry = createToolCapabilityRegistry([coverage]);
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
  });

  assert.throws(
    () => explain(context, registry),
    /unresolved route parameters/,
  );
});

test('CAP-406 rejects stale ranking contracts before building explanations', () => {
  const context = governedCoverageContext({
    actionSourceMetadata: [{
      actionId: 'action-1',
      signalIntentFamilies: ['COVERAGE_GAPS_PRESENT'],
    }],
  });
  const rankingResult = buildRankedResult(context);
  rankingResult.contextVersion = 'context-v0';

  assert.throws(
    () => buildCapabilitySuggestionResponse({
      registry: canonicalCapabilityRegistry,
      context,
      rankingResult,
    }),
    /context version is stale/,
  );
});

function capabilityApiDependencies(overrides = {}) {
  return {
    registry: canonicalCapabilityRegistry,
    loadRequiredSources: async () => ({
      propertyContext: propertyContext(),
      actions: [action({
        source: {
          kind: 'COVERAGE',
          entityId: 'item-1',
          version: 'action-v2',
        },
        job: 'DECIDE',
        primaryCta: {
          kind: 'REVIEW',
          label: 'Review coverage context',
          href: '/dashboard/properties/property-1',
        },
      })],
    }),
    loadJourneys: async () => [],
    loadProjects: async () => [],
    loadPersonalizationRecommendations: async () => [],
    loadCompletions: async () => [],
    loadLifecycle: async () => [],
    loadReadinessMetrics: async () => ({
      trackedSystemCount: 2,
      coverageGapCount: 1,
      jurisdictionStatus: 'KNOWN',
    }),
    availableCapabilityIds: () => ['coverage-options'],
    now: () => new Date(NOW),
    ...overrides,
  };
}

test('CAP-407 orchestrates CAP-400 through CAP-406 into the API response', async () => {
  const result = await getCapabilitySuggestions({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'HOME',
    limit: 3,
  }, capabilityApiDependencies());

  assert.doesNotThrow(() => CapabilitySuggestionResponseSchema.parse(result));
  assert.equal(result.surface, 'HOME');
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].capabilityId, 'coverage-options');
  assert.equal(result.suggestions[0].source.id, 'action-1');
});

test('CAP-703 records selected recommendation eligibility with canonical lineage', async () => {
  const recorded = [];
  await getCapabilitySuggestions({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'HOME',
    limit: 3,
  }, capabilityApiDependencies({
    recordEligibility: async (input) => {
      recorded.push(input);
    },
  }));

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].propertyId, 'property-1');
  assert.equal(recorded[0].userId, 'user-1');
  assert.deepEqual(recorded[0].events.map((event) => ({
    toolId: event.toolId,
    stage: event.stage,
    surface: event.surface,
    sourceKind: event.sourceKind,
    sourceId: event.sourceId,
    reasonCode: event.reasonCode,
    readiness: event.readiness,
  })), [{
    toolId: 'coverage-options',
    stage: 'ELIGIBLE',
    surface: 'unified_home',
    sourceKind: 'HOME_ACTION',
    sourceId: 'action-1',
    reasonCode: 'COVERAGE_GAPS_PRESENT',
    readiness: 'READY',
  }]);
});

test('CAP-500 evaluates Unified Home suggestions from its authorized source snapshot', async () => {
  let requiredSourceReloads = 0;
  const sharedPropertyContext = propertyContext({
    contextVersion: 'unified-home-context-v9',
  });
  const sharedAction = action({
    id: 'unified-home-action-1',
    relatedJourneyId: 'journey-unified-home-1',
    source: {
      kind: 'COVERAGE',
      entityId: 'unified-home-item-1',
      version: 'action-v9',
    },
    job: 'DECIDE',
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review source context',
      href: '/dashboard/properties/property-1',
    },
  });
  const result = await getCapabilitySuggestionsFromAuthorizedSources({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'HOME',
    propertyContext: sharedPropertyContext,
    actions: [sharedAction],
  }, capabilityApiDependencies({
    loadRequiredSources: async () => {
      requiredSourceReloads += 1;
      throw new Error('Unified Home must not reload required sources');
    },
  }));

  assert.equal(requiredSourceReloads, 0);
  assert.equal(result.contextVersion, sharedPropertyContext.contextVersion);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].source.id, sharedAction.id);
  assert.equal(result.suggestions[0].source.actionId, sharedAction.id);
  assert.equal(
    result.suggestions[0].source.journeyId,
    sharedAction.relatedJourneyId,
  );
  assert.equal(result.suggestions[0].source.sourceVersion, 'action-v9');
});

test('CAP-407 scopes source-bound requests and fails optional sources closed', async () => {
  const first = action({
    id: 'action-1',
    source: { kind: 'COVERAGE', entityId: 'item-1', version: 'action-v1' },
    job: 'DECIDE',
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review first item',
      href: '/dashboard/properties/property-1',
    },
  });
  const second = action({
    id: 'action-2',
    lineageId: 'lineage-2',
    source: { kind: 'COVERAGE', entityId: 'item-2', version: 'action-v1' },
    job: 'DECIDE',
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review second item',
      href: '/dashboard/properties/property-1',
    },
  });
  const result = await getCapabilitySuggestions({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'RELATED',
    sourceContext: {
      kind: 'HOME_ACTION',
      id: 'action-2',
      actionId: 'action-2',
      entityType: 'INVENTORY_ITEM',
      entityId: 'item-2',
    },
  }, capabilityApiDependencies({
    loadRequiredSources: async () => ({
      propertyContext: propertyContext(),
      actions: [first, second],
    }),
    loadJourneys: async () => {
      throw new Error('journey dependency unavailable');
    },
  }));

  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].source.id, 'action-2');
  assert.equal(result.suggestions[0].source.entityId, 'item-2');

  const unrelated = await getCapabilitySuggestions({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'RELATED',
    sourceContext: {
      kind: 'PROJECT',
      id: 'project-not-found',
      actionId: null,
      entityType: 'PROJECT',
      entityId: 'project-not-found',
    },
  }, capabilityApiDependencies({
    loadRequiredSources: async () => ({
      propertyContext: propertyContext(),
      actions: [first, second],
    }),
  }));
  assert.deepEqual(unrelated.suggestions, []);
});

test('CAP-407 derives duplicate CTA and trigger metadata from canonical routes', () => {
  const sourceAction = action({
    primaryCta: {
      kind: 'REVIEW',
      label: 'Compare coverage',
      href: '/dashboard/properties/property-1/tools/coverage-options?from=home',
    },
  });
  const metadata = buildCapabilityActionSourceMetadata({
    actions: [sourceAction],
    registry: canonicalCapabilityRegistry,
    propertyId: 'property-1',
  })[0];

  assert.deepEqual(metadata.ctaCapabilityIds, ['coverage-options']);
  assert.equal(
    metadata.signalIntentFamilies.includes('COVERAGE_GAPS_PRESENT'),
    true,
  );
});

test('CAP-407 fails lifecycle history closed so frequency gates cannot be bypassed', async () => {
  const result = await getCapabilitySuggestions({
    propertyId: 'property-1',
    userId: 'user-1',
    surface: 'HOME',
  }, capabilityApiDependencies({
    loadLifecycle: async () => {
      throw new Error('lifecycle dependency unavailable');
    },
  }));

  assert.deepEqual(result.suggestions, []);
});

test('CAP-407 query contract supports every bounded surface and rejects partial lineage', () => {
  for (const surface of [
    'HOME',
    'PROPERTY',
    'WORKFLOW',
    'RELATED',
    'COMPLETION',
  ]) {
    const parsed = CapabilitySuggestionsQuerySchema.safeParse({
      surface,
      limit: '3',
    });
    assert.equal(parsed.success, true, surface);
  }
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({ surface: 'home' }).success,
    false,
  );
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({ limit: '11' }).success,
    false,
  );
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({
      sourceKind: 'HOME_ACTION',
    }).success,
    false,
  );
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({
      sourceKind: 'PROJECT',
      sourceId: 'project-1',
      sourceEntityType: 'PROJECT',
    }).success,
    false,
  );
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({
      surface: 'COMPLETION',
      sourceKind: 'COMPLETION',
      sourceId: 'output-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'output-1',
      sourceEventType: 'ARTIFACT_CREATED',
    }).success,
    true,
  );
  assert.equal(
    CapabilitySuggestionsQuerySchema.safeParse({
      surface: 'WORKFLOW',
      sourceKind: 'PROJECT',
      sourceId: 'project-1',
      sourceEventType: 'ACTION_COMPLETED',
    }).success,
    false,
  );
});

test('CAP-407 route requires authentication and property authorization', () => {
  const route = capabilitySuggestionsRouter.stack
    .filter((layer) => layer.route)
    .find((layer) =>
      layer.route.path === '/properties/:propertyId/capability-suggestions'
      && layer.route.methods?.get)
    ?.route;
  assert.ok(route, 'Expected capability suggestions GET route');
  assert.equal(route.stack[0].handle, authenticate);
  assert.equal(route.stack[1].handle, propertyAuthMiddleware);
});

test('CAP-604 records a verified completion before resolving one next step', async () => {
  const order = [];
  const response = await recordCapabilityCompletionAndResolveNext({
    propertyId: 'property-1',
    userId: 'user-1',
    capabilityId: 'material-specs',
    completionKind: 'OUTPUT_VIEWED',
    outputEntityType: 'DOCUMENT',
    outputEntityId: 'document-1',
    sourceActionId: 'action-1',
    journeyId: null,
    surface: 'workflow',
  }, {
    registry: canonicalCapabilityRegistry,
    now: () => new Date(NOW),
    record: async (args) => {
      order.push('record');
      assert.equal(args.events.length, 1);
      assert.deepEqual(args.events[0], {
        toolId: 'material-specs',
        stage: 'COMPLETED',
        surface: 'workflow',
        manifestVersion: 1,
        registryVersion: canonicalCapabilityRegistry.version,
        sourceKind: 'COMPLETION',
        sourceId: 'document-1',
        sourceActionId: 'action-1',
        sourceEntityType: 'DOCUMENT',
        sourceEntityId: 'document-1',
        journeyId: null,
        completionKind: 'OUTPUT_VIEWED',
        outputKey: 'document-1',
        durationSeconds: null,
        metadata: {
          outputEntityType: 'DOCUMENT',
          outputEntityId: 'document-1',
          recordedAt: NOW,
        },
      });
    },
    resolve: async (input) => {
      order.push('resolve');
      assert.equal(input.surface, 'COMPLETION');
      assert.equal(input.limit, 1);
      assert.deepEqual(input.sourceContext, {
        kind: 'COMPLETION',
        id: 'document-1',
        actionId: 'action-1',
        entityType: 'DOCUMENT',
        entityId: 'document-1',
        eventType: 'OUTPUT_VIEWED',
      });
      return {
        contractVersion: 'capability-suggestions-v1',
        registryVersion: canonicalCapabilityRegistry.version,
        recommendationVersion: 'capability-recommendation-v1',
        contextVersion: 'context-v7',
        generatedAt: NOW,
        surface: 'COMPLETION',
        suggestions: [],
      };
    },
  });

  assert.deepEqual(order, ['record', 'resolve']);
  assert.equal(response.contractVersion, 'capability-completion-next-v1');
  assert.equal(response.suggestion, null);
  assert.equal(
    response.exploreToolsHref,
    '/dashboard/home-tools?propertyId=property-1',
  );
});

test('CAP-604 rejects unverified completion kinds and output identities', async () => {
  assert.equal(CapabilityCompletionNextBodySchema.safeParse({
    capabilityId: 'material-specs',
    completionKind: 'OUTPUT_VIEWED',
    outputEntityType: 'DOCUMENT',
    outputEntityId: 'document-1',
  }).success, true);
  assert.equal(CapabilityCompletionNextBodySchema.safeParse({
    capabilityId: 'material-specs',
    completionKind: 'PLAN_CREATED',
    outputEntityType: 'DOCUMENT',
    outputEntityId: 'document-1',
  }).success, false);
  assert.equal(CapabilityCompletionNextBodySchema.safeParse({
    capabilityId: 'material-specs',
    completionKind: 'OUTPUT_VIEWED',
    outputEntityType: 'PROJECT',
    outputEntityId: 'project-1',
  }).success, false);

  const route = capabilitySuggestionsRouter.stack
    .filter((layer) => layer.route)
    .find((layer) =>
      layer.route.path === '/properties/:propertyId/capability-completions/next'
      && layer.route.methods?.post)
    ?.route;
  assert.ok(route, 'Expected capability completion POST route');
  assert.equal(route.stack[0].handle, authenticate);
  assert.equal(route.stack[1].handle, propertyAuthMiddleware);
});
