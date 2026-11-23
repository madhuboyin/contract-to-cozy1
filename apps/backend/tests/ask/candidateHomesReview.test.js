// BICC-4.1: the CANDIDATE_HOMES_REVIEW operation (a buyer's own candidate homes in conversation).
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { candidateHomesReviewResult, dimensionsNamedIn } = require('../../src/services/ask/handlers/candidateHomes.handler.ts');
const { candidatePropertyService } = require('../../src/services/ask/buyer/candidateProperty.service.ts');
const { ASK_OPERATION_DEFINITIONS, resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const home = (id, label, extra = {}) => ({ id, label, userId: 'u1', provenance: {}, ...extra });
const A = home('a', 'Maple St', { listPriceCents: 40000000, annualPropertyTaxCents: 600000, annualInsuranceCents: 180000, bedrooms: 3, downPaymentPercent: 20, closingCostPercent: 3, mortgageRatePercent: 6, mortgageTermMonths: 360 });
const B = home('b', 'Oak Ave', { listPriceCents: 35000000, annualPropertyTaxCents: 700000, annualInsuranceCents: null, bedrooms: 2 });

async function withHomes(homes, run) {
  const original = candidatePropertyService.list; const calls = [];
  candidatePropertyService.list = async (userId, status) => { calls.push([userId, status]); return homes; };
  try { await run(calls); } finally { candidatePropertyService.list = original; }
}
const tableOf = (result, id) => result.blocks.find((b) => b.id === id);
const text = (result) => JSON.stringify(result.blocks);

test('the operation is registered as a read that needs no property, scoped to the person, and uses only declared block types', () => {
  const def = ASK_OPERATION_DEFINITIONS.CANDIDATE_HOMES_REVIEW;
  assert.equal(def.requiresProperty, false);
  assert.equal(def.executionMode, 'DETERMINISTIC');
  assert.equal(def.family, 'RECORD_QUERY');
  assert.equal(def.adapterKey, 'candidate-homes.review');
  assert.equal(def.messageRoutable, true);
});

test('no homes: an honest empty state that assumes nothing, with no action that writes', async () => {
  await withHomes([], async (calls) => {
    const result = await candidateHomesReviewResult('u1', 'show my candidate homes');
    assert.equal(result.reasonCode, 'CANDIDATE_HOMES_NONE');
    assert.equal(result.blocks[0].type, 'EMPTY_STATE');
    assert.deepEqual(result.blocks[0].actions, []);
    assert.match(result.blocks[0].body, /Nothing is assumed/);
    assert.deepEqual(calls, [['u1', 'ACTIVE']], 'read for this person, active homes only');
  });
});

test('one home: its cost from the numbers entered, and an invitation to add a second, not a comparison', async () => {
  await withHomes([A], async () => {
    const result = await candidateHomesReviewResult('u1', 'show my candidate homes');
    assert.equal(result.reasonCode, 'CANDIDATE_HOMES_ONE');
    assert.equal(result.status, 'READY_WITH_LIMITATIONS');
    assert.match(result.blocks[0].title, /one home added: Maple St/);
    const cost = tableOf(result, 'candidate-homes-cost');
    assert.equal(cost.rows.find((r) => r.id === 'price').values.a, '$400,000');
    assert.equal(cost.rows.find((r) => r.id === 'cash').values.a, '$92,000');
    assert.ok(!tableOf(result, 'candidate-homes-compare'), 'one home is not compared');
    assert.match(text(result), /not a lender disclosure, quote or commitment/);
  });
});

test('two homes: a side-by-side table, "lowest" only where every home has the value, missing shown as Not entered, and no winner', async () => {
  await withHomes([A, B], async () => {
    const result = await candidateHomesReviewResult('u1', 'compare my candidate homes');
    assert.equal(result.reasonCode, 'CANDIDATE_HOMES_PARTIAL');
    const compare = tableOf(result, 'candidate-homes-compare');
    assert.deepEqual(compare.columns.map((c) => c.label), ['Compare', 'Maple St', 'Oak Ave']);
    const price = compare.rows.find((r) => r.id === 'listPriceCents').values;
    assert.deepEqual([price.a, price.b], ['$400,000', '$350,000 (lowest)']);
    const insurance = compare.rows.find((r) => r.id === 'annualInsuranceCents').values;
    assert.deepEqual([insurance.a, insurance.b], ['$1,800', 'Not entered']);
    assert.ok(!/\(lowest\)/.test(JSON.stringify(compare.rows.find((r) => r.id === 'annualInsuranceCents'))), 'no lowest on partial data');
    const tax = compare.rows.find((r) => r.id === 'annualPropertyTaxCents').values;
    assert.deepEqual([tax.a, tax.b], ['$6,000 (lowest)', '$7,000']);
    assert.match(text(result), /I do not pick a winner/);
    assert.doesNotMatch(text(result), /\b(?:best home|you should buy|recommend)/i);
    assert.match(tableOf(result, 'candidate-homes-cost').rows.find((r) => r.id === 'monthly').values.b, /Not entered/);
  });
});

test('the dimensions named in the question are the ones compared; none named means the default set', () => {
  assert.deepEqual(dimensionsNamedIn('Which of my candidate homes has the lowest property tax?'), ['annualPropertyTaxCents']);
  assert.deepEqual(dimensionsNamedIn('compare price and insurance and hoa'), ['listPriceCents', 'annualInsuranceCents', 'hoaMonthlyCents']);
  assert.ok(dimensionsNamedIn('compare my candidate homes').includes('listPriceCents'));
  assert.ok(dimensionsNamedIn('compare my candidate homes').length >= 5);
  assert.deepEqual(dimensionsNamedIn('how many bedrooms and bathrooms'), ['bedrooms', 'bathrooms']);
});

test('a named dimension narrows the table to it', async () => {
  await withHomes([A, B], async () => {
    const result = await candidateHomesReviewResult('u1', 'which candidate home has the lower property tax');
    assert.deepEqual(tableOf(result, 'candidate-homes-compare').rows.map((r) => r.id), ['annualPropertyTaxCents']);
  });
});

test('every block the operation can return is valid for the contract and allowed for the operation', async () => {
  const allowed = new Set(ASK_OPERATION_DEFINITIONS.CANDIDATE_HOMES_REVIEW.allowedBlockTypes);
  for (const homes of [[], [A], [A, B], [A, A && { ...A, id: 'c', label: 'Full', annualInsuranceCents: 1, listPriceCents: 1 }]]) {
    await withHomes(homes, async () => {
      const result = await candidateHomesReviewResult('u1', 'compare my candidate homes');
      for (const block of result.blocks) {
        assert.ok(allowed.has(block.type), `${block.type} is not declared`);
        assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block), block.id);
      }
      assert.deepEqual(result.suggestions, []);
    });
  }
});

test('nothing in the handler writes: it uses only the list read of the person\'s own homes', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/handlers/candidateHomes.handler.ts'), 'utf8');
  assert.doesNotMatch(source, /candidatePropertyService\.(?:create|update|archive|remove|removeAll)/);
  assert.doesNotMatch(source, /propertyId/, 'no property is read or required');
  assert.match(source, /registerCapabilityHandler\('candidate-homes\.review'/);
});

test('candidate questions reach the new operation and no existing buyer or homeowner operation is displaced', () => {
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  for (const m of ['Compare the homes I am thinking of buying', 'Show my candidate homes', 'How do my candidate homes compare on price?']) {
    assert.equal(resolveAskRoutingCascade(m, {}).operation.operationId, 'CANDIDATE_HOMES_REVIEW', m);
  }
  for (const m of ['How much does it cost to own my house', 'Show my maintenance tasks', 'Compare my loan estimates']) {
    assert.notEqual(resolveAskRoutingCascade(m, { propertyId: 'p1' }).operation.operationId, 'CANDIDATE_HOMES_REVIEW', m);
  }
  void resolveAskOperation;
});
