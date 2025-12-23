// apps/backend/src/services/orchestration.service.ts

import { prisma } from '../lib/prisma';

type DerivedFrom = {
  riskAssessment: boolean;
  checklist: boolean;
};

export type OrchestrationSummary = {
  propertyId: string;
  pendingActionCount: number;
  derivedFrom: DerivedFrom;

  // Phase 6
  actions: OrchestratedAction[];

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
  id: string;
  source: 'RISK' | 'CHECKLIST';
  propertyId: string;

  title: string;
  description?: string | null;

  systemType?: string | null;
  category?: string | null;
  riskLevel?: string | null;

  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;

  checklistItemId?: string | null;
  status?: string | null;
  nextDueDate?: Date | null;
  isRecurring?: boolean | null;

  coverage?: CoverageInfo;
  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  priority: number;
  overdue: boolean;
  createdAt?: Date | null;
};

// ----------------------------
// Constants
// ----------------------------
const ACTIVE_TASK_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'NEEDS_REVIEW',
  'OVERDUE',
] as const;

const ACTIVE_BOOKING_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'DISPUTED'] as const;

// ----------------------------
// Helpers
// ----------------------------
function safeParseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPastDate(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime() < today.getTime();
}

function normalize(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

function toNumberSafe(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------
// Risk helpers
// ----------------------------
function isRiskActionable(d: any): boolean {
  const level = normalize(d?.riskLevel ?? d?.severity);
  const status = normalize(d?.status);

  if (['HIGH', 'CRITICAL'].includes(level)) return true;
  if (['NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW'].includes(status)) return true;

  return typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;
}

function countRiskActions(details: any[]): number {
  return Array.isArray(details) ? details.filter(isRiskActionable).length : 0;
}

// ----------------------------
// Checklist helpers
// ----------------------------
function isChecklistActionable(item: any) {
  const status = normalize(item?.status);
  if (!ACTIVE_TASK_STATUSES.includes(status as any)) {
    return { actionable: false, overdue: false };
  }

  const nextDue = safeParseDate(item?.nextDueDate);
  const overdue = nextDue ? isPastDate(nextDue) : false;
  const unscheduledRecurring = Boolean(item?.isRecurring) && !nextDue;

  return {
    actionable: overdue || unscheduledRecurring,
    overdue,
  };
}

function countChecklistActions(items: any[]): number {
  return items.filter(i => isChecklistActionable(i).actionable).length;
}

// ----------------------------
// Coverage (Phase 6)
// ----------------------------
function resolveCoverageForAsset(
  systemType: string | null,
  warranties: any[] = [],
  insurancePolicies: any[] = [],
): CoverageInfo {
  const now = new Date();

  const warranty = warranties.find(w => w.expiryDate && new Date(w.expiryDate) > now);
  if (warranty) {
    return {
      hasCoverage: true,
      type: 'HOME_WARRANTY',
      expiresOn: new Date(warranty.expiryDate),
      sourceId: warranty.id,
    };
  }

  const insurance = insurancePolicies.find(p => p.expiryDate && new Date(p.expiryDate) > now);
  if (insurance) {
    return {
      hasCoverage: true,
      type: 'INSURANCE',
      expiresOn: new Date(insurance.expiryDate),
      sourceId: insurance.id,
    };
  }

  return { hasCoverage: false, type: 'NONE', expiresOn: null };
}

// ----------------------------
// Action mappers
// ----------------------------
function mapRiskDetailToAction(
  propertyId: string,
  d: any,
  coverage: CoverageInfo,
  index: number,
): OrchestratedAction | null {
  if (!isRiskActionable(d)) return null;

  const level = normalize(d?.riskLevel ?? d?.severity);

  const priority =
    level === 'CRITICAL' ? 100 :
    level === 'HIGH' ? 80 :
    level === 'ELEVATED' ? 60 :
    level === 'MODERATE' ? 40 : 20;

  return {
    id: `risk:${propertyId}:${d?.systemType ?? index}`,
    source: 'RISK',
    propertyId,

    title: String(d?.assetName ?? d?.title ?? 'Risk Item'),
    description: d?.recommendedAction ?? null,

    systemType: d?.systemType ?? null,
    category: d?.category ?? null,
    riskLevel: level,

    age: toNumberSafe(d?.age),
    expectedLife: toNumberSafe(d?.expectedLife),
    exposure: toNumberSafe(d?.riskDollar ?? d?.exposure),

    coverage,
    cta: coverage.hasCoverage
      ? { show: true, label: 'Review coverage', reason: 'COVERED' }
      : d?.recommendedAction
        ? { show: true, label: d.recommendedAction, reason: 'ACTION_REQUIRED' }
        : { show: false, label: null, reason: 'NONE' },

    overdue: false,
    priority,
    createdAt: safeParseDate(d?.createdAt),
  };
}

function mapChecklistItemToAction(propertyId: string, item: any): OrchestratedAction | null {
  const { actionable, overdue } = isChecklistActionable(item);
  if (!actionable) return null;

  return {
    id: `checklist:${propertyId}:${item.id}`,
    source: 'CHECKLIST',
    propertyId,

    title: item.title ?? 'Checklist Item',
    description: item.description ?? null,

    checklistItemId: item.id,
    status: normalize(item.status),
    nextDueDate: safeParseDate(item.nextDueDate),
    isRecurring: Boolean(item.isRecurring),

    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    cta: { show: true, label: overdue ? 'Complete now' : 'Review', reason: 'ACTION_REQUIRED' },

    priority: overdue ? 90 : 60,
    overdue,
    createdAt: safeParseDate(item.createdAt),
  };
}

// ============================================================================
// MAIN — Phase 5 + Phase 6
// ============================================================================
export async function getOrchestrationSummary(propertyId: string): Promise<OrchestrationSummary> {
  // 1) Coverage
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      warranties: { select: { id: true, expiryDate: true } },
      insurancePolicies: { select: { id: true, expiryDate: true } },
    },
  });

  // 2) Risk
  const riskReport = await prisma.riskAssessmentReport.findFirst({
    where: { propertyId },
    orderBy: { lastCalculatedAt: 'desc' },
    select: { details: true },
  });

  const riskDetails = (riskReport as any)?.details ?? [];

  // 3) Checklist
  const checklistItems = await prisma.checklistItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      serviceCategory: true,
      nextDueDate: true,
      isRecurring: true,
      createdAt: true,
    },
  });

  // 4) BOOKINGS — Phase 5
  const activeBookings = await prisma.booking.findMany({
    where: {
      propertyId,
      status: { in: ACTIVE_BOOKING_STATUSES as any },
    },
    select: {
      category: true,
    },
  });

  const suppressedCategories = new Set(
    activeBookings.map(b => String(b.category))
  );

  // 5) Build actions
  const riskActions = riskDetails
    .map((d: any, i: number) =>
      suppressedCategories.has(String(d?.category))
        ? null
        : mapRiskDetailToAction(
            propertyId,
            d,
            resolveCoverageForAsset(d?.systemType, property?.warranties, property?.insurancePolicies),
            i,
          )
    )
    .filter(Boolean) as OrchestratedAction[];

  const checklistActions = checklistItems
    .map(i =>
      suppressedCategories.has(String(i?.serviceCategory))
        ? null
        : mapChecklistItemToAction(propertyId, i)
    )
    .filter(Boolean) as OrchestratedAction[];

  const actions = [...riskActions, ...checklistActions].sort((a, b) => b.priority - a.priority);

  return {
    propertyId,
    pendingActionCount: actions.length,
    derivedFrom: {
      riskAssessment: Boolean(riskReport),
      checklist: checklistItems.length > 0,
    },
    actions,
    counts: {
      riskActions: riskActions.length,
      checklistActions: checklistActions.length,
    },
  };
}
