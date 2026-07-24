const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilityRecommendationContextSchema,
  buildCapabilityRecommendationContext,
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
