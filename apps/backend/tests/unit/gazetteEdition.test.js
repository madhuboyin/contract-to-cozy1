// tests/unit/gazetteEdition.test.js
// Tests for candidate exclusion rules, novelty keys, and edition lifecycle.
// Pure inline logic — no Prisma imports.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// ---------------------------------------------------------------------------
// Inline pure implementations
// ---------------------------------------------------------------------------

const MIN_NEWSWORTHY_SCORE = 0.40;
const MIN_CONFIDENCE = 0.25;
const MAX_PER_CATEGORY = 2;

const WEIGHTS = {
  urgency: 0.30,
  financial: 0.25,
  confidence: 0.20,
  novelty: 0.15,
  engagement: 0.10,
};

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

  if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() < now.getTime()) {
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

function computeNoveltyKey(sourceFeature, entityType, entityId) {
  return createHash('sha256').update(`${sourceFeature}:${entityType}:${entityId}`).digest('hex');
}

function validateCandidateDeepLink(primaryDeepLink) {
  if (!primaryDeepLink) return false;
  if (!primaryDeepLink.startsWith('/dashboard/')) return false;
  // Must have more than just /dashboard/ — needs object-specific path
  if (primaryDeepLink === '/dashboard/') return false;
  const parts = primaryDeepLink.split('/').filter(Boolean);
  return parts.length >= 3; // e.g. ['dashboard', 'properties', '<id>', ...]
}

/**
 * Simulate ranking with diversity cap.
 * Returns { ranked, excluded }
 */
function rankWithDiversity(candidates) {
  const scored = candidates.map((c) => ({
    ...c,
    compositeScore: calcCompositeScore({
      urgency: c.urgencyScoreInput ?? 0,
      financial: c.financialImpactEstimate ?? 0,
      confidence: c.confidenceScore ?? 0,
      novelty: c.noveltyScore ?? 0,
      engagement: c.engagementScore ?? 0,
    }),
  }));

  const withExclusion = scored.map((c) => ({
    ...c,
    exclusionReason: classifyExclusion(c),
  }));

  const eligible = withExclusion
    .filter((c) => !c.exclusionReason)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const categoryCounts = {};
  const ranked = [];
  const capExcluded = [];

  for (const item of eligible) {
    const cat = item.storyCategory;
    const count = categoryCounts[cat] ?? 0;
    if (count >= MAX_PER_CATEGORY) {
      capExcluded.push({ ...item, exclusionReason: 'CATEGORY_CAP' });
    } else {
      categoryCounts[cat] = count + 1;
      ranked.push(item);
    }
  }

  const allExcluded = withExclusion
    .filter((c) => c.exclusionReason)
    .concat(capExcluded);

  const rankedWithFinalRank = ranked.map((item, idx) => ({
    ...item,
    finalRank: idx + 1,
    included: true,
  }));
  const allExcludedFinal = allExcluded.map((item) => ({ ...item, included: false }));

  return {
    ranked: rankedWithFinalRank,
    excluded: allExcludedFinal,
  };
}

function makeCandidate(overrides = {}) {
  return {
    id: overrides.id || 'cand-default',
    storyCategory: overrides.storyCategory || 'MAINTENANCE',
    urgencyScoreInput: overrides.urgencyScoreInput ?? 0.8,
    financialImpactEstimate: overrides.financialImpactEstimate ?? 0.6,
    confidenceScore: overrides.confidenceScore ?? 0.9,
    noveltyScore: overrides.noveltyScore ?? 0.9,
    engagementScore: overrides.engagementScore ?? 0.7,
    primaryDeepLink: overrides.primaryDeepLink ?? '/dashboard/properties/prop-1/tools/maintenance',
    supportingFactsJson: overrides.supportingFactsJson ?? { title: 'Test' },
    expiresAt: overrides.expiresAt ?? null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Exclusion Rules
// ---------------------------------------------------------------------------

describe('Gazette Edition — Exclusion Rules', () => {
  test('1. Missing deepLink → exclusion reason is MISSING_DEEP_LINK', () => {
    const candidate = makeCandidate({ primaryDeepLink: null });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_DEEP_LINK');
  });

  test('2. Missing supporting facts → MISSING_SUPPORTING_FACTS', () => {
    const candidate = makeCandidate({ supportingFactsJson: {} });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'MISSING_SUPPORTING_FACTS');
  });

  test('3. Expired candidate (expiresAt < now) → EXCLUDED with EXPIRED', () => {
    const pastDate = new Date(Date.now() - 86400000); // 1 day ago
    const candidate = makeCandidate({ expiresAt: pastDate });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'EXPIRED');
  });

  test('4. Very low composite score → BELOW_NEWSWORTHY_THRESHOLD', () => {
    const candidate = makeCandidate({
      urgencyScoreInput: 0.1, financialImpactEstimate: 0.05,
      confidenceScore: 0.3, noveltyScore: 0.1, engagementScore: 0.1,
    });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'BELOW_NEWSWORTHY_THRESHOLD');
  });

  test('5. Low confidence → LOW_CONFIDENCE', () => {
    const candidate = makeCandidate({ confidenceScore: 0.1 });
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, 'LOW_CONFIDENCE');
  });

  test('6. Valid candidate passes all gates', () => {
    const candidate = makeCandidate();
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, null, 'Valid candidate should pass all gates');
  });
});

// ---------------------------------------------------------------------------
// Tests: Novelty Key
// ---------------------------------------------------------------------------

describe('Gazette Edition — Novelty Key', () => {
  test('7. noveltyKey is stable: same inputs → same hash', () => {
    const key1 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-123');
    const key2 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-123');
    assert.equal(key1, key2);
  });

  test('8. Different entity IDs → different novelty keys', () => {
    const key1 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-123');
    const key2 = computeNoveltyKey('MAINTENANCE', 'PropertyMaintenanceTask', 'task-456');
    assert.notEqual(key1, key2);
  });

  test('8b. Different source features → different novelty keys', () => {
    const key1 = computeNoveltyKey('MAINTENANCE', 'Task', 'entity-1');
    const key2 = computeNoveltyKey('INCIDENT', 'Task', 'entity-1');
    assert.notEqual(key1, key2);
  });

  test('8c. Different entity types → different novelty keys', () => {
    const key1 = computeNoveltyKey('SOURCE', 'TypeA', 'entity-1');
    const key2 = computeNoveltyKey('SOURCE', 'TypeB', 'entity-1');
    assert.notEqual(key1, key2);
  });

  test('Novelty key is a 64-char hex string', () => {
    const key = computeNoveltyKey('MAINTENANCE', 'Task', 'entity-1');
    assert.equal(key.length, 64);
    assert.match(key, /^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Deep Link Validation
// ---------------------------------------------------------------------------

describe('Gazette Edition — Deep Link Validation', () => {
  test('9. Deep link must start with /dashboard/ (validation rule)', () => {
    assert.equal(validateCandidateDeepLink('/dashboard/properties/123/maintenance'), true);
    assert.equal(validateCandidateDeepLink('/api/properties/123'), false);
    assert.equal(validateCandidateDeepLink('http://example.com/dashboard/'), false);
  });

  test('10. Deep link cannot be a generic dashboard URL — must have object-specific path', () => {
    // /dashboard/ alone fails
    assert.equal(validateCandidateDeepLink('/dashboard/'), false);
    // Full specific path passes
    assert.equal(validateCandidateDeepLink('/dashboard/properties/prop-1/tools/maintenance'), true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Bootstrap Mode
// ---------------------------------------------------------------------------

describe('Gazette Edition — Bootstrap Mode', () => {
  test('11. Bootstrap mode: edition count < 2 → isBootstrap = true', () => {
    const editionCount = 1;
    const isBootstrap = editionCount < 2;
    assert.equal(isBootstrap, true);
  });

  test('12. Bootstrap mode: edition count >= 2 → isBootstrap = false', () => {
    const editionCount = 2;
    const isBootstrap = editionCount < 2;
    assert.equal(isBootstrap, false);
  });

  test('12b. edition count 0 → isBootstrap = true', () => {
    const editionCount = 0;
    const isBootstrap = editionCount < 2;
    assert.equal(isBootstrap, true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Candidate Validation
// ---------------------------------------------------------------------------

describe('Gazette Edition — Candidate Validation', () => {
  test('13. Candidate with all required fields → valid', () => {
    const candidate = makeCandidate();
    const score = calcCompositeScore({
      urgency: candidate.urgencyScoreInput, financial: candidate.financialImpactEstimate,
      confidence: candidate.confidenceScore, novelty: candidate.noveltyScore,
      engagement: candidate.engagementScore,
    });
    assert.ok(score >= MIN_NEWSWORTHY_SCORE, 'Score should be above threshold');
    const reason = classifyExclusion({ ...candidate, compositeScore: score });
    assert.equal(reason, null, 'Valid candidate should have no exclusion reason');
  });
});

// ---------------------------------------------------------------------------
// Tests: Trace Coverage
// ---------------------------------------------------------------------------

describe('Gazette Edition — Selection Trace Coverage', () => {
  test('14. Both included and excluded candidates have traces', () => {
    const candidates = [
      makeCandidate({ id: 'c1' }),  // should pass
      makeCandidate({ id: 'c2', primaryDeepLink: null }),  // should be excluded
    ];

    const traces = candidates.map((c) => {
      const score = calcCompositeScore({
        urgency: c.urgencyScoreInput, financial: c.financialImpactEstimate,
        confidence: c.confidenceScore, novelty: c.noveltyScore,
        engagement: c.engagementScore,
      });
      const exclusionReason = classifyExclusion({ ...c, compositeScore: score });
      return {
        candidateId: c.id,
        included: exclusionReason === null,
        exclusionReason,
        compositeScore: score,
      };
    });

    assert.equal(traces.length, 2, 'Both candidates should have a trace');
    const includedTrace = traces.find((t) => t.candidateId === 'c1');
    const excludedTrace = traces.find((t) => t.candidateId === 'c2');
    assert.ok(includedTrace, 'c1 should have a trace');
    assert.ok(excludedTrace, 'c2 should have a trace');
    assert.equal(includedTrace.included, true);
    assert.equal(excludedTrace.included, false);
    assert.equal(excludedTrace.exclusionReason, 'MISSING_DEEP_LINK');
  });
});

// ---------------------------------------------------------------------------
// Tests: Category Diversity
// ---------------------------------------------------------------------------

describe('Gazette Edition — Category Diversity', () => {
  test('15. Category diversity: max 2 per category enforced', () => {
    const candidates = [
      makeCandidate({ id: 'c1', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.9 }),
      makeCandidate({ id: 'c2', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.8 }),
      makeCandidate({ id: 'c3', storyCategory: 'MAINTENANCE', urgencyScoreInput: 0.7 }),
      makeCandidate({ id: 'c4', storyCategory: 'INCIDENT', primaryDeepLink: '/dashboard/properties/p1/incidents/i1' }),
    ];

    const { ranked, excluded } = rankWithDiversity(candidates);

    const maintenanceRanked = ranked.filter((c) => c.storyCategory === 'MAINTENANCE');
    assert.equal(maintenanceRanked.length, 2, 'At most 2 MAINTENANCE candidates should be ranked');

    const c3Excluded = excluded.find((e) => e.id === 'c3');
    assert.ok(c3Excluded, 'Third MAINTENANCE candidate should be excluded');
    assert.equal(c3Excluded.exclusionReason, 'CATEGORY_CAP');

    const incidentRanked = ranked.find((c) => c.storyCategory === 'INCIDENT');
    assert.ok(incidentRanked, 'INCIDENT candidate should be ranked');
  });
});
