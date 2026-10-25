const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// A provider-completed booking of this journey is the proof of the service-done steps, and its reversal reopens them (continuation FRD section 50).
const { prisma } = require('../../src/lib/prisma.ts');
const ops = require('../../src/services/bookingJourneyProofOperations.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { NotificationService } = require('../../src/services/notification.service.ts');

const T0 = new Date('2026-10-01T00:00:00Z');
let booking; let disputes; let evidence; let step; let journey; let events; let notes; let reports; let saved; let rec; let noteSaved;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'confirm_cleaning_complete', toolKey: 'guidance-overview', status: 'PENDING', stepOrder: 4, label: 'Confirm service completed', journeyId: 'j1', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null }, ...over });
test.beforeEach(() => {
  booking = { id: 'b1', propertyId: 'p1', homeownerId: 'u1', status: 'COMPLETED', providerId: 'prov', completedAt: T0, guidanceJourneyId: 'j1', inventoryItemId: null };
  disputes = []; evidence = []; events = []; notes = []; reports = []; step = stepRow(); journey = { id: 'j1', status: 'ACTIVE' };
  saved = ['booking', 'adminCase', 'guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion; noteSaved = NotificationService.create;
  prisma.booking = { findUnique: async () => booking };
  prisma.adminCase = { count: async ({ where }) => disputes.filter((d) => d.createdAt > where.createdAt.gt).length };
  prisma.guidanceSignal = {};
  prisma.guidanceJourney = { update: async ({ data }) => { Object.assign(journey, data); return journey; } };
  prisma.guidanceJourneyEvent = { create: async ({ data }) => { events.push(data); return data; } };
  prisma.guidanceJourneyStep = {
    findFirst: async ({ where }) => (where.stepKey && where.stepKey !== step.stepKey ? null : { ...step, journey }),
    update: async ({ data }) => { Object.assign(step, data); return step; },
  };
  prisma.guidanceStepEvidence = {
    findMany: async ({ where }) => evidence.filter((e) => e.evidenceRefId === where.evidenceRefId && (where.invalidatedAt === null ? !e.invalidatedAt : true) && (where.NOT ? !!e.invalidatedAt : true) && (where.supersededById === null ? !e.supersededById : true)),
    findFirst: async ({ where }) => evidence.find((e) => e.evidenceRefId === where.evidenceRefId && !e.invalidatedAt) ?? null,
    update: async ({ where, data }) => { const row = evidence.find((e) => e.id === where.id); Object.assign(row, data); return row; },
  };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); step.status = 'COMPLETED'; journey.status = 'COMPLETED'; evidence.push({ id: `ev${evidence.length + 1}`, evidenceRefType: p.sourceEntityType, evidenceRefId: p.sourceEntityId, status: 'VERIFIED', invalidatedAt: null, supersededById: null }); return {}; };
  NotificationService.create = async (n) => { notes.push(n); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; NotificationService.create = noteSaved; });

test('a provider-completed booking of this journey completes the service-done step, versioned by its completion time', async () => {
  const out = await ops.syncBookingJourneyProofs('b1');
  assert.equal(out.reported, 1);
  assert.deepEqual([reports[0].stepKey, reports[0].sourceEntityType, reports[0].producedData.proofType, reports[0].producedData.providerId], ['confirm_cleaning_complete', 'BOOKING', 'booking_service_completed', 'prov']);
  assert.match(reports[0].dedupeKey, /2026-10-01/);
});

test('a booking not completed by a provider, or from no journey, proves nothing', async () => {
  booking.status = 'IN_PROGRESS';
  assert.equal((await ops.syncBookingJourneyProofs('b1')).reported, 0);
  booking.status = 'COMPLETED'; booking.providerId = null;
  assert.equal((await ops.syncBookingJourneyProofs('b1')).reported, 0);
  booking.providerId = 'prov'; booking.guidanceJourneyId = null;
  assert.equal((await ops.syncBookingJourneyProofs('b1')).reported, 0);
  assert.equal(reports.length, 0);
});

test('a dispute after the completion invalidates the proof (kept), reopens the exact step, and notifies the homeowner', async () => {
  await ops.syncBookingJourneyProofs('b1');
  disputes = [{ createdAt: new Date('2026-10-02T00:00:00Z') }];
  const out = await ops.syncBookingJourneyProofs('b1');
  assert.equal(out.reopened, 1);
  assert.ok(evidence[0].invalidatedAt && evidence[0].status === 'REJECTED');
  assert.deepEqual([step.status, journey.status, notes[0].userId, notes[0].type], ['PENDING', 'ACTIVE', 'u1', 'GUIDANCE_STEP_REOPENED']);
});

test('a provider re-completion is new evidence that supersedes the invalidated row', async () => {
  await ops.syncBookingJourneyProofs('b1');
  disputes = [{ createdAt: new Date('2026-10-02T00:00:00Z') }];
  await ops.syncBookingJourneyProofs('b1');
  booking.completedAt = new Date('2026-10-05T00:00:00Z');
  const out = await ops.syncBookingJourneyProofs('b1');
  assert.equal(out.reported, 1);
  assert.equal(evidence[0].supersededById, evidence[1].id);
});
