// INVENTORY_LOOKUP recall (2026-11-23). The new rules claim only questions the inventory answer can honestly serve; adjacent questions stay elsewhere.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation, ruleIdOfResolution } = require('../../src/services/ask/askOperationRegistry.ts');
const { isIncompleteInventoryRequest } = require('../../src/services/ask/askInventoryIntent.ts');

const claimed = (message) => { const r = resolveAskOperation(message); return { op: r.operationId, rule: r.operationId === 'GROUNDED_GUIDANCE' ? null : ruleIdOfResolution(r) }; };

const POSITIVES = [
  ['Do I have a dehumidifier?', 'DET_INVENTORY_LOOKUP_06'], ['Do I own a sump pump?', 'DET_INVENTORY_LOOKUP_06'], ['do we have a generator', 'DET_INVENTORY_LOOKUP_06'], ['Do I have a smoke detector in the hallway?', 'DET_INVENTORY_LOOKUP_06'],
  ['Is there a generator in my inventory?', 'DET_INVENTORY_LOOKUP_06'], ['are there any thermostats recorded', null], ['Do I have a water softener?', 'DET_INVENTORY_LOOKUP_06'],
  ["Show me all the items I've recorded", 'DET_INVENTORY_LOOKUP_07'], ['How many items are in my inventory?', 'DET_INVENTORY_LOOKUP_07'], ['list every item in my inventory', 'DET_INVENTORY_LOOKUP_04'],
  ['What is the full record for my dishwasher?', 'DET_INVENTORY_LOOKUP_08'], ['show me the complete details of my water heater', null], ["What's the full history for my furnace?", 'DET_INVENTORY_LOOKUP_03'],
  ['What items do I still need to add details for?', 'DET_INVENTORY_LOOKUP_09'], ['Which appliances still need more information?', 'DET_INVENTORY_LOOKUP_04'],
  ["What's in the primary bedroom?", 'DET_INVENTORY_LOOKUP_02'], ['what items are in the main bedroom', 'DET_INVENTORY_LOOKUP_02'],
];
test('the new inventory wording is claimed by the inventory lookup (a null rule means any inventory rule is acceptable)', () => {
  for (const [message, rule] of POSITIVES) {
    const got = claimed(message);
    assert.equal(got.op, 'INVENTORY_LOOKUP', `${message} -> ${got.op} ${got.rule}`);
    if (rule) assert.equal(got.rule, rule, message);
  }
});

const NOT_INVENTORY = [
  'Do I have a warranty on my dishwasher?', 'Do I have a mortgage?', 'Do I have a leak in the basement?', 'Do I have insurance on the generator?', 'do i have a roof claim open',
  'Is there a warranty for the water heater in my records?', 'How many documents are in my records?', 'How many tasks are overdue?', 'Show me all the documents I uploaded',
  'What is the full record for my property tax bill?', 'What is the full history of my insurance claim?', 'What items do I still need to add to my sale checklist?',
  'Which tasks still need details?', 'Add a dehumidifier to my inventory', 'Do I have a plan for replacing the furnace?',
];
test('adjacent questions are not claimed by the new inventory rules', () => {
  for (const message of NOT_INVENTORY) {
    const got = claimed(message);
    assert.ok(!(got.op === 'INVENTORY_LOOKUP' && /_0[6-9]$/.test(got.rule ?? '')), `${message} -> ${got.op} ${got.rule}`);
  }
});

test('"needs details" wording is read as the incomplete-records filter by the answer, so a claimed question is answered as asked', () => {
  for (const message of ['What items do I still need to add details for?', 'Which appliances still need more information?', 'Which items lack details?']) assert.equal(isIncompleteInventoryRequest(message), true, message);
  for (const message of ['What appliances do I have?', 'Show me all the items I\'ve recorded', 'Do I have a dehumidifier?']) assert.equal(isIncompleteInventoryRequest(message), false, message);
});
