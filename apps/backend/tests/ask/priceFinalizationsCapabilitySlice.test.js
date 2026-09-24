const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.67: PRICE_FINALIZATIONS_LIST (Price Finalization), the eighteenth new Ask operation for
// a capability the Appendix D audit found with none. The real listForProperty runs against fake prisma models: its access
// check reads through the swappable prisma export, and its list reads through a module-level alias of the real client.

const prismaModule = require('../../src/lib/prisma.ts');
const { priceFinalizationsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');

const PAGE = '/dashboard/properties/p1/tools/price-finalization';
const NOTE = 'Call back after 5pm';
const originals = { prisma: prismaModule.prisma };
let queries;

const row = (id, overrides = {}) => ({
  id, propertyId: 'p1', createdByUserId: 'u1', inventoryItemId: null, guidanceJourneyId: null, guidanceStepKey: null, guidanceSignalIntentFamily: null,
  sourceType: 'MANUAL', status: 'DRAFT', serviceCategory: null, vendorName: null, acceptedPrice: null, quotePrice: null, currency: 'USD',
  scopeSummary: null, paymentTerms: null, warrantyTerms: null, timelineTerms: null, notes: NOTE, acceptedTermsJson: null, metadataJson: null,
  negotiationShieldCaseId: null, serviceRadarCheckId: null, quoteComparisonWorkspaceId: null, finalizedAt: null, bookingId: null,
  createdAt: new Date('2026-09-20T12:00:00.000Z'), updatedAt: new Date('2026-09-20T12:00:00.000Z'), terms: [], ...overrides,
});
const rows = () => [
  row('electric', {
    status: 'FINALIZED', vendorName: 'Bright Electric', serviceCategory: 'ELECTRICAL', acceptedPrice: 2400, quotePrice: 2800, sourceType: 'QUOTE_COMPARISON',
    scopeSummary: 'Panel upgrade to 200A', paymentTerms: '50% upfront', warrantyTerms: '1 year labor', timelineTerms: 'Two days',
    finalizedAt: new Date('2026-09-12T12:00:00.000Z'), bookingId: 'b1',
  }),
  row('paint', { vendorName: 'Pro Painters', serviceCategory: 'PAINTING', acceptedPrice: 1250.5, quotePrice: 1250.5 }),
  row('old', { status: 'ARCHIVED' }),
];

function install({ owner = true, data = rows() } = {}) {
  queries = [];
  prismaModule.prisma = { property: { findFirst: async (query) => { queries.push(['property', query]); return owner ? { id: 'p1' } : null; } } };
  Object.defineProperty(originals.prisma, 'priceFinalization', { configurable: true, value: { findMany: async (query) => { queries.push(['list', query]); return data; } } });
}

test.beforeEach(() => install());
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  delete originals.prisma.priceFinalization;
});

const invoke = (role = 'OWNER') => capabilityInvoke('PRICE_FINALIZATIONS_LIST', { userId: 'u1', propertyId: 'p1', message: 'Show my price finalizations' }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });

test('the operation runs the page\'s query: primary owner only, this property, newest first, 20 records', async () => {
  const result = await invoke();
  assert.equal(result.reasonCode, 'PRICE_FINALIZATIONS_READY');
  assert.deepEqual(queries[0][1].where, { id: 'p1', homeownerProfile: { userId: 'u1' } });
  const list = queries.find(([name]) => name === 'list')[1];
  assert.deepEqual(list.where, { propertyId: 'p1' });
  assert.deepEqual(list.orderBy, { createdAt: 'desc' });
  assert.equal(list.take, 20);
});

test('a household member who is not the primary owner is told so, not shown an error', async () => {
  install({ owner: false });
  const result = await invoke();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'PRICE_FINALIZATION_PRIMARY_OWNER_ONLY');
  assert.equal(result.blocks[0].title, 'Only the home\'s primary owner can see price finalizations');
});

test('records are grouped by status with vendor, service, accepted and quoted price and the agreed terms; notes stay out', async () => {
  const result = await invoke();
  const [summary, list] = result.blocks;
  assert.equal(summary.title, '3 price finalizations recorded');
  assert.equal(summary.body, '1 finalized and 1 still a draft.');
  assert.equal(summary.actions[0].href, PAGE);
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((item) => item.title)]), [
    ['Finalized', ['Bright Electric']],
    ['Drafts', ['Pro Painters']],
    ['Archived', ['Unnamed vendor']],
  ]);
  const electric = list.sections[0].items[0];
  assert.equal(electric.description, 'Electrical · accepted $2,400 (quoted $2,800)');
  assert.deepEqual(electric.meta, ['Scope: Panel upgrade to 200A', 'Payment: 50% upfront', 'Warranty: 1 year labor', 'Timeline: Two days', 'Finalized Sep 12, 2026', 'Booked', 'From Quote Comparison']);
  assert.equal(electric.status, 'Finalized');
  assert.equal(list.sections[1].items[0].description, 'Painting · accepted $1,250.50');
  assert.equal(list.sections[2].items[0].status, 'Archived');
  assert.equal(list.sections[2].items[0].description, 'Service category not set · no accepted price');
  assert.equal(JSON.stringify(result).includes(NOTE), false);
  assert.equal(result.blocks.some((block) => block.id === 'price-finalization-limit'), false);
});

test('a full page of 20 is disclosed; nothing recorded is not an all-clear', () => {
  const full = priceFinalizationsFromView(Array.from({ length: 20 }, (_, index) => row(`r${index}`)), 'p1');
  assert.equal(full.blocks.find((block) => block.id === 'price-finalization-limit').title, 'Showing the 20 most recent');
  const none = priceFinalizationsFromView([], 'p1');
  assert.equal(none.reasonCode, 'PRICE_FINALIZATIONS_EMPTY');
  assert.equal(none.blocks[0].title, 'No price finalizations yet');
  assert.equal(none.blocks.at(-1).title, 'As recorded, not a signed contract');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', async () => {
  const raw = await invoke();
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'price-finalization.records', operationId: 'PRICE_FINALIZATIONS_LIST', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my price finalizations', operationId: 'PRICE_FINALIZATIONS_LIST', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'PRICE_FINALIZATIONS_LIST', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

test('agreed-price questions route here; finalizing, comparing, checking or booking is not claimed', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my price finalizations', 'What price did we agree with the plumber?', 'What price did we lock in with the electrician?']) {
    assert.equal(route(message).operation?.operationId, 'PRICE_FINALIZATIONS_LIST', message);
  }
  assert.equal(route('Compare my service quotes').operation?.operationId, 'QUOTE_COMPARISON_REVIEW');
  // Each of these matches the pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['What accepted price should I finalize?', 'Update the accepted terms for the roofer', 'Book the finalized price with the plumber']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'PRICE_FINALIZATIONS_LIST', false, message);
  }
});

test('the operation is fully registered: its own skill, the owner floor, the bridge, and the card launch', () => {
  const skill = getSkillForOperation('PRICE_FINALIZATIONS_LIST');
  assert.equal(skill.id, 'price-finalization');
  assert.equal(skill.authorizationFloor, 'OWNER');
  assert.equal(ASK_OPERATION_CAPABILITY.PRICE_FINALIZATIONS_LIST, 'price-finalization');
  const launch = capabilityCardLaunch('price-finalization').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PRICE_FINALIZATIONS_LIST');
});
