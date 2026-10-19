const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readScheduledFollowUpWork, savingsFollowUpRow } = require('../../src/services/ask/work/scheduledFollowUps.reader.ts');
const { ASK_REPAIR_BOOKING_CATEGORIES } = require('../../src/services/ask/work/repairs.reader.ts');
const { parseAskWorkKey } = require('../../src/services/ask/work/askWorkResolve.ts');
const { ASK_WORK_PROVIDER_REGISTRY, workProviderReadFloor, workActionAllowed } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');

const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const ctx = (extra = {}) => ({ userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING', ...extra });
const q = { view: 'SCHEDULED', after: null, limit: 10, status: null };

function install({ primary = true, actions = [] } = {}) {
  const calls = { property: [], savings: [] };
  prisma.claim = { findMany: async () => [], count: async () => 0 };
  prisma.projectRecord = { findMany: async () => [], count: async () => 0 };
  prisma.property = { findFirst: async (args) => { calls.property.push(args); return primary ? { id: 'p1' } : null; } };
  prisma.savingsBenefitAction = { findMany: async (args) => { calls.savings.push(args); return actions; }, count: async () => actions.length, update: () => { throw new Error('no writes'); } };
  return calls;
}
const action = { id: 'sa1', propertyId: 'p1', actionType: 'EXTERNALLY_SUBMITTED', followUpAt: at(25), updatedAt: at(6) };

test('the primary owner sees a started savings action with a future follow-up, as its own Scheduled row with a due date', async () => {
  const calls = install({ actions: [action] });
  const page = await readScheduledFollowUpWork(ctx(), q);
  assert.equal(page.rows[0].workKey, 'followUp:savings:sa1');
  assert.equal(page.rows[0].dueAt, at(25).toISOString());
  assert.equal(page.rows[0].sourceOwner, 'savings');
  assert.equal(page.rows[0].title, 'Follow up: savings or benefit (Externally submitted)');
  assert.deepEqual(page.rows[0].sourceAliases, []);
  assert.equal(page.total, 1);
  assert.match(JSON.stringify(calls.savings[0].where), /"state":"STARTED","followUpAt":\{"gt"/);
  assert.match(JSON.stringify(calls.property[0].where), /"homeownerProfile":\{"userId":"u1"\}/);
  assert.equal(savingsFollowUpRow(action).lifecycleView, 'SCHEDULED');
});

test('savings follow-ups follow the savings workflow gate: not a viewer, not a non-primary member, not an operating mode the command forbids', async () => {
  for (const [label, context, opts] of [
    ['viewer', ctx({ role: 'VIEWER' }), {}],
    ['contributor who is not the primary owner', ctx({ role: 'CONTRIBUTOR' }), { primary: false }],
    ['owner member who is not the primary account holder', ctx(), { primary: false }],
  ]) {
    const calls = install({ ...opts, actions: [action] });
    const page = await readScheduledFollowUpWork(context, q);
    assert.deepEqual(page.rows, [], label);
    assert.equal(calls.savings.length, 0, `${label}: the savings table is never read`);
  }
});

test('claim and project follow-ups are unaffected by a savings gate that says no', async () => {
  install({ primary: false });
  prisma.claim = { findMany: async () => [{ id: 'c1', propertyId: 'p1', title: 'Water', status: 'SUBMITTED', nextFollowUpAt: at(20), updatedAt: at(6) }], count: async () => 1 };
  const page = await readScheduledFollowUpWork(ctx({ role: 'CONTRIBUTOR' }), q);
  assert.deepEqual(page.rows.map((row) => row.workKey), ['followUp:claim:c1']);
});

test('the provider now derives its read floor from claims, projects and savings reads, with the savings command\'s own action floor', () => {
  const provider = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'SCHEDULED_FOLLOW_UPS');
  assert.ok(provider.readOperationIds.includes('SAVINGS_OPPORTUNITIES'));
  assert.equal(workProviderReadFloor(provider), 'VIEWER');
  assert.equal(workActionAllowed(provider, 'SAVINGS_BENEFIT_COMMAND', 'VIEWER'), false);
  assert.equal(workActionAllowed(provider, 'SAVINGS_BENEFIT_COMMAND', 'CONTRIBUTOR'), true);
  assert.deepEqual(parseAskWorkKey('followUp:savings:sa1'), { provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpSavings', entityId: 'sa1' });
});

test('repair classification includes the approved repair-capable trades and still excludes the rest', () => {
  for (const included of ['INSULATION', 'LANDSCAPING_DRAINAGE', 'FLOORING', 'PAINTING', 'SIDING', 'SECURITY_SAFETY', 'SOLAR', 'PLUMBING', 'HVAC']) assert.ok(ASK_REPAIR_BOOKING_CATEGORIES.includes(included), included);
  for (const excluded of ['LANDSCAPING', 'CLEANING', 'MOVING', 'INSPECTION', 'APPLIANCE_REPLACEMENT', 'INSURANCE', 'ATTORNEY', 'FINANCE', 'WARRANTY', 'ADMIN', 'OTHER']) assert.ok(!ASK_REPAIR_BOOKING_CATEGORIES.includes(excluded), excluded);
});
