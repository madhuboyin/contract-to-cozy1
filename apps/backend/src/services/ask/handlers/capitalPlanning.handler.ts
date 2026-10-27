// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { COMPARABLE_ACTION_ID, COMPARABLE_MESSAGE } from '../support/propertyTaxComparableCommand';
import { EVIDENCE_ACTION_IDS, EVIDENCE_MESSAGES, conditionKindForGround } from '../support/propertyTaxEvidenceCommand';
import { DOCUMENT_FACTS_ACTION_ID, DOCUMENT_FACTS_MESSAGE } from '../support/propertyTaxDocumentFactsCommand';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { homeReserveFundService } from '../../homeReserveFund.service';
import { homeReserveFundReconciliationService } from '../../homeReserveFundReconciliation.service';
import { humanDate, money } from '../askFormatting';
import { inventoryAddItemAction } from './inventoryAskActions';
import { askCaptureRequest, capabilityResult, ensurePropertyAccess, isCapitalTimelineAnalysisStale, parseCapitalTimelineHorizonRequest } from '../askHandlerSupport';
import { HomeCapitalTimelineService } from '../../homeCapitalTimeline.service';
import { propertyTaxAppealReadinessService } from '../../propertyTax/propertyTaxAppealReadiness.service';
import { propertyTaxAppealCaseService } from '../../propertyTax/propertyTaxAppealCase.service';
import {
  APPEAL_CASE_ENTITY_TYPE, APPEAL_COMMAND_ACTION_IDS, APPEAL_COMMAND_MESSAGES, APPEAL_DETERMINATION_LABELS, APPEAL_GROUND_LABELS, APPEAL_PROPERTY_ENTITY_TYPE,
  APPEAL_REMINDER_ENTITY_TYPE, APPEAL_STATUS_LABELS, appealCaseAvailableKinds, type AppealCommandKind,
} from '../support/propertyTaxAppealCommand';
import { listRenovationCases } from '../../renovationCase.service';
import { detectRetroactiveCandidates } from '../../../homeRenovationAdvisor/engine/retroactive/retroactiveCompliance.service';
import { RENOVATION_RETROACTIVE_LIST_ACTION_ID, RENOVATION_RETROACTIVE_MESSAGE, isRenovationRetroactiveRequest, renovationRetroactiveRows } from '../support/renovationCaseOverview';
import { isRenovationCaseOverviewRequest, isRenovationRequirementsRequest, isRenovationComplianceRequest, renovationComplianceSections, renovationCaseRows, renovationLifecycleLabel, renovationRequirementRows } from '../support/renovationCaseOverview';
import { listRequirements, listAuthorityProfiles } from '../../renovationRequirement.service';
import { getComplianceWorkflow } from '../../renovationComplianceWorkflow.service';
import { getReadiness as getRenovationReadiness } from '../../renovationReadiness.service';
import { PermitTrackerService } from '../../permitTracker.service';
import { getAskPropertyTimezone } from '../askExecutionContext';
import { CAPITAL_BUNDLE_ACTION_ID, CAPITAL_BUNDLE_ENTITY_TYPE, capitalBundle } from '../support/capitalBundle';
import { SERVICE_PRICE_CHECK_MESSAGE } from '../support/homeToolRunConstants';
import { isPrimaryAccountHolder } from './homeToolRuns.handler';
import { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_COMMAND_MESSAGE } from '../support/reserveFundConstants';
import { RENOVATION_CASE_START_ACTION_ID, RENOVATION_CASE_START_MESSAGE } from '../support/renovationCaseStart';
import {
  READINESS_COMMAND_ACTION_IDS, READINESS_COMMAND_MESSAGES, RENOVATION_READINESS_CASE_ENTITY_TYPE, RENOVATION_READINESS_ITEM_ENTITY_TYPE, type ReadinessCommandKind,
} from '../support/renovationReadinessCommand';
import { readinessItemKinds } from './renovationReadinessCommands.handler';

const homeCapitalTimelineService = new HomeCapitalTimelineService();
import { CAPITAL_COMMAND_ACTION_IDS, CAPITAL_COMMAND_MESSAGES, CAPITAL_OVERRIDE_ENTITY_TYPE, CAPITAL_OVERRIDE_SHORT_LABELS, CAPITAL_PROPERTY_ENTITY_TYPE } from '../support/capitalTimelineCommand';

const permitTrackerService = new PermitTrackerService();

// IW-PRES-017 (FRD v1.90): the upcoming capital windows on a timeline track. A window is a planning range, so it sits
// at its start month (never an invented day) with the full window, cost range and confidence in its facts; the live
// canonical window detail (CapitalWindowDetail) is kept by the frontend under the same block id. When more windows
// exist than are shown, the description says so and the summary's Open capital timeline link reaches the rest.
export function capitalTimelineBlock(
  upcoming: ReadonlyArray<{
    id: string; category: unknown; windowStart: Date | string; windowEnd: Date | string; confidence: unknown;
    estimatedCostMinCents: number | null; estimatedCostMaxCents: number | null; inventoryItem?: { name?: string | null } | null;
  }>,
  totalCount: number,
): Extract<AskPresentationBlock, { type: 'TIMELINE' }> {
  const words = (value: unknown) => String(value).toLowerCase().replace(/_/g, ' ');
  const sentence = (value: unknown) => words(value).replace(/^\w/, (letter) => letter.toUpperCase());
  const month = (value: Date | string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: getAskPropertyTimezone() })
      .formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}`;
  };
  return {
    type: 'TIMELINE', id: 'capital-timeline-table', title: 'Upcoming capital windows', actions: [],
    description: `Windows and ranges come from the canonical Home Capital Timeline; they are not failure dates or vendor quotes. Each sits at the start of its window.${totalCount > upcoming.length ? ` Showing the ${upcoming.length} soonest of ${totalCount} windows.` : ''}`,
    items: upcoming.map((item) => ({
      id: item.id,
      label: item.inventoryItem?.name ?? words(item.category),
      date: month(item.windowStart),
      datePrecision: 'MONTH' as const,
      description: null,
      status: `${sentence(item.confidence)} confidence`,
      href: null,
      category: { id: String(item.category), label: sentence(item.category).slice(0, 60) },
      meta: [
        `Window ${humanDate(new Date(item.windowStart))}–${humanDate(new Date(item.windowEnd))}`,
        item.estimatedCostMinCents == null || item.estimatedCostMaxCents == null
          ? 'Cost range not available'
          : `Estimated ${money(item.estimatedCostMinCents / 100)}–${money(item.estimatedCostMaxCents / 100)}`,
      ],
    })),
  };
}

// Capital Timeline (register P1; FRD v1.318): the household's own corrections to what the timeline assumes, with Remove, and a way to add one. A reader
// sees what was corrected; Add and Remove are offered to a contributor or owner only.
async function capitalAdjustmentsBlocks(propertyId: string, canManage: boolean): Promise<AskPresentationBlock[]> {
  const overrides = await homeCapitalTimelineService.listOverrides(propertyId);
  const ids = [...new Set(overrides.map((o: any) => o.inventoryItemId).filter((id: unknown): id is string => typeof id === 'string'))];
  const names = ids.length
    ? new Map<string, string>((await prisma.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((item) => [item.id, item.name ?? 'Item']))
    : new Map<string, string>();
  const addAction = canManage ? [{
    id: CAPITAL_COMMAND_ACTION_IDS.ADD, label: 'Adjust an item', interactionType: 'START_WORKFLOW' as const, message: CAPITAL_COMMAND_MESSAGES.ADD,
    operationId: 'CAPITAL_TIMELINE_COMMAND' as const, entityType: CAPITAL_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
  }] : [];
  if (!overrides.length && !canManage) return [];
  return [{
    type: 'GROUPED_LIST', filters: [], id: 'capital-timeline-adjustments', title: 'Your adjustments to the timeline',
    description: overrides.length
      ? 'Corrections you made to what the timeline assumes. The timeline uses them the next time it is run.'
      : 'You have not adjusted what the timeline assumes. A planned date, a cost range or leaving an item off are examples.',
    sections: overrides.length ? [{
      id: 'capital-timeline-adjustments-all', title: 'Adjustments', count: overrides.length,
      items: overrides.slice(0, 25).map((override: any) => ({
        id: String(override.id), title: override.inventoryItemId ? names.get(String(override.inventoryItemId)) ?? 'Item' : 'Whole home',
        description: override.note ? String(override.note) : null,
        meta: [CAPITAL_OVERRIDE_SHORT_LABELS[String(override.type)] ?? String(override.type), `Added ${humanDate(new Date(override.createdAt))}`], status: null, href: null,
        entityType: CAPITAL_OVERRIDE_ENTITY_TYPE,
        actions: canManage ? [{ id: CAPITAL_COMMAND_ACTION_IDS.REMOVE, label: 'Remove', message: CAPITAL_COMMAND_MESSAGES.REMOVE, operationId: 'CAPITAL_TIMELINE_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'QUIET' as const }] : [],
      })),
    }] : [],
    actions: addAction,
  }];
}

// Desktop's "Bundle opportunity": windows close together can share a contractor visit. The quote check is the radar's, owner-only, so only the
// primary account holder is offered it; everyone else still sees the cluster.
async function capitalBundleBlocks(userId: string, propertyId: string, items: any[], canManage: boolean): Promise<AskPresentationBlock[]> {
  const bundle = capitalBundle(items);
  if (!bundle) return [];
  const names = bundle.group.map((item) => item.inventoryItem?.name ?? String(item.category).toLowerCase().replace(/_/g, ' '));
  const offer = canManage && await isPrimaryAccountHolder(userId, propertyId);
  return [{
    type: 'SUMMARY', id: 'capital-bundle-opportunity', title: `Bundle opportunity · ${bundle.yearRange}`, tone: 'DEFAULT',
    body: `${bundle.group.length} projects totalling about ${money(Math.round(bundle.midCents / 100))} are due around the same time (${names.join(', ')}). Bundling them can cut contractor mobilization costs.`,
    actions: offer ? [{
      id: CAPITAL_BUNDLE_ACTION_ID, label: 'Price-check this bundle', interactionType: 'START_WORKFLOW' as const, message: SERVICE_PRICE_CHECK_MESSAGE,
      operationId: 'SERVICE_PRICE_CHECK_RUN' as const, entityType: CAPITAL_BUNDLE_ENTITY_TYPE, entityId: String(bundle.group[0].id), style: 'SECONDARY' as const,
    }] : [],
  }];
}

async function capitalReservePlanResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const requestedHorizon = parseCapitalTimelineHorizonRequest(message);
  const [access, capitalContext, reserveContext, property, inventoryCount, capitalTimelineFinancialContext] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'CAPITAL_TIMELINE', operationKey: 'RUN_TIMELINE' }),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'RESERVE_FUND', operationKey: 'RECALCULATE' }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } }),
    prisma.inventoryItem.count({ where: { propertyId } }),
    // F05 fix (docs/architecture/ASK_COZY_PHASE3_PHASE7_FINANCIAL_ACCEPTANCE_VERIFICATION.md):
    // the SAME contextVersion computation homeCapitalTimelineService.runTimeline
    // itself uses to stamp inputsSnapshot._propertyContextVersion when a
    // createdByUserId is supplied (confirmed by direct read of that function) --
    // NOT evaluateFeatureContext's own contextVersion above, which is a
    // different hash over a narrower fact set and would never match what
    // runTimeline actually persisted. Comparing the wrong two versions would
    // make every analysis look stale (or never stale) by construction.
    getFinancialContextDecisions(propertyId, userId, 'CAPITAL_TIMELINE'),
  ]);
  const activeRequirement = reserveContext.requirements[0] ?? capitalContext.requirements[0];
  const captureFeature = reserveContext.requirements[0] ? 'RESERVE_FUND' as const : 'CAPITAL_TIMELINE' as const;
  const captureRequests = access.role !== HouseholdRole.VIEWER && activeRequirement
    ? [askCaptureRequest(activeRequirement, activeRequirement === reserveContext.requirements[0] ? reserveContext.contextVersion : capitalContext.contextVersion, 'Saved to the Living Home Record and reused by capital planning', null)]
    : [];
  let analysis: any = await homeCapitalTimelineService.getLatestTimeline(propertyId);
  // F05 fix: previously only recomputed when no analysis existed at all, so a
  // timeline was served unchanged forever regardless of later inventory or
  // property changes (no staleness check anywhere in
  // homeCapitalTimeline.service.ts, confirmed by direct read). Now also
  // recomputes when the stored snapshot's own contextVersion no longer
  // matches the current one -- the same "digest mismatch -> recompute"
  // pattern already used by sellHoldRentDecisionFamilyAdapter's selectThread.
  const isStale = isCapitalTimelineAnalysisStale(analysis, capitalTimelineFinancialContext.contextVersion);
  // Horizon re-run: an explicit "5-year"/"10-year" request that doesn't match
  // the currently stored horizon also forces a recompute, same as staleness --
  // otherwise a homeowner asking for a different horizon would silently keep
  // seeing the old one.
  const horizonMismatch = requestedHorizon != null && analysis?.horizonYears !== requestedHorizon;
  if ((!analysis || isStale || horizonMismatch) && property && inventoryCount > 0) {
    // Carry the stored run's assumption set forward, as the traditional page's
    // doRun does (CapitalTimelineClient.tsx defaults to activeAssumptionSetId)
    // -- without it resolveForTool falls back to canonical default rates and a
    // horizon switch would silently discard the homeowner's assumptions.
    const priorAssumptionSetId = typeof analysis?.inputsSnapshot?.assumptionSetId === 'string' ? analysis.inputsSnapshot.assumptionSetId : undefined;
    analysis = await homeCapitalTimelineService.runTimeline(propertyId, property.homeownerProfileId, requestedHorizon ?? analysis?.horizonYears ?? 10, { assumptionSetId: priorAssumptionSetId, createdByUserId: userId, propertyContextVersion: capitalContext.contextVersion, awaitReserveFundSync: true });
  }
  const [fund, allLineItems, contributionPage, reconciliationSuggestions]: any[] = await Promise.all([
    homeReserveFundService.getSummary(propertyId),
    homeReserveFundService.listLineItems(propertyId),
    homeReserveFundService.listContributions(propertyId, { limit: 20 }),
    homeReserveFundReconciliationService.findMatchSuggestions(propertyId),
  ]);
  const lineItems: any[] = allLineItems.filter((line: any) => line.status === 'ACTIVE');
  const retiredLineItems: any[] = allLineItems.filter((line: any) => line.status !== 'ACTIVE');
  const contributions: any[] = contributionPage.items ?? [];
  const canManage = access.role !== HouseholdRole.VIEWER;
  const capitalAdjustmentBlocks = await capitalAdjustmentsBlocks(propertyId, canManage);
  type ReserveItemAction = NonNullable<Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['sections'][number]['items'][number]['actions']>[number];
  const commandAction = (id: string, label: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY'): ReserveItemAction => ({ id, label, interactionType: 'MUTATE_RECORD', message: RESERVE_FUND_COMMAND_MESSAGE, operationId: 'RESERVE_FUND_COMMAND', style });
  if (!analysis || !Array.isArray(analysis.items) || analysis.items.length === 0) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'CAPITAL_PLAN_INVENTORY_REQUIRED', contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests,
    blocks: [{ type: 'SUMMARY', id: 'capital-plan-empty', title: 'Add at least one major appliance or system to build a capital plan', body: 'A reserve target without recorded systems would be a generic guess. Add the roof, HVAC, water heater, appliances, or other capital items and Ask will calculate a property-specific timeline.', tone: 'CAUTION', actions: [{ ...inventoryAddItemAction(), label: 'Add home systems' }] }],
    suggestions: [],
  };
  const items: any[] = analysis.items;
  const upcoming = items.slice().sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()).slice(0, 200);
  const totalLow = upcoming.reduce((sum, item) => sum + (item.estimatedCostMinCents ?? 0), 0);
  const totalHigh = upcoming.reduce((sum, item) => sum + (item.estimatedCostMaxCents ?? 0), 0);
  const targetTotalCents = lineItems.reduce((sum, line) => sum + (line.targetCostCents ?? 0), 0);
  const progress = targetTotalCents > 0 ? Math.min(100, Math.max(0, ((fund.currentBalanceCents ?? 0) / targetTotalCents) * 100)) : 0;
  const needsAttention = (fund.currentShortfallCents ?? 0) > 0 || progress < 100;
  const overviewAction = canManage
    ? (fund.currentBalanceCents ?? 0) === 0
      ? { id: RESERVE_FUND_ACTION_IDS.SET_BALANCE, label: 'Add current balance', interactionType: 'START_WORKFLOW' as const, message: RESERVE_FUND_COMMAND_MESSAGE, operationId: 'RESERVE_FUND_COMMAND', actionId: RESERVE_FUND_ACTION_IDS.SET_BALANCE, style: 'PRIMARY' as const }
      : { id: RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, label: 'Log a balance change', interactionType: 'START_WORKFLOW' as const, message: RESERVE_FUND_COMMAND_MESSAGE, operationId: 'RESERVE_FUND_COMMAND', actionId: RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, style: 'PRIMARY' as const }
    : null;
  const overviewSteps = upcoming.slice(0, 3).map((item) => ({
    id: String(item.id),
    title: String(item.inventoryItem?.name ?? String(item.category).toLowerCase().replace(/_/g, ' ')),
    description: `${humanDate(new Date(item.windowStart))}–${humanDate(new Date(item.windowEnd))}`,
    amountLabel: `${money((item.estimatedCostMinCents ?? 0) / 100)}–${money((item.estimatedCostMaxCents ?? 0) / 100)}`,
    meta: [String(item.confidence).toLowerCase() + ' confidence'],
    status: 'UPCOMING', href: null, entityType: 'CAPITAL_TIMELINE_ITEM', actions: [],
  }));
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'capital-reserve-summary',
    title: needsAttention ? 'Your reserve fund needs attention' : 'Your reserve fund is on track',
    body: needsAttention
      ? `${money((fund.currentBalanceCents ?? 0) / 100)} is recorded against a ${money(targetTotalCents / 100)} target; the current plan recommends ${money((fund.recommendedMonthlyContributionCents ?? 0) / 100)} per month.`
      : `${money((fund.currentBalanceCents ?? 0) / 100)} is recorded against a ${money(targetTotalCents / 100)} target, with no near-term shortfall.`,
    tone: needsAttention ? 'CAUTION' : 'DEFAULT', actions: [
      ...(overviewAction ? [overviewAction] : []),
      // Horizon re-run (FRD Appendix D planning/refinement follow-up): re-invokes this same CAPITAL_RESERVE_PLAN
      // operation with an explicit horizon in the message, mirroring the traditional page's own 5yr/10yr toggle --
      // only offers the horizon NOT currently shown, same as a two-state toggle rather than two redundant buttons.
      ...(analysis.horizonYears !== 5 ? [{ id: 'rerun-horizon-5', label: 'Show 5-year horizon', interactionType: 'START_WORKFLOW' as const, message: 'Show my capital reserve plan for a 5-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' as const }] : analysis.horizonYears !== 10 ? [{ id: 'rerun-horizon-10', label: 'Show 10-year horizon', interactionType: 'START_WORKFLOW' as const, message: 'Show my capital reserve plan for a 10-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' as const }] : []),
    ],
  }, {
    type: 'PROGRESS', id: 'reserve-fund-overview', title: 'Funding progress',
    description: `Based on the ${String(fund.posture).toLowerCase()} plan over ${analysis.horizonYears ?? 10} years.`,
    percent: progress,
    basis: `${money((fund.currentBalanceCents ?? 0) / 100)} of ${money(targetTotalCents / 100)} funded`,
    metrics: [
      { label: 'Monthly plan', value: `${money((fund.recommendedMonthlyContributionCents ?? 0) / 100)}/mo`, tone: (fund.recommendedMonthlyContributionCents ?? 0) > 0 ? 'CAUTION' : 'DEFAULT' },
      { label: 'Near-term gap', value: money((fund.currentShortfallCents ?? 0) / 100), tone: (fund.currentShortfallCents ?? 0) > 0 ? 'CRITICAL' : 'POSITIVE' },
      { label: 'Planning style', value: String(fund.posture).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()), tone: 'DEFAULT' },
    ],
    nextSteps: overviewSteps,
    actions: [],
  },
  capitalTimelineBlock(upcoming, items.length),
  ...(await capitalBundleBlocks(userId, propertyId, upcoming, canManage)),
  { type: 'GROUPED_LIST', filters: [], id: 'reserve-planning-controls', title: 'Adjust the plan', description: `The current planning style is ${String(fund.posture).toLowerCase()}. Conservative uses the high estimate, moderate uses the midpoint, and aggressive uses the low estimate.`, sections: [{ id: 'fund-actions', title: 'Balance and calculation', count: 2, items: [{ id: 'add-contribution', title: 'Log a balance change', description: 'Record a deposit, withdrawal, or balance correction. No money is transferred.', meta: ['Self-reported ledger'], status: 'AVAILABLE', entityType: 'RESERVE_FUND', ...(canManage ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, 'Log contribution', 'PRIMARY')] } : {}) }, { id: 'recalculate', title: 'Recalculate from current records', description: 'Refresh targets and allocations from your home’s replacement plan and recorded details.', meta: [fund.lastRecalculatedAt ? `Last recalculated ${humanDate(new Date(fund.lastRecalculatedAt))}` : 'Not recalculated yet'], status: 'AVAILABLE', entityType: 'RESERVE_FUND', ...(canManage ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS.RECALCULATE, 'Recalculate plan')] } : {}) }] }, { id: 'postures', title: 'Choose a planning style', count: 3, items: (['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const).map((posture) => ({ id: posture, title: posture[0] + posture.slice(1).toLowerCase(), description: posture === 'CONSERVATIVE' ? 'Uses the high end of each cost range for more cushion.' : posture === 'MODERATE' ? 'Uses the midpoint of each cost range.' : 'Uses the low end of each cost range for a smaller monthly target.', meta: [fund.posture === posture ? 'Current style' : 'Available'], status: fund.posture === posture ? 'CURRENT' : 'AVAILABLE', entityType: 'RESERVE_FUND_POSTURE', ...(canManage && fund.posture !== posture ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS[`POSTURE_${posture}`], `Use ${posture.toLowerCase()}`)] } : {}) })) }], actions: [] },
  ...capitalAdjustmentBlocks,
  // Home Capital Timeline reference journey (FRD Appendix D), first inline-detail slice: entityType routes these
  // through ReserveAllocationResultList (GroupedListBlock.tsx) instead of the generic href-only renderer, opening
  // canonical detail inline -- a fresh re-fetch via the existing GET .../reserve-fund/line-items list endpoint
  // (there is no single-line-item GET, so a removed allocation is a data-absence "no longer exists" state, the
  // same pattern already used for Household/Warranty detail). Read-only: no per-item mutation operation exists
  // yet, so no item `actions` are declared -- "planning/refinement" writes remain a separate, unscoped follow-up.
  { type: 'GROUPED_LIST', filters: [], id: 'reserve-allocations', title: 'Active reserve allocations', description: 'Allocated amounts are derived from timeline items and the homeowner’s reserve posture.', sections: [{ id: 'allocations', title: 'Funding plan', count: lineItems.length, items: lineItems.slice(0, 20).map((line) => ({ id: line.id, title: line.timelineItem?.inventoryItem?.name ?? String(line.timelineItem?.category ?? 'Capital item').toLowerCase().replace(/_/g, ' '), description: `${money(line.allocatedMonthlyCents / 100)}/month toward ${money(line.targetCostCents / 100)}`, meta: [String(line.status).toLowerCase()], status: line.status, href: null, entityType: 'RESERVE_LINE_ITEM', ...(canManage ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS.CONFIRM_ALLOCATION, line.allocationConfirmedAt && line.allocationConfirmedMonthlyCents === line.allocatedMonthlyCents ? 'Funding confirmed' : 'Confirm this funding')] } : {}) })) }],
    // The canonical allocation detail and funding plan are already inline.
    // A footer link to the same Reserve Fund read is redundant; the summary's
    // top-level action remains available to jump down to this section.
    actions: [] },
  ...(retiredLineItems.length ? [{ type: 'GROUPED_LIST' as const, filters: [], id: 'reserve-retired-items', title: 'Retired reserve items', description: 'These items no longer contribute to the active monthly recommendation.', sections: [{ id: 'retired', title: 'Retired items', count: retiredLineItems.length, items: retiredLineItems.slice(0, 20).map((line: any) => ({ id: String(line.id), title: String(line.timelineItem?.inventoryItem?.name ?? String(line.timelineItem?.category ?? 'Capital item').toLowerCase().replace(/_/g, ' ')), description: line.retiredReason ? `Retired: ${String(line.retiredReason).toLowerCase().replace(/_/g, ' ')}` : 'Retired', meta: [line.retiredAt ? humanDate(new Date(line.retiredAt)) ?? 'Date not recorded' : 'Date not recorded'], status: String(line.status), entityType: 'RESERVE_LINE_ITEM' })) }], actions: [] }] : []),
  { type: 'GROUPED_LIST', filters: [], id: 'reserve-contribution-ledger', title: 'Contribution ledger', description: `Current balance: ${money((fund.currentBalanceCents ?? 0) / 100)}. This ledger is self-reported; it is not connected to a bank and does not move money.${contributionPage.nextCursor ? ' Showing the 20 most recent entries.' : ''}`, sections: [{ id: 'contributions', title: 'Recent entries', count: contributions.length + (contributionPage.nextCursor ? 1 : 0), items: contributions.map((entry: any) => ({ id: String(entry.id), title: `${entry.amountCents >= 0 ? '+' : '−'}${money(Math.abs(entry.amountCents) / 100)} · ${String(entry.type).toLowerCase().replace(/_/g, ' ')}`, description: entry.note == null ? null : String(entry.note), meta: [humanDate(new Date(entry.occurredAt)) ?? 'Date not recorded'], status: 'RECORDED', entityType: 'RESERVE_FUND_CONTRIBUTION', ...(canManage ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION, 'Remove entry', 'QUIET')] } : {}) })) }], actions: [] },
  ...(reconciliationSuggestions.length ? [{ type: 'GROUPED_LIST' as const, filters: [], id: 'reserve-reconciliation-suggestions', title: 'Expenses that may complete a reserve item', description: 'These are suggestions based on category, amount, and timing. Nothing is retired automatically.', sections: [{ id: 'matches', title: 'Review matches', count: reconciliationSuggestions.length, items: reconciliationSuggestions.map((suggestion: any) => ({ id: `${suggestion.lineItemId}:${suggestion.expenseId}`, title: String(suggestion.expenseDescription), description: `${money(suggestion.expenseAmount)} on ${humanDate(new Date(suggestion.expenseDate))}`, meta: ['Possible reserve match'], status: 'REVIEW', entityType: 'RESERVE_RECONCILIATION', ...(canManage ? { actions: [commandAction(RESERVE_FUND_ACTION_IDS.ACCEPT_RECONCILIATION, 'Mark item retired', 'PRIMARY')] } : {}) })) }], actions: [] }] : []),
  { type: 'EVIDENCE', id: 'capital-plan-evidence', title: 'Planning sources and freshness', items: upcoming.slice(0, 12).map((item) => ({ label: item.inventoryItem?.name ?? String(item.category), source: `Home Capital Timeline · ${String(item.confidence).toLowerCase()} confidence`, observedAt: analysis.computedAt?.toISOString?.() ?? String(analysis.computedAt) })) },
  { type: 'BOUNDARY', id: 'capital-plan-boundary', title: 'Planning range—not a guaranteed expense schedule', body: 'Actual condition, inspections, maintenance, local labor and material prices, financing, insurance, and homeowner choices can move timing and cost. Keep emergency savings and capital reserves conceptually separate.', severity: 'INFO', suggestions: [] }];
  const firstNamedItem = upcoming.find((item) => item.inventoryItem?.name)?.inventoryItem?.name;
  return { status: captureRequests.length || analysis.confidence === 'LOW' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: captureRequests.length ? 'CAPITAL_PLAN_CONTEXT_OPTIONAL' : analysis.confidence === 'LOW' ? 'CAPITAL_PLAN_LOW_CONFIDENCE' : undefined, contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests, blocks, suggestions: [] };
}

// FRD v1.322: the household's appeal cases beside the readiness check, each with the one step it can take now. The service serves the primary owner only
// (a lookup by homeowner profile that otherwise throws), so for anyone else the section is simply absent.
const APPEAL_STEP_LABELS: Partial<Record<AppealCommandKind, { label: string; style: 'PRIMARY' | 'SECONDARY' | 'QUIET' }>> = {
  PACKET: { label: 'Prepare the packet', style: 'SECONDARY' }, FILING: { label: 'Record that I filed', style: 'PRIMARY' },
  EVENT: { label: 'Record a response or hearing', style: 'SECONDARY' }, DETERMINATION: { label: 'Record the decision', style: 'SECONDARY' },
  REMINDER_ADD: { label: 'Add a reminder', style: 'QUIET' },
};
export async function propertyTaxAppealCaseBlocks(userId: string, propertyId: string, canChange: boolean): Promise<AskPresentationBlock[]> {
  let cases: any[];
  try { cases = await propertyTaxAppealCaseService.list(propertyId, userId); } catch { return []; }
  if (!cases.length) return [];
  const action = (kind: AppealCommandKind, label: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET') => ({
    id: APPEAL_COMMAND_ACTION_IDS[kind], label, message: APPEAL_COMMAND_MESSAGES[kind], operationId: 'PROPERTY_TAX_APPEAL_COMMAND' as const, interactionType: 'MUTATE_RECORD' as const, style,
  });
  const when = (iso: unknown) => (typeof iso === 'string' ? humanDate(new Date(iso)) : null);
  const caseItems = cases.map((record) => {
    const open = (record.reminders ?? []).filter((reminder: any) => reminder.status === 'PENDING').length;
    return {
      id: record.id, title: record.title,
      description: [APPEAL_STATUS_LABELS[record.status] ?? record.status, APPEAL_GROUND_LABELS[record.ground] ?? null, record.taxYear ? `Tax year ${record.taxYear}` : null].filter(Boolean).join(' \u00b7 '),
      meta: [
        record.filedAt ? `Filed ${when(record.filedAt)}${record.externalFilingReference ? ` (${record.externalFilingReference})` : ''}` : null,
        record.hearingAt ? `Hearing ${when(record.hearingAt)}` : null,
        record.determination ? `Decision: ${APPEAL_DETERMINATION_LABELS[record.determination] ?? record.determination}` : null,
        record.refundAmount != null ? `Refund ${money(record.refundAmount)}` : null,
        open ? `${open} open reminder${open === 1 ? '' : 's'}` : null,
      ].filter((value): value is string => Boolean(value)),
      status: record.status, href: null, entityType: APPEAL_CASE_ENTITY_TYPE,
      actions: canChange
        ? appealCaseAvailableKinds({ status: record.status, filedAt: record.filedAt, packetStatus: record.packet?.status ?? null })
          .flatMap((kind) => { const spec = APPEAL_STEP_LABELS[kind]; return spec ? [action(kind, spec.label, spec.style)] : []; })
        : [],
    };
  });
  const reminderItems = cases.flatMap((record) => (record.reminders ?? []).filter((reminder: any) => reminder.status === 'PENDING').map((reminder: any) => ({
    id: reminder.id, title: reminder.title, description: `Due ${when(reminder.dueAt) ?? 'soon'} \u00b7 ${record.title}`, meta: [], status: 'PENDING', href: null, entityType: APPEAL_REMINDER_ENTITY_TYPE,
    actions: canChange ? [action('REMINDER_DONE', 'Mark done', 'PRIMARY'), action('REMINDER_DISMISS', 'Dismiss', 'QUIET')] : [],
  })));
  return [{
    type: 'GROUPED_LIST', filters: [], id: 'tax-appeal-cases', title: 'Your appeal cases',
    description: canChange
      ? 'Cozy prepares the appeal and records what you did. File on the official site yourself; each step below only records it after you confirm.'
      : 'A contributor or owner can take the next step on a case.',
    sections: [
      { id: 'tax-appeal-case-list', title: 'Cases', count: caseItems.length, items: caseItems },
      ...(reminderItems.length ? [{ id: 'tax-appeal-reminders', title: 'Open reminders', count: reminderItems.length, items: reminderItems }] : []),
    ],
    actions: [],
  }];
}

async function propertyTaxAppealReadinessResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const ground = /\b(?:tax class|classification)\b/i.test(message) ? 'TAX_CLASS' as const : /\bexemption\b/i.test(message) ? 'EXEMPTION' as const : 'ASSESSED_VALUE' as const;
  const context = await evaluateFeatureContext(propertyId, userId, { featureKey: 'TAX_APPEAL', operationKey: 'RUN_ANALYSIS' });
  const requirement = context.requirements[0];
  const captureRequests = access.role !== HouseholdRole.VIEWER && requirement
    ? [askCaptureRequest(requirement, context.contextVersion, 'Saved to the canonical property-tax and Property Context records', null)] : [];
  const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, ground);
  if (readiness.status === 'NOT_COVERED') return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE', contextVersion: context.contextVersion, captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'tax-readiness-not-covered', title: 'Appeal readiness is not available for this property yet',
      body: `${readiness.reason ?? 'Ask cannot determine filing readiness without an active reviewed jurisdiction rule.'} Cozy must match a reviewed official assessment and activate the jurisdiction rules; this is not a homeowner setup step. For now, verify the current assessed value, appeal deadline, eligibility, evidence standard, and required form with the local assessor or tax office.`,
      tone: 'CAUTION', actions: [],
    }, { type: 'BOUNDARY', id: 'tax-coverage-boundary', title: 'Verify with the official authority', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] }], suggestions: [],
  };
  const atStake = readiness.taxAtStake;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'tax-readiness-summary', title: readiness.status === 'READY' ? `${readiness.ground?.label ?? ground}: preparation requirements are present` : readiness.status === 'NO_SUPPORTED_GROUND' ? 'The current evidence does not support this reviewed ground' : `${readiness.gaps.length} readiness gap${readiness.gaps.length === 1 ? '' : 's'} remain`,
    body: `${readiness.reason ?? ''}${atStake ? ` The sourced planning range for annual tax at stake is ${money(atStake.low)}–${money(atStake.high)}.` : ''} Readiness does not predict appeal success.`,
    tone: readiness.status === 'READY' ? 'DEFAULT' : 'CAUTION',
    actions: access.role !== HouseholdRole.VIEWER ? [{
      id: APPEAL_COMMAND_ACTION_IDS.START, label: 'Start an appeal case', interactionType: 'START_WORKFLOW' as const, message: APPEAL_COMMAND_MESSAGES.START,
      operationId: 'PROPERTY_TAX_APPEAL_COMMAND' as const, entityType: APPEAL_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: readiness.status === 'READY' ? 'PRIMARY' as const : 'SECONDARY' as const,
    }, {
      // FRD v1.355: a comparable sale the household found, added to the appeal evidence.
      id: COMPARABLE_ACTION_ID, label: 'Add a comparable sale', interactionType: 'START_WORKFLOW' as const, message: COMPARABLE_MESSAGE,
      operationId: 'PROPERTY_TAX_COMPARABLE_COMMAND' as const, style: 'SECONDARY' as const,
    },
    // FRD v1.367: the evidence the selected ground needs, from a link. The assessed-value ground needs comparables, not an evidence row, so it is offered only
    // the optional condition statement.
    ...(ground === 'TAX_CLASS' ? [{
      id: EVIDENCE_ACTION_IDS.CLASS, label: 'Add class evidence', interactionType: 'START_WORKFLOW' as const, message: EVIDENCE_MESSAGES.CLASS,
      operationId: 'PROPERTY_TAX_COMPARABLE_COMMAND' as const, style: 'SECONDARY' as const,
    }] : []),
    ...(ground === 'EXEMPTION' ? [{
      id: EVIDENCE_ACTION_IDS.EXEMPTION, label: 'Add the exemption decision', interactionType: 'START_WORKFLOW' as const, message: EVIDENCE_MESSAGES.EXEMPTION,
      operationId: 'PROPERTY_TAX_COMPARABLE_COMMAND' as const, style: 'SECONDARY' as const,
    }] : []),
    {
      id: EVIDENCE_ACTION_IDS.CONDITION, label: 'Add supporting condition evidence (optional)', interactionType: 'START_WORKFLOW' as const,
      message: EVIDENCE_MESSAGES[conditionKindForGround(ground)], operationId: 'PROPERTY_TAX_COMPARABLE_COMMAND' as const, style: 'QUIET' as const,
    }, {
      // FRD v1.370: confirmed tax facts from a tax notice or bill already in the home records.
      id: DOCUMENT_FACTS_ACTION_ID, label: 'Confirm facts from a tax notice or bill', interactionType: 'START_WORKFLOW' as const, message: DOCUMENT_FACTS_MESSAGE,
      operationId: 'PROPERTY_TAX_COMPARABLE_COMMAND' as const, style: 'QUIET' as const,
    }] : [],
  }];
  if (readiness.canonical) blocks.push({ type: 'TABLE', id: 'tax-canonical-facts', title: 'Canonical tax facts used', description: 'Unknown facts remain unknown and are never treated as zero.', columns: [{ key: 'fact', label: 'Fact' }, { key: 'value', label: 'Recorded value' }], rows: [
    ['Tax year', readiness.canonical.taxYear], ['Classification', readiness.canonical.classification], ['Assessed value', readiness.canonical.totalAssessedValue == null ? null : money(readiness.canonical.totalAssessedValue)], ['Taxable value', readiness.canonical.taxableValue == null ? null : money(readiness.canonical.taxableValue)], ['Effective tax rate', readiness.canonical.effectiveTaxRate == null ? null : `${(readiness.canonical.effectiveTaxRate * 100).toFixed(3)}%`],
  ].map(([fact, value], index) => ({ id: `tax-fact-${index}`, values: { fact: String(fact), value: value == null ? 'Not confirmed' : String(value) } })), actions: [] });
  // Plan layout (FRD Appendix C.9): numbered cards; open gaps read as the urgent group, confirmed evidence as the calm one.
  blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'tax-readiness-gaps', title: readiness.gaps.length ? 'What is still needed' : 'Evidence package', description: `Estimated preparation effort: ${String(readiness.effort).toLowerCase()}.`, sections: [{ id: 'gaps', title: readiness.gaps.length ? 'Readiness gaps' : 'Confirmed evidence', count: readiness.gaps.length || readiness.evidence.length, items: readiness.gaps.length ? readiness.gaps.map((gap: string, index: number) => ({ id: `tax-gap-${index}`, title: gap, description: null, meta: ['Still needed'], status: 'OPEN', href: null, tone: 'CAUTION' as const, countLabel: String(index + 1) })) : readiness.evidence.map((evidence: any, index: number) => ({ id: evidence.id, title: evidence.title, description: evidence.description ?? null, meta: ['Confirmed', String(evidence.type).toLowerCase().replace(/_/g, ' ')], status: 'CONFIRMED', href: null, countLabel: String(index + 1) })) }], actions: [] });
  if (readiness.evidence.length || readiness.ruleProfile) blocks.push({ type: 'EVIDENCE', id: 'tax-readiness-evidence', title: 'Rule and evidence provenance', items: [{ label: readiness.ruleProfile?.title ?? 'Reviewed appeal rule', source: readiness.ruleProfile ? `Rule ${readiness.ruleProfile.version}` : 'Property Tax Center', observedAt: readiness.ruleProfile?.reviewedAt?.toISOString?.() ?? readiness.ruleProfile?.reviewedAt ?? readiness.evaluatedAt }, ...readiness.evidence.slice(0, 15).map((evidence: any) => ({ label: evidence.title, source: evidence.sourceUrl ? 'Sourced appeal evidence' : 'Vault-supported appeal evidence', observedAt: evidence.confirmedAt }))] });
  blocks.push(...await propertyTaxAppealCaseBlocks(userId, propertyId, access.role !== HouseholdRole.VIEWER));
  blocks.push({ type: 'BOUNDARY', id: 'tax-readiness-boundary', title: 'Preparation support—not tax, appraisal, or legal advice', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] });
  return { status: readiness.status === 'READY' && !captureRequests.length ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: readiness.status === 'READY' ? (captureRequests.length ? 'PROPERTY_TAX_CONTEXT_OPTIONAL' : undefined) : `PROPERTY_TAX_${readiness.status}`, contextVersion: context.contextVersion, captureRequests, blocks, suggestions: [] };
}

// IW-PRES-020 (FRD v1.94): the renovation case's blocking readiness items as a ring. The renovation readiness service
// keeps a state and counts (total, open, blocking, acknowledged) but no percent, so this defines one, on the domain's own
// rule for what blocks a start: a blocking item is settled when it is satisfied or its open state was acknowledged
// (`READY_WITH_ACKNOWLEDGED_OPEN_ITEMS`); only blocking items are counted, other open items are listed but not counted.
// With no blocking items there is no ring, since nothing recorded says the case is ready.
export function renovationReadinessProgress(
  items: ReadonlyArray<{ id: string; title: string; status: string; isBlocking: boolean; overrideAcknowledgedAt?: Date | string | null; reason?: string | null; exactNextAction?: string | null }>,
): Extract<AskPresentationBlock, { type: 'PROGRESS' }> | null {
  const blocking = items.filter((item) => item.isBlocking);
  if (!blocking.length) return null;
  const isOpen = (item: { status: string; overrideAcknowledgedAt?: Date | string | null }) => item.status !== 'SATISFIED' && !item.overrideAcknowledgedAt;
  const blockingOpen = blocking.filter(isOpen);
  const settled = blocking.length - blockingOpen.length;
  const acknowledged = blocking.filter((item) => item.status !== 'SATISFIED' && Boolean(item.overrideAcknowledgedAt)).length;
  const otherOpen = items.filter((item) => !item.isBlocking && item.status !== 'SATISFIED').length;
  return {
    type: 'PROGRESS', id: 'renovation-readiness-progress', title: 'Ready to start',
    description: 'Counts the items that block starting the work: a blocking item counts once it is satisfied or its open state was acknowledged. Other open items are listed but not counted, and this does not establish legal compliance.',
    percent: Math.round((settled / blocking.length) * 100),
    basis: `${settled} of ${blocking.length} blocking item${blocking.length === 1 ? '' : 's'} satisfied or acknowledged`,
    metrics: [
      { label: 'Blocking', value: String(blockingOpen.length), tone: blockingOpen.length ? 'CAUTION' : 'DEFAULT' },
      { label: 'Acknowledged', value: String(acknowledged), tone: 'DEFAULT' },
      { label: 'Other open', value: String(otherOpen), tone: 'DEFAULT' },
    ],
    nextSteps: blockingOpen.slice(0, 3).map((item) => ({
      id: item.id, title: item.title, description: [item.reason, item.exactNextAction].filter(Boolean).join(' · ') || 'Blocking item still open',
      meta: [], status: item.status, href: null, entityType: null,
    })),
    actions: [],
  };
}

const READINESS_COMMAND_ACTIONS = READINESS_COMMAND_ACTION_IDS;
const READINESS_ITEM_LABELS: Record<ReadinessCommandKind, string> = {
  REFRESH: 'Refresh readiness', ACKNOWLEDGE: 'Acknowledge the risk', REVOKE: 'Withdraw the acknowledgement', REOPEN: 'Reopen', SATISFY: 'Mark satisfied with a document',
  HANDOFF: 'Create the execution project', GENERATE: 'Generate requirements research', SATISFY_CONDITION: 'Mark satisfied with a document', ATTACH_RECORD: 'Attach a permit or HOA record',
  AUTHORITY_PROFILE: 'Confirm the jurisdiction', DETERMINE_REQUIREMENT: 'Record a determination', REVIEW_HOA_READING: 'Review this reading', RETROACTIVE_REVIEW: 'Start a historical review',
};

async function renovationPermitReadinessResult(propertyId: string, message: string, canStart = false, isOwner = false): Promise<AskOperationResult> {
  const [cases, permitSummary] = await Promise.all([listRenovationCases(propertyId), permitTrackerService.getPermitSummary(propertyId)]);
  if (isRenovationRetroactiveRequest(message)) return renovationRetroactiveResult(propertyId, cases, canStart);
  if (!cases.length) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_CASE_REQUIRED',
    blocks: [{
      type: 'SUMMARY', id: 'renovation-readiness-empty', title: 'No active renovation case is recorded',
      body: `No active renovation case is recorded, so readiness cannot be checked. The Permit Tracker currently shows ${permitSummary.totalPermits} permit record${permitSummary.totalPermits === 1 ? '' : 's'} and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}, but those records cannot establish the scope of new work. ${canStart ? 'Start a renovation case to describe the work, then check its readiness.' : 'A contributor or owner can start a renovation case.'}`,
      headline: 'No active renovation case is recorded', supportLine: 'Readiness cannot be checked until the planned work is described.',
      bullets: [
        { label: 'Why it is unavailable', body: 'No renovation scope is recorded for this home.' },
        { label: 'Permit Tracker', body: `${permitSummary.totalPermits} permit record${permitSummary.totalPermits === 1 ? '' : 's'} and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'} are on file, but they do not define the new work.` },
        { label: 'Next step', body: canStart ? 'Start a renovation case to describe the work, then check its readiness.' : 'A contributor or owner can start a renovation case.' },
      ],
      tone: 'CAUTION', actions: canStart ? [{ id: RENOVATION_CASE_START_ACTION_ID, label: 'Start a renovation case', interactionType: 'START_WORKFLOW' as const, message: RENOVATION_CASE_START_MESSAGE, operationId: 'RENOVATION_CASE_START' as const, style: 'PRIMARY' as const }, reviewPastWorkAction()] : [],
    }, { type: 'BOUNDARY', id: 'renovation-empty-boundary', title: 'Scope and jurisdiction still control', body: 'Permit, zoning, HOA, licensing, inspection, and safety requirements depend on the exact scope and current authority rules. Absence of a record is not proof that approval is unnecessary.', severity: 'INFO', suggestions: [] }], suggestions: [],
  };
  const lower = message.toLowerCase();
  const named = cases.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  const selected = named ?? cases[0];
  // Several cases: say so and list them, so the case detailed below is never a silent pick (desktop lists every case with its stage and next step).
  const caseList = (shownId: string | null): AskPresentationBlock => ({
    type: 'GROUPED_LIST', filters: [], id: 'renovation-cases', title: 'Your renovation cases',
    description: shownId ? `Showing ${selected.name}${named ? '' : ', the most recently updated'}. Pick another case to see its readiness.` : 'Pick a case to see its readiness checklist.',
    sections: [{ id: 'cases', title: 'Renovation cases', count: cases.length, items: renovationCaseRows(cases, shownId) as any }], actions: [],
  });
  if (cases.length > 1 && !named && isRenovationCaseOverviewRequest(message)) return {
    status: 'ANSWERED', contextVersion: cases[0].updatedAt.toISOString(), suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'renovation-cases-summary', title: `You have ${cases.length} renovation cases`, body: `They are listed with their stage, readiness and next step. The most recently updated is ${cases[0].name} (${renovationLifecycleLabel(cases[0].lifecycle).toLowerCase()}).`, tone: 'DEFAULT', actions: [reviewPastWorkAction()] }, caseList(null)],
  };
  if (isRenovationComplianceRequest(message) && !isRenovationRequirementsRequest(message)) return renovationComplianceResult(propertyId, selected, cases.length > 1 && !named ? caseList(selected.id) : null, canStart);
  if (isRenovationRequirementsRequest(message)) return renovationRequirementsResult(propertyId, selected, cases.length > 1 && !named ? caseList(selected.id) : null, canStart);
  let readiness: any;
  try { readiness = await getRenovationReadiness(propertyId, selected.id); } catch { readiness = { summary: { state: 'NOT_EVALUATED', disclaimer: 'Readiness has not been evaluated for the current scope.' }, items: [], project: null }; }
  const summary = readiness.summary ?? {};
  const items: any[] = readiness.items ?? [];
  const blockers = items.filter((item) => item.isBlocking && item.status !== 'SATISFIED');
  const open = items.filter((item) => item.status !== 'SATISFIED');
  const blocks: AskPresentationBlock[] = [{ type: 'SUMMARY', id: 'renovation-readiness-summary', title: summary.state === 'READY' ? `${selected.name} is recorded as ready to start` : summary.state === 'NOT_EVALUATED' ? `${selected.name} needs a current readiness evaluation` : `${blockers.length} blocking item${blockers.length === 1 ? '' : 's'} remain for ${selected.name}`, body: `Stage: ${renovationLifecycleLabel(selected.lifecycle)}. ${summary.disclaimer ?? 'This organizes canonical project records and does not establish legal compliance.'} Permit Tracker: ${permitSummary.activePermits} active permit${permitSummary.activePermits === 1 ? '' : 's'}, ${permitSummary.finaledPermits} finaled, and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}.`, tone: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'DEFAULT' : 'CAUTION',
    // FRD v1.324: re-evaluating readiness is a contributor's step on the case.
    actions: canStart ? [{
      id: READINESS_COMMAND_ACTIONS.REFRESH, label: summary.state === 'NOT_EVALUATED' ? 'Run the readiness check' : 'Refresh readiness', interactionType: 'START_WORKFLOW' as const,
      message: READINESS_COMMAND_MESSAGES.REFRESH, operationId: 'RENOVATION_READINESS_COMMAND' as const, entityType: RENOVATION_READINESS_CASE_ENTITY_TYPE, entityId: selected.id,
      style: summary.state === 'NOT_EVALUATED' ? 'PRIMARY' as const : 'SECONDARY' as const,
    }, ...(isOwner && !readiness.project && ['READY', 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'].includes(summary.state) ? [{
      // FRD v1.374: creating the execution Project from a ready case is an owner's step; the answer offers it only when readiness allows a planned start.
      id: READINESS_COMMAND_ACTIONS.HANDOFF, label: READINESS_ITEM_LABELS.HANDOFF, interactionType: 'START_WORKFLOW' as const,
      message: READINESS_COMMAND_MESSAGES.HANDOFF, operationId: 'RENOVATION_READINESS_COMMAND' as const, entityType: RENOVATION_READINESS_CASE_ENTITY_TYPE, entityId: selected.id,
      style: 'PRIMARY' as const,
    }] : [])] : [] }];
  // IW-PRES-020 (FRD v1.94): the blocking items as a ring, ahead of the checklist.
  const ring = renovationReadinessProgress(items);
  if (cases.length > 1) blocks.push(caseList(selected.id));
  if (ring) blocks.push(ring);
  // Plan layout (FRD Appendix C.9): numbered across both groups. Blocking items are the urgent group; the next action and the evidence it needs
  // open under the card (they were long chips), and each card says whether it blocks starting.
  if (items.length) {
    let number = 0;
    const renovationItem = (item: any, blocking: boolean) => {
      number += 1;
      const facts = [item.exactNextAction ? `Next step: ${item.exactNextAction}` : null, item.evidenceRequired ? `Evidence needed: ${item.evidenceRequired}` : null].filter(Boolean).join('\n');
      return {
        id: item.id, title: item.title, description: item.reason ?? null,
        meta: [blocking ? 'Blocks starting' : 'Open', ...(item.overrideAcknowledgedAt ? ['Acknowledged'] : [])],
        status: item.status, href: null, tone: blocking ? 'CAUTION' as const : 'DEFAULT' as const, countLabel: String(number), ...(facts ? { detail: facts } : {}),
        entityType: RENOVATION_READINESS_ITEM_ENTITY_TYPE,
        actions: readinessItemKinds(item).filter((kind) => canStart && (isOwner || (kind !== 'ACKNOWLEDGE' && kind !== 'REVOKE'))).map((kind: ReadinessCommandKind) => ({
          id: READINESS_COMMAND_ACTIONS[kind], label: READINESS_ITEM_LABELS[kind], message: READINESS_COMMAND_MESSAGES[kind], operationId: 'RENOVATION_READINESS_COMMAND' as const,
          interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const,
        })),
      };
    };
    const blockingItems = blockers.slice(0, 20).map((item) => renovationItem(item, true));
    const otherItems = open.filter((item) => !item.isBlocking).slice(0, 20).map((item) => renovationItem(item, false));
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'renovation-readiness-items', title: 'Readiness checklist', description: 'Blocking state is owned by the canonical renovation scope, requirement, compliance, quote, schedule, and evidence records.', sections: [
      { id: 'blocking', title: 'Blocking', caption: 'These stop the work from starting until they are satisfied or acknowledged.', count: blockers.length, items: blockingItems },
      // Only the non-blocking group is collapsed (initialVisibleCount, local expand/collapse): blocking items always show in full. The count above
      // the delivered items is unchanged and is NOT resolved by this: at most 20 items are delivered per group, so "Show more" never reaches the rest.
      { id: 'other-open', title: 'Other open items', count: Math.max(0, open.length - blockers.length), initialVisibleCount: 5, items: otherItems },
    ].filter((section) => section.count > 0), actions: [] });
  }
  blocks.push({ type: 'EVIDENCE', id: 'renovation-readiness-evidence', title: 'Readiness sources', items: items.slice(0, 25).map((item) => ({ label: item.title, source: String(item.sourceType ?? 'Renovation readiness').toLowerCase().replace(/_/g, ' '), observedAt: item.sourceObservedAt?.toISOString?.() ?? item.derivedAt?.toISOString?.() ?? null })) });
  blocks.push({ type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization—not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A “ready” app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] });
  return { status: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: summary.state === 'READY' ? (permitSummary.openFlags ? 'PERMIT_FLAGS_OPEN' : undefined) : `RENOVATION_${summary.state ?? 'NOT_READY'}`, contextVersion: selected.updatedAt.toISOString(), blocks, suggestions: [] };
}

/** "Review past work": the completed improvements on the timeline that a historical review could start from (the desktop's "Start historical review"). */
const reviewPastWorkAction = () => ({
  id: RENOVATION_RETROACTIVE_LIST_ACTION_ID, label: 'Review past work', interactionType: 'START_WORKFLOW' as const, message: RENOVATION_RETROACTIVE_MESSAGE,
  operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'SECONDARY' as const,
});

/**
 * Slice 4 of the Renovations parity review: the historical review's candidates. Completed improvements on the home timeline that a review could check for
 * permit, tax, licensing, zoning and closeout gaps. Starting one is a contributor's declared step; a review already started says so and offers its requirements.
 */
export async function renovationRetroactiveResult(propertyId: string, cases: ReadonlyArray<{ id: string; name: string; updatedAt: Date }>, canChange: boolean): Promise<AskOperationResult> {
  const candidates = await detectRetroactiveCandidates(propertyId, 10);
  const contextVersion = (cases[0]?.updatedAt ?? new Date(0)).toISOString();
  const open = candidates.filter((candidate) => !candidate.existingRenovationCaseId);
  if (candidates.length === 0) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'RENOVATION_RETROACTIVE_NO_CANDIDATES', contextVersion, suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'renovation-retroactive-summary', title: 'No completed improvement is on your home timeline to review', body: 'A historical review starts from completed work recorded on the home timeline, and none is recorded as an improvement. That is not evidence that no work was done: work that is not on the timeline cannot be reviewed from here.', tone: 'DEFAULT', actions: [] }],
  };
  const rows = renovationRetroactiveRows(candidates, new Map(cases.map((entry) => [entry.id, entry.name])), {
    canChange, date: (value) => humanDate(new Date(value)) ?? null, money: (value) => money(value),
  });
  return {
    status: 'ANSWERED', contextVersion, suggestions: [],
    blocks: [{
      type: 'SUMMARY', id: 'renovation-retroactive-summary',
      title: open.length ? `${open.length} past improvement${open.length === 1 ? '' : 's'} could be reviewed for compliance` : 'Every past improvement on your timeline already has a review',
      body: `A historical review checks completed work for permit, tax, licensing, zoning and closeout gaps. It records what your timeline says and organizes the questions; it does not decide that the work was compliant.${canChange ? '' : ' A contributor or owner can start one.'}`,
      tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'renovation-retroactive', title: 'Past work on your timeline', sections: [{ id: 'past-work', title: 'Completed improvements', count: rows.length, items: rows as any }], actions: [],
    }, { type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization\u2014not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A \u201cready\u201d app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] }],
  };
}

// Slice 3a of the Renovations parity review: the read view of Desktop's permit and HOA workflow. Official status and reported status are shown apart, a
// missing record is never read as "not required", and HOA document extractions are candidates. Attaching records and satisfying conditions are not in Ask yet.
export async function renovationComplianceResult(propertyId: string, selected: { id: string; name: string; updatedAt: Date }, caseListBlock: AskPresentationBlock | null, canChange = false): Promise<AskOperationResult> {
  let workflow: any = null;
  try { workflow = await getComplianceWorkflow(propertyId, selected.id); } catch { workflow = null; }
  const contextVersion = selected.updatedAt.toISOString();
  if (!workflow) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'RENOVATION_COMPLIANCE_UNAVAILABLE', contextVersion, suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'renovation-compliance-unavailable', title: `${selected.name} has no scope to track approvals against yet`, body: 'Permits, HOA approvals and conditions are tracked against the case\u2019s current scope, and this case does not have one recorded. Defining scope is not currently available in Ask.', tone: 'CAUTION', actions: [] }],
  };
  const dateLabel = (value: Date) => humanDate(value) ?? value.toISOString().slice(0, 10);
  const parts = renovationComplianceSections(workflow, dateLabel, canChange);
  const blockers = (workflow.blockers ?? []).length;
  const sections = [
    { id: 'permits', title: 'Permits', caption: workflow.coverage.permit.message, count: parts.permits.length, items: parts.permits },
    { id: 'hoa', title: 'HOA approvals', caption: workflow.coverage.hoa.message, count: parts.hoaApprovals.length, items: parts.hoaApprovals },
    { id: 'open-conditions', title: 'Conditions still open', caption: 'A condition is satisfied only with a property document as verification evidence.', count: parts.openConditions.length, items: parts.openConditions },
    { id: 'satisfied-conditions', title: 'Conditions satisfied', count: parts.satisfiedConditions.length, items: parts.satisfiedConditions },
    { id: 'hoa-readings', title: 'HOA document readings', caption: 'Extracted decisions and conditions are candidates until a homeowner reviews them.', count: parts.reviews.length, items: parts.reviews },
  ].map((section) => ({ ...section, items: section.items.slice(0, 100) as any, ...(section.items.length > 8 ? { initialVisibleCount: 8 } : {}) }))
    .filter((section) => section.count > 0 || section.id === 'permits' || section.id === 'hoa');
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'renovation-compliance-summary',
    title: blockers ? `${blockers} approval condition${blockers === 1 ? '' : 's'} still block${blockers === 1 ? 's' : ''} closeout for ${selected.name}` : `Permits, HOA approvals and conditions for ${selected.name}`,
    body: `${workflow.coverage.permit.message} ${workflow.coverage.hoa.message} Official status comes from an authority or the association; reported status is what the household recorded. ${parts.alerts.length ? ` Expiring soon: ${parts.alerts.join(' ')}` : ''} ${canChange ? 'You can attach a permit or HOA record, mark a condition satisfied and review HOA document readings here.' : 'A contributor or owner can attach records, mark conditions satisfied and review HOA document readings.'}`,
    tone: blockers || parts.alerts.length ? 'CAUTION' : 'DEFAULT',
    // Attaching a record is a contributor's step on the case; the action is offered only to someone who can take it.
    actions: canChange ? [{
      id: READINESS_COMMAND_ACTIONS.ATTACH_RECORD, label: READINESS_ITEM_LABELS.ATTACH_RECORD, interactionType: 'START_WORKFLOW' as const, message: READINESS_COMMAND_MESSAGES.ATTACH_RECORD,
      operationId: 'RENOVATION_READINESS_COMMAND' as const, entityType: RENOVATION_READINESS_CASE_ENTITY_TYPE, entityId: selected.id, style: 'SECONDARY' as const,
    }] : [],
  }];
  if (caseListBlock) blocks.push(caseListBlock);
  blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'renovation-compliance', title: 'Permit and HOA workflow', description: 'A record attached here belongs to this case\u2019s current scope.', sections: sections as any, actions: [] });
  blocks.push({ type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization\u2014not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A \u201cready\u201d app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] });
  return { status: 'ANSWERED', contextVersion, blocks, suggestions: [] };
}

// Slice 2a of the Renovations parity review: the read view of Desktop's Requirements page. Advisor results are research candidates; only sourced
// authority or professional evidence establishes a requirement, and the answer keeps that distinction. Recording a determination is not in Ask yet.
export async function renovationRequirementsResult(propertyId: string, selected: { id: string; name: string; updatedAt: Date }, caseListBlock: AskPresentationBlock | null, canStart: boolean): Promise<AskOperationResult> {
  let requirements: any[] | null = null;
  let profiles: any[] = [];
  try {
    [requirements, profiles] = await Promise.all([listRequirements(propertyId, selected.id), listAuthorityProfiles(propertyId, selected.id)]);
  } catch { requirements = null; }
  const contextVersion = selected.updatedAt.toISOString();
  if (requirements === null) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'RENOVATION_REQUIREMENTS_UNAVAILABLE', contextVersion, suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'renovation-requirements-unavailable', title: `${selected.name} has no scope to research yet`, body: 'Requirements are researched against the case\u2019s current scope, and this case does not have one recorded. Defining scope is not currently available in Ask.', tone: 'CAUTION', actions: [] }],
  };
  const { unresolved, determined } = renovationRequirementRows(requirements, (value) => humanDate(value) ?? value.toISOString().slice(0, 10), canStart);
  const confirmedProfile = profiles.find((profile) => profile.status === 'CONFIRMED');
  const profileLine = confirmedProfile
    ? `Jurisdiction profile: ${confirmedProfile.authorityName ?? 'authority'} confirmed${confirmedProfile.confirmedByName || confirmedProfile.confirmedByOrg ? ` by ${confirmedProfile.confirmedByName || confirmedProfile.confirmedByOrg}` : ''}.`
    : 'No jurisdiction profile has been confirmed for this case.';
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'renovation-requirements-summary',
    title: requirements.length === 0 ? `No requirements have been researched for ${selected.name}` : unresolved.length ? `${unresolved.length} of ${requirements.length} requirement${requirements.length === 1 ? '' : 's'} still need research for ${selected.name}` : `All ${requirements.length} requirement${requirements.length === 1 ? ' is' : 's are'} determined for ${selected.name}`,
    body: `Advisor results are research candidates. Only sourced authority or professional evidence establishes a requirement. ${profileLine}${requirements.length === 0 ? (canStart ? ' Generating research candidates creates the questions to research.' : ' A contributor or owner can generate the research candidates.') : unresolved.length ? (canStart ? ' Record a determination on each one once you have its source.' : ' A contributor or owner can record determinations.') : ''}`,
    tone: unresolved.length ? 'CAUTION' : 'DEFAULT',
    // Generating is a contributor's step on the case; the answer offers it only while nothing has been researched for the current scope.
    actions: [...(canStart ? [{
      id: READINESS_COMMAND_ACTIONS.AUTHORITY_PROFILE, label: confirmedProfile ? 'Update the jurisdiction' : READINESS_ITEM_LABELS.AUTHORITY_PROFILE, interactionType: 'START_WORKFLOW' as const, message: READINESS_COMMAND_MESSAGES.AUTHORITY_PROFILE,
      operationId: 'RENOVATION_READINESS_COMMAND' as const, entityType: RENOVATION_READINESS_CASE_ENTITY_TYPE, entityId: selected.id, style: 'SECONDARY' as const,
    }] : []), ...(requirements.length === 0 && canStart ? [{
      id: READINESS_COMMAND_ACTIONS.GENERATE, label: READINESS_ITEM_LABELS.GENERATE, interactionType: 'START_WORKFLOW' as const, message: READINESS_COMMAND_MESSAGES.GENERATE,
      operationId: 'RENOVATION_READINESS_COMMAND' as const, entityType: RENOVATION_READINESS_CASE_ENTITY_TYPE, entityId: selected.id, style: 'PRIMARY' as const,
    }] : [])],
  }];
  if (caseListBlock) blocks.push(caseListBlock);
  if (requirements.length) blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'renovation-requirements', title: 'Requirements', description: 'Each is a research question for this case\u2019s current scope, not a compliance conclusion.',
    sections: [
      { id: 'unresolved', title: 'Needs research', caption: 'Blocking ones stop the work from starting until they are determined.', count: unresolved.length, items: unresolved.slice(0, 100) as any, ...(unresolved.length > 8 ? { initialVisibleCount: 8 } : {}) },
      { id: 'determined', title: 'Determined', count: determined.length, items: determined.slice(0, 100) as any, ...(determined.length > 8 ? { initialVisibleCount: 8 } : {}) },
    ].filter((section) => section.count > 0), actions: [],
  });
  blocks.push({ type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization\u2014not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A \u201cready\u201d app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] });
  return { status: 'ANSWERED', contextVersion, blocks, suggestions: [] };
}

async function majorEventEntryResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const event = /\b(?:sell|selling|home sale)\b/i.test(message) ? 'SELLING'
    : /\b(?:renovation|remodel)\b/i.test(message) ? 'RENOVATION'
      : /\b(?:claim|storm damage)\b/i.test(message) ? 'CLAIM'
        : /\b(?:aging in place)\b/i.test(message) ? 'AGING_IN_PLACE' : 'MOVING';
  const goal = event === 'SELLING' ? 'prepare my home to sell and organize seller records'
    : event === 'RENOVATION' ? 'plan a renovation, permits, and project tracking'
      : event === 'CLAIM' ? 'review insurance coverage and organize claim evidence'
        : event === 'AGING_IN_PLACE' ? 'plan home improvements and maintenance for aging in place'
          : 'organize home records and prepare for moving';
  const result = await capabilityResult(userId, propertyId, goal);
  result.blocks.unshift({ type: 'SUMMARY', id: 'major-event-entry', title: `${event.toLowerCase().replace(/_/g, ' ')} plan for this home`, body: 'Start with the governed tools below. They reuse the selected home’s verified records and keep material decisions in their owning workflows; nothing has been started or shared automatically.', tone: 'DEFAULT', actions: [] });
  result.blocks.push({ type: 'BOUNDARY', id: 'major-event-boundary', title: 'A guided entry point—not a complete professional checklist', body: 'Legal, tax, insurance, accessibility, safety, transaction, permit, and disclosure requirements can vary. Verify material obligations with the appropriate authority or qualified professional.', severity: 'INFO', suggestions: [] });
  return { ...result, reasonCode: `MAJOR_EVENT_${event}`, suggestions: [] };
}

registerCapabilityHandler('capital-reserve.plan', async (envelope) => capitalReservePlanResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('property-tax.appeal-readiness', async (envelope) => propertyTaxAppealReadinessResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('renovation-permit.readiness', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return renovationPermitReadinessResult(envelope.propertyId!, envelope.message, access.role !== HouseholdRole.VIEWER, access.role === HouseholdRole.OWNER);
});

registerCapabilityHandler('major-event.entry', async (envelope) => majorEventEntryResult(envelope.userId, envelope.propertyId!, envelope.message));
