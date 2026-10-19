const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { resolveAskWork, parseAskWorkKey } = require('../../src/services/ask/work/askWorkResolve.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { readPendingExecutionWork } = require('../../src/services/ask/work/pendingExecutions.reader.ts');
const { readRetryableExecutionWork } = require('../../src/services/ask/work/retryableExecutions.reader.ts');

const base = { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' };
const row = (providerId, workKey, extra = {}) => ({
  workKey, sourceAliases: [], providerId, workType: 'PROJECT', propertyId: 'p1', entity: { type: 'x', id: 'x' }, title: 't', summary: null, status: { canonical: 'OPEN', label: 'Open' },
  lifecycleView: 'ACTIVE', nextAction: null, sortAt: '2026-10-05T12:00:00.000Z', freshness: { version: 'v1', asOf: 'a' }, sourceOwner: 'o',
  resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: {} }, ...extra,
});
const readerOf = (rows) => async (_ctx, query) => ({ rows: rows.filter((r) => r.workKey.endsWith(query.entityId)), total: rows.length, viewCounts: null });
const found = (value) => ({ findFirst: async () => value });
const writeless = () => { throw new Error('resolve must not write'); };

test('keys parse to their owning provider and reject malformed keys', () => {
  assert.deepEqual(parseAskWorkKey('project:abc'), { provider: 'PROJECTS', kind: 'project', entityId: 'abc' });
  assert.deepEqual(parseAskWorkKey('followUp:claim:c1'), { provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpClaim', entityId: 'c1' });
  assert.deepEqual(parseAskWorkKey('job:scoreExport:s1'), { provider: 'QUEUED_JOBS', kind: 'scoreExport', entityId: 's1' });
  assert.equal(parseAskWorkKey('nonsense'), null);
  assert.equal(parseAskWorkKey('project:'), null);
});

test('gone work is DELETED; an unknown key is DELETED', async () => {
  prisma.projectRecord = found(null);
  assert.equal((await resolveAskWork({ ...base, workKey: 'project:p9' }, {})).outcome, 'DELETED');
  assert.equal((await resolveAskWork({ ...base, workKey: 'bogus' }, {})).outcome, 'DELETED');
});

test('current work is AVAILABLE with its row and version; a changed version is STALE with the current row; finished is COMPLETED', async () => {
  prisma.projectRecord = found({ id: 'pr1' });
  const readers = { PROJECTS: readerOf([row('PROJECTS', 'project:pr1'), row('PROJECTS', 'project:pr2', { lifecycleView: 'COMPLETED' })]) };
  const ok = await resolveAskWork({ ...base, workKey: 'project:pr1', expectedVersion: 'v1' }, readers);
  assert.equal(ok.outcome, 'AVAILABLE');
  assert.equal(ok.currentVersion, 'v1');
  assert.equal(ok.row.workKey, 'project:pr1');
  const stale = await resolveAskWork({ ...base, workKey: 'project:pr1', expectedVersion: 'v0' }, readers);
  assert.equal(stale.outcome, 'STALE');
  assert.equal(stale.row.freshness.version, 'v1');
  prisma.projectRecord = found({ id: 'pr2' });
  assert.equal((await resolveAskWork({ ...base, workKey: 'project:pr2' }, readers)).outcome, 'COMPLETED');
});

test('a role below the provider floor is ACCESS_LOST and the reader is never called', async () => {
  prisma.refinanceRateMonitor = found({ status: 'ACTIVE' });
  let called = false;
  const result = await resolveAskWork({ ...base, role: 'VIEWER', workKey: 'monitor:refinanceRate:m1' }, { MONITORS: async () => { called = true; return { rows: [], total: 0, viewCounts: null }; } });
  assert.equal(result.outcome, 'ACCESS_LOST');
  assert.equal(called, false);
});

test('an execution that was retried is SUPERSEDED by its retry; a finished one is COMPLETED; an expired one is STALE', async () => {
  const executionRow = (status, events = []) => ({ status, events });
  prisma.askExecution = found(executionRow('FAILED_RETRYABLE', [{ metadataJson: { retryExecutionId: 'e2' } }]));
  const retried = await resolveAskWork({ ...base, workKey: 'execution:e1' }, {});
  assert.equal(retried.outcome, 'SUPERSEDED');
  assert.equal(retried.supersededBy, 'execution:e2');
  prisma.askExecution = found(executionRow('COMPLETED'));
  assert.equal((await resolveAskWork({ ...base, workKey: 'execution:e1' }, {})).outcome, 'COMPLETED');
  prisma.askExecution = found(executionRow('EXPIRED'));
  assert.equal((await resolveAskWork({ ...base, workKey: 'execution:e1' }, {})).outcome, 'STALE');
});

test('an open execution is read by its own provider, a failed-retryable one by the retryable provider', async () => {
  const pending = row('PENDING_EXECUTIONS', 'execution:e1', { workType: 'PENDING_EXECUTION' });
  const retryable = row('RETRYABLE_EXECUTIONS', 'execution:e3', { workType: 'RETRYABLE_EXECUTION' });
  const readers = { PENDING_EXECUTIONS: readerOf([pending]), RETRYABLE_EXECUTIONS: readerOf([retryable]) };
  prisma.askExecution = found({ status: 'NEEDS_CONFIRMATION', events: [] });
  assert.equal((await resolveAskWork({ ...base, workKey: 'execution:e1' }, readers)).row.providerId, 'PENDING_EXECUTIONS');
  prisma.askExecution = found({ status: 'FAILED_RETRYABLE', events: [] });
  assert.equal((await resolveAskWork({ ...base, workKey: 'execution:e3' }, readers)).row.providerId, 'RETRYABLE_EXECUTIONS');
});

test('journeys and renovation cases that moved into a project are SUPERSEDED by it; branched journeys by their child', async () => {
  prisma.guidanceJourney = found({ status: 'ACTIVE', projectRecord: { id: 'pr1' }, childJourneys: [] });
  const viaProject = await resolveAskWork({ ...base, workKey: 'journey:j1' }, {});
  assert.deepEqual([viaProject.outcome, viaProject.supersededBy], ['SUPERSEDED', 'project:pr1']);
  prisma.guidanceJourney = found({ status: 'BRANCHED', projectRecord: null, childJourneys: [{ id: 'j2' }] });
  assert.equal((await resolveAskWork({ ...base, workKey: 'journey:j1' }, {})).supersededBy, 'journey:j2');
  prisma.guidanceJourney = found({ status: 'ABORTED', projectRecord: null, childJourneys: [] });
  assert.equal((await resolveAskWork({ ...base, workKey: 'journey:j1' }, {})).outcome, 'STALE');
  prisma.renovationCase = found({ executionProject: { id: 'pr7' } });
  assert.equal((await resolveAskWork({ ...base, workKey: 'renovation:r1' }, {})).supersededBy, 'project:pr7');
});

test('a home work item merged into another, or owned by a connected canonical provider, is SUPERSEDED; a suggestion is STALE', async () => {
  const item = (extra) => ({ state: 'ACCEPTED', supersededByWorkItemId: null, executions: [], sources: [], ...extra });
  prisma.operationalWorkItem = found(item({ supersededByWorkItemId: 'w2' }));
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, {})).supersededBy, 'workItem:w2');
  prisma.operationalWorkItem = found(item({ executions: [{ executionType: 'PROJECT', executionEntityId: 'pr1' }] }));
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, {})).supersededBy, 'project:pr1');
  prisma.operationalWorkItem = found(item({ executions: [{ executionType: 'CLAIM', executionEntityId: 'c1' }] }));
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, {})).supersededBy, 'claim:c1');
  prisma.operationalWorkItem = found(item({ sources: [{ sourceEntityId: 'i1' }] }));
  prisma.incident = found({ id: 'i1' });
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, {})).supersededBy, 'incident:i1');
  prisma.incident = found(null);
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, { OPERATIONAL_WORK_ITEMS: readerOf([row('OPERATIONAL_WORK_ITEMS', 'workItem:w1')]) })).outcome, 'AVAILABLE', 'a work item whose incident is hidden stays a home work item');
  prisma.operationalWorkItem = found(item({ state: 'CANDIDATE' }));
  assert.equal((await resolveAskWork({ ...base, workKey: 'workItem:w1' }, {})).outcome, 'STALE');
  const unowned = ASK_WORK_PROVIDER_REGISTRY.map((entry) => ({ ...entry, reader: entry.id === 'OPERATIONAL_WORK_ITEMS' ? { state: 'CONNECTED' } : { state: 'UNAVAILABLE', reason: 'test' } }));
  prisma.operationalWorkItem = found(item({ executions: [{ executionType: 'PROJECT', executionEntityId: 'pr1' }] }));
  const stillTheirs = await resolveAskWork({ ...base, workKey: 'workItem:w1' }, { OPERATIONAL_WORK_ITEMS: readerOf([row('OPERATIONAL_WORK_ITEMS', 'workItem:w1')]) }, unowned);
  assert.equal(stillTheirs.outcome, 'AVAILABLE', 'no supersession while the canonical provider is not connected');
});

test('a follow-up whose date passed hands over to its claim; a suppressed incident is STALE', async () => {
  prisma.claim = found({ id: 'c1' });
  const handover = await resolveAskWork({ ...base, workKey: 'followUp:claim:c1' }, { SCHEDULED_FOLLOW_UPS: readerOf([]) });
  assert.deepEqual([handover.outcome, handover.supersededBy], ['SUPERSEDED', 'claim:c1']);
  prisma.incident = found({ isSuppressed: true });
  assert.equal((await resolveAskWork({ ...base, workKey: 'incident:i1' }, {})).outcome, 'STALE');
});

test('a real reader is called with an entity lookup, in every view, and resolve writes nothing', async () => {
  const calls = [];
  prisma.askExecution = {
    findFirst: async () => ({ status: 'NEEDS_CONFIRMATION', events: [] }),
    findMany: async (args) => { calls.push(args); return []; },
    update: writeless, updateMany: writeless, create: writeless,
  };
  prisma.askExecutionEvent = { create: writeless };
  const result = await resolveAskWork({ ...base, workKey: 'execution:e1' }, { PENDING_EXECUTIONS: readPendingExecutionWork, RETRYABLE_EXECUTIONS: readRetryableExecutionWork });
  assert.equal(result.outcome, 'STALE');
  assert.equal(calls[0].where.id, 'e1');
  assert.ok(ASK_WORK_PROVIDER_READERS.PENDING_EXECUTIONS);
});
