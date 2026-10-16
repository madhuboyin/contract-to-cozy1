const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Coverage batch of the handler sweep (docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md, "Handler sweep"). Ask never links to a
// desktop page (owner decision, 2026-10-10): the coverage review rows open the inline inventory record, and the comparison answer says what
// Ask cannot do instead of pointing at the Coverage Options page. The real registered handlers run against stubbed services.

require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const gapService = require('../../src/services/coverageGap.service.ts');
const comparisonService = require('../../src/services/coverageComparison.service.ts');

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { gaps: gapService.getCoverageReviewItems, comparison: comparisonService.findCoverageComparison, prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess };
test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  gapService.getCoverageReviewItems = originals.gaps;
  comparisonService.findCoverageComparison = originals.comparison;
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const access = (role = 'OWNER') => ({ propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const reviewItem = (id, overrides = {}) => ({
  inventoryItemId: id, itemName: `Item ${id}`, group: 'NO_COVERAGE', detail: 'No policy or warranty is linked.', roomName: 'Kitchen', itemCategory: 'APPLIANCE',
  exposureCents: 120000, currency: 'USD', replacementValueSource: 'RECORDED', expiryDate: null, coverageSources: [], missingContext: [],
  responsibilityScope: 'OWNER', propertyId: 'p1', updatedAt: new Date('2026-09-01T12:00:00.000Z'), ...overrides,
});

test('coverage review rows open the inline inventory record and carry no desktop link', async () => {
  gapService.getCoverageReviewItems = async () => [reviewItem('i1'), reviewItem('i2', { group: 'EXPIRED', expiryDate: new Date('2026-01-01') })];
  const result = await capabilityInvoke('COVERAGE_GAPS', { userId: 'u1', propertyId: 'p1', message: 'Which items have no coverage?' }, access());
  const list = result.blocks.find((block) => block.id === 'coverage-groups');
  const rows = list.sections.flatMap((section) => section.items);
  assert.equal(rows.length, 2);
  assert.deepEqual(list.collection, { sourceTotal: 2, fetchedCount: 2, deliveredCount: 2, nextPageAvailable: false, deliveryTruncated: false });
  for (const row of rows) {
    assert.equal(row.entityType, 'INVENTORY_ITEM', row.id);
    assert.equal(row.href, null, row.id);
  }
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('with no verified policy the comparison says adding one is not available in Ask, and links nowhere', async () => {
  comparisonService.findCoverageComparison = async () => ({ state: 'BASELINE_REQUIRED' });
  const result = await capabilityInvoke('COVERAGE_COMPARISON_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Should I switch my home insurance?' }, access());
  assert.equal(result.reasonCode, 'COVERAGE_COMPARISON_BASELINE_REQUIRED');
  assert.deepEqual(result.blocks[0].actions, []);
  assert.match(result.blocks[0].body, /not currently available in Ask/);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('a comparison with only the current policy, and one with options, carry no link and no "open the workspace" copy', async () => {
  const option = (id, type, overrides = {}) => ({ id, optionType: type, label: `Option ${id}`, carrierName: 'Acme', equivalenceStatus: 'EQUIVALENT', ...overrides });
  const comparison = (options, decisions = []) => ({ state: 'READY', comparison: { id: 'c1', status: 'OPEN', equivalenceStatus: 'EQUIVALENT', options, decisions } });
  for (const options of [[option('o1', 'CURRENT_POLICY')], [option('o1', 'CURRENT_POLICY'), option('o2', 'ALTERNATIVE'), option('o3', 'ALTERNATIVE')]]) {
    comparisonService.findCoverageComparison = async () => comparison(options);
    const result = await capabilityInvoke('COVERAGE_COMPARISON_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Compare my current insurance policy against alternatives' }, access());
    const text = JSON.stringify(result);
    assert.equal(text.includes('/dashboard/'), false);
    assert.equal(/open the workspace/i.test(text), false);
    assert.deepEqual(result.blocks.find((block) => block.id === 'coverage-comparison-summary').actions, []);
    for (const block of result.blocks) for (const section of block.sections ?? []) for (const item of section.items) assert.equal(item.href, null, item.id);
  }
  comparisonService.findCoverageComparison = async () => comparison([option('o1', 'CURRENT_POLICY')]);
  const baselineOnly = await capabilityInvoke('COVERAGE_COMPARISON_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Should I switch my home insurance?' }, access());
  assert.match(baselineOnly.blocks[0].body, /not currently available in Ask/);
});
