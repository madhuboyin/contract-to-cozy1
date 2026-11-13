// FR-WRT-4: "is this operation a read" is decided by what it can persist, not the registry `effect` label alone. The six operations the write trace found mislabelled must not be offered or routed as reads.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS, isReadOnlyOperation, isAskMessageRoutableOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { isWriteCapableOperation, isReaderEquivalentOperation } = require('../../src/services/ask/support/writeCapability.ts');

test('an operation labelled READ that can persist something is not a read-only operation', () => {
  for (const id of ['HVAC_DECISION_START', 'HVAC_DECISION_SCENARIO']) { assert.equal(ASK_OPERATION_DEFINITIONS[id].semantic.effect, 'READ', `${id} is still labelled READ`); assert.equal(isWriteCapableOperation(id), true); assert.equal(isReadOnlyOperation(id), false, id); }
  assert.equal(isReadOnlyOperation('INVENTORY_LOOKUP'), true); assert.equal(isReadOnlyOperation('DATA_POINT_READ'), true);
  // reads whose only persistence is reconciliation or analysis on read stay reads (declared readerEquivalent)
  for (const id of ['HOME_ACTIONS', 'HOME_CHANGE_SUMMARY', 'SELLER_PREP_CHECKLIST', 'REPLACEMENT_GUIDANCE']) { assert.equal(isWriteCapableOperation(id), true); assert.equal(isReaderEquivalentOperation(id), true); assert.equal(isReadOnlyOperation(id), true, id); }
  for (const id of ['HVAC_DECISION_START', 'HVAC_DECISION_SCENARIO']) assert.equal(isReaderEquivalentOperation(id), false, id);
});
test('the answer-trust validator offers only read-only operations as alternatives (no bare effect check remains)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/askAnswerTrustValidator.ts'), 'utf8');
  assert.match(src, /isReadOnlyOperation\(operationId\)/); assert.doesNotMatch(src, /semantic\.effect === 'READ'/);
});
