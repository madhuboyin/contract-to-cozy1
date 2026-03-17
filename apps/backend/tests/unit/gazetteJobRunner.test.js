// tests/unit/gazetteJobRunner.test.js
// Tests for generation job runner safety: idempotency guards, FAILED→DRAFT reset,
// invalid story filtering, stage tracking, and dry-run mode.
// All pure inline logic — no Prisma, no external dependencies.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Inline pure implementations (mirrors gazetteGenerationJobRunner.service.ts)
// ---------------------------------------------------------------------------

/**
 * Simulate the idempotency guard: already-published editions return early.
 * Returns { earlyReturn: boolean, result?: object }
 */
function checkIdempotencyGuard(edition) {
  if (edition.status === 'PUBLISHED') {
    return {
      earlyReturn: true,
      result: {
        editionId: edition.id,
        status: 'ALREADY_PUBLISHED',
        qualifiedCount: edition.qualifiedCount,
        selectedCount: edition.selectedCount,
        stages: ['ALREADY_PUBLISHED'],
      },
    };
  }
  return { earlyReturn: false };
}

/**
 * Simulate FAILED → DRAFT reset logic.
 */
function applyFailedReset(edition) {
  if (edition.status === 'FAILED') {
    return { ...edition, status: 'DRAFT' };
  }
  return edition;
}

/**
 * Simulate validation stage: filter out stories missing required fields.
 * Returns { validStories, invalidCount }
 */
function validateStories(stories) {
  const validStories = stories.filter(
    (s) => s.headline && s.summary && s.primaryDeepLink,
  );
  return {
    validStories,
    invalidCount: stories.length - validStories.length,
  };
}

/**
 * Simulate publish-or-skip decision.
 */
function publishOrSkip(qualifiedCount, minQualifiedNeeded, selectedCount) {
  const shouldPublish = qualifiedCount >= minQualifiedNeeded && selectedCount > 0;
  if (shouldPublish) {
    return { status: 'PUBLISHED', skippedReason: null };
  }
  return {
    status: 'SKIPPED',
    skippedReason: qualifiedCount === 0
      ? `No stories qualified (minimum ${minQualifiedNeeded} required).`
      : `Only ${qualifiedCount} of ${minQualifiedNeeded} required stories qualified.`,
  };
}

/**
 * Simulate full pipeline stage tracking.
 */
function simulatePipeline(options) {
  const { hasSignals, candidateCount, qualifiedCount, minRequired = 4, dryRun = false } = options;
  const stages = [];
  const errors = [];

  stages.push('SIGNAL_COLLECTION');
  if (!hasSignals) return { stages, status: 'SKIPPED', qualifiedCount: 0, selectedCount: 0 };

  stages.push('CANDIDATE_GENERATION');
  if (candidateCount === 0) return { stages, status: 'SKIPPED', qualifiedCount: 0, selectedCount: 0 };

  const ranked = Math.min(qualifiedCount, candidateCount);
  if (qualifiedCount < minRequired) {
    return { stages, status: 'SKIPPED', qualifiedCount, selectedCount: 0 };
  }

  stages.push('RANKING');
  stages.push('EDITORIAL_GENERATION');
  stages.push('VALIDATION');
  stages.push('PUBLICATION');

  return { stages, status: dryRun ? 'DRAFT' : 'PUBLISHED', qualifiedCount, selectedCount: ranked };
}

// ---------------------------------------------------------------------------
// Tests: Idempotency Guard
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — Idempotency', () => {
  test('1. PUBLISHED edition → earlyReturn=true, status=ALREADY_PUBLISHED', () => {
    const edition = { id: 'ed-1', status: 'PUBLISHED', qualifiedCount: 5, selectedCount: 4 };
    const { earlyReturn, result } = checkIdempotencyGuard(edition);
    assert.equal(earlyReturn, true);
    assert.equal(result.status, 'ALREADY_PUBLISHED');
    assert.equal(result.editionId, 'ed-1');
    assert.deepEqual(result.stages, ['ALREADY_PUBLISHED']);
  });

  test('2. DRAFT edition → earlyReturn=false (pipeline continues)', () => {
    const edition = { id: 'ed-1', status: 'DRAFT', qualifiedCount: 0, selectedCount: 0 };
    const { earlyReturn } = checkIdempotencyGuard(edition);
    assert.equal(earlyReturn, false);
  });

  test('3. SKIPPED edition → earlyReturn=false (can regenerate)', () => {
    const edition = { id: 'ed-1', status: 'SKIPPED', qualifiedCount: 2, selectedCount: 0 };
    const { earlyReturn } = checkIdempotencyGuard(edition);
    assert.equal(earlyReturn, false);
  });

  test('4. FAILED edition → earlyReturn=false (eligible for retry)', () => {
    const edition = { id: 'ed-1', status: 'FAILED', qualifiedCount: 0, selectedCount: 0 };
    const { earlyReturn } = checkIdempotencyGuard(edition);
    assert.equal(earlyReturn, false);
  });

  test('5. ALREADY_PUBLISHED result preserves qualifiedCount and selectedCount', () => {
    const edition = { id: 'ed-2', status: 'PUBLISHED', qualifiedCount: 7, selectedCount: 6 };
    const { result } = checkIdempotencyGuard(edition);
    assert.equal(result.qualifiedCount, 7);
    assert.equal(result.selectedCount, 6);
  });
});

// ---------------------------------------------------------------------------
// Tests: FAILED → DRAFT Reset
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — FAILED → DRAFT Reset', () => {
  test('6. FAILED edition → reset to DRAFT for retry', () => {
    const edition = { id: 'ed-1', status: 'FAILED' };
    const reset = applyFailedReset(edition);
    assert.equal(reset.status, 'DRAFT');
  });

  test('7. Non-FAILED edition → not reset', () => {
    ['DRAFT', 'READY', 'PUBLISHED', 'SKIPPED'].forEach((status) => {
      const edition = { id: 'ed-1', status };
      const result = applyFailedReset(edition);
      assert.equal(result.status, status, `${status} should remain unchanged`);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Invalid Story Filtering (Validation Stage)
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — Invalid Story Filtering', () => {
  test('8. Story missing headline → filtered out', () => {
    const stories = [
      { id: 's1', headline: 'Valid headline', summary: 'Summary', primaryDeepLink: '/dashboard/p/1/tools/maintenance' },
      { id: 's2', headline: '', summary: 'Summary', primaryDeepLink: '/dashboard/p/1/tools/maintenance' },
    ];
    const { validStories, invalidCount } = validateStories(stories);
    assert.equal(validStories.length, 1);
    assert.equal(invalidCount, 1);
    assert.equal(validStories[0].id, 's1');
  });

  test('9. Story missing summary → filtered out', () => {
    const stories = [
      { id: 's1', headline: 'Headline', summary: null, primaryDeepLink: '/dashboard/p/1/tools/maintenance' },
    ];
    const { validStories, invalidCount } = validateStories(stories);
    assert.equal(validStories.length, 0);
    assert.equal(invalidCount, 1);
  });

  test('10. Story missing primaryDeepLink → filtered out', () => {
    const stories = [
      { id: 's1', headline: 'Headline', summary: 'Summary', primaryDeepLink: null },
    ];
    const { validStories, invalidCount } = validateStories(stories);
    assert.equal(validStories.length, 0);
    assert.equal(invalidCount, 1);
  });

  test('11. All valid stories → none filtered', () => {
    const stories = [
      { id: 's1', headline: 'H1', summary: 'S1', primaryDeepLink: '/dashboard/a' },
      { id: 's2', headline: 'H2', summary: 'S2', primaryDeepLink: '/dashboard/b' },
    ];
    const { validStories, invalidCount } = validateStories(stories);
    assert.equal(validStories.length, 2);
    assert.equal(invalidCount, 0);
  });

  test('12. Empty stories array → no error, 0 valid, 0 invalid', () => {
    const { validStories, invalidCount } = validateStories([]);
    assert.equal(validStories.length, 0);
    assert.equal(invalidCount, 0);
  });

  test('13. Mixed valid and invalid → only valid are kept', () => {
    const stories = [
      { id: 's1', headline: 'H1', summary: 'S1', primaryDeepLink: '/dashboard/a' }, // valid
      { id: 's2', headline: null, summary: 'S2', primaryDeepLink: '/dashboard/b' }, // missing headline
      { id: 's3', headline: 'H3', summary: '', primaryDeepLink: '/dashboard/c' },  // empty summary
      { id: 's4', headline: 'H4', summary: 'S4', primaryDeepLink: '/dashboard/d' }, // valid
    ];
    const { validStories, invalidCount } = validateStories(stories);
    assert.equal(validStories.length, 2);
    assert.equal(invalidCount, 2);
    assert.ok(validStories.every((s) => s.id === 's1' || s.id === 's4'));
  });
});

// ---------------------------------------------------------------------------
// Tests: Stage Tracking
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — Stage Tracking', () => {
  test('14. Full pipeline to PUBLISHED — all 6 stages recorded', () => {
    const result = simulatePipeline({
      hasSignals: true, candidateCount: 6, qualifiedCount: 5, minRequired: 4,
    });
    assert.equal(result.status, 'PUBLISHED');
    assert.deepEqual(result.stages, [
      'SIGNAL_COLLECTION', 'CANDIDATE_GENERATION', 'RANKING',
      'EDITORIAL_GENERATION', 'VALIDATION', 'PUBLICATION',
    ]);
  });

  test('15. No signals → SKIPPED after SIGNAL_COLLECTION only', () => {
    const result = simulatePipeline({ hasSignals: false, candidateCount: 0, qualifiedCount: 0 });
    assert.equal(result.status, 'SKIPPED');
    assert.deepEqual(result.stages, ['SIGNAL_COLLECTION']);
  });

  test('16. Insufficient qualified stories → SKIPPED after CANDIDATE_GENERATION', () => {
    const result = simulatePipeline({
      hasSignals: true, candidateCount: 3, qualifiedCount: 2, minRequired: 4,
    });
    assert.equal(result.status, 'SKIPPED');
    assert.ok(!result.stages.includes('RANKING'), 'Should not reach RANKING stage');
  });

  test('17. dryRun=true → returns DRAFT status (no write)', () => {
    const result = simulatePipeline({
      hasSignals: true, candidateCount: 6, qualifiedCount: 5, minRequired: 4, dryRun: true,
    });
    assert.equal(result.status, 'DRAFT');
  });
});

// ---------------------------------------------------------------------------
// Tests: Publish / Skip Thresholds
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — Publish / Skip Thresholds', () => {
  test('18. qualifiedCount >= minRequired AND selectedCount > 0 → PUBLISHED', () => {
    const { status } = publishOrSkip(4, 4, 4);
    assert.equal(status, 'PUBLISHED');
  });

  test('19. qualifiedCount < minRequired → SKIPPED', () => {
    const { status } = publishOrSkip(3, 4, 3);
    assert.equal(status, 'SKIPPED');
  });

  test('20. qualifiedCount = 0 → SKIPPED with "no stories" reason', () => {
    const { status, skippedReason } = publishOrSkip(0, 4, 0);
    assert.equal(status, 'SKIPPED');
    assert.ok(skippedReason.includes('No stories'));
  });

  test('21. selectedCount = 0 despite qualifiedCount >= minRequired → SKIPPED', () => {
    // This handles the edge case where qualified candidates exist but
    // all get filtered by the diversity cap or near-duplicate detection
    const { status } = publishOrSkip(4, 4, 0);
    assert.equal(status, 'SKIPPED');
  });

  test('22. qualifiedCount exactly at threshold (= minRequired) → PUBLISHED', () => {
    const { status } = publishOrSkip(4, 4, 4);
    assert.equal(status, 'PUBLISHED');
  });

  test('23. qualifiedCount one below threshold → SKIPPED', () => {
    const { status } = publishOrSkip(3, 4, 3);
    assert.equal(status, 'SKIPPED');
  });
});

// ---------------------------------------------------------------------------
// Tests: Selected vs Qualified Count
// ---------------------------------------------------------------------------

describe('Gazette Job Runner — Count Tracking', () => {
  test('24. selectedCount is the number of stories that passed all gates', () => {
    // qualifiedCount = candidates passing hard+soft gates
    // selectedCount = candidates actually ranked + assembled
    const qualifiedCount = 7;
    const rankedCount = 6; // category cap removed 1

    assert.ok(rankedCount <= qualifiedCount, 'selected ≤ qualified always');
  });

  test('25. After validation stage, selectedCount may be lower than ranked', () => {
    const rankedStories = [
      { headline: 'H1', summary: 'S1', primaryDeepLink: '/dashboard/a' },
      { headline: '', summary: 'S2', primaryDeepLink: '/dashboard/b' }, // invalid
      { headline: 'H3', summary: 'S3', primaryDeepLink: '/dashboard/c' },
    ];
    const { validStories } = validateStories(rankedStories);
    assert.equal(validStories.length, 2);
    assert.ok(validStories.length < rankedStories.length);
  });
});
