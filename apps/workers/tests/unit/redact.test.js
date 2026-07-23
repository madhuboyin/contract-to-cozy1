// apps/workers/tests/unit/redact.test.js
//
// WKR-015: redactText() is the free-text scrub used by jobFailureAlert.ts
// (and available to any future worker log/alert path) before raw stack
// traces reach an outbound email or log line.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { redactText } = require('../../src/lib/redact.ts');

test('redacts email addresses', () => {
  assert.equal(
    redactText('Failed to notify sarah@example.com about the update'),
    'Failed to notify [REDACTED] about the update',
  );
});

test('redacts an Authorization header carrying a Bearer token', () => {
  assert.equal(
    redactText('Authorization: Bearer sk_live_abc123def456ghi789'),
    'Authorization: [REDACTED]',
  );
});

test('redacts a bare Bearer token with no Authorization label', () => {
  assert.equal(
    redactText("curl -H 'Bearer sk_live_abc123def456ghi789' https://api.example.com"),
    "curl -H 'Bearer [REDACTED]' https://api.example.com",
  );
});

test('redacts JWT-shaped strings', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  assert.equal(redactText(`token in header: ${jwt}`), 'token in header: [REDACTED]');
});

test('redacts credentials embedded in a Postgres/Redis connection string', () => {
  assert.equal(
    redactText('connect ECONNREFUSED postgres://c2c_user:sup3rSecret@db-host:5432/c2c'),
    'connect ECONNREFUSED postgres://[REDACTED]@db-host:5432/c2c',
  );
  assert.equal(
    redactText('redis://default:redispass@redis-host:6379'),
    'redis://[REDACTED]@redis-host:6379',
  );
});

test('redacts presigned S3 URL signature params', () => {
  const url = 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc123&X-Amz-Credential=def456';
  assert.equal(
    redactText(url),
    'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=[REDACTED]&X-Amz-Credential=[REDACTED]',
  );
});

test('redacts labeled password/token/policy/claim values in free text', () => {
  assert.equal(redactText('password: hunter2!'), 'password: [REDACTED]');
  assert.equal(redactText('apiKey=sk_live_abcdef123456'), 'apiKey=[REDACTED]');
  assert.equal(redactText('policy number: PN-4471029'), 'policy number: [REDACTED]');
  assert.equal(redactText('claimNumber=CLM-99182'), 'claimNumber=[REDACTED]');
});

test('does not touch ordinary correlation identifiers (UUIDs, cuids, propertyId)', () => {
  const text = 'property 3fa85f64-5717-4562-b3fc-2c963f66afa6 job cljk3x9p20000qzrmn831p1a2 failed';
  assert.equal(redactText(text), text);
});

test('leaves plain error text with no sensitive content unchanged', () => {
  const text = 'TypeError: Cannot read properties of undefined (reading \'id\')\n    at processJob (job.ts:42:10)';
  assert.equal(redactText(text), text);
});

test('handles empty/falsy input without throwing', () => {
  assert.equal(redactText(''), '');
});
