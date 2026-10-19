const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readDecisionThreadWork, decisionThreadLifecycleView, decisionThreadRow } = require('../../src/services/ask/work/decisionThreads.reader.ts');
const { readIncidentWork, incidentLifecycleView, incidentRow } = require('../../src/services/ask/work/incidents.reader.ts');
const { validateAskWorkProviders, composeAskWorkPage, ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'VIEWER' };
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const fail = () => { throw new Error('the Work GET must not write'); };

test('decision thread views: gathering and comparing need you, stale-in-motion needs you, decided waits, finished archives', () => {
  for (const status of ['OPEN', 'GATHERING_CONTEXT', 'READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE']) assert.equal(decisionThreadLifecycleView(status, 'CURRENT'), 'NEEDS_YOU', status);
  assert.equal(decisionThreadLifecycleView('ACTION_IN_PROGRESS', 'CURRENT'), 'ACTIVE');
  assert.equal(decisionThreadLifecycleView('ACTION_IN_PROGRESS', 'STALE'), 'NEEDS_YOU');
  assert.equal(decisionThreadLifecycleView('DECIDED', 'CURRENT'), 'WAITING');
  assert.equal(decisionThreadLifecycleView('DECIDED', 'CONFLICTED'), 'NEEDS_YOU');
  assert.equal(decisionThreadLifecycleView('COMPLETED', 'CURRENT'), 'COMPLETED');
  assert.equal(decisionThreadLifecycleView('ABANDONED', 'CURRENT'), 'ARCHIVED');
  assert.equal(decisionThreadLifecycleView('ARCHIVED', 'STALE'), 'ARCHIVED');
});

const thread = (id, lifecycleStatus, day, extra = {}) => ({ decisionDefinitionId: 'HVAC_REPAIR_REPLACE', id, propertyId: 'p1', title: `Decision ${id}`, lifecycleStatus, contextStatus: 'CURRENT', primaryEntityType: 'InventoryItem', primaryEntityId: 'inv1', version: 3, updatedAt: at(day), currentRecommendationSnapshot: null, ...extra });

test('a decision family Ask cannot continue is still listed, with its resume marked unavailable and a reason', () => {
  const row = decisionThreadRow(thread('t9', 'RECOMMENDATION_AVAILABLE', 4, { decisionDefinitionId: 'ROOF_REPAIR_REPLACE' }));
  assert.equal(row.workKey, 'decisionThread:t9');
  assert.equal(row.nextAction, null);
  assert.equal(row.resume.launch.operationId, null);
  assert.match(row.resume.unavailableReason, /Ask cannot continue/);
  assert.equal(row.lifecycleView, 'NEEDS_YOU');
});

test('decision thread row carries the thread identity, version and the continue launch (HVAC_DECISION_CONTINUE)', () => {
  const row = decisionThreadRow(thread('t1', 'RECOMMENDATION_AVAILABLE', 4));
  assert.equal(row.workKey, 'decisionThread:t1');
  assert.equal(row.providerId, 'DECISION_THREADS');
  assert.equal(row.freshness.version, '3');
  assert.equal(row.resume.launch.decisionThreadId, 't1');
  assert.equal(row.resume.launch.operationId, 'HVAC_DECISION_CONTINUE');
  assert.equal(row.resume.launch.entityId, 'inv1');
  assert.equal(row.nextAction.label, 'Review the recommendation');
  assert.equal(decisionThreadRow(thread('t2', 'ACTION_IN_PROGRESS', 4, { contextStatus: 'STALE' })).nextAction.label, 'Review what changed');
});

test('decision thread reader is property scoped, lists every family, read-only, and counts every view', async () => {
  const calls = [];
  prisma.decisionThread = {
    findMany: async (args) => { calls.push(args); return [thread('t1', 'OPEN', 5)]; },
    count: async () => 1,
    groupBy: async () => [{ lifecycleStatus: 'OPEN', contextStatus: 'CURRENT', _count: { _all: 2 } }, { lifecycleStatus: 'COMPLETED', contextStatus: 'CURRENT', _count: { _all: 3 } }, { lifecycleStatus: 'DECIDED', contextStatus: 'STALE', _count: { _all: 1 } }],
    update: fail, updateMany: fail, create: fail,
  };
  const page = await readDecisionThreadWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"propertyId":"p1"/);
  assert.doesNotMatch(where, /decisionDefinitionId/, 'no decision family is suppressed');
  assert.equal(page.rows[0].workKey, 'decisionThread:t1');
  assert.deepEqual(page.viewCounts, { NEEDS_YOU: 3, ACTIVE: 0, WAITING: 0, SCHEDULED: 0, COMPLETED: 3, ARCHIVED: 0 });
  await readDecisionThreadWork(ctx, { view: 'NEEDS_YOU', after: { sortAt: at(5).toISOString(), workKey: 'zzz:1' }, limit: 5, status: 'OPEN' });
  assert.match(JSON.stringify(calls[1].where), /"lifecycleStatus":"OPEN"/);
  assert.match(JSON.stringify(calls[1].where), /"in":\[\]/);
});

const NOW = new Date('2026-10-10T12:00:00.000Z');
const view = (status, extra = {}) => incidentLifecycleView({ status, snoozedUntil: null, archivedByCaller: false, now: NOW, ...extra });

test('incident views: unhandled needs you, being handled is active, contained or snoozed waits, resolved completes, lapsed or archived archive', () => {
  assert.equal(view('DETECTED'), 'NEEDS_YOU');
  assert.equal(view('EVALUATED'), 'NEEDS_YOU');
  assert.equal(view('ACTIVE'), 'NEEDS_YOU');
  assert.equal(view('ACTIONED'), 'ACTIVE');
  assert.equal(view('MITIGATED'), 'WAITING');
  assert.equal(view('ACTIVE', { snoozedUntil: new Date('2026-10-11T00:00:00Z') }), 'WAITING');
  assert.equal(view('ACTIVE', { snoozedUntil: new Date('2026-10-09T00:00:00Z') }), 'NEEDS_YOU');
  assert.equal(view('RESOLVED'), 'COMPLETED');
  assert.equal(view('EXPIRED'), 'ARCHIVED');
  assert.equal(view('ACTIVE', { archivedByCaller: true }), 'ARCHIVED', 'archiving never orphans an incident');
  assert.equal(view('RESOLVED', { archivedByCaller: true }), 'ARCHIVED');
  assert.equal(view('SUPPRESSED'), null);
});

const incident = (id, status, day, extra = {}) => ({ id, propertyId: 'p1', title: `Incident ${id}`, summary: null, status, severity: 'WARNING', snoozedUntil: null, updatedAt: at(day), userPreferences: [], ...extra });

test('incident row keeps the canonical status and the home work item alias', () => {
  const row = incidentRow(incident('i1', 'ACTIVE', 6), NOW, ['w1']);
  assert.equal(row.workKey, 'incident:i1');
  assert.deepEqual(row.sourceAliases, ['workItem:w1']);
  assert.equal(row.status.canonical, 'ACTIVE');
  assert.equal(row.lifecycleView, 'NEEDS_YOU');
  assert.equal(row.resume.launch.operationId, 'INCIDENT_CONTINUATION');
  assert.equal(incidentRow(incident('i2', 'SUPPRESSED', 6), NOW), null);
});

test('incident reader hides suppressed incidents, honors the caller archive, batches the alias lookup, and never writes', async () => {
  const calls = { findMany: [], count: [], sources: [] };
  prisma.incident = {
    findMany: async (args) => { calls.findMany.push(args); return [incident('i1', 'ACTIVE', 6), incident('i2', 'DETECTED', 5)]; },
    count: async (args) => { calls.count.push(args); return 7; },
    update: fail, updateMany: fail, create: fail,
  };
  prisma.operationalWorkSource = { findMany: async (args) => { calls.sources.push(args); return [{ workItemId: 'w9', sourceEntityId: 'i2' }]; }, create: fail, update: fail };
  const page = await readIncidentWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.match(JSON.stringify(calls.findMany[0].where), /"isSuppressed":false/);
  assert.match(JSON.stringify(calls.findMany[0].select.userPreferences), /"userId":"u1"/);
  assert.equal(calls.sources.length, 1, 'one batched alias lookup, not one per row');
  assert.deepEqual(calls.sources[0].where.sourceEntityId.in, ['i1', 'i2']);
  assert.deepEqual(page.rows.map((row) => row.sourceAliases), [[], ['workItem:w9']]);
  assert.equal(page.total, 7);
  assert.deepEqual(Object.keys(page.viewCounts).sort(), ['ACTIVE', 'ARCHIVED', 'COMPLETED', 'NEEDS_YOU', 'SCHEDULED', 'WAITING']);
});

test('decisions and incidents are connected providers, valid at startup, and no longer reported unavailable', async () => {
  assert.deepEqual(validateAskWorkProviders(), []);
  for (const id of ['DECISION_THREADS', 'INCIDENTS']) assert.equal(ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === id).reader.state, 'CONNECTED');
  prisma.askExecution = { findMany: async () => [] };
  prisma.operationalWorkItem = { findMany: async () => [], count: async () => 0, groupBy: async () => [] };
  prisma.operationalWorkSource = { findMany: async () => [] };
  prisma.operationalWorkExecution = { findMany: async () => [] };
  prisma.decisionThread = { findMany: async () => [], count: async () => 0, groupBy: async () => [] };
  prisma.incident = { findMany: async () => [], count: async () => 0 };
  const page = await composeAskWorkPage({ userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' }, { view: 'NEEDS_YOU', limit: 5, after: null, workType: null, status: null }, { PENDING_EXECUTIONS: ASK_WORK_PROVIDER_READERS.PENDING_EXECUTIONS, OPERATIONAL_WORK_ITEMS: ASK_WORK_PROVIDER_READERS.OPERATIONAL_WORK_ITEMS, DECISION_THREADS: ASK_WORK_PROVIDER_READERS.DECISION_THREADS, INCIDENTS: ASK_WORK_PROVIDER_READERS.INCIDENTS });
  for (const id of ['PENDING_EXECUTIONS', 'OPERATIONAL_WORK_ITEMS', 'DECISION_THREADS', 'INCIDENTS']) assert.equal(page.providers.find((entry) => entry.providerId === id).state, 'AVAILABLE', id);
});
