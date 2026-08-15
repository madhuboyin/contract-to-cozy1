const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS, validateAskOperationDefinitions } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { normalizeAskMessage, retrieveAskOperationCandidates } = require('../../src/services/ask/askSemanticRouter.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

test('every operation exposes a valid English semantic contract', () => {
  assert.deepEqual(validateAskOperationDefinitions(), []);
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    assert.equal(definition.semantic.operationId, definition.operationId);
    assert.deepEqual(definition.semantic.supportedLanguages, ['en']);
    assert.ok(definition.semantic.positiveExamples.length >= 2);
    assert.ok(definition.semantic.hardNegativeExamples.length >= 1);
  }
});

test('normalization preserves the original and semantic retrieval handles property completeness paraphrases', () => {
  const message = "What information does this house still need?";
  const normalized = normalizeAskMessage(message);
  assert.equal(normalized.original, message);
  assert.equal(normalized.language, 'en');
  assert.match(normalized.normalized, /home/);
  assert.equal(retrieveAskOperationCandidates(message)[0].operationId, 'PROPERTY_SUMMARY');
});

test('reported completeness question resolves while broad pending language clarifies', () => {
  const completeness = resolveAskRoutingCascade('Are there any pending home details to be filled in?');
  assert.equal(completeness.operation.operationId, 'PROPERTY_SUMMARY');
  assert.equal(completeness.requiresClarification, false);

  const ambiguous = resolveAskRoutingCascade('What is pending for my home?');
  assert.equal(ambiguous.stage, 'CLARIFICATION');
  assert.equal(ambiguous.requiresClarification, true);
  assert.ok(ambiguous.candidates.some((candidate) => candidate.operationId === 'PROPERTY_SUMMARY'));
  assert.ok(ambiguous.candidates.some((candidate) => candidate.operationId === 'MAINTENANCE_STATUS'));
});

test('classifier-off path keeps deterministic commands and clarifies semantic candidates', () => {
  const deterministic = resolveAskRoutingCascade('What maintenance is overdue?', { classifierEnabled: false });
  assert.equal(deterministic.stage, 'DETERMINISTIC');
  const semantic = resolveAskRoutingCascade('What information does this house still need?', { classifierEnabled: false });
  assert.equal(semantic.stage, 'CLARIFICATION');
});

test('answer trust validator blocks unsupported all-clear claims and repairs direct-answer order', () => {
  const unsupported = validateAskAnswerTrust({
    question: 'Is anything pending?', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: {
      status: 'UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'bad', title: 'Everything is complete', body: 'No details are missing.', tone: 'POSITIVE', actions: [] }],
      suggestions: [],
    },
  });
  assert.equal(unsupported.trust.checks.absenceClaimSupport, 'FAIL');
  assert.equal(unsupported.trust.outcome, 'UNAVAILABLE');

  const repaired = validateAskAnswerTrust({
    question: 'Is anything pending?', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: {
      status: 'ANSWERED',
      blocks: [
        { type: 'EVIDENCE', id: 'evidence', title: 'Sources', items: [] },
        { type: 'SUMMARY', id: 'answer', title: 'Two details are pending', body: 'The completed property check found two missing details.', tone: 'CAUTION', actions: [] },
      ],
      suggestions: [],
    },
  });
  assert.equal(repaired.result.blocks[0].type, 'SUMMARY');
  assert.equal(repaired.trust.outcome, 'REPAIRABLE');
});
