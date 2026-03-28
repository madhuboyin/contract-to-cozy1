import { HomeSavingsOpportunityStatus, MaintenanceTaskStatus, Prisma, Signal } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { detectCoverageGaps } from './coverageGap.service';

export type SharedSignalKey =
  | 'MAINT_ADHERENCE'
  | 'COVERAGE_GAP'
  | 'SAVINGS_REALIZATION'
  | 'RISK_SPIKE'
  | 'COST_ANOMALY'
  | 'RISK_ACCUMULATION'
  | 'SYSTEM_DEGRADATION'
  | 'COST_PRESSURE_PATTERN'
  | 'FINANCIAL_DISCIPLINE';

export const SHARED_SIGNAL_KEYS: SharedSignalKey[] = [
  'MAINT_ADHERENCE',
  'COVERAGE_GAP',
  'SAVINGS_REALIZATION',
  'RISK_SPIKE',
  'COST_ANOMALY',
  'RISK_ACCUMULATION',
  'SYSTEM_DEGRADATION',
  'COST_PRESSURE_PATTERN',
  'FINANCIAL_DISCIPLINE',
];

const SIGNAL_OWNER_BY_KEY: Record<SharedSignalKey, string> = {
  MAINT_ADHERENCE: 'MaintenanceOrchestrationService',
  COVERAGE_GAP: 'CoverageAnalysisService',
  SAVINGS_REALIZATION: 'HomeSavingsService',
  RISK_SPIKE: 'HomeEventRadarService',
  COST_ANOMALY: 'HomeEventRadarService',
  RISK_ACCUMULATION: 'MaintenanceOrchestrationService',
  SYSTEM_DEGRADATION: 'MaintenanceOrchestrationService',
  COST_PRESSURE_PATTERN: 'HomeEventRadarService',
  FINANCIAL_DISCIPLINE: 'HomeSavingsService',
};

const COST_PRESSURE_EVENT_TYPES = [
  'insurance_market',
  'utility_rate_change',
  'tax_reassessment',
  'tax_rate_change',
] as const;

const MAINTENANCE_PATTERN_SIGNAL_KEYS: SharedSignalKey[] = ['RISK_ACCUMULATION', 'SYSTEM_DEGRADATION'];
const FINANCIAL_PATTERN_SIGNAL_KEYS: SharedSignalKey[] = ['FINANCIAL_DISCIPLINE'];
const RADAR_PATTERN_SIGNAL_KEYS: SharedSignalKey[] = ['COST_PRESSURE_PATTERN'];

const LOW_CONFIDENCE_THRESHOLD = 0.55;

type CashBufferPosture = 'TIGHT' | 'MODERATE' | 'STRONG';

export type SignalFreshnessState = 'FRESH' | 'DECAYING' | 'STALE';

export type SignalConfidenceBreakdown = {
  sourceQuality: number;
  recencyQuality: number;
  completenessQuality: number;
  agreementQuality: number;
  verificationQuality: number;
  score: number;
};

export type SignalExplainabilityMeta = {
  generatedAt: string;
  freshnessState: SignalFreshnessState;
  why: string[];
  evidenceCount?: number;
  patternKey?: string | null;
  confidenceBreakdown?: SignalConfidenceBreakdown | null;
};

export type SignalDTO = {
  id: string;
  propertyId: string;
  roomId: string | null;
  homeItemId: string | null;
  signalKey: string;
  valueNumber: number | null;
  valueText: string | null;
  valueJson: Prisma.JsonValue | null;
  unit: string | null;
  confidence: number | null;
  sourceModel: string;
  sourceId: string;
  capturedAt: string;
  validUntil: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  freshnessState?: SignalFreshnessState;
  isStale?: boolean;
  explainability?: SignalExplainabilityMeta | null;
};

export type PublishSignalInput = {
  propertyId: string;
  signalKey: SharedSignalKey;
  sourceModel: string;
  sourceId: string;
  roomId?: string | null;
  homeItemId?: string | null;
  valueNumber?: number | null;
  valueText?: string | null;
  valueJson?: Record<string, unknown> | null;
  unit?: string | null;
  confidence?: number | null;
  capturedAt?: Date;
  validUntil?: Date | null;
  confidenceBreakdown?: Omit<SignalConfidenceBreakdown, 'score'> | SignalConfidenceBreakdown | null;
  reasons?: string[];
  evidenceCount?: number;
  patternKey?: string | null;
};

export type SignalListFilters = {
  signalKey?: string;
  roomId?: string;
  homeItemId?: string;
  freshOnly?: boolean;
  limit?: number;
  capturedFrom?: Date;
  capturedTo?: Date;
};

export type LatestSharedSignals = Partial<Record<SharedSignalKey, SignalDTO>>;

export type SignalInteractionInsight = {
  code: string;
  title: string;
  strength: number;
  reasons: string[];
  drivers: SharedSignalKey[];
};

export type SignalInteractionContext = {
  signals: LatestSharedSignals;
  interactions: SignalInteractionInsight[];
  staleSignals: SharedSignalKey[];
};

export type PropertySignalHealthSummary = {
  propertyId: string;
  lookbackDays: number;
  totalSignals: number;
  staleSignalCount: number;
  lowConfidenceSignalCount: number;
  interactionSignalCount: number;
  freshness: {
    fresh: number;
    decaying: number;
    stale: number;
  };
  byKey: Record<string, number>;
};

export type SignalHealthOverview = {
  generatedAt: string;
  propertiesEvaluated: number;
  totals: {
    totalSignals: number;
    staleSignals: number;
    lowConfidenceSignals: number;
    interactionSignals: number;
  };
  properties: PropertySignalHealthSummary[];
};

export type SignalRefreshSummary = {
  propertyId: string;
  refreshedSignals: SharedSignalKey[];
  skippedSignals: SharedSignalKey[];
  interactionCount: number;
};

function clamp01(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asFinite(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function daysSince(reference: Date, now: Date): number {
  const ms = now.getTime() - reference.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

function recencyScore(days: number, freshDays: number, decayingDays: number): number {
  if (days <= freshDays) return 1;
  if (days <= decayingDays) {
    const span = Math.max(1, decayingDays - freshDays);
    return clamp01(1 - ((days - freshDays) / span) * 0.45);
  }
  return 0.45;
}

function mapRadarSeverityToSignalScore(severity: string): number {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'critical') return 0.95;
  if (normalized === 'high') return 0.82;
  if (normalized === 'medium') return 0.62;
  if (normalized === 'low') return 0.4;
  return 0.25;
}

function mapRadarImpactToSignalScore(impactLevel: string | null | undefined): number {
  const normalized = String(impactLevel || '').toLowerCase();
  if (normalized === 'high') return 0.9;
  if (normalized === 'moderate') return 0.7;
  if (normalized === 'watch') return 0.5;
  return 0.25;
}

function isCostPressureEvent(eventType: string): boolean {
  return COST_PRESSURE_EVENT_TYPES.includes(String(eventType || '').toLowerCase() as any);
}

export function evaluateSignalFreshness(
  signal: { capturedAt: string | Date; validUntil: string | Date | null },
  now = new Date()
): { state: SignalFreshnessState; isStale: boolean } {
  const capturedAt = signal.capturedAt instanceof Date ? signal.capturedAt : new Date(signal.capturedAt);
  const validUntil =
    signal.validUntil instanceof Date
      ? signal.validUntil
      : signal.validUntil
        ? new Date(signal.validUntil)
        : null;

  if (validUntil && validUntil.getTime() <= now.getTime()) {
    return { state: 'STALE', isStale: true };
  }

  if (!validUntil) {
    const ageDays = daysSince(capturedAt, now);
    if (ageDays > 60) return { state: 'DECAYING', isStale: false };
    return { state: 'FRESH', isStale: false };
  }

  const lifetimeMs = Math.max(1, validUntil.getTime() - capturedAt.getTime());
  const remainingMs = validUntil.getTime() - now.getTime();
  const remainingRatio = remainingMs / lifetimeMs;

  if (remainingRatio <= 0.35) {
    return { state: 'DECAYING', isStale: false };
  }

  return { state: 'FRESH', isStale: false };
}

function normalizeConfidenceBreakdown(
  input: Omit<SignalConfidenceBreakdown, 'score'> | SignalConfidenceBreakdown | null | undefined,
  fallbackScore: number | null
): SignalConfidenceBreakdown | null {
  if (!input && fallbackScore === null) return null;

  const sourceQuality = clamp01((input as SignalConfidenceBreakdown | undefined)?.sourceQuality ?? fallbackScore ?? 0.65);
  const recencyQuality = clamp01((input as SignalConfidenceBreakdown | undefined)?.recencyQuality ?? fallbackScore ?? 0.65);
  const completenessQuality = clamp01(
    (input as SignalConfidenceBreakdown | undefined)?.completenessQuality ?? fallbackScore ?? 0.65
  );
  const agreementQuality = clamp01((input as SignalConfidenceBreakdown | undefined)?.agreementQuality ?? fallbackScore ?? 0.65);
  const verificationQuality = clamp01(
    (input as SignalConfidenceBreakdown | undefined)?.verificationQuality ?? fallbackScore ?? 0.65
  );

  const weighted =
    sourceQuality * 0.3 +
    recencyQuality * 0.2 +
    completenessQuality * 0.25 +
    agreementQuality * 0.15 +
    verificationQuality * 0.1;

  const score = clamp01((input as SignalConfidenceBreakdown | undefined)?.score ?? weighted);

  return {
    sourceQuality,
    recencyQuality,
    completenessQuality,
    agreementQuality,
    verificationQuality,
    score,
  };
}

function extractExplainabilityFromValueJson(valueJson: Prisma.JsonValue | null): SignalExplainabilityMeta | null {
  const root = toRecord(valueJson);
  if (!root) return null;
  const rawMeta = toRecord(root._signalMeta as Prisma.JsonValue);
  if (!rawMeta) return null;

  const stateRaw = String(rawMeta.freshnessState || '').toUpperCase();
  const freshnessState: SignalFreshnessState =
    stateRaw === 'STALE' ? 'STALE' : stateRaw === 'DECAYING' ? 'DECAYING' : 'FRESH';

  const reasons = Array.isArray(rawMeta.why)
    ? rawMeta.why.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0)
    : [];

  const rawBreakdown = toRecord(rawMeta.confidenceBreakdown as Prisma.JsonValue);
  const confidenceBreakdown = rawBreakdown
    ? {
        sourceQuality: clamp01(asFinite(rawBreakdown.sourceQuality)),
        recencyQuality: clamp01(asFinite(rawBreakdown.recencyQuality)),
        completenessQuality: clamp01(asFinite(rawBreakdown.completenessQuality)),
        agreementQuality: clamp01(asFinite(rawBreakdown.agreementQuality)),
        verificationQuality: clamp01(asFinite(rawBreakdown.verificationQuality)),
        score: clamp01(asFinite(rawBreakdown.score)),
      }
    : null;

  const evidenceCount = asFinite(rawMeta.evidenceCount);
  const patternKey = rawMeta.patternKey === null || rawMeta.patternKey === undefined
    ? null
    : String(rawMeta.patternKey);

  return {
    generatedAt: String(rawMeta.generatedAt || new Date().toISOString()),
    freshnessState,
    why: reasons,
    confidenceBreakdown,
    evidenceCount: evidenceCount === null ? undefined : Math.max(0, Math.round(evidenceCount)),
    patternKey,
  };
}

function buildValueJsonWithMeta(input: {
  base: Record<string, unknown> | null | undefined;
  freshnessState: SignalFreshnessState;
  reasons?: string[];
  confidenceBreakdown?: SignalConfidenceBreakdown | null;
  evidenceCount?: number;
  patternKey?: string | null;
}): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  const base = input.base ?? null;
  const hasBase = Boolean(base && Object.keys(base).length > 0);
  const reasons = (input.reasons ?? []).map((entry) => entry.trim()).filter(Boolean);
  const hasMeta =
    reasons.length > 0 ||
    input.confidenceBreakdown !== null ||
    input.evidenceCount !== undefined ||
    input.patternKey !== undefined;

  if (!hasBase && !hasMeta) {
    return Prisma.JsonNull;
  }

  const next: Record<string, unknown> = {
    ...(base ?? {}),
  };

  if (hasMeta) {
    next._signalMeta = {
      generatedAt: new Date().toISOString(),
      freshnessState: input.freshnessState,
      why: reasons,
      evidenceCount: input.evidenceCount ?? null,
      patternKey: input.patternKey ?? null,
      confidenceBreakdown: input.confidenceBreakdown ?? null,
    };
  }

  return next as Prisma.InputJsonValue;
}

function mapSignal(signal: Signal): SignalDTO {
  const freshness = evaluateSignalFreshness(signal);
  const explainability = extractExplainabilityFromValueJson(signal.valueJson);

  return {
    id: signal.id,
    propertyId: signal.propertyId,
    roomId: signal.roomId,
    homeItemId: signal.homeItemId,
    signalKey: signal.signalKey,
    valueNumber: signal.valueNumber,
    valueText: signal.valueText,
    valueJson: signal.valueJson,
    unit: signal.unit,
    confidence: signal.confidence,
    sourceModel: signal.sourceModel,
    sourceId: signal.sourceId,
    capturedAt: signal.capturedAt.toISOString(),
    validUntil: signal.validUntil ? signal.validUntil.toISOString() : null,
    version: signal.version,
    createdAt: signal.createdAt.toISOString(),
    updatedAt: signal.updatedAt.toISOString(),
    freshnessState: freshness.state,
    isStale: freshness.isStale,
    explainability,
  };
}

function extractSignalNumber(signal: SignalDTO | null | undefined, key: string): number | null {
  if (!signal) return null;
  if (signal.valueJson && typeof signal.valueJson === 'object' && !Array.isArray(signal.valueJson)) {
    const numeric = asFinite((signal.valueJson as Record<string, unknown>)[key]);
    if (numeric !== null) return numeric;
  }
  return asFinite(signal.valueNumber);
}

function severityFromStrength(value: number, mediumThreshold = 0.55, highThreshold = 0.8): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (value >= highThreshold) return 'HIGH';
  if (value >= mediumThreshold) return 'MEDIUM';
  return 'LOW';
}

function interactionStrength(...components: Array<number | null | undefined>): number {
  const normalized = components
    .map((entry) => asFinite(entry))
    .filter((entry): entry is number => entry !== null)
    .map((entry) => clamp01(entry));
  if (normalized.length === 0) return 0;
  return clamp01(normalized.reduce((sum, entry) => sum + entry, 0) / normalized.length);
}

function deriveCashBufferPosture(input: { cashBufferPosture?: CashBufferPosture | null; cashBufferAmount?: number | null }): CashBufferPosture | null {
  if (input.cashBufferPosture) return input.cashBufferPosture;
  if (input.cashBufferAmount === null || input.cashBufferAmount === undefined || !Number.isFinite(input.cashBufferAmount)) {
    return null;
  }
  if (input.cashBufferAmount < 3000) return 'TIGHT';
  if (input.cashBufferAmount < 12000) return 'MODERATE';
  return 'STRONG';
}

export function computeMaintenanceAdherenceScore(input: {
  totalTasks: number;
  completedTasks: number;
  activeSnoozes: number;
  recentCompletions: number;
  overdueTasks: number;
}): number {
  const totalTasks = Math.max(0, input.totalTasks);
  const completedTasks = Math.max(0, input.completedTasks);
  const activeSnoozes = Math.max(0, input.activeSnoozes);
  const recentCompletions = Math.max(0, input.recentCompletions);
  const overdueTasks = Math.max(0, input.overdueTasks);

  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0.5;
  const completionBoost = Math.min(0.2, recentCompletions * 0.03);
  const snoozePenalty = Math.min(0.2, activeSnoozes * 0.04);
  const overduePenalty = Math.min(0.25, overdueTasks * 0.03);

  return Math.max(0, Math.min(1, completionRate + completionBoost - snoozePenalty - overduePenalty));
}

export function computeSignalInteractionInsights(input: {
  signals: LatestSharedSignals;
  cashBufferPosture?: CashBufferPosture | null;
  cashBufferAmount?: number | null;
}): SignalInteractionInsight[] {
  const coverageGapCount = extractSignalNumber(input.signals.COVERAGE_GAP ?? null, 'coverageGapCount');
  const maintenanceAdherence =
    extractSignalNumber(input.signals.MAINT_ADHERENCE ?? null, 'adherenceScore') ??
    extractSignalNumber(input.signals.MAINT_ADHERENCE ?? null, 'adherencePercent');
  const riskSpike = extractSignalNumber(input.signals.RISK_SPIKE ?? null, 'riskScore');
  const costAnomaly = extractSignalNumber(input.signals.COST_ANOMALY ?? null, 'costPressureScore');
  const savingsRealization = extractSignalNumber(input.signals.SAVINGS_REALIZATION ?? null, 'estimatedAnnualSavings');
  const financialDiscipline = extractSignalNumber(input.signals.FINANCIAL_DISCIPLINE ?? null, 'disciplineScore');
  const cashBufferPosture = deriveCashBufferPosture(input);

  const insights: SignalInteractionInsight[] = [];

  if (
    coverageGapCount !== null &&
    coverageGapCount > 0 &&
    ((riskSpike !== null && riskSpike >= 0.55) || (costAnomaly !== null && costAnomaly >= 0.55))
  ) {
    const strength = interactionStrength(
      coverageGapCount >= 4 ? 0.95 : coverageGapCount / 4,
      riskSpike,
      costAnomaly
    );

    insights.push({
      code: 'COVERAGE_EVENT_PRESSURE',
      title: 'Coverage and event pressure are reinforcing each other',
      strength,
      reasons: [
        `Coverage gap signal reports ${Math.round(coverageGapCount)} unresolved gap(s).`,
        `Event pressure is ${severityFromStrength(Math.max(riskSpike ?? 0, costAnomaly ?? 0)).toLowerCase()}.`,
      ],
      drivers: [
        'COVERAGE_GAP',
        ...(riskSpike !== null ? (['RISK_SPIKE'] as SharedSignalKey[]) : []),
        ...(costAnomaly !== null ? (['COST_ANOMALY'] as SharedSignalKey[]) : []),
      ],
    });
  }

  if (maintenanceAdherence !== null && maintenanceAdherence < 0.6 && cashBufferPosture === 'TIGHT') {
    const strength = interactionStrength(1 - maintenanceAdherence, 0.85);
    insights.push({
      code: 'MAINTENANCE_BUFFER_URGENCY',
      title: 'Low maintenance adherence and tight cash buffer raise urgency',
      strength,
      reasons: [
        `Maintenance adherence is ${Math.round(maintenanceAdherence * 100)}%.`,
        'Cash buffer posture is tight, reducing absorbency for preventable failures.',
      ],
      drivers: ['MAINT_ADHERENCE'],
    });
  }

  if (
    maintenanceAdherence !== null &&
    maintenanceAdherence >= 0.72 &&
    ((savingsRealization !== null && savingsRealization > 0) || (financialDiscipline !== null && financialDiscipline >= 0.55))
  ) {
    const normalizedSavings = savingsRealization !== null ? clamp01(Math.min(1, savingsRealization / 2400)) : null;
    const strength = interactionStrength(maintenanceAdherence, normalizedSavings, financialDiscipline);
    insights.push({
      code: 'STABILITY_MOMENTUM',
      title: 'Savings realization and maintenance consistency indicate stability momentum',
      strength,
      reasons: [
        `Maintenance adherence is ${Math.round(maintenanceAdherence * 100)}%.`,
        savingsRealization !== null
          ? `Realized savings signal contributes ~${Math.round(savingsRealization)} annual value.`
          : 'Financial discipline pattern confirms repeated realized savings behavior.',
      ],
      drivers: [
        'MAINT_ADHERENCE',
        ...(savingsRealization !== null ? (['SAVINGS_REALIZATION'] as SharedSignalKey[]) : []),
        ...(financialDiscipline !== null ? (['FINANCIAL_DISCIPLINE'] as SharedSignalKey[]) : []),
      ],
    });
  }

  return insights
    .map((entry) => ({
      ...entry,
      strength: Number(entry.strength.toFixed(4)),
    }))
    .sort((a, b) => b.strength - a.strength);
}

export class SignalService {
  async listSignals(propertyId: string, filters?: SignalListFilters): Promise<SignalDTO[]> {
    const now = new Date();
    const signals = await prisma.signal.findMany({
      where: {
        propertyId,
        ...(filters?.signalKey ? { signalKey: filters.signalKey } : {}),
        ...(filters?.roomId ? { roomId: filters.roomId } : {}),
        ...(filters?.homeItemId ? { homeItemId: filters.homeItemId } : {}),
        ...(filters?.freshOnly
          ? {
              OR: [
                { validUntil: null },
                { validUntil: { gt: now } },
              ],
            }
          : {}),
        ...(filters?.capturedFrom || filters?.capturedTo
          ? {
              capturedAt: {
                ...(filters?.capturedFrom ? { gte: filters.capturedFrom } : {}),
                ...(filters?.capturedTo ? { lte: filters.capturedTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
      take: filters?.limit ?? 100,
    });

    return signals.map(mapSignal);
  }

  async getLatestSignalsByKey(
    propertyId: string,
    keys: SharedSignalKey[],
    options?: { freshOnly?: boolean }
  ): Promise<LatestSharedSignals> {
    if (keys.length === 0) return {};

    const rows = await this.listSignals(propertyId, {
      freshOnly: options?.freshOnly ?? true,
      limit: 250,
    });

    const keySet = new Set(keys);
    const latest: LatestSharedSignals = {};

    for (const row of rows) {
      if (!keySet.has(row.signalKey as SharedSignalKey)) continue;
      const typedKey = row.signalKey as SharedSignalKey;
      if (!latest[typedKey]) {
        latest[typedKey] = row;
      }
    }

    return latest;
  }

  async getSignalInteractionContext(
    propertyId: string,
    options?: {
      freshOnly?: boolean;
      cashBufferPosture?: CashBufferPosture | null;
      cashBufferAmount?: number | null;
    }
  ): Promise<SignalInteractionContext> {
    const keys: SharedSignalKey[] = [
      'MAINT_ADHERENCE',
      'COVERAGE_GAP',
      'SAVINGS_REALIZATION',
      'RISK_SPIKE',
      'COST_ANOMALY',
      'FINANCIAL_DISCIPLINE',
    ];

    const signals = await this.getLatestSignalsByKey(propertyId, keys, {
      freshOnly: options?.freshOnly ?? true,
    });

    const interactions = computeSignalInteractionInsights({
      signals,
      cashBufferPosture: options?.cashBufferPosture,
      cashBufferAmount: options?.cashBufferAmount,
    });

    const staleSignals = (Object.entries(signals) as Array<[SharedSignalKey, SignalDTO | undefined]>)
      .filter(([, signal]) => signal?.isStale)
      .map(([key]) => key);

    return {
      signals,
      interactions,
      staleSignals,
    };
  }

  async publishSignal(input: PublishSignalInput): Promise<SignalDTO> {
    const expectedOwner = SIGNAL_OWNER_BY_KEY[input.signalKey];
    if (expectedOwner && input.sourceModel !== expectedOwner) {
      throw new Error(
        `Signal ownership mismatch for ${input.signalKey}. Expected ${expectedOwner}, received ${input.sourceModel}.`
      );
    }

    const capturedAt = input.capturedAt ?? new Date();
    const validUntil = input.validUntil ?? null;
    const freshness = evaluateSignalFreshness({ capturedAt, validUntil });

    const confidenceBreakdown = normalizeConfidenceBreakdown(input.confidenceBreakdown, asFinite(input.confidence));
    const confidence = confidenceBreakdown ? confidenceBreakdown.score : clamp01(input.confidence);

    const latest = await prisma.signal.findFirst({
      where: {
        propertyId: input.propertyId,
        signalKey: input.signalKey,
        roomId: input.roomId ?? null,
        homeItemId: input.homeItemId ?? null,
      },
      orderBy: [{ version: 'desc' }, { capturedAt: 'desc' }],
    });

    const valueJson = buildValueJsonWithMeta({
      base: input.valueJson,
      freshnessState: freshness.state,
      reasons: input.reasons,
      confidenceBreakdown,
      evidenceCount: input.evidenceCount,
      patternKey: input.patternKey,
    });

    const data: Prisma.SignalUncheckedCreateInput = {
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
      homeItemId: input.homeItemId ?? null,
      signalKey: input.signalKey,
      valueNumber: input.valueNumber ?? null,
      valueText: input.valueText ?? null,
      valueJson,
      unit: input.unit ?? null,
      confidence,
      sourceModel: input.sourceModel,
      sourceId: input.sourceId,
      capturedAt,
      validUntil,
      version: latest ? latest.version + 1 : 1,
    };

    if (latest && latest.sourceModel === input.sourceModel && latest.sourceId === input.sourceId) {
      const updated = await prisma.signal.update({
        where: { id: latest.id },
        data: {
          valueNumber: data.valueNumber,
          valueText: data.valueText,
          valueJson: data.valueJson,
          unit: data.unit,
          confidence: data.confidence,
          capturedAt: data.capturedAt,
          validUntil: data.validUntil,
        },
      });

      return mapSignal(updated);
    }

    const created = await prisma.signal.create({ data });
    return mapSignal(created);
  }

  async publishCoverageGapSignal(params: {
    propertyId: string;
    coverageAnalysisId: string;
    gapCount: number;
    confidence?: number | null;
    verdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  }): Promise<SignalDTO> {
    const now = new Date();
    const [policyCount, warrantyCount, inventoryCount] = await Promise.all([
      prisma.insurancePolicy.count({ where: { propertyId: params.propertyId } }),
      prisma.warranty.count({ where: { propertyId: params.propertyId } }),
      prisma.inventoryItem.count({ where: { propertyId: params.propertyId } }),
    ]);

    const sourceQuality = clamp01(asFinite(params.confidence) ?? 0.68);
    const dataSourcesPresent = Number(policyCount > 0) + Number(warrantyCount > 0) + Number(inventoryCount > 0);
    const completenessQuality = clamp01(dataSourcesPresent / 3);
    const agreementQuality = clamp01(
      params.gapCount > 0
        ? params.verdict === 'NOT_WORTH_IT'
          ? 0.55
          : 0.9
        : params.verdict === 'NOT_WORTH_IT'
          ? 0.9
          : 0.65
    );
    const verificationQuality = clamp01(0.55 + completenessQuality * 0.4);

    const confidenceBreakdown = normalizeConfidenceBreakdown(
      {
        sourceQuality,
        recencyQuality: 1,
        completenessQuality,
        agreementQuality,
        verificationQuality,
      },
      sourceQuality
    );

    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + (params.gapCount > 0 ? 21 : 45));

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'COVERAGE_GAP',
      sourceModel: SIGNAL_OWNER_BY_KEY.COVERAGE_GAP,
      sourceId: params.coverageAnalysisId,
      valueNumber: params.gapCount,
      valueText: params.gapCount > 0 ? 'GAP_PRESENT' : 'NO_GAP',
      unit: 'count',
      confidence: confidenceBreakdown?.score ?? params.confidence ?? null,
      confidenceBreakdown,
      reasons: [
        `${params.gapCount} gap lane(s) detected from coverage analysis.`,
        `Evidence completeness uses policy/warranty/inventory coverage (${dataSourcesPresent}/3 sources present).`,
      ],
      evidenceCount: dataSourcesPresent,
      valueJson: {
        coverageGapCount: params.gapCount,
        verdict: params.verdict,
        evidenceSources: {
          policyCount,
          warrantyCount,
          inventoryCount,
        },
      },
      validUntil,
    });
  }

  private async publishFinancialDisciplinePatternSignal(params: {
    propertyId: string;
    capturedAt?: Date;
  }): Promise<SignalDTO | null> {
    const now = params.capturedAt ?? new Date();
    const lookback = new Date(now);
    lookback.setDate(lookback.getDate() - 365);

    const realizedActions = await prisma.homeSavingsOpportunity.count({
      where: {
        propertyId: params.propertyId,
        status: { in: ['APPLIED', 'SWITCHED'] },
        updatedAt: { gte: lookback },
      },
    });

    if (realizedActions < 2) {
      return null;
    }

    const disciplineScore = clamp01(0.45 + Math.min(0.45, realizedActions * 0.1));
    const confidenceBreakdown = normalizeConfidenceBreakdown(
      {
        sourceQuality: 0.86,
        recencyQuality: recencyScore(0, 30, 120),
        completenessQuality: 0.78,
        agreementQuality: 0.85,
        verificationQuality: 0.9,
      },
      0.82
    );

    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 120);

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'FINANCIAL_DISCIPLINE',
      sourceModel: SIGNAL_OWNER_BY_KEY.FINANCIAL_DISCIPLINE,
      sourceId: `discipline:${params.propertyId}`,
      valueNumber: disciplineScore,
      valueText: realizedActions >= 4 ? 'STRONG_DISCIPLINE' : 'EMERGING_DISCIPLINE',
      unit: 'ratio',
      confidence: confidenceBreakdown?.score ?? 0.82,
      confidenceBreakdown,
      reasons: [
        `Detected ${realizedActions} realized savings actions in the last 12 months.`,
        'Repeated successful savings actions indicate durable execution behavior.',
      ],
      evidenceCount: realizedActions,
      patternKey: 'REPEATED_SAVINGS_ACTIONS',
      valueJson: {
        disciplineScore,
        realizedActionsLast12Months: realizedActions,
      },
      capturedAt: now,
      validUntil,
    });
  }

  async publishSavingsRealizationSignal(params: {
    propertyId: string;
    opportunityId: string;
    status: HomeSavingsOpportunityStatus;
    estimatedAnnualSavings: number | null;
    estimatedMonthlySavings: number | null;
    currency: string;
  }): Promise<SignalDTO> {
    const now = new Date();
    const opportunity = await prisma.homeSavingsOpportunity.findUnique({
      where: { id: params.opportunityId },
      select: {
        updatedAt: true,
        generatedAt: true,
        confidence: true,
      },
    });

    const updatedAt = opportunity?.updatedAt ?? now;
    const ageDays = daysSince(updatedAt, now);
    const hasAnnual = asFinite(params.estimatedAnnualSavings) !== null;
    const hasMonthly = asFinite(params.estimatedMonthlySavings) !== null;

    const sourceQuality = clamp01(
      params.status === 'SWITCHED'
        ? 0.94
        : params.status === 'APPLIED'
          ? 0.88
          : 0.68
    );
    const recencyQuality = recencyScore(ageDays, 14, 120);
    const completenessQuality = clamp01((Number(hasAnnual) + Number(hasMonthly) + Number(Boolean(params.currency))) / 3);
    const agreementQuality = clamp01(params.status === 'APPLIED' || params.status === 'SWITCHED' ? 0.92 : 0.7);
    const verificationQuality = clamp01(
      opportunity?.confidence === 'HIGH'
        ? 0.9
        : opportunity?.confidence === 'MEDIUM'
          ? 0.78
          : 0.64
    );

    const confidenceBreakdown = normalizeConfidenceBreakdown(
      {
        sourceQuality,
        recencyQuality,
        completenessQuality,
        agreementQuality,
        verificationQuality,
      },
      0.82
    );

    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + (params.status === 'SWITCHED' ? 180 : 120));

    const signal = await this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'SAVINGS_REALIZATION',
      sourceModel: SIGNAL_OWNER_BY_KEY.SAVINGS_REALIZATION,
      sourceId: params.opportunityId,
      valueNumber: params.estimatedAnnualSavings ?? params.estimatedMonthlySavings ?? 0,
      valueText: params.status,
      unit: params.currency,
      confidence: confidenceBreakdown?.score ?? 0.82,
      confidenceBreakdown,
      reasons: [
        `Savings lifecycle status is ${params.status}.`,
        hasAnnual || hasMonthly
          ? 'Estimated realized savings values are available for this opportunity.'
          : 'Savings amount is missing, reducing confidence in realized value.',
      ],
      evidenceCount: Number(hasAnnual) + Number(hasMonthly),
      valueJson: {
        status: params.status,
        estimatedMonthlySavings: params.estimatedMonthlySavings,
        estimatedAnnualSavings: params.estimatedAnnualSavings,
        currency: params.currency,
        opportunityAgeDays: Number(ageDays.toFixed(1)),
      },
      capturedAt: now,
      validUntil,
    });

    await this.publishFinancialDisciplinePatternSignal({
      propertyId: params.propertyId,
      capturedAt: now,
    });

    return signal;
  }

  private async publishMaintenancePatternSignals(params: {
    propertyId: string;
    capturedAt: Date;
  }): Promise<SignalDTO[]> {
    const now = params.capturedAt;
    const repairsLookback = new Date(now);
    repairsLookback.setDate(repairsLookback.getDate() - 180);

    const snoozeLookback = new Date(now);
    snoozeLookback.setDate(snoozeLookback.getDate() - 90);

    const [repairEventCount, activeOverdueTasks, snoozesLast90] = await Promise.all([
      prisma.homeEvent.count({
        where: {
          propertyId: params.propertyId,
          occurredAt: { gte: repairsLookback },
          OR: [
            { type: { in: ['REPAIR', 'MAINTENANCE', 'INSPECTION'] } },
            { title: { contains: 'repair', mode: 'insensitive' } },
            { title: { contains: 'replace', mode: 'insensitive' } },
          ],
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: {
            in: [
              MaintenanceTaskStatus.PENDING,
              MaintenanceTaskStatus.IN_PROGRESS,
              MaintenanceTaskStatus.NEEDS_REVIEW,
            ],
          },
          nextDueDate: { lt: now },
        },
      }),
      prisma.orchestrationActionSnooze.count({
        where: {
          propertyId: params.propertyId,
          snoozedAt: { gte: snoozeLookback },
        },
      }),
    ]);

    const published: SignalDTO[] = [];

    if (repairEventCount >= 3) {
      const degradationScore = clamp01(0.42 + Math.min(0.5, repairEventCount * 0.08 + activeOverdueTasks * 0.03));
      const confidenceBreakdown = normalizeConfidenceBreakdown(
        {
          sourceQuality: 0.82,
          recencyQuality: 0.86,
          completenessQuality: activeOverdueTasks > 0 ? 0.78 : 0.68,
          agreementQuality: 0.83,
          verificationQuality: 0.72,
        },
        0.79
      );

      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + 30);

      published.push(
        await this.publishSignal({
          propertyId: params.propertyId,
          signalKey: 'SYSTEM_DEGRADATION',
          sourceModel: SIGNAL_OWNER_BY_KEY.SYSTEM_DEGRADATION,
          sourceId: `system-degradation:${params.propertyId}`,
          valueNumber: degradationScore,
          valueText: degradationScore >= 0.75 ? 'HIGH_DEGRADATION' : 'EMERGING_DEGRADATION',
          unit: 'ratio',
          confidence: confidenceBreakdown?.score ?? 0.79,
          confidenceBreakdown,
          reasons: [
            `${repairEventCount} repair-like events in the last 180 days suggest repeated system strain.`,
            `${activeOverdueTasks} overdue maintenance task(s) are reinforcing degradation risk.`,
          ],
          evidenceCount: repairEventCount,
          patternKey: 'REPEATED_REPAIR_EVENTS',
          valueJson: {
            repairEventCountLast180Days: repairEventCount,
            overdueTasks: activeOverdueTasks,
            degradationScore,
          },
          capturedAt: now,
          validUntil,
        })
      );
    }

    if (snoozesLast90 >= 3 || activeOverdueTasks >= 4) {
      const accumulationScore = clamp01(0.4 + Math.min(0.52, snoozesLast90 * 0.08 + activeOverdueTasks * 0.05));
      const confidenceBreakdown = normalizeConfidenceBreakdown(
        {
          sourceQuality: 0.8,
          recencyQuality: 0.88,
          completenessQuality: 0.76,
          agreementQuality: 0.84,
          verificationQuality: 0.7,
        },
        0.78
      );

      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + 21);

      published.push(
        await this.publishSignal({
          propertyId: params.propertyId,
          signalKey: 'RISK_ACCUMULATION',
          sourceModel: SIGNAL_OWNER_BY_KEY.RISK_ACCUMULATION,
          sourceId: `risk-accumulation:${params.propertyId}`,
          valueNumber: accumulationScore,
          valueText: accumulationScore >= 0.78 ? 'ACCUMULATING_FAST' : 'ACCUMULATING',
          unit: 'ratio',
          confidence: confidenceBreakdown?.score ?? 0.78,
          confidenceBreakdown,
          reasons: [
            `${snoozesLast90} maintenance snooze action(s) in the last 90 days.`,
            `${activeOverdueTasks} overdue maintenance task(s) indicate deferred risk accumulation.`,
          ],
          evidenceCount: snoozesLast90 + activeOverdueTasks,
          patternKey: 'DEFERRED_MAINTENANCE_PATTERN',
          valueJson: {
            snoozesLast90Days: snoozesLast90,
            overdueTasks: activeOverdueTasks,
            accumulationScore,
          },
          capturedAt: now,
          validUntil,
        })
      );
    }

    return published;
  }

  async publishMaintenanceAdherenceSignal(params: {
    propertyId: string;
    sourceId: string;
  }): Promise<SignalDTO> {
    const now = new Date();
    const lookback = new Date(now);
    lookback.setDate(lookback.getDate() - 90);

    const [
      totalTasks,
      completedTasks,
      overdueTasks,
      recentCompletions,
      activeSnoozes,
      dueDateCoverageCount,
      completionEvidence,
      lastCompletion,
    ] = await Promise.all([
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: { not: MaintenanceTaskStatus.CANCELLED },
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: MaintenanceTaskStatus.COMPLETED,
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: {
            in: [
              MaintenanceTaskStatus.PENDING,
              MaintenanceTaskStatus.IN_PROGRESS,
              MaintenanceTaskStatus.NEEDS_REVIEW,
            ],
          },
          nextDueDate: { lt: now },
        },
      }),
      prisma.orchestrationActionCompletion.count({
        where: {
          propertyId: params.propertyId,
          completedAt: { gte: lookback },
        },
      }),
      prisma.orchestrationActionSnooze.count({
        where: {
          propertyId: params.propertyId,
          endedAt: null,
          snoozeUntil: { gt: now },
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          nextDueDate: { not: null },
          status: { not: MaintenanceTaskStatus.CANCELLED },
        },
      }),
      prisma.orchestrationActionCompletion.aggregate({
        where: {
          propertyId: params.propertyId,
          completedAt: { gte: lookback },
        },
        _sum: {
          photoCount: true,
        },
        _count: {
          _all: true,
          notes: true,
        },
      }),
      prisma.orchestrationActionCompletion.findFirst({
        where: {
          propertyId: params.propertyId,
          undoneAt: null,
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          completedAt: true,
        },
      }),
    ]);

    const adherenceBase = computeMaintenanceAdherenceScore({
      totalTasks,
      completedTasks,
      activeSnoozes,
      recentCompletions,
      overdueTasks,
    });

    const daysSinceLastCompletion = lastCompletion?.completedAt
      ? daysSince(lastCompletion.completedAt, now)
      : null;

    const decayMultiplier =
      daysSinceLastCompletion === null
        ? 0.78
        : daysSinceLastCompletion <= 14
          ? 1
          : daysSinceLastCompletion <= 45
            ? 0.92
            : daysSinceLastCompletion <= 90
              ? 0.82
              : daysSinceLastCompletion <= 180
                ? 0.68
                : 0.54;

    const adherenceScore = clamp01(adherenceBase * decayMultiplier);

    const validUntil = new Date(now);
    if (daysSinceLastCompletion === null) validUntil.setDate(validUntil.getDate() + 10);
    else if (daysSinceLastCompletion <= 14) validUntil.setDate(validUntil.getDate() + 21);
    else if (daysSinceLastCompletion <= 45) validUntil.setDate(validUntil.getDate() + 14);
    else if (daysSinceLastCompletion <= 90) validUntil.setDate(validUntil.getDate() + 10);
    else validUntil.setDate(validUntil.getDate() + 7);

    const completionRecordCount = completionEvidence._count._all ?? 0;
    const completionNotesCount = completionEvidence._count.notes ?? 0;
    const completionPhotos = asFinite(completionEvidence._sum.photoCount) ?? 0;

    const proofQuality = completionRecordCount > 0
      ? clamp01((Math.min(1, completionNotesCount / completionRecordCount) + Math.min(1, completionPhotos / Math.max(1, completionRecordCount * 2))) / 2)
      : 0.45;

    const dueDateCoverageQuality = totalTasks > 0 ? clamp01(dueDateCoverageCount / totalTasks) : 0.55;
    const recencyQuality = recencyScore(daysSinceLastCompletion ?? 999, 14, 120);

    const confidenceBreakdown = normalizeConfidenceBreakdown(
      {
        sourceQuality: clamp01(0.7 + Math.min(0.2, completionRecordCount * 0.03)),
        recencyQuality,
        completenessQuality: clamp01((dueDateCoverageQuality + (totalTasks > 0 ? 1 : 0.45)) / 2),
        agreementQuality: clamp01(1 - Math.abs(adherenceBase - adherenceScore) * 0.6),
        verificationQuality: proofQuality,
      },
      0.78
    );

    const signal = await this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'MAINT_ADHERENCE',
      sourceModel: SIGNAL_OWNER_BY_KEY.MAINT_ADHERENCE,
      sourceId: params.sourceId,
      valueNumber: adherenceScore,
      unit: 'ratio',
      confidence: confidenceBreakdown?.score ?? 0.78,
      confidenceBreakdown,
      reasons: [
        `Maintenance adherence blends completion rate, snooze load, and overdue burden (${Math.round(adherenceScore * 100)}%).`,
        daysSinceLastCompletion === null
          ? 'No recent completion evidence was found; decay was applied conservatively.'
          : `Last completion activity was ${Math.round(daysSinceLastCompletion)} day(s) ago; decay multiplier ${decayMultiplier.toFixed(2)} applied.`,
      ],
      evidenceCount: totalTasks,
      valueJson: {
        totalTasks,
        completedTasks,
        overdueTasks,
        recentCompletions,
        activeSnoozes,
        adherencePercent: Math.round(adherenceScore * 100),
        adherenceScore,
        decayMultiplier: Number(decayMultiplier.toFixed(3)),
        daysSinceLastCompletion: daysSinceLastCompletion === null ? null : Number(daysSinceLastCompletion.toFixed(1)),
        completionEvidence: {
          completionRecords: completionRecordCount,
          notesCount: completionNotesCount,
          photoCount: completionPhotos,
        },
      },
      validUntil,
    });

    await this.publishMaintenancePatternSignals({
      propertyId: params.propertyId,
      capturedAt: now,
    });

    return signal;
  }

  private async publishCostPressurePatternSignal(params: {
    propertyId: string;
    capturedAt: Date;
  }): Promise<SignalDTO | null> {
    const lookback = new Date(params.capturedAt);
    lookback.setDate(lookback.getDate() - 90);

    const recurringCostEvents = await prisma.propertyRadarMatch.count({
      where: {
        propertyId: params.propertyId,
        updatedAt: { gte: lookback },
        radarEvent: {
          eventType: {
            in: COST_PRESSURE_EVENT_TYPES as unknown as any,
          },
        },
      },
    });

    if (recurringCostEvents < 2) {
      return null;
    }

    const pressureScore = clamp01(0.5 + Math.min(0.42, recurringCostEvents * 0.08));
    const confidenceBreakdown = normalizeConfidenceBreakdown(
      {
        sourceQuality: 0.82,
        recencyQuality: 0.88,
        completenessQuality: 0.72,
        agreementQuality: 0.84,
        verificationQuality: 0.7,
      },
      0.79
    );

    const validUntil = new Date(params.capturedAt);
    validUntil.setDate(validUntil.getDate() + 30);

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'COST_PRESSURE_PATTERN',
      sourceModel: SIGNAL_OWNER_BY_KEY.COST_PRESSURE_PATTERN,
      sourceId: `cost-pressure-pattern:${params.propertyId}`,
      valueNumber: pressureScore,
      valueText: recurringCostEvents >= 4 ? 'RECURRING_PRESSURE_HIGH' : 'RECURRING_PRESSURE',
      unit: 'ratio',
      confidence: confidenceBreakdown?.score ?? 0.79,
      confidenceBreakdown,
      reasons: [
        `${recurringCostEvents} cost-pressure radar matches were detected in the last 90 days.`,
        'Recurring market-driven pressure pattern is likely to influence near-term costs.',
      ],
      evidenceCount: recurringCostEvents,
      patternKey: 'RECURRING_COST_EVENTS',
      valueJson: {
        recurringCostEventsLast90Days: recurringCostEvents,
        costPressureScore: pressureScore,
      },
      capturedAt: params.capturedAt,
      validUntil,
    });
  }

  async publishRadarEventSignals(params: {
    propertyId: string;
    radarEventId: string;
    eventType: string;
    severity: string;
    impactLevel?: string | null;
    capturedAt?: Date;
    validUntil?: Date | null;
  }): Promise<{ riskSpike: SignalDTO | null; costAnomaly: SignalDTO | null }> {
    const capturedAt = params.capturedAt ?? new Date();
    const baseRiskScore = mapRadarSeverityToSignalScore(params.severity);
    const impactScore = mapRadarImpactToSignalScore(params.impactLevel);
    const riskScore = Math.max(baseRiskScore, impactScore);

    const effectiveValidUntil = params.validUntil === undefined
      ? (() => {
          const next = new Date(capturedAt);
          next.setDate(next.getDate() + 14);
          return next;
        })()
      : params.validUntil;

    let riskSpike: SignalDTO | null = null;
    let costAnomaly: SignalDTO | null = null;

    if (riskScore >= 0.5) {
      const confidenceBreakdown = normalizeConfidenceBreakdown(
        {
          sourceQuality: clamp01(0.68 + baseRiskScore * 0.25),
          recencyQuality: 1,
          completenessQuality: clamp01(params.impactLevel ? 0.85 : 0.68),
          agreementQuality: clamp01(0.65 + Math.min(baseRiskScore, impactScore) * 0.3),
          verificationQuality: clamp01(0.62 + impactScore * 0.25),
        },
        0.78
      );

      riskSpike = await this.publishSignal({
        propertyId: params.propertyId,
        signalKey: 'RISK_SPIKE',
        sourceModel: SIGNAL_OWNER_BY_KEY.RISK_SPIKE,
        sourceId: params.radarEventId,
        valueNumber: riskScore,
        valueText: riskScore >= 0.8 ? 'HIGH_SPIKE' : 'ELEVATED_SPIKE',
        unit: 'ratio',
        confidence: confidenceBreakdown?.score ?? 0.78,
        confidenceBreakdown,
        reasons: [
          `Radar severity ${String(params.severity)} and impact ${String(params.impactLevel ?? 'unknown')} generated elevated risk pressure.`,
        ],
        evidenceCount: 1,
        valueJson: {
          eventType: params.eventType,
          severity: params.severity,
          impactLevel: params.impactLevel ?? null,
          riskScore,
        },
        capturedAt,
        validUntil: effectiveValidUntil,
      });
    }

    if (isCostPressureEvent(params.eventType)) {
      const costPressureScore = Math.max(0.55, Math.min(0.95, riskScore));
      const costValidUntil = new Date(capturedAt);
      costValidUntil.setDate(costValidUntil.getDate() + 30);

      const confidenceBreakdown = normalizeConfidenceBreakdown(
        {
          sourceQuality: 0.78,
          recencyQuality: 1,
          completenessQuality: 0.74,
          agreementQuality: clamp01(0.68 + costPressureScore * 0.2),
          verificationQuality: 0.7,
        },
        0.74
      );

      costAnomaly = await this.publishSignal({
        propertyId: params.propertyId,
        signalKey: 'COST_ANOMALY',
        sourceModel: SIGNAL_OWNER_BY_KEY.COST_ANOMALY,
        sourceId: params.radarEventId,
        valueNumber: costPressureScore,
        valueText: 'UPWARD_PRESSURE',
        unit: 'ratio',
        confidence: confidenceBreakdown?.score ?? 0.74,
        confidenceBreakdown,
        reasons: [
          `Event type ${params.eventType} is categorized as cost pressure.`,
          'Cost anomaly confidence blends event severity and impact intensity.',
        ],
        evidenceCount: 1,
        valueJson: {
          eventType: params.eventType,
          severity: params.severity,
          impactLevel: params.impactLevel ?? null,
          costPressureScore,
        },
        capturedAt,
        validUntil: costValidUntil,
      });

      await this.publishCostPressurePatternSignal({
        propertyId: params.propertyId,
        capturedAt,
      });
    }

    return { riskSpike, costAnomaly };
  }

  async refreshSignalsForProperty(propertyId: string): Promise<SignalRefreshSummary> {
    const refreshedSignals: SharedSignalKey[] = [];
    const skippedSignals: SharedSignalKey[] = [];

    const maintenance = await this.publishMaintenanceAdherenceSignal({
      propertyId,
      sourceId: `refresh:${propertyId}:maintenance`,
    });
    if (maintenance) refreshedSignals.push('MAINT_ADHERENCE');

    const [latestCoverageAnalysis, gaps, latestSavingsOpportunity] = await Promise.all([
      prisma.coverageAnalysis.findFirst({
        where: { propertyId },
        select: {
          id: true,
          confidence: true,
          overallVerdict: true,
        },
        orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      detectCoverageGaps(propertyId),
      prisma.homeSavingsOpportunity.findFirst({
        where: {
          propertyId,
          status: { in: ['APPLIED', 'SWITCHED'] },
        },
        orderBy: [{ updatedAt: 'desc' }, { generatedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          estimatedMonthlySavings: true,
          estimatedAnnualSavings: true,
          currency: true,
        },
      }),
    ]);

    const coverageSignal = await this.publishCoverageGapSignal({
      propertyId,
      coverageAnalysisId: latestCoverageAnalysis?.id ?? `refresh:${propertyId}:coverage`,
      gapCount: gaps.length,
      confidence:
        latestCoverageAnalysis?.confidence === 'HIGH'
          ? 0.9
          : latestCoverageAnalysis?.confidence === 'MEDIUM'
            ? 0.74
            : 0.58,
      verdict: latestCoverageAnalysis?.overallVerdict ?? (gaps.length > 0 ? 'SITUATIONAL' : 'NOT_WORTH_IT'),
    });
    if (coverageSignal) refreshedSignals.push('COVERAGE_GAP');

    if (latestSavingsOpportunity) {
      const savingsSignal = await this.publishSavingsRealizationSignal({
        propertyId,
        opportunityId: latestSavingsOpportunity.id,
        status: latestSavingsOpportunity.status,
        estimatedMonthlySavings: asFinite(latestSavingsOpportunity.estimatedMonthlySavings),
        estimatedAnnualSavings: asFinite(latestSavingsOpportunity.estimatedAnnualSavings),
        currency: latestSavingsOpportunity.currency,
      });
      if (savingsSignal) refreshedSignals.push('SAVINGS_REALIZATION');
    } else {
      skippedSignals.push('SAVINGS_REALIZATION');
    }

    const latest = await this.getLatestSignalsByKey(propertyId, SHARED_SIGNAL_KEYS, { freshOnly: true });
    const interactions = computeSignalInteractionInsights({ signals: latest });

    return {
      propertyId,
      refreshedSignals,
      skippedSignals,
      interactionCount: interactions.length,
    };
  }

  async getPropertySignalHealth(propertyId: string, lookbackDays = 120): Promise<PropertySignalHealthSummary> {
    const now = new Date();
    const capturedFrom = new Date(now);
    capturedFrom.setDate(capturedFrom.getDate() - Math.max(1, lookbackDays));

    const signals = await this.listSignals(propertyId, {
      freshOnly: false,
      capturedFrom,
      limit: 1200,
    });

    const byKey: Record<string, number> = {};
    let staleSignalCount = 0;
    let lowConfidenceSignalCount = 0;
    let interactionSignalCount = 0;
    let fresh = 0;
    let decaying = 0;

    for (const signal of signals) {
      byKey[signal.signalKey] = (byKey[signal.signalKey] ?? 0) + 1;

      const state = signal.freshnessState ?? evaluateSignalFreshness(signal).state;
      if (state === 'STALE') staleSignalCount += 1;
      else if (state === 'DECAYING') decaying += 1;
      else fresh += 1;

      if ((signal.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) lowConfidenceSignalCount += 1;

      if (
        MAINTENANCE_PATTERN_SIGNAL_KEYS.includes(signal.signalKey as SharedSignalKey) ||
        FINANCIAL_PATTERN_SIGNAL_KEYS.includes(signal.signalKey as SharedSignalKey) ||
        RADAR_PATTERN_SIGNAL_KEYS.includes(signal.signalKey as SharedSignalKey)
      ) {
        interactionSignalCount += 1;
      }
    }

    return {
      propertyId,
      lookbackDays,
      totalSignals: signals.length,
      staleSignalCount,
      lowConfidenceSignalCount,
      interactionSignalCount,
      freshness: {
        fresh,
        decaying,
        stale: staleSignalCount,
      },
      byKey,
    };
  }

  async getSignalHealthOverview(options?: {
    propertyId?: string;
    limit?: number;
    lookbackDays?: number;
  }): Promise<SignalHealthOverview> {
    const lookbackDays = Math.max(1, options?.lookbackDays ?? 120);

    const targets = options?.propertyId
      ? [{ id: options.propertyId }]
      : await prisma.property.findMany({
          select: { id: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: Math.max(1, Math.min(250, options?.limit ?? 60)),
        });

    const properties = await Promise.all(
      targets.map((property) => this.getPropertySignalHealth(property.id, lookbackDays))
    );

    const totals = properties.reduce(
      (acc, property) => {
        acc.totalSignals += property.totalSignals;
        acc.staleSignals += property.staleSignalCount;
        acc.lowConfidenceSignals += property.lowConfidenceSignalCount;
        acc.interactionSignals += property.interactionSignalCount;
        return acc;
      },
      {
        totalSignals: 0,
        staleSignals: 0,
        lowConfidenceSignals: 0,
        interactionSignals: 0,
      }
    );

    return {
      generatedAt: new Date().toISOString(),
      propertiesEvaluated: properties.length,
      totals,
      properties,
    };
  }
}

export const signalService = new SignalService();
