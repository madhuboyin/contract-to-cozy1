const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.56: NEGOTIATION_SHIELD_CASES (Negotiation Shield), the eighth new Ask operation for a
// capability the Appendix D audit found with none. The case list (negotiationShieldCaseList, which the service's
// listCasesForProperty delegates to) is stubbed for the answer tests; one test runs it against a fake prisma to pin the
// page's own query. The service itself is not loaded here, since its document parsing needs the native sharp module.

const prismaModule = require('../../src/lib/prisma.ts');
const { negotiationShieldCasesFromView, NEGOTIATION_SHIELD_ASK_LIMIT } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const caseListModule = require('../../src/services/negotiationShieldCaseList.ts');

const PAGE = '/dashboard/properties/p1/tools/negotiation-shield';
const DESCRIPTION = 'Contractor said the $18,400 price expires Friday';
const originals = { prisma: prismaModule.prisma, list: caseListModule.listNegotiationShieldCasesForProperty };
let calls;

const shieldCase = (id, overrides = {}) => ({
  id, propertyId: 'p1', createdByUserId: 'u1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'DRAFT', title: `Case ${id}`,
  description: DESCRIPTION, sourceType: 'MANUAL', perspective: 'HOMEOWNER', analysisVersion: null, latestAnalysisAt: null,
  quoteDecisionWorkspaceId: null, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z', ...overrides,
});
const cases = () => [
  shieldCase('roof', { title: 'Roof replacement quote', status: 'ANALYZED', latestAnalysisAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z' }),
  shieldCase('premium', { title: 'Homeowners premium increase', scenarioType: 'INSURANCE_PREMIUM_INCREASE', status: 'READY_FOR_REVIEW', updatedAt: '2026-09-15T12:00:00.000Z' }),
  shieldCase('buyer', { title: 'Seller repair ask', scenarioType: 'BUYER_INSPECTION_NEGOTIATION', perspective: 'BUYER', updatedAt: '2026-09-12T12:00:00.000Z' }),
  shieldCase('old', { title: 'Old HVAC quote', status: 'ARCHIVED', updatedAt: '2026-08-01T12:00:00.000Z' }),
];

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  caseListModule.listNegotiationShieldCasesForProperty = async (...args) => { calls.push(args); return cases(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  caseListModule.listNegotiationShieldCasesForProperty = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the page\'s case list behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my negotiation shield cases' };
  const viewer = await capabilityInvoke('NEGOTIATION_SHIELD_CASES', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1']]);
  assert.equal(viewer.reasonCode, 'NEGOTIATION_SHIELD_CASES_READY');
});

test('the real list query is the page\'s: this property, newest first', async () => {
  const queries = [];
  prismaModule.prisma = { negotiationShieldCase: { findMany: async (query) => { queries.push(query); return [shieldCase('roof', { updatedAt: new Date('2026-09-20T12:00:00.000Z') })]; } } };
  const listed = await originals.list('p1');
  assert.deepEqual(queries, [{ where: { propertyId: 'p1' }, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] }]);
  assert.equal(listed[0].title, 'Case roof');
  assert.equal(listed[0].updatedAt, '2026-09-20T12:00:00.000Z');
});

test('reviews are summarized by status and listed open then archived, with the page\'s labels and case links', () => {
  const result = negotiationShieldCasesFromView(cases(), 'p1');
  assert.equal(result.blocks[0].title, '3 open negotiation reviews');
  assert.equal(result.blocks[0].body, '1 ready for review, 1 analyzed, 1 in draft, 1 archived. Last updated Sep 20, 2026.');
  const list = result.blocks.find((block) => block.id === 'negotiation-shield-cases');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Open', ['Roof replacement quote', 'Homeowners premium increase', 'Seller repair ask']],
    ['Archived', ['Old HVAC quote']],
  ]);
  assert.deepEqual(list.sections[0].items[0].meta, ['Contractor quote review', 'Analyzed Sep 18, 2026', 'Updated Sep 20, 2026']);
  assert.equal(list.sections[0].items[0].status, 'Analyzed');
  assert.deepEqual(list.sections[0].items[2].meta, ['Buyer inspection negotiation', 'Buyer mode', 'Updated Sep 12, 2026']);
  assert.equal(list.sections[0].items[0].href, `${PAGE}?caseId=roof`);
  assert.equal(JSON.stringify(result).includes(DESCRIPTION), false);
});

test('more reviews than the limit are disclosed; no reviews is not an all-clear', () => {
  const many = Array.from({ length: NEGOTIATION_SHIELD_ASK_LIMIT + 2 }, (_, index) => shieldCase(`c${index}`));
  const result = negotiationShieldCasesFromView(many, 'p1');
  assert.equal(result.blocks.find((block) => block.id === 'negotiation-shield-limit').body, `There are ${NEGOTIATION_SHIELD_ASK_LIMIT + 2} reviews in all. The rest are on the Negotiation Shield page.`);
  assert.equal(result.blocks.find((block) => block.id === 'negotiation-shield-cases').sections[0].items.length, NEGOTIATION_SHIELD_ASK_LIMIT);
  const none = negotiationShieldCasesFromView([], 'p1');
  assert.equal(none.reasonCode, 'NEGOTIATION_SHIELD_NO_CASES');
  assert.equal(none.blocks[0].title, 'No Negotiation Shield reviews yet');
  assert.equal(none.blocks.at(-1).title, 'Preparation help, not legal or insurance advice');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = negotiationShieldCasesFromView(cases(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.cases', operationId: 'NEGOTIATION_SHIELD_CASES', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my negotiation shield cases', operationId: 'NEGOTIATION_SHIELD_CASES', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'NEGOTIATION_SHIELD_CASES', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('naming the tool routes here even about a quote; purchase negotiation and new comparisons do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
  for (const message of ['Show my negotiation shield cases', 'Open negotiation shield', 'Where do our negotiation reviews stand?', 'Show my negotiation shield case for the roof quote']) {
    assert.equal(route(message), 'NEGOTIATION_SHIELD_CASES', message);
  }
  assert.equal(route('What is the negotiation status for my closing?'), 'BUYER_NEGOTIATION_READINESS');
  // Each of these matches the generic "my negotiations" phrasing, so only the exclusion keeps them off this operation.
  for (const message of ['Where do my negotiations with the seller stand?', 'Compare my negotiations and quotes']) {
    assert.notEqual(route(message), 'NEGOTIATION_SHIELD_CASES', message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('NEGOTIATION_SHIELD_CASES').id, 'negotiation-shield');
  assert.equal(ASK_OPERATION_CAPABILITY.NEGOTIATION_SHIELD_CASES, 'negotiation-shield');
  const launch = capabilityCardLaunch('negotiation-shield').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'NEGOTIATION_SHIELD_CASES');
});
