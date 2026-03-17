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

// ---------------------------------------------------------------------------
// Near-Duplicate Headline Detection (Step 6 guardrail)
// ---------------------------------------------------------------------------

const NEAR_DUPLICATE_THRESHOLD = 0.65;
const MIN_WORD_LENGTH = 3;

function headlineSimilarity(a, b) {
  const toWords = (s) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= MIN_WORD_LENGTH),
    );
  const wordsA = toWords(a);
  const wordsB = toWords(b);
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function filterNearDuplicateHeadlines(ranked) {
  const kept = [];
  const duplicates = [];
  for (const item of ranked) {
    const hint = (item.headlineHint ?? '').trim();
    if (!hint) { kept.push(item); continue; }
    let isDuplicate = false;
    for (const accepted of kept) {
      const acceptedHint = (accepted.headlineHint ?? '').trim();
      if (!acceptedHint) continue;
      const sim = headlineSimilarity(hint, acceptedHint);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        duplicates.push({ id: item.candidateId, similarTo: accepted.candidateId, similarity: sim });
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) kept.push(item);
  }
  return { kept, duplicates };
}

describe('Gazette Ranking — Near-Duplicate Headline Detection', () => {
  test('13. Identical headlines → second is a duplicate', () => {
    const ranked = [
      { candidateId: 'c1', headlineHint: 'Your HVAC system needs service this winter' },
      { candidateId: 'c2', headlineHint: 'Your HVAC system needs service this winter' },
    ];
    const { kept, duplicates } = filterNearDuplicateHeadlines(ranked);
    assert.equal(kept.length, 1);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].id, 'c2');
    assert.equal(kept[0].candidateId, 'c1', 'Best-ranked (first) should be kept');
  });

  test('14. Highly similar headlines (>= 0.65 Jaccard) → second excluded', () => {
    // c1: {roof, inspection, overdue, schedule, service} = 5 words
    // c2: {roof, inspection, overdue, schedule, service, now} = 6 words
    // intersection = 5, union = 6, similarity = 5/6 ≈ 0.833 → above 0.65
    const ranked = [
      { candidateId: 'c1', headlineHint: 'Roof inspection overdue schedule service' },
      { candidateId: 'c2', headlineHint: 'Roof inspection overdue schedule service now' },
    ];
    const { duplicates } = filterNearDuplicateHeadlines(ranked);
    assert.equal(duplicates.length, 1, 'Similar headlines should be flagged as near-duplicate');
  });

  test('15. Different headlines → both kept', () => {
    const ranked = [
      { candidateId: 'c1', headlineHint: 'HVAC maintenance needed this season' },
      { candidateId: 'c2', headlineHint: 'Insurance policy expiring next month review' },
    ];
    const { kept, duplicates } = filterNearDuplicateHeadlines(ranked);
    assert.equal(kept.length, 2);
    assert.equal(duplicates.length, 0);
  });

  test('16. Null headlineHints skip dedup — both kept', () => {
    const ranked = [
      { candidateId: 'c1', headlineHint: null },
      { candidateId: 'c2', headlineHint: null },
    ];
    const { kept, duplicates } = filterNearDuplicateHeadlines(ranked);
    assert.equal(kept.length, 2);
    assert.equal(duplicates.length, 0);
  });

  test('17. headlineSimilarity: identical strings → 1.0', () => {
    const sim = headlineSimilarity('your roof needs attention now', 'your roof needs attention now');
    assert.ok(Math.abs(sim - 1.0) < 0.001);
  });

  test('18. headlineSimilarity: completely different → near zero', () => {
    const sim = headlineSimilarity('roof inspection overdue service', 'insurance policy renewing coverage');
    assert.ok(sim < 0.2, `Expected low similarity, got ${sim}`);
  });

  test('19. headlineSimilarity: both empty → 1.0 (degenerate case)', () => {
    assert.equal(headlineSimilarity('', ''), 1);
  });

  test('20. headlineSimilarity: one empty → 0', () => {
    assert.equal(headlineSimilarity('some words here', ''), 0);
    assert.equal(headlineSimilarity('', 'some words here'), 0);
  });

  test('21. filterNearDuplicateHeadlines: first (highest rank) always wins', () => {
    // In a list of 3, if c1≈c2 and c2≈c3, c1 is kept, c2 filtered, then c3 vs c1 checked
    const ranked = [
      { candidateId: 'c1', headlineHint: 'Water heater end life cycle soon replacement needed' },
      { candidateId: 'c2', headlineHint: 'Water heater end life cycle replacement needed now' },
      { candidateId: 'c3', headlineHint: 'Completely different topic about insurance coverage' },
    ];
    const { kept } = filterNearDuplicateHeadlines(ranked);
    assert.ok(kept.some((k) => k.candidateId === 'c1'), 'c1 (rank 1) should always be kept');
  });

  test('22. Similarity threshold: below 0.65 → both kept', () => {
    // Construct headlines that share ~50% word overlap (below 0.65 threshold)
    const sim = headlineSimilarity(
      'roof inspection overdue schedule service',       // 5 words
      'roof water damage detected insurance claim',    // 5 words, only "roof" shared
    );
    assert.ok(sim < NEAR_DUPLICATE_THRESHOLD, `Similarity ${sim} should be below threshold`);
  });
});
