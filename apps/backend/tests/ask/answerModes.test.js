const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { deriveAnswerMode, ANSWER_MODES, ESTIMATE_OPERATIONS } = require('../../src/services/ask/support/answerModes.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');

// BICC-ANS-001/005/006/011: the mode is assigned by the operation, conservatively; CALCULATION is not claimed without declared input provenance.
const mode = (status, operationId, hasProperty = true) => deriveAnswerMode({ status, operationId, hasProperty });

test('a settled record read is HOME_RECORD', () => {
  for (const operationId of ['MAINTENANCE_STATUS', 'WARRANTY_LOOKUP', 'INVENTORY_LOOKUP', 'DATA_POINT_READ', 'DOCUMENT_LOOKUP']) assert.equal(mode('ANSWERED', operationId), 'HOME_RECORD', operationId);
  assert.equal(mode('READY_WITH_LIMITATIONS', 'MAINTENANCE_STATUS'), 'HOME_RECORD');
});

test('a forecast or computed figure on assumed or predicted inputs is ESTIMATE, never CALCULATION', () => {
  for (const operationId of ESTIMATE_OPERATIONS) { assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} must exist`); assert.equal(mode('ANSWERED', operationId), 'ESTIMATE', operationId); }
  const all = Object.keys(ASK_OPERATION_DEFINITIONS).map((operationId) => mode('ANSWERED', operationId)).filter(Boolean);
  assert.ok(!all.includes('CALCULATION'), 'no operation declares authoritative-only inputs yet, so none is labelled CALCULATION');
});

test('a decision analysis is a RECOMMENDATION', () => {
  for (const operationId of ['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'BREAK_EVEN_ANALYSIS', 'SELL_HOLD_RENT_ANALYSIS']) assert.equal(mode('ANSWERED', operationId), 'RECOMMENDATION', operationId);
});

test('general guidance is GENERAL_GUIDANCE only without a property record; with one it is grounded in the record', () => {
  assert.equal(mode('ANSWERED', 'GROUNDED_GUIDANCE', false), 'GENERAL_GUIDANCE');
  assert.equal(mode('ANSWERED', 'GROUNDED_GUIDANCE', true), 'HOME_RECORD');
});

test('failures, boundaries and unavailable results are UNAVAILABLE; unsettled or command turns have no answer mode', () => {
  for (const status of ['UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED']) assert.equal(mode(status, 'MAINTENANCE_STATUS'), 'UNAVAILABLE', status);
  for (const status of ['RUNNING', 'NEEDS_CLARIFICATION', 'NEEDS_CONFIRMATION', 'RECEIVED']) assert.equal(mode(status, 'MAINTENANCE_STATUS'), null, status);
  assert.equal(mode('ANSWERED', 'MAINTENANCE_TASK_CREATE'), null, 'a write preview is not an answer facet');
  assert.equal(mode('ANSWERED', null), null);
});

test('every registered operation maps to a declared mode or none, and the set of modes is exactly the FRD set', () => {
  assert.deepEqual([...ANSWER_MODES], ['HOME_RECORD', 'USER_DOCUMENT', 'CALCULATION', 'ESTIMATE', 'RECOMMENDATION', 'GENERAL_GUIDANCE', 'UNAVAILABLE']);
  for (const operationId of Object.keys(ASK_OPERATION_DEFINITIONS)) {
    const value = mode('ANSWERED', operationId);
    assert.ok(value === null || ANSWER_MODES.includes(value), `${operationId}: ${value}`);
  }
});

test('the execution response carries the mode', () => {
  const row = { id: 'e', userId: 'u', sessionId: 's', message: 'q', status: 'ANSWERED', reasonCode: null, propertyId: null, operationId: 'MAINTENANCE_FORECAST', operationVersion: '1', intentFamily: 'STATUS_SUMMARY', contextVersion: null, resultJson: { schemaVersion: '1.0', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], captureRequests: [], confirmation: null, clarification: null, suggestions: [] }, launchContextJson: null, parametersJson: null, createdAt: new Date(), updatedAt: new Date() };
  assert.equal(mapPersistedExecution(row, null).answerMode, 'ESTIMATE');
  assert.equal(mapPersistedExecution({ ...row, status: 'FAILED_RETRYABLE' }, null).answerMode, 'UNAVAILABLE');
});

test('a social reply declares no answer mode, so it is never labelled as a home record', () => {
  assert.equal(deriveAnswerMode({ status: 'ANSWERED', operationId: 'GROUNDED_GUIDANCE', hasProperty: true, reasonCode: 'ASK_SOCIAL_TURN' }), null);
  assert.equal(deriveAnswerMode({ status: 'ANSWERED', operationId: 'GROUNDED_GUIDANCE', hasProperty: true }), 'HOME_RECORD', 'other grounded-guidance answers are unchanged');
});
