const test = require('node:test'); const assert = require('node:assert/strict'); const { execFileSync } = require('node:child_process'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { normalizeForRouting, stripFraming, oneEditKind, correctToken } = require('../../src/services/ask/support/routingNormalization.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('framing is stripped, meaning words are kept', () => {
  assert.equal(stripFraming('hey cozy, how old is my roof please?'), 'how old is my roof');
  assert.equal(stripFraming('Can you please tell me how much I should save monthly?'), 'how much I should save monthly');
  assert.equal(stripFraming('tell me when my warranty expires'), 'tell me when my warranty expires');
  assert.equal(stripFraming('please'), 'please');
});
test('edit kinds', () => {
  assert.equal(oneEditKind('warrnaty', 'warranty'), 'transposition');
  assert.equal(oneEditKind('warrnty', 'warranty'), 'deletion');
  assert.equal(oneEditKind('warrranty', 'warranty'), 'insertion');
  assert.equal(oneEditKind('abc', 'xyz'), null);
});
test('typo correction fixes long words and leaves protected / allowlisted words', () => {
  assert.equal(correctToken('boiler'), null);
  assert.equal(correctToken('heater'), null);
  assert.equal(normalizeForRouting('is my Hendersen property ok').includes('Hendersen'), true);
  assert.equal(normalizeForRouting('email bob@example.com about warrnaty').includes('bob@example.com'), true);
  assert.equal(normalizeForRouting('my account 12345-abcde'), 'my account 12345-abcde');
});
test('typo retention: transposed letters route like the clean prompt', () => {
  const clean = resolveAskRoutingCascade('is my water heater under warranty', { localRoutingEnabled: false }).operation.operationId;
  const typo = resolveAskRoutingCascade('is my water heater under warrnaty', { localRoutingEnabled: false }).operation.operationId;
  assert.equal(typo, clean);
});
test('safety is decided on raw text', () => {
  const d = resolveAskRoutingCascade('hey cozy I smell gas in the kitchen please', { localRoutingEnabled: false });
  assert.equal(d.stage, 'SAFETY');
});
test('vocabulary artifact is current (FR-NRM-6)', () => {
  execFileSync('node', [path.join(__dirname, '../../scripts/ask-routing-vocabulary.js'), '--check'], { stdio: 'pipe' });
});
