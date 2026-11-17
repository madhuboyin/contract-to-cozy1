const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { EMERGENCY_BOUNDARY_BODY, EMERGENCY_BOUNDARY_TITLE } = require('../../src/services/ask/support/emergencyBoundary.ts');
const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');

// Live prompt #18 ("my furnace smells like gas") got "seek immediate emergency help or professional assistance": no instruction, no mention of leaving.
test('the emergency wording says what to do now: leave, no switches/flames/phone inside, call from outside, no troubleshooting', () => {
  assert.match(EMERGENCY_BOUNDARY_BODY, /Leave the home right away/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /do not use switches, lights, appliances or other electrical devices, do not use a flame, and do not use a phone/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /From outside/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /911/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /gas utility/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /Do not try to find or fix the cause/);
});

test('every phrasing of a gas smell routes to the emergency boundary, including "smells like gas"', () => {
  for (const message of ['my furnace smells like gas', 'my house smells of gas', 'I smell gas', 'I am smelling gas near the stove', 'there is a gas smell in the basement', 'there is a gas odor', 'it smells like rotten eggs in the kitchen', 'my basement smells like sulfur']) {
    assert.equal(resolveAskOperation(message).operationId, 'EMERGENCY_BOUNDARY', message);
  }
});

test('ordinary smell and gas questions are not turned into an emergency', () => {
  for (const message of ['my fridge smells rotten', 'my laundry room smells musty', 'when should I service my gas furnace', 'how much does a gas stove cost', 'what does my gas bill look like']) {
    assert.notEqual(resolveAskOperation(message).operationId, 'EMERGENCY_BOUNDARY', message);
  }
});

test('the cross-domain safety boundary carries the same explicit wording, not the generic sentence', async () => {
  const snapshot = buildSeededCrossDomainSnapshot();
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'my furnace smells like gas', snapshot, role: 'OWNER', propertyAuthorized: true });
  assert.equal(execution.status, 'BOUNDARY');
  assert.equal(execution.answer, EMERGENCY_BOUNDARY_BODY);
  const result = X.buildOperationResultFromCrossDomainExecution(execution);
  const block = result.blocks[0];
  assert.equal(block.title, EMERGENCY_BOUNDARY_TITLE);
  assert.equal(block.body, EMERGENCY_BOUNDARY_BODY);
  assert.ok(!/seek immediate emergency help or professional assistance/.test(JSON.stringify(result)));
});
