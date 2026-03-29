export type SignalPriorityClampInput = {
  baseScore: number;
  additiveBoost: number;
  maxMultiplier?: number;
};

export type SignalPriorityClampResult = {
  score: number;
  appliedBoost: number;
  wasClamped: boolean;
  maxAllowedScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Caps additive signal compounding to a bounded multiplier of the base score.
 * Default cap: total score cannot exceed 1.5x of base score.
 */
export function applyBoundedSignalPriorityBoost(
  input: SignalPriorityClampInput,
): SignalPriorityClampResult {
  const baseScore = Number.isFinite(input.baseScore) ? input.baseScore : 0;
  const additiveBoost = Number.isFinite(input.additiveBoost) ? input.additiveBoost : 0;
  const maxMultiplier = Number.isFinite(input.maxMultiplier ?? 1.5)
    ? Math.max(1, input.maxMultiplier ?? 1.5)
    : 1.5;

  const rawScore = Math.max(0, baseScore + additiveBoost);
  const maxAllowedScore = baseScore > 0 ? baseScore * maxMultiplier : maxMultiplier;
  const score = clamp(rawScore, 0, maxAllowedScore);

  return {
    score,
    appliedBoost: Math.max(0, score - baseScore),
    wasClamped: rawScore > maxAllowedScore,
    maxAllowedScore,
  };
}

