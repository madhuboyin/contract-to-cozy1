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

test('the provider derives its read floor from its project and savings reads; the claim source is authorized separately; the savings command keeps its own action floor', () => {
  const provider = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'SCHEDULED_FOLLOW_UPS');
  assert.ok(provider.readOperationIds.includes('SAVINGS_OPPORTUNITIES'));
  assert.equal(workProviderReadFloor(provider), 'VIEWER', 'projects and savings stay readable on their own floors; the claim source is gated per source, not by raising the provider');
  assert.deepEqual(provider.sourceReads, { claim: 'CLAIM_CHECKLIST_VIEW', project: 'PROJECT_TRACKER_PROJECTS', savings: 'SAVINGS_OPPORTUNITIES' });
  assert.equal(workActionAllowed(provider, 'SAVINGS_BENEFIT_COMMAND', 'VIEWER'), false);
  assert.equal(workActionAllowed(provider, 'SAVINGS_BENEFIT_COMMAND', 'CONTRIBUTOR'), true);
  assert.deepEqual(parseAskWorkKey('followUp:savings:sa1'), { provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpSavings', entityId: 'sa1' });
});

test('repair classification includes the approved repair-capable trades and still excludes the rest', () => {
  for (const included of ['INSULATION', 'LANDSCAPING_DRAINAGE', 'FLOORING', 'PAINTING', 'SIDING', 'SECURITY_SAFETY', 'SOLAR', 'PLUMBING', 'HVAC']) assert.ok(ASK_REPAIR_BOOKING_CATEGORIES.includes(included), included);
  for (const excluded of ['LANDSCAPING', 'CLEANING', 'MOVING', 'INSPECTION', 'APPLIANCE_REPLACEMENT', 'INSURANCE', 'ATTORNEY', 'FINANCE', 'WARRANTY', 'ADMIN', 'OTHER']) assert.ok(!ASK_REPAIR_BOOKING_CATEGORIES.includes(excluded), excluded);
});

// ---- per-source read authority (owner audience policy 2026-11-13): claim follow-ups are CONTRIBUTOR-floor, project follow-ups keep their own floor ----
test('a viewer gets project follow-ups only: the claim table is not queried, not counted, and nothing says claim follow-ups were withheld', async () => {
  const { workSourceReadAllowed } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
  const provider = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'SCHEDULED_FOLLOW_UPS');
  assert.deepEqual(['VIEWER', 'CONTRIBUTOR', 'OWNER'].map((role) => workSourceReadAllowed(provider, 'claim', role)), [false, true, true]);
  assert.deepEqual(['VIEWER', 'CONTRIBUTOR', 'OWNER'].map((role) => workSourceReadAllowed(provider, 'project', role)), [true, true, true]);
  const claimCalls = []; install();
  prisma.claim = { findMany: async (a) => { claimCalls.push(['findMany', a]); return [{ id: 'c1', propertyId: 'p1', title: 'SECRET-CLAIM', status: 'SUBMITTED', nextFollowUpAt: at(20), updatedAt: at(6) }]; }, count: async (a) => { claimCalls.push(['count', a]); return 1; } };
  prisma.projectRecord = { findMany: async () => [{ id: 'pr1', propertyId: 'p1', name: 'Fence', status: 'IN_PROGRESS', followUpDueAt: at(21), updatedAt: at(7) }], count: async () => 1 };
  const viewer = await readScheduledFollowUpWork(ctx({ role: 'VIEWER' }), q);
  assert.deepEqual(viewer.rows.map((row) => row.workKey), ['followUp:project:pr1']); assert.equal(viewer.total, 1, 'the total does not include claim follow-ups');
  assert.equal(claimCalls.length, 0, 'the claim table is never touched for a viewer'); assert.ok(!JSON.stringify(viewer).includes('SECRET-CLAIM') && !/claim/i.test(JSON.stringify(viewer.rows)));
  const contributor = await readScheduledFollowUpWork(ctx({ role: 'CONTRIBUTOR' }), q);
  assert.deepEqual(contributor.rows.map((row) => row.workKey).sort(), ['followUp:claim:c1', 'followUp:project:pr1']); assert.equal(contributor.total, 2); assert.ok(claimCalls.length >= 2);
});
test('opening a claim follow-up key as a viewer is indistinguishable from a key that does not exist; no claim is probed and no hand-over is offered', async () => {
  const { resolveAskWork } = require('../../src/services/ask/work/askWorkResolve.ts');
  let probed = false; install();
  prisma.claim = { findFirst: async () => { probed = true; return { id: 'c1' }; } };
  const readers = { SCHEDULED_FOLLOW_UPS: async () => { throw new Error('the reader must not run'); } };
  const out = await resolveAskWork({ userId: 'u1', propertyId: 'p1', role: 'VIEWER', operatingMode: 'OWNING', workKey: 'followUp:claim:c1' }, readers);
  assert.equal(out.outcome, 'DELETED'); assert.equal(out.message, 'This work could not be found.'); assert.equal(out.supersededBy, null); assert.equal(probed, false);
});

