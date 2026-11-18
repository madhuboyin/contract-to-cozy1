const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { findAmountComparisons, withUnappliedAmountComparison } = require('../../src/services/ask/semantic/amountComparison.ts');
const { executeSemanticSlice } = require('../../src/services/ask/semantic/slice/sliceExecutor.ts');
const { SLICE_SEEDED_PROPERTY_SNAPSHOT, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice/index.ts');
const { verifySemanticReadReceiptEntailment } = require('../../src/services/ask/semantic/semanticReceiptEntailment.ts');
const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

// Live prompt #2: "show maintenance tasks due next month that cost more than $50" listed every task due next month, with no sign that the cost condition was dropped.
test('an amount comparison is detected; a time window or a bare number is not', () => {
  const texts = (m) => findAmountComparisons(m).map((c) => c.text);
  assert.deepEqual(texts('show maintenance tasks due next month that cost more than $50'), ['more than $50']);
  assert.deepEqual(texts('which completed tasks cost over $1,000?'), ['over $1,000']);
  assert.deepEqual(texts('items worth under 500 dollars'), ['under 500 dollars']);
  assert.deepEqual(texts('replacement cost at least $2k and under $10,000'), ['at least $2k', 'under $10,000']);
  for (const m of ['which appliances have I not serviced in over 2 years', 'more than 18 months ago', 'older than 10 years', 'show tasks due in 5 days', 'it cost $50', 'tasks 50 and over']) {
    assert.deepEqual(findAmountComparisons(m), [], m);
  }
});

test('a typed answer to a question that also compared an amount is labelled partial, and its receipt still entails', () => {
  const answered = executeSemanticSlice({ rawText: 'which appliances have no warranty', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.equal(answered.status, 'ANSWERED');
  const wrapped = withUnappliedAmountComparison(answered, 'which appliances have no warranty that cost over $500');
  assert.equal(wrapped.status, 'READY_WITH_LIMITATIONS');
  const first = wrapped.blocks.find((b) => b.type === 'SUMMARY');
  assert.deepEqual(first, answered.blocks.find((b) => b.type === 'SUMMARY'), 'the receipt-bound summary stays intact');
  const limitation = wrapped.blocks.find((b) => b.type === 'LIMITATION');
  assert.equal(limitation.title, 'Amount filter not applied');
  assert.match(limitation.body, /I couldn’t apply “over \$500”/);
  assert.equal(verifySemanticReadReceiptEntailment(wrapped).outcome, 'PASS');
});

test('nothing changes without an amount comparison, or for a result that is not an answer', () => {
  const answered = executeSemanticSlice({ rawText: 'which appliances have no warranty', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.equal(withUnappliedAmountComparison(answered, 'which appliances have no warranty'), answered);
  const clarification = { ...answered, status: 'NEEDS_CLARIFICATION' };
  assert.equal(withUnappliedAmountComparison(clarification, 'anything over $500'), clarification);
});

test('a cross-domain answer keeps its month window and says the cost condition was not applied', async () => {
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'show maintenance tasks due next month', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  const wrapped = withUnappliedAmountComparison(X.buildOperationResultFromCrossDomainExecution(execution), 'show maintenance tasks due next month that cost more than $50');
  const limitation = wrapped.blocks.find((b) => b.type === 'LIMITATION');
  assert.match(limitation.body, /I couldn’t apply “more than \$50”/);
  assert.match(JSON.stringify(wrapped.blocks), /due in [A-Z][a-z]+ \d{4}|No maintenance tasks are due in [A-Z][a-z]+ \d{4}/);
});

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

test('the live prompt through the real handler is labelled partial, not presented as the answer', async () => {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => (model === 'then' ? undefined : model === 'property' ? { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) } : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  const result = await capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'show maintenance tasks due next month that cost more than $50' });
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.match(JSON.stringify(result.blocks), /I couldn’t apply “more than \$50”/);
});
