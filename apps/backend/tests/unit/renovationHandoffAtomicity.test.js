'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Owner rulings D-H1 and D-H8 (docs/architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md): the handoff is one transaction, and a second call is
// told apart as a replay, an idempotency conflict, or an already-created Project. No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const service = require('../../src/services/renovationReadiness.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

const input = (over = {}) => ({
  projectType: 'KITCHEN_REMODEL', fulfillmentMode: 'PROVIDER', fundingMode: 'SELF_PAID', contractorName: 'Example Construction',
  startDate: '2026-11-01', intakeMode: 'PLANNED', contractDocumentIds: [], idempotencyKey: 'key-1', ...over,
});

test('the payload hash ignores the key and the order of document ids, and changes with any value', () => {
  const h = service.handoffPayloadHash;
  assert.equal(h(input()), h(input({ idempotencyKey: 'key-2' })));
  assert.equal(h(input({ contractDocumentIds: ['b', 'a'] })), h(input({ contractDocumentIds: ['a', 'b', 'a'] })));
  assert.notEqual(h(input()), h(input({ contractAmountCents: 100 })));
  assert.notEqual(h(input()), h(input({ startDate: '2026-11-02' })));
  assert.match(h(input()), /^[a-f0-9]{64}$/);
});

function withEvent(payload) {
  const saved = { ev: prisma.renovationReadinessEvent, pr: prisma.projectRecord };
  prisma.renovationReadinessEvent = { findFirst: async () => (payload === null ? null : { payload }) };
  prisma.projectRecord = { findUnique: async ({ where }) => ({ id: where.id, propertyId: 'prop-1', milestones: [], payments: [], changeOrders: [], issues: [], materialSpecs: [], _count: {} }) };
  return () => { prisma.renovationReadinessEvent = saved.ev; prisma.projectRecord = saved.pr; };
}
const project = { id: 'proj-1', name: 'Kitchen', description: null, startDate: new Date('2026-11-01'), expectedEndDate: null, updatedAt: new Date() };
const hash = service.handoffPayloadHash(input());

test('same key and same values is an idempotent replay; the work item synchronization is retried and its result reported', async () => {
  const restore = withEvent({ idempotencyKey: 'key-1', payloadHash: hash });
  try {
    let syncs = 0;
    const result = await service.existingHandoffResult('prop-1', 'case-1', project, input(), hash, 'u1', { syncWorkItem: async () => { syncs += 1; return false; } });
    assert.deepEqual(result.handoff, { outcome: 'IDEMPOTENT_REPLAY', projectId: 'proj-1', appliedSubmittedValues: false, workItemSynced: false });
    assert.equal(syncs, 1, 'the synchronization is always retried on the existing-project path');
    const ok = await service.existingHandoffResult('prop-1', 'case-1', project, input(), hash, 'u1', { syncWorkItem: async () => true });
    assert.equal(ok.handoff.workItemSynced, true);
  } finally { restore(); }
});

test('same key with different values is an idempotency conflict and applies nothing', async () => {
  const restore = withEvent({ idempotencyKey: 'key-1', payloadHash: hash });
  try {
    const changed = input({ contractAmountCents: 999 });
    await assert.rejects(
      () => service.existingHandoffResult('prop-1', 'case-1', project, changed, service.handoffPayloadHash(changed), 'u1', { syncWorkItem: async () => true }),
      (error) => error instanceof APIError && error.code === 'RENOVATION_HANDOFF_IDEMPOTENCY_CONFLICT' && error.statusCode === 409,
    );
  } finally { restore(); }
});

test('a different key after creation is "already created", says the submitted values were not applied, and never a second Project', async () => {
  const restore = withEvent({ idempotencyKey: 'key-1', payloadHash: hash });
  try {
    const other = input({ idempotencyKey: 'key-2', contractAmountCents: 5 });
    const result = await service.existingHandoffResult('prop-1', 'case-1', project, other, service.handoffPayloadHash(other), 'u1', { syncWorkItem: async () => true });
    assert.equal(result.handoff.outcome, 'ALREADY_CREATED');
    assert.equal(result.handoff.appliedSubmittedValues, false);
    assert.equal(result.id, 'proj-1');
  } finally { restore(); }
});

test('a Project with no recorded handoff is reported as incomplete, not silently returned as success', async () => {
  const restore = withEvent(null);
  try {
    await assert.rejects(
      () => service.existingHandoffResult('prop-1', 'case-1', project, input(), hash, 'u1', { syncWorkItem: async () => true }),
      (error) => error instanceof APIError && error.code === 'RENOVATION_HANDOFF_INCOMPLETE',
    );
  } finally { restore(); }
});

function fixture({ failLink = false } = {}) {
  const saved = {};
  const set = (name, value) => { saved[name] = prisma[name]; prisma[name] = value; };
  const tx = { calls: [] };
  const record = (model, method, result) => async (args) => { tx.calls.push([model, method, args]); return typeof result === 'function' ? result(args) : result; };
  tx.renovationCase = { findFirst: record('renovationCase', 'findFirst', { id: 'case-1' }), update: record('renovationCase', 'update', {}) };
  tx.projectRecord = {
    findFirst: record('projectRecord', 'findFirst', null),
    create: record('projectRecord', 'create', { id: 'proj-1', name: 'Kitchen', description: null, startDate: new Date('2026-11-01'), expectedEndDate: null, updatedAt: new Date(), fulfillmentMode: 'PROVIDER', guidanceJourneyId: null, sourceEntityType: 'RENOVATION_CASE', sourceEntityId: 'case-1' }),
    update: record('projectRecord', 'update', {}),
  };
  tx.projectMilestone = { createMany: record('projectMilestone', 'createMany', {}), updateMany: record('projectMilestone', 'updateMany', {}) };
  tx.renovationCaseLink = { create: failLink ? async () => { throw new Error('link failed'); } : record('renovationCaseLink', 'create', { id: 'link-1' }) };
  tx.renovationCaseEvent = { create: record('renovationCaseEvent', 'create', {}) };
  tx.renovationReadinessEvent = { create: record('renovationReadinessEvent', 'create', {}) };
  let detailReads = 0;
  const scope = { id: 'scope-1', version: 1, approvalStatus: 'APPROVED', drawingDocumentIds: [], specificationDocumentIds: [], workItems: [], contractCostCents: null, summary: 'Kitchen' };
  set('renovationCase', {
    findFirst: async () => ({
      id: 'case-1', name: 'Kitchen', objective: null, lifecycle: 'PREPARING_TO_START', governanceTier: 'STANDARD', systemsAffected: [], createdByUserId: 'u1',
      targetStartDate: new Date('2026-11-01'), targetEndDate: null, readinessSummary: { scopeVersionId: 'scope-1', fulfillmentMode: 'PROVIDER' },
      currentScopeVersion: scope, participants: [], requirements: [], complianceConditions: [], links: [],
    }),
  });
  set('renovationStartReadinessItem', { findMany: async () => [
    { id: 'i-1', itemKey: 'approved-scope', status: 'SATISFIED', isBlocking: false, overrideAcknowledgedAt: null, derivedAt: new Date('2026-10-01') },
    { id: 'i-2', itemKey: 'execution-schedule', status: 'SATISFIED', isBlocking: false, overrideAcknowledgedAt: null, derivedAt: new Date('2026-10-01') },
  ] });
  set('projectRecord', {
    findFirst: async () => null,
    findUnique: async ({ where }) => {
      if (where.renovationCaseId) return null;
      detailReads += 1;
      return { id: where.id, propertyId: 'prop-1', milestones: [], payments: [], changeOrders: [], issues: [], materialSpecs: [], _count: {} };
    },
  });
  set('document', { findMany: async () => [], count: async () => 0 });
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) => callback(tx);
  return { tx, get detailReads() { return detailReads; }, restore() {
    for (const [name, value] of Object.entries(saved)) prisma[name] = value;
    prisma.$transaction = originalTransaction;
  } };
}

test('the Project, status, link, lifecycle and both events are written on the one transaction client', async () => {
  const f = fixture();
  try {
    const result = await service.handoffToProject('prop-1', 'case-1', 'u1', input());
    assert.equal(result.handoff.outcome, 'CREATED');
    assert.equal(typeof result.handoff.workItemSynced, 'boolean');
    const written = f.tx.calls.map(([model, method]) => `${model}.${method}`);
    // There are no open conditions in this fixture, so no milestones are written or blocked.
    for (const expected of [
      'projectRecord.create', 'projectRecord.update', 'renovationCaseLink.create', 'renovationCaseEvent.create', 'renovationCase.update', 'renovationReadinessEvent.create',
    ]) {
      assert.ok(written.includes(expected), `${expected} runs on the transaction client`);
    }
    const readinessEvent = f.tx.calls.find(([model]) => model === 'renovationReadinessEvent')[2].data;
    assert.equal(readinessEvent.payload.idempotencyKey, 'key-1');
    assert.match(readinessEvent.payload.payloadHash, /^[a-f0-9]{64}$/);
    const lifecycle = f.tx.calls.find(([model, method]) => model === 'renovationCase' && method === 'update')[2].data.lifecycle;
    assert.equal(lifecycle, 'READY_TO_START');
  } finally { f.restore(); }
});

test('a failure while linking the case writes nothing outside the transaction and reports nothing as created', async () => {
  const f = fixture({ failLink: true });
  try {
    await assert.rejects(() => service.handoffToProject('prop-1', 'case-1', 'u1', input()), /link failed/);
    // Nothing after the failed step ran: no lifecycle change, no events, and no post-commit detail read or work item receipt.
    const written = f.tx.calls.map(([model, method]) => `${model}.${method}`);
    assert.equal(written.includes('renovationCase.update'), false);
    assert.equal(written.includes('renovationReadinessEvent.create'), false);
    assert.equal(f.detailReads, 0);
  } finally { f.restore(); }
});

test('the handoff opens no second transaction and calls no helper that does (source check)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/renovationReadiness.service.ts'), 'utf8');
  const start = source.indexOf('export async function handoffToProject');
  const end = source.indexOf('export type RenovationHandoffOutcome');
  const body = source.slice(start, end);
  assert.ok(body.includes('withSerializableDedupe'));
  assert.ok(body.includes('createProjectInTx(tx'));
  assert.ok(body.includes('linkProjectToCaseInTx(tx'));
  assert.equal(body.includes('linkContributor('), false, 'linkContributor opens its own transaction');
  assert.equal(/prisma\.\$transaction/.test(body), false);
  assert.equal(/prisma\.projectRecord\.update\(/.test(body), false);
  // The existing-project check comes after the case is scoped to the property.
  assert.ok(body.indexOf('loadContext(propertyId, renovationCaseId)') < body.indexOf('existingHandoffResult('));
});
