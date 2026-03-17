// tests/unit/gazetteShare.test.js
// Tests for gazette share token logic — no Prisma, no DB needed.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');

// ---------------------------------------------------------------------------
// Inline pure implementations (mirrors gazetteShare.service.ts)
// ---------------------------------------------------------------------------

function generateRawToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Simulate share link validity check.
 * Returns { valid: boolean, reason?: string }
 */
function isShareLinkValid(shareLink, nowMs) {
  const now = nowMs ?? Date.now();

  if (shareLink.status !== 'ACTIVE') {
    return { valid: false, reason: 'LINK_NOT_ACTIVE' };
  }

  if (shareLink.expiresAt && new Date(shareLink.expiresAt).getTime() <= now) {
    return { valid: false, reason: 'LINK_EXPIRED' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Tests: Token Generation
// ---------------------------------------------------------------------------

describe('Gazette Share — Token Generation', () => {
  test('1. Raw token has length > 0', () => {
    const token = generateRawToken();
    assert.ok(token.length > 0, 'Token should not be empty');
  });

  test('2. sha256(rawToken) !== rawToken', () => {
    const token = generateRawToken();
    const hashed = hashToken(token);
    assert.notEqual(hashed, token, 'Hash should differ from raw token');
  });

  test('3. Same rawToken → same hash (deterministic)', () => {
    const token = generateRawToken();
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    assert.equal(hash1, hash2, 'Same input should produce same hash');
  });

  test('4. Different rawTokens → different hashes', () => {
    const token1 = generateRawToken();
    const token2 = generateRawToken();
    const hash1 = hashToken(token1);
    const hash2 = hashToken(token2);
    assert.notEqual(hash1, hash2, 'Different tokens should produce different hashes');
  });

  test('5. tokenHash is 64 characters (SHA-256 hex)', () => {
    const token = generateRawToken();
    const hash = hashToken(token);
    assert.equal(hash.length, 64, `SHA-256 hex should be 64 chars, got ${hash.length}`);
  });

  test('6. Token can be hashed without error', () => {
    assert.doesNotThrow(() => {
      const token = generateRawToken();
      hashToken(token);
    });
  });

  test('10. Hash function works for empty string (edge case)', () => {
    const hash = hashToken('');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
  });

  test('11. Share URL token format is URL-safe hex string', () => {
    const token = generateRawToken();
    // Hex strings only contain 0-9 and a-f
    assert.match(token, /^[0-9a-f]+$/, 'Token should be a hex string (URL-safe)');
  });

  test('12. Two separate calls to generate token → different tokens (uniqueness)', () => {
    const token1 = generateRawToken();
    const token2 = generateRawToken();
    assert.notEqual(token1, token2, 'Each generated token should be unique');
  });
});

// ---------------------------------------------------------------------------
// Tests: Share Link Validity
// ---------------------------------------------------------------------------

describe('Gazette Share — Link Validity', () => {
  test('7. Revoked share link → access should be denied', () => {
    const shareLink = {
      status: 'REVOKED',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // expires in 7 days
    };
    const { valid, reason } = isShareLinkValid(shareLink, Date.now());
    assert.equal(valid, false);
    assert.equal(reason, 'LINK_NOT_ACTIVE');
  });

  test('8. Expired share link → access should be denied', () => {
    const shareLink = {
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    };
    const { valid, reason } = isShareLinkValid(shareLink, Date.now());
    assert.equal(valid, false);
    assert.equal(reason, 'LINK_EXPIRED');
  });

  test('9. Active, non-expired share link → access should be allowed', () => {
    const shareLink = {
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // expires in 30 days
    };
    const { valid } = isShareLinkValid(shareLink, Date.now());
    assert.equal(valid, true);
  });

  test('9b. Active share link with no expiry → access should be allowed', () => {
    const shareLink = {
      status: 'ACTIVE',
      expiresAt: null,
    };
    const { valid } = isShareLinkValid(shareLink, Date.now());
    assert.equal(valid, true);
  });

  test('9c. EXPIRED status share link → access should be denied', () => {
    const shareLink = {
      status: 'EXPIRED',
      expiresAt: null,
    };
    const { valid, reason } = isShareLinkValid(shareLink, Date.now());
    assert.equal(valid, false);
    assert.equal(reason, 'LINK_NOT_ACTIVE');
  });
});

// ---------------------------------------------------------------------------
// Tests: Token Properties
// ---------------------------------------------------------------------------

describe('Gazette Share — Token Properties', () => {
  test('Raw token length is 64 chars (32 bytes hex encoded)', () => {
    const token = generateRawToken();
    assert.equal(token.length, 64, `Expected 64 char hex token, got ${token.length}`);
  });

  test('Hash of same string is idempotent across multiple calls', () => {
    const token = 'fixed-test-token-for-idempotency-check-123';
    const results = Array.from({ length: 5 }, () => hashToken(token));
    const allSame = results.every((h) => h === results[0]);
    assert.ok(allSame, 'All hashes of the same input should be identical');
  });

  test('Token hash only contains lowercase hex characters', () => {
    const token = generateRawToken();
    const hash = hashToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/, 'Hash should be lowercase hex, 64 chars');
  });
});
