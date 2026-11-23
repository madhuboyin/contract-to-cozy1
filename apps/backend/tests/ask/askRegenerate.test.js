const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { canRegenerate, regenerationSourceOf, withRegenerationLink } = require('../../src/services/ask/support/regeneration.ts');
const create = require('../../src/services/ask/execution/createAskExecution.ts');
const sessions = require('../../src/services/ask/execution/askSessions.ts');
const { regenerateAskExecution } = require('../../src/services/ask/execution/askRegenerate.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');

// BICC-CTX-006: regeneration is a NEW linked attempt; the original is kept; a write or confirmation is never repeated; feedback stays per attempt.
const block = { type: 'SUMMARY', id: 'maintenance-summary', title: 'Maintenance', body: 'Two tasks are pending.', tone: 'DEFAULT', actions: [] };
const row = (extra = {}) => ({
  id: 'exec-1', userId: 'u1', sessionId: 's1', message: 'What maintenance is due?', status: 'ANSWERED', reasonCode: null, propertyId: null, operationId: 'MAINTENANCE_STATUS',
  operationVersion: '1', intentFamily: 'RECORD_QUERY', contextVersion: null, parentExecutionId: null, clientRequestId: 'c-1', launchContextJson: { surface: 'ASK_PAGE' },
  parametersJson: null, skillId: null, skillVersion: null, skillDomain: null, createdAt: new Date('2026-11-22T10:00:00Z'), updatedAt: new Date('2026-11-22T10:00:00Z'),
  resultJson: { schemaVersion: '1.0', blocks: [block], captureRequests: [], confirmation: null, clarification: null, suggestions: [] }, ...extra,
});

test('only a settled plain read answer can be regenerated', () => {
  assert.equal(canRegenerate({ status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS' }), true);
  assert.equal(canRegenerate({ status: 'READY_WITH_LIMITATIONS', operationId: 'MAINTENANCE_STATUS' }), true);
  for (const status of ['NEEDS_CONFIRMATION', 'FAILED_RETRYABLE', 'RUNNING', 'NEEDS_CLARIFICATION', 'COMPLETED']) assert.equal(canRegenerate({ status, operationId: 'MAINTENANCE_STATUS' }), false, status);
  for (const operationId of ['MAINTENANCE_TASK_CREATE', 'EMERGENCY_BOUNDARY', 'GROUNDED_GUIDANCE']) assert.equal(canRegenerate({ status: 'ANSWERED', operationId }), false, operationId);
  assert.equal(canRegenerate({ status: 'ANSWERED', operationId: null }), false);
  assert.equal(canRegenerate({ status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', parametersJson: { composition: { attempts: [] } } }), false, 'a composed parent has its own machinery');
});

test('the link is stored without disturbing other parameters and is read back', () => {
  assert.equal(regenerationSourceOf(null), null);
  const merged = withRegenerationLink({ slots: { a: 1 } }, 'exec-1');
  assert.deepEqual(merged, { slots: { a: 1 }, regeneration: { ofExecutionId: 'exec-1' } });
  assert.equal(regenerationSourceOf(merged), 'exec-1');
});

test('the execution response carries the capability and the link', () => {
  const original = mapPersistedExecution(row(), null);
  assert.equal(original.correctionCapabilities.regenerate, true);
  assert.equal(original.regeneratedFromExecutionId, null);
  const attempt = mapPersistedExecution(row({ id: 'exec-2', parametersJson: withRegenerationLink(null, 'exec-1') }), null);
  assert.equal(attempt.regeneratedFromExecutionId, 'exec-1');
  assert.equal(mapPersistedExecution(row({ status: 'FAILED_RETRYABLE' }), null).correctionCapabilities.regenerate, false);
});

function harness(rows) {
  const table = new Map(rows.map((r) => [r.id, { ...r }]));
  const events = []; const created = [];
  const originals = {
    findFirst: prisma.askExecution.findFirst, findUnique: prisma.askExecution.findUnique, update: prisma.askExecution.update, event: prisma.askExecutionEvent.create,
    create: create.createAskExecution, get: sessions.getAskExecution,
  };
  prisma.askExecution.findFirst = async ({ where }) => { const r = table.get(where.id); return r && r.userId === where.userId ? { ...r } : null; };
  prisma.askExecution.findUnique = async ({ where }) => { const r = table.get(where.id); return r ? { ...r } : null; };
  prisma.askExecution.update = async ({ where, data }) => { Object.assign(table.get(where.id), data); return { ...table.get(where.id) }; };
  prisma.askExecutionEvent.create = async ({ data }) => { events.push(data); return data; };
  create.createAskExecution = async (userId, request, role, internal) => {
    created.push({ userId, request, internal });
    const existing = [...table.values()].find((r) => r.clientRequestId === request.clientRequestId);
    if (existing) return { executionId: existing.id };
    const id = `exec-${table.size + 1}`;
    table.set(id, row({ id, clientRequestId: request.clientRequestId, createdAt: new Date() }));
    return { executionId: id };
  };
  sessions.getAskExecution = async (userId, id) => mapPersistedExecution(table.get(id), null);
  const restore = () => { prisma.askExecution.findFirst = originals.findFirst; prisma.askExecution.findUnique = originals.findUnique; prisma.askExecution.update = originals.update; prisma.askExecutionEvent.create = originals.event; create.createAskExecution = originals.create; sessions.getAskExecution = originals.get; };
  return { table, events, created, restore };
}

test('regenerating a settled read creates a new linked attempt, keeps the original untouched, and pins the same operation', async () => {
  const h = harness([row()]);
  try {
    const attempt = await regenerateAskExecution('u1', 'exec-1', { clientRequestId: 'regen-0001' });
    assert.notEqual(attempt.executionId, 'exec-1');
    assert.equal(attempt.regeneratedFromExecutionId, 'exec-1');
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].request.message, 'What maintenance is due?');
    assert.equal(h.created[0].request.launchContext.operationId, 'MAINTENANCE_STATUS');
    assert.equal(h.created[0].request.clientRequestId, 'regen-0001');
    assert.equal(h.table.get('exec-1').status, 'ANSWERED', 'the original is not modified');
    assert.deepEqual(h.table.get('exec-1').resultJson.blocks, [block]);
    assert.deepEqual(h.events.map((e) => [e.executionId, e.eventType]), [[attempt.executionId, 'REGENERATION_ATTEMPT'], ['exec-1', 'REGENERATED']]);
  } finally { h.restore(); }
});

test('the same request delivered twice returns the same attempt and links it once', async () => {
  const h = harness([row()]);
  try {
    const first = await regenerateAskExecution('u1', 'exec-1', { clientRequestId: 'regen-0002' });
    const second = await regenerateAskExecution('u1', 'exec-1', { clientRequestId: 'regen-0002' });
    assert.equal(second.executionId, first.executionId);
    assert.equal(h.events.length, 2, 'the link and its audit events are written once');
  } finally { h.restore(); }
});

test('a write, a confirmation, a failed answer and another user\'s execution are refused and nothing is created', async () => {
  const h = harness([row({ id: 'w', operationId: 'MAINTENANCE_TASK_CREATE' }), row({ id: 'c', status: 'NEEDS_CONFIRMATION' }), row({ id: 'f', status: 'FAILED_RETRYABLE' }), row({ id: 'child', parentExecutionId: 'exec-1' })]);
  try {
    for (const id of ['w', 'c', 'f']) await assert.rejects(regenerateAskExecution('u1', id, { clientRequestId: 'regen-0003' }), (e) => e.code === 'ASK_EXECUTION_NOT_REGENERABLE', id);
    await assert.rejects(regenerateAskExecution('u1', 'child', { clientRequestId: 'regen-0003' }), (e) => e.code === 'ASK_EXECUTION_NOT_FOUND');
    await assert.rejects(regenerateAskExecution('someone-else', 'exec-1', { clientRequestId: 'regen-0003' }), (e) => e.code === 'ASK_EXECUTION_NOT_FOUND');
    assert.equal(h.created.length, 0);
  } finally { h.restore(); }
});

test('a regenerated attempt has its own feedback: nothing is transferred from the original', async () => {
  const { savedFeedbackByExecution } = require('../../src/services/ask/execution/askFeedbackState.ts');
  const original = prisma.feedback.findMany;
  prisma.feedback.findMany = async () => [{ targetId: 'exec-1', rating: 'down', comment: null, createdAt: new Date() }];
  try {
    const map = await savedFeedbackByExecution('u1', ['exec-1', 'exec-2']);
    assert.ok(map.get('exec-1'));
    assert.equal(map.get('exec-2'), undefined);
  } finally { prisma.feedback.findMany = original; }
});

test('the route is registered and the request is strict', () => {
  const { RegenerateAskExecutionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  assert.equal(RegenerateAskExecutionSchema.safeParse({ clientRequestId: 'abc' }).success, true);
  assert.equal(RegenerateAskExecutionSchema.safeParse({ clientRequestId: '' }).success, false);
  assert.equal(RegenerateAskExecutionSchema.safeParse({ clientRequestId: 'abc', extra: 1 }).success, false);
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/routes/ask.routes.ts'), 'utf8'), /executions\/:executionId\/regenerate/);
});
