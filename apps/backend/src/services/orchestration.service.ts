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
  // compare by day (not time)
  today.setHours(0, 0, 0, 0);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime() < today.getTime();
}

/**
 * Risk details are stored as JSON in many implementations.
 * We keep this tolerant: we count "high-priority" risk details based on any of:
 * - riskLevel in ['HIGH','CRITICAL']
 * - status in ['NEEDS_ATTENTION','ACTION_REQUIRED','MISSING_DATA']
 * - recommendedAction exists and non-empty
 */
function countRiskActions(details: any[]): number {
  if (!Array.isArray(details)) return 0;

  const HIGH_LEVELS = new Set(['HIGH', 'CRITICAL']);
  const ACTION_STATUSES = new Set(['NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW']);

  let count = 0;

  for (const d of details) {
    const riskLevel = (d?.riskLevel ?? d?.severity ?? '').toString().toUpperCase();
    const status = (d?.status ?? '').toString().toUpperCase();
    const hasRecommendedAction =
      typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;

    const isHigh = HIGH_LEVELS.has(riskLevel);
    const isActionStatus = ACTION_STATUSES.has(status);

    if (isHigh || isActionStatus || hasRecommendedAction) {
      count += 1;
    }
  }
  return count;
}

/**
 * Counts checklist items that require attention:
 * - status is in ACTIVE_TASK_STATUSES AND
 *   - nextDueDate exists and is in the past  OR
 *   - isRecurring = true and nextDueDate is missing (unscheduled recurring task)
 */
function countChecklistActions(items: any[]): number {
  if (!Array.isArray(items)) return 0;

  let count = 0;

  for (const item of items) {
    const status = (item?.status ?? '').toString().toUpperCase();
    const isActive = ACTIVE_TASK_STATUSES.includes(status as any);

    if (!isActive) continue;

    const nextDue = safeParseDate(item?.nextDueDate);
    const isRecurring = Boolean(item?.isRecurring);

    const overdue = nextDue ? isPastDate(nextDue) : false;
    const unscheduledRecurring = isRecurring && !nextDue;

    if (overdue || unscheduledRecurring) {
      count += 1;
    }
  }
  return count;
}

export async function getOrchestrationSummary(propertyId: string): Promise<OrchestrationSummary> {
  // 1) Pull latest risk report (if exists)
  // NOTE: adjust model name if yours differs (RiskAssessmentReport vs riskAssessmentReport)
  const riskReport = await prisma.riskAssessmentReport.findFirst({
    where: { propertyId },
    orderBy: { lastCalculatedAt: 'desc' },
    select: { details: true },
  }).catch(() => null);

  const riskDetails = (riskReport as any)?.details ?? [];
  const riskCount = countRiskActions(riskDetails);

  // 2) Pull checklist items for this property
  const checklistItems = await prisma.checklistItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      status: true,
      nextDueDate: true,
      isRecurring: true,
    },
  }).catch(() => []);

  const checklistCount = countChecklistActions(checklistItems);

  const derivedFrom: DerivedFrom = {
    riskAssessment: Boolean(riskReport),
    checklist: checklistItems.length > 0,
  };

  return {
    propertyId,
    pendingActionCount: riskCount + checklistCount,
    derivedFrom,
  };
}
