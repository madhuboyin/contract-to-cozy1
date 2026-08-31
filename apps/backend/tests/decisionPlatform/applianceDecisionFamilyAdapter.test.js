const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// C2C Intelligence & Agentic Evolution — Phase 4A (§9.1 of the
// implementation plan; architecture §12.7). Includes environment-independent
// behavioral coverage of thread creation/resume, immutable provenance, and
// snapshot supersession through the adapter's injected persistence seam.

const {
  applianceDecisionFamilyAdapter,
  createApplianceDecisionFamilyAdapter,
  loadApplianceRepairReplaceSourceState,
  mapApplianceVerdictToDecisionVerdict,
  APPLIANCE_VERDICT_TO_DECISION_VERDICT,
  APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES,
} = require('../../src/services/decisionPlatform/applianceDecisionFamilyAdapter.ts');
const {
  getDecisionFamilyAdapter,
  validateDecisionFamilyAdapterRegistry,
} = require('../../src/services/decisionPlatform/decisionFamilyAdapterRegistry.ts');
const { DECISION_DEFINITIONS } = require('../../src/services/decisionPlatform/decisionDefinitionRegistry.ts');
const { DECISION_CONTEXT_CONTRACTS } = require('../../src/services/decisionPlatform/decisionContextContracts.ts');
const { ENVELOPE_MAPPINGS } = require('../../src/services/intelligenceEnvelope/envelopeMappingRegistry.ts');
const { evaluateQualifiedClaimVerdicts } = require('../../src/services/intelligenceEnvelope/qualifiedClaimCompatibilityRegistry.ts');
const { isGenericApplianceRepairReplaceEligible } = require('../../src/services/repairReplaceEligibility.ts');

test('all four ReplaceRepairVerdict values map explicitly to a Decision Platform verdict code', () => {
  assert.deepEqual(APPLIANCE_VERDICT_TO_DECISION_VERDICT, {
    REPLACE_NOW: 'REPLACE',
    REPLACE_SOON: 'REPLACE',
    REPAIR_AND_MONITOR: 'REPAIR',
    REPAIR_ONLY: 'REPAIR',
  });
  assert.equal(mapApplianceVerdictToDecisionVerdict('REPLACE_NOW'), 'REPLACE');
  assert.equal(mapApplianceVerdictToDecisionVerdict('REPAIR_ONLY'), 'REPAIR');
});

test('the approved eligibility boundary is APPLIANCE only', () => {
  assert.deepEqual(APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES, ['APPLIANCE']);
  for (const unsupported of ['HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'STRUCTURAL']) {
    assert.ok(!APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES.includes(unsupported));
  }
});

test('generic-appliance eligibility rejects a legacy APPLIANCE-labelled water heater', () => {
  assert.equal(isGenericApplianceRepairReplaceEligible({ category: 'APPLIANCE', name: 'Dishwasher' }), true);
  assert.equal(isGenericApplianceRepairReplaceEligible({ category: 'APPLIANCE', name: 'Tankless Water Heater' }), false);
  assert.equal(isGenericApplianceRepairReplaceEligible({ category: 'PLUMBING', name: 'Water Heater' }), false);
});

test('source projection requires a READY APPLIANCE analysis and preserves provenance', async () => {
  let capturedWhere;
  const projected = await loadApplianceRepairReplaceSourceState('property-1', 'item-1', {
    replaceRepairAnalysis: {
      findFirst: async (query) => {
        capturedWhere = query.where;
        return {
          id: 'analysis-1', verdict: 'REPLACE_SOON', confidence: 'MEDIUM', impactLevel: 'HIGH', summary: 'Replace soon',
          ageYears: 12, remainingYears: 1, estimatedNextRepairCostCents: 50000,
          estimatedReplacementCostCents: 120000, breakEvenMonths: 8,
          updatedAt: new Date('2026-08-29T12:00:00.000Z'), inventoryItem: { name: 'Dishwasher', category: 'APPLIANCE' },
        };
      },
    },
  });
  assert.deepEqual(capturedWhere.inventoryItem.category.in, ['APPLIANCE']);
  assert.equal(capturedWhere.currentMarker, 'CURRENT');
  assert.equal(projected.verdictCode, 'REPLACE');
  assert.deepEqual(projected.canonicalFactReferences, [
    { entityType: 'REPLACE_REPAIR_ANALYSIS', entityId: 'analysis-1' },
    { entityType: 'INVENTORY_ITEM', entityId: 'item-1', fieldPath: 'condition' },
  ]);
});

function behavioralHarness() {
  const threads = [];
  const snapshots = [];
  const factRefs = [];
  const origins = [];
  const emissions = [];
  let sequence = 0;
  let source = {
    title: 'Repair or replace Dishwasher', goalCode: 'APPLIANCE_REPAIR_REPLACE_DECISION',
    verdictCode: 'REPAIR', reasonCodes: ['SOURCE_VERDICT_REPAIR_ONLY'],
    confidenceBreakdown: { label: 'HIGH' }, inputDigest: 'digest-1',
    canonicalFactReferences: [{ entityType: 'REPLACE_REPAIR_ANALYSIS', entityId: 'analysis-1' }],
  };
  const db = {
    decisionThread: {
      findMany: async ({ where }) => threads.filter((row) => row.propertyId === where.propertyId
        && row.decisionDefinitionId === where.decisionDefinitionId && row.primaryEntityId === where.primaryEntityId
        && where.lifecycleStatus.in.includes(row.lifecycleStatus)).map((row) => ({
          ...row,
          currentRecommendationSnapshot: snapshots.find((snapshot) => snapshot.id === row.currentRecommendationSnapshotId) ?? null,
        })),
    },
    $transaction: async (work) => work({
      decisionThread: {
        create: async ({ data }) => { const row = { id: `thread-${++sequence}`, version: 0, createdAt: new Date(), currentRecommendationSnapshotId: null, contextIssueCodes: [], staleAt: null, ...data }; threads.push(row); return { ...row }; },
        findUniqueOrThrow: async ({ where }) => ({ ...threads.find((row) => row.id === where.id) }),
        update: async ({ where, data }) => { const row = threads.find((candidate) => candidate.id === where.id); Object.assign(row, data, data.version ? { version: row.version + data.version.increment } : {}); return { ...row }; },
        updateMany: async ({ where, data }) => { const row = threads.find((candidate) => candidate.id === where.id && candidate.version === where.version); if (!row) return { count: 0 }; Object.assign(row, data, data.version ? { version: row.version + data.version.increment } : {}); return { count: 1 }; },
      },
      recommendationSnapshot: {
        findUnique: async ({ where }) => snapshots.find((row) => row.id === where.id) ?? null,
        create: async ({ data }) => { const row = { id: `snapshot-${++sequence}`, generatedAt: new Date(), ...data }; snapshots.push(row); return row; },
      },
      decisionThreadFactReference: { createMany: async ({ data }) => { factRefs.push(...data); return { count: data.length }; } },
    }),
  };
  const adapter = createApplianceDecisionFamilyAdapter({
    db,
    loadSourceState: async () => source,
    loadRecommendationChange: async () => null,
    emitRecommendationChange: async (event) => { emissions.push(event); },
    recordOriginLink: async (threadId, origin) => { if (origin) origins.push({ threadId, ...origin }); },
  });
  return { adapter, threads, snapshots, factRefs, origins, emissions, setSource: (next) => { source = next; } };
}

test('adapter creates once, resumes idempotently, preserves origin provenance, and supersedes on source change', async () => {
  const harness = behavioralHarness();
  const origin = {
    homeActionId: 'action-1', lineageId: 'appliance-repair-replace:item-1', sourceEntityId: 'analysis-1',
    sourceVersion: 'v1', contextVersion: null,
  };
  const first = await harness.adapter.createOrResumeThread({
    propertyId: 'property-1', userId: 'user-1', primaryEntityId: 'item-1', homeActionOrigin: origin,
  });
  assert.equal(harness.threads.length, 1);
  assert.equal(harness.snapshots.length, 1);
  assert.equal(first.currentRecommendationSnapshotId, harness.snapshots[0].id);
  assert.equal(harness.snapshots[0].supersedesSnapshotId, null);
  assert.equal(harness.snapshots[0].signalReferences[0].homeActionId, 'action-1');
  assert.equal(harness.factRefs[0].canonicalEntityId, 'analysis-1');

  const unchanged = await harness.adapter.createOrResumeThread({
    propertyId: 'property-1', userId: 'user-1', primaryEntityId: 'item-1', homeActionOrigin: { ...origin, sourceVersion: 'v2' },
  });
  assert.equal(unchanged.decisionThreadId, first.decisionThreadId);
  assert.equal(harness.threads.length, 1);
  assert.equal(harness.snapshots.length, 1, 'unchanged digest must not create a snapshot');

  harness.setSource({
    title: 'Repair or replace Dishwasher', goalCode: 'APPLIANCE_REPAIR_REPLACE_DECISION',
    verdictCode: 'REPLACE', reasonCodes: ['SOURCE_VERDICT_REPLACE_NOW'],
    confidenceBreakdown: { label: 'HIGH' }, inputDigest: 'digest-2',
    canonicalFactReferences: [{ entityType: 'REPLACE_REPAIR_ANALYSIS', entityId: 'analysis-2' }],
  });
  const changed = await harness.adapter.createOrResumeThread({
    propertyId: 'property-1', userId: 'user-1', primaryEntityId: 'item-1', homeActionOrigin: { ...origin, sourceEntityId: 'analysis-2', sourceVersion: 'v3' },
  });
  assert.equal(changed.decisionThreadId, first.decisionThreadId);
  assert.equal(harness.snapshots.length, 2);
  assert.equal(harness.snapshots[1].supersedesSnapshotId, harness.snapshots[0].id);
  assert.equal(harness.snapshots[1].verdictCode, 'REPLACE');
  assert.equal(harness.origins.length, 3, 'creation and every resume retain durable origin attribution');
  assert.equal(harness.emissions.length, 2, 'first snapshot and superseding snapshot emit changes');
});

test('read-only thread selection projects a superseded source digest as STALE before resume', async () => {
  const harness = behavioralHarness();
  await harness.adapter.createOrResumeThread({ propertyId: 'property-1', userId: 'user-1', primaryEntityId: 'item-1' });
  harness.setSource({
    title: 'Repair or replace Dishwasher', goalCode: 'APPLIANCE_REPAIR_REPLACE_DECISION', verdictCode: 'REPLACE',
    reasonCodes: ['SOURCE_VERDICT_REPLACE_SOON'], confidenceBreakdown: { label: 'MEDIUM' }, inputDigest: 'digest-new',
  });
  const selection = await harness.adapter.selectThread('property-1', 'item-1');
  assert.equal(selection.kind, 'UNIQUE');
  assert.equal(selection.thread.contextStatus, 'STALE');
  assert.equal(selection.thread.currentRecommendationSnapshotId, harness.snapshots[0].id);
  assert.equal(harness.snapshots.length, 1, 'freshness detection must remain read-only');
});

test('APPLIANCE_REPAIR_REPLACE is a fully registered Decision Platform family', () => {
  assert.deepEqual(validateDecisionFamilyAdapterRegistry(), []);
  assert.ok(DECISION_DEFINITIONS.APPLIANCE_REPAIR_REPLACE);
  assert.ok(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE);
  const adapter = getDecisionFamilyAdapter('APPLIANCE_REPAIR_REPLACE');
  assert.equal(adapter, applianceDecisionFamilyAdapter);
  assert.equal(adapter.decisionDefinitionId, 'APPLIANCE_REPAIR_REPLACE');
  assert.equal(adapter.primaryEntityType, 'InventoryItem');
  assert.equal(typeof adapter.isEligiblePrimaryEntity, 'function');
  assert.equal(typeof adapter.selectThread, 'function');
  assert.equal(typeof adapter.createOrResumeThread, 'function');
});

test('the appliance family context contract snapshots rather than composes from Property Context', () => {
  assert.equal(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE.composesFromPropertyContext, false);
  assert.deepEqual(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE.requiredFactDefinitions, []);
});

test('a RecommendationSnapshot for APPLIANCE_REPAIR_REPLACE carries its own qualified-claim proposition type', () => {
  const mapping = ENVELOPE_MAPPINGS.find(
    (m) => m.producerModel === 'RecommendationSnapshot' && m.nativeSubtype === 'APPLIANCE_REPAIR_REPLACE',
  );
  assert.ok(mapping, 'expected an ENVELOPE_MAPPINGS entry for APPLIANCE_REPAIR_REPLACE');
  assert.equal(mapping.propositionType, 'APPLIANCE_REPAIR_REPLACE_VERDICT');
  assert.equal(mapping.domain, 'ASSET_LIFECYCLE');
  assert.notEqual(mapping.propositionType, 'HVAC_REPAIR_REPLACE_VERDICT');
});

test('REPAIR vs REPLACE is a domain-owned conflict for the appliance proposition, other pairs are unknown', () => {
  assert.equal(
    evaluateQualifiedClaimVerdicts({ propositionType: 'APPLIANCE_REPAIR_REPLACE_VERDICT', leftVerdict: 'REPAIR', rightVerdict: 'REPLACE' }),
    'CONFLICTED',
  );
  assert.equal(
    evaluateQualifiedClaimVerdicts({ propositionType: 'APPLIANCE_REPAIR_REPLACE_VERDICT', leftVerdict: 'REPAIR', rightVerdict: 'REPAIR' }),
    'COMPATIBLE',
  );
});
