// FR-GATE-3: a canonical answer skips the word-overlap relevance check only when the entity and every required slot were resolved and the message is not an unsegmented compound or conditional one.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { canonicalBypassDecision, hasCompoundJoiner } = require('../../src/services/ask/support/answerGateBypass.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');

const resolved = { outcome: 'RESOLVED', confidenceBand: 'HIGH', missingSlots: [] };
test('joiners: and, also, plus, vs, or, if, but, a clause-opening comma; plain questions are not compound', () => {
  for (const m of ['what is my deductible and when does my policy expire', 'show my warranties, also my claims', 'my roof plus my siding', 'roof vs siding', 'is it the roof or the siding', 'if my roof leaks what then', 'my roof is old but fine', 'hey cozy, when does my warranty expire']) assert.equal(hasCompoundJoiner(m), true, m);
  for (const m of ['what is the status of my roof warranty', 'how old is my water heater?', 'show my maintenance tasks']) assert.equal(hasCompoundJoiner(m), false, m);
});
test('the decision: entity and slots must be resolved at or above threshold; a compound message keeps the check unless segmentation was certified', () => {
  assert.deepEqual(canonicalBypassDecision({ question: 'how old is my roof', entityResolution: resolved }), { permitted: true, denial: null });
  assert.deepEqual(canonicalBypassDecision({ question: 'how old is my roof' }), { permitted: true, denial: null }, 'a caller with no routing decision is not asked about entities');
  for (const entityResolution of [null, { ...resolved, outcome: 'MENTION_ONLY' }, { ...resolved, outcome: 'MISSING' }, { ...resolved, outcome: 'AMBIGUOUS' }, { ...resolved, confidenceBand: 'LOW' }, { ...resolved, missingSlots: ['item'] }]) assert.equal(canonicalBypassDecision({ question: 'how old is my siding', entityResolution }).denial, 'ENTITY_NOT_RESOLVED', JSON.stringify(entityResolution));
  assert.equal(canonicalBypassDecision({ question: 'how old is my roof', entityResolution: { ...resolved, outcome: 'NOT_REQUIRED', confidenceBand: null } }).permitted, true);
  assert.equal(canonicalBypassDecision({ question: 'how old is my roof and my siding', entityResolution: resolved }).denial, 'COMPOUND_NOT_SEGMENTED');
  assert.equal(canonicalBypassDecision({ question: 'how old is my roof and my siding', entityResolution: resolved, segmentationCertified: true }).permitted, true);
});

const summary = { status: 'ANSWERED', reasonCode: undefined, parameters: {}, blocks: [
  { type: 'SUMMARY', id: 'property-summary', title: 'Your home', body: 'A 3-bedroom home built in 1998.', tone: 'DEFAULT', actions: [] },
  { type: 'EVIDENCE', id: 'property-summary-evidence', title: 'Where this comes from', items: [{ label: 'Home profile', source: 'Property', observedAt: null }] },
], suggestions: [] };
test('the validator: a canonical answer passes for a clean single question, and keeps the relevance check when the entity is unresolved or the message is compound', () => {
  const run = (extra) => validateAskSemanticAnswerRelevance({ question: 'give me a summary of my home', operationId: 'PROPERTY_SUMMARY', result: summary, ...extra });
  const clean = run({ entityResolution: resolved });
  assert.equal(clean.outcome, 'PASS'); assert.deepEqual(clean.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  const unresolved = run({ entityResolution: { ...resolved, outcome: 'MISSING' } });
  assert.ok(!unresolved.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH')); assert.ok(unresolved.reasonCodes.includes('CANONICAL_BYPASS_WITHHELD_ENTITY_NOT_RESOLVED'));
  const compound = validateAskSemanticAnswerRelevance({ question: 'give me a summary of my home and when does my warranty expire', operationId: 'PROPERTY_SUMMARY', result: summary, entityResolution: resolved });
  assert.ok(!compound.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH')); assert.ok(compound.reasonCodes.includes('CANONICAL_BYPASS_WITHHELD_COMPOUND_NOT_SEGMENTED'));
  const certified = validateAskSemanticAnswerRelevance({ question: 'give me a summary of my home and my rooms', operationId: 'PROPERTY_SUMMARY', result: summary, entityResolution: resolved, segmentationCertified: true });
  assert.equal(certified.outcome, 'PASS'); assert.deepEqual(certified.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  // callers with no routing decision (the evaluators, tests) keep the previous behaviour for a clean question
  assert.equal(run({}).outcome, 'PASS');
});
