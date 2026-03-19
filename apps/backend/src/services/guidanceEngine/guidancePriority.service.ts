import { GuidanceExecutionReadiness, GuidanceIssueDomain, GuidanceSeverity } from './guidanceTypes';
import { GuidanceConfidence } from './guidanceConfidence.service';
import { GuidanceFinancialContext } from './guidanceFinancialContext.service';

export type GuidancePriorityResult = {
  priorityScore: number;
  priorityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityGroup: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION';
};

type PriorityInput = {
  issueDomain: GuidanceIssueDomain;
  severity?: GuidanceSeverity | null;
  severityScore?: number | null;
  signalIntentFamily?: string | null;
  executionReadiness: GuidanceExecutionReadiness;
  confidence: GuidanceConfidence;
  financial: GuidanceFinancialContext;
  signalPayload?: Record<string, unknown> | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function severityBase(severity: GuidanceSeverity | null | undefined) {
  if (severity === 'CRITICAL') return 100;
  if (severity === 'HIGH') return 82;
  if (severity === 'MEDIUM') return 58;
  if (severity === 'LOW') return 32;
  if (severity === 'INFO') return 16;
  return 22;
}

function signalUrgencyBoost(signalIntentFamily?: string | null) {
  const key = String(signalIntentFamily ?? '').toLowerCase();
  if (key.includes('recall') || key.includes('freeze') || key.includes('weather')) return 24;
  if (key.includes('inspection')) return 16;
  if (key.includes('coverage') || key.includes('lifecycle')) return 12;
  if (key.includes('financial') || key.includes('cost_of_inaction')) return 10;
  return 4;
}

function deadlineUrgencyBoost(payload: Record<string, unknown> | null | undefined) {
  const source = payload ?? {};
  const candidates = [
    source.deadlineAt,
    source.dueAt,
    source.expiresAt,
    source.policyExpiresAt,
  ];

  const now = Date.now();
  for (const candidate of candidates) {
    const deadline = toIsoDate(candidate);
    if (!deadline) continue;
    const days = Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000));
    if (days <= 0) return 24;
    if (days <= 7) return 18;
    if (days <= 30) return 10;
  }

  return 0;
}

export class GuidancePriorityService {
  score(input: PriorityInput): GuidancePriorityResult {
    const severity = input.severityScore != null
      ? clamp(input.severityScore, 0, 100)
      : severityBase(input.severity);

    const severityWeight = severity * 0.35;
    const urgencyWeight =
      signalUrgencyBoost(input.signalIntentFamily) + deadlineUrgencyBoost(input.signalPayload);
    const financialWeight = input.financial.financialImpactScore * 0.28;
    const safetyBoost =
      input.issueDomain === 'SAFETY' || input.issueDomain === 'WEATHER' ? 18 : 0;
    const confidenceWeight = input.confidence.confidenceScore * 12;

    let readinessWeight = 0;
    if (input.executionReadiness === 'READY') readinessWeight = 6;
    if (input.executionReadiness === 'NOT_READY') readinessWeight = -4;
    if (input.executionReadiness === 'TRACKING_ONLY') readinessWeight = -10;

    const priorityScore = clamp(
      Math.round(
        severityWeight +
          urgencyWeight +
          financialWeight +
          safetyBoost +
          confidenceWeight +
          readinessWeight
      ),
      0,
      100
    );

    let priorityBucket: GuidancePriorityResult['priorityBucket'] = 'MEDIUM';
    if (priorityScore >= 72) priorityBucket = 'HIGH';
    else if (priorityScore < 40) priorityBucket = 'LOW';

    const priorityGroup: GuidancePriorityResult['priorityGroup'] =
      priorityBucket === 'HIGH'
        ? 'IMMEDIATE'
        : priorityBucket === 'MEDIUM'
          ? 'UPCOMING'
          : 'OPTIMIZATION';

    return {
      priorityScore,
      priorityBucket,
      priorityGroup,
    };
  }
}

export const guidancePriorityService = new GuidancePriorityService();
