const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { redactSensitiveKeys, toMetricLabel, DEFAULT_SENSITIVE_KEYS } = require('../../src/lib/redaction.ts');

test('redacts default sensitive keys anywhere in the tree, case-insensitively', () => {
  const input = {
    email: 'sarah@example.com',
    Password: 'hunter2',
    nested: {
      token: 'abc123',
      profileAnswer: { raw: 'has 3 kids under 5' },
    },
    list: [{ mfaSecret: 'xyz' }, { ok: true }],
  };

  const result = redactSensitiveKeys(input);

  assert.equal(result.email, 'sarah@example.com');
  assert.equal(result.Password, '[REDACTED]');
  assert.equal(result.nested.token, '[REDACTED]');
  assert.equal(result.nested.profileAnswer, '[REDACTED]');
  assert.equal(result.list[0].mfaSecret, '[REDACTED]');
  assert.equal(result.list[1].ok, true);
});

test('does not mutate the input', () => {
  const input = { password: 'hunter2' };
  redactSensitiveKeys(input);
  assert.equal(input.password, 'hunter2');
});

test('accepts a caller-supplied key list instead of the default', () => {
  const input = { onlyThisKey: 'secret', other: 'fine' };
  const result = redactSensitiveKeys(input, ['onlyThisKey']);
  assert.equal(result.onlyThisKey, '[REDACTED]');
  assert.equal(result.other, 'fine');
});

test('passes through primitives and dates untouched', () => {
  const date = new Date('2026-01-01');
  assert.equal(redactSensitiveKeys('plain string'), 'plain string');
  assert.equal(redactSensitiveKeys(42), 42);
  assert.equal(redactSensitiveKeys(null), null);
  assert.equal(redactSensitiveKeys(date), date);
});

test('DEFAULT_SENSITIVE_KEYS includes personalization-shaped fields', () => {
  assert.ok(DEFAULT_SENSITIVE_KEYS.includes('traitValue'));
  assert.ok(DEFAULT_SENSITIVE_KEYS.includes('evidenceJson'));
  assert.ok(DEFAULT_SENSITIVE_KEYS.includes('explanationText'));
});

test('toMetricLabel accepts short code-shaped strings', () => {
  assert.equal(toMetricLabel('hvac_filter_pet_adjusted'), 'hvac_filter_pet_adjusted');
  assert.equal(toMetricLabel('some-code.v2'), 'some-code.v2');
});

test('toMetricLabel rejects UUIDs, free text, and non-strings', () => {
  assert.equal(toMetricLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'unknown');
  assert.equal(toMetricLabel('this is a free text explanation of the trait'), 'unknown');
  assert.equal(toMetricLabel(12345), 'unknown');
  assert.equal(toMetricLabel(null), 'unknown');
  assert.equal(toMetricLabel(''), 'unknown');
});
