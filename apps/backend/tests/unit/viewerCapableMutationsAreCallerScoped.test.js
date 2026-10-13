const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
require('ts-node/register');

// D-R1 batch 2 owner rule: a viewer may change only state scoped exclusively to their own account. The routes left open to a viewer are the incident
// preference/archive/restore/auto-resolution-cancel routes and the habit "viewed" route. This test runs the REAL controllers/service against a
// recording prisma and proves that, for a VIEWER, every write is keyed by the authenticated user and never by anything in the request body, and that
// the household-wide side effect of a pin stays with CONTRIBUTOR and above.

const calls = [];
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const returns = {
  incident: { id: 'inc-1', propertyId: 'prop-1' },
  propertyHabit: { id: 'habit-1', status: 'ACTIVE', linkedMaintenanceTaskId: null },
};
const recordingPrisma = new Proxy({}, {
  get: (_t, model) => {
    if (typeof model !== 'string' || model === 'then') return undefined;
    if (model.startsWith('$')) return async () => undefined; // $disconnect on process exit
    return new Proxy({}, {
      get: (_m, op) => async (args) => {
        calls.push({ model, op, args });
        if (op === 'findFirst' || op === 'findUnique') return returns[model] ?? null;
        if (op === 'updateMany' || op === 'deleteMany') return { count: 0 };
        return {};
      },
    });
  },
});
const prismaModule = require('../../src/lib/prisma.ts');
prismaModule.prisma = recordingPrisma;

const incidents = require('../../src/controllers/incidents.controller.ts');
const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');

const VIEWER_ID = 'viewer-1';
const writes = () => calls.filter((c) => WRITES.has(c.op));
const asJson = (value) => JSON.stringify(value);
function run(handler, { role, body = {}, userId = VIEWER_ID }) {
  calls.length = 0;
  const response = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  const req = {
    params: { propertyId: 'prop-1', incidentId: 'inc-1' },
    user: { userId },
    householdRole: role,
    body,
  };
  return handler(req, response).then(() => response);
}

// Every identifier a hostile caller could smuggle in through the body.
const HOSTILE_BODY = { userId: 'attacker', incidentId: 'other-incident', propertyId: 'other-property', id: 'other-row' };

test('incident preferences: a viewer writes only their own preference row, keyed by the authenticated user', async () => {
  await run(incidents.updateIncidentPreferences, { role: 'VIEWER', body: { ...HOSTILE_BODY, isPinned: true, pinnedNote: 'x', isArchived: false } });
  const w = writes();
  assert.deepEqual(w.map((c) => `${c.model}.${c.op}`).sort(), ['incidentAutoResolutionNotification.updateMany', 'incidentUserPreference.upsert']);
  const upsert = w.find((c) => c.model === 'incidentUserPreference');
  assert.deepEqual(upsert.args.where, { incidentId_userId: { incidentId: 'inc-1', userId: VIEWER_ID } });
  assert.equal(upsert.args.create.userId, VIEWER_ID);
  assert.equal(upsert.args.create.incidentId, 'inc-1');
  assert.ok(!asJson(upsert.args).includes('attacker'), 'a body-supplied user id never reaches the write');
  // The pin's auto-resolution cancel is narrowed to notifications addressed to the viewer.
  const cancel = w.find((c) => c.model === 'incidentAutoResolutionNotification');
  assert.equal(cancel.args.where.userId, VIEWER_ID);
});

test('incident preferences: only CONTRIBUTOR and above may cancel the household-wide pending auto-resolution', async () => {
  for (const role of ['CONTRIBUTOR', 'OWNER']) {
    await run(incidents.updateIncidentPreferences, { role, body: { isPinned: true } });
    const cancel = writes().find((c) => c.model === 'incidentAutoResolutionNotification');
    assert.ok(cancel, `${role}: pin cancels pending auto-resolution`);
    assert.equal('userId' in cancel.args.where, false, `${role}: household-wide cancel`);
  }
  // No pin: no notification write at all, whatever the role.
  await run(incidents.updateIncidentPreferences, { role: 'VIEWER', body: { isArchived: true } });
  assert.equal(writes().some((c) => c.model === 'incidentAutoResolutionNotification'), false);
});

test('incident archive and restore touch only the caller\'s preference row', async () => {
  await run(incidents.archiveIncident, { role: 'VIEWER', body: { ...HOSTILE_BODY, reason: 'noise' } });
  let w = writes();
  assert.deepEqual(w.map((c) => `${c.model}.${c.op}`), ['incidentUserPreference.upsert']);
  assert.deepEqual(w[0].args.where, { incidentId_userId: { incidentId: 'inc-1', userId: VIEWER_ID } });
  assert.equal(w[0].args.create.userId, VIEWER_ID);
  assert.ok(!asJson(w[0].args).includes('attacker'));

  await run(incidents.restoreIncident, { role: 'VIEWER', body: HOSTILE_BODY });
  w = writes();
  assert.deepEqual(w.map((c) => `${c.model}.${c.op}`), ['incidentUserPreference.updateMany']);
  assert.deepEqual(w[0].args.where, { incidentId: 'inc-1', userId: VIEWER_ID });
});

test('incident auto-resolution cancel touches only notifications addressed to the caller', async () => {
  await run(incidents.cancelAutoResolution, { role: 'VIEWER', body: HOSTILE_BODY });
  const w = writes();
  assert.deepEqual(w.map((c) => `${c.model}.${c.op}`), ['incidentAutoResolutionNotification.updateMany']);
  assert.equal(w[0].args.where.userId, VIEWER_ID);
  assert.equal(w[0].args.where.incidentId, 'inc-1');
});

test('incident acknowledgement is NOT viewer-capable: it writes a household-visible suppression/timeline, so it needs CONTRIBUTOR on the route', () => {
  // Documented here so the classification is not silently loosened: the viewer-capable list in the router test does not include it.
  const source = require('node:fs').readFileSync(require.resolve('../../src/routes/incidents.routes.ts'), 'utf8');
  const block = source.slice(source.indexOf("/incidents/:incidentId/ack'"), source.indexOf("/incidents/:incidentId/ack'") + 200);
  assert.match(block, /requireHouseholdRole\('CONTRIBUTOR'\)/);
});

test('habit viewed: stores one action under the authenticated user, debounced per user, and writes nothing else', async () => {
  calls.length = 0;
  const result = await HomeHabitCoachService.prototype.recordViewed.call(Object.create(HomeHabitCoachService.prototype), 'prop-1', 'habit-1', VIEWER_ID);
  assert.deepEqual(result, { recorded: true });
  const debounce = calls.find((c) => c.model === 'propertyHabitAction' && c.op === 'findFirst');
  assert.equal(debounce.args.where.userId, VIEWER_ID, "another member's view must not suppress this one");
  const w = writes();
  assert.deepEqual(w.map((c) => `${c.model}.${c.op}`), ['propertyHabitAction.create']);
  assert.equal(w[0].args.data.userId, VIEWER_ID);
  assert.equal(w[0].args.data.actionType, 'VIEWED');
  assert.equal(w[0].args.data.propertyHabitId, 'habit-1');
});

test('habit viewed: no authenticated user means no write', async () => {
  calls.length = 0;
  await assert.rejects(
    () => HomeHabitCoachService.prototype.recordViewed.call(Object.create(HomeHabitCoachService.prototype), 'prop-1', 'habit-1', null),
    /Authentication required/,
  );
  assert.equal(writes().length, 0);
});

test('habit preferences: reading them never creates the row, for any role', async () => {
  calls.length = 0;
  const result = await HomeHabitCoachService.prototype.getPreferences.call(Object.create(HomeHabitCoachService.prototype), 'prop-1');
  assert.equal(writes().length, 0);
  assert.equal(result.preferences.propertyId, 'prop-1');
  assert.equal(result.preferences.isEnabled, true);
});
