const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The completion effects are attributed to the household member who completed the project, not to its creator (docs/architecture/
// ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md section 3.6). The real DiyCompletionService with its collaborators stubbed.
const calls = { homeEvents: [], incidentSync: [], maintenance: [], incident: [], projectUpdates: [] };
const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
stub('../../src/lib/prisma.ts', { prisma: {
  diyProject: { update: async (args) => { calls.projectUpdates.push(args); return {}; } },
  propertyMaintenanceTask: { updateMany: async (args) => { calls.maintenance.push(args); return { count: 1 }; } },
  incident: { updateMany: async (args) => { calls.incident.push(args); return { count: 1 }; } },
} });
stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {} }, auditLog() {}, redactEmail: (value) => value });
stub('../../src/services/homeEvents.service.ts', { HomeEventsService: class { async createHomeEvent(args) { calls.homeEvents.push(args); return { id: 'event-1' }; } } });
stub('../../src/services/incidents/incidentWorkReconciliation.service.ts', { syncIncidentWorkItem: async (...args) => { calls.incidentSync.push(args); } });
delete require.cache[require.resolve('../../src/services/diyCompletion.service.ts')];
const { diyCompletionService } = require('../../src/services/diyCompletion.service.ts');

const project = { id: 'p1', propertyId: 'prop-1', userId: 'creator', title: 'Paint a room', category: 'PAINTING', completedAt: new Date('2026-10-06T12:00:00Z'), maintenanceTaskId: 'task-1', incidentId: 'inc-1', actualMaterialCostCents: 5000, actualMinutes: 90 };

test('the home event and the incident sync are attributed to the acting user, not the project creator', async () => {
  await diyCompletionService.onComplete(project, 'dana');
  assert.equal(calls.homeEvents.length, 1);
  assert.equal(calls.homeEvents[0].userId, 'dana');
  assert.notEqual(calls.homeEvents[0].userId, 'creator');
  assert.equal(calls.homeEvents[0].body.idempotencyKey, 'diy-complete-p1', 'the idempotency key is unchanged');
  assert.deepEqual(calls.incidentSync, [['inc-1', 'dana']]);
});

test('the linked maintenance task and incident are still updated as before (the governed path is step 3), and the event id is stored', async () => {
  assert.equal(calls.maintenance[0].where.id, 'task-1');
  assert.equal(calls.maintenance[0].data.status, 'COMPLETED');
  assert.equal(calls.incident[0].data.status, 'RESOLVED');
  assert.deepEqual(calls.projectUpdates[0].data, { homeEventId: 'event-1' });
});
