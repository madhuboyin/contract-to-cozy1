const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const B = '../../src/services/ask/';
const { executeCrossDomainSnapshot, buildOperationResultFromCrossDomainExecution } = require(B + 'semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require(B + 'semantic/crossDomain/index.ts');
const { SEALED_EVALUATION_CASES } = require(B + 'semantic/evaluation/endToEndEvaluationHarness.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require(B + 'askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require(B + 'askAnswerTrustValidator.ts');
const { answerAnatomyIssues } = require('../../src/productFramework/ask/answerFamilyAnatomy.ts');
const { AskExecutionResponseSchema, ASK_LIST_RECORD_KINDS } = require('../../src/productFramework/ask/ask.contract.ts');

// Owner review of the first five UI slices: a declared presentation family is a contract. Every delivered semantic-stack answer declares one at the result level, and the blocks it
// comes with have the anatomy that family promises.
const list = (id, over = {}) => ({ type: 'GROUPED_LIST', id, title: '', sections: [{ id: 's', title: '', count: 1, items: [{ id: 'a', title: 'A', meta: [] }] }], actions: [], filters: [], ...over });
const summary = { type: 'SUMMARY', id: 'x', title: 'T', body: 'B', tone: 'DEFAULT', actions: [] };

test('rules: ANALYSIS rejects any collection; DIRECT_ANSWER rejects an unjustified one; ENTITY_LIST needs a kind and one list per kind', () => {
  assert.deepEqual(answerAnatomyIssues('ANALYSIS', [summary]), []);
  assert.equal(answerAnatomyIssues('ANALYSIS', [summary, list('l', { recordKind: 'PROJECT' })]).length, 1);
  assert.equal(answerAnatomyIssues('ANALYSIS', [summary, { type: 'TABLE', id: 't', title: 't', columns: [], rows: [] }]).length, 1);
  assert.equal(answerAnatomyIssues('DIRECT_ANSWER', [summary, list('l')]).length, 1);
  assert.deepEqual(answerAnatomyIssues('DIRECT_ANSWER', [summary, list('l', { justifiedCollection: 'The records counted.' })]), []);
  assert.deepEqual(answerAnatomyIssues('DIRECT_ANSWER', [summary, list('l', { sections: [{ id: 's', title: '', count: 0, items: [] }] })]), [], 'an empty list is not a collection to justify');
  assert.equal(answerAnatomyIssues('ENTITY_LIST', [summary, list('l')]).length, 1, 'a list with no kind');
  assert.deepEqual(answerAnatomyIssues('ENTITY_LIST', [summary, list('l', { recordKind: 'CLAIM' }), list('m', { recordKind: 'PERMIT' })]), []);
  assert.equal(answerAnatomyIssues('ENTITY_LIST', [summary, list('l', { recordKind: 'CLAIM' }), list('m', { recordKind: 'CLAIM' })]).length, 1, 'two lists of one kind');
  assert.deepEqual(answerAnatomyIssues('ENTITY_LIST', [summary, list('l', { recordKind: 'PROJECT' }), list('v-needs-confirmation')]), [], 'the unconfirmed list needs no kind');
  assert.deepEqual(answerAnatomyIssues(null, [summary, list('l')]), [], 'an undeclared family is not judged here');
  assert.ok(ASK_LIST_RECORD_KINDS.includes('OTHER'));
});

const response = (presentationFamily, blocks) => ({
  schemaVersion: '1.0', executionId: 'e', sessionId: 's', question: 'q', status: 'ANSWERED', property: null, operation: null, contextVersion: null, presentationFamily,
  blocks, suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

test('the response contract rejects an answer whose blocks break its declared family, and accepts one that keeps it', () => {
  assert.equal(AskExecutionResponseSchema.safeParse(response('ANALYSIS', [summary, list('l', { recordKind: 'PROJECT' })])).success, false);
  assert.equal(AskExecutionResponseSchema.safeParse(response('ENTITY_LIST', [summary, list('l')])).success, false);
  assert.equal(AskExecutionResponseSchema.safeParse(response('ENTITY_LIST', [summary, list('l', { recordKind: 'CLAIM' })])).success, true);
  assert.equal(AskExecutionResponseSchema.safeParse(response('ANALYSIS', [summary])).success, true);
  const undeclared = AskExecutionResponseSchema.safeParse(response(null, [summary, list('l')]));
  assert.equal(undeclared.success, true, 'a producer that has not declared a family is not rejected');
});

const snap = () => buildSeededCrossDomainSnapshot();
const PROMPTS = [
  'what claims are open?', 'which active projects still need a permit?', 'what claims are open and which active projects still need a permit?', 'how long until owning beats renting?',
  'would refinancing break even within three years?', 'which appliances have no warranty?', 'show maintenance tasks due next month', 'how many appliances do I have?',
  'which claim documents are missing?', 'are any of my appliances affected by recalls?', 'what do I still need to finish before listing the house?', 'compare these two kitchen contractor quotes',
  'which appliances have neither a manual nor a receipt?', 'show my pending permits', 'how has my property tax changed over the years',
  ...SEALED_EVALUATION_CASES.filter((c) => c.expectedExecutionStatus === 'ANSWERED' || c.expectedExecutionStatus === 'PARTIAL').map((c) => c.prompt),
];

test('every answered cross-domain turn declares a result-level family, has its anatomy, and keeps the family through the trust pipeline', async () => {
  const seen = new Set();
  let checked = 0;
  for (const prompt of PROMPTS) {
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    const execution = await executeCrossDomainSnapshot({ rawText: prompt, snapshot: snap(), role: 'OWNER', propertyAuthorized: true });
    const operation = buildOperationResultFromCrossDomainExecution(execution);
    assert.ok(operation.presentationFamily, `${prompt}: the answer declares no presentation family`);
    assert.deepEqual(answerAnatomyIssues(operation.presentationFamily, operation.blocks), [], `${prompt}: the blocks break the ${operation.presentationFamily} anatomy`);
    if (execution.status !== 'ANSWERED' && execution.status !== 'PARTIAL') continue;
    const result = attachAskAuthoritativeSourceEvidence(operation, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
    const out = validateAskAnswerTrustPipeline({ question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
    // When the pipeline withholds or replaces the answer, the replacement is a different result (it declares its own family, or none); only a delivered answer keeps this one.
    if (out.result.status === operation.status && out.result.blocks.some((block) => block.id === operation.blocks[0].id)) {
      assert.equal(out.result.presentationFamily, operation.presentationFamily, `${prompt}: the trust pipeline dropped the family`);
      assert.deepEqual(answerAnatomyIssues(out.result.presentationFamily, out.result.blocks), [], `${prompt}: the delivered blocks break the family`);
      checked += 1;
    }
  }
  assert.ok(checked >= 12, `only ${checked} answered turns were checked`);
});
