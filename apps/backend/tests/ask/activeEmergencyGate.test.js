const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

// Review (2026-11-07): the safety gate recognised gas, carbon monoxide, sparks and "fire now" only. Fire, smoke, a burst pipe, flooding and "call 911"
// went to ordinary lookups. Present-tense wording is an emergency; the same nouns in a record, insurance or maintenance question are not.
const emergencies = [
  'there is a fire in my kitchen', 'my house is on fire', 'i smell smoke in the basement', 'a pipe just burst', 'my basement is flooding',
  'water is pouring through the ceiling', 'call 911', 'the ceiling is collapsing', 'i can see smoke coming from the outlet',
  'my water main burst this morning', 'someone is breaking in',
];
const ordinary = [
  'when should i replace my fire extinguisher', 'smoke detector battery schedule', 'do i need flood insurance', 'a pipe burst last winter, did i record it',
  'is my fireplace inspected', 'how much does a burst pipe claim cost', 'fire safety checklist', 'gas bill this month', 'is there a smoke alarm in each bedroom',
  'my basement flooded in 2019', 'remind me to test the smoke detectors',
];

test('present-tense emergencies reach the emergency boundary', () => {
  for (const message of emergencies) assert.equal(resolveAskOperation(message).operationId, 'EMERGENCY_BOUNDARY', message);
  for (const message of emergencies) assert.equal(resolveAskRoutingCascade(message).stage, 'SAFETY', message);
});

test('the same nouns in record, insurance and maintenance questions are not emergencies', () => {
  for (const message of ordinary) assert.notEqual(resolveAskOperation(message).operationId, 'EMERGENCY_BOUNDARY', message);
});
