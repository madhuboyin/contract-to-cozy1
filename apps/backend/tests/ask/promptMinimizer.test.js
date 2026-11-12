const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { minimizePrompt, detectIdentifiers } = require('../../src/services/ask/privacy/promptMinimizer.ts');

const ADVERSARIAL = [
  'email me at jane.doe@example.com when my warranty expires',
  'call 415-555-0199 about the furnace',
  'my SSN is 123-45-6789 is my roof covered',
  'the house at 1234 Maple Grove Street needs a new roof, how old is it',
  'what is the status of claim number HC-88231-A',
  'is policy # PX99812345 still active',
  'see https://example.com/doc/123 for the water heater warranty',
  'permit no. BP-2021-00431 final?',
  'serial number SN4412XJ9 water heater age',
];
test('no detectable identifier survives the minimiser in an outbound payload', () => {
  for (const raw of ADVERSARIAL) {
    const r = minimizePrompt(raw);
    if (r.noCall) continue;
    assert.deepEqual(detectIdentifiers(r.text), [], `${raw} -> ${r.text}`);
  }
});
test('routing meaning survives: placeholders carry roles', () => {
  const r = minimizePrompt('what is the status of my claim with State Farm', [{ name: 'State Farm', role: 'INSURER' }]);
  assert.equal(r.noCall, null); assert.match(r.text, /\[INSURER\]/); assert.match(r.text, /status of my claim/);
});
test('ordinary prompts are unchanged and domain terms are not treated as names', () => {
  for (const p of ['how old is my roof', 'is my HVAC under warranty', 'what does my Home Record say about the HOA', 'when is my April inspection']) assert.equal(minimizePrompt(p).text, p);
});
test('pass 2 recovers what pass 1 missed (name next to a digit run is not classifiable -> no call)', () => {
  assert.equal(minimizePrompt('check Hendersen 44120987 please').noCall, 'UNCLASSIFIABLE_IDENTIFIER');
  assert.equal(minimizePrompt('the number 4412098765432 on the card').noCall, 'UNCLASSIFIABLE_IDENTIFIER');
});
test('a prompt that is only an identifier is not sent', () => {
  assert.equal(minimizePrompt('jane@example.com').noCall, 'UNINTERPRETABLE_AFTER_MINIMISATION');
});
test('money amounts are preserved', () => {
  assert.equal(minimizePrompt('can I afford $12,500 for a new roof').text, 'can I afford $12,500 for a new roof');
});
