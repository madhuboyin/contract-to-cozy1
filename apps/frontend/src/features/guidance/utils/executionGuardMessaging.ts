import type { GuidanceExecutionGuardResult } from '@/lib/api/guidanceApi';

type GuardDetailsLike = Pick<
  GuidanceExecutionGuardResult,
  'blockedReason' | 'reasons' | 'missingPrerequisites' | 'safeNextStep'
>;

const GENERIC_BLOCK_MESSAGES = new Set([
  'Execution is blocked by incomplete guidance prerequisites.',
  'Execution is temporarily blocked because guidance context is incomplete.',
  'Complete required guidance steps before execution.',
]);

function dedupeLabels(result: GuardDetailsLike | null | undefined): string[] {
  if (!result?.missingPrerequisites?.length) return [];
  return Array.from(
    new Set(
      result.missingPrerequisites
        .map((item) => item.stepLabel?.trim())
        .filter((label): label is string => Boolean(label))
    )
  );
}

function firstUsefulReason(result: GuardDetailsLike | null | undefined): string | null {
  const candidates = [
    result?.blockedReason ?? null,
    ...(result?.reasons ?? []),
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (GENERIC_BLOCK_MESSAGES.has(trimmed)) continue;
    if (trimmed.startsWith('Complete prerequisite steps first:')) continue;
    return trimmed;
  }

  return null;
}

export function buildExecutionGuardMessage(
  result: GuardDetailsLike | null | undefined,
  actionLabel = 'booking'
): string {
  const labels = dedupeLabels(result);
  const usefulReason = firstUsefulReason(result);

  if (labels.length === 1) {
    return `Complete ${labels[0]} before ${actionLabel}.`;
  }

  if (labels.length > 1) {
    return `Complete the required steps before ${actionLabel}.`;
  }

  if (result?.safeNextStep?.stepLabel?.trim()) {
    return `Complete ${result.safeNextStep.stepLabel.trim()} before ${actionLabel}.`;
  }

  if (usefulReason) return usefulReason;

  return `Complete required guidance steps before ${actionLabel}.`;
}

export function buildExecutionGuardDetails(
  result: GuardDetailsLike | null | undefined
): string[] {
  const labels = dedupeLabels(result);
  const usefulReason = firstUsefulReason(result);

  if (labels.length > 0) return labels;
  if (usefulReason) return [usefulReason];
  return [];
}
