const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  savingsLifecycleSections,
  savingsEmptyCategories,
  savingsEmptyCategoriesSentence,
  savingsHeadlineMetrics,
  savingsRealizedSafeguardBlocks,
  savingsRelatedItems,
} = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const rows = (n, prefix) => Array.from({ length: n }, (_, index) => ({ id: `${prefix}-${index}`, title: `${prefix} ${index}`, description: 'd', meta: [], status: 'X', href: null }));
const empty = { items: [], count: 0 };

test('more than eight records stay reachable behind Show more with a matching count', () => {
  const sections = savingsLifecycleSections({ recurring: { items: rows(12, 'r'), count: 12 }, benefits: empty, inProgress: empty, realized: empty, related: empty });
  const recurring = sections.find((section) => section.id === 'recurring');
  assert.equal(recurring.items.length, 12);
  assert.equal(recurring.count, 12);
  assert.equal(recurring.initialVisibleCount, 8);
  assert.equal(sections.find((section) => section.id === 'benefits'), undefined, 'an empty category is not a section');
  const small = savingsLifecycleSections({ recurring: { items: rows(3, 'r'), count: 3 }, benefits: empty, inProgress: empty, realized: empty, related: empty });
  assert.equal(small[0].initialVisibleCount, undefined, 'three records need no Show more');
});

test('only categories with records are listed; the empty ones are named in one sentence', () => {
  const related = savingsRelatedItems([{ domain: 'COVERAGE', summary: '2 coverage gaps' }]);
  const sections = savingsLifecycleSections({ recurring: empty, benefits: empty, inProgress: empty, realized: empty, related: { items: related, count: 1 } });
  assert.deepEqual(sections.map((section) => section.id), ['related']);
  for (const section of sections) assert.equal(section.caption, undefined, 'no per-section empty caption');
  assert.deepEqual(savingsLifecycleSections({ recurring: empty, benefits: empty, inProgress: empty, realized: empty, related: empty }), []);
  const some = savingsLifecycleSections({ recurring: { items: rows(2, 'r'), count: 2 }, benefits: empty, inProgress: empty, realized: { items: rows(1, 'x'), count: 1 }, related: empty });
  assert.deepEqual(some.map((section) => section.id), ['recurring', 'realized']);
  assert.deepEqual(savingsEmptyCategories({ recurring: 2, benefits: 0, inProgress: 0, realized: 1 }), ['benefits and rebates', 'work in progress']);
  assert.equal(savingsEmptyCategoriesSentence(['benefits and rebates', 'work in progress']), 'Nothing is recorded yet for benefits and rebates or work in progress.');
  assert.equal(savingsEmptyCategoriesSentence(['realized savings']), 'Nothing is recorded yet for realized savings.');
  assert.equal(savingsEmptyCategoriesSentence(savingsEmptyCategories({ recurring: 1, benefits: 1, inProgress: 1, realized: 1 })), null);
  assert.match(savingsEmptyCategoriesSentence(savingsEmptyCategories({ recurring: 0, benefits: 0, inProgress: 0, realized: 0 })), /recurring-cost opportunities, benefits and rebates, work in progress or realized savings\.$/);
});

test('the headline tiles carry only what has data, and fewer than two is not a row', () => {
  const full = savingsHeadlineMetrics({ potentialAnnualSavings: 312, availableCount: 3, inProgressCount: 1, realizedCount: 2 });
  assert.equal(full.type, 'METRIC_ROW');
  assert.deepEqual(full.metrics.map((metric) => metric.label), ['Best recurring estimate', 'Ready to review', 'In progress', 'Realized']);
  assert.equal(full.metrics[0].value, '$312/year');
  assert.equal(full.metrics[0].tone, 'POSITIVE');
  assert.deepEqual(savingsHeadlineMetrics({ potentialAnnualSavings: 0, availableCount: 0, inProgressCount: 2, realizedCount: 0 }), null);
  assert.deepEqual(savingsHeadlineMetrics({ potentialAnnualSavings: 0, availableCount: 0, inProgressCount: 0, realizedCount: 0 }), null);
  assert.deepEqual(savingsHeadlineMetrics({ potentialAnnualSavings: 0, availableCount: 1, inProgressCount: 1, realizedCount: 0 }).metrics.map((metric) => metric.label), ['Ready to review', 'In progress']);
  assert.ok(AskPresentationBlockSchema.safeParse(full).success);
});

test('each related decision carries its own action', () => {
  const items = savingsRelatedItems([{ domain: 'PROPERTY_TAX', summary: 'a' }, { domain: 'COVERAGE', summary: 'b' }, { domain: 'REFINANCE', summary: 'c' }]);
  assert.deepEqual(items.map((item) => item.actions[0].operationId), ['PROPERTY_TAX_APPEAL_READINESS', 'COVERAGE_GAPS', 'REFINANCE_ANALYSIS']);
  assert.equal(new Set(items.map((item) => item.actions[0].id)).size, 3);
});

test('realized totals are grouped per currency with the verified amount and no cross-currency sum', () => {
  const [metrics, ...rest] = savingsRealizedSafeguardBlocks({
    realizedValueByCurrency: { USD: 1500, EUR: 200 }, verifiedValueByCurrency: { USD: 500 }, exclusionConflicts: [],
  });
  assert.equal(metrics.type, 'METRIC_ROW');
  assert.deepEqual(metrics.metrics.map((metric) => metric.label), ['USD', 'EUR']);
  assert.match(metrics.metrics[0].detail, /\$500 independently verified/);
  assert.match(metrics.metrics[1].detail, /EUR 0 independently verified/);
  assert.equal(rest.length, 0);
  assert.equal(savingsRealizedSafeguardBlocks({ realizedValueByCurrency: {}, verifiedValueByCurrency: {}, exclusionConflicts: [] }).length, 0);
});

test('mutually exclusive realized programs raise a separate caution that keeps the total whole', () => {
  const blocks = savingsRealizedSafeguardBlocks({
    realizedValueByCurrency: { USD: 100 }, verifiedValueByCurrency: {}, exclusionConflicts: [{ exclusionGroupKey: 'g', itemIds: ['a', 'b'] }],
  });
  const caution = blocks.find((block) => block.id === 'savings-exclusion-conflicts');
  assert.equal(caution.tone, 'CAUTION');
  assert.match(caution.body, /still includes every recorded amount/);
  for (const block of blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success);
});

test('related-row actions survive the answer-trust validator', () => {
  const related = savingsRelatedItems([{ domain: 'PROPERTY_TAX', summary: 'a' }, { domain: 'COVERAGE', summary: 'b' }, { domain: 'REFINANCE', summary: 'c' }]);
  const sections = savingsLifecycleSections({ recurring: empty, benefits: empty, inProgress: empty, realized: empty, related: { items: related, count: 3 } });
  const result = { status: 'ANSWERED', blocks: [
      { type: 'SUMMARY', id: 'savings-summary', title: 'Here is the current savings picture for this home', body: 'Estimates are planning signals.', tone: 'DEFAULT', actions: [] },
      ...savingsRealizedSafeguardBlocks({ realizedValueByCurrency: { USD: 100 }, verifiedValueByCurrency: {}, exclusionConflicts: [{ exclusionGroupKey: 'g', itemIds: ['a', 'b'] }] }),
      { type: 'GROUPED_LIST', id: 'savings-opportunity-groups', title: 'Savings and benefits', filters: [], sections, actions: [] }], suggestions: [],
    parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'savings.opportunities', operationId: 'SAVINGS_OPPORTUNITIES', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Where could I save money on this home?', operationId: 'SAVINGS_OPPORTUNITIES', result, propertyId: 'p1' });
  const kept = validated.blocks.find((block) => block.id === 'savings-opportunity-groups').sections.find((section) => section.id === 'related').items.flatMap((item) => item.actions ?? []);
  assert.equal(kept.length, 3);
  assert.ok(validated.blocks.some((block) => block.type === 'METRIC_ROW'), 'the totals block is allowed for this operation');
});

test('an answer with the headline row, a populated list and the related actions survives the answer-trust validator', () => {
  const related = savingsRelatedItems([{ domain: 'COVERAGE', summary: 'b' }]);
  const sections = savingsLifecycleSections({ recurring: { items: rows(2, 'r'), count: 2 }, benefits: empty, inProgress: empty, realized: empty, related: { items: related, count: 1 } });
  const result = { status: 'ANSWERED', blocks: [
    { type: 'SUMMARY', id: 'savings-summary', title: 'Here is the current savings picture for this home', body: 'Estimates are planning signals.', tone: 'DEFAULT', actions: [] },
    savingsHeadlineMetrics({ potentialAnnualSavings: 100, availableCount: 2, inProgressCount: 0, realizedCount: 0 }),
    { type: 'GROUPED_LIST', id: 'savings-opportunity-groups', title: 'By category', description: savingsEmptyCategoriesSentence(['benefits and rebates']), filters: [], sections, actions: [] },
  ], suggestions: [],
  parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'savings.opportunities', operationId: 'SAVINGS_OPPORTUNITIES', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Where could I save money on this home?', operationId: 'SAVINGS_OPPORTUNITIES', result, propertyId: 'p1' });
  assert.ok(validated.blocks.some((block) => block.id === 'savings-headline'));
  assert.ok(validated.blocks.some((block) => block.id === 'savings-opportunity-groups'));
});
