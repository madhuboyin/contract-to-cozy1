const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.124: WARRANTY_LOOKUP (Warranties W-1), a deterministic read of the recorded warranties. The real
// registered `warranty.lookup` handler runs against a fake prisma; the pure answer builder is tested directly.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const {
  WARRANTY_EXPIRING_DAYS, warrantiesFromRecords, warrantyCalmCopy, warrantyDaysRemaining, warrantyFocus, warrantyStatus,
} = require('../../src/services/ask/handlers/warranties.handler.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');

const NOW = new Date('2026-09-26T12:00:00.000Z');
const day = (offset) => new Date(Date.UTC(2026, 8, 26 + offset));
const warranty = (id, overrides = {}) => ({
  id, propertyId: 'p1', providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: null,
  startDate: day(-400), expiryDate: day(200), updatedAt: new Date('2026-09-01T00:00:00.000Z'), inventoryItem: null, documents: [], ...overrides,
});
const BOUNDARY_TEXT = 'This reports the warranty information recorded in your Home Record. It does not determine whether a repair is covered or file a claim.';
const build = (message, records, overrides = {}) => warrantiesFromRecords({ message, propertyId: 'p1', records, canWrite: true, ownedIds: new Set(), now: NOW, ...overrides });
const summary = (result) => result.blocks.find((block) => block.id === 'warranty-summary');
const list = (result) => result.blocks.find((block) => block.id === 'warranty-results');
const items = (result) => list(result).sections[0].items;

test('status follows the Warranties page: the 60-day window, calendar days, and the governed evaluator for future and invalid dates', () => {
  assert.equal(WARRANTY_EXPIRING_DAYS, 60);
  const status = (overrides) => warrantyStatus(warranty('w', overrides), 'p1', NOW).key;
  assert.equal(status({ expiryDate: day(61) }), 'ACTIVE');
  assert.equal(status({ expiryDate: day(60) }), 'EXPIRING');
  assert.equal(status({ expiryDate: day(1) }), 'EXPIRING');
  assert.equal(status({ expiryDate: day(0) }), 'EXPIRING', 'expires today is still expiring, as on the page');
  assert.equal(status({ expiryDate: day(-1) }), 'EXPIRED');
  assert.equal(status({ startDate: day(5), expiryDate: day(400) }), 'STARTS_LATER');
  assert.equal(status({ startDate: day(-10), expiryDate: day(-10) }), 'NEEDS_REVIEW', 'an expiry that is not after the start needs review');
  assert.equal(status({ startDate: new Date('nope') }), 'NEEDS_REVIEW');
  assert.equal(warrantyDaysRemaining(day(45), NOW), 45);
  assert.equal(warrantyDaysRemaining(day(-3), NOW), -3);
});

test('the counted headline names every state exactly once and never says "soon" without the number', () => {
  const records = [
    warranty('a1', { expiryDate: day(300) }), warranty('a2', { expiryDate: day(120) }), warranty('e1', { expiryDate: day(20) }),
    warranty('x1', { expiryDate: day(-30) }), warranty('r1', { startDate: day(-5), expiryDate: day(-5) }), warranty('l1', { startDate: day(10), expiryDate: day(500) }),
  ];
  const result = build('Show my warranties', records);
  assert.equal(summary(result).headline, '6 warranties: 2 active, 1 expiring within 60 days, 1 expired, 1 with dates that need review, 1 starting later.');
  assert.deepEqual(summary(result).chips, [
    { label: '6 warranties', tone: 'DEFAULT' }, { label: '2 active', tone: 'DEFAULT' }, { label: '1 expire within 60 days', tone: 'CAUTION' },
    { label: '1 expired', tone: 'DEFAULT' }, { label: '1 need date review', tone: 'CAUTION' },
  ]);
  assert.ok(!/soon/i.test(summary(result).headline + summary(result).chips.map((chip) => chip.label).join(' ')));
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(result.reasonCode, 'WARRANTY_DATES_NEED_REVIEW');
  assert.equal(warrantyCalmCopy({ total: 1, shown: 1, active: 1, expiring: 0, expired: 0, needsReview: 0, startsLater: 0 }).headline, '1 warranty: 1 active.');
  assert.match(warrantyCalmCopy({ total: 60, shown: 50, active: 60, expiring: 0, expired: 0, needsReview: 0, startsLater: 0 }).supportLine, /Showing the first 50/);
});

test('rows read expiring first, then dates that need review, and expired ones most recent first', () => {
  const result = build('Show my warranties', [
    warranty('old', { expiryDate: day(-200) }), warranty('recent', { expiryDate: day(-5) }), warranty('later', { expiryDate: day(500) }),
    warranty('soon', { expiryDate: day(10) }), warranty('bad', { startDate: day(-3), expiryDate: day(-3) }),
  ]);
  assert.deepEqual(items(result).map((item) => item.id), ['soon', 'bad', 'later', 'recent', 'old']);
  assert.deepEqual(items(result).map((item) => item.status), ['EXPIRING', 'NEEDS_REVIEW', 'ACTIVE', 'EXPIRED', 'EXPIRED']);
});

test('coverage text is shown as recorded, truncated only for length, and a missing one is said to be missing, never inferred', () => {
  const long = 'Covers compressor and parts. '.repeat(20);
  const result = build('What does my HVAC warranty cover?', [
    warranty('h1', { category: 'HVAC', coverageDetails: '  Parts and labor on the compressor.  ' }),
    warranty('h2', { category: 'HVAC', coverageDetails: long }),
    warranty('h3', { category: 'HVAC', coverageDetails: null }),
    warranty('r1', { category: 'ROOFING', coverageDetails: 'Shingles only.' }),
  ]);
  assert.equal(items(result).length, 3, 'only HVAC warranties are answered');
  const byId = Object.fromEntries(items(result).map((item) => [item.id, item]));
  assert.equal(byId.h1.description, 'Parts and labor on the compressor.');
  assert.ok(byId.h2.description.length <= 240 && byId.h2.description.length > 200, 'cut for length only');
  assert.ok(byId.h2.description.endsWith('…'));
  assert.equal(byId.h3.description, 'No coverage details recorded.');
  assert.match(summary(result).headline, /^3 HVAC warranties: /);
});

test('no coverage decision, policy number, cost or claim action is ever emitted, and the boundary is present in every outcome', () => {
  const records = [warranty('w1', { policyNumber: 'POL-99887', cost: '499.00', coverageDetails: 'Parts.' })];
  const outcomes = [build('Show my warranties', records), build('Show my warranties', []), build('Is my roof warranty still active?', records), build('Which warranties expire within 60 days?', records)];
  for (const result of outcomes) {
    const json = JSON.stringify(result);
    assert.ok(!json.includes('POL-99887') && !json.includes('499.00'), 'policy number and cost are not read');
    assert.ok(!/claim/i.test(JSON.stringify(result.blocks.flatMap((block) => block.actions ?? []).map((action) => action.label))), 'no claim action');
    const boundary = result.blocks.find((block) => block.id === 'warranty-boundary');
    assert.equal(boundary.body, BOUNDARY_TEXT);
    assert.equal(boundary.severity, 'INFO');
  }
});

test('a viewer sees no write control, a non-owner sees no correction, and only the requester\'s own warranty declares corrections', () => {
  const records = [warranty('mine'), warranty('theirs')];
  const viewer = build('Show my warranties', records, { canWrite: false, ownedIds: new Set() });
  assert.ok(items(viewer).every((item) => item.actions === undefined));
  assert.ok(!list(viewer).actions.some((action) => action.id === 'add-warranty'));
  assert.ok(list(viewer).actions.some((action) => action.id === 'open-warranties-list'), 'the page link is always there');
  const member = build('Show my warranties', records, { canWrite: true, ownedIds: new Set(['mine']) });
  const byId = Object.fromEntries(items(member).map((item) => [item.id, item]));
  assert.ok(byId.mine.actions.length > 0 && byId.mine.actions.every((action) => action.operationId === 'WARRANTY_CORRECT'));
  assert.equal(byId.theirs.actions, undefined);
  assert.ok(list(member).actions.some((action) => action.id === 'add-warranty' && action.operationId === 'CAPTURE_WARRANTY_CONFIRM'));
});

test('a named item is matched only against the linked item, provider and recorded text, and an absent one is said to be unrecorded', () => {
  const records = [
    warranty('w1', { category: 'PLUMBING', inventoryItem: { name: 'Water heater' }, providerName: 'Apex Plumbing' }),
    warranty('w2', { category: 'APPLIANCE', providerName: 'Acme', coverageDetails: 'Refrigerator compressor.' }),
  ];
  const found = build('Do I have a recorded warranty for my water heater?', records);
  assert.deepEqual(items(found).map((item) => item.id), ['w1']);
  assert.match(summary(found).headline, /^1 water heater warranty: /);
  const missing = build('Do I have a recorded warranty for my dishwasher?', records);
  assert.equal(missing.reasonCode, 'WARRANTY_MATCH_NOT_FOUND');
  assert.equal(missing.blocks[0].title, 'No warranty is recorded for your dishwasher');
  assert.match(missing.blocks[0].body, /does not mean anything is or is not covered/);
  assert.equal(missing.blocks.at(-1).id, 'warranty-boundary');
});

test('the 60-day and expired questions filter server-side by the same status the rows show', () => {
  const records = [warranty('a', { expiryDate: day(300) }), warranty('b', { expiryDate: day(40) }), warranty('c', { expiryDate: day(-9) })];
  assert.deepEqual(items(build('Which warranties expire within 60 days?', records)).map((item) => item.id), ['b']);
  assert.deepEqual(items(build('Which warranties have expired?', records)).map((item) => item.id), ['c']);
  const none = build('Which warranties expire within 60 days?', [warranty('a', { expiryDate: day(300) })]);
  assert.equal(none.blocks[0].title, 'No recorded warranty matches warranties expiring within 60 days');
  assert.deepEqual(warrantyFocus('Which warranties expire soon?'), { expiring: true, expired: false, category: null, categoryLabel: null, item: null });
});

test('an empty record is not read as "nothing is covered"', () => {
  const owner = build('Show my warranties', []);
  assert.equal(owner.reasonCode, 'WARRANTY_NOT_RECORDED');
  assert.equal(owner.blocks[0].title, 'No warranties are recorded for this home yet');
  assert.match(owner.blocks[0].body, /does not mean nothing is covered/);
  assert.ok(owner.blocks[0].actions.some((action) => action.id === 'add-warranty'));
  const viewer = build('Show my warranties', [], { canWrite: false });
  assert.ok(!viewer.blocks[0].actions.some((action) => action.id === 'add-warranty'));
});

// ── the real handler ────────────────────────────────────────────────────────────────────────────────────────────────────
const original = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
let queries; let role;
function install(rows) {
  queries = []; role = 'OWNER';
  prismaModule.prisma = { warranty: { findMany: async (query) => { queries.push(query); return query.where.homeownerProfile ? [{ id: 'mine' }] : rows; } } };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = original; propertyAccess.resolvePropertyAccess = originalAccess; });
const invoke = (message = 'Show my warranties') => capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message });

test('the handler reads the property-scoped rows the Warranties route reads, never a policy number or cost, and only asks who owns them for a writer', async () => {
  install([warranty('mine', { expiryDate: day(30) }), warranty('theirs')]);
  const result = await invoke();
  assert.deepEqual(queries[0].where, { propertyId: 'p1' });
  assert.deepEqual(queries[0].orderBy, [{ expiryDate: 'asc' }, { id: 'asc' }]);
  assert.ok(!('policyNumber' in queries[0].select) && !('cost' in queries[0].select), 'sensitive fields are not selected');
  assert.deepEqual(queries[1].where, { propertyId: 'p1', homeownerProfile: { userId: 'u1' } });
  assert.ok(items(result).find((item) => item.id === 'mine').actions.length > 0);
  assert.equal(items(result).find((item) => item.id === 'theirs').actions, undefined);
  role = 'VIEWER';
  queries.length = 0;
  const viewer = await invoke();
  assert.equal(queries.length, 1, 'a viewer never triggers the ownership lookup');
  assert.ok(items(viewer).every((item) => item.actions === undefined));
});

test('every block survives the answer-trust validator and the page links the action whitelist', async () => {
  install([warranty('w1', { expiryDate: day(30) })]);
  const raw = await invoke();
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'warranty.lookup', operationId: 'WARRANTY_LOOKUP', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-26T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my warranties', operationId: 'WARRANTY_LOOKUP', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  for (const id of ['open-warranties', 'open-warranties-list']) {
    assert.equal(isAskActionApplicable({ action: { id, label: 'Open Warranties', href: '/dashboard/warranties', style: 'SECONDARY' }, operationId: 'WARRANTY_LOOKUP', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true, id);
  }
});

test('the questions this operation owns route here; coverage gaps, claims, corrections, adding and reminders keep their own operations', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
  for (const message of [
    'Show my warranties', 'Is my roof warranty still active?', 'Which warranties expire within 60 days?', 'What warranty information is recorded for my HVAC?',
    'Do I have a recorded warranty for my water heater?', 'What does my HVAC warranty cover?', 'Which warranties expire soon?', 'Is my roof still under warranty?',
    'How long is the warranty on the dishwasher good for?', 'When does the warranty on our furnace run out?', 'Does our water heater still have a warranty on file?',
  ]) assert.equal(route(message), 'WARRANTY_LOOKUP', message);
  assert.equal(route('Which items are missing warranty coverage?'), 'COVERAGE_GAPS');
  assert.equal(route('What coverage gaps does my home have?'), 'COVERAGE_GAPS');
  assert.equal(route('File a claim for my broken furnace'), 'CLAIM_FILE');
  assert.equal(route('Start a warranty claim for my dishwasher'), 'CLAIM_FILE');
  assert.equal(route('Correct the expiry date on my warranty'), 'WARRANTY_CORRECT');
  assert.equal(route('Remind me when my warranty expires'), 'HOME_DEADLINE_MONITOR');
  assert.notEqual(route('Add a warranty to my home record'), 'WARRANTY_LOOKUP');
});

test('the operation is fully registered: a VIEWER-floor record read, its own skill and adapter, and an audience policy', () => {
  const definition = ASK_OPERATION_DEFINITIONS.WARRANTY_LOOKUP;
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'warranty.lookup');
  assert.equal(definition.executionMode, 'DETERMINISTIC');
  const skill = getSkillForOperation('WARRANTY_LOOKUP');
  assert.equal(skill.id, 'warranties');
  assert.equal(skill.authorizationFloor, 'VIEWER');
  assert.deepEqual(skill.allowedAdapters, [{ id: 'warranty.lookup', version: '1.0' }]);
  assert.ok(getAskAudiencePolicy('WARRANTY_LOOKUP'), 'a missing audience policy crashes Ask at startup');
});
