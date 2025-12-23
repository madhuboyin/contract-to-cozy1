// apps/backend/src/services/orchestration.service.ts

import { prisma } from '../lib/prisma';
import { ServiceCategory, BookingStatus, ChecklistItemStatus } from '@prisma/client';

type DerivedFrom = {
  riskAssessment: boolean;
  checklist: boolean;
};

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
};

export type SuppressionReason =
  | 'BOOKING_EXISTS'
  | 'COVERED'
  | 'NOT_ACTIONABLE'
  | 'UNKNOWN';

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
  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  // NEW: Suppression + decision trace (Gap 4/5)
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

  // actionable-only (non-breaking for UI)
  actions: OrchestratedAction[];

  // NEW: suppressed items for transparency (Gap 4)
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
  const ACTION_STATUSES = new Set(['NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW']);

  const riskLevel = normalizeUpper(d?.riskLevel ?? d?.severity);
  const status = normalizeUpper(d?.status);
  const hasRecommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;

  return Boolean(HIGH_LEVELS.has(riskLevel) || ACTION_STATUSES.has(status) || hasRecommendedAction);
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
 * Phase 6 coverage resolution (best-effort property-level).
 */
function resolveCoverageForAsset(
  warranties: Array<{ id: string; expiryDate: Date | string | null }> = [],
  insurancePolicies: Array<{ id: string; expiryDate: Date | string | null }> = [],
): CoverageInfo {
  const now = new Date();

  const activeWarranty = warranties.find(w => {
    const exp = w?.expiryDate ? new Date(w.expiryDate as any) : null;
    return exp && exp > now;
  });

  if (activeWarranty) {
    return {
      hasCoverage: true,
      type: 'HOME_WARRANTY',
      expiresOn: activeWarranty.expiryDate ? new Date(activeWarranty.expiryDate as any) : null,
      sourceId: activeWarranty.id,
    };
  }

  const activeInsurance = insurancePolicies.find(p => {
    const exp = p?.expiryDate ? new Date(p.expiryDate as any) : null;
    return exp && exp > now;
  });

  if (activeInsurance) {
    return {
      hasCoverage: true,
      type: 'INSURANCE',
      expiresOn: activeInsurance.expiryDate ? new Date(activeInsurance.expiryDate as any) : null,
      sourceId: activeInsurance.id,
    };
  }

  return { hasCoverage: false, type: 'NONE', expiresOn: null, sourceId: null };
}

/**
 * Booking suppression support:
 * Builds a set of categories that currently have an active booking for this property.
 */
async function getActiveBookingCategorySet(propertyId: string): Promise<{
  categorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, { id: string; status: BookingStatus }>;
}> {
  const bookings = await prisma.booking.findMany({
    where: {
      propertyId,
      status: { in: ACTIVE_BOOKING_STATUSES },
    },
    select: {
      id: true,
      status: true,
      category: true,
    },
  }).catch(() => []);

  const categorySet = new Set<ServiceCategory>();
  const bookingByCategory = new Map<ServiceCategory, { id: string; status: BookingStatus }>();

  for (const b of bookings) {
    if (!b?.category) continue;
    categorySet.add(b.category);
    // keep first (or latest) — for trace we just need one
    if (!bookingByCategory.has(b.category)) {
      bookingByCategory.set(b.category, { id: b.id, status: b.status });
    }
  }

  return { categorySet, bookingByCategory };
}

/**
 * Best-effort: infer ServiceCategory for risk item, if your risk JSON includes a serviceCategory-like value.
 * If it doesn't, we return null and booking-suppression won't apply to that risk item.
 */
function inferServiceCategoryFromRiskDetail(d: any): ServiceCategory | null {
  // If your risk JSON already has a serviceCategory field, prefer it
  const direct = d?.serviceCategory ?? d?.category;
  if (direct) {
    const candidate = String(direct).trim().toUpperCase();

    // Try direct enum match
    const values = Object.values(ServiceCategory) as string[];
    if (values.includes(candidate)) return candidate as ServiceCategory;
  }

  // Heuristic based on systemType / assetName
  const text = `${d?.systemType ?? ''} ${d?.assetName ?? ''} ${d?.title ?? ''}`.toUpperCase();

  const values = Object.values(ServiceCategory) as string[];

  const tryMatch = (key: string) => (values.includes(key) ? (key as ServiceCategory) : null);

  if (text.includes('HVAC') || text.includes('FURNACE')) return tryMatch('HVAC');
  if (text.includes('WATER HEATER')) return tryMatch('PLUMBING');
  if (text.includes('ROOF')) return tryMatch('ROOFING');

  return null;
}

function buildSuppression(
  steps: DecisionTraceStep[],
  suppressed: boolean,
  reasons: SuppressionReasonEntry[]
): OrchestratedAction['suppression'] {
  // Ensure we always record suppression outcome as a trace step
  steps.push({
    rule: 'SUPPRESSION_FINAL',
    outcome: suppressed ? 'APPLIED' : 'SKIPPED',
    details: suppressed ? { reasons: reasons.map(r => r.reason) } : null,
  });

  return { suppressed, reasons };
}

/**
 * Risk JSON → OrchestratedAction (with coverage + booking suppression + trace)
 */
function mapRiskDetailToAction(params: {
  propertyId: string;
  d: any;
  index: number;
  coverage: CoverageInfo;
  bookingCategorySet: Set<ServiceCategory>;
  bookingByCategory: Map<ServiceCategory, { id: string; status: BookingStatus }>;
}): OrchestratedAction | null {
  const { propertyId, d, index, coverage, bookingCategorySet, bookingByCategory } = params;

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

  // CTA rules (Phase 6)
  const cta =
    coverage.hasCoverage
      ? { show: true, label: 'Review coverage', reason: 'COVERED' as const }
      : recommendedAction
        ? { show: true, label: recommendedAction, reason: 'ACTION_REQUIRED' as const }
        : { show: false, label: null, reason: 'NONE' as const };

  // Booking suppression (Phase 5)
  const inferredCategory = inferServiceCategoryFromRiskDetail(d);
  if (inferredCategory) {
    steps.push({
      rule: 'RISK_INFER_SERVICE_CATEGORY',
      outcome: 'APPLIED',
      details: { serviceCategory: inferredCategory },
    });
  } else {
    steps.push({
      rule: 'RISK_INFER_SERVICE_CATEGORY',
      outcome: 'SKIPPED',
      details: { reason: 'NO_MATCH' },
    });
  }

  const suppressionReasons: OrchestratedAction['suppression']['reasons'] = [];

  // If covered, we DO NOT suppress the action; we only change CTA + reason.
  if (coverage.hasCoverage) {
    suppressionReasons.push({
      reason: 'COVERED',
      message: `Coverage detected (${coverage.type}). CTA adjusted.`,
      relatedId: coverage.sourceId ?? null,
      relatedType: coverage.type === 'HOME_WARRANTY' ? 'WARRANTY' : 'INSURANCE',
    });
    steps.push({
      rule: 'COVERAGE_AWARE_CTA',
      outcome: 'APPLIED',
      details: { coverageType: coverage.type },
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

    suppression,
    decisionTrace: { steps },

    overdue: false,
    priority: basePriority,
    createdAt: safeParseDate(d?.createdAt) ?? null,
  };
}

/**
 * Checklist item → OrchestratedAction (with booking suppression + trace)
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

  steps.push({ rule: 'CHECKLIST_ACTIONABLE', outcome: 'APPLIED', details: { overdue, unscheduledRecurring } });

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

  // BOOKING suppression: if a booking exists for this checklist serviceCategory
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

    // checklist items do not use coverage (kept consistent with Phase 6)
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null, sourceId: null },
    cta: { show: true, label: ctaLabel, reason: 'ACTION_REQUIRED' },

    suppression,
    decisionTrace: { steps },

    priority,
    overdue,
    createdAt: safeParseDate(item?.createdAt) ?? null,
  };
}

/**
 * Phase 5 + 6 + Gap 4/5:
 * - actions[] remains actionable-only (non-breaking)
 * - suppressedActions[] provides transparency + trace
 */
export async function getOrchestrationSummary(propertyId: string): Promise<OrchestrationSummary> {
  // 0) Booking context (Phase 5)
  const { categorySet: bookingCategorySet, bookingByCategory } = await getActiveBookingCategorySet(propertyId);

  // 1) Coverage context (Phase 6)
  // If your schema does NOT relate warranties/policies to Property, tell me and we’ll switch query.
  const propertyCoverage = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      warranties: { select: { id: true, expiryDate: true } },
      insurancePolicies: { select: { id: true, expiryDate: true } },
    },
  }).catch(() => null as any);

  const warranties = propertyCoverage?.warranties ?? [];
  const insurancePolicies = propertyCoverage?.insurancePolicies ?? [];
  const coverage = resolveCoverageForAsset(warranties, insurancePolicies);

  // 2) Risk report
  const riskReport = await prisma.riskAssessmentReport.findFirst({
    where: { propertyId },
    orderBy: { lastCalculatedAt: 'desc' },
    select: { details: true, lastCalculatedAt: true },
  }).catch(() => null);

  const riskDetails: any[] = (riskReport as any)?.details ?? [];
  const riskCountRaw = countRiskActions(riskDetails);

  // 3) Checklist items (FIX: include serviceCategory to avoid compile error)
  const checklistItems = await prisma.checklistItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      nextDueDate: true,
      isRecurring: true,
      createdAt: true,
      serviceCategory: true, // ✅ FIX for your compile error
    },
  }).catch(() => []);

  const checklistCountRaw = countChecklistActions(checklistItems);

  // 4) Build candidate actions (includes suppression + trace)
  const candidateRiskActions: OrchestratedAction[] = Array.isArray(riskDetails)
    ? riskDetails
        .map((d: any, idx: number) =>
          mapRiskDetailToAction({
            propertyId,
            d,
            index: idx,
            coverage,
            bookingCategorySet,
            bookingByCategory,
          })
        )
        .filter(Boolean) as OrchestratedAction[]
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

  // 5) Split actionable vs suppressed (Gap 4 fix)
  const suppressedActions = candidates.filter(a => a.suppression?.suppressed);
  const actionable = candidates.filter(a => !a.suppression?.suppressed);

  // 6) Sort actionable (as before)
  const actions = actionable.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.overdue !== a.overdue) return b.overdue ? 1 : -1;
    const ad = a.nextDueDate ? a.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.nextDueDate ? b.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  // 7) Counts should reflect what is actually actionable (enforced intelligence)
  const riskActions = actions.filter(a => a.source === 'RISK').length;
  const checklistActions = actions.filter(a => a.source === 'CHECKLIST').length;

  const derivedFrom: DerivedFrom = {
    riskAssessment: Boolean(riskReport),
    checklist: checklistItems.length > 0,
  };

  return {
    propertyId,
    pendingActionCount: actions.length, // ✅ enforced, booking-aware
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
