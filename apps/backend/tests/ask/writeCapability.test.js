const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { isWriteCapableOperation, persistenceClassOf, PERSISTENCE_DECLARATIONS } = require('../../src/services/ask/support/writeCapability.ts');

const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable);
// Known disagreements between the `effect` label and the command registry (write trace 2026-11-11). A NEW disagreement fails this test: label it or record it here.
const LABELLED_WRITE_BUT_NOT_WRITE_CAPABLE = new Set(['INCIDENT_CONTINUATION', 'MAJOR_EVENT_ENTRY']);

test('every WRITE-labelled routable operation is write-capable, except the two recorded reads', () => {
  const missed = routable.filter((d) => d.semantic.effect === 'WRITE' && !isWriteCapableOperation(d.operationId) && !LABELLED_WRITE_BUT_NOT_WRITE_CAPABLE.has(d.operationId)).map((d) => d.operationId);
  assert.deepEqual(missed, []);
});
test('write-capable operations labelled READ/MONITOR are exactly the recorded set (no silent new ones)', () => {
  const found = routable.filter((d) => d.semantic.effect !== 'WRITE' && isWriteCapableOperation(d.operationId)).map((d) => d.operationId).sort();
  assert.deepEqual(found, ['HOME_ACTIONS', 'HOME_CHANGE_SUMMARY', 'HOME_DEADLINE_MONITOR', 'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_START', 'REFINANCE_RATE_MONITOR', 'REPLACEMENT_GUIDANCE', 'SELLER_PREP_CHECKLIST'].filter((id) => routable.some((d) => d.operationId === id && d.semantic.effect !== 'WRITE')).sort());
});
test('every declaration names a registered operation, a valid class and a reason, and none restates the derived default', () => {
  const classes = ['NONE', 'TECHNICAL', 'DERIVED', 'USER_VISIBLE', 'CONFIRMATION_REQUIRED'];
  const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
  for (const [id, d] of Object.entries(PERSISTENCE_DECLARATIONS)) {
    assert.ok(ASK_OPERATION_DEFINITIONS[id], id); assert.ok(classes.includes(d.persistenceClass), id); assert.ok(d.reason.length > 10, id);
    const dflt = getAskDomainCommandByOperation(id) !== null ? 'CONFIRMATION_REQUIRED' : 'NONE';
    assert.notEqual(d.persistenceClass, dflt, `${id} restates the default; remove the declaration`);
  }
});
test('class semantics: a command is CONFIRMATION_REQUIRED, an undeclared command-free operation is NONE, and only USER_VISIBLE/CONFIRMATION_REQUIRED are write-capable', () => {
  assert.equal(persistenceClassOf('MAINTENANCE_TASK_CREATE'), 'CONFIRMATION_REQUIRED');
  assert.equal(persistenceClassOf('REPLACEMENT_GUIDANCE'), 'USER_VISIBLE');
  assert.equal(persistenceClassOf('MAINTENANCE_FORECAST'), 'DERIVED');
  assert.equal(persistenceClassOf('SAVINGS_OPPORTUNITIES'), 'TECHNICAL');
  assert.equal(persistenceClassOf('DATA_POINT_READ'), 'NONE');
  for (const id of Object.keys(ASK_OPERATION_DEFINITIONS)) assert.equal(isWriteCapableOperation(id), ['USER_VISIBLE', 'CONFIRMATION_REQUIRED'].includes(persistenceClassOf(id)), id);
  assert.equal(isWriteCapableOperation('MAINTENANCE_FORECAST'), false);
});
test('every composable read persists nothing a user would see (class NONE, TECHNICAL or DERIVED)', () => {
  for (const d of Object.values(ASK_OPERATION_DEFINITIONS).filter((x) => x.composableRead)) assert.ok(['NONE', 'TECHNICAL', 'DERIVED'].includes(persistenceClassOf(d.operationId)), d.operationId);
});
