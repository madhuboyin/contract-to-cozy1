require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { prisma } = require('../../src/lib/prisma.ts');
const { operationSpecificContinuationProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { hasRecordedOutcomeForThread } = require('../../src/services/decisionPlatform/outcomeObservationService.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const thread = (id) => ({ id, contextVersion: `v-${id}` });
const baseState = { hasPendingMaintenance: true, hasOpenInspectionFindings: true, hasUnresolvedRecallMatches: true };

function nominate({ source, result = {}, threads = [], loadState }) {
  const calls = [];
  const promise = operationSpecificContinuationProducer.nominate({
    result: { status: 'ANSWERED', blocks: [], suggestions: [], ...result }, sourceOperationId: source, propertyId: PROPERTY,
    loadOperationSpecificContinuationState: async (propertyId, needs) => { calls.push([propertyId, needs]); return loadState ? loadState(propertyId, needs) : baseState; },
    loadActivePlanState: async () => ({ sellHoldRentActive: false, hvacThreads: threads, guidanceJourneys: [] }),
  });
  return promise.then((candidates) => ({ candidates, calls }));
}
const targets = (candidates) => candidates.map((candidate) => candidate.operationId);

test('starting a decision that is already active does not offer "continue" (the result already continued it); a fresh start still does', async () => {
  const active = await nominate({ source: 'HVAC_DECISION_START', result: { reasonCode: 'HVAC_DECISION_ALREADY_ACTIVE' }, threads: [thread('t1')] });
  assert.deepEqual(targets(active.candidates), ['HOME_ACTIONS']);
  const fresh = await nominate({ source: 'HVAC_DECISION_START', result: { reasonCode: 'HVAC_DECISION_STARTED' }, threads: [thread('t1')] });
  assert.deepEqual(targets(fresh.candidates), ['HVAC_DECISION_CONTINUE', 'HOME_ACTIONS']);
});

test('"review the recorded outcome" is offered only when the decision has one; an unknown or failed check keeps it', async () => {
  const none = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: [thread('t1')], loadState: async () => ({ ...baseState, hasRecordedHvacOutcome: false }) });
  assert.ok(!targets(none.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'));
  assert.deepEqual(none.calls, [[PROPERTY, { records: false, forecast: false, hvacOutcomeThreadId: 't1' }]], 'asked about the one active thread only');

  const some = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: [thread('t1')], loadState: async () => ({ ...baseState, hasRecordedHvacOutcome: true }) });
  assert.ok(targets(some.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'));

  const failed = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: [thread('t1')], loadState: async () => { throw new Error('db down'); } });
  assert.ok(targets(failed.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'), 'readiness is an optimisation; a failed read keeps the recipe');

  const noThread = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: [] });
  assert.deepEqual(noThread.calls, [], 'no thread, nothing to check');
  assert.ok(!targets(noThread.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'));
});

test('on a multi-thread home, only the thread the current result itself resolved is used; otherwise thread-bound recipes are dropped', async () => {
  const two = [thread('t1'), thread('t2')];
  const unresolved = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: two });
  assert.ok(!targets(unresolved.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'), 'no guess by recency');

  const resolved = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: two, result: { parameters: { focusedDecisionThreadId: 't2' } }, loadState: async () => ({ ...baseState, hasRecordedHvacOutcome: true }) });
  const outcome = resolved.candidates.find((candidate) => candidate.operationId === 'HVAC_DECISION_OUTCOME_VIEW');
  assert.deepEqual([outcome.entityContext.entityType, outcome.entityContext.entityId], ['DECISION_THREAD', 't2']);
  assert.equal(resolved.calls[0][1].hvacOutcomeThreadId, 't2');

  const foreign = await nominate({ source: 'HVAC_DECISION_CONTINUE', threads: two, result: { parameters: { focusedDecisionThreadId: 'not-active' } } });
  assert.ok(!targets(foreign.candidates).includes('HVAC_DECISION_OUTCOME_VIEW'), 'a thread that is not an active one of this home is never used');
});

test('hasRecordedOutcomeForThread: false for an unknown thread or no snapshots, true only when an attribution exists, and it does not corroborate anything', async () => {
  const originals = { thread: prisma.decisionThread.findFirst, snapshots: prisma.recommendationSnapshot.findMany, count: prisma.recommendationAttribution.count };
  let attributions = 0; let known = true; let snapshots = [{ id: 's1' }];
  prisma.decisionThread.findFirst = async () => (known ? { id: 't1' } : null);
  prisma.recommendationSnapshot.findMany = async () => snapshots;
  prisma.recommendationAttribution.count = async () => attributions;
  try {
    assert.equal(await hasRecordedOutcomeForThread('t1', PROPERTY), false, 'snapshot but no attribution');
    attributions = 2;
    assert.equal(await hasRecordedOutcomeForThread('t1', PROPERTY), true);
    snapshots = [];
    assert.equal(await hasRecordedOutcomeForThread('t1', PROPERTY), false, 'no snapshots');
    snapshots = [{ id: 's1' }]; known = false;
    assert.equal(await hasRecordedOutcomeForThread('t1', PROPERTY), false, 'thread not in this property');
  } finally {
    prisma.decisionThread.findFirst = originals.thread; prisma.recommendationSnapshot.findMany = originals.snapshots; prisma.recommendationAttribution.count = originals.count;
  }
});
