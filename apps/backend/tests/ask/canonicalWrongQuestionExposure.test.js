const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { CANONICAL_ANSWER_BLOCK_ID_PREFIXES } = require('../../src/services/ask/support/canonicalAnswerBlocks.ts');

// Audit review finding P1: a canonical-block match returns PASS before any question scoring. These tests inject questions that belong to a DIFFERENT
// operation into each of the 12 Phase 3 operations (selected operation = the one the router "chose", block = that operation's own answer block) and
// record what the validator does. They pin the exposure so a change to the bypass shows up here, and they separate two cases:
//   - own-block + wrong question: the gate cannot reject (by design, the block IS the operation's output). Pinned as PASS.
//   - a different operation's block under the selected operation: the gate must NOT pass on the canonical contract.
const PHASE3_OPERATIONS = [
  'APPLIANCE_FAILURE_RISK', 'WARRANTY_LOOKUP', 'INCIDENT_CLAIM_STATUS', 'RECALL_REVIEW', 'SELL_HOLD_RENT_ANALYSIS', 'PROPERTY_TAX_APPEAL_READINESS',
  'BREAK_EVEN_ANALYSIS', 'DO_NOTHING_SIMULATION', 'HOA_COMPLIANCE_STATUS', 'SERVICE_PRICE_CHECKS', 'PROJECT_TRACKER_PROJECTS', 'DIY_PROJECTS',
];
const WRONG_QUESTIONS = [
  'what is the weather forecast for my zip code this weekend',
  'how do I export my home record as a pdf',
  'what should I plant in my garden this spring',
];

const answerFor = (operationId, blockId) => attachEvidence({
  status: 'ANSWERED', parameters: {}, captureRequests: [],
  blocks: [{ type: 'SUMMARY', id: blockId, title: 'Result', body: 'Here is the result for your home.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
}, [completedAskAuthoritativeSourceEvidence(operationId)]);

const ownBlockId = (operationId) => CANONICAL_ANSWER_BLOCK_ID_PREFIXES[operationId][0].replace(/\$$/, '');

test('each Phase 3 operation: an unrelated question with the operation’s own block is accepted (documented false-accept exposure)', () => {
  const accepted = [];
  for (const operationId of PHASE3_OPERATIONS) {
    for (const question of WRONG_QUESTIONS) {
      const v = validateAskSemanticAnswerRelevance({ question, operationId, result: answerFor(operationId, ownBlockId(operationId)) });
      assert.equal(v.outcome, 'PASS', `${operationId} / ${question}`);
      assert.deepEqual(v.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
      accepted.push(`${operationId}`);
    }
  }
  // 12 operations x 3 unrelated questions = 36 of 36 accepted: the bypass has no question check.
  assert.equal(accepted.length, PHASE3_OPERATIONS.length * WRONG_QUESTIONS.length);
});

test('each Phase 3 operation: another operation’s block under it never passes on the canonical contract', () => {
  for (const operationId of PHASE3_OPERATIONS) {
    const other = PHASE3_OPERATIONS.find((id) => id !== operationId);
    const v = validateAskSemanticAnswerRelevance({ question: WRONG_QUESTIONS[0], operationId, result: answerFor(operationId, ownBlockId(other)) });
    assert.ok(!v.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH'), `${operationId} accepted ${other}'s block`);
  }
});

test('each Phase 3 operation: a non-canonical block id is never accepted on the canonical contract', () => {
  for (const operationId of PHASE3_OPERATIONS) {
    const v = validateAskSemanticAnswerRelevance({ question: WRONG_QUESTIONS[0], operationId, result: answerFor(operationId, 'generic-summary') });
    assert.ok(!v.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH'), operationId);
  }
});
