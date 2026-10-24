const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// Provider-confirmed booking completion as maintenance proof, and its reversal (continuation FRD section 47).
const { prisma } = require('../../src/lib/prisma.ts');
const sync = require('../../src/services/maintenanceBookingProofSync.ts');
const ops = require('../../src/services/maintenanceTaskJourneyOperations.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { NotificationService } = require('../../src/services/notification.service.ts');

const T0 = new Date('2026-10-01T00:00:00Z');
let booking; let task; let links; let disputes; let evidence; let step; let journey; let events; let notes; let reports; let docs; let saved; let recSaved; let noteSaved;
const stepRow = () => ({ id: 's1', stepKey: 'complete_compliance_task', toolKey: 'maintenance', status: 'PENDING', stepOrder: 3, label: 'Complete required compliance tasks', journeyId: 'j1', journey: { id: 'j1', status: 'COMPLETED', inventoryItemId: null, primarySignal: null } });
test.beforeEach(() => {
  booking = { id: 'b1', propertyId: 'p1', status: 'COMPLETED', providerId: 'prov', completedAt: T0 };
  task = { id: 't1', propertyId: 'p1', bookingId: 'b1', status: 'PENDING', completionMetadata: {} };
  links = [{ stepId: 's1', journeyId: 'j1', maintenanceTaskId: 't1', propertyId: 'p1', linkedByUserId: 'u1' }];
  disputes = []; evidence = []; events = []; notes = []; reports = []; docs = []; step = stepRow(); journey = { id: 'j1', status: 'ACTIVE' };
  saved = ['booking', 'propertyMaintenanceTask', 'guidanceStepMaintenanceTaskLink', 'adminCase', 'homeEvent', 'propertyRecord', 'document', 'guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  recSaved = guidanceJourneyService.recordToolCompletion; noteSaved = NotificationService.create;
  prisma.booking = { findUnique: async () => booking, findFirst: async () => booking };
  prisma.propertyMaintenanceTask = { findMany: async () => [task], findUnique: async () => task };
  prisma.guidanceStepMaintenanceTaskLink = { findMany: async () => links };
  prisma.adminCase = { count: async ({ where }) => disputes.filter((d) => !where.createdAt || d.createdAt > where.createdAt.gt).length };
  prisma.homeEvent = { findMany: async () => [] };
  prisma.propertyRecord = { findMany: async ({ where }) => docs.filter((d) => where.id.in.includes(d.id)).map((d) => ({ id: d.id, title: 't', recordType: 'OTHER', sensitivity: 'STANDARD', currentVersionId: 'v1', currentVersion: { mimeType: 'application/pdf' } })) };
  prisma.document = { findMany: async () => [] };
  prisma.guidanceSignal = {};
  prisma.guidanceJourney = { findFirst: async () => journey, update: async ({ data }) => { Object.assign(journey, data); return journey; } };
  prisma.guidanceJourneyEvent = { create: async ({ data }) => { events.push(data); return data; } };
  prisma.guidanceJourneyStep = { findFirst: async () => ({ ...step, journey }), update: async ({ data }) => { Object.assign(step, data); return step; } };
  prisma.guidanceStepEvidence = {
    findMany: async ({ where }) => evidence.filter((e) => e.stepId === where.stepId && e.evidenceRefType === where.evidenceRefType && e.evidenceRefId === where.evidenceRefId && (where.invalidatedAt === null ? !e.invalidatedAt : true) && (where.NOT ? !!e.invalidatedAt : true) && (where.supersededById === null ? !e.supersededById : true)),
    findFirst: async ({ where }) => evidence.find((e) => e.stepId === where.stepId && e.evidenceRefId === where.evidenceRefId && !e.invalidatedAt) ?? null,
    update: async ({ where, data }) => { const row = evidence.find((e) => e.id === where.id); Object.assign(row, data); return row; },
  };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); step.status = 'COMPLETED'; journey.status = 'COMPLETED'; evidence.push({ id: `ev${evidence.length + 1}`, stepId: p.stepKey && 's1', evidenceRefType: p.sourceEntityType, evidenceRefId: p.sourceEntityId, status: 'VERIFIED', invalidatedAt: null, supersededById: null, createdAt: new Date() }); return {}; };
  NotificationService.create = async (n) => { notes.push(n); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = recSaved; NotificationService.create = noteSaved; });

test('a provider-completed booking explicitly linked to the task is proof, versioned by its completion time; no link or a non-completed booking is not', async () => {
  assert.deepEqual(await ops.bookingCompletionEvidence(task), { source: 'BOOKING', id: 'b1', versionId: T0.toISOString() });
  assert.equal(await ops.bookingCompletionEvidence({ ...task, bookingId: null }), null);
  booking.status = 'IN_PROGRESS';
  assert.equal(await ops.bookingCompletionEvidence(task), null);
});

test('a completed booking reports the linked step with a booking proof, even if the homeowner never marked the task done', async () => {
  const out = await sync.syncBookingMaintenanceProofs('b1');
  assert.equal(out.reported, 1);
  assert.deepEqual([reports[0].sourceEntityType, reports[0].sourceEntityId, reports[0].producedData.proofType], ['BOOKING', 'b1', 'maintenance_booking_completed']);
  assert.match(reports[0].dedupeKey, /^maintenance-booking-completed:p1:b1:2026-10-01/);
});

test('a dispute opened after the completion invalidates that proof (kept), reopens the exact step, reactivates the journey and notifies the homeowner', async () => {
  await sync.syncBookingMaintenanceProofs('b1');
  disputes = [{ createdAt: new Date('2026-10-02T00:00:00Z') }];
  const out = await sync.syncBookingMaintenanceProofs('b1');
  assert.equal(out.reopened, 1);
  assert.ok(evidence[0].invalidatedAt && evidence[0].status === 'REJECTED', 'the evidence is kept, invalidated, with a reason');
  assert.match(evidence[0].metadataJson.reversalReason, /disputed/);
  assert.deepEqual([step.status, journey.status], ['PENDING', 'ACTIVE']);
  assert.ok(events.some((e) => e.reasonCode === 'PROVIDER_COMPLETION_DISPUTED' && e.toStepStatus === 'PENDING'));
  assert.deepEqual([notes[0].userId, notes[0].type], ['u1', 'GUIDANCE_STEP_REOPENED']);
});

test('a cancellation after confirmation is a withdrawal; another verified proof keeps the step done instead of reopening it', async () => {
  await sync.syncBookingMaintenanceProofs('b1');
  booking.status = 'CANCELLED';
  task.status = 'COMPLETED'; task.completionMetadata = { evidence: [{ source: 'HOME_RECORD', id: 'r1', versionId: 'v1' }] }; docs = [{ id: 'r1' }];
  const out = await sync.syncBookingMaintenanceProofs('b1');
  assert.equal(out.reopened, 0);
  assert.ok(evidence[0].invalidatedAt);
  assert.equal(step.status, 'COMPLETED');
  assert.equal(reports.at(-1).producedData.proofType, 'maintenance_task_verified_completion');
});

test('a provider\'s later re-completion is a new version: new evidence supersedes the invalidated row', async () => {
  await sync.syncBookingMaintenanceProofs('b1');
  disputes = [{ createdAt: new Date('2026-10-02T00:00:00Z') }];
  await sync.syncBookingMaintenanceProofs('b1');
  booking.completedAt = new Date('2026-10-05T00:00:00Z'); booking.status = 'COMPLETED';
  const out = await sync.syncBookingMaintenanceProofs('b1');
  assert.equal(out.reported, 1);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].supersededById, evidence[1].id);
  assert.match(reports.at(-1).dedupeKey, /2026-10-05/);
});
