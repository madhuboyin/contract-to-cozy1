// apps/backend/src/services/orchestration.service.ts

import { prisma } from '../lib/prisma';
import { RiskCategory } from '@prisma/client';

type DerivedFrom = {
  riskAssessment: boolean;
  checklist: boolean;
};

export type OrchestrationSummary = {
  propertyId: string;
  pendingActionCount: number;
  derivedFrom: DerivedFrom;

  // ✅ Phase 6 (Non-breaking extension): detailed actions for UI
  actions: OrchestratedAction[];

  // Optional rollups to help UI quickly render counts
  counts: {
    riskActions: number;
    checklistActions: number;
  };
};

export type CoverageInfo = {
  hasCoverage: boolean;
  type: 'HOME_WARRANTY' | 'INSURANCE' | 'NONE';
  expiresOn: Date | null;
  sourceId?: string | null;
};

export type OrchestratedAction = {
  // Stable identity for UI keys
  id: string;

  source: 'RISK' | 'CHECKLIST';
  propertyId: string;

  // Display fields (generic + compatible)
  title: string;
  description?: string | null;

  // ✅ Risk-specific (present when source === 'RISK')
  systemType?: string | null;
  category?: string | null;
  riskLevel?: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | string | null;

  // Helpful risk facts (best-effort)
  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;

  // ✅ Checklist-specific (present when source === 'CHECKLIST')
  checklistItemId?: string | null;
  status?: string | null;
  nextDueDate?: Date | null;
  isRecurring?: boolean | null;

  // ✅ Phase 6 extensions
  coverage?: CoverageInfo;
  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  // UX sorting hints
  priority: number; // higher = more urgent
  overdue: boolean;
  createdAt?: Date | null;
};

// Keep in sync with frontend intent: "actionable" = overdue OR unscheduled recurring OR active review states
const ACTIVE_TASK_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'NEEDS_REVIEW',
  'OVERDUE',
] as const;

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

function normalizeRiskLevel(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

function normalizeStatus(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

function toNumberSafe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Risk details are stored as JSON in many implementations.
 * We keep this tolerant: we count "high-priority" risk details based on any of:
 * - riskLevel in ['HIGH','CRITICAL']
 * - status in ['NEEDS_ATTENTION','ACTION_REQUIRED','MISSING_DATA','NEEDS_REVIEW']
 * - recommendedAction exists and non-empty
 */
function isRiskActionable(d: any): boolean {
  const HIGH_LEVELS = new Set(['HIGH', 'CRITICAL']);
  const ACTION_STATUSES = new Set(['NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW']);

  const riskLevel = normalizeRiskLevel(d?.riskLevel ?? d?.severity);
  const status = normalizeStatus(d?.status);
  const hasRecommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;

  const isHigh = HIGH_LEVELS.has(riskLevel);
  const isActionStatus = ACTION_STATUSES.has(status);

  return Boolean(isHigh || isActionStatus || hasRecommendedAction);
}

function countRiskActions(details: any[]): number {
  if (!Array.isArray(details)) return 0;
  let count = 0;
  for (const d of details) {
    if (isRiskActionable(d)) count += 1;
  }
  return count;
}

/**
 * Counts checklist items that require attention:
 * - status is in ACTIVE_TASK_STATUSES AND
 *   - nextDueDate exists and is in the past  OR
 *   - isRecurring = true and nextDueDate is missing (unscheduled recurring task)
 */
function isChecklistActionable(item: any): { actionable: boolean; overdue: boolean; unscheduledRecurring: boolean } {
  const status = normalizeStatus(item?.status);
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
 * Coverage resolution (Phase 6)
 * NOTE:
 * - This is intentionally "best-effort" + non-breaking:
 *   - Warranty/Insurance are treated as property-level coverage by default.
 *   - Later you can refine to per-asset coverage if you store coveredSystemTypes.
 */
function resolveCoverageForAsset(
  systemType: string | null | undefined,
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
 * Convert risk detail JSON → Phase 6 orchestrated action.
 * Tolerant mapper: supports your RiskAssessment JSON shape (assetName/systemType/category/etc).
 */
function mapRiskDetailToAction(
  propertyId: string,
  d: any,
  coverage: CoverageInfo,
  index: number,
): OrchestratedAction | null {
  if (!isRiskActionable(d)) return null;

  const assetName = String(d?.assetName ?? d?.title ?? d?.name ?? 'Risk Item');
  const systemType = d?.systemType ? String(d.systemType) : null;

  const categoryRaw = d?.category ?? d?.riskCategory ?? null;
  const category = categoryRaw ? String(categoryRaw) : null;

  const riskLevelRaw = d?.riskLevel ?? d?.severity ?? null;
  const riskLevel = riskLevelRaw ? (normalizeRiskLevel(riskLevelRaw) as any) : null;

  const age = toNumberSafe(d?.age);
  const expectedLife = toNumberSafe(d?.expectedLife);
  const exposure = toNumberSafe(d?.riskDollar ?? d?.exposure ?? d?.outOfPocketCost);

  const recommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0
      ? d.recommendedAction.trim()
      : typeof d?.actionCta === 'string' && d.actionCta.trim().length > 0
        ? d.actionCta.trim()
        : null;

  // Priority heuristic (non-breaking, UI-friendly)
  // CRITICAL > HIGH > ELEVATED > MODERATE > LOW
  const level = normalizeRiskLevel(riskLevel);
  const basePriority =
    level === 'CRITICAL' ? 100 :
    level === 'HIGH' ? 80 :
    level === 'ELEVATED' ? 60 :
    level === 'MODERATE' ? 40 :
    level === 'LOW' ? 20 : 30;

  // CTA rules (Phase 6)
  // If covered: still show action but CTA indicates coverage.
  const cta =
    coverage.hasCoverage
      ? { show: true, label: 'Review coverage', reason: 'COVERED' as const }
      : recommendedAction
        ? { show: true, label: recommendedAction, reason: 'ACTION_REQUIRED' as const }
        : { show: false, label: null, reason: 'NONE' as const };

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

    coverage,
    cta,

    // Risk items aren't "overdue" by date; keep false.
    overdue: false,
    priority: basePriority,
    createdAt: safeParseDate(d?.createdAt) ?? null,
  };
}

/**
 * Convert checklist item → orchestrated action.
 */
function mapChecklistItemToAction(propertyId: string, item: any): OrchestratedAction | null {
  const { actionable, overdue, unscheduledRecurring } = isChecklistActionable(item);
  if (!actionable) return null;

  const status = normalizeStatus(item?.status);

  // Priority heuristic: overdue > needs review > in progress > scheduled/pending
  let priority = overdue ? 90 : 50;
  if (status === 'NEEDS_REVIEW') priority = 85;
  if (status === 'IN_PROGRESS') priority = Math.max(priority, 70);
  if (unscheduledRecurring) priority = Math.max(priority, 75);

  const nextDueDate = safeParseDate(item?.nextDueDate);

  const ctaLabel =
    overdue ? 'Schedule / Complete now' :
    unscheduledRecurring ? 'Set schedule' :
    'Review';

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

    // Coverage does not apply to generic checklist items
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null, sourceId: null },
    cta: { show: true, label: ctaLabel, reason: 'ACTION_REQUIRED' },

    priority,
    overdue,
    createdAt: safeParseDate(item?.createdAt) ?? null,
  };
}

/**
 * Phase 6:
 * - Non-breaking extension: summary still returns pendingActionCount + derivedFrom
 * - Adds actions[] with coverage + CTA (best-effort)
 */
export async function getOrchestrationSummary(propertyId: string): Promise<OrchestrationSummary> {
  // 0) Pull property coverage (warranties + insurance) for coverage computations
  // NOTE: this assumes Warranty/InsurancePolicy relate to Property (as in your RiskAssessment.service include)
  // If your schema ties warranty/policy to homeownerProfile only, this still works if you also store propertyId.
  const propertyCoverage = await prisma.property
    .findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        warranties: { select: { id: true, expiryDate: true } },
        insurancePolicies: { select: { id: true, expiryDate: true } },
      },
    })
    .catch(() => null as any);

  const warranties = propertyCoverage?.warranties ?? [];
  const insurancePolicies = propertyCoverage?.insurancePolicies ?? [];

  // 1) Pull latest risk report (if exists)
  const riskReport = await prisma.riskAssessmentReport
    .findFirst({
      where: { propertyId },
      orderBy: { lastCalculatedAt: 'desc' },
      select: {
        details: true,
        lastCalculatedAt: true,
      },
    })
    .catch(() => null);

  const riskDetails = (riskReport as any)?.details ?? [];
  const riskCount = countRiskActions(riskDetails);

  // 2) Pull checklist items for this property
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
      },
    })
    .catch(() => []);

  const checklistCount = countChecklistActions(checklistItems);

  // 3) Build actions (Phase 6)
  const riskActions: OrchestratedAction[] = Array.isArray(riskDetails)
    ? riskDetails
        .map((d: any, idx: number) => {
          const sysType = d?.systemType ? String(d.systemType) : null;
          const coverage = resolveCoverageForAsset(sysType, warranties, insurancePolicies);
          return mapRiskDetailToAction(propertyId, d, coverage, idx);
        })
        .filter(Boolean) as OrchestratedAction[]
    : [];

  const checklistActions: OrchestratedAction[] = checklistItems
    .map(i => mapChecklistItemToAction(propertyId, i))
    .filter(Boolean) as OrchestratedAction[];

  // 4) Merge + sort (highest priority first, then overdue, then nearest due date)
  const actions = [...riskActions, ...checklistActions].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.overdue !== a.overdue) return b.overdue ? 1 : -1;
    const ad = a.nextDueDate ? a.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.nextDueDate ? b.nextDueDate.getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  const derivedFrom: DerivedFrom = {
    riskAssessment: Boolean(riskReport),
    checklist: checklistItems.length > 0,
  };

  return {
    propertyId,
    pendingActionCount: riskCount + checklistCount,
    derivedFrom,
    actions,
    counts: {
      riskActions: riskCount,
      checklistActions: checklistCount,
    },
  };
}
