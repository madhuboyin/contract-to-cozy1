const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

require('ts-node/register');

// Exercises the real jwt.util implementation (no mocking) — this is the
// negative-auth coverage the pilot readiness plan called out as missing:
// tampered signatures and expired tokens must be rejected, not just the
// stale-tokenVersion case already covered in authMiddleware.test.js (which
// mocks verifyAccessToken away entirely and never touches real signing).

const { generateAccessToken, verifyAccessToken } = require('../../src/utils/jwt.util.ts');

const BASE_PAYLOAD = {
  userId: 'user-1',
  email: 'homeowner@example.com',
  role: 'HOMEOWNER',
  tokenVersion: 1,
  mfaEnabled: false,
  mfaVerified: false,
};

test('verifyAccessToken accepts a validly signed token', () => {
  const token = generateAccessToken(BASE_PAYLOAD);
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.userId, BASE_PAYLOAD.userId);
  assert.equal(decoded.role, BASE_PAYLOAD.role);
});

test('verifyAccessToken rejects a token with a tampered signature', () => {
  const token = generateAccessToken(BASE_PAYLOAD);
  const parts = token.split('.');
  // Flip the last character of the signature segment — payload and header
  // stay intact and parseable, only the signature becomes invalid.
  const lastChar = parts[2].slice(-1);
  const flipped = lastChar === 'A' ? 'B' : 'A';
  parts[2] = parts[2].slice(0, -1) + flipped;
  const tampered = parts.join('.');

  assert.throws(() => verifyAccessToken(tampered), /Invalid or expired access token/);
});

test('verifyAccessToken rejects a token signed with a different secret', () => {
  const forged = jwt.sign(
    { ...BASE_PAYLOAD, tokenType: 'access' },
    'attacker-controlled-secret',
    { expiresIn: '15m' }
  );

  assert.throws(() => verifyAccessToken(forged), /Invalid or expired access token/);
});

test('verifyAccessToken rejects an expired token', () => {
  // devFallback secret from jwt.config.ts is used outside production —
  // sign directly with it via an already-expired `exp` claim.
  const expired = jwt.sign(
    { ...BASE_PAYLOAD, tokenType: 'access', exp: Math.floor(Date.now() / 1000) - 60 },
    'dev-access-token-secret-not-for-production'
  );

  assert.throws(() => verifyAccessToken(expired), /Invalid or expired access token/);
});
