const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_NO_SUPPORTED_CLAIM_TEXT } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { ASK_DID_YOU_MEAN_FLOOR, ASK_DID_YOU_MEAN_LIMIT, ASK_DID_YOU_MEAN_REASON, buildDidYouMeanResult, didYouMeanOptions, isAskUnansweredFallbackResult, offerDidYouMean } = require('../../src/services/ask/support/didYouMean.ts');
const { assertSkillResultBlocksAllowed } = require('../../src/services/ask/askHandlerSupport.ts');

// Review screenshots (2026-11-07): "what need to be taken care for my plant for
// winter" and "how much rent can i expect for my home" both ended in "Nothing in your home record answers this" although the right operation was the
// local router's top candidate, just under the confidence threshold.

const eligible = new Set(Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY')).map((definition) => definition.operationId));
const cascade = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' });
const noAnswer = () => ({
  status: 'READY_WITH_LIMITATIONS', reasonCode: 'GROUNDED_GUIDANCE_LOW_CONFIDENCE',
  blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Nothing in your home record answers this', body: ASK_NO_SUPPORTED_CLAIM_TEXT, tone: 'CAUTION', actions: [] }],
  suggestions: [],
});

test('the screenshot messages are offered the operation the homeowner meant', () => {
  for (const [message, expected] of [
    ['what need to be taken care for my plant for winter', 'PLANT_CARE_OUTLOOK'],
  ]) {
    const decision = cascade(message);
    assert.equal(decision.stage, 'REMOTE_FALLBACK', message);
    const offered = offerDidYouMean({ operationId: 'GROUNDED_GUIDANCE', routingDecision: decision, result: noAnswer(), eligibleOperationIds: eligible });
    assert.ok(offered, message);
    assert.ok(offered.clarification.options.some((option) => option.operationId === expected), `${message}: ${offered.clarification.options.map((option) => option.operationId).join(',')}`);
  }
});

test('the offer is a clarification the existing resume path accepts', () => {
  const result = buildDidYouMeanResult(['PLANT_CARE_OUTLOOK', 'WORK_OVERVIEW'], 'en', new Date('2026-11-07T12:00:00.000Z'));
  assert.equal(result.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.reasonCode, ASK_DID_YOU_MEAN_REASON);
  assert.equal(result.clarification.allowFreeText, true);
  assert.deepEqual(result.clarification.options.map((option) => option.operationId), ['PLANT_CARE_OUTLOOK', 'WORK_OVERVIEW']);
  for (const option of result.clarification.options) assert.ok(option.label.length > 5, option.operationId);
  assert.deepEqual(result.parameters.clarification.candidateOperationIds, ['PLANT_CARE_OUTLOOK', 'WORK_OVERVIEW'], 'askClarification resumes from these ids');
  assert.equal(result.parameters.clarification.expiresAt, result.clarification.expiresAt);
  assert.equal(result.clarification.expiresAt, '2026-11-07T12:30:00.000Z');
  assert.doesNotThrow(() => assertSkillResultBlocksAllowed('GROUNDED_GUIDANCE', result), 'the fallback operation may present this block');
});

test('options: best first, above the floor, eligible, never the fallback or a boundary, at most three', () => {
  const candidate = (operationId, confidence) => ({ operationId, confidence });
  const options = didYouMeanOptions([
    candidate('HOME_HABITS', 0.12), candidate('PLANT_CARE_OUTLOOK', 0.32), candidate('GROUNDED_GUIDANCE', 0.9), candidate('EMERGENCY_BOUNDARY', 0.9),
    candidate('WORK_OVERVIEW', 0.26), candidate('PLANT_CARE_OUTLOOK', 0.31), candidate('HOME_ACTIONS', 0.05), candidate('COMMUNITY_UPDATES', 0.2), candidate('MAINTENANCE_STATUS', 0.4),
  ], eligible);
  assert.deepEqual(options, ['MAINTENANCE_STATUS', 'PLANT_CARE_OUTLOOK', 'WORK_OVERVIEW']);
  assert.equal(options.length, ASK_DID_YOU_MEAN_LIMIT);
  assert.deepEqual(didYouMeanOptions([candidate('HOME_ACTIONS', ASK_DID_YOU_MEAN_FLOOR - 0.01)], eligible), []);
  assert.deepEqual(didYouMeanOptions([candidate('BUYER_PLAN_STATUS', 0.5)], new Set(['HOME_ACTIONS'])), [], 'an operation not available here is never offered');
});

test('only an unanswered generic fallback is replaced; a real answer, another stage and "no candidate" are left alone', () => {
  // (the rent wording from the same screenshots now routes directly; the rain message still ends in the fallback)
  const decision = cascade("it's going to rain tomorrow, do i need to take care of anything");
  const offer = (overrides) => offerDidYouMean({ operationId: 'GROUNDED_GUIDANCE', routingDecision: decision, result: noAnswer(), eligibleOperationIds: eligible, ...overrides });
  assert.ok(offer({}));
  assert.ok(offer({ result: { status: 'READY_WITH_LIMITATIONS', reasonCode: 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE', blocks: [], suggestions: [] } }), 'an answer that could not be matched is replaced too');
  assert.equal(offer({ result: { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body: 'Your home record includes: Roof replaced (2025; recorded).', tone: 'DEFAULT', actions: [] }], suggestions: [] } }), null);
  assert.equal(offer({ operationId: 'MAINTENANCE_STATUS' }), null);
  assert.equal(offer({ routingDecision: { ...decision, stage: 'CLARIFICATION' } }), null);
  assert.equal(offer({ routingDecision: { ...decision, candidates: [] } }), null, 'with no candidate the plain "nothing found" message stands');
  assert.equal(isAskUnansweredFallbackResult('GROUNDED_GUIDANCE', noAnswer()), true);
  assert.equal(isAskUnansweredFallbackResult('MAINTENANCE_STATUS', noAnswer()), false);
});

test('the turn offers it after answer validation and before the result is saved', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  const validated = source.indexOf('let result = validation?.result ?? presentedResult;');
  const offered = source.indexOf('offerDidYouMean({ operationId: operation.operationId, routingDecision, result, eligibleOperationIds, message: routingMessage })');
  const saved = source.indexOf('status: result.status,', validated);
  assert.ok(validated > 0 && offered > validated && saved > offered, 'validate, then offer, then persist');
  assert.match(source, /askUnansweredRecoveryTotal\.inc\(\{ outcome: didYouMean \? 'offered' : 'none' \}\)/);
});

test('a question is offered readings that look things up; writes only for command wording or a completed action', () => {
  const { messageUsesCommandWording } = require('../../src/services/ask/support/didYouMean.ts');
  const candidate = (operationId, confidence) => ({ operationId, confidence });
  const eligible = new Set(['HOME_ACTIONS', 'OPERATIONAL_WORK_UPDATE', 'CLAIM_FILE', 'MAINTENANCE_STATUS']);
  const cands = [candidate('OPERATIONAL_WORK_UPDATE', 0.5), candidate('CLAIM_FILE', 0.4), candidate('MAINTENANCE_STATUS', 0.3), candidate('HOME_ACTIONS', 0.2)];
  const writes = ['OPERATIONAL_WORK_UPDATE', 'CLAIM_FILE'];
  const question = didYouMeanOptions(cands, eligible, 'how is my water heater doing');
  assert.ok(question.length >= 1 && question.every((id) => !writes.includes(id)), `no write offered for a question: ${question}`);
  assert.ok(didYouMeanOptions(cands, eligible, 'please update the work item').includes('OPERATIONAL_WORK_UPDATE'));
  assert.ok(didYouMeanOptions(cands, eligible, 'i replaced the water heater last week').includes('OPERATIONAL_WORK_UPDATE'));
  for (const yes of ['add a task', 'can you file a claim', 'I finished the filter change', 'I paid the bill']) assert.equal(messageUsesCommandWording(yes), true, yes);
  for (const no of ['how is my water heater doing', 'what does my warranty cover', 'when did i replace the roof', 'is there a tool for this']) assert.equal(messageUsesCommandWording(no), false, no);
});
