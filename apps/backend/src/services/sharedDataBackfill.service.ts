import {
  BundlingPreference,
  CashBufferPosture,
  DeductiblePreferenceStyle,
  PreferenceProfile,
  PreferenceProfileSource,
  PreferenceRiskTolerance,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { detectCoverageGaps } from './coverageGap.service';
import { normalizeFinancialAssumptionInput } from './financialAssumption.service';
import { SharedSignalKey, signalService } from './signal.service';

const BACKFILL_VERSION = 1;
const REQUIRED_SIGNAL_KEYS: SharedSignalKey[] = ['MAINT_ADHERENCE', 'COVERAGE_GAP', 'SAVINGS_REALIZATION'];
const TRUSTED_PROFILE_SOURCES = new Set<PreferenceProfileSource>([
  PreferenceProfileSource.USER_INPUT,
  PreferenceProfileSource.IMPORTED,
]);

const TOOL_KEYS_WITH_LINKABLE_RUNS = [
  'COVERAGE_ANALYSIS',
  'RISK_PREMIUM_OPTIMIZER',
  'DO_NOTHING_SIMULATOR',
] as const;

type LinkableToolKey = (typeof TOOL_KEYS_WITH_LINKABLE_RUNS)[number];

export type SharedDataBackfillRunOptions = {
  propertyId?: string;
  dryRun?: boolean;
  limit?: number;
  startAfterPropertyId?: string;
  includePreference?: boolean;
  includeAssumptions?: boolean;
  includeSignals?: boolean;
};

export type BackfillIssueSeverity = 'INFO' | 'WARN' | 'ERROR';

export type BackfillIssue = {
  code: string;
  severity: BackfillIssueSeverity;
  message: string;
  meta?: Record<string, unknown>;
};

export type PropertyBackfillSummary = {
  propertyId: string;
  preference: {
    created: boolean;
    updated: boolean;
    skippedTrusted: boolean;
    inferred: boolean;
    confidence: number | null;
    sourceEvidenceCount: number;
  };
  assumptions: {
    created: number;
    reusedExisting: number;
    linkedCoverageAnalyses: number;
    linkedRiskAnalyses: number;
    linkedDoNothingRuns: number;
    linkedSkippedAlreadyPresent: number;
    skippedEmptyCandidates: number;
  };
  signals: {
    published: number;
    refreshed: number;
    skipped: number;
    keysTouched: SharedSignalKey[];
  };
  issues: BackfillIssue[];
};

export type SharedDataBackfillSummary = {
  dryRun: boolean;
  processedProperties: number;
  skippedProperties: number;
  erroredProperties: number;
  totalPropertiesConsidered: number;
  startedAt: string;
  finishedAt: string;
  aggregates: {
    preferencesCreated: number;
    preferencesUpdated: number;
    assumptionSetsCreated: number;
    assumptionSetsReused: number;
    linkedCoverageAnalyses: number;
    linkedRiskAnalyses: number;
    linkedDoNothingRuns: number;
    signalsPublishedOrRefreshed: number;
    warnings: number;
    errors: number;
  };
  properties: PropertyBackfillSummary[];
};

export type SharedDataConsistencyIssue = {
  propertyId: string;
  code:
    | 'CONFLICTING_PREFERENCE_POSTURE'
    | 'ASSUMPTION_SET_DUPLICATION'
    | 'STALE_SIGNAL'
    | 'BROKEN_REFERENCE'
    | 'MISSING_SIGNAL_FOR_STATE';
  severity: BackfillIssueSeverity;
  message: string;
  meta?: Record<string, unknown>;
};

export type SharedDataConsistencyReport = {
  generatedAt: string;
  propertiesEvaluated: number;
  issueCount: number;
  issues: SharedDataConsistencyIssue[];
};

export type PropertyReadinessStatus = 'READY' | 'PARTIAL' | 'LEGACY_HEAVY';

export type PropertyReadinessLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PropertySharedDataReadiness = {
  propertyId: string;
  status: PropertyReadinessStatus;
  preferenceCompletenessRatio: number;
  assumptionLinkRatio: number;
  signalCoverageRatio: number;
  staleSignalCount: number;
  legacyDependencyLevel: PropertyReadinessLevel;
  details: {
    hasPreferenceProfile: boolean;
    requiredSignalsFresh: SharedSignalKey[];
    requiredSignalsMissingOrStale: SharedSignalKey[];
    totalAnalysesNeedingAssumptionLinks: number;
    linkedAnalysesCount: number;
  };
};

export type SharedDataReadinessReport = {
  generatedAt: string;
  propertiesEvaluated: number;
  summary: {
    ready: number;
    partial: number;
    legacyHeavy: number;
    avgPreferenceCompletenessRatio: number;
    avgAssumptionLinkRatio: number;
    avgSignalCoverageRatio: number;
  };
  properties: PropertySharedDataReadiness[];
};

type PreferenceEvidence = {
  sourceModel: string;
  sourceId: string;
  capturedAt: Date;
  confidenceWeight: number;
  riskTolerance?: PreferenceRiskTolerance;
  deductiblePreferenceStyle?: DeductiblePreferenceStyle;
  cashBufferPosture?: CashBufferPosture;
  bundlingPreference?: BundlingPreference;
};

type PreferenceInference = {
  inferred: boolean;
  riskTolerance: PreferenceRiskTolerance | null;
  deductiblePreferenceStyle: DeductiblePreferenceStyle | null;
  cashBufferPosture: CashBufferPosture | null;
  bundlingPreference: BundlingPreference | null;
  confidence: number | null;
  evidenceCount: number;
  conflicts: string[];
  notesJson: Record<string, unknown>;
};

type AssumptionCandidate = {
  toolKey: string;
  sourceModel: string;
  sourceId: string;
  capturedAt: Date;
  scenarioKey?: string | null;
  canLinkRun: boolean;
  runModel?: LinkableToolKey;
  runId?: string;
  overrides: Record<string, unknown>;
};

type AssumptionBackfillResult = {
  created: number;
  reusedExisting: number;
  linkedCoverageAnalyses: number;
  linkedRiskAnalyses: number;
  linkedDoNothingRuns: number;
  linkedSkippedAlreadyPresent: number;
  skippedEmptyCandidates: number;
};

type SignalBackfillResult = {
  published: number;
  refreshed: number;
  skipped: number;
  keysTouched: SharedSignalKey[];
};

type SignalCheckResult = {
  stale: SharedDataConsistencyIssue[];
  missing: SharedDataConsistencyIssue[];
  broken: SharedDataConsistencyIssue[];
};

type SourceBoundary = {
  createdAt: Date;
  id: string;
};

function asFinite(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function safeObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function maybeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeRiskTolerance(value: unknown): PreferenceRiskTolerance | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
    return normalized as PreferenceRiskTolerance;
  }
  return undefined;
}

function normalizeDeductiblePreferenceStyle(value: unknown): DeductiblePreferenceStyle | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'LOW_DEDUCTIBLE' ||
    normalized === 'BALANCED' ||
    normalized === 'HIGH_DEDUCTIBLE'
  ) {
    return normalized as DeductiblePreferenceStyle;
  }

  if (normalized === 'LOWER' || normalized === 'KEEP_LOW') return DeductiblePreferenceStyle.LOW_DEDUCTIBLE;
  if (normalized === 'RAISE' || normalized === 'KEEP_HIGH') return DeductiblePreferenceStyle.HIGH_DEDUCTIBLE;
  if (normalized === 'UNCHANGED' || normalized === 'DEFAULT') return DeductiblePreferenceStyle.BALANCED;

  return undefined;
}

function normalizeBundlingPreference(value: unknown): BundlingPreference | undefined {
  if (typeof value === 'boolean') {
    return value ? BundlingPreference.PREFER_BUNDLED : BundlingPreference.PREFER_UNBUNDLED;
  }

  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'NO_PREFERENCE' ||
    normalized === 'PREFER_BUNDLED' ||
    normalized === 'PREFER_UNBUNDLED'
  ) {
    return normalized as BundlingPreference;
  }

  if (normalized === 'BUNDLED' || normalized === 'ASSUME_BUNDLED' || normalized === 'BUNDLE') {
    return BundlingPreference.PREFER_BUNDLED;
  }
  if (normalized === 'UNBUNDLED' || normalized === 'ASSUME_UNBUNDLED') {
    return BundlingPreference.PREFER_UNBUNDLED;
  }

  return undefined;
}

export function mapCashBufferPostureFromAmount(amountUsd: number | undefined): CashBufferPosture | undefined {
  if (amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd < 0) return undefined;
  if (amountUsd < 3000) return CashBufferPosture.TIGHT;
  if (amountUsd < 12000) return CashBufferPosture.MODERATE;
  return CashBufferPosture.STRONG;
}

function normalizeCashBufferPosture(value: unknown): CashBufferPosture | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'TIGHT' || normalized === 'MODERATE' || normalized === 'STRONG') {
    return normalized as CashBufferPosture;
  }
  return undefined;
}

function deductibleStyleFromUsd(valueUsd: number | undefined): DeductiblePreferenceStyle | undefined {
  if (valueUsd === undefined || !Number.isFinite(valueUsd) || valueUsd <= 0) return undefined;
  if (valueUsd <= 1200) return DeductiblePreferenceStyle.LOW_DEDUCTIBLE;
  if (valueUsd >= 2200) return DeductiblePreferenceStyle.HIGH_DEDUCTIBLE;
  return DeductiblePreferenceStyle.BALANCED;
}

function recencyWeight(capturedAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 30) return 1.3;
  if (ageDays <= 180) return 1.1;
  if (ageDays <= 365) return 1.0;
  return 0.8;
}

function valueFromPath(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function extractEvidenceFromCoverageSnapshot(
  snapshot: Prisma.JsonValue | null,
  sourceId: string,
  capturedAt: Date,
  confidenceWeight: number
): PreferenceEvidence | null {
  const root = safeObject(snapshot);
  if (Object.keys(root).length === 0) return null;

  const overrides = safeObject(root.overrides as Prisma.JsonValue);
  const insuranceInputs = safeObject(valueFromPath(root, ['insuranceResult', 'inputsUsed']) as Prisma.JsonValue);
  const sharedContext = safeObject(root.sharedContext as Prisma.JsonValue);

  const riskTolerance =
    normalizeRiskTolerance(overrides.riskTolerance) ??
    normalizeRiskTolerance(insuranceInputs.riskTolerance) ??
    normalizeRiskTolerance(sharedContext.riskTolerance);

  const deductibleUsd =
    asFinite(overrides.deductibleUsd) ??
    asFinite(insuranceInputs.deductibleUsd) ??
    asFinite(valueFromPath(root, ['inputs', 'deductibleAmount']));

  const cashBufferUsd =
    asFinite(overrides.cashBufferUsd) ??
    asFinite(insuranceInputs.cashBufferUsd) ??
    asFinite(valueFromPath(root, ['inputs', 'cashBuffer']));

  const deductiblePreferenceStyle =
    normalizeDeductiblePreferenceStyle(overrides.deductiblePreferenceStyle) ?? deductibleStyleFromUsd(deductibleUsd);

  const cashBufferPosture =
    normalizeCashBufferPosture(overrides.cashBufferPosture) ??
    mapCashBufferPostureFromAmount(cashBufferUsd);

  if (!riskTolerance && !deductiblePreferenceStyle && !cashBufferPosture) {
    return null;
  }

  return {
    sourceModel: 'CoverageAnalysis',
    sourceId,
    capturedAt,
    confidenceWeight,
    riskTolerance,
    deductiblePreferenceStyle,
    cashBufferPosture,
  };
}

function extractEvidenceFromRiskSnapshot(
  snapshot: Prisma.JsonValue | null,
  sourceId: string,
  capturedAt: Date,
  confidenceWeight: number
): PreferenceEvidence | null {
  const root = safeObject(snapshot);
  if (Object.keys(root).length === 0) return null;

  const inputs = safeObject(root.inputs as Prisma.JsonValue);
  const riskTolerance = normalizeRiskTolerance(inputs.riskTolerance);
  const deductiblePreferenceStyle =
    normalizeDeductiblePreferenceStyle(inputs.deductiblePreferenceStyle) ??
    deductibleStyleFromUsd(asFinite(inputs.deductibleAmount));
  const cashBufferPosture =
    normalizeCashBufferPosture(inputs.cashBufferPosture) ??
    mapCashBufferPostureFromAmount(asFinite(inputs.cashBuffer));
  const bundlingPreference = normalizeBundlingPreference(inputs.assumeBundled);

  if (!riskTolerance && !deductiblePreferenceStyle && !cashBufferPosture && !bundlingPreference) {
    return null;
  }

  return {
    sourceModel: 'RiskPremiumOptimizationAnalysis',
    sourceId,
    capturedAt,
    confidenceWeight,
    riskTolerance,
    deductiblePreferenceStyle,
    cashBufferPosture,
    bundlingPreference,
  };
}

function extractEvidenceFromDoNothingSnapshot(
  snapshot: Prisma.JsonValue | null,
  sourceId: string,
  capturedAt: Date,
  confidenceWeight: number
): PreferenceEvidence | null {
  const root = safeObject(snapshot);
  if (Object.keys(root).length === 0) return null;

  const overridesApplied = safeObject(root.overridesApplied as Prisma.JsonValue);
  const riskTolerance = normalizeRiskTolerance(overridesApplied.riskTolerance);
  const deductiblePreferenceStyle =
    normalizeDeductiblePreferenceStyle(overridesApplied.deductiblePreferenceStyle) ??
    normalizeDeductiblePreferenceStyle(overridesApplied.deductibleStrategy);

  const cashBufferCents = asFinite(overridesApplied.cashBufferCents);
  const cashBufferUsd = cashBufferCents !== undefined ? cashBufferCents / 100 : undefined;
  const cashBufferPosture =
    normalizeCashBufferPosture(overridesApplied.cashBufferPosture) ?? mapCashBufferPostureFromAmount(cashBufferUsd);

  if (!riskTolerance && !deductiblePreferenceStyle && !cashBufferPosture) {
    return null;
  }

  return {
    sourceModel: 'DoNothingSimulationRun',
    sourceId,
    capturedAt,
    confidenceWeight,
    riskTolerance,
    deductiblePreferenceStyle,
    cashBufferPosture,
  };
}

function confidenceWeightFromLabel(value: string | null | undefined): number {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'HIGH') return 1;
  if (normalized === 'MEDIUM') return 0.8;
  if (normalized === 'LOW') return 0.55;
  return 0.6;
}

export function normalizeAssumptionPayload(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const cleanValue = (input: unknown): unknown => {
    if (input === undefined) return undefined;
    if (input === null) return undefined;

    if (Array.isArray(input)) {
      const next = input.map((entry) => cleanValue(entry)).filter((entry) => entry !== undefined);
      return next.length > 0 ? next : undefined;
    }

    if (typeof input === 'object') {
      const objectInput = input as Record<string, unknown>;
      const keys = Object.keys(objectInput).sort();
      const next: Record<string, unknown> = {};
      for (const key of keys) {
        const cleaned = cleanValue(objectInput[key]);
        if (cleaned !== undefined) {
          next[key] = cleaned;
        }
      }
      return Object.keys(next).length > 0 ? next : undefined;
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
      return Number(input.toFixed(6));
    }

    return input;
  };

  const normalized = cleanValue(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return {};
  return normalized as Record<string, unknown>;
}

export function hashAssumptionPayload(value: Record<string, unknown> | null | undefined): string {
  const normalized = normalizeAssumptionPayload(value);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function extractAssumptionOverridesFromSnapshot(snapshot: Prisma.JsonValue | null): Record<string, unknown> {
  const root = safeObject(snapshot);
  if (Object.keys(root).length === 0) return {};

  const candidates: Record<string, unknown>[] = [];

  const rawOverrides = safeObject(root.overrides as Prisma.JsonValue);
  if (Object.keys(rawOverrides).length > 0) {
    candidates.push(rawOverrides);
  }

  const overridesApplied = safeObject(root.overridesApplied as Prisma.JsonValue);
  if (Object.keys(overridesApplied).length > 0) {
    candidates.push(overridesApplied);
  }

  const inputs = safeObject(root.inputs as Prisma.JsonValue);
  if (Object.keys(inputs).length > 0) {
    candidates.push(inputs);
  }

  const financialAssumptions = normalizeFinancialAssumptionInput(
    valueFromPath(root, ['financialAssumptions']) as Record<string, unknown>
  );
  if (Object.keys(financialAssumptions).length > 0) {
    candidates.push(financialAssumptions as Record<string, unknown>);
  }

  const merged: Record<string, unknown> = {};
  for (const candidate of candidates) {
    for (const [key, entry] of Object.entries(candidate)) {
      if (entry !== undefined && entry !== null) {
        merged[key] = entry;
      }
    }
  }

  return normalizeAssumptionPayload(merged);
}

function extractCoverageAssumptionCandidate(
  row: {
    id: string;
    assumptionSetId: string | null;
    inputsSnapshot: Prisma.JsonValue | null;
    computedAt: Date;
  }
): AssumptionCandidate | null {
  const overrides = extractAssumptionOverridesFromSnapshot(row.inputsSnapshot);
  if (Object.keys(overrides).length === 0) return null;

  return {
    toolKey: 'COVERAGE_ANALYSIS',
    sourceModel: 'CoverageAnalysis',
    sourceId: row.id,
    capturedAt: row.computedAt,
    canLinkRun: true,
    runModel: 'COVERAGE_ANALYSIS',
    runId: row.id,
    overrides,
  };
}

function extractRiskAssumptionCandidate(
  row: {
    id: string;
    assumptionSetId: string | null;
    inputsSnapshot: Prisma.JsonValue | null;
    computedAt: Date;
  }
): AssumptionCandidate | null {
  const overrides = extractAssumptionOverridesFromSnapshot(row.inputsSnapshot);
  if (Object.keys(overrides).length === 0) return null;

  return {
    toolKey: 'RISK_PREMIUM_OPTIMIZER',
    sourceModel: 'RiskPremiumOptimizationAnalysis',
    sourceId: row.id,
    capturedAt: row.computedAt,
    canLinkRun: true,
    runModel: 'RISK_PREMIUM_OPTIMIZER',
    runId: row.id,
    overrides,
  };
}

function extractDoNothingAssumptionCandidate(
  row: {
    id: string;
    assumptionSetId: string | null;
    scenarioId: string | null;
    inputsSnapshot: Prisma.JsonValue | null;
    computedAt: Date;
  }
): AssumptionCandidate | null {
  const overrides = extractAssumptionOverridesFromSnapshot(row.inputsSnapshot);
  if (Object.keys(overrides).length === 0) return null;

  return {
    toolKey: 'DO_NOTHING_SIMULATOR',
    sourceModel: 'DoNothingSimulationRun',
    sourceId: row.id,
    capturedAt: row.computedAt,
    canLinkRun: true,
    runModel: 'DO_NOTHING_SIMULATOR',
    runId: row.id,
    scenarioKey: row.scenarioId,
    overrides,
  };
}

function extractHomeCapitalAssumptionCandidate(
  row: {
    id: string;
    inputsSnapshot: Prisma.JsonValue | null;
    computedAt: Date;
  }
): AssumptionCandidate | null {
  const root = safeObject(row.inputsSnapshot);
  const fromInputs = normalizeFinancialAssumptionInput(
    valueFromPath(root, ['financialAssumptions']) as Record<string, unknown>
  );
  if (Object.keys(fromInputs).length === 0) return null;

  return {
    toolKey: 'HOME_CAPITAL_TIMELINE',
    sourceModel: 'HomeCapitalTimelineAnalysis',
    sourceId: row.id,
    capturedAt: row.computedAt,
    canLinkRun: false,
    overrides: normalizeAssumptionPayload(fromInputs as Record<string, unknown>),
  };
}

function extractToolOverrideAssumptionCandidate(
  propertyId: string,
  toolKey: string,
  entries: Array<{ key: string; value: number }>
): AssumptionCandidate | null {
  if (entries.length === 0) return null;
  const overrides: Record<string, unknown> = {};
  for (const entry of entries) {
    overrides[entry.key] = entry.value;
  }
  if (Object.keys(overrides).length === 0) return null;

  return {
    toolKey,
    sourceModel: 'ToolOverride',
    sourceId: `${propertyId}:${toolKey}`,
    capturedAt: new Date(),
    canLinkRun: false,
    overrides: normalizeAssumptionPayload(overrides),
  };
}

function mergeCandidateStats(target: PropertyBackfillSummary, result: AssumptionBackfillResult): void {
  target.assumptions.created += result.created;
  target.assumptions.reusedExisting += result.reusedExisting;
  target.assumptions.linkedCoverageAnalyses += result.linkedCoverageAnalyses;
  target.assumptions.linkedRiskAnalyses += result.linkedRiskAnalyses;
  target.assumptions.linkedDoNothingRuns += result.linkedDoNothingRuns;
  target.assumptions.linkedSkippedAlreadyPresent += result.linkedSkippedAlreadyPresent;
  target.assumptions.skippedEmptyCandidates += result.skippedEmptyCandidates;
}

function pushIssue(
  propertySummary: PropertyBackfillSummary,
  issue: BackfillIssue,
  runSummary: SharedDataBackfillSummary
): void {
  propertySummary.issues.push(issue);
  if (issue.severity === 'WARN') runSummary.aggregates.warnings += 1;
  if (issue.severity === 'ERROR') runSummary.aggregates.errors += 1;
}

function pickBestEnumValue<T extends string>(
  evidence: PreferenceEvidence[],
  selector: (entry: PreferenceEvidence) => T | undefined,
  fieldName: string
): {
  value: T | null;
  confidence: number | null;
  conflict: boolean;
  scoreByValue: Record<string, number>;
} {
  const scoreByValue = new Map<T, number>();
  let total = 0;

  for (const entry of evidence) {
    const value = selector(entry);
    if (!value) continue;
    const weight = clamp01(entry.confidenceWeight) * recencyWeight(entry.capturedAt);
    const next = (scoreByValue.get(value) ?? 0) + weight;
    scoreByValue.set(value, next);
    total += weight;
  }

  if (scoreByValue.size === 0 || total <= 0) {
    return {
      value: null,
      confidence: null,
      conflict: false,
      scoreByValue: {},
    };
  }

  const ranked = Array.from(scoreByValue.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  });

  const winner = ranked[0];
  const second = ranked[1];
  const confidence = clamp01(winner[1] / total);
  const conflict = Boolean(second && winner[1] - second[1] < 0.25);

  const scoreObject: Record<string, number> = {};
  for (const [value, score] of ranked) {
    scoreObject[value] = Number(score.toFixed(4));
  }

  return {
    value: winner[0],
    confidence,
    conflict,
    scoreByValue: scoreObject,
  };
}

function summarizePreferenceInference(evidence: PreferenceEvidence[]): PreferenceInference {
  if (evidence.length === 0) {
    return {
      inferred: false,
      riskTolerance: null,
      deductiblePreferenceStyle: null,
      cashBufferPosture: null,
      bundlingPreference: null,
      confidence: null,
      evidenceCount: 0,
      conflicts: [],
      notesJson: {
        backfillVersion: BACKFILL_VERSION,
        evidenceCount: 0,
      },
    };
  }

  const risk = pickBestEnumValue(evidence, (entry) => entry.riskTolerance, 'riskTolerance');
  const deductible = pickBestEnumValue(
    evidence,
    (entry) => entry.deductiblePreferenceStyle,
    'deductiblePreferenceStyle'
  );
  const cash = pickBestEnumValue(evidence, (entry) => entry.cashBufferPosture, 'cashBufferPosture');
  const bundling = pickBestEnumValue(evidence, (entry) => entry.bundlingPreference, 'bundlingPreference');

  const confidenceParts = [risk.confidence, deductible.confidence, cash.confidence, bundling.confidence].filter(
    (value): value is number => value !== null
  );
  const confidence =
    confidenceParts.length > 0
      ? clamp01(confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length)
      : null;

  const conflicts: string[] = [];
  if (risk.conflict) conflicts.push('riskTolerance');
  if (deductible.conflict) conflicts.push('deductiblePreferenceStyle');
  if (cash.conflict) conflicts.push('cashBufferPosture');
  if (bundling.conflict) conflicts.push('bundlingPreference');

  return {
    inferred: Boolean(risk.value || deductible.value || cash.value || bundling.value),
    riskTolerance: risk.value,
    deductiblePreferenceStyle: deductible.value,
    cashBufferPosture: cash.value,
    bundlingPreference: bundling.value,
    confidence,
    evidenceCount: evidence.length,
    conflicts,
    notesJson: {
      backfillVersion: BACKFILL_VERSION,
      inferredAt: new Date().toISOString(),
      evidenceCount: evidence.length,
      conflicts,
      scoreByField: {
        riskTolerance: risk.scoreByValue,
        deductiblePreferenceStyle: deductible.scoreByValue,
        cashBufferPosture: cash.scoreByValue,
        bundlingPreference: bundling.scoreByValue,
      },
      sources: evidence.slice(0, 25).map((entry) => ({
        sourceModel: entry.sourceModel,
        sourceId: entry.sourceId,
        capturedAt: entry.capturedAt.toISOString(),
      })),
    },
  };
}

function hasProfileFieldChanges(
  existing: PreferenceProfile,
  next: {
    riskTolerance?: PreferenceRiskTolerance | null;
    deductiblePreferenceStyle?: DeductiblePreferenceStyle | null;
    cashBufferPosture?: CashBufferPosture | null;
    bundlingPreference?: BundlingPreference | null;
    confidence?: number | null;
    notesJson?: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
  }
): boolean {
  if (next.riskTolerance !== undefined && existing.riskTolerance !== next.riskTolerance) return true;
  if (
    next.deductiblePreferenceStyle !== undefined &&
    existing.deductiblePreferenceStyle !== next.deductiblePreferenceStyle
  ) {
    return true;
  }
  if (next.cashBufferPosture !== undefined && existing.cashBufferPosture !== next.cashBufferPosture) return true;
  if (next.bundlingPreference !== undefined && existing.bundlingPreference !== next.bundlingPreference) return true;
  if (next.confidence !== undefined && existing.confidence !== next.confidence) return true;

  if (next.notesJson !== undefined) {
    const existingNotes = existing.notesJson ?? null;
    const normalizedIncoming =
      next.notesJson === Prisma.JsonNull
        ? null
        : normalizeAssumptionPayload((next.notesJson as Record<string, unknown>) ?? {});
    const normalizedExisting = normalizeAssumptionPayload((existingNotes as Record<string, unknown>) ?? {});
    if (JSON.stringify(normalizedIncoming) !== JSON.stringify(normalizedExisting)) {
      return true;
    }
  }

  return false;
}

function profileCompletenessRatio(profile: PreferenceProfile | null): number {
  if (!profile) return 0;
  const fields = [
    profile.riskTolerance,
    profile.deductiblePreferenceStyle,
    profile.cashBufferPosture,
    profile.bundlingPreference,
  ];
  const present = fields.filter((field) => field !== null).length;
  return Number((present / fields.length).toFixed(4));
}

export function classifyLegacyDependencyLevel(input: {
  preferenceCompletenessRatio: number;
  assumptionLinkRatio: number;
  signalCoverageRatio: number;
}): PropertyReadinessLevel {
  if (
    input.preferenceCompletenessRatio < 0.34 ||
    input.assumptionLinkRatio < 0.34 ||
    input.signalCoverageRatio < 0.34
  ) {
    return 'HIGH';
  }

  if (
    input.preferenceCompletenessRatio < 0.67 ||
    input.assumptionLinkRatio < 0.67 ||
    input.signalCoverageRatio < 0.67
  ) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function classifyReadinessStatus(input: {
  preferenceCompletenessRatio: number;
  assumptionLinkRatio: number;
  signalCoverageRatio: number;
  staleSignalCount: number;
}): PropertyReadinessStatus {
  if (
    input.preferenceCompletenessRatio >= 0.75 &&
    input.assumptionLinkRatio >= 0.75 &&
    input.signalCoverageRatio >= 0.67 &&
    input.staleSignalCount === 0
  ) {
    return 'READY';
  }

  if (
    input.preferenceCompletenessRatio <= 0.25 &&
    input.assumptionLinkRatio <= 0.25 &&
    input.signalCoverageRatio <= 0.25
  ) {
    return 'LEGACY_HEAVY';
  }

  return 'PARTIAL';
}

async function resolveSourceBoundary(startAfterPropertyId: string | undefined): Promise<SourceBoundary | null> {
  if (!startAfterPropertyId) return null;
  const source = await prisma.property.findUnique({
    where: { id: startAfterPropertyId },
    select: { id: true, createdAt: true },
  });
  if (!source) return null;
  return { createdAt: source.createdAt, id: source.id };
}

async function listTargetProperties(options: {
  propertyId?: string;
  limit?: number;
  startAfterPropertyId?: string;
}): Promise<Array<{ id: string; homeownerProfileId: string; createdAt: Date }>> {
  if (options.propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: options.propertyId },
      select: { id: true, homeownerProfileId: true, createdAt: true },
    });
    return property ? [property] : [];
  }

  const boundary = await resolveSourceBoundary(options.startAfterPropertyId);

  return prisma.property.findMany({
    where: boundary
      ? {
          OR: [
            { createdAt: { gt: boundary.createdAt } },
            {
              createdAt: boundary.createdAt,
              id: { gt: boundary.id },
            },
          ],
        }
      : undefined,
    select: {
      id: true,
      homeownerProfileId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: options.limit ?? 200,
  });
}

export class SharedDataBackfillService {
  private async collectPreferenceEvidence(propertyId: string): Promise<PreferenceEvidence[]> {
    const [coverageRuns, riskRuns, doNothingRuns] = await Promise.all([
      prisma.coverageAnalysis.findMany({
        where: { propertyId },
        select: {
          id: true,
          confidence: true,
          computedAt: true,
          inputsSnapshot: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 120,
      }),
      prisma.riskPremiumOptimizationAnalysis.findMany({
        where: { propertyId },
        select: {
          id: true,
          confidence: true,
          computedAt: true,
          inputsSnapshot: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 120,
      }),
      prisma.doNothingSimulationRun.findMany({
        where: { propertyId },
        select: {
          id: true,
          confidence: true,
          computedAt: true,
          inputsSnapshot: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 120,
      }),
    ]);

    const evidence: PreferenceEvidence[] = [];

    for (const row of coverageRuns) {
      const extracted = extractEvidenceFromCoverageSnapshot(
        row.inputsSnapshot,
        row.id,
        row.computedAt,
        confidenceWeightFromLabel(row.confidence)
      );
      if (extracted) evidence.push(extracted);
    }

    for (const row of riskRuns) {
      const extracted = extractEvidenceFromRiskSnapshot(
        row.inputsSnapshot,
        row.id,
        row.computedAt,
        confidenceWeightFromLabel(row.confidence)
      );
      if (extracted) evidence.push(extracted);
    }

    for (const row of doNothingRuns) {
      const extracted = extractEvidenceFromDoNothingSnapshot(
        row.inputsSnapshot,
        row.id,
        row.computedAt,
        confidenceWeightFromLabel(row.confidence)
      );
      if (extracted) evidence.push(extracted);
    }

    return evidence;
  }

  private async backfillPreferenceProfile(
    propertyId: string,
    dryRun: boolean
  ): Promise<{
    created: boolean;
    updated: boolean;
    skippedTrusted: boolean;
    inferred: boolean;
    confidence: number | null;
    sourceEvidenceCount: number;
    issue?: BackfillIssue;
  }> {
    const [existing, evidence] = await Promise.all([
      prisma.preferenceProfile.findFirst({
        where: { propertyId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.collectPreferenceEvidence(propertyId),
    ]);

    const inference = summarizePreferenceInference(evidence);

    if (!inference.inferred) {
      return {
        created: false,
        updated: false,
        skippedTrusted: false,
        inferred: false,
        confidence: null,
        sourceEvidenceCount: inference.evidenceCount,
      };
    }

    const trustedExisting =
      existing &&
      TRUSTED_PROFILE_SOURCES.has(existing.source) &&
      Date.now() - existing.updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 365;

    const nextPayload: {
      riskTolerance?: PreferenceRiskTolerance | null;
      deductiblePreferenceStyle?: DeductiblePreferenceStyle | null;
      cashBufferPosture?: CashBufferPosture | null;
      bundlingPreference?: BundlingPreference | null;
      confidence?: number | null;
      source?: PreferenceProfileSource;
      notesJson?: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
    } = {};

    const setIfMissingOrInferSafe = <T>(
      key: 'riskTolerance' | 'deductiblePreferenceStyle' | 'cashBufferPosture' | 'bundlingPreference',
      inferredValue: T | null,
      existingValue: T | null | undefined
    ) => {
      if (inferredValue === null) return;
      if (!existing) {
        (nextPayload as Record<string, unknown>)[key] = inferredValue;
        return;
      }

      if (existingValue === null) {
        (nextPayload as Record<string, unknown>)[key] = inferredValue;
        return;
      }

      if (!trustedExisting && existing.source !== PreferenceProfileSource.USER_INPUT) {
        (nextPayload as Record<string, unknown>)[key] = inferredValue;
      }
    };

    setIfMissingOrInferSafe('riskTolerance', inference.riskTolerance, existing?.riskTolerance);
    setIfMissingOrInferSafe(
      'deductiblePreferenceStyle',
      inference.deductiblePreferenceStyle,
      existing?.deductiblePreferenceStyle
    );
    setIfMissingOrInferSafe('cashBufferPosture', inference.cashBufferPosture, existing?.cashBufferPosture);
    setIfMissingOrInferSafe('bundlingPreference', inference.bundlingPreference, existing?.bundlingPreference);

    nextPayload.confidence = inference.confidence;
    nextPayload.notesJson = inference.notesJson as Prisma.InputJsonValue;

    if (!trustedExisting) {
      nextPayload.source = PreferenceProfileSource.INFERRED;
    }

    if (existing && trustedExisting && Object.keys(nextPayload).every((key) => key === 'confidence' || key === 'notesJson')) {
      return {
        created: false,
        updated: false,
        skippedTrusted: true,
        inferred: true,
        confidence: inference.confidence,
        sourceEvidenceCount: inference.evidenceCount,
        issue: inference.conflicts.length
          ? {
              code: 'CONFLICTING_PREFERENCE_POSTURE',
              severity: 'WARN',
              message: 'Historical posture evidence conflicts with current trusted PreferenceProfile values.',
              meta: {
                conflicts: inference.conflicts,
              },
            }
          : undefined,
      };
    }

    if (existing && !hasProfileFieldChanges(existing, nextPayload)) {
      return {
        created: false,
        updated: false,
        skippedTrusted: false,
        inferred: true,
        confidence: inference.confidence,
        sourceEvidenceCount: inference.evidenceCount,
      };
    }

    if (dryRun) {
      return {
        created: !existing,
        updated: Boolean(existing),
        skippedTrusted: false,
        inferred: true,
        confidence: inference.confidence,
        sourceEvidenceCount: inference.evidenceCount,
      };
    }

    if (existing) {
      await prisma.preferenceProfile.update({
        where: { id: existing.id },
        data: nextPayload,
      });
      return {
        created: false,
        updated: true,
        skippedTrusted: false,
        inferred: true,
        confidence: inference.confidence,
        sourceEvidenceCount: inference.evidenceCount,
      };
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        homeownerProfileId: true,
      },
    });

    if (!property?.homeownerProfileId) {
      return {
        created: false,
        updated: false,
        skippedTrusted: false,
        inferred: true,
        confidence: inference.confidence,
        sourceEvidenceCount: inference.evidenceCount,
        issue: {
          code: 'MISSING_HOMEOWNER_PROFILE',
          severity: 'ERROR',
          message: 'Property has no homeownerProfileId; cannot create PreferenceProfile.',
        },
      };
    }

    await prisma.preferenceProfile.create({
      data: {
        propertyId,
        homeownerProfileId: property.homeownerProfileId,
        riskTolerance: (nextPayload.riskTolerance as PreferenceRiskTolerance | undefined) ?? null,
        deductiblePreferenceStyle:
          (nextPayload.deductiblePreferenceStyle as DeductiblePreferenceStyle | undefined) ?? null,
        cashBufferPosture: (nextPayload.cashBufferPosture as CashBufferPosture | undefined) ?? null,
        bundlingPreference: (nextPayload.bundlingPreference as BundlingPreference | undefined) ?? null,
        confidence: nextPayload.confidence ?? null,
        source: (nextPayload.source as PreferenceProfileSource | undefined) ?? PreferenceProfileSource.INFERRED,
        notesJson: (nextPayload.notesJson as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });

    return {
      created: true,
      updated: false,
      skippedTrusted: false,
      inferred: true,
      confidence: inference.confidence,
      sourceEvidenceCount: inference.evidenceCount,
    };
  }

  private async collectAssumptionCandidates(propertyId: string): Promise<AssumptionCandidate[]> {
    const [
      coverageRows,
      riskRows,
      doNothingRows,
      doNothingScenarios,
      coverageScenarios,
      timelineRows,
      toolOverrides,
    ] = await Promise.all([
      prisma.coverageAnalysis.findMany({
        where: { propertyId },
        select: {
          id: true,
          assumptionSetId: true,
          inputsSnapshot: true,
          computedAt: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 300,
      }),
      prisma.riskPremiumOptimizationAnalysis.findMany({
        where: { propertyId },
        select: {
          id: true,
          assumptionSetId: true,
          inputsSnapshot: true,
          computedAt: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 300,
      }),
      prisma.doNothingSimulationRun.findMany({
        where: { propertyId },
        select: {
          id: true,
          scenarioId: true,
          assumptionSetId: true,
          inputsSnapshot: true,
          computedAt: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 300,
      }),
      prisma.doNothingScenario.findMany({
        where: { propertyId },
        select: {
          id: true,
          inputOverrides: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.coverageScenario.findMany({
        where: { propertyId },
        select: {
          id: true,
          inputOverrides: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.homeCapitalTimelineAnalysis.findMany({
        where: { propertyId },
        select: {
          id: true,
          inputsSnapshot: true,
          computedAt: true,
        },
        orderBy: [{ computedAt: 'desc' }],
        take: 80,
      }),
      prisma.toolOverride.findMany({
        where: {
          propertyId,
          toolKey: {
            in: ['SELL_HOLD_RENT', 'BREAK_EVEN', 'HOME_CAPITAL_TIMELINE'],
          },
        },
        select: {
          toolKey: true,
          key: true,
          value: true,
        },
      }),
    ]);

    const candidates: AssumptionCandidate[] = [];

    for (const row of coverageRows) {
      if (row.assumptionSetId) continue;
      const candidate = extractCoverageAssumptionCandidate(row);
      if (candidate) candidates.push(candidate);
    }

    for (const row of riskRows) {
      if (row.assumptionSetId) continue;
      const candidate = extractRiskAssumptionCandidate(row);
      if (candidate) candidates.push(candidate);
    }

    for (const row of doNothingRows) {
      if (row.assumptionSetId) continue;
      const candidate = extractDoNothingAssumptionCandidate(row);
      if (candidate) candidates.push(candidate);
    }

    for (const row of doNothingScenarios) {
      const overrides = normalizeAssumptionPayload(safeObject(row.inputOverrides));
      if (Object.keys(overrides).length === 0) continue;
      candidates.push({
        toolKey: 'DO_NOTHING_SIMULATOR',
        sourceModel: 'DoNothingScenario',
        sourceId: row.id,
        capturedAt: row.updatedAt,
        canLinkRun: false,
        scenarioKey: row.id,
        overrides,
      });
    }

    for (const row of coverageScenarios) {
      const overrides = normalizeAssumptionPayload(safeObject(row.inputOverrides));
      if (Object.keys(overrides).length === 0) continue;
      candidates.push({
        toolKey: 'COVERAGE_ANALYSIS',
        sourceModel: 'CoverageScenario',
        sourceId: row.id,
        capturedAt: row.updatedAt,
        canLinkRun: false,
        scenarioKey: row.id,
        overrides,
      });
    }

    for (const row of timelineRows) {
      const candidate = extractHomeCapitalAssumptionCandidate(row);
      if (candidate) candidates.push(candidate);
    }

    const groupedToolOverrides = new Map<string, Array<{ key: string; value: number }>>();
    for (const row of toolOverrides) {
      if (!groupedToolOverrides.has(row.toolKey)) {
        groupedToolOverrides.set(row.toolKey, []);
      }
      groupedToolOverrides.get(row.toolKey)?.push({ key: row.key, value: row.value });
    }

    for (const [toolKey, entries] of groupedToolOverrides.entries()) {
      const candidate = extractToolOverrideAssumptionCandidate(propertyId, toolKey, entries);
      if (candidate) candidates.push(candidate);
    }

    return candidates;
  }

  private async backfillAssumptionSets(
    propertyId: string,
    dryRun: boolean
  ): Promise<AssumptionBackfillResult> {
    const preferenceProfile = await prisma.preferenceProfile.findFirst({
      where: { propertyId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });

    const candidates = await this.collectAssumptionCandidates(propertyId);

    const result: AssumptionBackfillResult = {
      created: 0,
      reusedExisting: 0,
      linkedCoverageAnalyses: 0,
      linkedRiskAnalyses: 0,
      linkedDoNothingRuns: 0,
      linkedSkippedAlreadyPresent: 0,
      skippedEmptyCandidates: 0,
    };

    if (candidates.length === 0) {
      return result;
    }

    const existingSets = await prisma.assumptionSet.findMany({
      where: { propertyId },
      select: {
        id: true,
        toolKey: true,
        assumptionsJson: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const setIdByToolAndHash = new Map<string, string>();
    for (const row of existingSets) {
      const root = safeObject(row.assumptionsJson);
      const overrides =
        root.overrides && typeof root.overrides === 'object' && !Array.isArray(root.overrides)
          ? normalizeAssumptionPayload(root.overrides as Record<string, unknown>)
          : normalizeAssumptionPayload(root);
      if (Object.keys(overrides).length === 0) continue;
      const hash = hashAssumptionPayload(overrides);
      setIdByToolAndHash.set(`${row.toolKey}:${hash}`, row.id);
    }

    for (const candidate of candidates) {
      const normalizedOverrides = normalizeAssumptionPayload(candidate.overrides);
      if (Object.keys(normalizedOverrides).length === 0) {
        result.skippedEmptyCandidates += 1;
        continue;
      }

      const hash = hashAssumptionPayload(normalizedOverrides);
      const mapKey = `${candidate.toolKey}:${hash}`;
      let assumptionSetId = setIdByToolAndHash.get(mapKey) ?? null;

      if (!assumptionSetId) {
        if (!dryRun) {
          const created = await prisma.assumptionSet.create({
            data: {
              propertyId,
              toolKey: candidate.toolKey,
              scenarioKey: candidate.scenarioKey ?? null,
              preferenceProfileId: preferenceProfile?.id ?? null,
              assumptionsJson: {
                version: 1,
                domain: 'BACKFILL',
                overrides: normalizedOverrides,
                backfillMeta: {
                  backfillVersion: BACKFILL_VERSION,
                  hash,
                  sourceModel: candidate.sourceModel,
                  sourceId: candidate.sourceId,
                  capturedAt: candidate.capturedAt.toISOString(),
                },
              } as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          assumptionSetId = created.id;
        } else {
          assumptionSetId = `DRY_RUN_${candidate.toolKey}_${hash}`;
        }

        setIdByToolAndHash.set(mapKey, assumptionSetId);
        result.created += 1;
      } else {
        result.reusedExisting += 1;
      }

      if (!candidate.canLinkRun || !candidate.runId || !candidate.runModel || !assumptionSetId) {
        continue;
      }

      if (dryRun) {
        if (candidate.runModel === 'COVERAGE_ANALYSIS') result.linkedCoverageAnalyses += 1;
        if (candidate.runModel === 'RISK_PREMIUM_OPTIMIZER') result.linkedRiskAnalyses += 1;
        if (candidate.runModel === 'DO_NOTHING_SIMULATOR') result.linkedDoNothingRuns += 1;
        continue;
      }

      if (candidate.runModel === 'COVERAGE_ANALYSIS') {
        const updated = await prisma.coverageAnalysis.updateMany({
          where: {
            id: candidate.runId,
            propertyId,
            assumptionSetId: null,
          },
          data: { assumptionSetId },
        });
        if (updated.count > 0) result.linkedCoverageAnalyses += updated.count;
        else result.linkedSkippedAlreadyPresent += 1;
      } else if (candidate.runModel === 'RISK_PREMIUM_OPTIMIZER') {
        const updated = await prisma.riskPremiumOptimizationAnalysis.updateMany({
          where: {
            id: candidate.runId,
            propertyId,
            assumptionSetId: null,
          },
          data: { assumptionSetId },
        });
        if (updated.count > 0) result.linkedRiskAnalyses += updated.count;
        else result.linkedSkippedAlreadyPresent += 1;
      } else if (candidate.runModel === 'DO_NOTHING_SIMULATOR') {
        const updated = await prisma.doNothingSimulationRun.updateMany({
          where: {
            id: candidate.runId,
            propertyId,
            assumptionSetId: null,
          },
          data: { assumptionSetId },
        });
        if (updated.count > 0) result.linkedDoNothingRuns += updated.count;
        else result.linkedSkippedAlreadyPresent += 1;
      }
    }

    return result;
  }

  private async backfillSignals(propertyId: string, dryRun: boolean): Promise<SignalBackfillResult> {
    const result: SignalBackfillResult = {
      published: 0,
      refreshed: 0,
      skipped: 0,
      keysTouched: [],
    };

    const touch = (key: SharedSignalKey) => {
      if (!result.keysTouched.includes(key)) {
        result.keysTouched.push(key);
      }
    };

    const existingLatest = await signalService.getLatestSignalsByKey(propertyId, REQUIRED_SIGNAL_KEYS, {
      freshOnly: false,
    });

    const latestCoverageAnalysis = await prisma.coverageAnalysis.findFirst({
      where: { propertyId },
      select: {
        id: true,
        confidence: true,
        overallVerdict: true,
      },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const latestAppliedSavings = await prisma.homeSavingsOpportunity.findFirst({
      where: {
        propertyId,
        status: {
          in: ['APPLIED', 'SWITCHED'],
        },
      },
      select: {
        id: true,
        status: true,
        estimatedMonthlySavings: true,
        estimatedAnnualSavings: true,
        currency: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { generatedAt: 'desc' }],
    });

    const latestRadarMatch = await prisma.propertyRadarMatch.findFirst({
      where: {
        propertyId,
        isVisible: true,
      },
      select: {
        radarEvent: {
          select: {
            id: true,
            eventType: true,
            severity: true,
          },
        },
        impactLevel: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const gaps = await detectCoverageGaps(propertyId);

    if (!dryRun) {
      const previous = existingLatest.MAINT_ADHERENCE;
      const signal = await signalService.publishMaintenanceAdherenceSignal({
        propertyId,
        sourceId: `backfill:${propertyId}:maint_adherence`,
      });
      touch('MAINT_ADHERENCE');
      if (previous?.id === signal.id) result.refreshed += 1;
      else result.published += 1;

      const coverageSignal = await signalService.publishCoverageGapSignal({
        propertyId,
        coverageAnalysisId: latestCoverageAnalysis?.id ?? `backfill:${propertyId}:coverage_gap`,
        gapCount: gaps.length,
        confidence:
          latestCoverageAnalysis?.confidence === 'HIGH'
            ? 0.9
            : latestCoverageAnalysis?.confidence === 'MEDIUM'
              ? 0.7
              : 0.5,
        verdict: latestCoverageAnalysis?.overallVerdict ?? (gaps.length > 0 ? 'SITUATIONAL' : 'NOT_WORTH_IT'),
      });
      touch('COVERAGE_GAP');
      if (existingLatest.COVERAGE_GAP?.id === coverageSignal.id) result.refreshed += 1;
      else result.published += 1;

      if (latestAppliedSavings) {
        const savingsSignal = await signalService.publishSavingsRealizationSignal({
          propertyId,
          opportunityId: latestAppliedSavings.id,
          status: latestAppliedSavings.status,
          estimatedMonthlySavings: asFinite(latestAppliedSavings.estimatedMonthlySavings) ?? null,
          estimatedAnnualSavings: asFinite(latestAppliedSavings.estimatedAnnualSavings) ?? null,
          currency: latestAppliedSavings.currency,
        });
        touch('SAVINGS_REALIZATION');
        if (existingLatest.SAVINGS_REALIZATION?.id === savingsSignal.id) result.refreshed += 1;
        else result.published += 1;
      } else {
        result.skipped += 1;
      }

      if (latestRadarMatch?.radarEvent) {
        await signalService.publishRadarEventSignals({
          propertyId,
          radarEventId: latestRadarMatch.radarEvent.id,
          eventType: latestRadarMatch.radarEvent.eventType,
          severity: latestRadarMatch.radarEvent.severity,
          impactLevel: latestRadarMatch.impactLevel,
          capturedAt: latestRadarMatch.updatedAt,
        });
      }
    } else {
      result.published += 2;
      touch('MAINT_ADHERENCE');
      touch('COVERAGE_GAP');
      if (latestAppliedSavings) {
        result.published += 1;
        touch('SAVINGS_REALIZATION');
      } else {
        result.skipped += 1;
      }
    }

    return result;
  }

  async evaluateConsistencyForProperty(propertyId: string): Promise<SharedDataConsistencyIssue[]> {
    const issues: SharedDataConsistencyIssue[] = [];

    const [latestProfile, evidence] = await Promise.all([
      prisma.preferenceProfile.findFirst({
        where: { propertyId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.collectPreferenceEvidence(propertyId),
    ]);

    const inference = summarizePreferenceInference(evidence);
    if (latestProfile && inference.inferred) {
      const conflicts: string[] = [];
      if (inference.riskTolerance && latestProfile.riskTolerance && inference.riskTolerance !== latestProfile.riskTolerance) {
        conflicts.push('riskTolerance');
      }
      if (
        inference.deductiblePreferenceStyle &&
        latestProfile.deductiblePreferenceStyle &&
        inference.deductiblePreferenceStyle !== latestProfile.deductiblePreferenceStyle
      ) {
        conflicts.push('deductiblePreferenceStyle');
      }
      if (
        inference.cashBufferPosture &&
        latestProfile.cashBufferPosture &&
        inference.cashBufferPosture !== latestProfile.cashBufferPosture
      ) {
        conflicts.push('cashBufferPosture');
      }
      if (
        inference.bundlingPreference &&
        latestProfile.bundlingPreference &&
        inference.bundlingPreference !== latestProfile.bundlingPreference
      ) {
        conflicts.push('bundlingPreference');
      }

      if (conflicts.length > 0) {
        issues.push({
          propertyId,
          code: 'CONFLICTING_PREFERENCE_POSTURE',
          severity: 'WARN',
          message: 'Tool-derived posture evidence conflicts with stored PreferenceProfile values.',
          meta: {
            conflicts,
            storedSource: latestProfile.source,
          },
        });
      }
    }

    const assumptionSets = await prisma.assumptionSet.findMany({
      where: { propertyId },
      select: {
        id: true,
        toolKey: true,
        assumptionsJson: true,
      },
    });

    const duplicateBuckets = new Map<string, string[]>();
    for (const row of assumptionSets) {
      const root = safeObject(row.assumptionsJson);
      const candidate =
        root.overrides && typeof root.overrides === 'object' && !Array.isArray(root.overrides)
          ? (root.overrides as Record<string, unknown>)
          : root;
      const hash = hashAssumptionPayload(candidate);
      const key = `${row.toolKey}:${hash}`;
      const bucket = duplicateBuckets.get(key) ?? [];
      bucket.push(row.id);
      duplicateBuckets.set(key, bucket);
    }

    for (const [key, ids] of duplicateBuckets.entries()) {
      if (ids.length <= 1) continue;
      const [toolKey, hash] = key.split(':');
      issues.push({
        propertyId,
        code: 'ASSUMPTION_SET_DUPLICATION',
        severity: 'WARN',
        message: `Found ${ids.length} AssumptionSet records with effectively identical assumptions for tool ${toolKey}.`,
        meta: {
          toolKey,
          hash,
          assumptionSetIds: ids,
        },
      });
    }

    const signalChecks = await this.evaluateSignalConsistency(propertyId);
    issues.push(...signalChecks.stale, ...signalChecks.missing, ...signalChecks.broken);

    const [
      brokenCoverageRefs,
      brokenRiskRefs,
      brokenDoNothingRefs,
      brokenHomeScoreRefs,
    ] = await Promise.all([
      prisma.coverageAnalysis.count({
        where: {
          propertyId,
          assumptionSetId: { not: null },
          assumptionSet: { is: null },
        },
      }),
      prisma.riskPremiumOptimizationAnalysis.count({
        where: {
          propertyId,
          assumptionSetId: { not: null },
          assumptionSet: { is: null },
        },
      }),
      prisma.doNothingSimulationRun.count({
        where: {
          propertyId,
          assumptionSetId: { not: null },
          assumptionSet: { is: null },
        },
      }),
      prisma.homeScoreReport.count({
        where: {
          propertyId,
          preferenceProfileId: { not: null },
          preferenceProfile: { is: null },
        },
      }),
    ]);

    const brokenRefCount =
      brokenCoverageRefs + brokenRiskRefs + brokenDoNothingRefs + brokenHomeScoreRefs;

    if (brokenRefCount > 0) {
      issues.push({
        propertyId,
        code: 'BROKEN_REFERENCE',
        severity: 'ERROR',
        message: 'Detected shared-model foreign key references that no longer resolve.',
        meta: {
          coverageAnalyses: brokenCoverageRefs,
          riskAnalyses: brokenRiskRefs,
          doNothingRuns: brokenDoNothingRefs,
          homeScoreReports: brokenHomeScoreRefs,
        },
      });
    }

    return issues;
  }

  private async evaluateSignalConsistency(propertyId: string): Promise<SignalCheckResult> {
    const now = new Date();
    const [signals, latestSignals, latestCoverageGapState, maintenanceTaskCount, realizedSavingsCount] =
      await Promise.all([
        prisma.signal.findMany({
          where: { propertyId },
          orderBy: [{ capturedAt: 'desc' }],
          take: 300,
          select: {
            id: true,
            signalKey: true,
            sourceModel: true,
            sourceId: true,
            capturedAt: true,
            validUntil: true,
            version: true,
          },
        }),
        signalService.getLatestSignalsByKey(propertyId, REQUIRED_SIGNAL_KEYS, { freshOnly: false }),
        detectCoverageGaps(propertyId),
        prisma.propertyMaintenanceTask.count({
          where: { propertyId },
        }),
        prisma.homeSavingsOpportunity.count({
          where: {
            propertyId,
            status: { in: ['APPLIED', 'SWITCHED'] },
          },
        }),
      ]);

    const stale: SharedDataConsistencyIssue[] = [];
    const broken: SharedDataConsistencyIssue[] = [];
    const missing: SharedDataConsistencyIssue[] = [];

    for (const signal of signals) {
      if (signal.validUntil && signal.validUntil < now) {
        stale.push({
          propertyId,
          code: 'STALE_SIGNAL',
          severity: 'WARN',
          message: `Signal ${signal.signalKey} is stale (validUntil ${signal.validUntil.toISOString()}).`,
          meta: {
            signalId: signal.id,
            signalKey: signal.signalKey,
            sourceModel: signal.sourceModel,
            sourceId: signal.sourceId,
            capturedAt: signal.capturedAt.toISOString(),
            validUntil: signal.validUntil.toISOString(),
          },
        });
      }

      if (signal.sourceModel === 'CoverageAnalysisService') {
        const exists = await prisma.coverageAnalysis.findUnique({
          where: { id: signal.sourceId },
          select: { id: true },
        });
        if (!exists && !signal.sourceId.startsWith('backfill:')) {
          broken.push({
            propertyId,
            code: 'BROKEN_REFERENCE',
            severity: 'WARN',
            message: `Coverage signal ${signal.id} points to missing coverage analysis source.`,
            meta: {
              signalId: signal.id,
              sourceId: signal.sourceId,
            },
          });
        }
      }

      if (signal.sourceModel === 'HomeSavingsService') {
        const exists = await prisma.homeSavingsOpportunity.findUnique({
          where: { id: signal.sourceId },
          select: { id: true },
        });
        if (!exists) {
          broken.push({
            propertyId,
            code: 'BROKEN_REFERENCE',
            severity: 'WARN',
            message: `Savings signal ${signal.id} points to missing opportunity source.`,
            meta: {
              signalId: signal.id,
              sourceId: signal.sourceId,
            },
          });
        }
      }
    }

    const isFresh = (signal: { validUntil: string | null } | null | undefined): boolean => {
      if (!signal) return false;
      if (!signal.validUntil) return true;
      const parsed = maybeDate(signal.validUntil);
      return parsed ? parsed > now : false;
    };

    if (latestCoverageGapState.length > 0 && !isFresh(latestSignals.COVERAGE_GAP ?? null)) {
      missing.push({
        propertyId,
        code: 'MISSING_SIGNAL_FOR_STATE',
        severity: 'WARN',
        message: 'Coverage gaps are present but no fresh COVERAGE_GAP signal is available.',
        meta: {
          gapCount: latestCoverageGapState.length,
        },
      });
    }

    if (maintenanceTaskCount > 0 && !isFresh(latestSignals.MAINT_ADHERENCE ?? null)) {
      missing.push({
        propertyId,
        code: 'MISSING_SIGNAL_FOR_STATE',
        severity: 'INFO',
        message: 'Property has maintenance tasks but no fresh MAINT_ADHERENCE signal.',
        meta: {
          maintenanceTaskCount,
        },
      });
    }

    if (realizedSavingsCount > 0 && !isFresh(latestSignals.SAVINGS_REALIZATION ?? null)) {
      missing.push({
        propertyId,
        code: 'MISSING_SIGNAL_FOR_STATE',
        severity: 'WARN',
        message: 'Savings realization events exist but no fresh SAVINGS_REALIZATION signal is available.',
        meta: {
          realizedSavingsCount,
        },
      });
    }

    return {
      stale,
      missing,
      broken,
    };
  }

  async getPropertyReadiness(propertyId: string): Promise<PropertySharedDataReadiness> {
    const [profile, latestSignals, staleSignalCount, analysisCounts] = await Promise.all([
      prisma.preferenceProfile.findFirst({
        where: { propertyId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      signalService.getLatestSignalsByKey(propertyId, REQUIRED_SIGNAL_KEYS, {
        freshOnly: false,
      }),
      prisma.signal.count({
        where: {
          propertyId,
          validUntil: { lt: new Date() },
        },
      }),
      Promise.all([
        prisma.coverageAnalysis.count({ where: { propertyId } }),
        prisma.coverageAnalysis.count({ where: { propertyId, assumptionSetId: { not: null } } }),
        prisma.riskPremiumOptimizationAnalysis.count({ where: { propertyId } }),
        prisma.riskPremiumOptimizationAnalysis.count({
          where: { propertyId, assumptionSetId: { not: null } },
        }),
        prisma.doNothingSimulationRun.count({ where: { propertyId } }),
        prisma.doNothingSimulationRun.count({ where: { propertyId, assumptionSetId: { not: null } } }),
      ]),
    ]);

    const [
      coverageTotal,
      coverageLinked,
      riskTotal,
      riskLinked,
      doNothingTotal,
      doNothingLinked,
    ] = analysisCounts;

    const totalAnalysesNeedingAssumptionLinks = coverageTotal + riskTotal + doNothingTotal;
    const linkedAnalysesCount = coverageLinked + riskLinked + doNothingLinked;
    const assumptionLinkRatio =
      totalAnalysesNeedingAssumptionLinks > 0
        ? Number((linkedAnalysesCount / totalAnalysesNeedingAssumptionLinks).toFixed(4))
        : 1;

    const freshSignals: SharedSignalKey[] = [];
    const missingOrStale: SharedSignalKey[] = [];

    for (const key of REQUIRED_SIGNAL_KEYS) {
      const signal = latestSignals[key] ?? null;
      if (!signal) {
        missingOrStale.push(key);
        continue;
      }

      const validUntil = maybeDate(signal.validUntil);
      const fresh = !validUntil || validUntil > new Date();
      if (fresh) freshSignals.push(key);
      else missingOrStale.push(key);
    }

    const signalCoverageRatio = Number((freshSignals.length / REQUIRED_SIGNAL_KEYS.length).toFixed(4));
    const preferenceCompleteness = profileCompletenessRatio(profile);

    const legacyDependencyLevel = classifyLegacyDependencyLevel({
      preferenceCompletenessRatio: preferenceCompleteness,
      assumptionLinkRatio,
      signalCoverageRatio,
    });

    const status = classifyReadinessStatus({
      preferenceCompletenessRatio: preferenceCompleteness,
      assumptionLinkRatio,
      signalCoverageRatio,
      staleSignalCount,
    });

    return {
      propertyId,
      status,
      preferenceCompletenessRatio: preferenceCompleteness,
      assumptionLinkRatio,
      signalCoverageRatio,
      staleSignalCount,
      legacyDependencyLevel,
      details: {
        hasPreferenceProfile: Boolean(profile),
        requiredSignalsFresh: freshSignals,
        requiredSignalsMissingOrStale: missingOrStale,
        totalAnalysesNeedingAssumptionLinks,
        linkedAnalysesCount,
      },
    };
  }

  async getReadinessReport(options: {
    propertyId?: string;
    limit?: number;
    startAfterPropertyId?: string;
  }): Promise<SharedDataReadinessReport> {
    const targets = await listTargetProperties(options);
    const readinessRows = await Promise.all(targets.map((property) => this.getPropertyReadiness(property.id)));

    const summary = {
      ready: readinessRows.filter((row) => row.status === 'READY').length,
      partial: readinessRows.filter((row) => row.status === 'PARTIAL').length,
      legacyHeavy: readinessRows.filter((row) => row.status === 'LEGACY_HEAVY').length,
      avgPreferenceCompletenessRatio:
        readinessRows.length > 0
          ? Number(
              (
                readinessRows.reduce((sum, row) => sum + row.preferenceCompletenessRatio, 0) /
                readinessRows.length
              ).toFixed(4)
            )
          : 0,
      avgAssumptionLinkRatio:
        readinessRows.length > 0
          ? Number(
              (
                readinessRows.reduce((sum, row) => sum + row.assumptionLinkRatio, 0) / readinessRows.length
              ).toFixed(4)
            )
          : 0,
      avgSignalCoverageRatio:
        readinessRows.length > 0
          ? Number(
              (
                readinessRows.reduce((sum, row) => sum + row.signalCoverageRatio, 0) / readinessRows.length
              ).toFixed(4)
            )
          : 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      propertiesEvaluated: readinessRows.length,
      summary,
      properties: readinessRows,
    };
  }

  async getConsistencyReport(options: {
    propertyId?: string;
    limit?: number;
    startAfterPropertyId?: string;
  }): Promise<SharedDataConsistencyReport> {
    const targets = await listTargetProperties(options);
    const issuesNested = await Promise.all(
      targets.map((property) => this.evaluateConsistencyForProperty(property.id))
    );
    const issues = issuesNested.flat();

    return {
      generatedAt: new Date().toISOString(),
      propertiesEvaluated: targets.length,
      issueCount: issues.length,
      issues,
    };
  }

  async runBackfill(options: SharedDataBackfillRunOptions = {}): Promise<SharedDataBackfillSummary> {
    const startedAt = new Date();
    const dryRun = options.dryRun ?? false;

    const targets = await listTargetProperties({
      propertyId: options.propertyId,
      limit: options.limit,
      startAfterPropertyId: options.startAfterPropertyId,
    });

    const summary: SharedDataBackfillSummary = {
      dryRun,
      processedProperties: 0,
      skippedProperties: 0,
      erroredProperties: 0,
      totalPropertiesConsidered: targets.length,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      aggregates: {
        preferencesCreated: 0,
        preferencesUpdated: 0,
        assumptionSetsCreated: 0,
        assumptionSetsReused: 0,
        linkedCoverageAnalyses: 0,
        linkedRiskAnalyses: 0,
        linkedDoNothingRuns: 0,
        signalsPublishedOrRefreshed: 0,
        warnings: 0,
        errors: 0,
      },
      properties: [],
    };

    for (const property of targets) {
      const propertySummary: PropertyBackfillSummary = {
        propertyId: property.id,
        preference: {
          created: false,
          updated: false,
          skippedTrusted: false,
          inferred: false,
          confidence: null,
          sourceEvidenceCount: 0,
        },
        assumptions: {
          created: 0,
          reusedExisting: 0,
          linkedCoverageAnalyses: 0,
          linkedRiskAnalyses: 0,
          linkedDoNothingRuns: 0,
          linkedSkippedAlreadyPresent: 0,
          skippedEmptyCandidates: 0,
        },
        signals: {
          published: 0,
          refreshed: 0,
          skipped: 0,
          keysTouched: [],
        },
        issues: [],
      };

      try {
        if (options.includePreference !== false) {
          const preferenceResult = await this.backfillPreferenceProfile(property.id, dryRun);
          propertySummary.preference = {
            created: preferenceResult.created,
            updated: preferenceResult.updated,
            skippedTrusted: preferenceResult.skippedTrusted,
            inferred: preferenceResult.inferred,
            confidence: preferenceResult.confidence,
            sourceEvidenceCount: preferenceResult.sourceEvidenceCount,
          };

          if (preferenceResult.issue) {
            pushIssue(propertySummary, preferenceResult.issue, summary);
          }

          if (preferenceResult.created) summary.aggregates.preferencesCreated += 1;
          if (preferenceResult.updated) summary.aggregates.preferencesUpdated += 1;
        }

        if (options.includeAssumptions !== false) {
          const assumptionResult = await this.backfillAssumptionSets(property.id, dryRun);
          mergeCandidateStats(propertySummary, assumptionResult);

          summary.aggregates.assumptionSetsCreated += assumptionResult.created;
          summary.aggregates.assumptionSetsReused += assumptionResult.reusedExisting;
          summary.aggregates.linkedCoverageAnalyses += assumptionResult.linkedCoverageAnalyses;
          summary.aggregates.linkedRiskAnalyses += assumptionResult.linkedRiskAnalyses;
          summary.aggregates.linkedDoNothingRuns += assumptionResult.linkedDoNothingRuns;
        }

        if (options.includeSignals !== false) {
          const signalResult = await this.backfillSignals(property.id, dryRun);
          propertySummary.signals = signalResult;
          summary.aggregates.signalsPublishedOrRefreshed +=
            signalResult.published + signalResult.refreshed;
        }

        const hasMeaningfulChanges =
          propertySummary.preference.created ||
          propertySummary.preference.updated ||
          propertySummary.assumptions.created > 0 ||
          propertySummary.assumptions.linkedCoverageAnalyses > 0 ||
          propertySummary.assumptions.linkedRiskAnalyses > 0 ||
          propertySummary.assumptions.linkedDoNothingRuns > 0 ||
          propertySummary.signals.published > 0 ||
          propertySummary.signals.refreshed > 0;

        if (!hasMeaningfulChanges) {
          summary.skippedProperties += 1;
        } else {
          summary.processedProperties += 1;
        }

        summary.properties.push(propertySummary);
      } catch (error: any) {
        summary.erroredProperties += 1;
        summary.aggregates.errors += 1;
        pushIssue(
          propertySummary,
          {
            code: 'PROPERTY_BACKFILL_FAILED',
            severity: 'ERROR',
            message: error?.message || 'Unknown property backfill failure',
          },
          summary
        );
        summary.properties.push(propertySummary);
      }
    }

    summary.finishedAt = new Date().toISOString();
    return summary;
  }
}

export const sharedDataBackfillService = new SharedDataBackfillService();
