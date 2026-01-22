// apps/backend/src/services/roomHealthScore.service.ts

import type { RoomHealthBand, RoomHealthScoreDTO } from './roomInsights.service'; 

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function computeRoomHealthScore(input: {
  stats: {
    itemCount: number;
    docsLinkedCount: number;
    coverageGapsCount: number;
  };
  kitchen?: {
    missingAppliances?: string[] | null;
  };
  livingRoom?: {
    comfortScoreHint?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  };
}): RoomHealthScoreDTO {
  const itemCount = Number(input.stats.itemCount || 0);
  const docs = Number(input.stats.docsLinkedCount || 0);
  const gaps = Number(input.stats.coverageGapsCount || 0);

  const missingAppliancesCount = Number(input.kitchen?.missingAppliances?.length || 0);

  const hintRaw = input.livingRoom?.comfortScoreHint;
  const comfortScoreHint: RoomHealthScoreDTO['factors']['comfortScoreHint'] =
    hintRaw === 'LOW' || hintRaw === 'MEDIUM' || hintRaw === 'HIGH' ? hintRaw : 'UNKNOWN';

  // ---- Scoring: stable, explainable, and close to what your UI already implied ----
  // Base completeness score
  let score = 55;

  // Inventory completeness
  score += Math.min(20, itemCount * 2);   // up to +20
  score += Math.min(20, docs * 5);        // up to +20

  // Risk penalties
  score -= Math.min(30, gaps * 8);        // up to -30
  score -= Math.min(20, missingAppliancesCount * 6); // up to -20

  // Living room comfort hint
  if (comfortScoreHint === 'HIGH') score += 6;
  if (comfortScoreHint === 'MEDIUM') score += 2;
  if (comfortScoreHint === 'LOW') score -= 6;

  const finalScore = clamp(Math.round(score));

  const band: RoomHealthBand =
    finalScore >= 70 ? 'GOOD' : finalScore >= 50 ? 'NEEDS_ATTENTION' : 'AT_RISK';

  const label = band === 'GOOD' ? 'Good' : band === 'NEEDS_ATTENTION' ? 'Needs attention' : 'At risk';

  // ---- Badges + Improvements (this answers your UX: "how to improve?") ----
  const badges: string[] = [];
  const improvements: Array<{ title: string; detail?: string }> = [];

  if (gaps > 0) badges.push('Coverage gaps');
  if (docs === 0) badges.push('No documents');
  if (missingAppliancesCount > 0) badges.push('Missing appliances');
  if (itemCount === 0) badges.push('Empty room');

  if (itemCount === 0) {
    improvements.push({
      title: 'Add items to this room',
      detail: 'Add appliances/systems/valuables so the room reflects what you actually own.',
    });
  } else if (itemCount < 5) {
    improvements.push({
      title: 'Add a few more items',
      detail: 'More items improves completeness and makes gaps/recalls easier to detect.',
    });
  }

  if (docs === 0) {
    improvements.push({
      title: 'Attach at least one document',
      detail: 'Add a receipt/manual/warranty photo to improve claims readiness.',
    });
  }

  if (gaps > 0) {
    improvements.push({
      title: 'Fix coverage gaps',
      detail: 'Link warranty and/or insurance for uncovered items.',
    });
  }

  if (missingAppliancesCount > 0) {
    improvements.push({
      title: 'Add missing kitchen appliances',
      detail: `${missingAppliancesCount} key appliance${missingAppliancesCount === 1 ? '' : 's'} not found in inventory for this kitchen.`,
    });
  }

  if (comfortScoreHint === 'LOW') {
    improvements.push({
      title: 'Improve comfort readiness',
      detail: 'Track basics like seating/TV/lighting so this room reflects real setup.',
    });
  }

  return {
    score: finalScore,
    band,
    label,
    badges,
    improvements,
    factors: {
      itemCount,
      docsLinkedCount: docs,
      coverageGapsCount: gaps,
      missingAppliancesCount,
      comfortScoreHint,
    },
  };
}
