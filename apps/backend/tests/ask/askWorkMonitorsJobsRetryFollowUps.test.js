const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { monitorLifecycleView, monitorRow, readMonitorWork } = require('../../src/services/ask/work/monitors.reader.ts');
const { retryableExecutionRow, readRetryableExecutionWork } = require('../../src/services/ask/work/retryableExecutions.reader.ts');
const { reportExportView, scoreExportView, reportExportRow, scoreExportRow, readQueuedJobWork } = require('../../src/services/ask/work/queuedJobs.reader.ts');
const { claimFollowUpRow, projectFollowUpRow, readScheduledFollowUpWork } = require('../../src/services/ask/work/scheduledFollowUps.reader.ts');
const { validateAskWorkProviders, composeAskWorkPage, ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { ASK_WORK_PROVIDER_REGISTRY, workProviderReadFloor } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'CONTRIBUTOR' };
const NOW = new Date('2026-10-10T12:00:00.000Z');
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const fail = () => { throw new Error('the Work GET must not write'); };

test('monitor views: watching is active, paused waits, stopped is not work; only the caller\'s own monitors are read', async () => {
  assert.equal(monitorLifecycleView('ACTIVE'), 'ACTIVE');
  assert.equal(monitorLifecycleView('PAUSED'), 'WAITING');
  assert.equal(monitorLifecycleView('STOPPED'), null);
  const monitor = { id: 'm1', propertyId: 'p1', product: 'FIXED_30_YEAR', thresholdBps: 575, status: 'PAUSED', confirmationVersion: 3, updatedAt: at(5) };
  const row = monitorRow(monitor);
  assert.equal(row.workKey, 'monitor:refinanceRate:m1');
  assert.equal(row.summary, 'Alert threshold 5.75%');
  assert.equal(row.freshness.version, '3');
  assert.equal(row.nextAction.label, 'Resume or stop this alert');
  const calls = [];
  prisma.refinanceRateMonitor = { findMany: async (args) => { calls.push(args); return [monitor]; }, count: async () => 1, update: fail, upsert: fail, create: fail };
  const page = await readMonitorWork(ctx, { view: 'WAITING', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(calls[0].where), /"userId":"u1"/);
  assert.match(JSON.stringify(calls[0].where), /"propertyId":"p1"/);
  assert.equal(page.rows.length, 1);
  assert.deepEqual(Object.keys(page.viewCounts).sort(), ['ACTIVE', 'ARCHIVED', 'COMPLETED', 'NEEDS_YOU', 'SCHEDULED', 'WAITING']);
});

test('retryable executions: only explicit FAILED_RETRYABLE, not already retried, own and this home; retry is identified, never run', async () => {
  const calls = [];
  prisma.askExecution = {
    findMany: async (args) => { calls.push(args); return [{ id: 'e1', sessionId: 's1', propertyId: 'p1', message: 'Add a water heater', operationId: 'INVENTORY_ITEM_CREATE', contextVersion: 'c1', updatedAt: at(5) }]; },
    count: async () => 1, update: fail, updateMany: fail, create: fail,
  };
  prisma.askExecutionEvent = { create: fail };
  const page = await readRetryableExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"userId":"u1"/);
  assert.match(where, /"propertyId":"p1"/);
  assert.match(where, /"status":"FAILED_RETRYABLE"/);
  assert.match(where, /"events":\{"none":\{"eventType":"RETRY_STARTED"\}\}/);
  assert.equal(page.rows[0].workKey, 'execution:e1');
  assert.equal(page.rows[0].nextAction.retryExecutionId, 'e1');
  assert.equal(page.rows[0].resume.launch.operationId, 'INVENTORY_ITEM_CREATE');
  const other = await readRetryableExecutionWork(ctx, { view: 'ACTIVE', after: null, limit: 5, status: null });
  assert.deepEqual(other.rows, []);
  const filtered = [];
  prisma.askExecution.findMany = async (args) => { filtered.push(args); return []; };
  await readRetryableExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: 'FAILED_TERMINAL' });
  assert.match(JSON.stringify(filtered[0].where), /"in":\[\]/, 'a terminal-failure status filter yields nothing: ordinary failures are not retryable work');
  assert.equal(retryableExecutionRow({ id: 'e2', sessionId: 's', propertyId: 'p1', message: '', operationId: null, contextVersion: null, updatedAt: at(1) }, 'p1').title, 'Request that did not finish');
});

test('queued job views: failed needs you, queued waits, preparing is active, ready completes until it expires, deleted is gone', () => {
  assert.equal(reportExportView('FAILED', null, null, NOW), 'NEEDS_YOU');
  assert.equal(reportExportView('PENDING', null, null, NOW), 'WAITING');
  assert.equal(reportExportView('GENERATING', null, null, NOW), 'ACTIVE');
  assert.equal(reportExportView('READY', null, null, NOW), 'COMPLETED');
  assert.equal(reportExportView('READY', at(20), null, NOW), 'COMPLETED');
  assert.equal(reportExportView('READY', at(1), null, NOW), 'ARCHIVED');
  assert.equal(reportExportView('EXPIRED', null, null, NOW), 'ARCHIVED');
  assert.equal(reportExportView('DELETED', null, null, NOW), null);
  assert.equal(reportExportView('READY', null, at(1), NOW), null);
  assert.equal(scoreExportView('QUEUED'), 'WAITING');
  assert.equal(scoreExportView('RUNNING'), 'ACTIVE');
  assert.equal(scoreExportView('DONE'), 'COMPLETED');
  assert.equal(scoreExportView('FAILED'), 'NEEDS_YOU');
});

test('queued job reader merges report and score exports for the caller and this home and counts both', async () => {
  const calls = { report: [], score: [] };
  prisma.homeReportExport = {
    findMany: async (args) => { calls.report.push(args); return [{ id: 'r1', propertyId: 'p1', type: 'HOME_REPORT_PACK', status: 'FAILED', requestedAt: at(5), expiresAt: null, deletedAt: null }]; },
    count: async () => 1, update: fail, create: fail,
  };
  prisma.homeScoreExportJob = {
    findMany: async (args) => { calls.score.push(args); return [{ id: 's1', jobStatus: 'FAILED', format: 'PDF', createdAt: at(6) }]; },
    count: async () => 2, update: fail, create: fail,
  };
  const page = await readQueuedJobWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.deepEqual(page.rows.map((row) => row.workKey), ['job:scoreExport:s1', 'job:reportExport:r1']);
  assert.equal(page.total, 3);
  assert.equal(page.viewCounts.NEEDS_YOU, 3);
  assert.match(JSON.stringify(calls.report[0].where), /"userId":"u1"/);
  assert.match(JSON.stringify(calls.score[0].where), /"requestedByUserId":"u1"/);
  assert.match(JSON.stringify(calls.score[0].where), /"report":\{"propertyId":"p1"\}/);
  assert.equal(reportExportRow({ id: 'r2', propertyId: 'p1', type: 'INVENTORY', status: 'DELETED', requestedAt: at(1), expiresAt: null, deletedAt: null }, NOW), null);
  assert.equal(scoreExportRow({ id: 's2', jobStatus: 'DONE', format: 'JSON', createdAt: at(2) }, 'p1').title, 'Home score report (JSON)');
});

test('scheduled follow-ups: future claim and project dates, each its own work with its own due date, only the Scheduled view', async () => {
  const claim = { id: 'c1', propertyId: 'p1', title: 'Water claim', status: 'SUBMITTED', nextFollowUpAt: at(20), updatedAt: at(6) };
  const project = { id: 'pr1', propertyId: 'p1', name: 'Roof', status: 'COMPLETED', followUpDueAt: at(25), updatedAt: at(5) };
  const calls = { claim: [], project: [] };
  prisma.claim = { findMany: async (args) => { calls.claim.push(args); return [claim]; }, count: async () => 1 };
  prisma.projectRecord = { findMany: async (args) => { calls.project.push(args); return [project]; }, count: async () => 1 };
  const page = await readScheduledFollowUpWork(ctx, { view: 'SCHEDULED', after: null, limit: 5, status: null });
  assert.deepEqual(page.rows.map((row) => row.workKey), ['followUp:claim:c1', 'followUp:project:pr1']);
  assert.deepEqual(page.rows.map((row) => row.sourceAliases), [[], []], 'a follow-up is its own work, not an alias of its claim or project');
  assert.equal(page.rows[0].dueAt, at(20).toISOString());
  assert.equal(page.total, 2);
  assert.match(JSON.stringify(calls.claim[0].where), /"nextFollowUpAt":\{"gt"/);
  assert.match(JSON.stringify(calls.project[0].where), /"followUpCompletedAt":null/);
  const none = await readScheduledFollowUpWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.deepEqual(none.rows, []);
  assert.equal(claimFollowUpRow(claim).lifecycleView, 'SCHEDULED');
  assert.equal(projectFollowUpRow(project).summary, 'Completed');
});

test('only unknown-outcome remains unavailable, with a stated reason; everything else is connected and valid', async () => {
  assert.deepEqual(validateAskWorkProviders(), []);
  const unavailable = ASK_WORK_PROVIDER_REGISTRY.filter((entry) => entry.reader.state === 'UNAVAILABLE').map((entry) => entry.id).sort();
  assert.deepEqual(unavailable, ['UNKNOWN_OUTCOME_EXECUTIONS']);
  for (const id of unavailable) assert.ok(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === id).reader.reason.length > 20);
  for (const entry of ASK_WORK_PROVIDER_REGISTRY.filter((candidate) => candidate.reader.state === 'CONNECTED')) assert.ok(ASK_WORK_PROVIDER_READERS[entry.id], entry.id);
  assert.equal(workProviderReadFloor(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'SCHEDULED_FOLLOW_UPS')), 'VIEWER');
  assert.equal(workProviderReadFloor(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'QUEUED_JOBS')), null);
});

test('the page stays partial while a required provider is unavailable, naming each one', async () => {
  const empty = async () => ({ rows: [], total: 0, viewCounts: null });
  const readers = Object.fromEntries(ASK_WORK_PROVIDER_REGISTRY.filter((entry) => entry.reader.state === 'CONNECTED').map((entry) => [entry.id, empty]));
  const page = await composeAskWorkPage({ userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' }, { view: 'NEEDS_YOU', limit: 5, after: null, workType: null, status: null }, readers);
  assert.equal(page.partial, true);
  assert.equal(page.total, null);
  assert.equal(page.totalScope, 'PARTIAL');
  assert.deepEqual(page.providers.filter((entry) => entry.state === 'UNAVAILABLE').map((entry) => entry.providerId).sort(), ['UNKNOWN_OUTCOME_EXECUTIONS']);
  assert.ok(page.providers.every((entry) => entry.required));
});
