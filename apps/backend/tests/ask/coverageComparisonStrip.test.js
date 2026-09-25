const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-016, FRD v1.86): the coverage comparison as a strip. The real
// COVERAGE_COMPARISON_STATUS handler runs against a stubbed comparison read and household lookup.

const prismaModule = require('../../src/lib/prisma.ts');
const { coverageComparisonStrip } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const coverageComparison = require('../../src/services/coverageComparison.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, read: coverageComparison.getOrCreateCoverageComparison, access: propertyAccess.resolvePropertyAccess };
let options;
test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  coverageComparison.getOrCreateCoverageComparison = async () => ({
    state: 'READY',
    comparison: { id: 'cmp-1', status: 'OPEN', equivalenceStatus: 'NON_EQUIVALENT', options, decisions: [] },
  });
});
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  coverageComparison.getOrCreateCoverageComparison = originals.read;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const option = (id, optionType, overrides = {}) => ({
  id, optionType, label: optionType === 'CURRENT_POLICY' ? 'Current policy' : `Quote ${id}`, carrierName: optionType === 'CURRENT_POLICY' ? 'Acme Mutual' : 'Harbor Insurance',
  annualPremium: '1800.00', currency: 'USD', equivalenceStatus: optionType === 'CURRENT_POLICY' ? 'BASELINE' : 'NON_EQUIVALENT',
  materialUnknownsJson: [], tradeoffsJson: [], ...overrides,
});
const invoke = () => capabilityInvoke('COVERAGE_COMPARISON_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Compare my current insurance policy against alternatives' }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });

test('two to four options become a strip: premium declared as an amount, protection status, differences and facts to confirm, no badge or leading mark', () => {
  const block = coverageComparisonStrip([
    option('cur', 'CURRENT_POLICY'),
    option('q1', 'QUOTE_DOCUMENT', { annualPremium: '1500.00', tradeoffsJson: [{ factKey: 'deductible' }, { factKey: 'liability' }], materialUnknownsJson: [{ factKey: 'wind' }] }),
    option('q2', 'POLICY_TERM', { equivalenceStatus: 'EQUIVALENT', annualPremium: null }),
  ]);
  assert.equal(block.id, 'coverage-comparison-options');
  assert.deepEqual(block.options.map((entry) => entry.amount), [{ value: 1800, currency: 'USD' }, { value: 1500, currency: 'USD' }, null]);
  const attributes = (index) => Object.fromEntries(block.options[index].attributes.map((attribute) => [attribute.label, attribute.value]));
  assert.deepEqual(attributes(0), { 'Annual premium': '$1,800/yr', 'Protection compared with current': 'Current policy' });
  assert.deepEqual(attributes(1), { 'Annual premium': '$1,500/yr', 'Protection compared with current': 'Different protection', 'Differences found': '2 differences', 'Facts to confirm': '1 unconfirmed' });
  assert.equal(attributes(2)['Annual premium'], 'Premium not recorded');
  assert.equal(block.options[2].attributes[1].tone, 'POSITIVE');
  assert.equal(block.options[0].summary, 'Your current verified policy');
  assert.equal(block.options[1].summary, 'Harbor Insurance');
  for (const entry of block.options) {
    assert.equal(entry.badge, undefined);
    assert.equal(entry.badges, undefined);
    assert.ok(entry.attributes.every((attribute) => attribute.leading === undefined));
  }
  AskPresentationBlockSchema.parse(block);
});

test('one option, or five and more, keep the grouped list', () => {
  assert.equal(coverageComparisonStrip([option('cur', 'CURRENT_POLICY')]), null);
  assert.equal(coverageComparisonStrip(Array.from({ length: 5 }, (_, index) => option(String(index), index ? 'QUOTE_DOCUMENT' : 'CURRENT_POLICY'))), null);
});

test('the real handler declares the strip for the current policy plus an alternative, and the answer checker keeps it', async () => {
  options = [option('cur', 'CURRENT_POLICY'), option('q1', 'QUOTE_DOCUMENT', { label: 'HO3_STANDARD_QUOTE' })];
  const result = await invoke();
  assert.deepEqual(result.blocks.map((block) => `${block.type}:${block.id}`), ['SUMMARY:coverage-comparison-summary', 'COMPARISON:coverage-comparison-options']);
  const checked = validateAskAnswerTrustPipeline({
    question: 'Compare my current insurance policy against alternatives', operationId: 'COVERAGE_COMPARISON_STATUS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('COVERAGE_COMPARISON_STATUS')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'COMPARISON'));
});

test('a policy alone stays a grouped list', async () => {
  options = [option('cur', 'CURRENT_POLICY')];
  const result = await invoke();
  assert.equal(result.blocks.find((block) => block.id === 'coverage-comparison-options').type, 'GROUPED_LIST');
});

test('COMPARISON is allowed for the operation in the registry and the coverage skill', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.ok(ASK_OPERATION_DEFINITIONS.COVERAGE_COMPARISON_STATUS.allowedBlockTypes.includes('COMPARISON'));
  const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
  assert.ok(getSkillForOperation('COVERAGE_COMPARISON_STATUS').allowedResultBlocks.includes('COMPARISON'));
});
