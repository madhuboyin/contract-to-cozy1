export type GuidanceConfidence = {
  confidenceScore: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const RELIABLE_SOURCE_TOOLS = new Set([
  'coverage-intelligence',
  'replace-repair',
  'service-price-radar',
  'inspection-report',
  'recalls',
  'true-cost',
  'do-nothing-simulator',
  'home-savings',
]);

export class GuidanceConfidenceService {
  evaluate(input: { journey: any; signal?: any | null; next?: any | null }): GuidanceConfidence {
    const signalConfidence = asNumber(input.signal?.confidenceScore);
    let score = signalConfidence != null ? clamp(signalConfidence, 0, 1) : 0.58;

    const missingKeys = [
      ...(Array.isArray(input.journey?.missingContextKeys) ? input.journey.missingContextKeys : []),
      ...(Array.isArray(input.next?.nextStep?.missingContextKeys)
        ? input.next.nextStep.missingContextKeys
        : []),
    ];

    score -= Math.min(0.35, missingKeys.length * 0.08);

    const derivedLatest = asRecord(asRecord(input.journey?.derivedSnapshotJson).latest);
    const derivedKeyCount = Object.keys(derivedLatest).length;
    if (derivedKeyCount >= 4) score += 0.08;
    if (derivedKeyCount === 0) score -= 0.06;

    const sourceToolKey = String(input.signal?.sourceToolKey ?? '').toLowerCase();
    if (RELIABLE_SOURCE_TOOLS.has(sourceToolKey)) {
      score += 0.06;
    }

    const readiness = String(input.journey?.executionReadiness ?? '');
    if (readiness === 'READY') score += 0.04;
    if (readiness === 'NOT_READY' && missingKeys.length > 0) score -= 0.04;

    score = clamp(score, 0, 1);

    let confidenceLabel: GuidanceConfidence['confidenceLabel'] = 'MEDIUM';
    if (score >= 0.72) confidenceLabel = 'HIGH';
    else if (score < 0.45) confidenceLabel = 'LOW';

    return {
      confidenceScore: Number(score.toFixed(2)),
      confidenceLabel,
    };
  }
}

export const guidanceConfidenceService = new GuidanceConfidenceService();
