const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');
const { prisma } = require('../../src/lib/prisma.ts');
const ops = require('../../src/services/maintenanceTaskJourneyOperations.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');

function setup({ task, docs = [], links = [] }) {
  const reported = [];
  const created = [];
  prisma.propertyMaintenanceTask = { findUnique: async () => task, findFirst: async ({ where }) => (task && where.id === task.id && where.propertyId === task.propertyId ? task : null) };
  // Home Records resolve through the shared resolver (propertyRecord); legacy documents only when the completion named them (document).
  prisma.propertyRecord = { findMany: async ({ where }) => docs.filter((d) => d.record && where.id.in.includes(d.id) && d.propertyId === where.propertyId).map((d) => ({ id: d.id, title: 't', recordType: 'OTHER', sensitivity: 'STANDARD', currentVersionId: d.versionId ?? 'v1', currentVersion: { mimeType: 'application/pdf' } })) };
  prisma.document = { findMany: async ({ where }) => docs.filter((d) => !d.record && where.id.in.includes(d.id) && d.propertyId === where.propertyId).map((d) => ({ id: d.id, name: 'legacy', mimeType: null })) };
  prisma.guidanceStepMaintenanceTaskLink = {
    findMany: async () => links,
    findFirst: async ({ where }) => links.find((l) => l.stepId === where.stepId && l.maintenanceTaskId === where.maintenanceTaskId) ?? null,
    create: async ({ data }) => { created.push(data); return { id: 'l1', ...data }; },
  };
  const original = guidanceJourneyService.recordToolCompletion;
  guidanceJourneyService.recordToolCompletion = async (p) => { reported.push(p); };
  return { reported, created, restore: () => { guidanceJourneyService.recordToolCompletion = original; } };
}

test('a completed task with no evidence documents is not verified and reports nothing', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: { photoDocumentIds: [] }, lastCompletedDate: new Date() };
  const h = setup({ task, links: [{ stepId: 's1', journeyId: 'j1', maintenanceTaskId: 't1', propertyId: 'p1' }] });
  try {
    assert.deepEqual(await ops.verifiedCompletionEvidence(task), []);
    assert.deepEqual(await ops.reportLinkedTaskCompletion('u1', 't1'), []);
    assert.equal(h.reported.length, 0);
  } finally { h.restore(); }
});

test('evidence documents from another property do not verify a completion', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: { evidence: [{ source: 'HOME_RECORD', id: 'd1', versionId: 'v1' }] }, lastCompletedDate: new Date() };
  const h = setup({ task, docs: [{ id: 'd1', propertyId: 'other', record: true }] });
  try { assert.deepEqual(await ops.verifiedCompletionEvidence(task), []); } finally { h.restore(); }
});

test('a task that is not completed is never verified, even with evidence', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'IN_PROGRESS', completionMetadata: { evidence: [{ source: 'HOME_RECORD', id: 'd1', versionId: 'v1' }] } };
  const h = setup({ task, docs: [{ id: 'd1', propertyId: 'p1', record: true }] });
  try { assert.deepEqual(await ops.verifiedCompletionEvidence(task), []); } finally { h.restore(); }
});

test('a completed task with property evidence and no link reports nothing (nothing is inferred)', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: { evidence: [{ source: 'HOME_RECORD', id: 'd1', versionId: 'v1' }] }, title: 'Fire inspection' };
  const h = setup({ task, docs: [{ id: 'd1', propertyId: 'p1', record: true }], links: [] });
  try {
    assert.deepEqual(await ops.reportLinkedTaskCompletion('u1', 't1'), []);
    assert.equal(h.reported.length, 0);
  } finally { h.restore(); }
});

test('the completion report carries the exact step, task and evidence documents', () => {
  const body = ops.buildMaintenanceTaskCompletion('p1', 'u1', { id: 't1', lastCompletedDate: new Date('2026-10-01T00:00:00Z') }, [{ source: 'HOME_RECORD', id: 'd1', versionId: 'v1' }], { stepId: 's1', stepKey: 'complete_compliance_task', journeyId: 'j1', signalIntentFamily: null, inventoryItemId: null, signalSource: {} });
  assert.equal(body.journeyId, 'j1');
  assert.equal(body.stepKey, 'complete_compliance_task');
  assert.equal(body.sourceEntityId, 't1');
  assert.deepEqual(body.producedData.evidence, [{ source: 'HOME_RECORD', id: 'd1', versionId: 'v1' }]);
  assert.equal(body.dedupeKey, 'maintenance-task-verified:p1:t1:s1');
});

test('linking a task that is not on the property is refused', async () => {
  const h = setup({ task: { id: 't1', propertyId: 'other' } });
  try { await assert.rejects(ops.linkMaintenanceTaskToStep('p1', 'u1', 't1', 's1', 'DESKTOP'), /not found/i); } finally { h.restore(); }
});

const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

function evidenceSetup(task, docs) {
  const h = setup({ task, docs, links: [{ stepId: 's1', journeyId: 'j1', maintenanceTaskId: task.id, propertyId: task.propertyId }] });
  const writes = [];
  const originalGet = PropertyMaintenanceTaskService.getTask;
  PropertyMaintenanceTaskService.getTask = async () => task;
  prisma.propertyMaintenanceTask.update = async ({ data }) => { writes.push(data); Object.assign(task, data); return task; };
  prisma.guidanceJourneyStep = { findFirst: async () => ({ id: 's1', stepKey: 'complete_compliance_task', toolKey: 'maintenance', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null } }) };
  return { ...h, writes, restore: () => { h.restore(); PropertyMaintenanceTaskService.getTask = originalGet; } };
}

test('new evidence must be a Home Record on this property; a legacy document id is refused and nothing is written', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: {}, lastCompletedDate: new Date() };
  const h = evidenceSetup(task, [{ id: 'd1', propertyId: 'other', record: true }, { id: 'legacy1', propertyId: 'p1' }]);
  try {
    await assert.rejects(ops.attachMaintenanceTaskEvidence('u1', 't1', ['d1']), (e) => e.code === 'MAINTENANCE_EVIDENCE_NOT_FOUND');
    await assert.rejects(ops.attachMaintenanceTaskEvidence('u1', 't1', ['legacy1']), (e) => e.code === 'MAINTENANCE_EVIDENCE_NOT_FOUND');
    await assert.rejects(ops.attachMaintenanceTaskEvidence('u1', 't1', []), (e) => e.code === 'MAINTENANCE_EVIDENCE_REQUIRED');
    assert.equal(h.writes.length, 0);
  } finally { h.restore(); }
});

test('attaching a Home Record to an already-completed linked task stores its store and version and reruns the shared reporter', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: {}, lastCompletedDate: new Date() };
  const h = evidenceSetup(task, [{ id: 'r1', propertyId: 'p1', record: true, versionId: 'v7' }]);
  try {
    const out = await ops.attachMaintenanceTaskEvidence('u1', 't1', ['r1', 'r1']);
    assert.deepEqual(out.evidence, [{ source: 'HOME_RECORD', id: 'r1', versionId: 'v7' }]);
    assert.deepEqual(out.reportedStepIds, ['s1']);
    assert.deepEqual(h.reported[0].producedData.evidence, [{ source: 'HOME_RECORD', id: 'r1', versionId: 'v7' }]);
    assert.equal(h.writes[0].completionMetadata.evidence[0].attachedByUserId, 'u1');
  } finally { h.restore(); }
});

test('a legacy document the completion already named still counts, labelled as legacy', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'COMPLETED', completionMetadata: { photoDocumentIds: ['legacy1'] }, lastCompletedDate: new Date() };
  const h = setup({ task, docs: [{ id: 'legacy1', propertyId: 'p1' }] });
  try { assert.deepEqual(await ops.verifiedCompletionEvidence(task), [{ source: 'LEGACY_DOCUMENT', id: 'legacy1', versionId: null }]); } finally { h.restore(); }
});

test('evidence attached to a task that is not completed yet is kept but reports nothing', async () => {
  const task = { id: 't1', propertyId: 'p1', status: 'IN_PROGRESS', completionMetadata: {}, lastCompletedDate: null };
  const h = evidenceSetup(task, [{ id: 'r1', propertyId: 'p1', record: true }]);
  try {
    const out = await ops.attachMaintenanceTaskEvidence('u1', 't1', ['r1']);
    assert.deepEqual(out.reportedStepIds, []);
    assert.equal(h.reported.length, 0);
    assert.equal(h.writes[0].completionMetadata.evidence.length, 1);
  } finally { h.restore(); }
});
