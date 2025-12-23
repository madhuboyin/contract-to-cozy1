// apps/backend/src/services/orchestration.service.ts

import { prisma } from '../lib/prisma';
import { ServiceCategory, BookingStatus } from '@prisma/client';

type DerivedFrom = {
  riskAssessment: boolean;
  checklist: boolean;
};

export type SuppressionReason =
  | 'BOOKING_EXISTS'
  | 'COVERED'
  | 'NOT_ACTIONABLE'
  | 'UNKNOWN';

type SuppressionReasonEntry = {
  reason: SuppressionReason;
  message: string;
  relatedId?: string | null;
  relatedType?: 'BOOKING' | 'WARRANTY' | 'INSURANCE' | null;
};

export type CoverageInfo = {
  hasCoverage: boolean;
  type: 'HOME_WARRANTY' | 'INSURANCE' | 'NONE';
  expiresOn: Date | null;
  sourceId?: string | null;

  // ------------------------------
  // Phase 8 additions (non-breaking)
  // ------------------------------
  confidence?: 'HIGH' | 'PARTIAL' | 'UNKNOWN';
  matchedOn?: 'ASSET' | 'CATEGORY' | 'PROPERTY' | 'NONE';
  explanation?: string;
};

export type DecisionTraceStep = {
  rule: string; // stable string key
  outcome: 'APPLIED' | 'SKIPPED';
  details?: Record<string, any> | null;
};

export type OrchestratedAction = {
  id: string;

  source: 'RISK' | 'CHECKLIST';
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
  };
  decisionTrace?: {
    steps: DecisionTraceStep[];
  };

  priority: number;
  overdue: boolean;
  createdAt?: Date | null;
};

export type OrchestrationSummary = {
  propertyId: string;
  pendingActionCount: number;
  derivedFrom: DerivedFrom;

  actions: OrchestratedAction[];
  suppressedActions: OrchestratedAction[];

  counts: {
    riskActions: number;
    checklistActions: number;
    suppressedActions: number;
  };
};

// Keep in sync with frontend intent: "actionable" = overdue OR unscheduled recurring OR active review states
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

function safeParseDate(dateLike: unknown): Date | null {
  if (!dateLike) return null;
  const d = new Date(String(dateLike));
  return Number.isNaN(d.getTime()) ? null : d;
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

/**
 * Risk is actionable if:
 * - HIGH/CRITICAL
 * - or status indicates attention
 * - or recommendedAction/actionCta exists
 */
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

/**
 * Checklist actionable if:
 * - status is active AND (overdue OR unscheduled recurring)
 */
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

/**
 * Booking suppression support:
 * Builds a set of categories that currently have an active booking for this property.
 */
async function getActiveBookingCategorySet(propertyId: string): Promise<{
  categorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, { id: string; status: BookingStatus }>;
}> {
  const bookings = await prisma.booking
    .findMany({
      where: {
        propertyId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: {
        id: true,
        status: true,
        category: true,
      },
    })
    .catch(() => []);

  const categorySet = new Set<ServiceCategory>();
  const bookingByCategory = new Map<ServiceCategory, { id: string; status: BookingStatus }>();

  for (const b of bookings) {
    if (!b?.category) continue;
    categorySet.add(b.category);
    if (!bookingByCategory.has(b.category)) {
      bookingByCategory.set(b.category, { id: b.id, status: b.status });
    }
  }

  return { categorySet, bookingByCategory };
}

/**
 * Best-effort: infer ServiceCategory for risk item.
 */
function inferServiceCategoryFromRiskDetail(d: any): ServiceCategory | null {
  const direct = d?.serviceCategory ?? d?.category;
  if (direct) {
    const candidate = String(direct).trim().toUpperCase();
    const values = Object.values(ServiceCategory) as string[];
    if (values.includes(candidate)) return candidate as ServiceCategory;
  }

  const text = `${d?.systemType ?? ''} ${d?.assetName ?? ''} ${d?.title ?? ''}`.toUpperCase();
  const values = Object.values(ServiceCategory) as string[];
  const tryMatch = (key: string) => (values.includes(key) ? (key as ServiceCategory) : null);

  if (text.includes('HVAC') || text.includes('FURNACE')) return tryMatch('HVAC');
  if (text.includes('WATER HEATER')) return tryMatch('PLUMBING');
  if (text.includes('ROOF')) return tryMatch('ROOFING');

  return null;
}

/**
 * Phase 8: infer asset intent (assetType) in addition to ServiceCategory.
 * NOTE: This is a best-effort heuristic. You can tighten this once your risk JSON is normalized.
 */
function inferAssetKey(d: any): {
  serviceCategory: ServiceCategory | null;
  assetType: string | null;
} {
  const serviceCategory = inferServiceCategoryFromRiskDetail(d);

  const text = `${d?.systemType ?? ''} ${d?.assetName ?? ''} ${d?.title ?? ''} ${d?.name ?? ''}`.toUpperCase();

  // Prefer explicit fields if your risk JSON provides them
  const explicitAssetType =
    d?.assetType || d?.assetKey || d?.systemKey || d?.systemTypeKey || null;

  if (explicitAssetType) {
    return {
      serviceCategory,
      assetType: String(explicitAssetType).trim().toUpperCase(),
    };
  }

  // Heuristics (extend as needed)
  if (text.includes('WATER HEATER')) return { serviceCategory, assetType: 'WATER_HEATER' };
  if (text.includes('HVAC') || text.includes('FURNACE')) return { serviceCategory, assetType: 'HVAC' };
  if (text.includes('ROOF')) return { serviceCategory, assetType: 'ROOF' };
  if (text.includes('SMOKE') || text.includes('CO DETECTOR') || text.includes('CO2')) {
    return { serviceCategory, assetType: 'SMOKE_CO_DETECTORS' };
  }

  return { serviceCategory, assetType: null };
}

/**
 * Phase 8 coverage resolution:
 * Move from property-level to action-level matching using assetType / serviceCategory.
 *
 * IMPORTANT:
 * - This function is defensive about schema. It will work even if warranty doesn't have homeAsset/category.
 */
function resolveCoverageForAction(params: {
  warranties?: Array<{
    id: string;
    expiryDate: Date | string | null;
    // optional fields (schema-dependent)
    category?: any;
    homeAssetId?: string | null;
    homeAsset?: { assetType?: string | null } | null;
    assetType?: string | null; // in case warranty stores assetType directly
  }>;
  insurancePolicies?: Array<{
    id: string;
    expiryDate: Date | string | null;
  }>;
  serviceCategory: ServiceCategory | null;
  assetType: string | null;
}): CoverageInfo {
  const now = new Date();
  const warranties = params.warranties ?? [];
  const insurancePolicies = params.insurancePolicies ?? [];

  const isActive = (expiryDate: any) => {
    const exp = expiryDate ? new Date(expiryDate) : null;
    return Boolean(exp && exp > now);
  };

  const normalizeAsset = (v: any) => String(v ?? '').trim().toUpperCase();

  // 1) Exact asset match (HIGH)
  if (params.assetType) {
    const wanted = normalizeAsset(params.assetType);

    const assetWarranty = warranties.find((w) => {
      if (!isActive(w?.expiryDate)) return false;

      // Try multiple schema variants
      const wAsset =
        w?.homeAsset?.assetType ??
        (w as any)?.assetType ??
        (w as any)?.coveredAssetType ??
        null;

      return wAsset ? normalizeAsset(wAsset) === wanted : false;
    });

    if (assetWarranty) {
      const exp = assetWarranty.expiryDate ? new Date(assetWarranty.expiryDate as any) : null;
      return {
        hasCoverage: true,
        type: 'HOME_WARRANTY',
        expiresOn: exp,
        sourceId: assetWarranty.id,
        confidence: 'HIGH',
        matchedOn: 'ASSET',
        explanation: `Covered by warranty for ${wanted}.`,
      };
    }
  }

  // 2) Category match (PARTIAL)
  if (params.serviceCategory) {
    const wantedCategory = String(params.serviceCategory).toUpperCase();

    const categoryWarranty = warranties.find((w) => {
      if (!isActive(w?.expiryDate)) return false;

      const wCategory =
        (w as any)?.category ??
        (w as any)?.serviceCategory ??
        null;

      return wCategory ? String(wCategory).toUpperCase() === wantedCategory : false;
    });

    if (categoryWarranty) {
      const exp = categoryWarranty.expiryDate ? new Date(categoryWarranty.expiryDate as any) : null;
      return {
        hasCoverage: true,
        type: 'HOME_WARRANTY',
        expiresOn: exp,
        sourceId: categoryWarranty.id,
        confidence: 'PARTIAL',
        matchedOn: 'CATEGORY',
        explanation: `Possibly covered under ${wantedCategory} warranty scope.`,
      };
    }
  }

  // 3) Insurance fallback (UNKNOWN)
  const activeInsurance = insurancePolicies.find((p) => isActive(p?.expiryDate));
  if (activeInsurance) {
    const exp = activeInsurance.expiryDate ? new Date(activeInsurance.expiryDate as any) : null;
    return {
      hasCoverage: true,
      type: 'INSURANCE',
      expiresOn: exp,
      sourceId: activeInsurance.id,
      confidence: 'UNKNOWN',
      matchedOn: 'PROPERTY',
      explanation: `General insurance policy detected (coverage unknown for this specific asset).`,
    };
  }

  // 4) No coverage
  return {
    hasCoverage: false,
    type: 'NONE',
    expiresOn: null,
    sourceId: null,
    confidence: 'UNKNOWN',
    matchedOn: 'NONE',
    explanation: 'No applicable coverage found for this action.',
  };
}

function computeConfidence(input: {
  source: 'RISK' | 'CHECKLIST';
  riskLevel?: string | null;
  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;
  overdue?: boolean;
  unscheduledRecurring?: boolean;
  status?: string | null;
  suppressed: boolean;
  coverage?: CoverageInfo;
}): { score: number; level: 'HIGH' | 'MEDIUM' | 'LOW'; explanation: string[] } {
  let score = 0.5;
  const explanation: string[] = [];

  if (input.source === 'RISK') {
    if (input.riskLevel === 'CRITICAL') {
      score += 0.3;
      explanation.push('Critical risk level');
    }
    if (input.riskLevel === 'HIGH') {
      score += 0.2;
      explanation.push('High risk level');
    }
    if (
      input.age &&
      input.expectedLife &&
      input.age / input.expectedLife > 0.9
    ) {
      score += 0.2;
      explanation.push('Asset near end of expected life');
    }
    if (input.exposure && input.exposure > 5000) {
      score += 0.1;
      explanation.push('High financial exposure');
    }
  }

  if (input.source === 'CHECKLIST') {
    if (input.overdue) {
      score += 0.25;
      explanation.push('Task is overdue');
    }
    if (input.unscheduledRecurring) {
      score += 0.15;
      explanation.push('Recurring task not scheduled');
    }
    if (input.status === 'NEEDS_REVIEW') {
      score += 0.1;
      explanation.push('Task needs review');
    }
  }

  if (input.coverage?.hasCoverage) {
    score -= 0.15;
    explanation.push('Coverage reduces urgency');
  }
  if (input.suppressed) {
    score -= 0.3;
    explanation.push('Action is suppressed');
  }

  const finalScore = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  
  return {
    score: finalScore,
    level: finalScore >= 0.75 ? 'HIGH' : finalScore >= 0.5 ? 'MEDIUM' : 'LOW',
    explanation: explanation.length > 0 ? explanation : ['Standard confidence calculation'],
  };
}

function withDefaultConfidence(
  confidence?: OrchestratedAction['confidence']
): OrchestratedAction['confidence'] {
  return (
    confidence ?? {
      score: 0.5,
      level: 'MEDIUM',
      explanation: ['Default confidence applied'],
    }
  );
}

function buildSuppression(
  steps: DecisionTraceStep[],
  suppressed: boolean,
  reasons: SuppressionReasonEntry[]
): OrchestratedAction['suppression'] {
  steps.push({
    rule: 'SUPPRESSION_FINAL',
    outcome: suppressed ? 'APPLIED' : 'SKIPPED',
    details: suppressed ? { reasons: reasons.map((r) => r.reason) } : null,
  });

  return { suppressed, reasons };
}

/**
 * Risk JSON → OrchestratedAction (with Phase 8 coverage matching + booking suppression + trace)
 */
function mapRiskDetailToAction(params: {
  propertyId: string;
  d: any;
  index: number;

  // Phase 8: pass coverage sources, compute coverage per action
  warranties: Array<any>;
  insurancePolicies: Array<any>;

  bookingCategorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, { id: string; status: BookingStatus }>;
}): OrchestratedAction | null {
  const { propertyId, d, index, warranties, insurancePolicies, bookingCategorySet, bookingByCategory } = params;

  if (!isRiskActionable(d)) return null;

  const steps: DecisionTraceStep[] = [];
  steps.push({ rule: 'RISK_ACTIONABLE', outcome: 'APPLIED' });

  const assetName = String(d?.assetName ?? d?.title ?? d?.name ?? 'Risk Item');
  const systemType = d?.systemType ? String(d.systemType) : null;

  const categoryRaw = d?.category ?? d?.riskCategory ?? null;
  const category = categoryRaw ? String(categoryRaw) : null;

  const riskLevelRaw = d?.riskLevel ?? d?.severity ?? null;
  const riskLevel = riskLevelRaw ? (normalizeUpper(riskLevelRaw) as any) : null;

  const age = toNumberSafe(d?.age);
  const expectedLife = toNumberSafe(d?.expectedLife);
  const exposure = toNumberSafe(d?.riskDollar ?? d?.exposure ?? d?.replacementCost ?? d?.outOfPocketCost);

  const recommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0
      ? d.recommendedAction.trim()
      : typeof d?.actionCta === 'string' && d.actionCta.trim().length > 0
        ? d.actionCta.trim()
        : null;

  // Priority heuristic
  const level = normalizeUpper(riskLevel);
  const basePriority =
    level === 'CRITICAL' ? 100 :
    level === 'HIGH' ? 80 :
    level === 'ELEVATED' ? 60 :
    level === 'MODERATE' ? 40 :
    level === 'LOW' ? 20 : 30;

  // Phase 8: infer asset + category for coverage matching
  const { serviceCategory: inferredCategory, assetType } = inferAssetKey(d);

  steps.push({
    rule: 'RISK_INFER_ASSET_KEY',
    outcome: assetType || inferredCategory ? 'APPLIED' : 'SKIPPED',
    details: { assetType: assetType ?? null, serviceCategory: inferredCategory ?? null },
  });

  // Phase 8: compute coverage PER ACTION
  const coverage = resolveCoverageForAction({
    warranties,
    insurancePolicies,
    serviceCategory: inferredCategory,
    assetType,
  });

  steps.push({
    rule: 'COVERAGE_MATCHING',
    outcome: coverage.hasCoverage ? 'APPLIED' : 'SKIPPED',
    details: {
      type: coverage.type,
      confidence: coverage.confidence,
      matchedOn: coverage.matchedOn,
      explanation: coverage.explanation,
      sourceId: coverage.sourceId ?? null,
    },
  });

  // CTA rules (Phase 6 + Phase 8 improvement)
  // Keep your old label to avoid UI churn, but set up for confidence-aware UI.
  const cta =
    coverage.hasCoverage
      ? { show: true, label: 'Review coverage', reason: 'COVERED' as const }
      : recommendedAction
        ? { show: true, label: recommendedAction, reason: 'ACTION_REQUIRED' as const }
        : { show: false, label: null, reason: 'NONE' as const };

  const suppressionReasons: OrchestratedAction['suppression']['reasons'] = [];

  // IMPORTANT: covered does not suppress; it provides WHY + CTA adjustment
  if (coverage.hasCoverage) {
    const conf = coverage.confidence ?? 'UNKNOWN';
    const match = coverage.matchedOn ?? 'PROPERTY';

    suppressionReasons.push({
      reason: 'COVERED',
      message: `Coverage detected (${coverage.type}, ${conf}, matched on ${match}). CTA adjusted.`,
      relatedId: coverage.sourceId ?? null,
      relatedType: coverage.type === 'HOME_WARRANTY' ? 'WARRANTY' : coverage.type === 'INSURANCE' ? 'INSURANCE' : null,
    });

    steps.push({
      rule: 'COVERAGE_AWARE_CTA',
      outcome: 'APPLIED',
      details: { coverageType: coverage.type, confidence: conf, matchedOn: match },
    });
  } else {
    steps.push({
      rule: 'COVERAGE_AWARE_CTA',
      outcome: 'SKIPPED',
      details: { coverageType: 'NONE' },
    });
  }

  // BOOKING suppression: suppress action if a booking exists for inferred category
  let suppressedByBooking = false;
  if (inferredCategory && bookingCategorySet.has(inferredCategory)) {
    const b = bookingByCategory.get(inferredCategory);
    suppressedByBooking = true;

    suppressionReasons.push({
      reason: 'BOOKING_EXISTS',
      message: `Suppressed because an active booking exists for ${inferredCategory} (${b?.status}).`,
      relatedId: b?.id ?? null,
      relatedType: 'BOOKING',
    });

    steps.push({
      rule: 'BOOKING_SUPPRESSION',
      outcome: 'APPLIED',
      details: { serviceCategory: inferredCategory, bookingStatus: b?.status, bookingId: b?.id },
    });
  } else {
    steps.push({
      rule: 'BOOKING_SUPPRESSION',
      outcome: 'SKIPPED',
      details: inferredCategory ? { serviceCategory: inferredCategory } : { reason: 'NO_CATEGORY' },
    });
  }

  const suppression = buildSuppression(steps, suppressedByBooking, suppressionReasons);

  const confidenceRaw = computeConfidence({
    source: 'RISK',
    riskLevel,
    age,
    expectedLife,
    exposure,
    coverage,
    suppressed: suppression.suppressed,
  });

  return {
    id: `risk:${propertyId}:${systemType ?? 'unknown'}:${index}`,
    source: 'RISK',
    propertyId,
    title: assetName,
    description: recommendedAction ? `Recommended: ${recommendedAction}` : null,

    systemType,
    category,
    riskLevel,
    age,
    expectedLife,
    exposure,

    serviceCategory: inferredCategory,

    coverage,
    cta,
    confidence: withDefaultConfidence(confidenceRaw),
    suppression,
    decisionTrace: { steps },

    overdue: false,
    priority: basePriority,
    createdAt: safeParseDate(d?.createdAt) ?? null,
  };
}

/**
 * Checklist item → OrchestratedAction (with booking suppression + trace)
 * NOTE: Phase 8 is primarily for risk-driven actions. Checklist can be extended later.
 */
function mapChecklistItemToAction(params: {
  propertyId: string;
  item: any;
  bookingCategorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, { id: string; status: BookingStatus }>;
}): OrchestratedAction | null {
  const { propertyId, item, bookingCategorySet, bookingByCategory } = params;

  const steps: DecisionTraceStep[] = [];

  const { actionable, overdue, unscheduledRecurring } = isChecklistActionable(item);
  if (!actionable) return null;

  steps.push({
    rule: 'CHECKLIST_ACTIONABLE',
    outcome: 'APPLIED',
    details: { overdue, unscheduledRecurring },
  });

  const status = normalizeUpper(item?.status);

  // Priority heuristic
  let priority = overdue ? 90 : 50;
  if (status === 'NEEDS_REVIEW') priority = 85;
  if (status === 'IN_PROGRESS') priority = Math.max(priority, 70);
  if (unscheduledRecurring) priority = Math.max(priority, 75);

  const nextDueDate = safeParseDate(item?.nextDueDate);

  const ctaLabel =
    overdue ? 'Schedule / Complete now' :
    unscheduledRecurring ? 'Set schedule' :
    'Review';

  const serviceCategory: ServiceCategory | null = item?.serviceCategory
    ? (String(item.serviceCategory).trim().toUpperCase() as ServiceCategory)
    : null;

  const suppressionReasons: OrchestratedAction['suppression']['reasons'] = [];

  // BOOKING suppression
  let suppressedByBooking = false;
  if (serviceCategory && bookingCategorySet.has(serviceCategory)) {
    const b = bookingByCategory.get(serviceCategory);
    suppressedByBooking = true;

    suppressionReasons.push({
      reason: 'BOOKING_EXISTS',
      message: `Suppressed because an active booking exists for ${serviceCategory} (${b?.status}).`,
      relatedId: b?.id ?? null,
      relatedType: 'BOOKING',
    });

    steps.push({
      rule: 'BOOKING_SUPPRESSION',
      outcome: 'APPLIED',
      details: { serviceCategory, bookingStatus: b?.status, bookingId: b?.id },
    });
  } else {
    steps.push({
      rule: 'BOOKING_SUPPRESSION',
      outcome: 'SKIPPED',
      details: serviceCategory ? { serviceCategory } : { reason: 'NO_CATEGORY' },
    });
  }

  const suppression = buildSuppression(steps, suppressedByBooking, suppressionReasons);
  
  const confidenceRaw = computeConfidence({
    source: 'CHECKLIST',
    overdue,
    unscheduledRecurring,
    status,
    suppressed: suppression.suppressed,
  });

  return {
    id: `checklist:${propertyId}:${item?.id ?? 'unknown'}`,
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
  // 0) Booking context (Phase 5)
  const { categorySet: bookingCategorySet, bookingByCategory } =
    await getActiveBookingCategorySet(propertyId);

  // 1) Coverage sources (Phase 8)
  // NOTE: This select is defensive. If your Prisma schema doesn't have some fields,
  // you may need to remove them OR adjust to the actual model.
  const propertyCoverage = await prisma.property
    .findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        warranties: {
          select: {
            id: true,
            expiryDate: true,
            // Optional / schema-dependent:
            category: true as any,
            homeAssetId: true as any,
            homeAsset: { select: { assetType: true } } as any,
            assetType: true as any,
          } as any,
        },
        insurancePolicies: {
          select: {
            id: true,
            expiryDate: true,
          },
        },
      } as any,
    })
    .catch(() => null as any);

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
  countRiskActions(riskDetails); // keeps behavior aligned (not used directly below)

  // 3) Checklist items (include serviceCategory)
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
      },
    })
    .catch(() => []);

  countChecklistActions(checklistItems); // keeps behavior aligned (not used directly below)

  // 4) Build candidate actions (includes suppression + trace)
  const candidateRiskActions: OrchestratedAction[] = Array.isArray(riskDetails)
    ? (riskDetails
        .map((d: any, idx: number) =>
          mapRiskDetailToAction({
            propertyId,
            d,
            index: idx,
            warranties,
            insurancePolicies,
            bookingCategorySet,
            bookingByCategory,
          })
        )
        .filter(Boolean) as OrchestratedAction[])
    : [];

  const candidateChecklistActions: OrchestratedAction[] = checklistItems
    .map((i: any) =>
      mapChecklistItemToAction({
        propertyId,
        item: i,
        bookingCategorySet,
        bookingByCategory,
      })
    )
    .filter(Boolean) as OrchestratedAction[];

  const candidates = [...candidateRiskActions, ...candidateChecklistActions];

  // 5) Split actionable vs suppressed
  const suppressedActions = candidates.filter((a) => a.suppression?.suppressed);
  const actionable = candidates.filter((a) => !a.suppression?.suppressed);

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

  return {
    propertyId,
    pendingActionCount: actions.length,
    derivedFrom,
    actions,
    suppressedActions,
    counts: {
      riskActions,
      checklistActions,
      suppressedActions: suppressedActions.length,
    },
  };
}
