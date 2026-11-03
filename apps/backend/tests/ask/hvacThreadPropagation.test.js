require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { operationSpecificContinuationProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { recipeTargetsDecisionThread } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { mergeConfirmedParameters } = require('../../src/services/ask/execution/mergeConfirmedParameters.ts');
const { hvacSpecialistEngageResult } = require('../../src/services/ask/askOrchestrator.service.ts');

// Phase 4: a result stamps focusedDecisionThreadId only where it authoritatively resolved exactly one thread; the continuation
// producer then binds thread-bound recipes to THAT thread and never chooses one by recency.

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const A = { id: 'thread-A', contextVersion: 'vA' };
const B = { id: 'thread-B', contextVersion: 'vB' };
const STAMPED_SOURCES = [
  'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE', 'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_OUTCOME_REPORT',
  'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK', 'HVAC_SPECIALIST_ENGAGE',
];

function nominate(source, { parameters, reasonCode, threads = [A, B] } = {}) {
  return operationSpecificContinuationProducer.nominate({
    result: { status: 'ANSWERED', blocks: [], suggestions: [], reasonCode, ...(parameters ? { parameters } : {}) },
    sourceOperationId: source, propertyId: PROPERTY,
    loadOperationSpecificContinuationState: async () => ({ hasPendingMaintenance: true, hasOpenInspectionFindings: true, hasUnresolvedRecallMatches: true, hasRecordedHvacOutcome: true }),
    loadActivePlanState: async () => ({ sellHoldRentActive: false, hvacThreads: threads, guidanceJourneys: [] }),
  });
}
const bound = (candidates) => candidates.filter((candidate) => candidate.entityContext.entityType === 'DECISION_THREAD');

test('every stamped source has at least one thread-bound recipe (so the stamp is what makes it executable)', () => {
  for (const source of STAMPED_SOURCES) {
    const recipes = OPERATION_SPECIFIC_CONTINUATION_RECIPES[source] ?? [];
    assert.ok(recipes.some((entry) => recipeTargetsDecisionThread(entry.operationId)), `${source} has no thread-bound recipe`);
  }
});

test('two active threads: a result stamped with Thread A binds every thread-bound recipe to A, never B', async () => {
  for (const source of STAMPED_SOURCES) {
    const candidates = await nominate(source, { parameters: { focusedDecisionThreadId: A.id } });
    const threadBound = bound(candidates);
    assert.ok(threadBound.length > 0, `${source}: expected a thread-bound candidate`);
    for (const candidate of threadBound) {
      assert.equal(candidate.entityContext.entityId, A.id, `${source}: bound to the stamped thread`);
      assert.equal(candidate.entityContext.contextVersion, A.contextVersion);
    }
  }
  const forB = await nominate('HVAC_DECISION_SCENARIO', { parameters: { focusedDecisionThreadId: B.id } });
  assert.deepEqual([...new Set(bound(forB).map((candidate) => candidate.entityContext.entityId))], [B.id]);
});

test('two active threads and no stamp: no thread-bound recipe (no recency or title inference)', async () => {
  for (const source of STAMPED_SOURCES) assert.equal(bound(await nominate(source)).length, 0, source);
});

test('a stamped thread that is not an active thread (abandoned, stale or foreign) yields no thread-bound recipe', async () => {
  for (const source of STAMPED_SOURCES) {
    assert.equal(bound(await nominate(source, { parameters: { focusedDecisionThreadId: 'thread-abandoned' } })).length, 0, source);
  }
});

test('an abandoned decision produces no thread-bound continuation even with one remaining thread', async () => {
  // HVAC_DECISION_ABANDON has no thread-bound recipe, and its confirm result is deliberately not stamped.
  const recipes = OPERATION_SPECIFIC_CONTINUATION_RECIPES.HVAC_DECISION_ABANDON;
  assert.ok(recipes.every((entry) => !recipeTargetsDecisionThread(entry.operationId)));
});

test('the real specialist handler stamps the runtime thread (alongside its existing decisionThreadId)', async () => {
  const projection = {
    runId: 'run-1', agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0', phase: 'RECOMMENDATION_READY', decisionThreadId: 'thread-A',
    currentRecommendationSnapshotId: 's', recommendationGeneratedAt: '2026-10-16T12:00:00.000Z', recommendationEngineVersion: 'e', verdict: 'REPLACE',
    confidenceLabel: 'HIGH', outstanding: [], explanation: [], abstentionReason: null, paused: false, casVersion: null, expectedOperation: null,
  };
  const action = {
    id: 'action-1', lineageId: 'l', recommendedAction: 'Review', signal: 's', presentation: { headline: 'Furnace' }, source: { entityId: 'a', version: '1' },
    decisionLineage: { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'inventory-1' },
  };
  const dependencies = {
    authorize: async () => ({ role: 'CONTRIBUTOR' }), loadHomeActionFeed: async () => ({ actions: [action] }),
    invokeRuntime: async () => ({ mutated: false, status: projection }),
  };
  const result = await hvacSpecialistEngageResult('user-1', 'property-1', 'Why are you recommending replacement?', 'exec-1', undefined, dependencies);
  assert.equal(result.parameters.decisionThreadId, 'thread-A');
  assert.equal(result.parameters.focusedDecisionThreadId, 'thread-A');
  const none = await hvacSpecialistEngageResult('user-1', 'property-1', 'Why?', 'exec-1', undefined, {
    ...dependencies, invokeRuntime: async () => ({ mutated: false, status: { ...projection, decisionThreadId: null } }),
  });
  assert.equal(none.parameters, undefined, 'no resolved thread -> nothing stamped');
});

// SOURCE-LEVEL checks (these read handler source; they do not execute the DB-backed branches).
const read = (file) => fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers', file), 'utf8');
const branch = (source, from, to) => source.slice(source.indexOf(from), to ? source.indexOf(to, source.indexOf(from)) : undefined);

test('source check: unique-thread and created-thread branches stamp the thread they resolved', () => {
  const decision = read('hvacDecision.handler.ts');
  assert.match(branch(decision, "reasonCode: 'HVAC_DECISION_RESUMED',\n    // selectHvac", 'suggestions'), /focusedDecisionThreadId: thread\.id/);
  assert.match(branch(decision, "reasonCode: 'HVAC_DECISION_OUTCOME_NONE',\n      parameters", 'blocks'), /focusedDecisionThreadId: selection\.thread\.id/);
  assert.match(branch(decision, "reasonCode: 'HVAC_DECISION_OUTCOME_FOUND',", 'blocks'), /focusedDecisionThreadId: selection\.thread\.id/);
  const confirm = read('hvacConfirm.handler.ts');
  assert.match(branch(confirm, "reasonCode: 'HVAC_DECISION_START_CREATED'", 'blocks'), /focusedDecisionThreadId: createdThread\.id/);
  assert.match(branch(confirm, "reasonCode: 'HVAC_DECISION_SCENARIO_CREATED'", 'blocks'), /focusedDecisionThreadId: scenarioThread\.id/);
  assert.match(branch(confirm, "reasonCode: 'HVAC_DECISION_OUTCOME_RECORDED'", 'blocks'), /focusedDecisionThreadId: candidate\.data\.decisionThreadId/);
  assert.match(branch(confirm, "reasonCode: 'HVAC_DECISION_OUTCOME_DISPUTED'", 'blocks'), /focusedDecisionThreadId: candidate\.data\.decisionThreadId/);
});

test('source check: ambiguous, unresolved, inactive and abandoned results are never stamped', () => {
  const decision = read('hvacDecision.handler.ts');
  for (const reason of ['HVAC_DECISION_THREAD_AMBIGUOUS', 'HVAC_DECISION_ITEM_REQUIRED', 'HVAC_DECISION_ITEM_AMBIGUOUS', 'HVAC_DECISION_NOT_STARTED', 'HVAC_DECISION_SUBJECT_NOT_ACTIVE', 'HVAC_DECISION_ITEM_UNAVAILABLE']) {
    for (const match of decision.matchAll(new RegExp(`reasonCode: '${reason}'[^]{0,160}`, 'g'))) {
      assert.ok(!/focusedDecisionThreadId/.test(match[0]), `${reason} must not be stamped`);
    }
  }
  const confirm = read('hvacConfirm.handler.ts');
  assert.ok(!/focusedDecisionThreadId/.test(branch(confirm, "reasonCode: 'HVAC_DECISION_ABANDONED'", 'blocks')), 'an abandoned thread is not active');
  for (const reason of ['HVAC_PREFERENCE_SAVED', 'HVAC_PREFERENCE_FORGOTTEN']) {
    assert.ok(!/focusedDecisionThreadId/.test(branch(confirm, `reasonCode: '${reason}'`, 'blocks')), `${reason} is not thread-scoped`);
  }
});

test('confirmed completion persists result parameters on top of the stored ones, never in place of them', () => {
  const stored = { sourceExecutionId: 'src-1', hvacDecisionStart: { inventoryItemId: 'i1' }, confirmationVersion: 1 };
  assert.deepEqual(mergeConfirmedParameters(stored, { focusedDecisionThreadId: 'thread-A' }),
    { ...stored, focusedDecisionThreadId: 'thread-A' });
  assert.equal(mergeConfirmedParameters(stored, undefined), undefined, 'no result parameters -> no write');
  assert.equal(mergeConfirmedParameters(stored, null), undefined);
  assert.deepEqual(mergeConfirmedParameters({}, { a: 1 }), { a: 1 });
});
