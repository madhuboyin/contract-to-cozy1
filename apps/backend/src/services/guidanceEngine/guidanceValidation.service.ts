import { GuidanceExecutionReadiness } from './guidanceTypes';

export type GuidanceValidationIssue = {
  code: string;
  message: string;
  level: 'WARN' | 'ERROR';
};

export type GuidanceFreshnessAssessment = {
  observedAt: string | null;
  ageDays: number | null;
  isStale: boolean;
  maxAgeDays: number;
};

const TOOL_FRESHNESS_DAYS: Record<string, number> = {
  'service-price-radar': 30,
  'quote-comparison': 30,
  'price-finalization': 30,
  'coverage-intelligence': 180,
  'replace-repair': 180,
  'inspection-report': 365,
  recalls: 30,
  booking: 365,
  'do-nothing-simulator': 120,
  'home-savings': 120,
  'true-cost': 120,
};

const FAMILY_FRESHNESS_DAYS: Record<string, number> = {
  recall_detected: 30,
  freeze_risk: 14,
  coverage_gap: 180,
  coverage_lapse_detected: 180,
  lifecycle_end_or_past_life: 365,
  maintenance_failure_risk: 365,
  inspection_followup_needed: 365,
  financial_exposure: 180,
  cost_of_inaction_risk: 180,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

function inferObservedAt(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const candidates = [
    payload.observedAt,
    payload.generatedAt,
    payload.quoteDate,
    payload.reportDate,
    payload.policyExpiresAt,
    payload.expiresAt,
    payload.createdAt,
    payload.timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}

export class GuidanceValidationService {
  sanitizePriorityScore(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return 0;
    return clamp(Math.round(value), 0, 100);
  }

  sanitizeFinancialImpactScore(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return 0;
    return clamp(Math.round(value), 0, 100);
  }

  sanitizeCostOfDelay(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return 0;
    return Math.max(0, Math.round(value));
  }

  sanitizeConfidenceScore(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return 0.5;
    return clamp(Number(value.toFixed(2)), 0, 1);
  }

  assessSignalFreshness(input: {
    signalIntentFamily?: string | null;
    observedAt?: string | null;
    now?: Date;
  }): GuidanceFreshnessAssessment {
    const family = String(input.signalIntentFamily ?? '').toLowerCase();
    const maxAgeDays = FAMILY_FRESHNESS_DAYS[family] ?? 180;
    const observed = parseDate(input.observedAt ?? null);
    if (!observed) {
      return {
        observedAt: null,
        ageDays: null,
        isStale: false,
        maxAgeDays,
      };
    }

    const now = input.now ?? new Date();
    const ageDays = Math.floor((now.getTime() - observed.getTime()) / (24 * 60 * 60 * 1000));
    return {
      observedAt: observed.toISOString(),
      ageDays,
      isStale: ageDays > maxAgeDays,
      maxAgeDays,
    };
  }

  assessToolFreshness(input: {
    toolKey?: string | null;
    observedAt?: string | null;
    now?: Date;
  }): GuidanceFreshnessAssessment {
    const toolKey = String(input.toolKey ?? '').toLowerCase();
    const maxAgeDays = TOOL_FRESHNESS_DAYS[toolKey] ?? 180;
    const observed = parseDate(input.observedAt ?? null);
    if (!observed) {
      return {
        observedAt: null,
        ageDays: null,
        isStale: false,
        maxAgeDays,
      };
    }

    const now = input.now ?? new Date();
    const ageDays = Math.floor((now.getTime() - observed.getTime()) / (24 * 60 * 60 * 1000));
    return {
      observedAt: observed.toISOString(),
      ageDays,
      isStale: ageDays > maxAgeDays,
      maxAgeDays,
    };
  }

  inferObservedAtFromPayload(payload?: Record<string, unknown> | null) {
    return inferObservedAt(payload);
  }

  validateMathAndSafety(input: {
    priorityScore: number;
    financialImpactScore: number;
    costOfDelay: number;
    breakEvenMonths?: number | null;
    confidenceScore: number;
    executionReadiness: GuidanceExecutionReadiness;
    isSignalStale?: boolean;
    isDerivedStale?: boolean;
    hasMissingContext?: boolean;
  }) {
    const issues: GuidanceValidationIssue[] = [];
    let confidencePenalty = 0;
    let shouldSuppress = false;

    if (input.priorityScore < 0 || input.priorityScore > 100) {
      issues.push({
        code: 'PRIORITY_OUT_OF_RANGE',
        message: 'Priority score was outside expected range and was clamped.',
        level: 'WARN',
      });
      confidencePenalty += 0.08;
    }

    if (input.financialImpactScore < 0 || input.financialImpactScore > 100) {
      issues.push({
        code: 'FINANCIAL_SCORE_OUT_OF_RANGE',
        message: 'Financial impact score was outside expected range and was clamped.',
        level: 'WARN',
      });
      confidencePenalty += 0.08;
    }

    if (input.costOfDelay < 0) {
      issues.push({
        code: 'NEGATIVE_COST_OF_DELAY',
        message: 'Cost of delay cannot be negative; value was normalized.',
        level: 'WARN',
      });
      confidencePenalty += 0.06;
    }

    if (input.breakEvenMonths != null && input.breakEvenMonths < 0) {
      issues.push({
        code: 'NEGATIVE_BREAK_EVEN',
        message: 'Break-even months cannot be negative; recommendation confidence reduced.',
        level: 'WARN',
      });
      confidencePenalty += 0.12;
    }

    if (input.isSignalStale) {
      issues.push({
        code: 'STALE_SIGNAL',
        message: 'Signal data is stale; refresh source context before execution.',
        level: 'WARN',
      });
      confidencePenalty += 0.18;
    }

    if (input.isDerivedStale) {
      issues.push({
        code: 'STALE_DERIVED_DATA',
        message: 'Supporting tool data is stale; rerun the relevant validation step.',
        level: 'WARN',
      });
      confidencePenalty += 0.12;
    }

    if (
      input.executionReadiness === 'TRACKING_ONLY' &&
      input.priorityScore > 75
    ) {
      issues.push({
        code: 'TRACKING_PRIORITY_CONFLICT',
        message: 'Tracking-only action had high priority and was downgraded.',
        level: 'WARN',
      });
      confidencePenalty += 0.1;
    }

    if (input.hasMissingContext && input.executionReadiness === 'READY') {
      issues.push({
        code: 'READINESS_CONTEXT_CONFLICT',
        message: 'Readiness conflicted with missing context; execution confidence reduced.',
        level: 'WARN',
      });
      confidencePenalty += 0.12;
    }

    if (
      input.priorityScore <= 10 &&
      input.financialImpactScore <= 10 &&
      input.confidenceScore < 0.2 &&
      input.executionReadiness !== 'READY'
    ) {
      shouldSuppress = true;
      issues.push({
        code: 'VERY_WEAK_ACTION',
        message: 'Action suppressed due to very weak confidence and impact.',
        level: 'WARN',
      });
    }

    return {
      issues,
      confidencePenalty: clamp(Number(confidencePenalty.toFixed(2)), 0, 0.6),
      shouldSuppress,
      sanitized: {
        priorityScore: this.sanitizePriorityScore(input.priorityScore),
        financialImpactScore: this.sanitizeFinancialImpactScore(input.financialImpactScore),
        costOfDelay: this.sanitizeCostOfDelay(input.costOfDelay),
        confidenceScore: this.sanitizeConfidenceScore(input.confidenceScore),
        breakEvenMonths:
          input.breakEvenMonths == null ? null : Math.max(0, Math.round(input.breakEvenMonths)),
      },
    };
  }

  hasMeaningfulProducedData(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.values(record).some((entry) => {
      if (entry == null) return false;
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (typeof entry === 'number') return Number.isFinite(entry);
      if (typeof entry === 'boolean') return true;
      if (Array.isArray(entry)) return entry.length > 0;
      if (typeof entry === 'object') return Object.keys(entry as Record<string, unknown>).length > 0;
      return false;
    });
  }

  readNumeric(payload: Record<string, unknown>, key: string) {
    return asNumber(payload[key]);
  }
}

export const guidanceValidationService = new GuidanceValidationService();
