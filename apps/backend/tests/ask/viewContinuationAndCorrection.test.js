const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaModule = require('../../src/lib/prisma.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');
const { requestAskCorrection } = require('../../src/services/ask/execution/askFeedback.ts');

const property = { id: 'property', label: 'Main' };
const row = (overrides = {}) => ({
  id: 'exec', sessionId: 'session', message: 'Show next results', status: 'ANSWERED', reasonCode: null,
  propertyId: 'property', operationId: 'MAINTENANCE_STATUS', operationVersion: '1.0', intentFamily: 'STATUS_SUMMARY', contextVersion: 'v1',
  resultJson: { schemaVersion: '1.0', blocks: [], captureRequests: [], confirmation: null, clarification: null, suggestions: [] },
  launchContextJson: { surface: 'ASK_PAGE' }, parametersJson: null, skillId: null, skillVersion: null, skillDomain: null,
  createdAt: new Date('2026-10-01T12:00:00.000Z'), updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  ...overrides,
});

test('a collection page turn is marked PAGE from its stored launch context', () => {
  const mapped = mapPersistedExecution(row({ launchContextJson: { surface: 'ASK_PAGE', entityType: 'ASK_COLLECTION_SECTION', entityId: 'sec', actionId: 'NEXT_PAGE', sourceExecutionId: 'prev' } }), property);
  assert.equal(mapped.viewContinuation, 'PAGE');
  const previous = mapPersistedExecution(row({ launchContextJson: { surface: 'ASK_PAGE', entityType: 'ASK_COLLECTION_SECTION', actionId: 'PREVIOUS_PAGE' } }), property);
  assert.equal(previous.viewContinuation, 'PAGE');
});

test('a filter chip turn is FILTER; a typed filter or an ordinary question is never marked', () => {
  const stored = { schemaVersion: '1.0', blocks: [], captureRequests: [], confirmation: null, clarification: null, suggestions: [], continuesExecutionId: 'prev' };
  assert.equal(mapPersistedExecution(row({ resultJson: stored, launchContextJson: { surface: 'ASK_PAGE', sourceExecutionId: 'prev' } }), property).viewContinuation, 'FILTER');
  assert.equal(mapPersistedExecution(row({ resultJson: stored }), property).viewContinuation, null);
  assert.equal(mapPersistedExecution(row({ launchContextJson: { surface: 'ASK_PAGE', sourceExecutionId: 'prev' } }), property).viewContinuation, null);
  assert.equal(mapPersistedExecution(row({ launchContextJson: { surface: 'ASK_PAGE', entityType: 'ASK_COLLECTION_SECTION', actionId: 'OTHER' } }), property).viewContinuation, null);
});

test('an intent correction returns the created clarification execution as well as the fallback href', async () => {
  const saved = prismaModule.prisma;
  const created = [];
  prismaModule.prisma = {
    askExecution: {
      findFirst: async () => row({ id: 'source', propertyId: null, message: 'what about the thing', expiresAt: new Date(Date.now() + 1e9) }),
      create: async ({ data }) => { const record = { ...row(), ...data, id: 'correction', createdAt: new Date(), updatedAt: new Date() }; created.push(record); return record; },
    },
    askExecutionEvent: { create: async () => ({}) },
    property: { findUnique: async () => null },
  };
  try {
    const result = await requestAskCorrection('user', 'source', { kind: 'INTENT' });
    assert.equal(result.executionId, 'correction');
    assert.match(result.href, /executionId=correction/);
    assert.equal(result.execution.executionId, 'correction');
    assert.equal(result.execution.status, 'NEEDS_CLARIFICATION');
    assert.ok(result.execution.clarification);
    assert.equal(created.length, 1);
  } finally { prismaModule.prisma = saved; }
});

test('a home-record correction still returns only the href', async () => {
  const saved = prismaModule.prisma;
  prismaModule.prisma = {
    askExecution: { findFirst: async () => row({ propertyId: null }) },
    askExecutionEvent: { create: async () => ({}) },
  };
  try {
    const result = await requestAskCorrection('user', 'exec', { kind: 'HOME_RECORD' });
    assert.equal(result.execution, undefined);
    assert.ok(result.href);
  } finally { prismaModule.prisma = saved; }
});

test('every registered operation yields a clarification label within the schema limit', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  const { clampClarificationLabel } = require('../../src/services/ask/execution/askFeedback.ts');
  for (const [id, definition] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    const label = clampClarificationLabel(definition.semantic.supportedJobs[0]);
    assert.ok(label.length >= 1 && label.length <= 160, `${id} label length ${label.length}`);
  }
});
