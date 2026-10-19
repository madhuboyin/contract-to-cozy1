const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { composeAskWorkPage, workFilterOptions, ASK_WORK_PROVIDER_READERS, validateAskWorkProviders } = require('../../src/services/ask/askWork.service.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { repairLifecycleView, repairRow, readRepairWork, repairBookingWhere, ASK_REPAIR_BOOKING_CATEGORIES } = require('../../src/services/ask/work/repairs.reader.ts');
const { readPropertylessPendingWork, readPendingExecutionWork } = require('../../src/services/ask/work/pendingExecutions.reader.ts');
const { readClaimWork } = require('../../src/services/ask/work/claims.reader.ts');
const { readQueuedJobWork } = require('../../src/services/ask/work/queuedJobs.reader.ts');
const { createOperationalWorkItemReader } = require('../../src/services/ask/work/operationalWorkItems.reader.ts');
const { claimFollowUpRow, projectFollowUpRow } = require('../../src/services/ask/work/scheduledFollowUps.reader.ts');
const { projectRow } = require('../../src/services/ask/work/projects.reader.ts');
const { ASK_WORK_LISTING_RETENTION_DAYS } = require('../../src/services/ask/work/askWorkRetention.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'CONTRIBUTOR' };
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const input = { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' };
const q = (extra = {}) => ({ view: 'SCHEDULED', limit: 10, after: null, workType: null, status: null, ...extra });

test('a scheduled project and its follow-up are two rows, and the follow-up keeps its due date', async () => {
  const project = { id: 'pr1', propertyId: 'p1', name: 'Roof', projectType: 'CUSTOM', status: 'PLANNING', startDate: at(28), contractorName: null, guidanceJourneyId: null, renovationCaseId: null, updatedAt: at(5) };
  const followUp = projectFollowUpRow({ id: 'pr1', propertyId: 'p1', name: 'Roof', status: 'PLANNING', followUpDueAt: at(30), updatedAt: at(6) });
  const projectScheduled = { ...projectRow(project, 'OWNER', new Date('2026-10-10T00:00:00Z')), lifecycleView: 'SCHEDULED' };
  const rows = [projectScheduled, followUp];
  const page = await composeAskWorkPage(input, q(), { PROJECTS: async () => ({ rows: [rows[0]], total: 1, viewCounts: null }), SCHEDULED_FOLLOW_UPS: async () => ({ rows: [rows[1]], total: 1, viewCounts: null }) },
    ASK_WORK_PROVIDER_REGISTRY);
  assert.deepEqual(page.rows.map((row) => row.workKey).sort(), ['followUp:project:pr1', 'project:pr1']);
  assert.equal(page.rows.find((row) => row.workKey === 'followUp:project:pr1').dueAt, at(30).toISOString());
  assert.deepEqual(claimFollowUpRow({ id: 'c1', propertyId: 'p1', title: 'x', status: 'SUBMITTED', nextFollowUpAt: at(20), updatedAt: at(6) }).sourceAliases, []);
});

test('every decision family stays listed', () => {
  assert.equal(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'DECISION_THREADS').reader.state, 'CONNECTED');
});

test('repairs: an explicit classification, the caller\'s own bookings only, never buyer-task bookings', async () => {
  assert.ok(ASK_REPAIR_BOOKING_CATEGORIES.includes('PLUMBING'));
  for (const excluded of ['INSPECTION', 'MOVING', 'CLEANING', 'LANDSCAPING', 'ATTORNEY']) assert.ok(!ASK_REPAIR_BOOKING_CATEGORIES.includes(excluded), excluded);
  assert.deepEqual(Object.keys(repairBookingWhere('u1', 'p1')).sort(), ['category', 'homeBuyerTaskId', 'homeownerId', 'propertyId']);
  assert.equal(repairBookingWhere('u1', 'p1').homeBuyerTaskId, null);
  for (const [status, view] of [['DRAFT', 'NEEDS_YOU'], ['DISPUTED', 'NEEDS_YOU'], ['PENDING', 'WAITING'], ['CONFIRMED', 'SCHEDULED'], ['IN_PROGRESS', 'ACTIVE'], ['COMPLETED', 'COMPLETED'], ['CANCELLED', 'ARCHIVED']]) assert.equal(repairLifecycleView(status), view, status);
  const calls = { booking: [], exec: [] };
  prisma.booking = {
    findMany: async (args) => { calls.booking.push(args); return [{ id: 'b1', propertyId: 'p1', status: 'CONFIRMED', description: 'Fix the leak', scheduledDate: at(20), updatedAt: at(5), service: { name: 'Plumbing repair' } }]; },
    count: async () => 1, update: () => { throw new Error('no writes'); }, create: () => { throw new Error('no writes'); },
  };
  prisma.operationalWorkExecution = { findMany: async (args) => { calls.exec.push(args); return [{ workItemId: 'w1', executionEntityId: 'b1' }]; } };
  const page = await readRepairWork(ctx, { view: 'SCHEDULED', after: null, limit: 5, status: null });
  assert.equal(page.rows[0].workKey, 'repair:b1');
  assert.deepEqual(page.rows[0].sourceAliases, ['workItem:w1']);
  assert.equal(page.rows[0].dueAt, at(20).toISOString());
  assert.match(page.rows[0].resume.unavailableReason, /Ask cannot manage service bookings/);
  assert.equal(page.rows[0].resume.launch.operationId, null);
  assert.match(JSON.stringify(calls.booking[0].where), /"homeownerId":"u1"/);
  assert.equal(calls.exec.length, 1);
  assert.equal(repairRow({ id: 'b2', propertyId: 'p1', status: 'DISPUTED', description: '', scheduledDate: null, updatedAt: at(1), service: { name: 'x' } }).nextAction.label, 'Resolve the dispute');
});

test('repairs is connected, and only unknown-outcome is left unavailable', () => {
  assert.deepEqual(ASK_WORK_PROVIDER_REGISTRY.filter((entry) => entry.reader.state === 'UNAVAILABLE').map((entry) => entry.id), ['UNKNOWN_OUTCOME_EXECUTIONS']);
  assert.deepEqual(validateAskWorkProviders(), []);
  assert.ok(ASK_WORK_PROVIDER_READERS.REPAIRS);
});

test('a work item backed by a repair booking yields to the repair, but only for the member who owns that booking', async () => {
  const calls = [];
  prisma.operationalWorkItem = { findMany: async (args) => { calls.push(args); return []; }, count: async () => 0, groupBy: async () => [] };
  prisma.operationalWorkSource = { findMany: async () => [] };
  prisma.operationalWorkExecution = { findMany: async (args) => (args.where.executionType === 'BOOKING' ? [{ workItemId: 'w1', executionEntityId: 'b1' }, { workItemId: 'w2', executionEntityId: 'b2' }] : []) };
  const bookingCalls = [];
  prisma.booking = { findMany: async (args) => { bookingCalls.push(args); return [{ id: 'b1' }]; } };
  await createOperationalWorkItemReader()(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(calls[0].where), /"id":\{"in":\["w1"\]\}/, 'only the work item whose booking is this member\'s repair is excluded');
  assert.match(JSON.stringify(bookingCalls[0].where), /"homeownerId":"u1"/);
});

test('a work item whose incident is suppressed, or whose journey is aborted, stays a home work item', async () => {
  const calls = [];
  prisma.operationalWorkItem = { findMany: async (args) => { calls.push(args); return []; }, count: async () => 0, groupBy: async () => [] };
  prisma.operationalWorkSource = { findMany: async () => [{ workItemId: 'wi', sourceEntityId: 'inc-hidden' }, { workItemId: 'wv', sourceEntityId: 'inc-visible' }] };
  prisma.incident = { findMany: async () => [{ id: 'inc-visible' }] };
  prisma.operationalWorkExecution = { findMany: async (args) => (args.where.executionType === 'GUIDANCE' ? [{ workItemId: 'wa', executionEntityId: 'j-aborted' }, { workItemId: 'wj', executionEntityId: 'j-live' }] : []) };
  prisma.guidanceJourney = { findMany: async () => [{ id: 'j-live' }] };
  prisma.booking = { findMany: async () => [] };
  await createOperationalWorkItemReader()(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"id":\{"in":\["wv","wj"\]\}/);
  assert.doesNotMatch(where, /"wi"|"wa"/);
});

test('pending requests with no home are an account-scoped bucket, never attached to a property or listed under another home', async () => {
  const exec = (id, status, propertyId) => ({ id, sessionId: 's1', propertyId, status, message: `Q ${id}`, operationId: null, contextVersion: null, resultJson: null, updatedAt: at(5), expiresAt: null });
  const calls = [];
  prisma.askExecution = { findMany: async (args) => { calls.push(args); return [exec('e1', 'NEEDS_PROPERTY', null)]; } };
  const rows = await readPropertylessPendingWork('u1', 'NEEDS_YOU', null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].propertyId, null);
  assert.equal(rows[0].workKey, 'execution:e1');
  assert.equal(calls[0].where.propertyId, null);
  assert.equal(calls[0].where.userId, 'u1');
  const scoped = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.equal(calls[1].where.propertyId, 'p1', 'a home\'s own list never includes homeless requests');
  assert.ok(scoped.rows.every((row) => row.propertyId === 'p1' || row.propertyId === null));
  assert.deepEqual(await readPropertylessPendingWork('u1', 'WAITING', null), []);
});

test('the page carries the homeless bucket and server-authoritative filter options', async () => {
  const empty = async () => ({ rows: [], total: 0, viewCounts: null });
  const bucket = [{ workKey: 'execution:e1' }];
  const page = await composeAskWorkPage(input, q({ view: 'NEEDS_YOU' }), { CLAIMS: empty, PROJECTS: empty }, ASK_WORK_PROVIDER_REGISTRY, bucket);
  assert.deepEqual(page.unscopedPending, bucket);
  assert.deepEqual(page.filterOptions.workTypes.map((option) => option.value).sort(), ['CLAIM', 'PROJECT']);
  assert.ok(page.filterOptions.statusesByWorkType.CLAIM.some((option) => option.value === 'APPROVED'), 'a status that is on no loaded row is still offered');
  assert.deepEqual(page.filterOptions.statusesByWorkType.PROJECT.map((option) => option.value), ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'DISPUTED']);
  assert.deepEqual(workFilterOptions(ASK_WORK_PROVIDER_REGISTRY, []), { workTypes: [], statusesByWorkType: {} });
});

test('role restrictions also make a page partial, and are reported as such', async () => {
  const empty = async () => ({ rows: [], total: 0, viewCounts: null });
  const readers = Object.fromEntries(ASK_WORK_PROVIDER_REGISTRY.filter((entry) => entry.reader.state === 'CONNECTED').map((entry) => [entry.id, empty]));
  const page = await composeAskWorkPage({ ...input, role: 'VIEWER' }, q({ view: 'NEEDS_YOU' }), readers);
  const gaps = page.providers.filter((entry) => entry.state !== 'AVAILABLE').map((entry) => [entry.providerId, entry.state]);
  assert.ok(gaps.some(([id, state]) => id === 'MONITORS' && state === 'RESTRICTED'));
  assert.ok(page.partial);
});

test('completed retention bounds the lists, not the records', async () => {
  assert.equal(ASK_WORK_LISTING_RETENTION_DAYS.claimsCompleted, 730);
  assert.equal(ASK_WORK_LISTING_RETENTION_DAYS.scoreExportsCompleted, 30);
  const claimCalls = [];
  prisma.claim = { findMany: async (args) => { claimCalls.push(args); return []; }, count: async (args) => { claimCalls.push(args); return 0; } };
  prisma.operationalWorkExecution = { findMany: async () => [] };
  await readClaimWork(ctx, { view: 'COMPLETED', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(claimCalls[0].where), /"status":"CLOSED","updatedAt":\{"gte"/);
  await readClaimWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null, entityId: 'c-old' });
  assert.doesNotMatch(JSON.stringify(claimCalls.at(-3).where), /"gte"/, 'opening an old claim by key is never blocked by the listing window');
  const jobCalls = { report: [], score: [] };
  prisma.homeReportExport = { findMany: async (a) => { jobCalls.report.push(a); return []; }, count: async () => 0 };
  prisma.homeScoreExportJob = { findMany: async (a) => { jobCalls.score.push(a); return []; }, count: async () => 0 };
  await readQueuedJobWork(ctx, { view: 'COMPLETED', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(jobCalls.score[0].where), /"createdAt":\{"gte"/);
  await readQueuedJobWork(ctx, { view: 'ARCHIVED', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(jobCalls.report.at(-1).where), /"expiresAt":\{"gt"/);
});
