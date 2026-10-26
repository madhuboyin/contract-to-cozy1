const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// "What loss-prevention work matters most?" in Ask: the saved Risk Premium Optimizer plan, ranked. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { RiskPremiumOptimizerService } = require('../../src/services/riskPremiumOptimizer.service.ts');
const { resolveAskOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const plan = require('../../src/services/ask/support/riskMitigationPlan.ts');
const { riskMitigationPlanResult } = require('../../src/services/ask/handlers/riskMitigationPlan.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const driver = (over) => ({ code: 'D', title: 'Aging roof', detail: 'd', severity: 'HIGH', relatedPerils: ['WIND_HAIL'], ...over });
const item = (over) => ({
  id: 'i1', actionType: 'ROOF_INSPECTION', status: 'RECOMMENDED', priority: 'MEDIUM', targetPeril: 'WIND_HAIL', title: 'Inspect the roof', why: 'The roof is near the end of its life.',
  estimatedCost: 300, carrierBenefitStatus: 'UNKNOWN', carrierReviewQuestion: 'Does an inspection earn a credit?', professionalHelpLevel: 'PROFESSIONAL_RECOMMENDED',
  handoff: { kind: 'PROVIDER', label: 'Find a roofer', href: '/dashboard/x', safetyNote: 'Do not climb onto the roof.' }, ...over,
});
const money = (value) => `$${value}`;

test('the request names the plan or the work, routes to the new operation, and leaves the coverage review and comparison alone', () => {
  for (const yes of ['What loss-prevention work matters most?', 'Show my risk mitigation plan', 'What are my premium risk drivers?', 'How can I reduce my insurance risk?', 'show my loss prevention steps']) {
    assert.equal(plan.isRiskMitigationPlanRequest(yes), true, yes);
    assert.equal(resolveAskOperation(yes).operationId, 'RISK_MITIGATION_PLAN', yes);
  }
  for (const no of ['Show my coverage review', 'What questions should I ask my insurer?', 'Compare my insurance coverage options', 'Is my home at risk of flooding?', 'Show my claims', 'What is my home worth?']) {
    assert.equal(plan.isRiskMitigationPlanRequest(no), false, no);
    assert.notEqual(resolveAskOperation(no).operationId, 'RISK_MITIGATION_PLAN', no);
  }
  assert.equal(plan.RISK_MITIGATION_PLAN_MESSAGE, 'What loss-prevention work matters most?');
  const definition = getAskOperationDefinition('RISK_MITIGATION_PLAN');
  assert.deepEqual([definition.family, definition.executionMode, definition.adapterKey], ['RECORD_QUERY', 'DETERMINISTIC', 'risk-mitigation.plan']);
  assert.deepEqual([...definition.allowedBlockTypes].sort(), ['BOUNDARY', 'GROUPED_LIST', 'LIMITATION', 'SUMMARY']);
});

test('steps are ranked by the driver they address, then priority, then readiness, then cost; only open steps are ranked', () => {
  const drivers = [driver({ title: 'Aging roof', severity: 'HIGH', relatedPerils: ['WIND_HAIL'] }), driver({ title: 'Old wiring', severity: 'LOW', relatedPerils: ['ELECTRICAL'] }), driver({ title: 'Water history', severity: 'MEDIUM', relatedPerils: ['WATER'] })];
  const ranked = plan.rankMitigationPlanItems([
    item({ id: 'wiring-high', targetPeril: 'ELECTRICAL', priority: 'HIGH' }),
    item({ id: 'roof-low', targetPeril: 'WIND_HAIL', priority: 'LOW', professionalHelpLevel: 'DIY_ALLOWED' }),
    item({ id: 'water-med', targetPeril: 'WATER', priority: 'MEDIUM' }),
    item({ id: 'roof-med-pro', targetPeril: 'WIND_HAIL', priority: 'MEDIUM', professionalHelpLevel: 'QUALIFIED_PROFESSIONAL_REQUIRED' }),
    item({ id: 'roof-med-diy', targetPeril: 'WIND_HAIL', priority: 'MEDIUM', professionalHelpLevel: 'DIY_ALLOWED', estimatedCost: 90 }),
    item({ id: 'roof-med-diy-cheap', targetPeril: 'WIND_HAIL', priority: 'MEDIUM', professionalHelpLevel: 'DIY_ALLOWED', estimatedCost: 40 }),
    item({ id: 'done', status: 'COMPLETED', priority: 'HIGH' }), item({ id: 'skipped', status: 'SKIPPED' }),
    item({ id: 'no-peril', targetPeril: null, priority: 'HIGH' }),
  ], drivers).map((entry) => entry.id);
  assert.deepEqual(ranked, ['roof-med-diy-cheap', 'roof-med-diy', 'roof-med-pro', 'roof-low', 'water-med', 'wiring-high', 'no-peril'],
    'a HIGH-driver peril first (readiness then cost inside a priority), then a MEDIUM driver, then LOW or no driver; completed and skipped steps are not ranked');
  assert.deepEqual(plan.rankMitigationPlanItems([item({ id: 'a' }), item({ id: 'b' })], []).map((entry) => entry.id), ['a', 'b'], 'ties keep their order');
  assert.equal(plan.driverForPeril('WIND_HAIL', [driver({ severity: 'LOW' }), driver({ title: 'Big', severity: 'HIGH' })]).title, 'Big', 'the most serious driver that names the peril');
  assert.equal(plan.driverForPeril(null, drivers), null);
});

test('a row says what, why, which driver, what it costs, who can do it and what the carrier confirmed; it carries no link', () => {
  const [row] = plan.riskPlanRows([item({ carrierBenefitStatus: 'CONFIRMED_ELIGIBLE' })], [driver()], money);
  assert.equal(row.title, 'Inspect the roof');
  assert.equal(row.description, 'The roof is near the end of its life.');
  assert.deepEqual(row.meta, ['Medium priority', 'Wind and hail', 'Addresses: Aging roof', 'About $300', 'A professional is recommended', 'Carrier confirmed it is eligible for a credit']);
  assert.equal(row.href, null);
  assert.equal(row.countLabel, '1');
  assert.equal(row.detail, 'Ask your carrier: Does an inspection earn a credit?\nSafety: Do not climb onto the roof.');
  assert.ok(plan.riskPlanRows([item()], [], money)[0].meta.includes('Carrier credit not confirmed'), 'an unconfirmed credit is said to be unconfirmed');
  assert.equal(plan.riskPlanRows([item({ title: null })], [], money)[0].title, 'Roof inspection');
  assert.equal(plan.riskPlanRows([item({ estimatedCost: null, targetPeril: null })], [], money)[0].meta.some((entry) => /About/.test(entry)), false);
});

function withData({ primary = true, latest, error } = {}) {
  const saved = { p: prisma.property, g: RiskPremiumOptimizerService.prototype.getLatest, a: propertyAccess.resolvePropertyAccess };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  propertyAccess.resolvePropertyAccess = async () => ({ role: primary ? 'OWNER' : 'VIEWER', userId: 'user-1', propertyId: 'prop-1' });
  RiskPremiumOptimizerService.prototype.getLatest = async function () { if (error) throw error; return latest; };
  return () => { prisma.property = saved.p; RiskPremiumOptimizerService.prototype.getLatest = saved.g; propertyAccess.resolvePropertyAccess = saved.a; };
}
const analysis = (over = {}) => ({ exists: true, analysis: { status: 'READY', computedAt: '2026-10-01T00:00:00.000Z', summary: 'Two perils drive your premium.', premiumDrivers: [driver()], planItems: [item({ id: 'a', title: 'Inspect the roof' }), item({ id: 'b', title: 'Clear gutters', targetPeril: 'WATER', priority: 'LOW', professionalHelpLevel: 'DIY_ALLOWED' })], ...over } });

test('a prepared plan is answered with the first step named, the steps listed, the boundary, and no saving promised', async () => {
  const restore = withData({ latest: analysis() });
  try {
    const result = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(result.status, 'ANSWERED');
    assert.equal(result.blocks[0].title, 'Inspect the roof comes first');
    assert.match(result.blocks[0].body, /2 open steps, ranked by how serious the premium driver each one addresses is, then by priority, then by how ready you are to act\. Prepared/);
    const list = result.blocks.find((block) => block.id === 'risk-plan-steps');
    assert.deepEqual(list.sections[0].items.map((entry) => entry.title), ['Inspect the roof', 'Clear gutters']);
    assert.match(list.description, /not a saving/);
    const boundary = result.blocks.find((block) => block.id === 'risk-mitigation-boundary');
    assert.match(boundary.body, /Whether your carrier gives any credit for a step depends on the carrier/);
    assert.equal(JSON.stringify(result).includes('/dashboard/'), false, 'no desktop link is emitted');
    const allowed = new Set(getAskOperationDefinition('RISK_MITIGATION_PLAN').allowedBlockTypes);
    for (const block of result.blocks) { assert.ok(allowed.has(block.type), `${block.type} is allowed`); assert.ok(AskPresentationBlockSchema.safeParse(block).success, block.id); }
    result.parameters = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'risk-mitigation.plan', operationId: 'RISK_MITIGATION_PLAN', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } };
    const { result: validated } = validateAskAnswerTrust({ question: plan.RISK_MITIGATION_PLAN_MESSAGE, operationId: 'RISK_MITIGATION_PLAN', result, propertyId: 'prop-1' });
    assert.ok(validated.blocks.some((block) => block.id === 'risk-plan-steps'), 'the list survives the answer-trust validator');
    assert.ok(validated.blocks.some((block) => block.id === 'risk-mitigation-boundary'), 'and so does the boundary');
  } finally { restore(); }
});

test('every other state is stated plainly: not the primary owner, nothing prepared, a coverage conflict, an out-of-date plan, and a finished plan', async () => {
  let restore = withData({ primary: false, latest: analysis() });
  try {
    const blocked = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(blocked.reasonCode, 'RISK_PLAN_PRIMARY_OWNER_ONLY');
    assert.equal(JSON.stringify(blocked).includes('Inspect the roof'), false, 'nothing from the plan is shown');
    restore(); restore = withData({ latest: { exists: false } });
    const none = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(none.reasonCode, 'RISK_PLAN_NOT_PREPARED');
    assert.match(none.blocks[0].body, /not currently available in Ask.*not the same as having nothing to do/);
    restore(); restore = withData({ error: Object.assign(new Error('Resolve conflicting coverage records before using them for this decision.'), { code: 'COVERAGE_CONFLICT_REVIEW_REQUIRED' }) });
    const conflict = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(conflict.reasonCode, 'RISK_PLAN_COVERAGE_CONFLICT');
    assert.equal(conflict.blocks[0].actions[0].operationId, 'COVERAGE_REVIEW_STATUS');
    restore(); restore = withData({ error: new Error('boom') });
    await assert.rejects(() => riskMitigationPlanResult('user-1', 'prop-1'), /boom/, 'an unexpected failure is not disguised as an empty plan');
    restore(); restore = withData({ latest: analysis({ status: 'STALE' }) });
    const stale = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(stale.status, 'READY_WITH_LIMITATIONS');
    assert.ok(stale.blocks.some((block) => block.id === 'risk-plan-stale' && /may be out of date/.test(block.title)));
    restore(); restore = withData({ latest: analysis({ planRebuildRequired: true }) });
    assert.equal((await riskMitigationPlanResult('user-1', 'prop-1')).reasonCode, 'RISK_PLAN_MAY_BE_STALE');
    restore(); restore = withData({ latest: analysis({ planItems: [item({ status: 'COMPLETED' }), item({ id: 'z', status: 'SKIPPED' })] }) });
    const done = await riskMitigationPlanResult('user-1', 'prop-1');
    assert.equal(done.blocks[0].title, 'Every loss-prevention step in your plan is done or set aside');
    assert.equal(done.blocks.some((block) => block.id === 'risk-plan-steps'), false);
  } finally { restore(); }
});
