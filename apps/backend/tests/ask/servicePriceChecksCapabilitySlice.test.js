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

const originals = { prisma: prismaModule.prisma, list: ServicePriceRadarService.prototype.listChecks, detail: ServicePriceRadarService.prototype.getCheckDetail };
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
  ServicePriceRadarService.prototype.getCheckDetail = originals.detail;
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
  Object.defineProperty(originals.prisma, 'serviceRadarCheck', { configurable: true, value: { findMany: async (query) => { queries.push(query); return []; }, count: async () => 0 } });
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
  assert.equal(rows[0].href, null);
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

test('every block and the boundary survive the answer-trust validator, and the in-Ask Check another quote action the whitelist for an owner but not a viewer', () => {
  const raw = servicePriceChecksFromView(checks(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'service-price-radar.checks', operationId: 'SERVICE_PRICE_CHECKS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my service price radar', operationId: 'SERVICE_PRICE_CHECKS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  const check = result.blocks[0].actions[0];
  assert.deepEqual([check.id, check.operationId, check.href], ['check-service-quote', 'SERVICE_PRICE_CHECK_RUN', undefined]);
  assert.equal(isAskActionApplicable({ action: check, operationId: 'SERVICE_PRICE_CHECKS', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionApplicable({ action: check, operationId: 'SERVICE_PRICE_CHECKS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), false);
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

// Saved-check detail (parity review 2026-10-26): the same operation, opened from a row with the check as the launch entity.
const detailCheck = (overrides = {}) => ({
  ...check('plumb'),
  explanationJson: { summary: 'x', reasonCodes: [], notes: [], limitations: [] },
  pricingFactorsJson: {
    property: { propertySize: 2000, yearBuilt: 1990, dwellingType: 'SINGLE_FAMILY' }, region: { city: 'Austin', state: 'TX' },
    benchmark: { matched: true, sourceName: 'Regional Cost Index', releaseVersion: '2026.2', regionType: 'METRO', regionKey: 'austin', observationStart: '2026-01-01T00:00:00.000Z', observationEnd: '2026-06-30T00:00:00.000Z', sampleSize: 140, unit: 'PER_JOB', methodologySummary: 'Median of completed jobs.', sourceUrl: 'https://example.org/index', expiresAt: '2027-01-01T00:00:00.000Z', retrievedAt: '2026-07-02T00:00:00.000Z', effectiveAt: '2026-07-01T00:00:00.000Z', percentileLow: 900, percentileHigh: 1500, normalizedScopeKey: 'plumbing:leak_fix', benchmarkId: 'bm-1', releaseId: 'rel-9' },
    confidence: { score: 0.7, band: 'MEDIUM' },
    adjustments: [{ code: 'OLDER_HOME', effect: 'up', multiplier: 1.08, note: 'Homes built before 2000 cost more to service.' }],
  },
  propertySnapshotJson: { systems: { roofType: 'ASPHALT_SHINGLE', hasDrainageIssues: true } },
  linkedEntities: [{ linkedEntityType: 'APPLIANCE', linkedEntityId: 'a1', relevanceScore: 1, label: 'Water heater', summary: 'Installed 2012' }],
  ...overrides,
});
const labelsOf = (result) => result.blocks.find((block) => block.type === 'GROUPED_LIST').sections[0].items;

test('every row opens its own check; the action names the same operation and the row carries the entity', async () => {
  const owner = await capabilityInvoke('SERVICE_PRICE_CHECKS', envelope, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  const rows = owner.blocks.find((block) => block.type === 'GROUPED_LIST').sections[0].items;
  for (const row of rows) {
    assert.equal(row.entityType, 'SERVICE_PRICE_CHECK');
    assert.deepEqual([row.actions[0].interactionType, row.actions[0].operationId], ['CONVERSATION_CONTINUE', 'SERVICE_PRICE_CHECKS']);
  }
});

test('detail shows provenance, confidence, adjustments, home facts and linked records; the launch entity selects the check', async () => {
  const seen = [];
  ServicePriceRadarService.prototype.getCheckDetail = async (...args) => { seen.push(args); return { check: detailCheck() }; };
  const result = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: 'Show the details of this quote check.', launchContext: { operationId: 'SERVICE_PRICE_CHECKS', surface: 'ASK_PAGE', entityType: 'SERVICE_PRICE_CHECK', entityId: 'plumb' } }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(seen, [['p1', 'plumb', 'u1']]);
  assert.equal(result.reasonCode, 'SERVICE_PRICE_CHECK_DETAIL_READY');
  const text = JSON.stringify(result.blocks);
  for (const needle of ['https://example.org/index', 'bm-1', 'rel-9', 'plumbing', '$900 to $1,500', 'Jan 1, 2027', 'Regional Cost Index', '2026.2', '140', '70%', 'Homes built before 2000', 'Water heater', 'Austin', 'asphalt shingle', 'Drainage issues']) assert.ok(text.includes(needle), needle);
  assert.equal(/"href":"/.test(text), false);
  const result2 = { ...result, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'service-price-radar.checks', operationId: 'SERVICE_PRICE_CHECKS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show the details of this quote check.', operationId: 'SERVICE_PRICE_CHECKS', result: result2, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
});

test('a check without a qualified benchmark says so and omits the benchmark section; a missing check is not applicable', async () => {
  ServicePriceRadarService.prototype.getCheckDetail = async () => ({ check: detailCheck({ verdict: 'INSUFFICIENT_DATA', expectedLow: null, expectedHigh: null, pricingFactorsJson: { benchmark: { matched: false } }, propertySnapshotJson: null, explanationJson: { limitations: ['No current, reviewed benchmark with complete provenance was available.'] }, linkedEntities: [] }) });
  const launchContext = { operationId: 'SERVICE_PRICE_CHECKS', surface: 'ASK_PAGE', entityType: 'SERVICE_PRICE_CHECK', entityId: 'roof' };
  const msg = 'Show the details of this quote check.';
  const rough = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: msg, launchContext }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  const ids = labelsOf(rough).map((row) => row.id);
  assert.deepEqual(ids, ['result']);
  assert.ok(JSON.stringify(rough.blocks).includes('Rough planning range only'));
  assert.ok(rough.blocks.some((block) => block.type === 'LIMITATION'));
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  ServicePriceRadarService.prototype.getCheckDetail = async () => { throw new APIError('nf', 404, 'SERVICE_RADAR_CHECK_NOT_FOUND'); };
  const missing = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: msg, launchContext }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(missing.reasonCode, 'SERVICE_PRICE_CHECK_NOT_FOUND');
});

test('a linked record on the detail opens the checks tied to it; a record with none says so', async () => {
  const seen = [];
  ServicePriceRadarService.prototype.listChecks = async (...args) => { seen.push(args); return { items: [check('plumb')], totalCount: 1 }; };
  const launchContext = { operationId: 'SERVICE_PRICE_CHECKS', surface: 'ASK_PAGE', entityType: 'APPLIANCE', entityId: 'a1' };
  const msg = 'Show the quote checks for this record.';
  const found = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: msg, launchContext }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(seen, [['p1', 'u1', { limit: 12, linkedEntityType: 'APPLIANCE', linkedEntityId: 'a1' }]]);
  assert.equal(found.blocks[0].title, '1 quote check for this record');
  ServicePriceRadarService.prototype.listChecks = async () => ({ items: [], totalCount: 0 });
  const none = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: msg, launchContext }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(none.reasonCode, 'SERVICE_PRICE_RADAR_NO_CHECKS_FOR_RECORD');
  ServicePriceRadarService.prototype.getCheckDetail = async () => ({ check: { ...check('plumb'), explanationJson: null, pricingFactorsJson: null, linkedEntities: [{ linkedEntityType: 'APPLIANCE', linkedEntityId: 'a1', relevanceScore: 1, label: 'Water heater', summary: null }] } });
  const detail = await capabilityInvoke('SERVICE_PRICE_CHECKS', { ...envelope, message: 'Show the details of this quote check.', launchContext: { operationId: 'SERVICE_PRICE_CHECKS', surface: 'ASK_PAGE', entityType: 'SERVICE_PRICE_CHECK', entityId: 'plumb' } }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });
  const action = labelsOf(detail).find((row) => row.id.startsWith('linked-')).actions[0];
  assert.deepEqual([action.operationId, action.entityType, action.entityId, action.message], ['SERVICE_PRICE_CHECKS', 'APPLIANCE', 'a1', msg]);
});
