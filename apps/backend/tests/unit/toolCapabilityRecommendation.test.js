const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilityCandidateMatchResultSchema,
  CapabilityGovernanceResultSchema,
  CapabilityReadinessResultSchema,
  CapabilityRecommendationContextSchema,
  CapabilitySuppressionResultSchema,
  applyCapabilityGovernancePolicy,
  applyCapabilitySuppressionPolicy,
  buildCapabilityRecommendationContext,
  canonicalCapabilityRegistry,
  createToolCapabilityRegistry,
  evaluateCapabilityCandidateReadiness,
  matchCapabilityCandidates,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  goldenTestHomes,
} = require('../fixtures/productFramework/goldenTestHomes.js');

const NOW = '2026-07-24T12:00:00.000Z';

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
  const contextFor = (lastEvaluatedAt) => governedCoverageContext({
    actions: [action({
      lastEvaluatedAt,
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
    lifecycle: [{
      capabilityId: 'coverage-options',
      impressionCount30Days: 0,
      lastImpressionAt: null,
      lastDismissedAt: null,
      lastCompletedAt: '2026-07-22T12:00:00.000Z',
    }],
  });

  const oldSignal = candidateById(
    suppress(contextFor('2026-07-21T12:00:00.000Z')),
    'coverage-options',
  );
  const renewedSignal = candidateById(
    suppress(contextFor('2026-07-23T12:00:00.000Z')),
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
});
