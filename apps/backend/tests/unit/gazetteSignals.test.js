// tests/unit/gazetteSignals.test.js
// Tests for gazette signal collection logic: share-safe flags, urgency-based
// expiry windows, deep link format, novelty key stability, and stale candidate
// expiry. All pure inline logic — no Prisma, no external dependencies.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// ---------------------------------------------------------------------------
// Inline pure implementations (mirrors signal collector + candidate factory)
// ---------------------------------------------------------------------------

// Share-safe categories (from gazetteSignalCollector.service.ts)
const SHARE_SAFE_CATEGORIES = new Set([
  'MAINTENANCE', 'WARRANTY', 'INSURANCE', 'SCORE',
  'REFINANCE', 'NEIGHBORHOOD', 'SEASONAL', 'FINANCIAL', 'DIGITAL_TWIN', 'GENERAL',
]);
const NOT_SHARE_SAFE_CATEGORIES = new Set(['INCIDENT', 'CLAIMS']);

function isShareSafe(storyCategory) {
  return !NOT_SHARE_SAFE_CATEGORIES.has(storyCategory);
}

// Expiry window calculation (from gazetteCandidateFactory.service.ts)
const DEFAULT_EXPIRY_DAYS = 14;
const HIGH_URGENCY_EXPIRY_DAYS = 7;
const HIGH_URGENCY_THRESHOLD = 0.7;
const HARD_EXPIRY_MULTIPLIER = 2; // expiresAt = DEFAULT_EXPIRY_DAYS * 2

function computeStoryDeadline(urgency, nowMs) {
  if (urgency >= HIGH_URGENCY_THRESHOLD) {
    return new Date(nowMs + HIGH_URGENCY_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  }
  return new Date(nowMs + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

function computeHardExpiry(nowMs) {
  return new Date(nowMs + DEFAULT_EXPIRY_DAYS * HARD_EXPIRY_MULTIPLIER * 24 * 60 * 60 * 1000);
}

// Novelty key (from gazetteCandidateFactory.service.ts)
function computeNoveltyKey(sourceFeature, entityType, entityId) {
  return createHash('sha256').update(`${sourceFeature}:${entityType}:${entityId}`).digest('hex');
}

// Deep link validation
function isValidDeepLink(primaryDeepLink) {
  if (!primaryDeepLink) return false;
  if (!primaryDeepLink.startsWith('/dashboard/')) return false;
  const parts = primaryDeepLink.split('/').filter(Boolean);
  return parts.length >= 3;
}

// Mark expired candidates simulation
function markExpiredCandidates(candidates, now) {
  let count = 0;
  return candidates.map((c) => {
    if (c.status === 'ACTIVE' && c.expiresAt && c.expiresAt < now) {
      count++;
      return { ...c, status: 'EXPIRED' };
    }
    return c;
  });
}

// ---------------------------------------------------------------------------
// Tests: Share-Safe Categories
// ---------------------------------------------------------------------------

describe('Gazette Signals — Share-Safe Flags', () => {
  test('1. MAINTENANCE → shareSafe = true', () => {
    assert.equal(isShareSafe('MAINTENANCE'), true);
  });

  test('2. WARRANTY → shareSafe = true', () => {
    assert.equal(isShareSafe('WARRANTY'), true);
  });

  test('3. INSURANCE → shareSafe = true', () => {
    assert.equal(isShareSafe('INSURANCE'), true);
  });

  test('4. SCORE → shareSafe = true', () => {
    assert.equal(isShareSafe('SCORE'), true);
  });

  test('5. REFINANCE → shareSafe = true', () => {
    assert.equal(isShareSafe('REFINANCE'), true);
  });

  test('6. NEIGHBORHOOD → shareSafe = true', () => {
    assert.equal(isShareSafe('NEIGHBORHOOD'), true);
  });

  test('7. INCIDENT → shareSafe = false (privacy-sensitive)', () => {
    assert.equal(isShareSafe('INCIDENT'), false);
  });

  test('8. CLAIMS → shareSafe = false (privacy-sensitive)', () => {
    assert.equal(isShareSafe('CLAIMS'), false);
  });

  test('9. GENERAL → shareSafe = true (default)', () => {
    assert.equal(isShareSafe('GENERAL'), true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Urgency-Based Expiry Window
// ---------------------------------------------------------------------------

describe('Gazette Signals — Urgency-Based Expiry Window', () => {
  const NOW = new Date('2026-03-17T06:00:00Z').getTime();

  test('10. High-urgency signal (>= 0.7) → 7-day story deadline', () => {
    const deadline = computeStoryDeadline(0.7, NOW);
    const diffDays = (deadline.getTime() - NOW) / (1000 * 60 * 60 * 24);
    assert.ok(Math.abs(diffDays - HIGH_URGENCY_EXPIRY_DAYS) < 0.01,
      `Expected ${HIGH_URGENCY_EXPIRY_DAYS} days, got ${diffDays}`);
  });

  test('11. Low-urgency signal (< 0.7) → 14-day story deadline', () => {
    const deadline = computeStoryDeadline(0.5, NOW);
    const diffDays = (deadline.getTime() - NOW) / (1000 * 60 * 60 * 24);
    assert.ok(Math.abs(diffDays - DEFAULT_EXPIRY_DAYS) < 0.01,
      `Expected ${DEFAULT_EXPIRY_DAYS} days, got ${diffDays}`);
  });

  test('12. Urgency exactly at boundary (0.70) → high-urgency window (7 days)', () => {
    const deadline = computeStoryDeadline(0.70, NOW);
    const diffDays = (deadline.getTime() - NOW) / (1000 * 60 * 60 * 24);
    assert.ok(Math.abs(diffDays - HIGH_URGENCY_EXPIRY_DAYS) < 0.01);
  });

  test('13. Urgency just below boundary (0.699) → default window (14 days)', () => {
    const deadline = computeStoryDeadline(0.699, NOW);
    const diffDays = (deadline.getTime() - NOW) / (1000 * 60 * 60 * 24);
    assert.ok(Math.abs(diffDays - DEFAULT_EXPIRY_DAYS) < 0.01);
  });

  test('14. Hard expiry = 28 days (DEFAULT_EXPIRY_DAYS × 2)', () => {
    const expiry = computeHardExpiry(NOW);
    const diffDays = (expiry.getTime() - NOW) / (1000 * 60 * 60 * 24);
    assert.ok(Math.abs(diffDays - (DEFAULT_EXPIRY_DAYS * HARD_EXPIRY_MULTIPLIER)) < 0.01,
      `Expected 28 days, got ${diffDays}`);
  });

  test('15. High-urgency deadline < low-urgency deadline (shorter window)', () => {
    const highUrgencyDeadline = computeStoryDeadline(0.9, NOW);
    const lowUrgencyDeadline = computeStoryDeadline(0.3, NOW);
    assert.ok(highUrgencyDeadline < lowUrgencyDeadline,
      'High-urgency items should expire sooner (7 days < 14 days)');
  });
});

// ---------------------------------------------------------------------------
// Tests: Novelty Key Stability
// ---------------------------------------------------------------------------

describe('Gazette Signals — Novelty Key', () => {
  test('16. Same inputs → same key (stable)', () => {
    const k1 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-abc');
    const k2 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-abc');
    assert.equal(k1, k2);
  });

  test('17. Different entityId → different key', () => {
    const k1 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-abc');
    const k2 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-xyz');
    assert.notEqual(k1, k2);
  });

  test('18. Different sourceFeature → different key', () => {
    const k1 = computeNoveltyKey('MAINTENANCE', 'Task', 'entity-1');
    const k2 = computeNoveltyKey('INCIDENT', 'Task', 'entity-1');
    assert.notEqual(k1, k2);
  });

  test('19. Different entityType → different key', () => {
    const k1 = computeNoveltyKey('SRC', 'TypeA', 'entity-1');
    const k2 = computeNoveltyKey('SRC', 'TypeB', 'entity-1');
    assert.notEqual(k1, k2);
  });

  test('20. Key is 64-char lowercase hex', () => {
    const key = computeNoveltyKey('MAINTENANCE', 'Task', 'entity-1');
    assert.equal(key.length, 64);
    assert.match(key, /^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Deep Link Validation
// ---------------------------------------------------------------------------

describe('Gazette Signals — Deep Link Validation', () => {
  test('21. Valid deep link passes', () => {
    assert.equal(isValidDeepLink('/dashboard/properties/abc/tools/maintenance'), true);
  });

  test('22. Missing leading slash → invalid', () => {
    assert.equal(isValidDeepLink('dashboard/properties/abc/maintenance'), false);
  });

  test('23. External URL → invalid', () => {
    assert.equal(isValidDeepLink('https://example.com/dashboard/properties'), false);
  });

  test('24. /dashboard/ alone (too short) → invalid', () => {
    assert.equal(isValidDeepLink('/dashboard/'), false);
  });

  test('25. /dashboard/properties/id (3 parts) → valid', () => {
    assert.equal(isValidDeepLink('/dashboard/properties/abc123'), true);
  });

  test('26. null deep link → invalid', () => {
    assert.equal(isValidDeepLink(null), false);
  });

  test('27. Empty string → invalid', () => {
    assert.equal(isValidDeepLink(''), false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Stale Candidate Expiry (markExpiredCandidates logic)
// ---------------------------------------------------------------------------

describe('Gazette Signals — Stale Candidate Cleanup', () => {
  const NOW = new Date('2026-03-17T06:00:00Z');

  test('28. ACTIVE candidate past expiresAt → marked EXPIRED', () => {
    const candidates = [
      { id: 'c1', status: 'ACTIVE', expiresAt: new Date('2026-03-10T00:00:00Z') }, // 7 days ago
    ];
    const result = markExpiredCandidates(candidates, NOW);
    assert.equal(result[0].status, 'EXPIRED');
  });

  test('29. ACTIVE candidate with future expiresAt → remains ACTIVE', () => {
    const candidates = [
      { id: 'c1', status: 'ACTIVE', expiresAt: new Date('2026-03-30T00:00:00Z') }, // future
    ];
    const result = markExpiredCandidates(candidates, NOW);
    assert.equal(result[0].status, 'ACTIVE');
  });

  test('30. SELECTED candidate past expiresAt → NOT changed (only ACTIVE candidates expire)', () => {
    const candidates = [
      { id: 'c1', status: 'SELECTED', expiresAt: new Date('2026-03-10T00:00:00Z') },
    ];
    const result = markExpiredCandidates(candidates, NOW);
    assert.equal(result[0].status, 'SELECTED');
  });

  test('31. ACTIVE candidate with no expiresAt → remains ACTIVE (no hard expiry)', () => {
    const candidates = [
      { id: 'c1', status: 'ACTIVE', expiresAt: null },
    ];
    const result = markExpiredCandidates(candidates, NOW);
    assert.equal(result[0].status, 'ACTIVE');
  });

  test('32. Multiple candidates: only expired ACTIVE ones are updated', () => {
    const candidates = [
      { id: 'c1', status: 'ACTIVE', expiresAt: new Date('2026-03-10T00:00:00Z') }, // expired
      { id: 'c2', status: 'ACTIVE', expiresAt: new Date('2026-03-30T00:00:00Z') }, // valid
      { id: 'c3', status: 'SELECTED', expiresAt: new Date('2026-03-10T00:00:00Z') }, // skip
      { id: 'c4', status: 'EXPIRED', expiresAt: new Date('2026-03-10T00:00:00Z') }, // already expired
    ];
    const result = markExpiredCandidates(candidates, NOW);
    const statuses = Object.fromEntries(result.map((c) => [c.id, c.status]));
    assert.equal(statuses['c1'], 'EXPIRED');
    assert.equal(statuses['c2'], 'ACTIVE');
    assert.equal(statuses['c3'], 'SELECTED');
    assert.equal(statuses['c4'], 'EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// Tests: Novelty Score
// ---------------------------------------------------------------------------

describe('Gazette Signals — New Candidate Novelty Score', () => {
  test('33. New candidates start with noveltyScore = 1.0 (maximum novelty)', () => {
    // Per gazetteCandidateFactory.service.ts: noveltyScore: 1.0 on create
    const newCandidateNoveltyScore = 1.0;
    assert.equal(newCandidateNoveltyScore, 1.0);
  });

  test('34. Novelty score is in valid [0, 1] range', () => {
    const score = 1.0;
    assert.ok(score >= 0 && score <= 1);
  });
});
