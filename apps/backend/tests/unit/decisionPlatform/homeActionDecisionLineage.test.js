const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  resolveDecisionFamilyRef,
  unavailableDecisionLineage,
  assertHomeActionDecisionLineageSatisfiedForCommitment,
  DecisionLineageRequiredForAcceptanceError,
} = require('../../../src/services/decisionPlatform/homeActionDecisionLineage.ts');

test('a repair-replace lineageId resolves to the HVAC_REPAIR_REPLACE decision family (Home Intelligence FRD HI-DEC-002)', () => {
  const ref = resolveDecisionFamilyRef({ lineageId: 'repair-replace:item-123' });
  assert.deepEqual(ref, { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'item-123' });
});

// C2C Intelligence & Agentic Evolution Phase 4A (architecture §12.7): the
// non-HVAC repair/replace prefix routes to its own family; the HVAC prefix
// is unchanged and neither prefix is a substring of the other.
test('an appliance-repair-replace lineageId resolves to the APPLIANCE_REPAIR_REPLACE decision family', () => {
  const ref = resolveDecisionFamilyRef({ lineageId: 'appliance-repair-replace:item-9' });
  assert.deepEqual(ref, { decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE', primaryEntityId: 'item-9' });
});

test('the HVAC repair-replace prefix does not swallow the appliance prefix', () => {
  assert.deepEqual(
    resolveDecisionFamilyRef({ lineageId: 'repair-replace:item-9' }),
    { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'item-9' },
  );
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'appliance-repair-replace:' }), null);
});

test('a lineageId with no matching decision-family prefix resolves to null, not a fail-closed state', () => {
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'operational-work:work-1' }), null);
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'maintenance:task-1' }), null);
});

test('a malformed repair-replace lineageId with no entity id does not resolve', () => {
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'repair-replace:' }), null);
});

// Phase 3 review finding 1: unavailableDecisionLineage must always be
// truthy — a DECISION_REQUIRED action that resolves to no ref at all
// (no registered decision family) must still produce an object the
// frontend's decisionLineage-truthiness gate treats as "needs blocking",
// never null.
test('unavailableDecisionLineage is truthy and UNAVAILABLE with a real ref', () => {
  const lineage = unavailableDecisionLineage(
    { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'item-1' },
    'test reason',
  );
  assert.deepEqual(lineage, {
    status: 'UNAVAILABLE',
    decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
    primaryEntityId: 'item-1',
    reason: 'test reason',
  });
});

test('unavailableDecisionLineage is truthy and UNAVAILABLE with a null ref (no registered decision family at all)', () => {
  const lineage = unavailableDecisionLineage(null, 'no family registered');
  assert.ok(lineage, 'expected a truthy object even with no ref');
  assert.deepEqual(lineage, {
    status: 'UNAVAILABLE',
    decisionDefinitionId: null,
    primaryEntityId: null,
    reason: 'no family registered',
  });
});

// Phase 3 review finding 2: the domain-agnostic commitment guard for the
// Home Action command surface (executeHomeActionCommand), covering every
// decision family via action.decisionLineage instead of a per-domain
// OperationalWorkSource traversal.
test('assertHomeActionDecisionLineageSatisfiedForCommitment is a no-op when decisionLineage is null (NOT_REQUIRED action)', () => {
  assert.doesNotThrow(() => assertHomeActionDecisionLineageSatisfiedForCommitment({ decisionLineage: null }));
});

test('assertHomeActionDecisionLineageSatisfiedForCommitment passes for LINKED lineage', () => {
  assert.doesNotThrow(() => assertHomeActionDecisionLineageSatisfiedForCommitment({
    decisionLineage: {
      status: 'LINKED',
      decisionDefinitionId: 'OWNERSHIP_COST_CHANGE',
      primaryEntityId: 'property-1:UTILITIES',
      thread: { decisionThreadId: 't1', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'CURRENT', currentRecommendationSnapshotId: 's1', recommendationChange: null },
    },
  }));
});

test('assertHomeActionDecisionLineageSatisfiedForCommitment rejects LINKED lineage without a current recommendation snapshot', () => {
  assert.throws(
    () => assertHomeActionDecisionLineageSatisfiedForCommitment({
      decisionLineage: {
        status: 'LINKED',
        decisionDefinitionId: 'OWNERSHIP_COST_CHANGE',
        primaryEntityId: 'property-1:UTILITIES',
        thread: { decisionThreadId: 't1', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'CURRENT', currentRecommendationSnapshotId: null, recommendationChange: null },
      },
    }),
    (error) => {
      assert.ok(error instanceof DecisionLineageRequiredForAcceptanceError);
      assert.match(error.message, /decision lineage status: MISSING_CURRENT_SNAPSHOT/);
      return true;
    },
  );
});

for (const status of ['NOT_STARTED', 'AMBIGUOUS', 'NOT_APPLICABLE', 'UNAVAILABLE']) {
  test(`assertHomeActionDecisionLineageSatisfiedForCommitment throws DecisionLineageRequiredForAcceptanceError for ${status}`, () => {
    assert.throws(
      () => assertHomeActionDecisionLineageSatisfiedForCommitment({
        decisionLineage: { status, decisionDefinitionId: 'OWNERSHIP_COST_CHANGE', primaryEntityId: 'property-1:UTILITIES', reason: 'x' },
      }),
      DecisionLineageRequiredForAcceptanceError,
    );
  });
}
