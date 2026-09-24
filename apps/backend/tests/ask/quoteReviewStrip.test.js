const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-016, FRD v1.76): the quote review is the first comparison-strip
// adopter. Two to four quotes still in play become a COMPARISON block; one quote or five and more keep the table.
// "Lowest price" is the only badge and needs a COMPARABLE workspace. The real QUOTE_COMPARISON_REVIEW handler runs
// against a fake prisma and stubbed workspace reads.

const prismaModule = require('../../src/lib/prisma.ts');
const quoteService = require('../../src/services/quoteComparison.service.ts');
const { quoteReviewComparison, QUOTE_LOWEST_PRICE_BADGE } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');

const DAY = 86_400_000;
const now = new Date('2026-09-24T15:00:00.000Z');
const quote = (id, overrides = {}) => ({
  id, vendorName: `Vendor ${id}`, quoteAmount: 1000, currency: 'USD', decision: 'UNDECIDED', readinessStage: 'COMPARISON_READY',
  scopeSummary: 'Replace 30 squares of asphalt shingles', serviceLabelRaw: null, quoteDate: new Date(now.getTime() - 10 * DAY),
  expirationDate: null, missingFactsJson: [], terms: [], sourceType: 'MANUAL', createdAt: now, updatedAt: now, ...overrides,
});
const comparable = (ids) => ({ status: 'COMPARABLE', eligibleQuoteIds: ids, reasons: ['The confirmed proposals share the same category, work type, location, and itemized scope.'] });
const attr = (option, label) => option.attributes.find((attribute) => attribute.label === label);

test('two to four quotes still in play become a comparison; one, or five and more, return null so the table stays', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(quoteReviewComparison([quote('a')], comparable(['a']), now), null);
  assert.equal(quoteReviewComparison(ids.map((id) => quote(id)), comparable(ids), now), null);
  assert.equal(quoteReviewComparison(ids.slice(0, 2).map((id) => quote(id)), comparable(['a', 'b']), now).options.length, 2);
  assert.equal(quoteReviewComparison(ids.slice(0, 4).map((id) => quote(id)), comparable(ids.slice(0, 4)), now).options.length, 4);
  // Rejected quotes are left out before counting, and the description says how many.
  const withRejected = quoteReviewComparison([...ids.map((id) => quote(id)), quote('f', { decision: 'REJECTED' }), quote('g', { decision: 'REJECTED' })].slice(3), comparable(['d', 'e']), now);
  assert.deepEqual(withRejected.options.map((option) => option.id), ['d', 'e']);
  assert.match(withRejected.description, /2 rejected quotes are not shown; open the quote comparison to see them\./);
  assert.equal(quoteReviewComparison([quote('a'), quote('b', { decision: 'REJECTED' })], comparable(['a', 'b']), now), null);
  const oneRejected = quoteReviewComparison([quote('a'), quote('b'), quote('c', { decision: 'REJECTED' })], comparable(['a', 'b']), now);
  assert.match(oneRejected.description, /1 rejected quote is not shown; open the quote comparison to see it\./);
});

test('"Lowest price" goes to one comparison-ready quote only when the workspace is comparable, with its price marked leading', () => {
  const quotes = [quote('a', { quoteAmount: 12400 }), quote('b', { quoteAmount: 9800 }), quote('c', { quoteAmount: 7000, readinessStage: 'INCOMPLETE_QUOTE' })];
  const block = quoteReviewComparison(quotes, comparable(['a', 'b']), now);
  const [a, b, c] = block.options;
  // c is cheaper but not comparison ready, so b holds the badge.
  assert.deepEqual(b.badges, [QUOTE_LOWEST_PRICE_BADGE]);
  assert.equal(attr(b, 'Price').leading, true);
  for (const option of [a, c]) {
    assert.equal(option.badges, undefined);
    assert.equal(attr(option, 'Price').leading, undefined);
  }
  assert.deepEqual(b.amount, { value: 9800, currency: 'USD' });
  assert.equal(attr(b, 'Price').value, 'USD 9,800');
  assert.deepEqual(attr(a, 'Readiness'), { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' });
  assert.deepEqual(attr(c, 'Readiness'), { label: 'Readiness', value: 'incomplete quote', tone: 'CAUTION' });

  const noBadge = (label, candidate, comparability) => {
    const result = quoteReviewComparison(candidate, comparability, now);
    assert.equal(result.options.some((option) => option.badges || option.attributes.some((attribute) => attribute.leading)), false, label);
  };
  noBadge('not comparable', quotes, { status: 'NOT_COMPARABLE', eligibleQuoteIds: ['a', 'b'] });
  noBadge('needs more information', quotes, { status: 'NEEDS_MORE_INFORMATION', eligibleQuoteIds: ['a'] });
  noBadge('a tie', [quote('a', { quoteAmount: 500 }), quote('b', { quoteAmount: 500 })], comparable(['a', 'b']));
  noBadge('two currencies', [quote('a', { quoteAmount: 500 }), quote('b', { quoteAmount: 900, currency: 'CAD' })], comparable(['a', 'b']));
  // A rejected quote is not a candidate even when the comparability check still lists it.
  const rejectedCheapest = quoteReviewComparison([quote('a', { quoteAmount: 100, decision: 'REJECTED' }), quote('b', { quoteAmount: 900 }), quote('c', { quoteAmount: 800 })], comparable(['a', 'b', 'c']), now);
  assert.deepEqual(rejectedCheapest.options.find((option) => option.badges).id, 'c');
});

test('freshness mirrors the comparison page, and scope, warranty and missing facts come from the record', () => {
  const block = quoteReviewComparison([
    quote('expired', { expirationDate: new Date(now.getTime() - DAY), terms: [{ type: 'PAYMENT', value: '50% upfront' }, { type: 'WARRANTY', value: '10-year workmanship' }] }),
    quote('undated', { quoteDate: null, scopeSummary: null, serviceLabelRaw: 'Roof replacement' }),
    quote('old', { quoteDate: new Date(now.getTime() - 120 * DAY), scopeSummary: null, missingFactsJson: [{ key: 'a', label: 'Permit' }, { key: 'b', label: 'Disposal' }, { key: 'c', label: 'Cleanup' }, { key: 'd', label: 'Payment terms' }] }),
    quote('fresh', { quoteDate: new Date('2026-09-14T12:00:00Z'), expirationDate: new Date(now.getTime() + 20 * DAY) }),
  ], comparable(['expired', 'undated', 'old', 'fresh']), now);
  const [expired, undated, old, fresh] = block.options;
  assert.deepEqual(attr(expired, 'Freshness'), { label: 'Freshness', value: 'Expired Sep 23, 2026', tone: 'CAUTION' });
  assert.equal(attr(expired, 'Warranty').value, '10-year workmanship');
  assert.deepEqual(attr(undated, 'Freshness'), { label: 'Freshness', value: 'Quote date not recorded', tone: 'CAUTION' });
  assert.equal(attr(undated, 'Scope').value, 'Roof replacement');
  assert.deepEqual(attr(old, 'Freshness'), { label: 'Freshness', value: 'Quoted May 27, 2026, over 90 days ago', tone: 'CAUTION' });
  assert.deepEqual(attr(old, 'Scope'), { label: 'Scope', value: 'Scope not confirmed', tone: 'CAUTION' });
  assert.deepEqual(attr(old, 'Missing facts'), { label: 'Missing facts', value: 'Permit, Disposal, Cleanup and 1 more', tone: 'CAUTION' });
  assert.deepEqual(attr(fresh, 'Freshness'), { label: 'Freshness', value: 'Quoted Sep 14, 2026', tone: 'DEFAULT' });
  assert.deepEqual(attr(fresh, 'Warranty'), { label: 'Warranty', value: 'Not recorded', tone: 'DEFAULT' });
  assert.deepEqual(attr(fresh, 'Missing facts'), { label: 'Missing facts', value: 'None', tone: 'DEFAULT' });
  AskPresentationBlockSchema.parse(block);
});

const originals = { prisma: prismaModule.prisma, get: quoteService.getQuoteComparisonWorkspace, check: quoteService.getWorkspaceComparability };
function install(quotes, comparability) {
  prismaModule.prisma = new Proxy({
    quoteComparisonWorkspace: { findFirst: async () => ({ id: 'ws-1' }) },
  }, {
    get(target, model) {
      if (model === 'then') return undefined;
      if (model in target) return target[model];
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  quoteService.getQuoteComparisonWorkspace = async () => ({ id: 'ws-1', serviceCategory: 'ROOFING', inventoryItemId: null, updatedAt: now, quotes });
  quoteService.getWorkspaceComparability = async () => comparability;
}
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  quoteService.getQuoteComparisonWorkspace = originals.get;
  quoteService.getWorkspaceComparability = originals.check;
});
const invoke = () => capabilityInvoke('QUOTE_COMPARISON_REVIEW', { userId: 'u1', propertyId: 'p1', message: 'Compare my roofing quotes' }, {
  propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' },
});

test('the real handler emits the strip for three quotes, keeps the controls, and the answer checker passes it intact', async () => {
  install([quote('a', { vendorName: 'ACME_ROOFING', quoteAmount: 12400 }), quote('b', { vendorName: 'Summit Roofing', quoteAmount: 9800 }), quote('c', { vendorName: 'Budget Roofs', quoteAmount: 11000 })], comparable(['a', 'b', 'c']));
  const result = await invoke();
  assert.deepEqual(result.blocks.map((block) => `${block.type}:${block.id}`), [
    'SUMMARY:quote-review-summary', 'COMPARISON:quote-review-table', 'GROUPED_LIST:quote-review-gaps', 'EVIDENCE:quote-review-evidence', 'BOUNDARY:quote-review-boundary',
  ]);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const checked = validateAskAnswerTrustPipeline({
    question: 'Compare my roofing quotes', operationId: 'QUOTE_COMPARISON_REVIEW', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('QUOTE_COMPARISON_REVIEW')]),
  });
  assert.equal(checked.result.status, result.status);
  assert.notEqual(checked.trust.outcome, 'WITHHOLD');
  const strip = checked.result.blocks.find((block) => block.id === 'quote-review-table');
  assert.equal(strip.type, 'COMPARISON');
  // A provider name that looks like an enum is a record value, not Ask copy, and survives the check.
  assert.deepEqual(strip.options.map((option) => option.label), ['ACME_ROOFING', 'Summit Roofing', 'Budget Roofs']);
  assert.deepEqual(strip.options.find((option) => option.badges).label, 'Summit Roofing');
  assert.ok(checked.result.blocks.some((block) => block.id === 'quote-review-gaps'));
});

test('the real handler keeps the table for one quote and for five, with rejected quotes still listed there', async () => {
  install([quote('a')], { status: 'NEEDS_MORE_INFORMATION', eligibleQuoteIds: [], reasons: ['Add at least two proposals before checking comparability.'] });
  const one = await invoke();
  assert.equal(one.blocks.find((block) => block.id === 'quote-review-table').type, 'TABLE');
  const five = ['a', 'b', 'c', 'd'].map((id) => quote(id)).concat(quote('e'), quote('r', { decision: 'REJECTED' }));
  install(five, comparable(['a', 'b', 'c', 'd', 'e']));
  const table = (await invoke()).blocks.find((block) => block.id === 'quote-review-table');
  assert.equal(table.type, 'TABLE');
  assert.equal(table.rows.length, 6);
});

test('relevance: the quote review envelope passes as a typed answer (the table answer used to come back as a clarification), and only that envelope', async () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id) => quote(id));
  install(five, comparable(['a', 'b', 'c', 'd', 'e']));
  const table = await invoke();
  const relevance = (result) => validateAskSemanticAnswerRelevance({ question: 'Compare my roofing quotes', operationId: 'QUOTE_COMPARISON_REVIEW', result });
  assert.deepEqual(relevance(table).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  const checked = validateAskAnswerTrustPipeline({
    question: 'Compare my roofing quotes', operationId: 'QUOTE_COMPARISON_REVIEW', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(table, [completedAskAuthoritativeSourceEvidence('QUOTE_COMPARISON_REVIEW')]),
  });
  assert.equal(checked.result.status, table.status);
  // A foreign block, or a result without the review's own summary, falls back to ordinary scoring.
  const foreign = { ...table, blocks: [...table.blocks, { type: 'SUMMARY', id: 'maintenance-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] }] };
  assert.notDeepEqual(relevance(foreign).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  const headless = { ...table, blocks: table.blocks.filter((block) => block.id !== 'quote-review-summary') };
  assert.notDeepEqual(relevance(headless).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
});
