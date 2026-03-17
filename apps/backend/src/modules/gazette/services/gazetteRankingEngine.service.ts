// apps/backend/src/modules/gazette/services/gazetteRankingEngine.service.ts
// Scores and ranks gazette story candidates. Pure ranking logic with DB writes for traces.

import { GazetteStoryCandidate, GazetteSelectionTrace } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  urgency: 0.30,
  financial: 0.25,
  confidence: 0.20,
  novelty: 0.15,
  engagement: 0.10,
} as const;

export const MIN_NEWSWORTHY_SCORE = 0.40;
export const MAX_PER_CATEGORY = 2;
export const MIN_CONFIDENCE = 0.25;

/** Jaccard word-overlap threshold above which two headlines are considered near-duplicates. */
export const NEAR_DUPLICATE_THRESHOLD = 0.65;

/** Minimum word length to include in similarity comparison (filters out stop words like "is", "at"). */
const MIN_WORD_LENGTH = 3;

// ---------------------------------------------------------------------------
// Pure scoring helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Calculate the composite score for a candidate given its scoring dimensions.
 * All inputs are expected in 0-1 range.
 */
export function calcCompositeScore(params: {
  urgency: number;
  financial: number;
  confidence: number;
  novelty: number;
  engagement: number;
}): number {
  return (
    WEIGHTS.urgency * params.urgency +
    WEIGHTS.financial * params.financial +
    WEIGHTS.confidence * params.confidence +
    WEIGHTS.novelty * params.novelty +
    WEIGHTS.engagement * params.engagement
  );
}

/**
 * Determine if a candidate should be excluded and why.
 * Returns the exclusion reason string or null if the candidate passes.
 */
export function classifyExclusion(
  candidate: {
    primaryDeepLink?: string | null;
    supportingFactsJson?: unknown;
    compositeScore?: number | null;
    confidenceScore?: number | null;
    expiresAt?: Date | null;
  },
  now: Date = new Date(),
): string | null {
  // Hard gate: missing deep link
  if (!candidate.primaryDeepLink || !candidate.primaryDeepLink.startsWith('/dashboard/')) {
    return 'MISSING_DEEP_LINK';
  }

  // Hard gate: missing supporting facts
  const facts = candidate.supportingFactsJson;
  if (!facts || (typeof facts === 'object' && Object.keys(facts as object).length === 0)) {
    return 'MISSING_SUPPORTING_FACTS';
  }

  // Hard gate: expired candidate
  if (candidate.expiresAt && candidate.expiresAt < now) {
    return 'EXPIRED';
  }

  // Soft gate: below newsworthy threshold
  if ((candidate.compositeScore ?? 0) < MIN_NEWSWORTHY_SCORE) {
    return 'BELOW_NEWSWORTHY_THRESHOLD';
  }

  // Soft gate: low confidence
  if ((candidate.confidenceScore ?? 0) < MIN_CONFIDENCE) {
    return 'LOW_CONFIDENCE';
  }

  return null;
}

/**
 * Compute Jaccard word-overlap similarity between two headline strings.
 * Words shorter than MIN_WORD_LENGTH are ignored (reduces noise from stop words).
 * Returns a value in [0, 1] where 1 = identical word sets.
 */
export function headlineSimilarity(a: string, b: string): number {
  const toWords = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length >= MIN_WORD_LENGTH),
    );

  const wordsA = toWords(a);
  const wordsB = toWords(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Filter near-duplicate headlines from a ranked list.
 * Walks in rank order (best score first); any later candidate whose headline
 * exceeds NEAR_DUPLICATE_THRESHOLD similarity against an already-kept candidate
 * is tagged as a duplicate. Only candidates with non-empty headlineHints are compared.
 *
 * Returns:
 *   kept — candidates to keep (in original order)
 *   duplicates — { id, similarTo, similarity } for each removed candidate
 */
export function filterNearDuplicateHeadlines(
  ranked: Array<{
    candidateId: string;
    headlineHint: string | null | undefined;
  }>,
): {
  kept: typeof ranked;
  duplicates: Array<{ id: string; similarTo: string; similarity: number }>;
} {
  const kept: typeof ranked = [];
  const duplicates: Array<{ id: string; similarTo: string; similarity: number }> = [];

  for (const item of ranked) {
    const hint = (item.headlineHint ?? '').trim();

    // Skip dedup for candidates without hints — they'll get distinct AI copy
    if (!hint) {
      kept.push(item);
      continue;
    }

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

    if (!isDuplicate) {
      kept.push(item);
    }
  }

  return { kept, duplicates };
}

/**
 * Determine priority label based on rank.
 */
export function determinePriorityByRank(
  rank: number,
): 'HERO' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (rank === 1) return 'HERO';
  if (rank <= 4) return 'HIGH';
  if (rank <= 7) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Ranking engine service
// ---------------------------------------------------------------------------

export class GazetteRankingEngineService {
  /**
   * Score, filter, and rank candidates. Writes traces and updates candidate status in DB.
   */
  static async rankCandidates(
    editionId: string,
    propertyId: string,
    candidates: GazetteStoryCandidate[],
  ): Promise<{ ranked: GazetteStoryCandidate[]; traces: GazetteSelectionTrace[] }> {
    const now = new Date();

    // Step 1: Compute composite scores and pre-scores
    const scored = candidates.map((candidate) => {
      const urgency = candidate.urgencyScoreInput ?? 0;
      const financial = candidate.financialImpactEstimate ?? 0;
      const confidence = candidate.confidenceScore ?? 0;
      const novelty = candidate.noveltyScore ?? 0;
      const engagement = candidate.engagementScore ?? 0;

      const compositeScore = calcCompositeScore({
        urgency,
        financial,
        confidence,
        novelty,
        engagement,
      });

      return { candidate, compositeScore };
    });

    // Step 2: Apply exclusion gates (before diversity cap)
    const withExclusion = scored.map(({ candidate, compositeScore }) => {
      // Temporarily set compositeScore for classifyExclusion
      const candidateWithScore = { ...candidate, compositeScore };
      const exclusionReason = classifyExclusion(candidateWithScore, now);
      return { candidate, compositeScore, exclusionReason };
    });

    // Step 3: Near-duplicate headline filter (applied before diversity cap)
    const eligible = withExclusion
      .filter((c) => !c.exclusionReason)
      .sort((a, b) => b.compositeScore - a.compositeScore);

    const { duplicates: dupeResults } = filterNearDuplicateHeadlines(
      eligible.map((e) => ({
        candidateId: e.candidate.id,
        headlineHint: (e.candidate as any).headlineHint ?? null,
      })),
    );
    const dupeIds = new Set(dupeResults.map((d) => d.id));

    if (dupeResults.length > 0) {
      console.log(
        `[GazetteRanking] Filtered ${dupeResults.length} near-duplicate headline(s) for edition ${editionId}`,
      );
    }

    // Step 4: Apply diversity cap (sorted by compositeScore descending)
    const categoryCounts = new Map<string, number>();
    const finalResults = withExclusion.map((item) => {
      if (item.exclusionReason) {
        return { ...item, included: false, diversityExcluded: false };
      }

      // Exclude near-duplicates
      if (dupeIds.has(item.candidate.id)) {
        return { ...item, exclusionReason: 'DUPLICATE', included: false, diversityExcluded: false };
      }

      const category = item.candidate.storyCategory as string;
      const count = categoryCounts.get(category) ?? 0;

      if (count >= MAX_PER_CATEGORY) {
        return {
          ...item,
          exclusionReason: 'CATEGORY_CAP',
          included: false,
          diversityExcluded: true,
        };
      }

      categoryCounts.set(category, count + 1);
      return { ...item, included: true, diversityExcluded: false };
    });

    // Sort eligible items to assign ranks
    const includedItems = finalResults
      .filter((i) => i.included)
      .sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign final ranks
    const rankMap = new Map<string, number>();
    includedItems.forEach((item, index) => {
      rankMap.set(item.candidate.id, index + 1);
    });

    // Step 4: Persist traces
    const traceData = finalResults.map((item) => {
      const finalRank = rankMap.get(item.candidate.id) ?? null;
      return {
        editionId,
        candidateId: item.candidate.id,
        propertyId,
        preScore: item.compositeScore,
        postScore: item.included ? item.compositeScore : null,
        finalRank,
        included: item.included,
        exclusionReason: (item.exclusionReason ?? null) as any,
        rankAdjustmentReason: null,
        rankExplanation: item.included
          ? `Ranked ${finalRank} out of ${includedItems.length} selected stories with composite score ${item.compositeScore.toFixed(3)}`
          : `Excluded: ${item.exclusionReason}`,
        traceJson: {
          urgencyScoreInput: item.candidate.urgencyScoreInput,
          financialImpactEstimate: item.candidate.financialImpactEstimate,
          confidenceScore: item.candidate.confidenceScore,
          noveltyScore: item.candidate.noveltyScore,
          engagementScore: item.candidate.engagementScore,
          compositeScore: item.compositeScore,
          weights: WEIGHTS,
        },
      };
    });

    let traces: GazetteSelectionTrace[] = [];
    if (traceData.length > 0) {
      await prisma.gazetteSelectionTrace.createMany({ data: traceData as any[] });

      traces = await prisma.gazetteSelectionTrace.findMany({
        where: { editionId },
        orderBy: { createdAt: 'desc' },
        take: traceData.length,
      });
    }

    // Step 5: Update candidate status in DB
    const updatePromises: Promise<GazetteStoryCandidate>[] = [];

    for (const item of finalResults) {
      if (item.included) {
        const rank = rankMap.get(item.candidate.id)!;
        updatePromises.push(
          prisma.gazetteStoryCandidate.update({
            where: { id: item.candidate.id },
            data: {
              status: 'SELECTED' as any,
              selectionRank: rank,
              compositeScore: item.compositeScore,
              editionId,
            },
          }),
        );
      } else {
        updatePromises.push(
          prisma.gazetteStoryCandidate.update({
            where: { id: item.candidate.id },
            data: {
              status: 'EXCLUDED' as any,
              exclusionReason: (item.exclusionReason ?? null) as any,
              compositeScore: item.compositeScore,
            },
          }),
        );
      }
    }

    await Promise.allSettled(updatePromises);

    // Return ranked candidates in order
    const ranked = includedItems.map((item) => item.candidate);

    return { ranked, traces };
  }

  /**
   * Count candidates that pass the hard quality gates.
   */
  static countQualified(candidates: GazetteStoryCandidate[]): number {
    const now = new Date();
    return candidates.filter((candidate) => {
      const urgency = candidate.urgencyScoreInput ?? 0;
      const financial = candidate.financialImpactEstimate ?? 0;
      const confidence = candidate.confidenceScore ?? 0;
      const novelty = candidate.noveltyScore ?? 0;
      const engagement = candidate.engagementScore ?? 0;

      const compositeScore = calcCompositeScore({
        urgency,
        financial,
        confidence,
        novelty,
        engagement,
      });

      const candidateWithScore = { ...candidate, compositeScore };
      const exclusionReason = classifyExclusion(candidateWithScore, now);
      return exclusionReason === null;
    }).length;
  }
}
