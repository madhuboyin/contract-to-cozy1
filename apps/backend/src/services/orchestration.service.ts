// apps/backend/src/services/orchestration.service.ts

/**
 * PHASE 2 INTEGRATION (Step 2.3)
 * ===============================
 * 
 * Orchestration Service now integrates with segment-specific task services:
 * - HOME_BUYER → HomeBuyerTaskService
 * - EXISTING_OWNER → PropertyMaintenanceTaskService
 * 
 * Integration Point:
 * - Action Center "Add to Checklist" → createTaskFromOrchestration() helper
 * - Backend routing happens automatically in orchestrationIntegration.service
 * 
 * Architecture:
 * 1. This service READS risk reports and checklist items
 * 2. Presents them as unified "orchestrated actions"
 * 3. When user clicks "Add to Checklist", calls createTaskFromOrchestration()
 * 4. That function routes to correct service based on user segment
 */

import { prisma } from '../lib/prisma';
import { ServiceCategory, BookingStatus, Prisma, SignalSourceType, SignalTriggerType } from '@prisma/client';
import { OrchestrationSuppressionService, SuppressionSource } from './orchestrationSuppression.service';
import { computeActionKey } from './orchestrationActionKey';
import { getPropertySnoozes, ActiveSnooze } from './orchestrationSnooze.service';
import { detectCoverageGaps } from './coverageGap.service';
import { AssumptionSetService } from './assumptionSet.service';
import { PreferenceProfileService } from './preferenceProfile.service';
import { SharedSignalKey, SignalDTO, signalService } from './signal.service';
import {
  DecisionCandidate,
  DecisionEngineResult,
  DecisionRecommendation,
  DecisionTargetTool,
  runDecisionEngine,
} from './decisionEngine.service';


// PHASE 2.3 INTEGRATION
import { createTaskFromActionCenter } from './orchestrationIntegration.service';
import { logger } from '../lib/logger';


type DerivedFrom = {
  riskAssessment: boolean;
  checklist: boolean;
};

export type SuppressionReason =
  | 'BOOKING_EXISTS'
  | 'COVERED'
  | 'NOT_ACTIONABLE'
  | 'CHECKLIST_TRACKED'
  | 'USER_MARKED_COMPLETE'
  | 'USER_UNMARKED_COMPLETE'
  | 'UNKNOWN';

  type SuppressionReasonEntry = {
    reason: SuppressionReason;
    message: string;
    relatedId?: string | null;
    relatedType?: 'BOOKING' | 'WARRANTY' | 'INSURANCE' | 'CHECKLIST' | 'MAINTENANCE_TASK' | null;
  };

export type CoverageInfo = {
  hasCoverage: boolean;
  type: 'HOME_WARRANTY' | 'INSURANCE' | 'NONE';
  expiresOn: Date | null;
  sourceId?: string | null;

  // Phase 8 additions (non-breaking)
  confidence?: 'HIGH' | 'PARTIAL' | 'UNKNOWN';
  matchedOn?: 'ASSET' | 'CATEGORY' | 'PROPERTY' | 'NONE';
  explanation?: string;
};

export type DecisionTraceStep = {
  rule: string;
  outcome: 'APPLIED' | 'SKIPPED';
  details?: Record<string, any> | null;
};

export type SignalSourceBadge = {
  sourceType: SignalSourceType;
  triggerType: SignalTriggerType;
  sourceSystem?: string | null;
  summary?: string | null;
  confidence?: number | null; // 0..1
};

export type OrchestratedAction = {
  id: string;
  actionKey: string;
  source: 'RISK' | 'CHECKLIST'
  propertyId: string;

  title: string;
  description?: string | null;

  // Risk-specific
  systemType?: string | null;
  category?: string | null;
  riskLevel?: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | string | null;
  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;
  orchestrationActionId?: string | null;

  // Checklist-specific
  checklistItemId?: string | null;
  status?: string | null;
  nextDueDate?: Date | null;
  isRecurring?: boolean | null;
  serviceCategory?: ServiceCategory | null;

  // Coverage-aware CTA
  coverage?: CoverageInfo;
  confidence?: {
    score: number;
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    explanation: string[];
  };
  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  suppression: {
    suppressed: boolean;
    reasons: SuppressionReasonEntry[];
    suppressionSource?: SuppressionSource;
  };
  hasRelatedChecklistItem?: boolean;

  relatedEntity?: {
    type: 'INVENTORY_ITEM' | 'HOME_ASSET' | 'BOOKING' | 'WARRANTY' | 'INSURANCE' | 'CHECKLIST';
    id: string;
  } | null;

  relatedChecklistItem?: {
    id: string;
    title: string;
    nextDueDate: string | null;
    isRecurring: boolean;
    frequency: string | null;
    status: string;
    lastCompletedDate: string | null;
  };

  snooze?: {
    snoozedAt: string;
    snoozeUntil: string;
    snoozeReason: string | null;
    daysRemaining: number;
  };

  decisionTrace?: {
    steps: DecisionTraceStep[];
  };

  signalSources?: SignalSourceBadge[];
  primarySignalSource?: SignalSourceBadge | null;

  priority: number;
  overdue: boolean;
  createdAt?: Date | null;
};

export type OrchestrationTargetTool = DecisionTargetTool;

export type OrchestrationNextBestMove = {
  title: string;
  detail: string;
  reasonCode:
    | 'ACTION_CENTER'
    | 'COVERAGE_PRESSURE'
    | 'RISK_SPIKE'
    | 'COST_PRESSURE'
    | 'SCENARIO_CONTINUITY'
    | 'DEFAULT';
  sourceActionKey?: string | null;
  signalKey?: SharedSignalKey | null;
  targetTool: OrchestrationTargetTool;
  targetPath: string;
  assumptionSetId?: string | null;
};

export type OrchestrationSignalHighlight = {
  signalKey: SharedSignalKey;
  label: string;
  valueNumber: number | null;
  valueText: string | null;
  capturedAt: string;
  validUntil: string | null;
  isFresh: boolean;
};

export type OrchestrationSharedContext = {
  generatedAt: string;
  activeScenario: {
    assumptionSetId: string;
    toolKey: string;
    scenarioKey: string | null;
    createdAt: string;
  } | null;
  posture: {
    preferenceProfileId: string;
    riskTolerance: string | null;
    deductiblePreferenceStyle: string | null;
    cashBufferPosture: string | null;
    bundlingPreference: string | null;
    updatedAt: string;
  } | null;
  signalHighlights: OrchestrationSignalHighlight[];
  strongestPressure: string | null;
  strongestOpportunity: string | null;
};

export type OrchestrationHandoff = {
  fromTool: OrchestrationTargetTool;
  toTool: OrchestrationTargetTool;
  label: string;
  path: string;
  assumptionSetId?: string | null;
};

export type OrchestrationSummary = {
  propertyId: string;
  pendingActionCount: number;
  derivedFrom: DerivedFrom;

  actions: OrchestratedAction[];
  suppressedActions: OrchestratedAction[];
  snoozedActions: OrchestratedAction[];

  counts: {
    riskActions: number;
    checklistActions: number;
    suppressedActions: number;
    snoozedActions: number;
  };
  nextBestMove?: OrchestrationNextBestMove | null;
  sharedContext?: OrchestrationSharedContext | null;
  handoffs?: OrchestrationHandoff[];
  decisionEngine?: {
    recommendations: Array<{
      id: string;
      title: string;
      detail: string;
      source: string;
      targetTool: string;
      targetPath: string;
      score: number;
      priorityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
      confidence: number;
      freshness: number;
      reasonCode:
        | 'ACTION_CENTER'
        | 'COVERAGE_PRESSURE'
        | 'RISK_SPIKE'
        | 'COST_PRESSURE'
        | 'SCENARIO_CONTINUITY'
        | 'DEFAULT';
      sourceActionKey?: string | null;
      signalKey?: SharedSignalKey | null;
      trace: {
        whyNow: string[];
        contributedSignals: string[];
        postureInputs: string[];
        assumptionInputs: string[];
        conflictsResolved: string[];
        suppressionsConsidered: string[];
      };
    }>;
    suppressed: Array<{
      candidateId: string;
      title: string;
      source: string;
      reason: string;
      detail: string;
    }>;
    diagnostics: {
      generatedAt: string;
      evaluatedCount: number;
      surfacedCount: number;
      suppressedCount: number;
      duplicateMergeCount: number;
      conflictResolutionCount: number;
      staleInputDecisions: number;
      lowConfidenceRecommendationCount: number;
      topDecisionCategories: Record<string, number>;
      suppressedByReason: Record<string, number>;
      priorityBuckets: {
        high: number;
        medium: number;
        low: number;
      };
    };
  } | null;
};

export interface CompletionCreateInput {
  completedAt: string;
  cost?: number | null;
  didItMyself?: boolean;
  serviceProviderName?: string | null;
  serviceProviderRating?: number | null;
  notes?: string | null;
  photoIds?: string[];
}

export interface CompletionUpdateInput extends Partial<CompletionCreateInput> {}

export interface CompletionResponse {
  id: string;
  actionKey: string;
  completedAt: string;
  cost: number | null;
  didItMyself: boolean;
  serviceProviderName: string | null;
  serviceProviderRating: number | null;
  notes: string | null;
  photoCount: number;
  photos: CompletionPhotoResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CompletionPhotoResponse {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName: string;
  fileSize: number;
  order: number;
}

const ACTIVE_TASK_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'NEEDS_REVIEW',
  'OVERDUE',
] as const;

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'DISPUTED',
];

const preferenceProfileService = new PreferenceProfileService();
const assumptionSetService = new AssumptionSetService();

const SIGNAL_LABELS: Record<SharedSignalKey, string> = {
  MAINT_ADHERENCE: 'Maintenance adherence',
  COVERAGE_GAP: 'Coverage gap',
  SAVINGS_REALIZATION: 'Savings realization',
  RISK_SPIKE: 'Risk spike',
  COST_ANOMALY: 'Cost anomaly',
  RISK_ACCUMULATION: 'Risk accumulation',
  SYSTEM_DEGRADATION: 'System degradation',
  COST_PRESSURE_PATTERN: 'Cost pressure pattern',
  FINANCIAL_DISCIPLINE: 'Financial discipline',
};

const ORCHESTRATION_SIGNAL_KEYS: SharedSignalKey[] = [
  'COVERAGE_GAP',
  'MAINT_ADHERENCE',
  'SAVINGS_REALIZATION',
  'RISK_SPIKE',
  'COST_ANOMALY',
];

function appendQueryParams(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  if (!qs) return path;
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`;
}

function buildToolPath(params: {
  propertyId: string;
  tool: OrchestrationTargetTool;
  assumptionSetId?: string | null;
  fromTool?: string;
  launchSurface?: string;
}): string {
  const queryParams = {
    assumptionSetId: params.assumptionSetId ?? undefined,
    fromTool: params.fromTool ?? undefined,
    launchSurface: params.launchSurface ?? undefined,
  };

  switch (params.tool) {
    case 'coverage-intelligence':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/coverage-intelligence`,
        queryParams
      );
    case 'risk-premium-optimizer':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/risk-premium-optimizer`,
        queryParams
      );
    case 'do-nothing':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/do-nothing`,
        queryParams
      );
    case 'sell-hold-rent':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/sell-hold-rent`,
        queryParams
      );
    case 'break-even':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/break-even`,
        queryParams
      );
    case 'capital-timeline':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/capital-timeline`,
        queryParams
      );
    case 'home-event-radar':
      return appendQueryParams('/dashboard/home-event-radar', {
        propertyId: params.propertyId,
        ...queryParams,
      });
    case 'home-risk-replay':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/tools/home-risk-replay`,
        queryParams
      );
    case 'home-timeline':
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/timeline`,
        queryParams
      );
    case 'status-board':
    default:
      return appendQueryParams(
        `/dashboard/properties/${params.propertyId}/status-board`,
        queryParams
      );
  }
}

function mapScenarioToolToHandoff(toolKey: string): {
  from: OrchestrationTargetTool;
  to: OrchestrationTargetTool;
} | null {
  switch (toolKey) {
    case 'COVERAGE_ANALYSIS':
      return { from: 'coverage-intelligence', to: 'risk-premium-optimizer' };
    case 'RISK_PREMIUM_OPTIMIZER':
      return { from: 'risk-premium-optimizer', to: 'do-nothing' };
    case 'DO_NOTHING_SIMULATOR':
      return { from: 'do-nothing', to: 'coverage-intelligence' };
    case 'SELL_HOLD_RENT':
      return { from: 'sell-hold-rent', to: 'break-even' };
    case 'BREAK_EVEN':
      return { from: 'break-even', to: 'capital-timeline' };
    case 'HOME_CAPITAL_TIMELINE':
      return { from: 'capital-timeline', to: 'sell-hold-rent' };
    default:
      return null;
  }
}

function mapActionToTargetTool(action: OrchestratedAction): OrchestrationTargetTool {
  if (action.actionKey.startsWith('COVERAGE_GAP::')) return 'coverage-intelligence';
  if (action.source === 'CHECKLIST') return 'status-board';
  if (action.category?.toUpperCase().includes('INSURANCE')) return 'coverage-intelligence';
  if (action.riskLevel === 'HIGH' || action.riskLevel === 'CRITICAL') return 'risk-premium-optimizer';
  return 'do-nothing';
}

function signalToHighlight(signalKey: SharedSignalKey, signal: SignalDTO | undefined): OrchestrationSignalHighlight | null {
  if (!signal) return null;
  const validUntil = signal.validUntil ? new Date(signal.validUntil) : null;
  const isFresh = validUntil ? validUntil.getTime() > Date.now() : true;
  return {
    signalKey,
    label: SIGNAL_LABELS[signalKey],
    valueNumber: typeof signal.valueNumber === 'number' ? signal.valueNumber : null,
    valueText: typeof signal.valueText === 'string' ? signal.valueText : null,
    capturedAt: signal.capturedAt,
    validUntil: signal.validUntil ?? null,
    isFresh,
  };
}

function computeStrongestPressure(
  actions: OrchestratedAction[],
  signalHighlights: OrchestrationSignalHighlight[]
): string | null {
  const topAction = actions[0];
  if (topAction) {
    if (topAction.actionKey.startsWith('COVERAGE_GAP::')) {
      return `Coverage pressure: ${topAction.title}`;
    }
    if (topAction.riskLevel === 'HIGH' || topAction.riskLevel === 'CRITICAL') {
      return `Risk pressure: ${topAction.title}`;
    }
    return topAction.title;
  }

  const riskSpike = signalHighlights.find((signal) => signal.signalKey === 'RISK_SPIKE');
  if (riskSpike?.valueNumber != null && riskSpike.valueNumber >= 0.55) {
    return 'Recent risk conditions are elevated for this property';
  }

  const costAnomaly = signalHighlights.find((signal) => signal.signalKey === 'COST_ANOMALY');
  if (costAnomaly?.valueNumber != null && costAnomaly.valueNumber >= 0.55) {
    return 'Cost pressure is trending above baseline';
  }

  return null;
}

function computeStrongestOpportunity(signalHighlights: OrchestrationSignalHighlight[]): string | null {
  const savings = signalHighlights.find((signal) => signal.signalKey === 'SAVINGS_REALIZATION');
  if (savings?.valueNumber != null && savings.valueNumber > 0) {
    return `Savings realization signal indicates about $${Math.round(savings.valueNumber).toLocaleString()}/year impact`;
  }

  const maintenance = signalHighlights.find((signal) => signal.signalKey === 'MAINT_ADHERENCE');
  if (maintenance?.valueNumber != null && maintenance.valueNumber >= 0.8) {
    return 'Maintenance adherence is strong, which lowers avoidable risk';
  }

  return null;
}

function buildNextBestMove(params: {
  propertyId: string;
  actions: OrchestratedAction[];
  activeScenario: {
    assumptionSetId: string;
    toolKey: string;
  } | null;
  signalHighlights: OrchestrationSignalHighlight[];
}): OrchestrationNextBestMove {
  const topAction = params.actions[0];
  if (topAction) {
    const targetTool = mapActionToTargetTool(topAction);
    return {
      title: topAction.title,
      detail:
        topAction.description ||
        topAction.cta?.label ||
        'This is currently the highest-priority action across aligned tools.',
      reasonCode: 'ACTION_CENTER',
      sourceActionKey: topAction.actionKey,
      signalKey: topAction.actionKey.startsWith('COVERAGE_GAP::') ? 'COVERAGE_GAP' : null,
      targetTool,
      targetPath: buildToolPath({
        propertyId: params.propertyId,
        tool: targetTool,
        assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
    };
  }

  const coverageGap = params.signalHighlights.find((signal) => signal.signalKey === 'COVERAGE_GAP');
  if (coverageGap?.valueNumber != null && coverageGap.valueNumber > 0) {
    return {
      title: 'Review current coverage gaps',
      detail: 'Coverage Intelligence found open gaps. Review and tighten protection before rerunning downstream tools.',
      reasonCode: 'COVERAGE_PRESSURE',
      signalKey: 'COVERAGE_GAP',
      targetTool: 'coverage-intelligence',
      targetPath: buildToolPath({
        propertyId: params.propertyId,
        tool: 'coverage-intelligence',
        assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
    };
  }

  const riskSpike = params.signalHighlights.find((signal) => signal.signalKey === 'RISK_SPIKE');
  if (riskSpike?.valueNumber != null && riskSpike.valueNumber >= 0.55) {
    return {
      title: 'Replay recent risk conditions',
      detail: 'Home Risk Replay can explain what changed and how current risk pressure developed.',
      reasonCode: 'RISK_SPIKE',
      signalKey: 'RISK_SPIKE',
      targetTool: 'home-risk-replay',
      targetPath: buildToolPath({
        propertyId: params.propertyId,
        tool: 'home-risk-replay',
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
    };
  }

  const costAnomaly = params.signalHighlights.find((signal) => signal.signalKey === 'COST_ANOMALY');
  if (costAnomaly?.valueNumber != null && costAnomaly.valueNumber >= 0.55) {
    return {
      title: 'Re-check break-even assumptions',
      detail: 'Cost pressure shifted. Validate break-even timing with current financial assumptions.',
      reasonCode: 'COST_PRESSURE',
      signalKey: 'COST_ANOMALY',
      targetTool: 'break-even',
      targetPath: buildToolPath({
        propertyId: params.propertyId,
        tool: 'break-even',
        assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      assumptionSetId: params.activeScenario?.assumptionSetId ?? null,
    };
  }

  if (params.activeScenario) {
    const handoff = mapScenarioToolToHandoff(params.activeScenario.toolKey);
    if (handoff) {
      return {
        title: `Continue shared scenario in ${handoff.to.replace(/-/g, ' ')}`,
        detail: 'A reusable assumption set is active. Continue the same scenario in the next aligned tool.',
        reasonCode: 'SCENARIO_CONTINUITY',
        targetTool: handoff.to,
        targetPath: buildToolPath({
          propertyId: params.propertyId,
          tool: handoff.to,
          assumptionSetId: params.activeScenario.assumptionSetId,
          fromTool: handoff.from,
          launchSurface: 'orchestration-summary',
        }),
        assumptionSetId: params.activeScenario.assumptionSetId,
      };
    }
  }

  return {
    title: 'Review current home status',
    detail: 'No urgent orchestration pressure was detected. Review signal-backed status for current priorities.',
    reasonCode: 'DEFAULT',
    targetTool: 'status-board',
    targetPath: buildToolPath({
      propertyId: params.propertyId,
      tool: 'status-board',
      fromTool: 'orchestration-summary',
      launchSurface: 'orchestration-summary',
    }),
  };
}

function buildScenarioHandoffs(params: {
  propertyId: string;
  activeScenario: {
    assumptionSetId: string;
    toolKey: string;
  } | null;
}): OrchestrationHandoff[] {
  if (!params.activeScenario) return [];
  const handoff = mapScenarioToolToHandoff(params.activeScenario.toolKey);
  if (!handoff) return [];

  return [
    {
      fromTool: handoff.from,
      toTool: handoff.to,
      label: `Continue scenario in ${handoff.to.replace(/-/g, ' ')}`,
      path: buildToolPath({
        propertyId: params.propertyId,
        tool: handoff.to,
        assumptionSetId: params.activeScenario.assumptionSetId,
        fromTool: handoff.from,
        launchSurface: 'orchestration-summary',
      }),
      assumptionSetId: params.activeScenario.assumptionSetId,
    },
  ];
}

function normalizeDecisionConfidence(confidence: unknown): number {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    return clamp01(confidence > 1 ? confidence / 100 : confidence);
  }
  if (typeof confidence === 'string') {
    const normalized = confidence.trim().toUpperCase();
    if (normalized === 'HIGH') return 0.82;
    if (normalized === 'MEDIUM') return 0.64;
    if (normalized === 'LOW') return 0.42;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return clamp01(parsed > 1 ? parsed / 100 : parsed);
  }
  return 0.62;
}

function freshnessFromDate(dateLike: unknown): number {
  const date = safeParseDate(dateLike);
  if (!date) return 0.55;
  const ageDays = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.85;
  if (ageDays <= 60) return 0.65;
  return 0.4;
}

function severityToUrgency(value: unknown): number {
  const severity = normalizeUpper(value);
  if (severity === 'CRITICAL') return 96;
  if (severity === 'HIGH') return 82;
  if (severity === 'MEDIUM' || severity === 'MODERATE') return 64;
  if (severity === 'LOW') return 42;
  return 56;
}

function priorityToUrgency(value: unknown): number {
  const priority = normalizeUpper(value);
  if (priority === 'HIGH' || priority === 'URGENT') return 84;
  if (priority === 'MEDIUM') return 66;
  if (priority === 'LOW') return 46;
  return 58;
}

function parseJsonArray(value: Prisma.JsonValue | null | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const parsed: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      parsed.push(entry as Record<string, unknown>);
    }
  }
  return parsed;
}

function recommendationReasonFromSignals(signalHighlights: OrchestrationSignalHighlight[]): string[] {
  const reasons: string[] = [];
  const coverage = signalHighlights.find((entry) => entry.signalKey === 'COVERAGE_GAP');
  if (coverage?.valueNumber != null && coverage.valueNumber > 0) {
    reasons.push(`Coverage gap signal currently reports ${Math.round(coverage.valueNumber)} open gap(s).`);
  }
  const risk = signalHighlights.find((entry) => entry.signalKey === 'RISK_SPIKE');
  if (risk?.valueNumber != null && risk.valueNumber >= 0.55) {
    reasons.push('Risk spike signal indicates elevated near-term pressure.');
  }
  const cost = signalHighlights.find((entry) => entry.signalKey === 'COST_ANOMALY');
  if (cost?.valueNumber != null && cost.valueNumber >= 0.55) {
    reasons.push('Cost anomaly signal is above baseline.');
  }
  return reasons;
}

function mapRecommendationToNextBestMove(params: {
  recommendation: DecisionRecommendation;
  assumptionSetId: string | null;
}): OrchestrationNextBestMove {
  return {
    title: params.recommendation.title,
    detail: params.recommendation.detail,
    reasonCode: params.recommendation.reasonCode,
    sourceActionKey: params.recommendation.sourceActionKey ?? null,
    signalKey: params.recommendation.signalKey ?? null,
    targetTool: params.recommendation.targetTool,
    targetPath: params.recommendation.targetPath,
    assumptionSetId: params.assumptionSetId,
  };
}

function buildActionCenterDecisionCandidates(params: {
  propertyId: string;
  actions: OrchestratedAction[];
  signalHighlights: OrchestrationSignalHighlight[];
  activeScenarioAssumptionSetId: string | null;
  activeScenarioToolKey: string | null;
}): DecisionCandidate[] {
  const reasonsFromSignals = recommendationReasonFromSignals(params.signalHighlights);

  const candidates = params.actions.map((action): DecisionCandidate => {
    const riskLevelUrgency = severityToUrgency(action.riskLevel);
    const priorityUrgency = clampRange(action.priority, 0, 100);
    const overdueBoost = action.overdue ? 10 : 0;
    const urgency = clampRange(Math.max(riskLevelUrgency, priorityUrgency) + overdueBoost, 0, 100);
    const exposure = toNumberSafe(action.exposure) ?? 0;
    const normalizedExposure = clampRange((exposure / 12000) * 100, 0, 100);
    const financialImpact = Math.max(
      normalizedExposure,
      action.actionKey.startsWith('COVERAGE_GAP::') ? 72 : 0
    );
    const riskReduction = Math.max(
      severityToUrgency(action.riskLevel),
      action.source === 'CHECKLIST' ? 62 : 58,
      action.actionKey.startsWith('COVERAGE_GAP::') ? 88 : 0
    );
    const confidenceScore = normalizeDecisionConfidence(action.confidence?.score ?? 0.62);
    const freshness = freshnessFromDate(action.createdAt ?? new Date());
    const targetTool = mapActionToTargetTool(action);
    const targetPath = buildToolPath({
      propertyId: params.propertyId,
      tool: targetTool,
      assumptionSetId: params.activeScenarioAssumptionSetId,
      fromTool: 'orchestration-summary',
      launchSurface: 'orchestration-summary',
    });

    const intent = action.actionKey.startsWith('COVERAGE_GAP::')
      ? 'REVIEW_COVERAGE'
      : action.source === 'CHECKLIST'
        ? 'EXECUTE_MAINTENANCE'
        : 'REDUCE_EXPOSURE';

    const signalDrivers = [
      ...(action.primarySignalSource?.sourceSystem ? [action.primarySignalSource.sourceSystem] : []),
      ...(action.actionKey.startsWith('COVERAGE_GAP::') ? ['COVERAGE_GAP'] : []),
    ];

    return {
      id: `candidate:${action.id}`,
      source: 'ACTION_CENTER',
      title: action.title,
      detail:
        action.description ??
        action.cta?.label ??
        'Highest-priority actionable recommendation from Action Center.',
      targetTool,
      targetPath,
      sourceActionKey: action.actionKey,
      signalKey: action.actionKey.startsWith('COVERAGE_GAP::') ? 'COVERAGE_GAP' : null,
      dedupeKey: `action:${action.actionKey}`,
      conflictScope: action.actionKey.startsWith('COVERAGE_GAP::')
        ? 'coverage'
        : `asset:${action.systemType ?? action.category ?? action.title}`,
      intent,
      urgency,
      financialImpact,
      riskReduction,
      userEffort: action.source === 'CHECKLIST' ? 48 : 42,
      confidence: confidenceScore,
      freshness,
      reversibility: intent === 'REVIEW_COVERAGE' ? 74 : 60,
      whyNow: [
        ...reasonsFromSignals,
        `${action.title} is currently unsuppressed and actionable in Action Center.`,
      ],
      signalDrivers,
      postureInputs: [],
      assumptionInputs: params.activeScenarioAssumptionSetId
        ? [`assumptionSetId:${params.activeScenarioAssumptionSetId}`]
        : [],
      category: action.category ?? action.systemType ?? action.source,
      suppressionHints: {
        completedRecently: false,
        dismissedOrSnoozed: false,
        staleInput: freshness < 0.35,
        criticalSafety: normalizeUpper(action.riskLevel) === 'CRITICAL',
      },
    };
  });

  if (params.activeScenarioAssumptionSetId && params.activeScenarioToolKey) {
    const handoff = mapScenarioToolToHandoff(params.activeScenarioToolKey);
    if (handoff) {
      candidates.push({
        id: `candidate:scenario:${params.activeScenarioAssumptionSetId}`,
        source: 'SCENARIO_CONTINUITY',
        title: `Continue scenario in ${handoff.to.replace(/-/g, ' ')}`,
        detail: 'A shared assumption set is active. Continue the same scenario without re-entering assumptions.',
        targetTool: handoff.to,
        targetPath: buildToolPath({
          propertyId: params.propertyId,
          tool: handoff.to,
          assumptionSetId: params.activeScenarioAssumptionSetId,
          fromTool: handoff.from,
          launchSurface: 'orchestration-summary',
        }),
        dedupeKey: `scenario:${params.activeScenarioAssumptionSetId}:${handoff.to}`,
        conflictScope: 'scenario-continuity',
        intent: 'NEUTRAL',
        urgency: 52,
        financialImpact: 38,
        riskReduction: 44,
        userEffort: 18,
        confidence: 0.7,
        freshness: 0.88,
        reversibility: 92,
        assumptionInputs: [`assumptionSetId:${params.activeScenarioAssumptionSetId}`],
        whyNow: ['Scenario continuity was detected across aligned tools.'],
        signalDrivers: [],
        category: 'SCENARIO',
        suppressionHints: {
          completedRecently: false,
          dismissedOrSnoozed: false,
          staleInput: false,
          criticalSafety: false,
        },
      });
    }
  }

  return candidates;
}

type FeatureDecisionInputs = {
  propertyId: string;
  assumptionSetId: string | null;
  postureLabels: string[];
  signalHighlights: OrchestrationSignalHighlight[];
};

function buildFeatureDecisionCandidates(params: {
  base: FeatureDecisionInputs;
  coverageAnalysis: {
    id: string;
    summary: string | null;
    confidence: string;
    computedAt: Date;
    nextSteps: Prisma.JsonValue | null;
    decisionTrace: Prisma.JsonValue | null;
    assumptionSetId: string | null;
  } | null;
  riskPremiumAnalysis: {
    id: string;
    summary: string | null;
    confidence: string;
    computedAt: Date;
    recommendations: Prisma.JsonValue | null;
    assumptionSetId: string | null;
  } | null;
  doNothingRun: {
    id: string;
    summary: string | null;
    confidence: string;
    computedAt: Date;
    nextSteps: Prisma.JsonValue | null;
    assumptionSetId: string | null;
  } | null;
}): DecisionCandidate[] {
  const output: DecisionCandidate[] = [];
  const signalReasons = recommendationReasonFromSignals(params.base.signalHighlights);

  if (params.coverageAnalysis) {
    const step = parseJsonArray(params.coverageAnalysis.nextSteps)[0] ?? null;
    const detail = typeof step?.detail === 'string'
      ? step.detail
      : params.coverageAnalysis.summary ??
        'Coverage analysis indicates an unresolved protection recommendation.';
    const stepPriority = priorityToUrgency(step?.priority);
    output.push({
      id: `feature:coverage:${params.coverageAnalysis.id}`,
      source: 'COVERAGE_ANALYSIS',
      title:
        typeof step?.title === 'string' && step.title.trim().length > 0
          ? step.title
          : 'Review unresolved coverage recommendation',
      detail,
      targetTool: 'coverage-intelligence',
      targetPath: buildToolPath({
        propertyId: params.base.propertyId,
        tool: 'coverage-intelligence',
        assumptionSetId: params.coverageAnalysis.assumptionSetId ?? params.base.assumptionSetId,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      signalKey: 'COVERAGE_GAP',
      dedupeKey: `coverage:${typeof step?.title === 'string' ? step.title.toLowerCase() : 'default'}`,
      conflictScope: 'coverage',
      intent: 'REVIEW_COVERAGE',
      urgency: Math.max(stepPriority, 68),
      financialImpact: 70,
      riskReduction: 88,
      userEffort: 32,
      confidence: normalizeDecisionConfidence(params.coverageAnalysis.confidence),
      freshness: freshnessFromDate(params.coverageAnalysis.computedAt),
      reversibility: 78,
      whyNow: [
        ...signalReasons,
        'Coverage Intelligence has a current recommendation that has not yet been actioned.',
      ],
      signalDrivers: ['COVERAGE_GAP'],
      postureInputs: params.base.postureLabels,
      assumptionInputs: params.coverageAnalysis.assumptionSetId
        ? [`assumptionSetId:${params.coverageAnalysis.assumptionSetId}`]
        : [],
      category: 'COVERAGE',
      suppressionHints: {
        completedRecently: false,
        dismissedOrSnoozed: false,
        staleInput: freshnessFromDate(params.coverageAnalysis.computedAt) < 0.35,
        criticalSafety: false,
      },
    });
  }

  if (params.riskPremiumAnalysis) {
    const recommendation = parseJsonArray(params.riskPremiumAnalysis.recommendations)[0] ?? null;
    const recommendationTitle =
      typeof recommendation?.title === 'string' && recommendation.title.trim().length > 0
        ? recommendation.title
        : 'Apply highest-impact premium optimization action';
    const recommendationPriority = priorityToUrgency(recommendation?.priority);
    const recommendationCode = String(recommendation?.code ?? '').toUpperCase();
    output.push({
      id: `feature:risk-premium:${params.riskPremiumAnalysis.id}`,
      source: 'RISK_PREMIUM_OPTIMIZER',
      title: recommendationTitle,
      detail:
        typeof recommendation?.detail === 'string'
          ? recommendation.detail
          : params.riskPremiumAnalysis.summary ??
            'Risk-to-Premium Optimizer identified a near-term premium action.',
      targetTool: 'risk-premium-optimizer',
      targetPath: buildToolPath({
        propertyId: params.base.propertyId,
        tool: 'risk-premium-optimizer',
        assumptionSetId: params.riskPremiumAnalysis.assumptionSetId ?? params.base.assumptionSetId,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      signalKey: recommendationCode.includes('COVERAGE') ? 'COVERAGE_GAP' : null,
      dedupeKey: `risk-premium:${recommendationCode || recommendationTitle.toLowerCase()}`,
      conflictScope:
        typeof recommendation?.targetPeril === 'string'
          ? `peril:${recommendation.targetPeril}`
          : 'insurance-policy',
      intent: recommendationCode.includes('RAISE_DEDUCTIBLE')
        ? 'INCREASE_DEDUCTIBLE'
        : 'REDUCE_EXPOSURE',
      urgency: Math.max(recommendationPriority, 64),
      financialImpact: 76,
      riskReduction: 74,
      userEffort: 44,
      confidence: normalizeDecisionConfidence(params.riskPremiumAnalysis.confidence),
      freshness: freshnessFromDate(params.riskPremiumAnalysis.computedAt),
      reversibility: recommendationCode.includes('RAISE_DEDUCTIBLE') ? 86 : 58,
      whyNow: [
        ...signalReasons,
        'Risk-to-Premium Optimizer found a ranked recommendation with current savings/risk relevance.',
      ],
      signalDrivers: recommendationCode.includes('COVERAGE') ? ['COVERAGE_GAP'] : [],
      postureInputs: params.base.postureLabels,
      assumptionInputs: params.riskPremiumAnalysis.assumptionSetId
        ? [`assumptionSetId:${params.riskPremiumAnalysis.assumptionSetId}`]
        : [],
      category: 'RISK_PREMIUM',
      suppressionHints: {
        completedRecently: false,
        dismissedOrSnoozed: false,
        staleInput: freshnessFromDate(params.riskPremiumAnalysis.computedAt) < 0.35,
        criticalSafety: false,
      },
    });
  }

  if (params.doNothingRun) {
    const step = parseJsonArray(params.doNothingRun.nextSteps)[0] ?? null;
    const title =
      typeof step?.title === 'string' && step.title.trim().length > 0
        ? step.title
        : 'Validate inaction downside with current assumptions';
    const priority = priorityToUrgency(step?.priority);
    const lowerTitle = title.toLowerCase();
    output.push({
      id: `feature:do-nothing:${params.doNothingRun.id}`,
      source: 'DO_NOTHING_SIMULATOR',
      title,
      detail:
        typeof step?.detail === 'string'
          ? step.detail
          : params.doNothingRun.summary ??
            'Do-Nothing simulation indicates a notable downside trend.',
      targetTool: 'do-nothing',
      targetPath: buildToolPath({
        propertyId: params.base.propertyId,
        tool: 'do-nothing',
        assumptionSetId: params.doNothingRun.assumptionSetId ?? params.base.assumptionSetId,
        fromTool: 'orchestration-summary',
        launchSurface: 'orchestration-summary',
      }),
      signalKey: params.base.signalHighlights.some((entry) => entry.signalKey === 'COST_ANOMALY')
        ? 'COST_ANOMALY'
        : null,
      dedupeKey: `do-nothing:${title.toLowerCase()}`,
      conflictScope: 'inaction-vs-execution',
      intent: lowerTitle.includes('delay') || lowerTitle.includes('monitor') ? 'DEFER_MONITOR' : 'EXECUTE_MAINTENANCE',
      urgency: Math.max(priority, 58),
      financialImpact: 72,
      riskReduction: 68,
      userEffort: 36,
      confidence: normalizeDecisionConfidence(params.doNothingRun.confidence),
      freshness: freshnessFromDate(params.doNothingRun.computedAt),
      reversibility: 69,
      whyNow: [
        ...signalReasons,
        'Do-Nothing scenario output suggests downside if delay continues.',
      ],
      signalDrivers: params.base.signalHighlights
        .filter((entry) => entry.signalKey === 'COST_ANOMALY' || entry.signalKey === 'MAINT_ADHERENCE')
        .map((entry) => entry.signalKey),
      postureInputs: params.base.postureLabels,
      assumptionInputs: params.doNothingRun.assumptionSetId
        ? [`assumptionSetId:${params.doNothingRun.assumptionSetId}`]
        : [],
      category: 'DO_NOTHING',
      suppressionHints: {
        completedRecently: false,
        dismissedOrSnoozed: false,
        staleInput: freshnessFromDate(params.doNothingRun.computedAt) < 0.35,
        criticalSafety: false,
      },
    });
  }

  return output;
}

function safeParseDate(dateLike: unknown): Date | null {
  if (!dateLike) return null;
  const d = new Date(String(dateLike));
  return Number.isNaN(d.getTime()) ? null : d;
}
function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function scoreTo01(score0to100?: number | null) {
  if (score0to100 == null) return null;
  const n = Number(score0to100);
  if (!Number.isFinite(n)) return null;
  return clamp01(n / 100);
}

function pickPrimarySignal(sources: SignalSourceBadge[] | undefined): SignalSourceBadge | null {
  const list = (sources ?? []).filter(Boolean);
  if (list.length === 0) return null;

  // Prefer higher confidence if present; otherwise stable order
  const sorted = [...list].sort((a, b) => {
    const ac = a.confidence ?? -1;
    const bc = b.confidence ?? -1;
    if (bc !== ac) return bc - ac;
    return 0;
  });

  return sorted[0] ?? null;
}

function isPastDate(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime() < today.getTime();
}

function normalizeUpper(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function toNumberSafe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pushUniqueReason(
  reasons: SuppressionReasonEntry[],
  entry: SuppressionReasonEntry
) {
  if (!reasons.some(r => r.reason === entry.reason)) {
    reasons.push(entry);
  }
}

function isRiskActionable(d: any): boolean {
  const HIGH_LEVELS = new Set(['HIGH', 'CRITICAL']);
  const ACTION_STATUSES = new Set([
    'NEEDS_ATTENTION',
    'ACTION_REQUIRED',
    'MISSING_DATA',
    'NEEDS_REVIEW',
  ]);

  const riskLevel = normalizeUpper(d?.riskLevel ?? d?.severity);
  const status = normalizeUpper(d?.status);
  const hasRecommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;

  return Boolean(
    HIGH_LEVELS.has(riskLevel) || ACTION_STATUSES.has(status) || hasRecommendedAction
  );
}

function countRiskActions(details: any[]): number {
  if (!Array.isArray(details)) return 0;
  let count = 0;
  for (const d of details) if (isRiskActionable(d)) count += 1;
  return count;
}

function isChecklistActionable(
  item: any
): { actionable: boolean; overdue: boolean; unscheduledRecurring: boolean } {
  const status = normalizeUpper(item?.status);
  const isActive = ACTIVE_TASK_STATUSES.includes(status as any);
  if (!isActive) return { actionable: false, overdue: false, unscheduledRecurring: false };

  const nextDue = safeParseDate(item?.nextDueDate);
  const isRecurring = Boolean(item?.isRecurring);

  const overdue = nextDue ? isPastDate(nextDue) : false;
  const unscheduledRecurring = isRecurring && !nextDue;

  return { actionable: overdue || unscheduledRecurring, overdue, unscheduledRecurring };
}

function countChecklistActions(items: any[]): number {
  if (!Array.isArray(items)) return 0;
  let count = 0;
  for (const item of items) {
    const { actionable } = isChecklistActionable(item);
    if (actionable) count += 1;
  }
  return count;
}

// [Rest of helper functions remain the same - keeping original implementation]
// Including: computeConfidence, withDefaultConfidence, getActiveBookingCategorySet,
// mapRiskDetailToAction, mapChecklistItemToAction

// ... [Lines 287-1005 truncated for brevity - keep all original helper functions] ...

/**
 * PHASE 2.3 HELPER: Create task from Action Center
 * 
 * This helper function routes task creation to the appropriate service
 * based on user segment. Called when user clicks "Add to Checklist"
 * in the Action Center UI.
 * 
 * @param userId - User ID
 * @param action - The orchestrated action to convert to a task
 * @returns Result with task ID and deduplication status
 */
export async function createTaskFromOrchestration(
  userId: string,
  action: OrchestratedAction
): Promise<{
  success: boolean;
  taskId: string;
  source: 'HOME_BUYER' | 'EXISTING_OWNER' | 'LEGACY';
  deduped: boolean;
}> {
  logger.info({
    userId,
    actionKey: action.actionKey,
    source: action.source,
    title: action.title,
  }, '🔄 Creating task from orchestrated action');

  // Calculate nextDueDate based on priority/risk level
  let nextDueDate: Date;
  const now = new Date();

  const rl = normalizeUpper(action.riskLevel);
  if (rl === 'CRITICAL' || rl === 'HIGH')
    {
      // Urgent: 1 week
      nextDueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (action.nextDueDate) {
      // Use existing due date if available
      nextDueDate = new Date(action.nextDueDate);
    } else {
      // Default: 1 month
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      nextDueDate = next;
    }

  // Route to segment-specific service
  const result = await createTaskFromActionCenter({
    userId,
    propertyId: action.propertyId,
    title: action.title,
    description: action.description || undefined,
    assetType: action.systemType || undefined,
    priority: mapRiskLevelToPriority(rl),
    riskLevel: rl || undefined,
    serviceCategory: action.serviceCategory || undefined,
    estimatedCost: toNumberSafe(action.exposure) ?? undefined,
    nextDueDate: nextDueDate.toISOString(),
    actionKey: action.actionKey,
  });

  logger.info({
    taskId: result.taskId,
    source: result.source,
    deduped: result.deduped,
  }, '✅ Task created from orchestration');

  return result;
}

/**
 * Helper: Map risk level to maintenance task priority
 */
function mapRiskLevelToPriority(riskLevel?: string | null): string {
  const priorityMap: Record<string, string> = {
    'CRITICAL': 'URGENT',
    'HIGH': 'HIGH',
    'ELEVATED': 'MEDIUM',
    'MODERATE': 'MEDIUM',
    'LOW': 'LOW',
  };

  return riskLevel ? priorityMap[riskLevel.toUpperCase()] || 'MEDIUM' : 'MEDIUM';
}

// Keep all original helper functions here
// [Lines 287-1065 - Insert complete original implementations]

function computeConfidence(params: {
  source: 'RISK' | 'CHECKLIST';
  overdue?: boolean;
  unscheduledRecurring?: boolean;
  status?: string;
  suppressed?: boolean;
  riskLevel?: string;
  exposure?: number;
}): { score: number; level: 'HIGH' | 'MEDIUM' | 'LOW'; explanation: string[] } {
  let score = 50;
  const explanation: string[] = [];

  const rl = normalizeUpper(params.riskLevel);

  if (params.source === 'RISK') {
    if (rl === 'CRITICAL' || rl === 'HIGH') {
      score += 25;
      explanation.push('High risk severity');
    }
    if (params.exposure && params.exposure > 5000) {
      score += 15;
      explanation.push('High financial exposure');
    }
  }

  if (params.source === 'CHECKLIST') {
    if (params.overdue) {
      score += 20;
      explanation.push('Task is overdue');
    }
    if (params.unscheduledRecurring) {
      score += 15;
      explanation.push('Recurring task needs scheduling');
    }
  }

  if (!params.suppressed) {
    score += 10;
    explanation.push('No blocking conditions detected');
  }

  return {
    score: Math.min(100, score),
    level: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
    explanation,
  };
}

function withDefaultConfidence(conf: any): any {
  return {
    score: conf?.score ?? 50,
    level: conf?.level ?? 'MEDIUM',
    explanation: Array.isArray(conf?.explanation) ? conf.explanation : [],
  };
}

async function getActiveBookingCategorySet(propertyId: string): Promise<{
  categorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, any>;
}> {
  const bookings = await prisma.booking
    .findMany({
      where: {
        propertyId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: {
        id: true,
        category: true,
        scheduledDate: true,
        status: true,
      },
    })
    .catch(() => []);

  const categorySet = new Set<ServiceCategory>();
  const bookingByCategory = new Map<ServiceCategory, any>();

  for (const b of bookings) {
    if (b.category) {
      categorySet.add(b.category);
      if (!bookingByCategory.has(b.category)) {
        bookingByCategory.set(b.category, b);
      }
    }
  }

  return { categorySet, bookingByCategory };
}

async function mapRiskDetailToAction(params: {
  propertyId: string;
  d: any;
  index: number;
  warranties: any[];
  insurancePolicies: any[];
  bookingCategorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, any>;
  snoozeMap: Map<string, ActiveSnooze>;
}): Promise<OrchestratedAction | null> {
  const { propertyId, d, index, warranties, insurancePolicies, bookingCategorySet, bookingByCategory, snoozeMap } = params;

  if (!d) return null;
  if (!isRiskActionable(d)) return null;

  const systemType = String(d.systemType ?? d.assetName ?? 'Unknown');
  const category = String(d.category ?? 'SAFETY');
  const riskLevel = normalizeUpper(d.riskLevel ?? 'MODERATE');
  const age = typeof d.age === 'number' ? d.age : undefined;
  const expectedLife = typeof d.expectedLife === 'number' ? d.expectedLife : undefined;
  const exposure = toNumberSafe(d.exposure ?? d.outOfPocketCost ?? d.replacementCost);
  const coverage: CoverageInfo = { hasCoverage: false, type: 'NONE', expiresOn: null };

  const actionKey = computeActionKey({
    propertyId,
    source: 'RISK',
    orchestrationActionId: null,
    checklistItemId: null,
    serviceCategory: null,
    systemType,
    category,
  });

  const snooze = snoozeMap.get(actionKey);
  
  // Resolve suppression source
  const suppressionSource = await OrchestrationSuppressionService.resolveSuppressionSource({
    propertyId,
    actionKey,
  });
  
  // Check if suppressed based on source
  const isSuppressed = suppressionSource !== null;
  const reasons: SuppressionReasonEntry[] = [];
  
  if (suppressionSource?.type === 'USER_EVENT') {
    if (suppressionSource.eventType === 'USER_MARKED_COMPLETE') {
      reasons.push({
        reason: 'USER_MARKED_COMPLETE',
        message: 'User marked this action as complete',
        relatedType: null,
        relatedId: null,
      });
    } else if (suppressionSource.eventType === 'USER_UNMARKED_COMPLETE') {
      reasons.push({
        reason: 'USER_UNMARKED_COMPLETE',
        message: 'User unmarked this action',
        relatedType: null,
        relatedId: null,
      });
    }
  } else if (suppressionSource?.type === 'PROPERTY_MAINTENANCE_TASK') {
    // 🔑 NEW: Handle PropertyMaintenanceTask suppression
    reasons.push({
      reason: 'CHECKLIST_TRACKED',
      message: `Already scheduled: "${suppressionSource.task.title}"`,
      relatedType: 'MAINTENANCE_TASK',
      relatedId: suppressionSource.task.id,
    });
  } else if (suppressionSource?.type === 'CHECKLIST_ITEM') {
    reasons.push({
      reason: 'CHECKLIST_TRACKED',
      message: `Already covered by "${suppressionSource.checklistItem.title}"`,
      relatedType: 'CHECKLIST',
      relatedId: suppressionSource.checklistItem.id,
    });
  }
  
  const suppression = {
    suppressed: isSuppressed,
    reasons,
    suppressionSource: suppressionSource || undefined,
  };

  // Build decision trace steps
  const steps: DecisionTraceStep[] = [];
    
  // Step 1: Always show why this is actionable
  steps.push({ 
    rule: 'RISK_ACTIONABLE', 
    outcome: 'APPLIED',
    details: {
      systemType,
      age: age || 'unknown',
      expectedLife: expectedLife || 'unknown',
      riskLevel,
      exposure: exposure || 0,
    },
  });

  // Step 2: Risk assessment details
  if (age && expectedLife) {
    const remainingLife = expectedLife - age;
    steps.push({
      rule: 'AGE_EVALUATION',
      outcome: 'APPLIED',
      details: {
        currentAge: age,
        expectedLife: expectedLife,
        remainingLife: remainingLife,
        percentUsed: Math.round((age / expectedLife) * 100),
        message: remainingLife <= 0 
          ? `System has exceeded expected lifespan by ${Math.abs(remainingLife)} years`
          : `System has ${remainingLife} years remaining in expected lifespan`,
      },
    });
  }

  // Step 3: Coverage check
  steps.push({
    rule: 'COVERAGE_CHECK',
    outcome: coverage.hasCoverage ? 'APPLIED' : 'SKIPPED',
    details: {
      hasCoverage: coverage.hasCoverage,
      coverageType: coverage.type,
      message: coverage.hasCoverage 
        ? `Covered by ${coverage.type}` 
        : 'No coverage found',
    },
  });

  // Step 4: Suppression check
  if (suppression.suppressed) {
    steps.push({ rule: 'SUPPRESSION_CHECK', outcome: 'APPLIED' });
    
    if (suppressionSource?.type === 'PROPERTY_MAINTENANCE_TASK') {
      steps.push({ 
        rule: 'TASK_ALREADY_SCHEDULED', 
        outcome: 'APPLIED',
        details: {
          taskId: suppressionSource.task.id,
          taskTitle: suppressionSource.task.title,
          message: `Already scheduled: "${suppressionSource.task.title}"`,
        },
      });
    } else if (suppressionSource?.type === 'CHECKLIST_ITEM') {
      steps.push({ 
        rule: 'CHECKLIST_TRACKED', 
        outcome: 'APPLIED',
        details: {
          itemId: suppressionSource.checklistItem.id,
          itemTitle: suppressionSource.checklistItem.title,
          message: `Already in checklist: "${suppressionSource.checklistItem.title}"`,
        },
      });
    } else if (suppressionSource?.type === 'USER_EVENT') {
      steps.push({ 
        rule: 'USER_COMPLETED', 
        outcome: 'APPLIED',
        details: {
          eventType: suppressionSource.eventType,
          message: suppressionSource.eventType === 'USER_MARKED_COMPLETE' 
            ? 'You marked this as complete'
            : 'You unmarked this action',
        },
      });
    }
  } else {
    // Step 5: Not suppressed - action is required
    steps.push({
      rule: 'ACTION_REQUIRED',
      outcome: 'APPLIED',
      details: {
        message: 'This item requires scheduling or attention',
      },
    });
  }

  // Step 6: Snooze status (if applicable)
  if (snooze) {
    steps.push({
      rule: 'SNOOZED',
      outcome: 'APPLIED',
      details: {
        snoozedUntil: snooze.snoozeUntil,
        daysRemaining: snooze.daysRemaining,
        reason: snooze.snoozeReason,
        message: `Snoozed for ${snooze.daysRemaining} more days`,
      },
    });
  }

  const priority = riskLevel === 'CRITICAL' ? 100 : riskLevel === 'HIGH' ? 80 : 50;

  const confidenceRaw = computeConfidence({
    source: 'RISK',
    riskLevel,
    exposure: exposure ?? undefined,
    suppressed: suppression.suppressed,
  });

  const signalSources: SignalSourceBadge[] = [
    {
      sourceType: SignalSourceType.INTELLIGENCE,
      triggerType: SignalTriggerType.MODEL,
      sourceSystem: 'riskAssessmentReport',
      summary: 'Generated from your property risk assessment signals',
      confidence: scoreTo01(confidenceRaw?.score),
    },
  ];

  // If/when you later set real coverage.hasCoverage for risk actions, you can add:
  // if (coverage.hasCoverage) { signalSources.push({ sourceType: SignalSourceType.COVERAGE, ... }) }

  const primarySignalSource = pickPrimarySignal(signalSources);
  const relatedEntity =
    typeof d.inventoryItemId === 'string' && d.inventoryItemId.length > 0
      ? { type: 'INVENTORY_ITEM' as const, id: d.inventoryItemId }
      : typeof d.homeAssetId === 'string' && d.homeAssetId.length > 0
      ? { type: 'HOME_ASSET' as const, id: d.homeAssetId }
      : null;

  return {
    id: `risk:${propertyId}:${index}`,
    actionKey,
    source: 'RISK',
    propertyId,

    title: d.assetName || systemType,
    description: d.recommendedAction || d.actionCta || null,

    systemType,
    category,
    riskLevel,
    age: toNumberSafe(d.age),
    expectedLife: toNumberSafe(d.expectedLife),
    exposure,

    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    cta: { show: true, label: 'Schedule Service', reason: 'ACTION_REQUIRED' },
    confidence: withDefaultConfidence(confidenceRaw),
    suppression,
    relatedEntity,
    snooze: snooze ? {
      snoozedAt: snooze.snoozedAt.toISOString(),
      snoozeUntil: snooze.snoozeUntil.toISOString(),
      snoozeReason: snooze.snoozeReason,
      daysRemaining: snooze.daysRemaining,
    } : undefined,
    decisionTrace: { steps },
    signalSources,
    primarySignalSource,

    priority,
    overdue: false,
    createdAt: null,
  };
}

async function mapChecklistItemToAction(params: {
  propertyId: string;
  item: any;
  bookingCategorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, any>;
}): Promise<OrchestratedAction | null> {
  const { propertyId, item, bookingCategorySet, bookingByCategory } = params;

  if (!item) return null;

  const { actionable, overdue, unscheduledRecurring } = isChecklistActionable(item);
  if (!actionable) return null;

  const serviceCategory = item.serviceCategory as ServiceCategory | null;
  const status = String(item.status ?? 'PENDING');
  const nextDueDate = safeParseDate(item.nextDueDate);

  // Resolve suppression source for checklist item
  const computedKey = computeActionKey({
    propertyId,
    source: 'CHECKLIST',
    orchestrationActionId: null,
    checklistItemId: item?.id ?? null,
    serviceCategory,
    systemType: null,
    category: null,
  });
  
  const finalActionKey = item?.actionKey || computedKey;
  const suppressionSource = await OrchestrationSuppressionService.resolveSuppressionSource({
    propertyId,
    actionKey: finalActionKey,
  });
  
  const isSuppressed = suppressionSource !== null;
  const reasons: SuppressionReasonEntry[] = [];
  
  if (suppressionSource?.type === 'USER_EVENT') {
    if (suppressionSource.eventType === 'USER_MARKED_COMPLETE') {
      reasons.push({
        reason: 'USER_MARKED_COMPLETE',
        message: 'User marked this action as complete',
        relatedType: null,
        relatedId: null,
      });
    } else if (suppressionSource.eventType === 'USER_UNMARKED_COMPLETE') {
      reasons.push({
        reason: 'USER_UNMARKED_COMPLETE',
        message: 'User unmarked this action',
        relatedType: null,
        relatedId: null,
      });
    }
  } else if (suppressionSource?.type === 'CHECKLIST_ITEM') {
    reasons.push({
      reason: 'CHECKLIST_TRACKED',
      message: 'This action is tracked in checklist',
      relatedType: 'CHECKLIST',
      relatedId: suppressionSource.checklistItem.id,
    });
  }
  
  const suppression = {
    suppressed: isSuppressed,
    reasons,
    suppressionSource: suppressionSource || undefined,
  };

  const steps: DecisionTraceStep[] = [];
  steps.push({ rule: 'CHECKLIST_ACTIONABLE', outcome: 'APPLIED' });

  let priority = 50;
  if (overdue) priority = 75;
  if (unscheduledRecurring) priority = 60;

  let ctaLabel = 'Schedule';
  if (overdue) ctaLabel = 'Overdue - Schedule Now';
  if (unscheduledRecurring) ctaLabel = 'Set Schedule';

  const confidenceRaw = computeConfidence({
    source: 'CHECKLIST',
    overdue,
    unscheduledRecurring,
    status,
    suppressed: suppression.suppressed,
  });


  const signalSources: SignalSourceBadge[] = [
    {
      sourceType: SignalSourceType.MANUAL,
      triggerType: SignalTriggerType.USER_ACTION,
      sourceSystem: 'checklistItem',
      summary: 'From your maintenance checklist',
      confidence: null,
    },
  ];

  const primarySignalSource = pickPrimarySignal(signalSources);

  const storedKey = item?.actionKey;

  logger.info({
    itemId: item?.id,
    title: item?.title,
    storedKey: storedKey,
    computedKey,
    finalKey: finalActionKey,
    usedStored: !!storedKey,
  }, '🔍 CHECKLIST ACTION KEY DECISION');

  return {
    id: `checklist:${propertyId}:${item?.id ?? 'unknown'}`,
    actionKey: finalActionKey,
    source: 'CHECKLIST',
    propertyId,

    title: String(item?.title ?? 'Checklist Item'),
    description: item?.description ?? null,

    checklistItemId: item?.id ?? null,
    status,
    nextDueDate,
    isRecurring: Boolean(item?.isRecurring),
    serviceCategory,

    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null, sourceId: null },
    cta: { show: true, label: ctaLabel, reason: 'ACTION_REQUIRED' },
    confidence: withDefaultConfidence(confidenceRaw),
    suppression,
    decisionTrace: { steps },
    signalSources,
    primarySignalSource,

    priority,
    overdue,
    createdAt: safeParseDate(item?.createdAt) ?? null,
  };
}

/**
 * Phase 5 + 6 + 8:
 * - actions[] remains actionable-only (non-breaking)
 * - suppressedActions[] provides transparency + trace
 * - coverage is now action-level for risk items
 */
export async function getOrchestrationSummary(propertyId: string): Promise<OrchestrationSummary> {
  // 0) Booking context
  const { categorySet: bookingCategorySet, bookingByCategory } =
    await getActiveBookingCategorySet(propertyId);

  // 1) Fetch property coverage and snoozes in parallel
  const [propertyCoverage, snoozeMap] = await Promise.all([
    prisma.property
    .findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        warranties: {
          select: {
            id: true,
            expiryDate: true,
            category: true,
            homeAssetId: true,
            homeAsset: {
              select: {
                assetType: true
              }
            },
          },
        },
        insurancePolicies: {
          select: {
            id: true,
            expiryDate: true,
          },
        },
      },
    })
    .catch(() => null as any),
    getPropertySnoozes(propertyId),
  ]);

  const warranties = propertyCoverage?.warranties ?? [];
  const insurancePolicies = propertyCoverage?.insurancePolicies ?? [];

  // 2) Risk report
  const riskReport = await prisma.riskAssessmentReport
    .findFirst({
      where: { propertyId },
      orderBy: { lastCalculatedAt: 'desc' },
      select: { details: true, lastCalculatedAt: true },
    })
    .catch(() => null);

  const riskDetails: any[] = (riskReport as any)?.details ?? [];

  logger.info({
    reportExists: !!riskReport,
    detailsCount: riskDetails.length,
    details: riskDetails.map((d, i) => ({
      index: i,
      assetName: d?.assetName,
      systemType: d?.systemType,
      riskLevel: d?.riskLevel,
      actionable: d?.riskLevel && d?.riskLevel !== 'LOW',
    })),
  }, '🔍 RISK REPORT DATA');

  // 3) Checklist items
  const checklistItems = await prisma.checklistItem
    .findMany({
      where: { propertyId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        nextDueDate: true,
        isRecurring: true,
        createdAt: true,
        serviceCategory: true,
        actionKey: true,
      },
    })
    .catch(() => []);

  logger.info({
    checklistItems: checklistItems.map(item => ({
      id: item.id,
      title: item.title,
      actionKey: item.actionKey,
      hasActionKey: !!item.actionKey,
    })),
  }, 'RAW CHECKLIST ITEMS FROM DB');

  // 4) Build candidate actions
  const candidateRiskActions: OrchestratedAction[] = Array.isArray(riskDetails)
  ? (await Promise.all(
      riskDetails.map((d: any, idx: number) => {
        logger.info({
          assetName: d?.assetName,
          systemType: d?.systemType,
          willMap: !!d,
        }, `Processing risk item ${idx}`);
        
        return mapRiskDetailToAction({
          propertyId,
          d,
          index: idx,
          warranties,
          insurancePolicies,
          bookingCategorySet,
          bookingByCategory,
          snoozeMap,
        });
      })
    )).filter(Boolean) as OrchestratedAction[]
  : [];

  logger.info({ data: candidateRiskActions.length }, '🔍 RISK ACTIONS CREATED');

  const candidateChecklistActions: OrchestratedAction[] = (await Promise.all(
    checklistItems.map((i: any) =>
      mapChecklistItemToAction({
        propertyId,
        item: i,
        bookingCategorySet,
        bookingByCategory,
      })
    )
  )).filter((a): a is OrchestratedAction => a !== null);

  const candidates = [
    ...candidateRiskActions,
    ...candidateChecklistActions,
  ];
    
  // 4.5) Coverage Gap Detector → add candidate actions
  // NOTE: OrchestratedAction.source currently supports only 'RISK' | 'CHECKLIST'
  // So we set source='RISK' for now, and use actionKey prefix for identification.
  const gaps = await detectCoverageGaps(propertyId);

  for (const gap of gaps) {
    const actionKey = `COVERAGE_GAP::${gap.inventoryItemId}`;

    // Build a human-friendly label for the UI (avoid generic/absurd titles)
    // Example: "No coverage for Refrigerator (Kitchen)"
    const roomSuffix = gap.roomName ? ` (${gap.roomName})` : '';
    const itemLabel = `${gap.itemName}${roomSuffix}`;

    // Optional: attach snooze if present for this actionKey
    const snooze = snoozeMap.get(actionKey);

    const confidenceRaw = computeConfidence({
      source: 'RISK',
      riskLevel: gap.gapType === 'NO_COVERAGE' ? 'HIGH' : 'MODERATE',
      exposure: gap.exposureCents ? gap.exposureCents / 100 : undefined,
      suppressed: false,
    });

    const steps: DecisionTraceStep[] = [
      {
        rule: 'COVERAGE_GAP_DETECTOR',
        outcome: 'APPLIED',
        details: {
          inventoryItemId: gap.inventoryItemId,
          itemName: gap.itemName,
          itemCategory: gap.itemCategory ?? null,
          roomName: gap.roomName ?? null,
          gapType: gap.gapType,
          exposureCents: gap.exposureCents,
          reasons: gap.reasons,
          message: 'Derived from inventory coverage linkage + expiry checks',
        },
      },
    ];

    const signalSources: SignalSourceBadge[] = [
      {
        sourceType: SignalSourceType.COVERAGE,
        triggerType: SignalTriggerType.RULE,
        sourceSystem: 'coverageGapDetector',
        summary: 'Derived from inventory coverage linkage and expiry checks',
        confidence: scoreTo01(confidenceRaw?.score),
      },
    ];

    const primarySignalSource = pickPrimarySignal(signalSources);

    candidates.push({
      id: `coverage-gap:${propertyId}:${gap.inventoryItemId}`,
      actionKey,
      source: 'RISK', // keep as 'RISK' for V1 to avoid widening the union
      propertyId,

      title:
        gap.gapType === 'NO_COVERAGE'
          ? `No coverage for ${itemLabel}`
          : `Coverage issue for ${itemLabel}`,

      description: `${gap.reasons.join('. ')}${gap.roomName ? ` (Location: ${gap.roomName})` : ''}`,

      // keep this as inventory item category for UI chips
      systemType: gap.itemCategory ?? null,
      category: gap.itemCategory ?? 'INSURANCE',
      riskLevel: gap.gapType === 'NO_COVERAGE' ? 'HIGH' : 'MODERATE',
      exposure: gap.exposureCents ? gap.exposureCents / 100 : null,

      signalSources,
      primarySignalSource,

      // @ts-ignore
      relatedEntity: { type: 'INVENTORY_ITEM', id: gap.inventoryItemId },

      coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },

      cta: {
        show: true,
        label: gap.gapType === 'NO_COVERAGE' ? 'Get insurance quotes' : 'Review coverage',
        reason: 'ACTION_REQUIRED',
      },

      confidence: withDefaultConfidence(confidenceRaw),

      suppression: {
        suppressed: false,
        reasons: [],
      },

      snooze: snooze
        ? {
            snoozedAt: snooze.snoozedAt.toISOString(),
            snoozeUntil: snooze.snoozeUntil.toISOString(),
            snoozeReason: snooze.snoozeReason,
            daysRemaining: snooze.daysRemaining,
          }
        : undefined,

      decisionTrace: { steps },

      priority: gap.gapType === 'NO_COVERAGE' ? 85 : 65,
      overdue: false,
      createdAt: null,
    });
  }


  // Resolve authoritative suppression for legacy data
  for (const action of candidates) {
    if (
      action.source === 'RISK' &&
      action.suppression.suppressed &&
      !action.suppression.suppressionSource
    ) {
      const source =
        await OrchestrationSuppressionService.resolveSuppressionSource({
          propertyId,
          actionKey: action.actionKey,
        });

      logger.info({
        actionKey: action.actionKey,
        foundSourceType: source?.type || 'NONE',
        checklistItemId: source?.type === 'CHECKLIST_ITEM' ? source.checklistItem.id : null,
      }, '🔍 RESOLVED SUPPRESSION SOURCE FOR RISK');

      if (source) {
        action.suppression.suppressionSource = source;

        action.suppression.reasons = action.suppression.reasons.filter(
          (r) => r.reason !== 'CHECKLIST_TRACKED'
        );

        if (source.type === 'CHECKLIST_ITEM') {
          pushUniqueReason(action.suppression.reasons, {
            reason: 'CHECKLIST_TRACKED',
            message: `Already covered by "${source.checklistItem.title}".`,
            relatedId: source.checklistItem.id,
            relatedType: 'CHECKLIST',
          });
        }
      }
    }
  }
  
  // 5) Separate snoozed, suppressed, and active
  const snoozedActions = candidates.filter(a => a.snooze);
  const suppressedActions = candidates.filter(a => !a.snooze && a.suppression.suppressed);
  const actionable = candidates.filter(a => !a.snooze && !a.suppression.suppressed);

  // 6) Sort actionable
  const actions = actionable.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.overdue !== a.overdue) return b.overdue ? 1 : -1;
    const ad = a.nextDueDate ? a.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.nextDueDate ? b.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  // 7) Counts reflect actionable
  const riskActions = actions.filter((a) => a.source === 'RISK').length;
  const checklistActions = actions.filter((a) => a.source === 'CHECKLIST').length;

  const derivedFrom: DerivedFrom = {
    riskAssessment: Boolean(riskReport),
    checklist: checklistItems.length > 0,
  };

    // Persist decision traces (Option B) — best effort, non-breaking
  try {
      const all = [...actions, ...suppressedActions, ...snoozedActions];
      await persistDecisionTraces({ propertyId, actions: all, algoVersion: 'v1' });
    } catch (e) {
      logger.warn({ err: e }, '[ORCHESTRATION] decision trace persistence failed');
    }

  let sharedContext: OrchestrationSharedContext | null = null;
  let nextBestMove: OrchestrationNextBestMove | null = null;
  let handoffs: OrchestrationHandoff[] = [];
  let decisionEngineResult: DecisionEngineResult | null = null;

  try {
    const [profile, assumptionSets, latestSignals, coverageAnalysis, riskPremiumAnalysis, doNothingRun] = await Promise.all([
      preferenceProfileService.getCurrentProfile(propertyId),
      assumptionSetService.listRecent(propertyId, { limit: 12 }),
      signalService.getLatestSignalsByKey(propertyId, ORCHESTRATION_SIGNAL_KEYS, { freshOnly: false }),
      prisma.coverageAnalysis.findFirst({
        where: { propertyId },
        orderBy: { computedAt: 'desc' },
        select: {
          id: true,
          summary: true,
          confidence: true,
          computedAt: true,
          nextSteps: true,
          decisionTrace: true,
          assumptionSetId: true,
        },
      }),
      prisma.riskPremiumOptimizationAnalysis.findFirst({
        where: { propertyId },
        orderBy: { computedAt: 'desc' },
        select: {
          id: true,
          summary: true,
          confidence: true,
          computedAt: true,
          recommendations: true,
          assumptionSetId: true,
        },
      }),
      prisma.doNothingSimulationRun.findFirst({
        where: { propertyId },
        orderBy: { computedAt: 'desc' },
        select: {
          id: true,
          summary: true,
          confidence: true,
          computedAt: true,
          nextSteps: true,
          assumptionSetId: true,
        },
      }),
    ]);

    const activeScenario =
      assumptionSets.length > 0
        ? {
            assumptionSetId: assumptionSets[0].id,
            toolKey: assumptionSets[0].toolKey,
            scenarioKey: assumptionSets[0].scenarioKey,
            createdAt: assumptionSets[0].createdAt,
          }
        : null;

    const signalHighlights = ORCHESTRATION_SIGNAL_KEYS
      .map((key) => signalToHighlight(key, latestSignals[key]))
      .filter((entry): entry is OrchestrationSignalHighlight => Boolean(entry));

    const strongestPressure = computeStrongestPressure(actions, signalHighlights);
    const strongestOpportunity = computeStrongestOpportunity(signalHighlights);
    const postureLabels = profile
      ? [
          profile.riskTolerance ? `riskTolerance:${profile.riskTolerance}` : null,
          profile.deductiblePreferenceStyle ? `deductible:${profile.deductiblePreferenceStyle}` : null,
          profile.cashBufferPosture ? `cashBuffer:${profile.cashBufferPosture}` : null,
          profile.bundlingPreference ? `bundling:${profile.bundlingPreference}` : null,
        ].filter((entry): entry is string => Boolean(entry))
      : [];

    sharedContext = {
      generatedAt: new Date().toISOString(),
      activeScenario,
      posture: profile
        ? {
            preferenceProfileId: profile.id,
            riskTolerance: profile.riskTolerance,
            deductiblePreferenceStyle: profile.deductiblePreferenceStyle,
            cashBufferPosture: profile.cashBufferPosture,
            bundlingPreference: profile.bundlingPreference,
            updatedAt: profile.updatedAt,
          }
        : null,
      signalHighlights,
      strongestPressure,
      strongestOpportunity,
    };

    const actionCenterCandidates = buildActionCenterDecisionCandidates({
      propertyId,
      actions,
      signalHighlights,
      activeScenarioAssumptionSetId: activeScenario?.assumptionSetId ?? null,
      activeScenarioToolKey: activeScenario?.toolKey ?? null,
    });

    const featureCandidates = buildFeatureDecisionCandidates({
      base: {
        propertyId,
        assumptionSetId: activeScenario?.assumptionSetId ?? null,
        postureLabels,
        signalHighlights,
      },
      coverageAnalysis,
      riskPremiumAnalysis,
      doNothingRun,
    });

    const allDecisionCandidates: DecisionCandidate[] = [
      ...actionCenterCandidates,
      ...featureCandidates,
    ];

    if (allDecisionCandidates.length > 0) {
      decisionEngineResult = runDecisionEngine({
        candidates: allDecisionCandidates,
        recommendationLimit: 5,
      });
      const top = decisionEngineResult.recommendations[0];
      if (top) {
        nextBestMove = mapRecommendationToNextBestMove({
          recommendation: top,
          assumptionSetId: activeScenario?.assumptionSetId ?? null,
        });
      }
    }

    if (!nextBestMove) {
      nextBestMove = buildNextBestMove({
        propertyId,
        actions,
        activeScenario: activeScenario
          ? {
              assumptionSetId: activeScenario.assumptionSetId,
              toolKey: activeScenario.toolKey,
            }
          : null,
        signalHighlights,
      });
    }

    handoffs = buildScenarioHandoffs({
      propertyId,
      activeScenario: activeScenario
        ? {
            assumptionSetId: activeScenario.assumptionSetId,
            toolKey: activeScenario.toolKey,
          }
        : null,
    });
  } catch (error) {
    logger.warn({ err: error }, '[ORCHESTRATION] shared context enrichment failed');
  }

  return {
    propertyId,
    pendingActionCount: actions.length,
    derivedFrom,
    actions,
    suppressedActions,
    snoozedActions,
    counts: {
      riskActions,
      checklistActions,
      suppressedActions: suppressedActions.length,
      snoozedActions: snoozedActions.length,
    },
    nextBestMove,
    sharedContext,
    handoffs,
    decisionEngine: decisionEngineResult
      ? {
          recommendations: decisionEngineResult.recommendations.map((entry) => ({
            id: entry.id,
            title: entry.title,
            detail: entry.detail,
            source: entry.source,
            targetTool: entry.targetTool,
            targetPath: entry.targetPath,
            score: entry.score,
            priorityBucket: entry.priorityBucket,
            confidence: entry.confidence,
            freshness: entry.freshness,
            reasonCode: entry.reasonCode,
            sourceActionKey: entry.sourceActionKey ?? null,
            signalKey: entry.signalKey ?? null,
            trace: entry.trace,
          })),
          suppressed: decisionEngineResult.suppressed.map((entry) => ({
            candidateId: entry.candidateId,
            title: entry.title,
            source: entry.source,
            reason: entry.reason,
            detail: entry.detail,
          })),
          diagnostics: decisionEngineResult.diagnostics,
        }
      : null,
  };
}

export async function getOrchestrationDecisionDiagnostics(propertyId: string): Promise<{
  generatedAt: string;
  evaluatedCount: number;
  surfacedCount: number;
  suppressedCount: number;
  duplicateMergeCount: number;
  conflictResolutionCount: number;
  staleInputDecisions: number;
  lowConfidenceRecommendationCount: number;
  topDecisionCategories: Record<string, number>;
  suppressedByReason: Record<string, number>;
  priorityBuckets: {
    high: number;
    medium: number;
    low: number;
  };
} | null> {
  const summary = await getOrchestrationSummary(propertyId);
  return summary.decisionEngine?.diagnostics ?? null;
}

async function persistDecisionTraces(params: {
  propertyId: string;
  actions: OrchestratedAction[];
  algoVersion?: string;
}) {
  const { propertyId, actions, algoVersion } = params;

  // best-effort: do not break summary if persistence fails
  await Promise.allSettled(
    actions
      .filter(a => a?.actionKey && a?.decisionTrace?.steps?.length)
      .map(a =>
        prisma.orchestrationDecisionTrace.upsert({
          where: {
            propertyId_actionKey: {
              propertyId,
              actionKey: a.actionKey,
            },
          },
          create: {
            propertyId,
            actionKey: a.actionKey,
            algoVersion: algoVersion ?? null,
            computedAt: new Date(),
            steps: a.decisionTrace?.steps ?? [],
            signals: {
              source: a.source,
              age: a.age ?? null,
              expectedLife: a.expectedLife ?? null,
              exposure: a.exposure ?? null,
              serviceCategory: a.serviceCategory ?? null,
              nextDueDate: a.nextDueDate ?? null,
              coverage: a.coverage ?? null,
              snooze: a.snooze ?? null,
            },
            confidence: a.confidence ?? Prisma.JsonNull,
            suppression: {
              suppressed: a.suppression?.suppressed ?? false,
              reasons: a.suppression?.reasons ?? [],
              // optionally persist suppressionSource.type + ids only
              suppressionSource: a.suppression?.suppressionSource
                ? {
                    type: a.suppression.suppressionSource.type,
                    // include only ids you need, not full nested task/checklist objects
                  }
                : null,
            },
            
          },
          update: {
            algoVersion: algoVersion ?? null,
            computedAt: new Date(),
            steps: a.decisionTrace?.steps ?? [],
            signals: {
              source: a.source,
              age: a.age ?? null,
              expectedLife: a.expectedLife ?? null,
              exposure: a.exposure ?? null,
              serviceCategory: a.serviceCategory ?? null,
              nextDueDate: a.nextDueDate ?? null,
              coverage: a.coverage ?? null,
              snooze: a.snooze ?? null,
            },
            confidence: a.confidence ?? Prisma.JsonNull,
            suppression: {
              suppressed: a.suppression?.suppressed ?? false,
              reasons: a.suppression?.reasons ?? [],
              // optionally persist suppressionSource.type + ids only
              suppressionSource: a.suppression?.suppressionSource
                ? {
                    type: a.suppression.suppressionSource.type,
                    // include only ids you need, not full nested task/checklist objects
                  }
                : null,
            },            
          },
        })
      )
  );
}
