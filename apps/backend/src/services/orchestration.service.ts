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
import { ServiceCategory, BookingStatus } from '@prisma/client';
import { OrchestrationSuppressionService, SuppressionSource } from './orchestrationSuppression.service';
import { computeActionKey } from './orchestrationActionKey';
import { getPropertySnoozes, ActiveSnooze } from './orchestrationSnooze.service';

// PHASE 2.3 INTEGRATION
import { createTaskFromActionCenter } from './orchestrationIntegration.service';

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
  relatedType?: 'BOOKING' | 'WARRANTY' | 'INSURANCE' | 'CHECKLIST' | null;
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

export type OrchestratedAction = {
  id: string;
  actionKey: string;
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
  snoozedActions: OrchestratedAction[];

  counts: {
    riskActions: number;
    checklistActions: number;
    suppressedActions: number;
    snoozedActions: number;
  };
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
  console.log('🔄 Creating task from orchestrated action:', {
    userId,
    actionKey: action.actionKey,
    source: action.source,
    title: action.title,
  });

  // Calculate nextDueDate based on priority/risk level
  let nextDueDate: Date;
  const now = new Date();

  if (action.riskLevel === 'CRITICAL' || action.riskLevel === 'HIGH') {
    // Urgent: 1 week
    nextDueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (action.nextDueDate) {
    // Use existing due date if available
    nextDueDate = new Date(action.nextDueDate);
  } else {
    // Default: 1 month
    nextDueDate = new Date(now.setMonth(now.getMonth() + 1));
  }

  // Route to segment-specific service
  const result = await createTaskFromActionCenter({
    userId,
    propertyId: action.propertyId,
    title: action.title,
    description: action.description || undefined,
    assetType: action.systemType || undefined,
    priority: mapRiskLevelToPriority(action.riskLevel),
    riskLevel: action.riskLevel || undefined,
    serviceCategory: action.serviceCategory || undefined,
    estimatedCost: toNumberSafe(action.exposure) || undefined,
    nextDueDate: nextDueDate.toISOString(),
    actionKey: action.actionKey,
  });

  console.log('✅ Task created from orchestration:', {
    taskId: result.taskId,
    source: result.source,
    deduped: result.deduped,
  });

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

  if (params.source === 'RISK') {
    if (params.riskLevel === 'CRITICAL' || params.riskLevel === 'HIGH') {
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
  const riskLevel = String(d.riskLevel ?? 'MODERATE');

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
  steps.push({ rule: 'RISK_ACTIONABLE', outcome: 'APPLIED' });
  if (suppression.suppressed) {
    steps.push({ rule: 'SUPPRESSION_CHECK', outcome: 'APPLIED' });
  }

  const priority = riskLevel === 'CRITICAL' ? 100 : riskLevel === 'HIGH' ? 80 : 50;
  const exposure = toNumberSafe(d.exposure ?? d.outOfPocketCost ?? d.replacementCost);

  const confidenceRaw = computeConfidence({
    source: 'RISK',
    riskLevel,
    exposure: exposure ?? undefined,
    suppressed: suppression.suppressed,
  });

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
    snooze: snooze ? {
      snoozedAt: snooze.snoozedAt.toISOString(),
      snoozeUntil: snooze.snoozeUntil.toISOString(),
      snoozeReason: snooze.snoozeReason,
      daysRemaining: snooze.daysRemaining,
    } : undefined,
    decisionTrace: { steps },

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
  const actionKey = computeActionKey({
    propertyId,
    source: 'CHECKLIST',
    orchestrationActionId: null,
    checklistItemId: item?.id ?? null,
    serviceCategory,
    systemType: null,
    category: null,
  });
  
  const suppressionSource = await OrchestrationSuppressionService.resolveSuppressionSource({
    propertyId,
    actionKey,
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

  const storedKey = item?.actionKey;
  const finalActionKey = storedKey || actionKey;

  console.log('🔍 CHECKLIST ACTION KEY DECISION:', {
    itemId: item?.id,
    title: item?.title,
    storedKey: storedKey,
    computedKey: actionKey,
    finalKey: finalActionKey,
    usedStored: !!storedKey,
  });

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

  console.log('🔍 RISK REPORT DATA:', {
    reportExists: !!riskReport,
    detailsCount: riskDetails.length,
    details: riskDetails.map((d, i) => ({
      index: i,
      assetName: d?.assetName,
      systemType: d?.systemType,
      riskLevel: d?.riskLevel,
      actionable: d?.riskLevel && d?.riskLevel !== 'LOW',
    })),
  });

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

  console.log('🔍 RAW CHECKLIST ITEMS FROM DB:', JSON.stringify(checklistItems.map(item => ({
    id: item.id,
    title: item.title,
    actionKey: item.actionKey,
    hasActionKey: !!item.actionKey,
  })), null, 2));

  // 4) Build candidate actions
  const candidateRiskActions: OrchestratedAction[] = Array.isArray(riskDetails)
  ? (await Promise.all(
      riskDetails.map((d: any, idx: number) => {
        console.log(`🔍 Processing risk item ${idx}:`, {
          assetName: d?.assetName,
          systemType: d?.systemType,
          willMap: !!d,
        });
        
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

  console.log('🔍 RISK ACTIONS CREATED:', candidateRiskActions.length);

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

      console.log('🔍 RESOLVED SUPPRESSION SOURCE FOR RISK:', {
        actionKey: action.actionKey,
        foundSourceType: source?.type || 'NONE',
        checklistItemId: source?.type === 'CHECKLIST_ITEM' ? source.checklistItem.id : null,
      });

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
  };
}