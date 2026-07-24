const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilityCandidateMatchResultSchema,
  CapabilityReadinessResultSchema,
  CapabilityRecommendationContextSchema,
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
