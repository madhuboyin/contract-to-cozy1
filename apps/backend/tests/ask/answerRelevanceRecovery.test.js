const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_NAMING_HINT, ASK_NO_SUPPORTED_CLAIM_TEXT, ASK_UNVERIFIABLE_ANSWER_TEXT, isAskHonestNoAnswerResult } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

// Review screenshots (2026-11-07): "how many bedrooms do i have", "what is the color of bedroom" and "how many items are there in my master bed room"
// all ended in "I need one detail to verify this answer" with one option, "get general educational home guidance" (the fallback that had just
// produced the answer). Choosing it ended in "I still couldn't verify this answer".

const withEvidence = (result, operationId) => attachEvidence(result, [completedAskAuthoritativeSourceEvidence(operationId)]);
const boundary = { type: 'BOUNDARY', id: 'grounded-professional-boundary', title: 'Educational guidance—not a controlling determination', body: 'This answer is educational and does not replace emergency services, a licensed professional, controlling contract or policy language, or an authority having jurisdiction.', severity: 'INFO', suggestions: [] };
const noAnswer = () => withEvidence({
  status: 'READY_WITH_LIMITATIONS', reasonCode: 'GROUNDED_GUIDANCE_LOW_CONFIDENCE',
  blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Nothing in your home record answers this', body: ASK_NO_SUPPORTED_CLAIM_TEXT, tone: 'CAUTION', actions: [] }, boundary],
  suggestions: [],
}, 'GROUNDED_GUIDANCE');
const unrelatedFact = () => withEvidence({
  status: 'ANSWERED',
  blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body: 'Your home record includes: Roof replaced (2025; recorded).', tone: 'DEFAULT', actions: [] }, boundary],
  suggestions: [],
}, 'GROUNDED_GUIDANCE');
const vague = () => withEvidence({
  status: 'ANSWERED',
  blocks: [{ type: 'SUMMARY', id: 'vague', title: 'Response', body: 'I found a result.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
}, 'MAINTENANCE_STATUS');

test('the fallback saying it found nothing is not an unverified answer, so no one-option question is asked', () => {
  for (const question of ['how many bedrooms do i have', 'what is the color of bedroom', 'how many items are there in my master bed room']) {
    const validation = validateAskAnswerTrustPipeline({ question, operationId: 'GROUNDED_GUIDANCE', result: noAnswer(), semanticEnabled: true, propertyId: 'p1' });
    assert.equal(validation.semantic.outcome, 'PASS', question);
    assert.deepEqual(validation.semantic.reasonCodes, ['HONEST_NO_ANSWER_STATED']);
    assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS', question);
    assert.equal(validation.result.clarification ?? null, null, question);
    assert.match(validation.result.blocks[0].body, /couldn’t find anything in your home record/, question);
  }
  assert.equal(isAskHonestNoAnswerResult('GROUNDED_GUIDANCE', noAnswer()), true);
  assert.equal(isAskHonestNoAnswerResult('MAINTENANCE_STATUS', noAnswer()), false, 'only the fallback operation can state this');
  assert.equal(isAskHonestNoAnswerResult('GROUNDED_GUIDANCE', unrelatedFact()), false, 'an answer that states a fact is still verified against the question');
});

test('a fallback fact that cannot be matched to the question is replaced by a plain message, not a question that can only fail again', () => {
  const validation = validateAskAnswerTrustPipeline({ question: 'how many bedrooms do i have', operationId: 'GROUNDED_GUIDANCE', result: unrelatedFact(), semanticEnabled: true, propertyId: 'p1' });
  assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE');
  assert.equal(validation.result.clarification ?? null, null);
  assert.equal(validation.result.blocks[0].body, ASK_UNVERIFIABLE_ANSWER_TEXT);
  assert.ok(!JSON.stringify(validation.result).includes('Roof replaced'), 'the unverified fact is not shown');
});

test('the router’s close runner-ups are offered; weak or distant ones and the failed fallback are not', () => {
  const validation = validateAskAnswerTrustPipeline({
    question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', result: vague(), semanticEnabled: true,
    routingAlternatives: [
      { operationId: 'MAINTENANCE_STATUS', confidence: 0.6 },
      { operationId: 'HOME_ACTIONS', confidence: 0.5 },
      { operationId: 'HOME_WORK_ITEMS', confidence: 0.45 },
      { operationId: 'GROUNDED_GUIDANCE', confidence: 0.5 },
      { operationId: 'DOCUMENT_LOOKUP', confidence: 0.2 },
      { operationId: 'COVERAGE_GAPS', confidence: 0.35 },
    ],
  });
  assert.equal(validation.result.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(validation.result.clarification.options.map((option) => option.operationId), ['MAINTENANCE_STATUS', 'HOME_ACTIONS', 'HOME_WORK_ITEMS']);
  assert.equal(validation.result.clarification.question, 'What did you want to look at?');
  assert.equal(validation.result.blocks[0].title, 'I’m not sure I understood that');
  assert.doesNotMatch(JSON.stringify(validation.result.blocks), /verify|prepared response|exact wording/i);
});

test('FR-REC-1/4: without runner-ups there is no one-option card; the answer is declined plainly instead of re-running the same operation', () => {
  const validation = validateAskAnswerTrustPipeline({ question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', result: vague(), semanticEnabled: true });
  assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE');
  assert.equal(validation.result.clarification, undefined, 'no card whose only option re-runs the withheld operation');
});

test('after a clarification that still cannot be matched, the message says what to try and is not retryable', () => {
  const validation = validateAskAnswerTrustPipeline({
    question: 'What maintenance is pending? Clarification: pending upkeep', operationId: 'MAINTENANCE_STATUS', result: vague(),
    semanticEnabled: true, recoveryAttempted: true,
  });
  assert.equal(validation.result.status, 'UNAVAILABLE');
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
  assert.ok(validation.result.blocks[0].body.includes(ASK_NAMING_HINT));
  assert.doesNotMatch(validation.result.blocks[0].body, /workspace/i);
});

test('the phrasings the messages suggest really reach an answer', () => {
  for (const message of ['show my dishwasher details', 'what maintenance is due']) {
    assert.ok(ASK_NAMING_HINT.includes(`“${message}”`), message);
    const decision = resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' });
    assert.ok(decision.stage === 'DETERMINISTIC' || decision.stage === 'LOCAL_CLASSIFIER', `${message} -> ${decision.stage}`);
  }
});
