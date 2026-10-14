'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Owner ruling D-H6 (docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md): partial handoffs are detected read-only and repaired through the same
// transaction-aware completion a new handoff uses, idempotently, only with a stated intake mode. No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const readiness = require('../../src/services/renovationReadiness.service.ts');
const repair = require('../../src/services/renovationHandoffRepair.service.ts');

const PROJECT = {
  id: 'proj-1', propertyId: 'prop-1', name: 'Kitchen', status: 'DRAFT', renovationCaseId: 'case-1', sourceActionId: 'renovation-handoff:key-1',
  inheritedConditions: [{ id: 'c-1', status: 'OPEN' }, { id: 'c-2', status: 'SATISFIED' }], milestones: [{ status: 'UPCOMING' }],
};

function world({ link = false, readinessEvent = false, caseEvent = false, status = 'DRAFT', lifecycle = 'PREPARING_TO_START' } = {}) {
  const state = { link, readinessEvent, caseEvent, status, lifecycle, upcoming: 1 };
  const saved = {};
  const set = (name, value) => { saved[name] = prisma[name]; prisma[name] = value; };
  const project = () => ({ ...PROJECT, status: state.status, milestones: Array.from({ length: state.upcoming }, () => ({ status: 'UPCOMING' })) });
  const writes = [];
  set('projectRecord', {
    findMany: async () => [project()],
    findUnique: async () => ({ id: 'proj-1', name: 'Kitchen', description: null, startDate: new Date('2026-11-01'), expectedEndDate: null, updatedAt: new Date(), renovationScopeVersionId: 'scope-1' }),
  });
  set('renovationCase', { findFirst: async () => ({ lifecycle: state.lifecycle, createdByUserId: 'owner-1' }) });
  set('renovationCaseLink', { findMany: async () => (state.link ? [{ id: 'l' }] : []) });
  set('renovationReadinessEvent', { findMany: async () => (state.readinessEvent ? [{ payload: { projectId: 'proj-1' } }] : []) });
  set('renovationCaseEvent', { findMany: async () => (state.caseEvent ? [{ payload: { projectId: 'proj-1' } }] : []) });
  const tx = {
    projectRecord: { updateMany: async ({ where, data }) => { if (state.status === where.status) { state.status = data.status; writes.push('status'); return { count: 1 }; } return { count: 0 }; } },
    projectMilestone: { updateMany: async () => { const n = state.upcoming; state.upcoming = 0; if (n) writes.push('milestones'); return { count: n }; } },
    renovationCaseLink: { findFirst: async () => (state.link ? { id: 'l' } : null), create: async () => { state.link = true; writes.push('link'); return { id: 'l' }; } },
    renovationCase: { findFirst: async () => ({ lifecycle: state.lifecycle }), update: async ({ data }) => { state.lifecycle = data.lifecycle; writes.push('lifecycle'); return {}; } },
    renovationReadinessEvent: {
      findMany: async () => (state.readinessEvent ? [{ payload: { projectId: 'proj-1' } }] : []),
      create: async ({ data }) => { state.readinessEvent = true; writes.push(['readinessEvent', data.payload]); return {}; },
    },
    renovationCaseEvent: {
      findFirst: async () => (state.caseEvent ? { id: 'e' } : null),
      create: async ({ data }) => {
        // The link also writes a CONTRIBUTOR_LINKED event; only the handoff event counts as the handoff's case event.
        if (data.eventType === 'PROJECT_HANDOFF_STARTED') { state.caseEvent = true; writes.push(['caseEvent', data.idempotencyKey]); }
        return {};
      },
    },
  };
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) => callback(tx);
  return { state, writes, restore() { for (const [name, value] of Object.entries(saved)) prisma[name] = value; prisma.$transaction = originalTransaction; } };
}

test('detection is read only and classifies exactly what is missing', async () => {
  const w = world();
  try {
    const [candidate] = await repair.detectIncompleteHandoffs();
    assert.deepEqual(candidate.missing, ['STATUS', 'CASE_LINK', 'READINESS_EVENT', 'CASE_EVENT', 'MILESTONES_BLOCKED']);
    assert.equal(candidate.idempotencyKey, 'key-1');
    assert.equal(candidate.openConditionCount, 1);
    assert.deepEqual(w.writes, [], 'detection writes nothing');
  } finally { w.restore(); }
  const complete = world({ link: true, readinessEvent: true, caseEvent: true, status: 'PLANNING', lifecycle: 'READY_TO_START' });
  try { assert.deepEqual(await repair.detectIncompleteHandoffs(), []); } finally { complete.restore(); }
  const onlyLink = world({ link: false, readinessEvent: true, caseEvent: true, status: 'PLANNING' });
  try {
    const [c] = await repair.detectIncompleteHandoffs();
    assert.deepEqual(c.missing, ['CASE_LINK'], 'a missing link alone is a partial handoff, and a Project past DRAFT is not re-blocked');
  } finally { onlyLink.restore(); }
});

test('the plan states the intended status and lifecycle per intake mode, and none until a mode is chosen', async () => {
  const w = world();
  try {
    const [candidate] = await repair.detectIncompleteHandoffs();
    const none = repair.planHandoffRepair(candidate, null);
    assert.deepEqual([none.projectStatusAfter, none.caseLifecycleAfter], [null, null]);
    const planned = repair.planHandoffRepair(candidate, 'PLANNED');
    assert.deepEqual([planned.projectStatusAfter, planned.caseLifecycleAfter], ['PLANNING', 'READY_TO_START']);
    const started = repair.planHandoffRepair(candidate, 'ALREADY_STARTED');
    assert.deepEqual([started.projectStatusAfter, started.caseLifecycleAfter], ['IN_PROGRESS', 'IN_EXECUTION']);
    const historical = repair.planHandoffRepair(candidate, 'HISTORICAL');
    assert.deepEqual([historical.projectStatusAfter, historical.caseLifecycleAfter], ['PLANNING', 'PREPARING_TO_START']);
  } finally { w.restore(); }
});

test('a non-planned repair needs a stated reason; nothing is applied without one', async () => {
  const w = world();
  try {
    await assert.rejects(() => repair.repairIncompleteHandoff({ projectId: 'proj-1', intakeMode: 'ALREADY_STARTED', historicalReason: 'short' }), /at least 20 characters/);
    assert.deepEqual(w.writes, []);
  } finally { w.restore(); }
});

test('applying completes every missing step with the shared logic, marks the events as repaired, and a second run changes nothing', async () => {
  const w = world();
  try {
    const first = await repair.repairIncompleteHandoff({ projectId: 'proj-1', intakeMode: 'PLANNED' });
    assert.equal(first.outcome, 'APPLIED');
    assert.deepEqual(first.applied, ['STATUS', 'MILESTONES_BLOCKED', 'CASE_LINK', 'CASE_LIFECYCLE', 'READINESS_EVENT', 'CASE_EVENT']);
    assert.deepEqual([w.state.status, w.state.lifecycle], ['PLANNING', 'READY_TO_START']);
    const event = w.writes.find((entry) => Array.isArray(entry) && entry[0] === 'readinessEvent')[1];
    assert.equal(event.repaired, true);
    assert.equal(event.idempotencyKey, 'key-1');
    assert.equal(event.readinessState, 'REPAIRED');
    assert.equal(event.payloadHash, undefined, 'a repaired handoff has no request to hash');
    assert.deepEqual(await repair.detectIncompleteHandoffs(), [], 'verification: nothing partial remains');
    const before = w.writes.length;
    const second = await repair.repairIncompleteHandoff({ projectId: 'proj-1', intakeMode: 'PLANNED' });
    assert.equal(second.outcome, 'NOTHING_TO_REPAIR');
    assert.equal(w.writes.length, before);
  } finally { w.restore(); }
});

test('the completion step is idempotent on its own: already-present parts are not written again', async () => {
  const w = world({ link: true, readinessEvent: true, caseEvent: false, status: 'PLANNING', lifecycle: 'READY_TO_START' });
  try {
    const tx = prisma.$transaction;
    const applied = await tx(async (client) => readiness.completeHandoffInTx(client, {
      propertyId: 'prop-1', renovationCaseId: 'case-1', actorUserId: 'owner-1', projectId: 'proj-1', scopeVersionId: 'scope-1', intakeMode: 'PLANNED',
      idempotencyKey: 'key-1', payloadHash: null, readinessState: 'REPAIRED', readinessBypassed: false, caseLifecycle: 'READY_TO_START', blockMilestones: false, repair: true,
    }));
    assert.deepEqual(applied, ['CASE_EVENT']);
  } finally { w.restore(); }
});
