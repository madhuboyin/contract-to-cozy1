// tests/unit/gazetteRanking.test.js
// Tests for Gazette ranking logic — pure inline implementation, no DB needed.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Inline pure implementation (mirrors gazetteRankingEngine.service.ts)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  urgency: 0.30,
  financial: 0.25,
  confidence: 0.20,
  novelty: 0.15,
  engagement: 0.10,
};

const MIN_NEWSWORTHY_SCORE = 0.40;
const MAX_PER_CATEGORY = 2;
const MIN_CONFIDENCE = 0.25;

function calcCompositeScore({ urgency, financial, confidence, novelty, engagement }) {
  return (
    WEIGHTS.urgency * urgency +
    WEIGHTS.financial * financial +
    WEIGHTS.confidence * confidence +
    WEIGHTS.novelty * novelty +
    WEIGHTS.engagement * engagement
  );
}

function classifyExclusion(candidate, now = new Date()) {
  if (!candidate.primaryDeepLink || !candidate.primaryDeepLink.startsWith('/dashboard/')) {
    return 'MISSING_DEEP_LINK';
  }

  const facts = candidate.supportingFactsJson;
  if (!facts || (typeof facts === 'object' && Object.keys(facts).length === 0)) {
    return 'MISSING_SUPPORTING_FACTS';
  }

  if (candidate.expiresAt && candidate.expiresAt < now) {
    return 'EXPIRED';
  }

  if ((candidate.compositeScore ?? 0) < MIN_NEWSWORTHY_SCORE) {
    return 'BELOW_NEWSWORTHY_THRESHOLD';
  }

  if ((candidate.confidenceScore ?? 0) < MIN_CONFIDENCE) {
    return 'LOW_CONFIDENCE';
  }

  return null;
}

function determinePriorityByRank(rank) {
  if (rank === 1) return 'HERO';
  if (rank <= 4) return 'HIGH';
  if (rank <= 7) return 'MEDIUM';
  return 'LOW';
}

/**
 * Run the full ranking pipeline against an array of candidate objects.
 * Returns { ranked, excluded } arrays.
 */
function rankCandidatesInline(candidates, now = new Date()) {
  // Score all candidates
  const scored = candidates.map((c) => {
    const urgency = c.urgencyScoreInput ?? 0;
    const financial = c.financialImpactEstimate ?? 0;
    const confidence = c.confidenceScore ?? 0;
    const novelty = c.noveltyScore ?? 0;
    const engagement = c.engagementScore ?? 0;
    const compositeScore = calcCompositeScore({ urgency, financial, confidence, novelty, engagement });
    return { ...c, compositeScore };
  });

  // Apply hard exclusion gates
  const withExclusion = scored.map((c) => {
    const exclusionReason = classifyExclusion(c, now);
    return { ...c, exclusionReason };
  });

  // Sort eligible by composite score descending before diversity cap
  const eligible = withExclusion
    .filter((c) => !c.exclusionReason)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const categoryCounts = {};
  const rankedItems = [];
  const excludedItems = [];

  for (const item of eligible) {
    const cat = item.storyCategory;
    const count = categoryCounts[cat] ?? 0;
    if (count >= MAX_PER_CATEGORY) {
      excludedItems.push({ ...item, exclusionReason: 'CATEGORY_CAP' });
    } else {
      categoryCounts[cat] = count + 1;
      rankedItems.push(item);
    }
  }

  // Combine with previously excluded
  const allExcluded = withExclusion
    .filter((c) => c.exclusionReason)
    .concat(excludedItems);

  // Assign final ranks
  const ranked = rankedItems.map((item, idx) => ({ ...item, finalRank: idx + 1 }));

  return { ranked, excluded: allExcluded };
}

// ---------------------------------------------------------------------------
// Helpers to build test candidates
// ---------------------------------------------------------------------------

function makeCandidateBase(overrides = {}) {
  return {
    id: overrides.id || 'cand-1',
    storyCategory: overrides.storyCategory || 'MAINTENANCE',
    urgencyScoreInput: overrides.urgencyScoreInput ?? 0.7,
    financialImpactEstimate: overrides.financialImpactEstimate ?? 0.5,
    confidenceScore: overrides.confidenceScore ?? 0.8,
    noveltyScore: overrides.noveltyScore ?? 0.9,
    engagementScore: overrides.engagementScore ?? 0.6,
    primaryDeepLink: overrides.primaryDeepLink ?? '/dashboard/properties/123/tools/maintenance',
    supportingFactsJson: overrides.supportingFactsJson ?? { title: 'Test Task' },
    expiresAt: overrides.expiresAt ?? null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gazette Ranking — Composite Score', () => {
  test('1. Weights sum to 1.0', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 1e-10, `Weights sum should be 1.0, got ${total}`);
  });

  test('2. Candidate below MIN_NEWSWORTHY_SCORE is excluded with BELOW_NEWSWORTHY_THRESHOLD', () => {
    const candidate = makeCandidateBase({
      urgencyScoreInput: 0.1,
      financialImpactEstimate: 0.1,
      confidenceScore: 0.3,
      noveltyScore: 0.1,
      engagementScore: 0.1,
    });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const withScore = { ...candidate, compositeScore: score };
    const reason = classifyExclusion(withScore);
    assert.ok(score < MIN_NEWSWORTHY_SCORE, `Score ${score} should be below threshold`);
    assert.equal(reason, 'BELOW_NEWSWORTHY_THRESHOLD');
  });

  test('3. Candidate with compositeScore >= 0.40 is included', () => {
    const candidate = makeCandidateBase({
      urgencyScoreInput: 0.8,
      financialImpactEstimate: 0.7,
      confidenceScore: 0.9,
      noveltyScore: 0.8,
      engagementScore: 0.7,
    });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    assert.ok(score >= MIN_NEWSWORTHY_SCORE, `Score ${score} should be >= ${MIN_NEWSWORTHY_SCORE}`);
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, null);
  });

  test('4. Candidate missing primaryDeepLink is excluded with MISSING_DEEP_LINK', () => {
    const candidate = makeCandidateBase({ primaryDeepLink: null });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_DEEP_LINK');
  });

  test('5. Candidate with low confidence (< 0.25) is excluded with LOW_CONFIDENCE', () => {
    const candidate = makeCandidateBase({
      urgencyScoreInput: 0.9,
      financialImpactEstimate: 0.9,
      confidenceScore: 0.1,
      noveltyScore: 0.9,
      engagementScore: 0.9,
    });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'LOW_CONFIDENCE');
  });
});

describe('Gazette Ranking — Diversity Cap', () => {
  test('6. Third candidate in same category is excluded with CATEGORY_CAP', () => {
    const candidates = [
      makeCandidateBase({ id: 'c1', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.9, noveltyScore: 0.9 }),
      makeCandidateBase({ id: 'c2', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.8, noveltyScore: 0.8 }),
      makeCandidateBase({ id: 'c3', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.7, noveltyScore: 0.7 }),
    ];
    const { ranked, excluded } = rankCandidatesInline(candidates);
    assert.equal(ranked.length, 2, 'Only 2 MAINTENANCE candidates should be selected');
    const capExcluded = excluded.find((e) => e.id === 'c3');
    assert.ok(capExcluded, 'Third candidate should be excluded');
    assert.equal(capExcluded.exclusionReason, 'CATEGORY_CAP');
  });

  test('7. Second candidate in same category is allowed', () => {
    const candidates = [
      makeCandidateBase({ id: 'c1', storyCategory: 'MAINTENANCE' }),
      makeCandidateBase({ id: 'c2', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.6 }),
    ];
    const { ranked } = rankCandidatesInline(candidates);
    assert.equal(ranked.length, 2, 'Both MAINTENANCE candidates should be selected');
  });

  test('8. Two different categories — both allowed', () => {
    const candidates = [
      makeCandidateBase({ id: 'c1', storyCategory: 'MAINTENANCE' }),
      makeCandidateBase({ id: 'c2', storyCategory: 'INCIDENT', primaryDeepLink: '/dashboard/properties/123/incidents/abc' }),
    ];
    const { ranked } = rankCandidatesInline(candidates);
    assert.equal(ranked.length, 2, 'Both candidates from different categories should be selected');
  });
});

describe('Gazette Ranking — Priority Assignment', () => {
  test('9. Rank 1 → HERO', () => {
    assert.equal(determinePriorityByRank(1), 'HERO');
  });

  test('9b. Rank 3 → HIGH', () => {
    assert.equal(determinePriorityByRank(3), 'HIGH');
  });

  test('9c. Rank 6 → MEDIUM', () => {
    assert.equal(determinePriorityByRank(6), 'MEDIUM');
  });

  test('9d. Rank 9 → LOW', () => {
    assert.equal(determinePriorityByRank(9), 'LOW');
  });

  test('9e. Rank 4 → HIGH (boundary)', () => {
    assert.equal(determinePriorityByRank(4), 'HIGH');
  });

  test('9f. Rank 7 → MEDIUM (boundary)', () => {
    assert.equal(determinePriorityByRank(7), 'MEDIUM');
  });

  test('9g. Rank 8 → LOW (boundary)', () => {
    assert.equal(determinePriorityByRank(8), 'LOW');
  });
});

describe('Gazette Ranking — Sort Order', () => {
  test('10. Higher composite score gets lower rank number (rank 1 = best)', () => {
    const candidates = [
      makeCandidateBase({ id: 'low', urgencyScoreInput: 0.5, financialImpactEstimate: 0.4, noveltyScore: 0.5 }),
      makeCandidateBase({ id: 'high', urgencyScoreInput: 0.9, financialImpactEstimate: 0.9, noveltyScore: 0.9 }),
    ];
    const { ranked } = rankCandidatesInline(candidates);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].id, 'high', 'Higher score should be rank 1');
    assert.equal(ranked[0].finalRank, 1);
    assert.equal(ranked[1].id, 'low', 'Lower score should be rank 2');
    assert.equal(ranked[1].finalRank, 2);
  });
});

describe('Gazette Ranking — Weights Validation', () => {
  test('11. Weights: urgency(0.30) + financial(0.25) + confidence(0.20) + novelty(0.15) + engagement(0.10) === 1.0', () => {
    assert.equal(WEIGHTS.urgency, 0.30);
    assert.equal(WEIGHTS.financial, 0.25);
    assert.equal(WEIGHTS.confidence, 0.20);
    assert.equal(WEIGHTS.novelty, 0.15);
    assert.equal(WEIGHTS.engagement, 0.10);
    const sum = WEIGHTS.urgency + WEIGHTS.financial + WEIGHTS.confidence + WEIGHTS.novelty + WEIGHTS.engagement;
    assert.ok(Math.abs(sum - 1.0) < 1e-10);
  });
});

describe('Gazette Ranking — Expiry', () => {
  test('12. Expired candidate (expiresAt < now) is excluded with EXPIRED', () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago
    const candidate = makeCandidateBase({ expiresAt: pastDate });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'EXPIRED');
  });

  test('12b. Non-expired candidate (expiresAt in future) is not excluded for expiry', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days from now
    const candidate = makeCandidateBase({ expiresAt: futureDate });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.notEqual(reason, 'EXPIRED');
  });
});

describe('Gazette Ranking — Missing Supporting Facts', () => {
  test('Candidate with empty supportingFactsJson is excluded with MISSING_SUPPORTING_FACTS', () => {
    const candidate = makeCandidateBase({ supportingFactsJson: {} });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_SUPPORTING_FACTS');
  });

  test('Candidate with null supportingFactsJson is excluded with MISSING_SUPPORTING_FACTS', () => {
    const candidate = makeCandidateBase({ supportingFactsJson: null });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_SUPPORTING_FACTS');
  });
});

describe('Gazette Ranking — Deep Link Validation', () => {
  test('Deep link not starting with /dashboard/ is excluded with MISSING_DEEP_LINK', () => {
    const candidate = makeCandidateBase({ primaryDeepLink: '/properties/123' });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_DEEP_LINK');
  });

  test('Empty string deep link is excluded with MISSING_DEEP_LINK', () => {
    const candidate = makeCandidateBase({ primaryDeepLink: '' });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput,
      financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore,
      novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_DEEP_LINK');
  });
});
