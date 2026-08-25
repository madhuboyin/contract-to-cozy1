import { prisma } from '../lib/prisma';
import { getPropertyById } from './property.service';
import { detectCoverageGaps, type CoverageGapResult } from './coverageGap.service';
import { operatingModeForOwnershipState } from './skills/context/propertyJourneyContext.contract';
import { getHomeActionFeed, type RankedHomeAction } from './homeActions.service';
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
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
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
    case 'DECISION_REVIEW':
      return 'repair_replace';
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
    case 'DECISION_REVIEW':
      return 'replace_repair';
    default:
      return 'checklist';
  }
}

function casePriorityForAction(action: ResolutionActionDTO): ResolutionCaseDTO['priority'] {
  if (action.canonicalPriority === 'NOW') return 'critical';
  if (action.canonicalPriority === 'SOON') return 'high';
  if (action.canonicalPriority === 'PLAN') return 'medium';
  if (action.canonicalPriority === 'CONSIDER') return 'low';
  // severity is the canonical Home Action band projection after cutover;
  // these branches preserve it without recomputing priority from case type.
  if (action.severity === 'CRITICAL') return 'critical';
  if (action.severity === 'WARNING') return 'high';
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
      canonicalPriority: action.canonicalPriority,
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
      `${gap.reasons[0] || 'Protection record review recommended'}. ${replacementValueText(gap.exposureCents, gap.currency)}`;

    return {
      id: savedAnalysis ? `coverage-analysis-${savedAnalysis.id}` : `coverage-gap-${gap.inventoryItemId}`,
      propertyId: gap.propertyId,
      kind: 'coverage_recommendation',
      title: 'Protection Cost Scenario',
      subject: gap.itemName,
      summary,
      href: `/dashboard/properties/${args.propertyId}/inventory/items/${gap.inventoryItemId}/coverage`,
      itemId: gap.inventoryItemId,
      trust: savedAnalysis
        ? {
            confidenceLabel: `${savedAnalysis.confidence} Confidence`,
            freshnessLabel: `Calculated ${formatDistanceToNowStrict(savedAnalysis.computedAt)} ago`,
            sourceLabel: 'Coverage Intelligence',
            rationale: 'Modeled cost comparison only; verify controlling contract terms before deciding.',
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
        scenarioComputed: Boolean(savedAnalysis),
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

function canonicalActionType(action: RankedHomeAction): ResolutionActionDTO['type'] {
  if (action.source.kind === 'INCIDENT' || action.id.startsWith('incident:')) return 'INCIDENT';
  if (action.id.startsWith('coverage-renewal:')) {
    const dueAt = action.timing.dueAt ? new Date(action.timing.dueAt) : null;
    return dueAt && dueAt.getTime() < Date.now() ? 'RENEWAL_EXPIRED' : 'RENEWAL_UPCOMING';
  }
  if (action.id.startsWith('health-insight:')) return 'HEALTH_INSIGHT';
  if (action.id.startsWith('repair-replace:') || action.job === 'DECIDE') return 'DECISION_REVIEW';
  if (action.source.kind === 'COVERAGE') {
    return /partial|incomplete/i.test(`${action.signal} ${action.whyItMatters}`)
      ? 'COVERAGE_PARTIAL'
      : 'COVERAGE_GAP';
  }
  const dueAt = action.timing.dueAt ? new Date(action.timing.dueAt) : null;
  return dueAt && dueAt.getTime() < Date.now() ? 'MAINTENANCE_OVERDUE' : 'MAINTENANCE_UNSCHEDULED';
}

function canonicalActionToResolutionAction(action: RankedHomeAction): ResolutionActionDTO {
  const dueDate = action.timing.dueAt;
  const dueAt = dueDate ? new Date(dueDate) : null;
  const itemId = action.presentation?.subject?.kind === 'INVENTORY_ITEM'
    ? action.presentation.subject.id
    : undefined;
  const entityType = action.id.startsWith('coverage-renewal:warranty:')
    ? 'Warranty' as const
    : action.id.startsWith('coverage-renewal:insurance:')
      ? 'Insurance' as const
      : undefined;
  return {
    id: action.id,
    type: canonicalActionType(action),
    title: action.signal,
    description: action.whyItMatters,
    dueDate,
    daysUntilDue: dueAt ? differenceInDays(dueAt, new Date()) : undefined,
    propertyId: action.propertyId,
    severity: action.governance.safetyTier === 'SAFETY_EMERGENCY' || action.priority === 'NOW'
      ? 'CRITICAL'
      : action.priority === 'SOON'
        ? 'WARNING'
        : 'INFO',
    canonicalPriority: action.priority,
    entityType,
    itemId,
    assetName: action.presentation?.subject?.label,
    href: action.primaryCta.href,
  };
}

function canonicalDecisionInsight(action: RankedHomeAction): DecisionInsightDTO | null {
  const hasDecisionStructure = Boolean(action.decisionLineage) || action.options.length >= 2;
  if (!hasDecisionStructure) return null;
  const linkedDecision = action.decisionLineage?.status === 'LINKED' ? action.decisionLineage.thread : null;
  const coverageDecision = action.source.kind === 'COVERAGE' || action.governance.safetyTier === 'REGULATED_COVERAGE';
  const itemId = action.presentation?.subject?.kind === 'INVENTORY_ITEM'
    ? action.presentation.subject.id
    : undefined;
  const freshestEvidence = action.evidence[0];
  return {
    id: linkedDecision?.currentRecommendationSnapshotId ?? action.id,
    propertyId: action.propertyId,
    kind: coverageDecision ? 'coverage_recommendation' : 'repair_replace',
    title: action.signal,
    subject: action.presentation?.subject?.label ?? action.signal,
    summary: action.recommendedAction,
    href: action.primaryCta.href,
    itemId,
    trust: {
      confidenceLabel: action.confidence.label,
      freshnessLabel: freshestEvidence?.freshness ?? 'UNKNOWN',
      sourceLabel: freshestEvidence?.source ?? action.source.kind,
      rationale: action.ranking.explanation,
    },
    metadata: {
      homeActionId: action.id,
      workItemId: action.workItem?.id ?? null,
      decisionThreadId: linkedDecision?.decisionThreadId ?? null,
      recommendationSnapshotId: linkedDecision?.currentRecommendationSnapshotId ?? null,
    },
  };
}

async function canonicalBookingExecutionItems(
  propertyId: string,
  actions: RankedHomeAction[],
): Promise<ExecutionItemDTO[]> {
  const workItemRank = new Map(
    actions.flatMap((action) => action.workItem ? [[action.workItem.id, action.ranking.rank] as const] : []),
  );
  const links = await prisma.operationalWorkExecution.findMany({
    where: {
      executionType: 'BOOKING',
      workItem: {
        propertyId,
        acceptanceState: 'ACCEPTED',
        state: { notIn: ['VERIFIED', 'CLOSED'] },
        supersededByWorkItemId: null,
      },
    },
    select: { workItemId: true, executionEntityId: true },
    take: 200,
  });
  const rankedLinks = [...links].sort(
    (left, right) => (workItemRank.get(left.workItemId) ?? Number.MAX_SAFE_INTEGER) -
      (workItemRank.get(right.workItemId) ?? Number.MAX_SAFE_INTEGER),
  );
  const bookingIds = [...new Set(rankedLinks.map((link) => link.executionEntityId))];
  if (bookingIds.length === 0) return [];
  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, propertyId, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
    include: {
      provider: true,
      providerProfile: { select: { businessName: true } },
      service: true,
      property: true,
    },
  });
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  return mapBookingsToExecutionItems(
    rankedLinks.map((link) => byId.get(link.executionEntityId)).filter((booking): booking is NonNullable<typeof booking> => Boolean(booking)),
  );
}

export async function getResolutionCenter(propertyId: string, userId: string): Promise<ResolutionCenterPayloadDTO> {
  const property = await getPropertyById(propertyId, userId);
  if (!property) throw new Error('Property not found or access denied.');
  const [feed, onboarding] = await Promise.all([
    getHomeActionFeed(propertyId, userId),
    prisma.propertyOnboarding.findUnique({
      where: { propertyId },
      select: { ownershipState: true },
    }),
  ]);
  // Preserve the canonical Home feed's identity and order. Fix is now a
  // projection only: it does not rediscover, deduplicate, or re-rank work.
  const actions = feed.actions as RankedHomeAction[];
  const urgentActions = actions.map(canonicalActionToResolutionAction);
  const decisionInsights = actions
    .map(canonicalDecisionInsight)
    .filter((insight): insight is DecisionInsightDTO => insight !== null);
  const executionItems = await canonicalBookingExecutionItems(propertyId, actions);
  const coverageInsightItemIds = new Set(
    decisionInsights
      .filter((insight) => insight.kind === 'coverage_recommendation' && insight.itemId)
      .map((insight) => insight.itemId as string),
  );
  const cases = enrichCasesWithWorkflowState(
    mapActionsToCases(urgentActions, propertyId, coverageInsightItemIds),
    decisionInsights,
    executionItems,
  );
  return {
    urgentActions,
    cases,
    decisionInsights,
    executionItems,
    isPreCloseBuyer: operatingModeForOwnershipState(onboarding?.ownershipState) === 'BUYING',
    counts: {
      openCases: cases.length,
      decisionsReady: decisionInsights.length,
      activeBookings: executionItems.length,
      activeIncidents: cases.filter((entry) => entry.kind === 'incident').length,
    },
  };
}
