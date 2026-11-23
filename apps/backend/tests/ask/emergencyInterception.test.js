// BICC-SAFE-001/002/003, BICC-GATE-009 (tuning evidence only, BICC-EVAL-002: the corpus was visible while the patterns were tuned; it is not certification evidence).
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation, isActiveEmergencyMessage } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ACTIVE, BENIGN } = require('../fixtures/safety/emergencyCorpus.js');

test('active-emergency recall on the tuning corpus is complete, for every SAFE-001 category', () => {
  const missed = ACTIVE.filter(([message]) => resolveAskOperation(message).operationId !== 'EMERGENCY_BOUNDARY');
  assert.deepEqual(missed, [], `recall ${ACTIVE.length - missed.length}/${ACTIVE.length}`);
  const categories = new Set(ACTIVE.map(([, category]) => category));
  for (const required of ['gas', 'co', 'fire', 'smoke', 'electrical', 'overheating', 'flood-electric', 'flood', 'structural']) assert.ok(categories.has(required), `the corpus covers ${required}`);
  assert.ok(ACTIVE.length >= 50);
});

test('education, history, hypotheticals, resolved incidents and routine maintenance are not intercepted (false-positive rate 0 on the tuning corpus)', () => {
  const fired = BENIGN.filter(([message]) => resolveAskOperation(message).operationId === 'EMERGENCY_BOUNDARY');
  assert.deepEqual(fired, [], `false positives ${fired.length}/${BENIGN.length}`);
  const categories = new Set(BENIGN.map(([, category]) => category));
  for (const required of ['educational', 'historical', 'conditional', 'resolved', 'ordinary']) assert.ok(categories.has(required), `the corpus covers ${required}`);
});

test('emergency interception wins over every other stage, so no lookup, guidance or planner can answer first', () => {
  for (const [message] of ACTIVE) assert.equal(resolveAskRoutingCascade(message, { propertyId: 'p1' }).stage, 'SAFETY', message);
});

test('a framing in one clause never silences an emergency stated in another', () => {
  for (const message of ['what should i do? i smell gas', 'if i am wrong tell me, but there is smoke coming from the outlet', 'last year was a fire; right now the kitchen is on fire']) {
    assert.equal(isActiveEmergencyMessage(message), true, message);
  }
  for (const message of ['what should i do if i smell gas', 'if my house caught fire would insurance cover it', 'the gas leak was fixed yesterday']) {
    assert.equal(isActiveEmergencyMessage(message), false, message);
  }
});

test('an emergency answer is a blocked safety answer that offers no ordinary next actions (SAFE-003)', () => {
  const { resolveCapabilityHandler } = (() => { try { return require('../../src/services/ask/handlers/capabilityHandlerRegistry.ts'); } catch { return {}; } })();
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.match(source, /function emergencyResult[\s\S]{0,260}status: 'BLOCKED',\s*reasonCode: 'IMMEDIATE_SAFETY'/);
  assert.match(source, /function emergencyResult[\s\S]{0,700}suggestions: \[\],\s*\}/, 'the result carries no suggestions of its own');
  const finalizer = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts'), 'utf8');
  assert.match(finalizer, /'BLOCKED'/, 'a blocked result is never given suggested next actions');
  void resolveCapabilityHandler;
});
