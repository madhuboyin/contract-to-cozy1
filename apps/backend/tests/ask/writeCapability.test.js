const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { isWriteCapableOperation, WRITE_CAPABLE_WITHOUT_COMMAND, PERSISTS_ON_READ } = require('../../src/services/ask/support/writeCapability.ts');

const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable);
// Known disagreements between the `effect` label and the command registry (write trace 2026-11-11). A NEW disagreement fails this test: label it or record it here.
const LABELLED_WRITE_BUT_NOT_WRITE_CAPABLE = new Set(['INCIDENT_CONTINUATION', 'MAJOR_EVENT_ENTRY']);

test('every WRITE-labelled routable operation is write-capable, except the two recorded reads', () => {
  const missed = routable.filter((d) => d.semantic.effect === 'WRITE' && !isWriteCapableOperation(d.operationId) && !LABELLED_WRITE_BUT_NOT_WRITE_CAPABLE.has(d.operationId)).map((d) => d.operationId);
  assert.deepEqual(missed, []);
});
test('write-capable operations labelled READ/MONITOR are exactly the recorded set (no silent new ones)', () => {
  const found = routable.filter((d) => d.semantic.effect !== 'WRITE' && isWriteCapableOperation(d.operationId)).map((d) => d.operationId).sort();
  assert.deepEqual(found, ['HOME_DEADLINE_MONITOR', 'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_START', 'REFINANCE_RATE_MONITOR', 'REPLACEMENT_GUIDANCE'].filter((id) => routable.some((d) => d.operationId === id && d.semantic.effect !== 'WRITE')).sort());
});
test('the explicit lists name registered operations only', () => {
  for (const id of [...WRITE_CAPABLE_WITHOUT_COMMAND, ...PERSISTS_ON_READ]) assert.ok(ASK_OPERATION_DEFINITIONS[id], id);
});
