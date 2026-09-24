const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.60: SERVICE_PRICE_CHECKS (Service Price Radar), the twelfth new Ask operation for a
// capability the Appendix D audit found with none. listChecks is stubbed for the answer tests; the access tests run the
// real listChecks against a fake prisma to pin its primary-owner check and the page's query.

const prismaModule = require('../../src/lib/prisma.ts');
const { servicePriceChecksFromView, SERVICE_PRICE_RADAR_ASK_LIMIT } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { ServicePriceRadarService } = require('../../src/services/servicePriceRadar.service.ts');

const PAGE = '/dashboard/properties/p1/tools/service-price-radar';
const originals = { prisma: prismaModule.prisma, list: ServicePriceRadarService.prototype.listChecks };
let calls;

const check = (id, overrides = {}) => ({
  id, propertyId: 'p1', createdAt: '2026-09-20T12:00:00.000Z', status: 'COMPLETED', serviceCategory: 'PLUMBING', serviceSubcategory: 'WATER_LINE_REPAIR',
  serviceLabelRaw: null, quoteAmount: 1450, quoteCurrency: 'USD', quoteVendorName: 'Flow Pros', quoteSource: 'MANUAL',
  expectedLow: 900, expectedHigh: 1200, expectedMedian: 1050, verdict: 'HIGH', confidenceScore: 0.7, explanationShort: 'Above typical local pricing for this repair.', ...overrides,
});
const checks = () => [
  check('plumb'),
  check('windows', { serviceCategory: 'WINDOWS_DOORS', serviceSubcategory: null, quoteAmount: 800, expectedLow: 700, expectedHigh: 950, verdict: 'FAIR', quoteVendorName: null, createdAt: '2026-09-10T12:00:00.000Z', explanationShort: null }),
  check('roof', { serviceCategory: 'ROOFING', serviceSubcategory: null, quoteAmount: 3000, expectedLow: null, expectedHigh: null, verdict: 'INSUFFICIENT_DATA', createdAt: '2026-09-01T12:00:00.000Z' }),
];

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  ServicePriceRadarService.prototype.listChecks = async function (...args) { calls.push(args); return { items: checks() }; };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  ServicePriceRadarService.prototype.listChecks = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my service price radar' };

test('the operation reads the page\'s recent checks (limit 12) for the asking owner; a viewer or contributor is refused first', async () => {
  const owner = await capabilityInvoke('SERVICE_PRICE_CHECKS', envelope, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1', 'u1', { limit: 12 }]]);
  assert.equal(owner.reasonCode, 'SERVICE_PRICE_RADAR_CHECKS_READY');
  calls = [];
  for (const role of ['VIEWER', 'CONTRIBUTOR']) {
    const refused = await capabilityInvoke('SERVICE_PRICE_CHECKS', envelope, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
    assert.equal(refused.reasonCode, 'ASK_PERMISSION_REQUIRED', role);
  }
  assert.deepEqual(calls, []);
});

test('an owner listChecks refuses (not the primary homeowner profile) gets a plain answer, not an error', async () => {
  ServicePriceRadarService.prototype.listChecks = originals.list;
  const queries = [];
  prismaModule.prisma = { property: { findFirst: async (query) => { queries.push(query); return null; } } };
  const result = await capabilityInvoke('SERVICE_PRICE_CHECKS', envelope, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(queries[0].where, { id: 'p1', homeownerProfile: { userId: 'u1' } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'SERVICE_PRICE_RADAR_PRIMARY_OWNER_ONLY');
  assert.equal(result.blocks[0].title, 'Only the home\'s primary owner can see quote checks');
});

test('the real list query is the page\'s: this property, newest first, the limit given', async () => {
  ServicePriceRadarService.prototype.listChecks = originals.list;
  const queries = [];
  prismaModule.prisma = { property: { findFirst: async () => ({ id: 'p1', homeownerProfileId: 'hp1' }) } };
  // The service reads checks through a module-level alias of the real client (prismaAny), so stub that client's model.
  Object.defineProperty(originals.prisma, 'serviceRadarCheck', { configurable: true, value: { findMany: async (query) => { queries.push(query); return []; } } });
  try {
    await new ServicePriceRadarService().listChecks('p1', 'u1', { limit: 12 });
  } finally {
    delete originals.prisma.serviceRadarCheck;
  }
  assert.deepEqual(queries[0].where, { propertyId: 'p1' });
  assert.deepEqual(queries[0].orderBy, [{ createdAt: 'desc' }]);
  assert.equal(queries[0].take, 12);
});

test('checks are listed with the page\'s verdict and category labels, quote and expected range', () => {
  const result = servicePriceChecksFromView(checks(), 'p1');
  assert.equal(result.blocks[0].title, '3 recent quote checks');
  assert.equal(result.blocks[0].body, '1 quote looks above the expected range. Latest checked Sep 20, 2026.');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const rows = result.blocks.find((block) => block.id === 'service-price-radar-checks').sections[0].items;
  assert.deepEqual(rows.map((row) => [row.title, row.status, row.meta]), [
    ['Plumbing · Water Line Repair', 'Above range', ['Quote $1,450', 'Expected $900 to $1,200', 'Flow Pros', 'Checked Sep 20, 2026']],
    ['Windows & Doors', 'Fair', ['Quote $800', 'Expected $700 to $950', 'Checked Sep 10, 2026']],
    ['Roofing', 'Need more context', ['Quote $3,000', 'Broad range only', 'Flow Pros', 'Checked Sep 1, 2026']],
  ]);
  assert.equal(rows[0].description, 'Above typical local pricing for this repair.');
  assert.equal(rows[0].href, PAGE);
  assert.equal(result.blocks.some((block) => block.id === 'service-price-radar-limit'), false);
});

test('a full page of checks is disclosed; no checks is not an all-clear', () => {
  const full = servicePriceChecksFromView(Array.from({ length: SERVICE_PRICE_RADAR_ASK_LIMIT }, (_, index) => check(`c${index}`, { verdict: 'FAIR' })), 'p1');
  assert.equal(full.blocks.find((block) => block.id === 'service-price-radar-limit').title, 'Showing the 12 most recent checks');
  assert.equal(full.blocks[0].body.startsWith('None of them look above the expected range.'), true);
  const none = servicePriceChecksFromView([], 'p1');
  assert.equal(none.reasonCode, 'SERVICE_PRICE_RADAR_NO_CHECKS');
  assert.equal(none.blocks[0].title, 'No quote checks yet');
  assert.equal(none.blocks.at(-1).title, 'A price check, not a quote review');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = servicePriceChecksFromView(checks(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'service-price-radar.checks', operationId: 'SERVICE_PRICE_CHECKS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my service price radar', operationId: 'SERVICE_PRICE_CHECKS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'SERVICE_PRICE_CHECKS', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

test('price-check phrasing routes here; comparing quotes and running a new check are not claimed by the pattern', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my service price radar', 'Open the price radar', 'What did my past quote checks say?', 'Which of my price checks came in above the expected range?', 'What did the price radar say about our plumber quote?']) {
    assert.equal(route(message).operation?.operationId, 'SERVICE_PRICE_CHECKS', message);
  }
  assert.equal(route('Compare my service quotes').operation?.operationId, 'QUOTE_COMPARISON_REVIEW');
  // Each of these names price checks, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Run a new price check on the price radar', 'Start a quote check for my roof', 'Add a price check to the price radar']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'SERVICE_PRICE_CHECKS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('SERVICE_PRICE_CHECKS').id, 'service-price-radar');
  assert.equal(ASK_OPERATION_CAPABILITY.SERVICE_PRICE_CHECKS, 'service-price-radar');
  const launch = capabilityCardLaunch('service-price-radar').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'SERVICE_PRICE_CHECKS');
});
