import { prisma } from '../lib/prisma';
import { getPropertyById } from './property.service';
import { detectCoverageGaps, type CoverageGapResult } from './coverageGap.service';
import type {
  DecisionInsightDTO,
  ExecutionItemDTO,
  ResolutionActionDTO,
  ResolutionCaseDTO,
  ResolutionCenterPayloadDTO,
} from '../types/resolution-center.types';

const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;
const HEALTH_INSIGHT_STATUSES = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];
const CURRENT_REPLACE_REPAIR_MARKER = 'CURRENT';

type ReplaceRepairResolutionRecord = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  inventoryItemId: string;
  currentMarker?: string | null;
  status: 'READY' | 'STALE' | 'ERROR';
  verdict: 'REPLACE_NOW' | 'REPLACE_SOON' | 'REPAIR_AND_MONITOR' | 'REPAIR_ONLY';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  summary?: string | null;
  computedAt: Date;
  inventoryItem?: {
    id: string;
    name: string;
    category?: string | null;
  } | null;
};

type ReplaceRepairJourneyRecord = {
  id: string;
  inventoryItemId: string | null;
  currentStepKey: string | null;
  issueType: string | null;
  updatedAt: Date;
  primarySignal?: {
    signalIntentFamily: string;
  } | null;
};

type CoverageAnalysisRecord = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  status: 'READY' | 'STALE' | 'ERROR';
  computedAt: Date;
  overallVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  insuranceVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  warrantyVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  summary: string | null;
  decisionTrace: unknown;
  inventoryItemId: string | null;
};

type ResolutionInventoryItemRecord = {
  id: string;
  name: string;
};

function formatUsdFromCents(valueCents: number, currency = 'USD'): string {
  const dollars = valueCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function differenceInDays(left: Date, right: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.floor((left.getTime() - right.getTime()) / MS_PER_DAY);
}

function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

function formatDistanceToNowStrict(date: Date): string {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)} minute${diffMinutes === 1 ? '' : 's'}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'}`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? '' : 's'}`;
}

function replacementValueText(exposureCents: number, currency = 'USD'): string {
  if (exposureCents > 0) {
    return `Replacement value: ${formatUsdFromCents(exposureCents, currency)}.`;
  }
  return 'Replacement value has not been added yet.';
}

function normalizeResolutionText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHealthInsightAssetName(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const withoutSuffix = trimmed
    .replace(/\s+aging$/i, '')
    .replace(/\s+age$/i, '')
    .replace(/\s+needs coverage$/i, '')
    .replace(/\s+has partial coverage$/i, '')
    .trim();

  if (!withoutSuffix) return null;

  const normalized = normalizeResolutionText(withoutSuffix);
  if (
    normalized === 'property' ||
    normalized === 'property age' ||
    normalized === 'hvac' ||
    normalized === 'hvac age' ||
    normalized === 'water heater' ||
    normalized === 'water heater age'
  ) {
    return null;
  }

  return withoutSuffix;
}

function matchInventoryItemForHealthInsight(
  title: string,
  inventoryItems: ResolutionInventoryItemRecord[],
): ResolutionInventoryItemRecord | null {
  const assetName = extractHealthInsightAssetName(title);
  if (!assetName) return null;

  const normalizedAssetName = normalizeResolutionText(assetName);
  if (!normalizedAssetName) return null;

  let bestMatch: ResolutionInventoryItemRecord | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const item of inventoryItems) {
    const normalizedItemName = normalizeResolutionText(item.name);
    if (!normalizedItemName) continue;

    const isMatch =
      normalizedItemName === normalizedAssetName ||
      normalizedItemName.includes(normalizedAssetName) ||
      normalizedAssetName.includes(normalizedItemName);

    if (!isMatch) continue;

    const score = Math.abs(normalizedItemName.length - normalizedAssetName.length);
    if (score < bestScore) {
      bestMatch = item;
      bestScore = score;
    }
  }

  return bestMatch;
}

function dedupeReplaceRepairAnalyses<T extends {
  inventoryItemId: string;
  currentMarker?: string | null;
  computedAt: Date;
  createdAt?: Date;
}>(rows: T[]): T[] {
  const byItemId = new Map<string, T>();

  for (const row of rows) {
    const existing = byItemId.get(row.inventoryItemId);
    if (!existing) {
      byItemId.set(row.inventoryItemId, row);
      continue;
    }

    const rowIsCurrent = row.currentMarker === CURRENT_REPLACE_REPAIR_MARKER;
    const existingIsCurrent = existing.currentMarker === CURRENT_REPLACE_REPAIR_MARKER;
    if (rowIsCurrent && !existingIsCurrent) {
      byItemId.set(row.inventoryItemId, row);
      continue;
    }
    if (!rowIsCurrent && existingIsCurrent) {
      continue;
    }

    const rowTime = row.computedAt.getTime();
    const existingTime = existing.computedAt.getTime();
    if (rowTime > existingTime) {
      byItemId.set(row.inventoryItemId, row);
      continue;
    }

    if (
      rowTime === existingTime &&
      row.createdAt &&
      existing.createdAt &&
      row.createdAt.getTime() > existing.createdAt.getTime()
    ) {
      byItemId.set(row.inventoryItemId, row);
    }
  }

  return [...byItemId.values()].sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());
}

function caseKindForAction(action: ResolutionActionDTO): ResolutionCaseDTO['kind'] {
  switch (action.type) {
    case 'INCIDENT':
      return 'incident';
    case 'RENEWAL_EXPIRED':
    case 'RENEWAL_UPCOMING':
      return 'renewal';
    case 'COVERAGE_GAP':
    case 'COVERAGE_PARTIAL':
      return 'coverage_gap';
    case 'HEALTH_INSIGHT':
      return 'health_insight';
    default:
      return 'maintenance';
  }
}

function caseSourceForAction(action: ResolutionActionDTO): ResolutionCaseDTO['source'] {
  switch (action.type) {
    case 'INCIDENT':
      return 'incident';
    case 'RENEWAL_EXPIRED':
    case 'RENEWAL_UPCOMING':
    case 'COVERAGE_GAP':
    case 'COVERAGE_PARTIAL':
      return 'coverage';
    case 'HEALTH_INSIGHT':
      return 'health_score';
    default:
      return 'checklist';
  }
}

function casePriorityForAction(action: ResolutionActionDTO): ResolutionCaseDTO['priority'] {
  if (action.type === 'INCIDENT' && action.severity === 'CRITICAL') return 'critical';
  if (action.type === 'INCIDENT') return 'high';
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'COVERAGE_GAP' || action.type === 'MAINTENANCE_OVERDUE') {
    return 'high';
  }
  if (action.type === 'RENEWAL_UPCOMING' || action.type === 'HEALTH_INSIGHT' || action.type === 'COVERAGE_PARTIAL') {
    return 'medium';
  }
  return 'low';
}

function caseBadgesForAction(action: ResolutionActionDTO): string[] {
  switch (action.type) {
    case 'INCIDENT':
      return [action.severity === 'CRITICAL' ? 'Critical' : 'Live Alert'];
    case 'RENEWAL_EXPIRED':
      return ['Expired'];
    case 'RENEWAL_UPCOMING':
      return ['Expiring Soon'];
    case 'COVERAGE_GAP':
      return ['No Coverage'];
    case 'COVERAGE_PARTIAL':
      return ['Partial Coverage'];
    case 'MAINTENANCE_OVERDUE':
      return ['Overdue'];
    case 'HEALTH_INSIGHT':
      return ['Needs Review'];
    default:
      return [];
  }
}

function resolveActionHref(action: ResolutionActionDTO, propertyId: string): string {
  if (action.href) return action.href;
  if (action.type === 'INCIDENT') {
    return `/dashboard/properties/${propertyId}/incidents/${action.id}`;
  }
  if (action.type === 'HEALTH_INSIGHT') {
    if (action.itemId) {
      const params = new URLSearchParams();
      params.set('scopeCategory', 'ITEM');
      params.set('itemId', action.itemId);
      params.set('inventoryItemId', action.itemId);
      if (action.assetName) params.set('assetName', action.assetName);
      params.set('customIssueLabel', action.title);
      return `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;
    }
    const factorSlug = action.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `/dashboard/properties/${propertyId}/focus/health/${factorSlug}`;
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}&filter=overdue`;
  }
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    if (action.entityType === 'Warranty') {
      const highlightQuery = action.itemId ? `&highlight=${encodeURIComponent(action.itemId)}` : '';
      return `/dashboard/properties/${propertyId}/inventory?tab=coverage${highlightQuery}`;
    }
    return `/dashboard/insurance?propertyId=${encodeURIComponent(propertyId)}`;
  }
  if ((action.type === 'COVERAGE_GAP' || action.type === 'COVERAGE_PARTIAL') && action.itemId) {
    return `/dashboard/properties/${propertyId}/inventory/items/${action.itemId}/coverage?returnTo=${encodeURIComponent(`/dashboard/properties/${propertyId}/fix`)}`;
  }
  return `/dashboard/properties/${propertyId}`;
}

function mapActionsToCases(
  actions: ResolutionActionDTO[],
  propertyId: string,
  coverageInsightsByItemId: Set<string>,
): ResolutionCaseDTO[] {
  return actions.map((action) => ({
    id: action.id,
    propertyId: action.propertyId,
    kind: caseKindForAction(action),
    status:
      action.type === 'COVERAGE_GAP' || action.type === 'COVERAGE_PARTIAL'
        ? coverageInsightsByItemId.has(action.itemId || '') ? 'options_ready' : 'needs_analysis'
        : 'detected',
    priority: casePriorityForAction(action),
    title: action.title,
    summary: action.description,
    href: resolveActionHref(action, propertyId),
    itemId: action.itemId,
    dueDate: action.dueDate ?? null,
    source: caseSourceForAction(action),
    badges: caseBadgesForAction(action),
    metadata: {
      actionType: action.type,
      severity: action.severity,
      entityType: action.entityType,
      daysUntilDue: action.daysUntilDue,
    },
  }));
}

function mapReplaceRepairAnalysesToInsights(
  analyses: ReplaceRepairResolutionRecord[],
  propertyId: string,
  journeysByItemId?: Map<string, ReplaceRepairJourneyRecord>,
): DecisionInsightDTO[] {
  return analyses.map((analysis) => {
    const journey = journeysByItemId?.get(analysis.inventoryItemId);

    // When an active guidance journey exists, link to guidance-overview in pinned
    // mode so the user resumes their full journey context. When there is no active
    // journey (analysis was run directly, or journey is already completed), link
    // straight to the replace-repair result page — guidance-overview would only
    // show an intake form or "Journey complete" screen, which is wrong for
    // "Review Decision".
    let href: string;
    if (journey?.id) {
      const query = new URLSearchParams();
      query.set('journeyId', journey.id);
      if (journey.currentStepKey) query.set('stepKey', journey.currentStepKey);
      query.set('scopeCategory', 'ITEM');
      query.set('itemId', analysis.inventoryItemId);
      query.set('inventoryItemId', analysis.inventoryItemId);
      if (analysis.inventoryItem?.name) query.set('assetName', analysis.inventoryItem.name);
      if (journey.issueType) query.set('issueType', journey.issueType);
      if (analysis.summary) query.set('customIssueLabel', analysis.summary);
      href = `/dashboard/properties/${propertyId}/tools/guidance-overview?${query.toString()}`;
    } else {
      href = `/dashboard/properties/${propertyId}/inventory/items/${analysis.inventoryItemId}/replace-repair`;
    }

    return {
      id: analysis.id,
      propertyId: analysis.propertyId,
      kind: 'repair_replace',
      title: 'Repair vs Replace',
      subject: analysis.inventoryItem?.name || 'Inventory Item',
      summary: analysis.summary || 'Our AI has a recommendation for this item.',
      href,
      itemId: analysis.inventoryItemId,
      trust: {
        confidenceLabel: `${analysis.confidence} Confidence`,
        freshnessLabel: `Calculated ${formatDistanceToNowStrict(analysis.computedAt)} ago`,
        sourceLabel: 'Lifespan Engine',
        rationale: `Verdict: ${analysis.verdict.replace(/_/g, ' ')}`,
      },
    metadata: {
      verdict: analysis.verdict,
      computedAt: analysis.computedAt,
      impactLevel: analysis.impactLevel,
    },
    };
  });
}

function mapCoverageGapsToInsights(args: {
  coverageGaps: CoverageGapResult[];
  coverageAnalysesByItemId: Map<string, CoverageAnalysisRecord>;
  propertyId: string;
}): DecisionInsightDTO[] {
  const sortedGaps = [...args.coverageGaps].sort((a, b) => b.exposureCents - a.exposureCents);

  return sortedGaps.map((gap) => {
    const savedAnalysis = args.coverageAnalysesByItemId.get(gap.inventoryItemId);
    const summary =
      savedAnalysis?.summary ||
      `${gap.reasons[0] || 'Coverage review recommended'}. ${replacementValueText(gap.exposureCents, gap.currency)}`;

    return {
      id: savedAnalysis ? `coverage-analysis-${savedAnalysis.id}` : `coverage-gap-${gap.inventoryItemId}`,
      propertyId: gap.propertyId,
      kind: 'coverage_recommendation',
      title: 'Coverage Recommendation',
      subject: gap.itemName,
      summary,
      href: `/dashboard/properties/${args.propertyId}/inventory/items/${gap.inventoryItemId}/coverage`,
      itemId: gap.inventoryItemId,
      trust: savedAnalysis
        ? {
            confidenceLabel: `${savedAnalysis.confidence} Confidence`,
            freshnessLabel: `Calculated ${formatDistanceToNowStrict(savedAnalysis.computedAt)} ago`,
            sourceLabel: 'Coverage Intelligence',
            rationale: `Verdict: ${savedAnalysis.warrantyVerdict.replace(/_/g, ' ')}`,
          }
        : {
            confidenceLabel: 'Recommended',
            freshnessLabel: 'Gap detected recently',
            sourceLabel: 'Coverage tracking',
            rationale: gap.reasons.join(' | '),
          },
      metadata: {
        gapType: gap.gapType,
        exposureCents: gap.exposureCents,
        currency: gap.currency,
        hasSavedAnalysis: Boolean(savedAnalysis),
        overallVerdict: savedAnalysis?.overallVerdict,
        warrantyVerdict: savedAnalysis?.warrantyVerdict,
      },
    };
  });
}

function mapBookingsToExecutionItems(bookings: Array<{
  id: string;
  status: string;
  estimatedPrice: unknown;
  scheduledDate: Date | null;
  createdAt: Date;
  inventoryItemId?: string | null;
  providerProfileId: string;
  executionScopeKey?: string | null;
  insightFactor?: string | null;
  category?: string | null;
  provider: { id: string };
  providerProfile?: { businessName: string | null } | null;
  service: { id: string; name: string };
  property: { id: string };
}>): ExecutionItemDTO[] {
  return bookings.map((booking) => ({
    id: booking.id,
    propertyId: booking.property.id,
    kind: 'booking',
    title: booking.service.name || 'Service Job',
    subtitle: booking.providerProfile?.businessName || null,
    statusLabel: booking.status,
    href: `/dashboard/bookings/${booking.id}`,
    scheduledLabel: booking.scheduledDate ? booking.scheduledDate.toLocaleDateString() : 'TBD',
    priceLabel: `$${Number(booking.estimatedPrice || 0).toFixed(2)}`,
    metadata: {
      providerId: booking.provider.id,
      providerProfileId: booking.providerProfileId,
      serviceId: booking.service.id,
      inventoryItemId: booking.inventoryItemId ?? null,
      executionScopeKey: booking.executionScopeKey ?? null,
      insightFactor: booking.insightFactor ?? null,
      category: booking.category ?? null,
    },
  }));
}

function dedupeActiveBookings<T extends {
  id: string;
  property: { id: string };
  service: { id: string; name: string };
  providerProfileId: string;
  createdAt: Date;
  inventoryItemId?: string | null;
  executionScopeKey?: string | null;
}>(bookings: T[]): T[] {
  const byScope = new Map<string, T>();

  for (const booking of bookings) {
    const fallbackScope =
      booking.inventoryItemId
        ? `inventory-item:${booking.property.id}:${booking.inventoryItemId}`
        : `service:${booking.property.id}:${booking.providerProfileId}:${booking.service.id}`;
    const scopeKey = booking.executionScopeKey ?? fallbackScope;
    const existing = byScope.get(scopeKey);
    if (!existing || booking.createdAt.getTime() > existing.createdAt.getTime()) {
      byScope.set(scopeKey, booking);
    }
  }

  return [...byScope.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function matchDecisionInsightsForCase(
  caseItem: ResolutionCaseDTO,
  decisionInsights: DecisionInsightDTO[],
): DecisionInsightDTO[] {
  if (caseItem.itemId) {
    return decisionInsights.filter((insight) => insight.itemId === caseItem.itemId);
  }
  return [];
}

function matchExecutionItemsForCase(
  caseItem: ResolutionCaseDTO,
  executionItems: ExecutionItemDTO[],
): ExecutionItemDTO[] {
  return executionItems.filter((executionItem) => {
    const metadata = executionItem.metadata || {};
    const linkedInventoryItemId =
      typeof metadata.inventoryItemId === 'string' ? metadata.inventoryItemId : null;
    const insightFactor = typeof metadata.insightFactor === 'string' ? metadata.insightFactor : null;

    if (caseItem.itemId && linkedInventoryItemId) {
      return linkedInventoryItemId === caseItem.itemId;
    }

    if (!caseItem.itemId && caseItem.kind === 'health_insight' && insightFactor) {
      return insightFactor.trim().toLowerCase() === caseItem.title.trim().toLowerCase();
    }

    return false;
  });
}

function enrichCasesWithWorkflowState(
  cases: ResolutionCaseDTO[],
  decisionInsights: DecisionInsightDTO[],
  executionItems: ExecutionItemDTO[],
): ResolutionCaseDTO[] {
  return cases.map((caseItem) => {
    const relatedInsights = matchDecisionInsightsForCase(caseItem, decisionInsights);
    const relatedExecutionItems = matchExecutionItemsForCase(caseItem, executionItems);
    const primaryInsight = relatedInsights[0];
    const primaryExecution = relatedExecutionItems[0];

    const nextStatus =
      relatedExecutionItems.length > 0
        ? 'in_progress'
        : relatedInsights.length > 0
          ? 'options_ready'
          : caseItem.kind === 'coverage_gap'
            ? 'needs_analysis'
            : caseItem.status;

    const nextHref = primaryExecution?.href || primaryInsight?.href || caseItem.href;

    return {
      ...caseItem,
      status: nextStatus,
      href: nextHref,
      metadata: {
        ...(caseItem.metadata || {}),
        workflowState: nextStatus,
        relatedDecisionInsightIds: relatedInsights.map((insight) => insight.id),
        relatedExecutionItemIds: relatedExecutionItems.map((executionItem) => executionItem.id),
        primaryDecisionInsightId: primaryInsight?.id ?? null,
        primaryExecutionItemId: primaryExecution?.id ?? null,
      },
    };
  });
}

function appendDecisionOnlyCases(
  cases: ResolutionCaseDTO[],
  decisionInsights: DecisionInsightDTO[],
): ResolutionCaseDTO[] {
  const seenItemIds = new Set(cases.map((caseItem) => caseItem.itemId).filter(Boolean) as string[]);
  const derivedCases = decisionInsights
    .filter((insight) => insight.kind === 'repair_replace' && insight.itemId && !seenItemIds.has(insight.itemId))
    .map((insight) => ({
      id: `repair-case-${insight.id}`,
      propertyId: insight.propertyId,
      kind: 'repair_replace' as const,
      status: 'options_ready' as const,
      priority: 'medium' as const,
      title: `${insight.subject} decision ready`,
      summary: insight.summary,
      href: insight.href,
      itemId: insight.itemId,
      dueDate: null,
      source: 'replace_repair' as const,
      badges: ['Decision Ready'],
      metadata: {
        decisionInsightId: insight.id,
        derivedFromInsight: true,
      },
    }));

  return [...cases, ...derivedCases];
}

function filterMaterialDecisionInsights(decisionInsights: DecisionInsightDTO[]): DecisionInsightDTO[] {
  return decisionInsights.filter((insight) => {
    if (insight.kind === 'coverage_recommendation') {
      return insight.metadata?.hasSavedAnalysis === true;
    }

    return true;
  });
}

function sortCases(cases: ResolutionCaseDTO[]): ResolutionCaseDTO[] {
  const priorityRank: Record<ResolutionCaseDTO['priority'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const statusRank: Record<ResolutionCaseDTO['status'], number> = {
    options_ready: 0,
    detected: 1,
    needs_analysis: 1,
    in_progress: 2,
    resolved: 3,
  };

  return [...cases].sort((a, b) => {
    if (a.kind === 'incident' && b.kind !== 'incident') return -1;
    if (b.kind === 'incident' && a.kind !== 'incident') return 1;

    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

function normalizeCoverageActionType(gap: CoverageGapResult): ResolutionActionDTO['type'] {
  return gap.gapType === 'NO_COVERAGE' ? 'COVERAGE_GAP' : 'COVERAGE_PARTIAL';
}

function mapCoverageGapToAction(gap: CoverageGapResult): ResolutionActionDTO {
  const type = normalizeCoverageActionType(gap);
  const coverageDescriptor = type === 'COVERAGE_GAP' ? 'needs coverage' : 'has partial coverage';
  const reasons = gap.reasons.join(' ');
  const replacementText = replacementValueText(gap.exposureCents, gap.currency);

  return {
    id: `${type === 'COVERAGE_GAP' ? 'COVERAGE-GAP' : 'COVERAGE-PARTIAL'}-${gap.inventoryItemId}`,
    type,
    title: `${gap.itemName} ${coverageDescriptor}`,
    description: `${reasons}. ${replacementText}`.trim(),
    propertyId: gap.propertyId,
    severity: type === 'COVERAGE_GAP' ? 'WARNING' : 'INFO',
    itemId: gap.inventoryItemId,
  };
}

function sortActions(actions: ResolutionActionDTO[]): ResolutionActionDTO[] {
  return actions.sort((a, b) => {
    if (a.type === 'INCIDENT' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'INCIDENT' && a.type !== 'INCIDENT') return 1;
    if (a.type === 'COVERAGE_GAP' && b.type !== 'COVERAGE_GAP' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'COVERAGE_GAP' && a.type !== 'COVERAGE_GAP' && a.type !== 'INCIDENT') return 1;
    if (a.daysUntilDue === undefined) return 1;
    if (b.daysUntilDue === undefined) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });
}

export async function getResolutionCenter(propertyId: string, userId: string): Promise<ResolutionCenterPayloadDTO> {
  const property = await getPropertyById(propertyId, userId);

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  const homeownerProfileId = property.homeownerProfileId;
  const today = new Date();

  const [
    checklistItems,
    warranties,
    insurancePolicies,
    incidents,
    bookings,
    inventoryItems,
    replaceRepairAnalyses,
    replaceRepairJourneys,
    coverageGaps,
    coverageAnalyses,
  ] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { propertyId },
      select: {
        id: true,
        status: true,
        nextDueDate: true,
        title: true,
        description: true,
        propertyId: true,
      },
    }),
    prisma.warranty.findMany({
      where: { propertyId, homeownerProfileId },
      select: {
        id: true,
        propertyId: true,
        inventoryItemId: true,
        providerName: true,
        expiryDate: true,
      },
    }),
    prisma.insurancePolicy.findMany({
      where: { propertyId, homeownerProfileId },
      select: {
        id: true,
        propertyId: true,
        carrierName: true,
        expiryDate: true,
      },
    }),
    prisma.incident.findMany({
      where: {
        propertyId,
        status: {
          notIn: ['RESOLVED', 'EXPIRED', 'SUPPRESSED'],
        },
        isSuppressed: false,
      },
      orderBy: [{ openedAt: 'desc' }],
    }),
    prisma.booking.findMany({
      where: {
        propertyId,
        homeownerId: userId,
        status: {
          in: [...ACTIVE_BOOKING_STATUSES],
        },
      },
      include: {
        provider: true,
        providerProfile: {
          select: {
            businessName: true,
          },
        },
        service: true,
        property: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
    }),
    prisma.inventoryItem.findMany({
      where: { propertyId },
      select: {
        id: true,
        name: true,
      },
      take: 200,
    }),
    prisma.replaceRepairAnalysis.findMany({
      where: {
        propertyId,
        homeownerProfileId,
        status: 'READY',
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        computedAt: 'desc',
      },
      take: 10,
    }),
    prisma.guidanceJourney.findMany({
      where: {
        propertyId,
        issueDomain: 'ASSET_LIFECYCLE',
        status: 'ACTIVE',
        inventoryItemId: {
          not: null,
        },
        steps: {
          some: {
            toolKey: 'replace-repair',
          },
        },
      },
      select: {
        id: true,
        inventoryItemId: true,
        currentStepKey: true,
        issueType: true,
        updatedAt: true,
        primarySignal: {
          select: {
            signalIntentFamily: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    }),
    // Keep Resolution Center aligned with Home Record. The canonical detector
    // excludes absent/inferred risk concepts, incomplete context, and systems
    // managed by an HOA, landlord, or shared party.
    detectCoverageGaps(propertyId),
    prisma.coverageAnalysis.findMany({
      where: {
        propertyId,
        homeownerProfileId,
        inventoryItemId: { not: null },
        status: 'READY',
      },
      select: {
        id: true,
        propertyId: true,
        homeownerProfileId: true,
        status: true,
        computedAt: true,
        overallVerdict: true,
        insuranceVerdict: true,
        warrantyVerdict: true,
        confidence: true,
        impactLevel: true,
        summary: true,
        decisionTrace: true,
        inventoryItemId: true,
      },
      orderBy: {
        computedAt: 'desc',
      },
      take: 200,
    }),
  ]);

  const urgentActions: ResolutionActionDTO[] = [];

  incidents.forEach((incident) => {
    urgentActions.push({
      id: incident.id,
      type: 'INCIDENT',
      title: incident.title,
      description: incident.summary || 'Critical home event detected.',
      propertyId: incident.propertyId,
      severity: incident.severity || 'WARNING',
    });
  });

  const applianceRecords = Array.isArray(property.majorAppliances)
    ? property.majorAppliances
    : [];
  const appliancesMissingInstallYear = applianceRecords.filter(
    (appliance) => !appliance.installationYear,
  );
  const isAggregateApplianceFactor = (factor: string) =>
    factor.trim().toLowerCase() === 'appliances';

  const insightsByFactor = new Map<string, { factor: string; status: string; statusIndex: number }>();
  property.healthScore?.insights
    ?.filter((insight) => {
      if (isAggregateApplianceFactor(insight.factor)) {
        // Canonical appliance records take precedence over a stale score
        // snapshot. Only surface an aggregate case when there is a concrete
        // field to complete, or no appliances have been recorded at all.
        return applianceRecords.length === 0 || appliancesMissingInstallYear.length > 0;
      }
      return HEALTH_INSIGHT_STATUSES.includes(insight.status);
    })
    .forEach((insight) => {
      const statusIndex = HEALTH_INSIGHT_STATUSES.indexOf(insight.status);
      const existing = insightsByFactor.get(insight.factor);
      if (!existing || statusIndex < existing.statusIndex) {
        insightsByFactor.set(insight.factor, {
          factor: insight.factor,
          status: insight.status,
          statusIndex,
        });
      }
    });

  insightsByFactor.forEach(({ factor, status }) => {
    const factorId = factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (isAggregateApplianceFactor(factor)) {
      const missingNames = appliancesMissingInstallYear.map((appliance) =>
        String(appliance.assetType || 'Appliance')
          .toLowerCase()
          .split('_')
          .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
          .join(' '),
      );
      const hasRecordedAppliances = applianceRecords.length > 0;
      const title = hasRecordedAppliances
        ? missingNames.length === 1
          ? `Add installation year for ${missingNames[0]}`
          : `Complete installation years for ${missingNames.length} appliances`
        : 'Add major appliances';
      const description = hasRecordedAppliances
        ? `Installation year is missing for ${missingNames.join(', ')}. Add an approximate year to improve lifecycle and recall guidance.`
        : 'No major appliances are recorded. Add only the appliances that are present in this home.';

      urgentActions.push({
        id: `${property.id}-INSIGHT-${factorId}`,
        type: 'HEALTH_INSIGHT',
        title,
        description,
        propertyId: property.id,
        href: `/dashboard/properties/${property.id}/edit?focus=appliances`,
      });
      return;
    }

    const matchedItem = matchInventoryItemForHealthInsight(factor, inventoryItems);
    urgentActions.push({
      id: `${property.id}-INSIGHT-${factorId}`,
      type: 'HEALTH_INSIGHT',
      title: factor,
      description: `Status: ${status}. Requires resolution.`,
      propertyId: property.id,
      itemId: matchedItem?.id,
      assetName: matchedItem?.name ?? extractHealthInsightAssetName(factor) ?? undefined,
    });
  });

  checklistItems.forEach((item) => {
    if (item.status === 'COMPLETED' || item.status === 'NOT_NEEDED') return;
    if (!item.nextDueDate || !isPast(item.nextDueDate)) return;

    urgentActions.push({
      id: item.id,
      type: 'MAINTENANCE_OVERDUE',
      title: `OVERDUE: ${item.title}`,
      description: item.description || `Overdue by ${differenceInDays(today, item.nextDueDate)} days.`,
      dueDate: item.nextDueDate.toISOString(),
      daysUntilDue: differenceInDays(item.nextDueDate, today),
      propertyId: item.propertyId || propertyId,
    });
  });

  [...warranties, ...insurancePolicies].forEach((item) => {
    if (!item.expiryDate) return;

    const dueDate = item.expiryDate;
    const days = differenceInDays(dueDate, today);
    const itemType = 'providerName' in item ? 'Warranty' : 'Insurance';
    const title = `${itemType} Renewal: ${'providerName' in item ? item.providerName : item.carrierName}`;

    if (isPast(dueDate)) {
      urgentActions.push({
        id: item.id,
        type: 'RENEWAL_EXPIRED',
        title: `EXPIRED: ${title}`,
        description: `Policy expired ${Math.abs(days)} days ago. Immediate action required.`,
        dueDate: dueDate.toISOString(),
        daysUntilDue: days,
        propertyId: item.propertyId || propertyId,
        entityType: itemType,
        itemId: 'providerName' in item ? item.inventoryItemId || undefined : undefined,
      });
      return;
    }

    if (days <= 90) {
      urgentActions.push({
        id: item.id,
        type: 'RENEWAL_UPCOMING',
        title: `UPCOMING: ${title}`,
        description: `Expires in ${days} days.`,
        dueDate: dueDate.toISOString(),
        daysUntilDue: days,
        propertyId: item.propertyId || propertyId,
        entityType: itemType,
        itemId: 'providerName' in item ? item.inventoryItemId || undefined : undefined,
      });
    }
  });

  coverageGaps.forEach((gap) => {
    urgentActions.push(mapCoverageGapToAction(gap));
  });

  const sortedActions = sortActions(urgentActions);

  const coverageAnalysesByItemId = new Map<string, CoverageAnalysisRecord>();
  coverageAnalyses.forEach((analysis) => {
    const itemId = analysis.inventoryItemId;
    if (!itemId || coverageAnalysesByItemId.has(itemId)) return;
    coverageAnalysesByItemId.set(itemId, analysis);
  });

  const dedupedReplaceRepairAnalyses = dedupeReplaceRepairAnalyses(replaceRepairAnalyses);
  const replaceRepairJourneysByItemId = new Map<string, ReplaceRepairJourneyRecord>();
  replaceRepairJourneys.forEach((journey) => {
    if (!journey.inventoryItemId || replaceRepairJourneysByItemId.has(journey.inventoryItemId)) return;
    replaceRepairJourneysByItemId.set(journey.inventoryItemId, journey);
  });

  const coverageInsights = mapCoverageGapsToInsights({
    coverageGaps,
    coverageAnalysesByItemId,
    propertyId,
  });
  const replaceRepairInsights = mapReplaceRepairAnalysesToInsights(
    dedupedReplaceRepairAnalyses.map((analysis) => ({
      id: analysis.id,
      propertyId: analysis.propertyId,
      homeownerProfileId: analysis.homeownerProfileId,
      inventoryItemId: analysis.inventoryItemId,
      currentMarker: analysis.currentMarker,
      status: analysis.status,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      impactLevel: analysis.impactLevel,
      summary: analysis.summary,
      computedAt: analysis.computedAt,
      inventoryItem: analysis.inventoryItem,
    })),
    propertyId,
    replaceRepairJourneysByItemId,
  );
  const allDecisionInsights = filterMaterialDecisionInsights([
    ...coverageInsights,
    ...replaceRepairInsights,
  ]);
  const decisionInsights = allDecisionInsights.slice(0, 10);
  const executionItems = mapBookingsToExecutionItems(dedupeActiveBookings(bookings));
  const coverageInsightItemIds = new Set(
    allDecisionInsights
      .filter((entry) => entry.kind === 'coverage_recommendation')
      .map((entry) => entry.itemId)
      .filter(Boolean) as string[],
  );
  const workflowAwareBaseCases = mapActionsToCases(sortedActions, propertyId, coverageInsightItemIds);
  const cases = sortCases(
    enrichCasesWithWorkflowState(
      appendDecisionOnlyCases(workflowAwareBaseCases, allDecisionInsights),
      allDecisionInsights,
      executionItems,
    ),
  );

  return {
    urgentActions: sortedActions,
    cases,
    decisionInsights,
    executionItems,
    counts: {
      openCases: cases.length,
      decisionsReady: allDecisionInsights.length,
      activeBookings: executionItems.length,
      activeIncidents: cases.filter((entry) => entry.kind === 'incident').length,
    },
  };
}
