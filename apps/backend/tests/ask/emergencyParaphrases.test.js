const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { EMERGENCY_BOUNDARY_BODY } = require('../../src/services/ask/support/emergencyBoundary.ts');

// Two independent gates: the registry's emergency pattern (the routing cascade's safety stage) and the cross-domain parser's. Each real emergency must trip BOTH, so a
// phrasing one gate misses is still caught by the other. Narrowing "fire"/"smoke" to active-danger phrasings (so a fire CLAIM is not an emergency) made this a
// documented risk; these fixtures are the documented misses.
const EMERGENCIES = [
  'my furnace smells like gas', 'I smell gas in the garage', 'there is a gas leak', 'my carbon monoxide detector is beeping and I feel dizzy',
  'my kitchen is on fire', 'there is a fire in my house', 'fire right now', 'electrical fire', 'there is a fire in the basement',
  'I smell smoke', 'I smell something burning', 'something is burning in the oven and the kitchen is full of smoke', 'smoke is coming from the vent',
  'the room is filling with smoke', 'the house is filling with smoke', 'there are flames', 'I can see flames in the kitchen',
  'the alarm is going off', 'my smoke alarm is going off',
];
const ORDINARY = [
  'show open fire claims', 'which claims involve smoke damage', 'show my smoke detector maintenance tasks', 'Smoke & CO detector check', 'when does my fire insurance expire',
  'set my alarm system code', 'does my alarm system have a warranty', 'when was my furnace last serviced', 'show open claims for water damage', 'when does the flame retardant need replacing',
];

test('every emergency phrasing trips the registry safety stage', () => {
  for (const m of EMERGENCIES) assert.equal(resolveAskRoutingCascade(m, {}).stage, 'SAFETY', m);
});

test('every emergency phrasing also trips the cross-domain gate (defense in depth)', () => {
  for (const m of EMERGENCIES) assert.equal(parseCrossDomainSemanticRequest(m).plan.outcome, 'BOUNDARY', m);
});

test('ordinary questions that only mention fire, smoke, flame or an alarm are not emergencies on either gate', () => {
  for (const m of ORDINARY) {
    assert.notEqual(resolveAskOperation(m).operationId, 'EMERGENCY_BOUNDARY', m);
    assert.notEqual(resolveAskRoutingCascade(m, {}).stage, 'SAFETY', m);
    assert.notEqual(parseCrossDomainSemanticRequest(m).plan.outcome, 'BOUNDARY', m);
  }
});

test('the emergency wording covers: leave, no switches/devices/flame/phone, no vehicle or garage-door opener, call from outside, do not investigate or re-enter', () => {
  assert.match(EMERGENCY_BOUNDARY_BODY, /Leave the home right away/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /do not use switches, lights, appliances or other electrical devices, do not use a flame, and do not use a phone/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /Do not start a vehicle or use a garage-door opener in an attached garage/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /From outside and away from the building, call 911/);
  assert.match(EMERGENCY_BOUNDARY_BODY, /do not go back in until responders say it is safe/);
});
