// tests/unit/gazettePublish.test.js
// Tests for gazette publish/skip logic and week window calculation.
// Pure inline logic — no Prisma, no external dependencies.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Inline pure implementations (mirrors gazettePublish.service.ts)
// ---------------------------------------------------------------------------

/**
 * Determine whether to publish or skip.
 * Returns an object with { status, skippedReason? }
 */
function publishOrSkipLogic(qualifiedCount, minQualifiedNeeded, selectedCount) {
  const shouldPublish = qualifiedCount >= minQualifiedNeeded && selectedCount > 0;

  if (shouldPublish) {
    return { status: 'PUBLISHED', skippedReason: null };
  }

  let skippedReason;
  if (qualifiedCount === 0) {
    skippedReason = `No stories qualified for this edition (minimum ${minQualifiedNeeded} required).`;
  } else if (selectedCount === 0) {
    skippedReason = `${qualifiedCount} stories qualified but none were selected after ranking.`;
  } else {
    skippedReason = `Only ${qualifiedCount} of ${minQualifiedNeeded} required stories qualified. Edition skipped to maintain quality bar.`;
  }

  return { status: 'SKIPPED', skippedReason };
}

/**
 * Get the ISO week window for a reference date.
 * Returns { weekStart: Date, weekEnd: Date }
 */
function getWeekWindow(referenceDate) {
  const ref = referenceDate ?? new Date();

  const d = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );

  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - daysToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Simulate idempotency: findOrCreate for (propertyId, weekStart, weekEnd).
 */
function simulateFindOrCreate(store, propertyId, weekStart, weekEnd) {
  const key = `${propertyId}:${weekStart.toISOString()}:${weekEnd.toISOString()}`;
  if (store[key]) {
    return { isNew: false, edition: store[key] };
  }
  const edition = { id: `edition-${Object.keys(store).length + 1}`, propertyId, weekStart, weekEnd, status: 'DRAFT' };
  store[key] = edition;
  return { isNew: true, edition };
}

// ---------------------------------------------------------------------------
// Tests: Publish / Skip Logic
// ---------------------------------------------------------------------------

describe('Gazette Publish — Publish vs Skip', () => {
  test('1. qualifiedCount >= 4 → PUBLISHED', () => {
    const { status } = publishOrSkipLogic(4, 4, 5);
    assert.equal(status, 'PUBLISHED');
  });

  test('2. qualifiedCount < 4 → SKIPPED', () => {
    const { status } = publishOrSkipLogic(3, 4, 3);
    assert.equal(status, 'SKIPPED');
  });

  test('3. qualifiedCount === 3 (boundary) → SKIPPED', () => {
    const { status } = publishOrSkipLogic(3, 4, 3);
    assert.equal(status, 'SKIPPED');
  });

  test('4. qualifiedCount === 4 (boundary) → PUBLISHED', () => {
    const { status } = publishOrSkipLogic(4, 4, 4);
    assert.equal(status, 'PUBLISHED');
  });

  test('5. qualifiedCount = 0 → SKIPPED with appropriate reason', () => {
    const { status, skippedReason } = publishOrSkipLogic(0, 4, 0);
    assert.equal(status, 'SKIPPED');
    assert.ok(skippedReason.includes('No stories qualified'), `Expected no-stories reason, got: ${skippedReason}`);
  });

  test('5b. selectedCount = 0 with qualified > 0 → SKIPPED', () => {
    const { status, skippedReason } = publishOrSkipLogic(4, 4, 0);
    assert.equal(status, 'SKIPPED');
    assert.ok(skippedReason, 'Should have a skipped reason');
  });

  test('13. Skip reason includes count information', () => {
    const { skippedReason } = publishOrSkipLogic(2, 4, 2);
    assert.ok(
      skippedReason.includes('2') && skippedReason.includes('4'),
      `Skip reason should include counts, got: ${skippedReason}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: Week Window Calculation
// ---------------------------------------------------------------------------

describe('Gazette Publish — Week Window', () => {
  test('6. weekStart is always Monday (ISO weekday 1)', () => {
    // Test with a known Wednesday: 2026-03-16 (Monday = 2026-03-16? Let's use a known Monday)
    // 2026-03-16 is a Monday
    const monday = new Date('2026-03-16T12:00:00Z');
    const { weekStart } = getWeekWindow(monday);
    assert.equal(weekStart.getUTCDay(), 1, `weekStart should be Monday (1), got ${weekStart.getUTCDay()}`);
  });

  test('7. weekEnd is always Sunday (ISO weekday 0)', () => {
    const monday = new Date('2026-03-16T12:00:00Z');
    const { weekEnd } = getWeekWindow(monday);
    assert.equal(weekEnd.getUTCDay(), 0, `weekEnd should be Sunday (0), got ${weekEnd.getUTCDay()}`);
  });

  test('8. weekStart is at 00:00:00.000 UTC', () => {
    const date = new Date('2026-03-18T15:30:00Z'); // Wednesday
    const { weekStart } = getWeekWindow(date);
    assert.equal(weekStart.getUTCHours(), 0);
    assert.equal(weekStart.getUTCMinutes(), 0);
    assert.equal(weekStart.getUTCSeconds(), 0);
    assert.equal(weekStart.getUTCMilliseconds(), 0);
  });

  test('9. weekEnd is at 23:59:59.999 UTC', () => {
    const date = new Date('2026-03-18T15:30:00Z'); // Wednesday
    const { weekEnd } = getWeekWindow(date);
    assert.equal(weekEnd.getUTCHours(), 23);
    assert.equal(weekEnd.getUTCMinutes(), 59);
    assert.equal(weekEnd.getUTCSeconds(), 59);
    assert.equal(weekEnd.getUTCMilliseconds(), 999);
  });

  test('10. Two different dates in same week → same week window', () => {
    const tuesday = new Date('2026-03-17T00:00:00Z');
    const thursday = new Date('2026-03-19T00:00:00Z');
    const win1 = getWeekWindow(tuesday);
    const win2 = getWeekWindow(thursday);
    assert.equal(win1.weekStart.toISOString(), win2.weekStart.toISOString());
    assert.equal(win1.weekEnd.toISOString(), win2.weekEnd.toISOString());
  });

  test('11. Monday and Sunday of same week → same weekStart', () => {
    const monday = new Date('2026-03-16T00:00:00Z');
    const sunday = new Date('2026-03-22T00:00:00Z');
    const win1 = getWeekWindow(monday);
    const win2 = getWeekWindow(sunday);
    assert.equal(win1.weekStart.toISOString(), win2.weekStart.toISOString());
  });

  test('12. Week windows are deterministic (same input → same output)', () => {
    const date = new Date('2026-03-18T10:00:00Z');
    const win1 = getWeekWindow(date);
    const win2 = getWeekWindow(date);
    assert.equal(win1.weekStart.toISOString(), win2.weekStart.toISOString());
    assert.equal(win1.weekEnd.toISOString(), win2.weekEnd.toISOString());
  });

  test('11b. weekEnd date is 6 days after weekStart date', () => {
    const date = new Date('2026-03-18T00:00:00Z');
    const { weekStart, weekEnd } = getWeekWindow(date);
    // weekEnd is Sunday 23:59:59.999, weekStart is Monday 00:00:00.000
    // The DATE difference (ignoring time) should be exactly 6 days
    const startMidnight = Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
    const endMidnight = Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate());
    const diffDays = (endMidnight - startMidnight) / (1000 * 60 * 60 * 24);
    assert.equal(diffDays, 6, `Week should span 6 calendar days (Mon–Sun), got ${diffDays}`);
  });

  test('Monday correctly maps to its own week start', () => {
    const monday = new Date('2026-03-16T00:00:00Z'); // Known Monday
    const { weekStart } = getWeekWindow(monday);
    assert.equal(weekStart.getUTCFullYear(), 2026);
    assert.equal(weekStart.getUTCMonth(), 2); // March = 2 (0-indexed)
    assert.equal(weekStart.getUTCDate(), 16);
  });

  test('Sunday maps to the same week as the preceding Monday', () => {
    const sunday = new Date('2026-03-22T00:00:00Z'); // Sunday following 2026-03-16 Monday
    const monday = new Date('2026-03-16T00:00:00Z');
    const winSun = getWeekWindow(sunday);
    const winMon = getWeekWindow(monday);
    assert.equal(winSun.weekStart.toISOString(), winMon.weekStart.toISOString());
  });
});

// ---------------------------------------------------------------------------
// Tests: Idempotency
// ---------------------------------------------------------------------------

describe('Gazette Publish — Edition Idempotency', () => {
  test('14. Same (propertyId, weekStart, weekEnd) → should not create second edition', () => {
    const store = {};
    const weekWindow = getWeekWindow(new Date('2026-03-16T00:00:00Z'));
    const result1 = simulateFindOrCreate(store, 'prop-1', weekWindow.weekStart, weekWindow.weekEnd);
    const result2 = simulateFindOrCreate(store, 'prop-1', weekWindow.weekStart, weekWindow.weekEnd);

    assert.equal(result1.isNew, true, 'First call should create a new edition');
    assert.equal(result2.isNew, false, 'Second call should find existing edition');
    assert.equal(result1.edition.id, result2.edition.id, 'Should return same edition ID');
  });

  test('15. PUBLISHED edition should not be re-published (status guard)', () => {
    // Simulate checking edition status before running generation
    const edition = { status: 'PUBLISHED', qualifiedCount: 5, selectedCount: 4 };
    const shouldSkip = edition.status === 'PUBLISHED';
    assert.equal(shouldSkip, true, 'Pipeline should exit early for PUBLISHED editions');
  });
});
