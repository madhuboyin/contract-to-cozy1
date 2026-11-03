require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { prisma } = require('../../src/lib/prisma.ts');
const optional = require('../../src/services/ask/suggestedActions/optionalNextActionCapture.ts');
const completion = require('../../src/services/ask/suggestedActions/suggestedActionCompletion.ts');
const history = require('../../src/services/ask/suggestedActions/suggestedNextActionHistory.ts');
const { resultOwnsPendingInteraction } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { skillHandoffCandidates } = require('../../src/services/ask/suggestedActions/skillHandoffCandidates.ts');
const { operationSpecificContinuationCandidates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { candidateIdentityFields } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { suggestedNextActionSemanticKey } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { isRecurringHubOutcome, isRegisteredOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { SKILL_HANDOFF_DEFINITIONS } = require('../../src/services/skills/skillHandoff.ts');
const sites = require('../../scripts/ask-suggestion-sites.js');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');
const optionalPrompt = { captureKey: 'NEXT_ACTION_MISSING_FACT', requirementId: 'r1' };
const factPrompt = { captureKey: 'NEXT_ACTION_CONTEXT:roof.age', requirementId: 'r2' };
const blockingPrompt = { captureKey: 'PROPERTY_CONTEXT_AREA_CAPTURE', requirementId: 'r3' };

// ---- optional next-action captures ---------------------------------------------------------------------------------------------------------

test('optional next-action prompts are recognised from the shared definition, and the next-actions module re-exports the same keys', () => {
  assert.equal(optional.isOptionalNextActionCapture(optionalPrompt), true);
  assert.equal(optional.isOptionalNextActionCapture(factPrompt), true);
  assert.equal(optional.isOptionalNextActionCapture(blockingPrompt), false);
  assert.equal(optional.isOptionalNextActionCapture(null), false);
  assert.equal(optional.hasBlockingCaptureRequests([optionalPrompt, factPrompt]), false);
  assert.equal(optional.hasBlockingCaptureRequests([optionalPrompt, blockingPrompt]), true);
  assert.equal(optional.hasBlockingCaptureRequests(undefined), false);
  const next = require('../../src/services/ask/askNextActions.ts');
  assert.equal(next.NEXT_ACTION_MISSING_FACT_CAPTURE_KEY, optional.NEXT_ACTION_MISSING_FACT_CAPTURE_KEY);
  assert.equal(next.NEXT_ACTION_CONTEXT_PREFIX, optional.NEXT_ACTION_CONTEXT_PREFIX);
});

test('an answer carrying only an optional next-action prompt is not a pending interaction and is a finished answer; a blocking prompt still is not', () => {
  assert.equal(resultOwnsPendingInteraction({ status: 'ANSWERED', captureRequests: [optionalPrompt, factPrompt] }, false), false);
  assert.equal(resultOwnsPendingInteraction({ status: 'ANSWERED', captureRequests: [optionalPrompt, blockingPrompt] }, false), true);
  assert.equal(resultOwnsPendingInteraction({ status: 'ANSWERED', captureRequests: [blockingPrompt] }, true), false, 'the reviewed optional-escape-route operations are unchanged');
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS', captureRequests: [optionalPrompt] }), true);
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS', captureRequests: [blockingPrompt] }), false);
  assert.equal(completion.storedResultHasOpenCaptureRequests({ captureRequests: [optionalPrompt] }), false);
  assert.equal(completion.storedResultHasOpenCaptureRequests({ captureRequests: [optionalPrompt, blockingPrompt] }), true);
});

// ---- handoffs reuse the canonical outcome ---------------------------------------------------------------------------------------------------

test('a skill handoff uses the canonical outcome key, so it de-duplicates against the equivalent recipe and follows the same hub lifecycle', () => {
  const handoff = (definition) => skillHandoffCandidates({
    result: { status: 'ANSWERED', blocks: [], suggestions: [], skillHandoff: {
      suggestedNextSkillId: definition.targetSkillId, suggestedGoal: definition.suggestedGoal, suggestedLabel: 'Next', reasonCodes: [], continuity: { propertyId: PROPERTY, contextVersion: null },
    } },
    sourceOperationId: definition.sourceOperationId, propertyId: PROPERTY,
  })[0];
  const keyOf = (candidate) => suggestedNextActionSemanticKey(candidateIdentityFields(candidate));
  const state = { hasPendingMaintenance: true, hasOpenInspectionFindings: true, hasUnresolvedRecallMatches: true };

  const homeToMaintenance = SKILL_HANDOFF_DEFINITIONS.find((d) => d.sourceOperationId === 'HOME_ACTIONS' && d.targetOperationId === 'MAINTENANCE_STATUS');
  const inspectionToActions = SKILL_HANDOFF_DEFINITIONS.find((d) => d.sourceOperationId === 'INSPECTION_FINDING_UPDATE' && d.targetOperationId === 'HOME_ACTIONS');
  for (const definition of [homeToMaintenance, inspectionToActions]) {
    const fromHandoff = handoff(definition);
    const fromRecipe = operationSpecificContinuationCandidates(definition.sourceOperationId, PROPERTY, definition.sourceOperationId === 'HOME_ACTIONS' ? state : undefined)
      .find((candidate) => candidate.operationId === definition.targetOperationId);
    assert.ok(fromHandoff && fromRecipe, `${definition.sourceOperationId} -> ${definition.targetOperationId}`);
    assert.equal(keyOf(fromHandoff), keyOf(fromRecipe), 'same semantic identity, so the row cannot carry both');
    assert.equal(isRecurringHubOutcome(fromHandoff.operationId, fromHandoff.outcomeKey), true, 'same hub lifecycle as the canonical read');
  }
  for (const definition of SKILL_HANDOFF_DEFINITIONS) {
    const candidate = handoff(definition);
    if (candidate) {
      assert.ok(isRegisteredOutcome(candidate.operationId, candidate.outcomeKey), `${definition.sourceOperationId}: ${candidate.outcomeKey}`);
      assert.ok(!candidate.outcomeKey.startsWith('HANDOFF_'), 'no separate handoff outcome vocabulary remains');
    }
  }
});

// ---- recent turns --------------------------------------------------------------------------------------------------------------------------

test('recent completed turns drop unfinished captures BEFORE the limit (so they do not shrink the window) and keep optional-prompt answers', async () => {
  let args;
  const row = (message, status, captures) => ({ message, operationId: 'X', status, resultJson: { captureRequests: captures } });
  const original = prisma.askExecution.findMany;
  prisma.askExecution.findMany = async (a) => {
    args = a;
    return [
      row('abandoned 1', 'READY_WITH_LIMITATIONS', [blockingPrompt]), row('abandoned 2', 'READY_WITH_LIMITATIONS', [blockingPrompt]),
      row('caveated with optional prompt', 'READY_WITH_LIMITATIONS', [optionalPrompt]), row('answered 1', 'ANSWERED', []), row('answered 2', 'ANSWERED', []),
      row('answered 3', 'ANSWERED', []), row('answered 4', 'ANSWERED', []), row('answered 5', 'ANSWERED', []),
    ];
  };
  try {
    const messages = await history.loadRecentCompletedMessages({ sessionId: 's1', userId: 'u1', excludeExecutionId: 'now' });
    assert.deepEqual(messages, ['caveated with optional prompt', 'answered 1', 'answered 2', 'answered 3', 'answered 4'], 'five finished turns, unfinished ones skipped');
    assert.ok(args.take > 5, 'fetches beyond the window so filtering can replenish it');
    const turns = await history.loadRecentCompletedTurns({ sessionId: 's1', userId: 'u1', excludeExecutionId: 'now', take: 2 });
    assert.equal(turns.length, 2);
    assert.deepEqual(Object.keys(turns[0]).sort(), ['message', 'operationId']);
  } finally { prisma.askExecution.findMany = original; }
});

test('the execution finalizer and the capture refresh both use the shared recent-turns loader (no duplicated status query)', () => {
  assert.match(read('src/services/ask/execution/executeOperation.ts'), /loadRecentCompletedTurns\(\{/);
  assert.doesNotMatch(read('src/services/ask/execution/executeOperation.ts'), /status: \{ in: \['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'\] \}/);
  assert.match(read('src/services/ask/execution/askCapture.ts'), /loadRecentCompletedTurns\(\{/);
  assert.doesNotMatch(read('src/services/ask/execution/askCapture.ts'), /status: \{ in: \['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'\] \}/);
});

// ---- governed marker and clarification completion (wiring) ------------------------------------------------------------------------------------

test('the inline missing-fact capture keeps the governed marker and status with the preserved actions', () => {
  const capture = read('src/services/ask/execution/askCapture.ts');
  const preserved = capture.slice(capture.indexOf('suggestedNextActionsGoverned: stored.suggestedNextActionsGoverned === true'));
  assert.ok(preserved.length < capture.length, 'marker is persisted');
  assert.match(capture, /suggestedNextActionsStatus: stored\.suggestedNextActionsStatus/);
  assert.match(capture, /suggestedNextActionsStatus\?: unknown/, 'the stored shape declares both fields');
});

test('both clarification success paths record completion of the chip that launched them', () => {
  const source = read('src/services/ask/execution/askClarification.ts');
  assert.equal((source.match(/recordSelectedSuggestedActionCompletion\(\{ userId, executionId, status: result\.status/g) ?? []).length, 2);
  assert.match(source, /import \{ isSettledForCompletion, recordSelectedSuggestedActionCompletion \}/);
});

// ---- persistence-sites baseline ---------------------------------------------------------------------------------------------------------------

test('the persistence-sites checker detects a reclassification or note change, not only a site-count change; the checked-in baseline matches', () => {
  const current = sites.scan().persistence;
  const baseline = JSON.parse(read('../../docs/architecture/ask-suggested-actions-persistence-sites.json')).files;
  assert.deepEqual(sites.diff(current, baseline), [], 'baseline is current');
  const drifted = JSON.parse(JSON.stringify(baseline));
  drifted['src/services/ask/execution/askCapture.ts'].finalizer = 'VIA_EXECUTE_OPERATION';
  assert.ok(sites.diff(current, drifted).some((problem) => /finalizer classification VIA_EXECUTE_OPERATION -> WIRED/.test(problem)));
  const renoted = JSON.parse(JSON.stringify(baseline));
  renoted['src/services/ask/execution/askCapture.ts'].note = 'stale';
  assert.ok(sites.diff(current, renoted).some((problem) => /note changed/.test(problem)));
  assert.equal(baseline['src/services/ask/execution/askCapture.ts'].finalizer, 'WIRED');
});
