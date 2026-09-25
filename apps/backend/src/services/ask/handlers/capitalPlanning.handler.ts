// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { homeReserveFundService } from '../../homeReserveFund.service';
import { humanDate, money } from '../askFormatting';
import { askCaptureRequest, capabilityResult, ensurePropertyAccess, isCapitalTimelineAnalysisStale, parseCapitalTimelineHorizonRequest } from '../askHandlerSupport';
import { HomeCapitalTimelineService } from '../../homeCapitalTimeline.service';
import { propertyTaxAppealReadinessService } from '../../propertyTax/propertyTaxAppealReadiness.service';
import { listRenovationCases } from '../../renovationCase.service';
import { getReadiness as getRenovationReadiness } from '../../renovationReadiness.service';
import { PermitTrackerService } from '../../permitTracker.service';
import { getAskPropertyTimezone } from '../askExecutionContext';

const homeCapitalTimelineService = new HomeCapitalTimelineService();

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
  href: string,
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
    type: 'TIMELINE', id: 'capital-timeline-table', title: 'Upcoming capital windows',
    description: `Windows and ranges come from the canonical Home Capital Timeline; they are not failure dates or vendor quotes. Each sits at the start of its window.${totalCount > upcoming.length ? ` Showing the ${upcoming.length} soonest of ${totalCount} windows.` : ''}`,
    items: upcoming.map((item) => ({
      id: item.id,
      label: item.inventoryItem?.name ?? words(item.category),
      date: month(item.windowStart),
      datePrecision: 'MONTH' as const,
      description: null,
      status: `${sentence(item.confidence)} confidence`,
      href,
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

async function capitalReservePlanResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/capital-timeline`;
  const reserveHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/reserve-fund`;
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
    ? [askCaptureRequest(activeRequirement, activeRequirement === reserveContext.requirements[0] ? reserveContext.contextVersion : capitalContext.contextVersion, 'Saved to the Living Home Record and reused by capital planning', `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`)]
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
  const fund: any = await homeReserveFundService.getSummary(propertyId);
  const lineItems: any[] = await homeReserveFundService.listLineItems(propertyId, { status: 'ACTIVE' });
  if (!analysis || !Array.isArray(analysis.items) || analysis.items.length === 0) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'CAPITAL_PLAN_INVENTORY_REQUIRED', contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests,
    blocks: [{ type: 'SUMMARY', id: 'capital-plan-empty', title: 'Add at least one major appliance or system to build a capital plan', body: 'A reserve target without recorded systems would be a generic guess. Add the roof, HVAC, water heater, appliances, or other capital items and Ask will calculate a property-specific timeline.', tone: 'CAUTION', actions: [{ id: 'open-inventory', label: 'Add home systems', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }] }],
    suggestions: ['Show my home inventory'],
  };
  const items: any[] = analysis.items;
  const upcoming = items.slice().sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()).slice(0, 12);
  const totalLow = upcoming.reduce((sum, item) => sum + (item.estimatedCostMinCents ?? 0), 0);
  const totalHigh = upcoming.reduce((sum, item) => sum + (item.estimatedCostMaxCents ?? 0), 0);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'capital-reserve-summary', title: `${upcoming.length} upcoming capital event${upcoming.length === 1 ? '' : 's'} are in the current plan`,
    body: `The modeled cost range for the displayed ${analysis.horizonYears ?? 10}-year horizon is ${money(totalLow / 100)}–${money(totalHigh / 100)}. The canonical reserve plan currently suggests ${money((fund.recommendedMonthlyContributionCents ?? 0) / 100)} per month and records a ${money((fund.currentShortfallCents ?? 0) / 100)} shortfall.`,
    tone: (fund.currentShortfallCents ?? 0) > 0 ? 'CAUTION' : 'DEFAULT', actions: [
      { id: 'open-timeline', label: 'Open capital timeline', href, style: 'PRIMARY' }, { id: 'open-reserve', label: 'Open reserve fund', href: reserveHref, style: 'SECONDARY' },
      // Horizon re-run (FRD Appendix D planning/refinement follow-up): re-invokes this same CAPITAL_RESERVE_PLAN
      // operation with an explicit horizon in the message, mirroring the traditional page's own 5yr/10yr toggle --
      // only offers the horizon NOT currently shown, same as a two-state toggle rather than two redundant buttons.
      ...(analysis.horizonYears !== 5 ? [{ id: 'rerun-horizon-5', label: 'Show 5-year horizon', interactionType: 'START_WORKFLOW' as const, message: 'Show my capital reserve plan for a 5-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' as const }] : []),
      ...(analysis.horizonYears !== 10 ? [{ id: 'rerun-horizon-10', label: 'Show 10-year horizon', interactionType: 'START_WORKFLOW' as const, message: 'Show my capital reserve plan for a 10-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' as const }] : []),
    ],
  }, capitalTimelineBlock(upcoming, items.length, href),
  // Home Capital Timeline reference journey (FRD Appendix D), first inline-detail slice: entityType routes these
  // through ReserveAllocationResultList (GroupedListBlock.tsx) instead of the generic href-only renderer, opening
  // canonical detail inline -- a fresh re-fetch via the existing GET .../reserve-fund/line-items list endpoint
  // (there is no single-line-item GET, so a removed allocation is a data-absence "no longer exists" state, the
  // same pattern already used for Household/Warranty detail). Read-only: no per-item mutation operation exists
  // yet, so no item `actions` are declared -- "planning/refinement" writes remain a separate, unscoped follow-up.
  { type: 'GROUPED_LIST', filters: [], id: 'reserve-allocations', title: 'Active reserve allocations', description: 'Allocated amounts are derived from timeline items and the homeowner’s reserve posture.', sections: [{ id: 'allocations', title: 'Funding plan', count: lineItems.length, items: lineItems.slice(0, 20).map((line) => ({ id: line.id, title: line.timelineItem?.inventoryItem?.name ?? String(line.timelineItem?.category ?? 'Capital item').toLowerCase().replace(/_/g, ' '), description: `${money(line.allocatedMonthlyCents / 100)}/month toward ${money(line.targetCostCents / 100)}`, meta: [String(line.status).toLowerCase()], status: line.status, href: reserveHref, entityType: 'RESERVE_LINE_ITEM' })) }],
    // Was `actions: []` -- no traditional-navigation secondary action existed for this block at all before
    // this slice, unlike every other Property Records collection. Added alongside inline detail.
    actions: [{ id: 'open-reserve-fund', label: 'Open Reserve Fund', href: reserveHref, style: 'SECONDARY' }] },
  { type: 'EVIDENCE', id: 'capital-plan-evidence', title: 'Planning sources and freshness', items: upcoming.map((item) => ({ label: item.inventoryItem?.name ?? String(item.category), source: `Home Capital Timeline · ${String(item.confidence).toLowerCase()} confidence`, observedAt: analysis.computedAt?.toISOString?.() ?? String(analysis.computedAt) })) },
  { type: 'BOUNDARY', id: 'capital-plan-boundary', title: 'Planning range—not a guaranteed expense schedule', body: 'Actual condition, inspections, maintenance, local labor and material prices, financing, insurance, and homeowner choices can move timing and cost. Keep emergency savings and capital reserves conceptually separate.', severity: 'INFO', suggestions: [] }];
  return { status: captureRequests.length || analysis.confidence === 'LOW' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: captureRequests.length ? 'CAPITAL_PLAN_CONTEXT_OPTIONAL' : analysis.confidence === 'LOW' ? 'CAPITAL_PLAN_LOW_CONFIDENCE' : undefined, contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests, blocks, suggestions: ['Which expense is coming first?', 'Should I repair or replace my oldest system?'] };
}

async function propertyTaxAppealReadinessResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const ground = /\b(?:tax class|classification)\b/i.test(message) ? 'TAX_CLASS' as const : /\bexemption\b/i.test(message) ? 'EXEMPTION' as const : 'ASSESSED_VALUE' as const;
  const context = await evaluateFeatureContext(propertyId, userId, { featureKey: 'TAX_APPEAL', operationKey: 'RUN_ANALYSIS' });
  const requirement = context.requirements[0];
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/property-tax`;
  const captureRequests = access.role !== HouseholdRole.VIEWER && requirement
    ? [askCaptureRequest(requirement, context.contextVersion, 'Saved to the canonical property-tax and Property Context records', href)] : [];
  const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, ground);
  if (readiness.status === 'NOT_COVERED') return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE', contextVersion: context.contextVersion, captureRequests,
    blocks: [{ type: 'SUMMARY', id: 'tax-readiness-not-covered', title: 'Reviewed appeal rules are not available for this property', body: readiness.reason ?? 'Ask cannot determine filing readiness without an active reviewed jurisdiction rule.', tone: 'CAUTION', actions: [{ id: 'open-property-tax', label: 'Open Property Tax Center', href, style: 'PRIMARY' }] }, { type: 'BOUNDARY', id: 'tax-coverage-boundary', title: 'Verify with the official authority', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] }], suggestions: ['Show my recorded property-tax facts'],
  };
  const atStake = readiness.taxAtStake;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'tax-readiness-summary', title: readiness.status === 'READY' ? `${readiness.ground?.label ?? ground}: preparation requirements are present` : readiness.status === 'NO_SUPPORTED_GROUND' ? 'The current evidence does not support this reviewed ground' : `${readiness.gaps.length} readiness gap${readiness.gaps.length === 1 ? '' : 's'} remain`,
    body: `${readiness.reason ?? ''}${atStake ? ` The sourced planning range for annual tax at stake is ${money(atStake.low)}–${money(atStake.high)}.` : ''} Readiness does not predict appeal success.`,
    tone: readiness.status === 'READY' ? 'DEFAULT' : 'CAUTION', actions: [{ id: 'open-property-tax', label: 'Open appeal readiness', href: `${href}?section=appeal-readiness&ground=${ground}`, style: 'PRIMARY' }],
  }];
  if (readiness.canonical) blocks.push({ type: 'TABLE', id: 'tax-canonical-facts', title: 'Canonical tax facts used', description: 'Unknown facts remain unknown and are never treated as zero.', columns: [{ key: 'fact', label: 'Fact' }, { key: 'value', label: 'Recorded value' }], rows: [
    ['Tax year', readiness.canonical.taxYear], ['Classification', readiness.canonical.classification], ['Assessed value', readiness.canonical.totalAssessedValue == null ? null : money(readiness.canonical.totalAssessedValue)], ['Taxable value', readiness.canonical.taxableValue == null ? null : money(readiness.canonical.taxableValue)], ['Effective tax rate', readiness.canonical.effectiveTaxRate == null ? null : `${(readiness.canonical.effectiveTaxRate * 100).toFixed(3)}%`],
  ].map(([fact, value], index) => ({ id: `tax-fact-${index}`, values: { fact: String(fact), value: value == null ? 'Not confirmed' : String(value) } })), actions: [] });
  blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'tax-readiness-gaps', title: readiness.gaps.length ? 'What is still needed' : 'Evidence package', description: `Estimated preparation effort: ${String(readiness.effort).toLowerCase()}.`, sections: [{ id: 'gaps', title: readiness.gaps.length ? 'Readiness gaps' : 'Confirmed evidence', count: readiness.gaps.length || readiness.evidence.length, items: readiness.gaps.length ? readiness.gaps.map((gap: string, index: number) => ({ id: `tax-gap-${index}`, title: gap, description: null, meta: [], status: 'OPEN', href })) : readiness.evidence.map((evidence: any) => ({ id: evidence.id, title: evidence.title, description: evidence.description ?? null, meta: [String(evidence.type).toLowerCase().replace(/_/g, ' ')], status: 'CONFIRMED', href })) }], actions: [] });
  if (readiness.evidence.length || readiness.ruleProfile) blocks.push({ type: 'EVIDENCE', id: 'tax-readiness-evidence', title: 'Rule and evidence provenance', items: [{ label: readiness.ruleProfile?.title ?? 'Reviewed appeal rule', source: readiness.ruleProfile ? `Rule ${readiness.ruleProfile.version}` : 'Property Tax Center', observedAt: readiness.ruleProfile?.reviewedAt?.toISOString?.() ?? readiness.ruleProfile?.reviewedAt ?? readiness.evaluatedAt }, ...readiness.evidence.slice(0, 15).map((evidence: any) => ({ label: evidence.title, source: evidence.sourceUrl ? 'Sourced appeal evidence' : 'Vault-supported appeal evidence', observedAt: evidence.confirmedAt }))] });
  blocks.push({ type: 'BOUNDARY', id: 'tax-readiness-boundary', title: 'Preparation support—not tax, appraisal, or legal advice', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] });
  return { status: readiness.status === 'READY' && !captureRequests.length ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: readiness.status === 'READY' ? (captureRequests.length ? 'PROPERTY_TAX_CONTEXT_OPTIONAL' : undefined) : `PROPERTY_TAX_${readiness.status}`, contextVersion: context.contextVersion, captureRequests, blocks, suggestions: ['Which tax facts are missing?', 'Open Property Tax Center'] };
}

// IW-PRES-020 (FRD v1.94): the renovation case's blocking readiness items as a ring. The renovation readiness service
// keeps a state and counts (total, open, blocking, acknowledged) but no percent, so this defines one, on the domain's own
// rule for what blocks a start: a blocking item is settled when it is satisfied or its open state was acknowledged
// (`READY_WITH_ACKNOWLEDGED_OPEN_ITEMS`); only blocking items are counted, other open items are listed but not counted.
// With no blocking items there is no ring, since nothing recorded says the case is ready.
export function renovationReadinessProgress(
  items: ReadonlyArray<{ id: string; title: string; status: string; isBlocking: boolean; overrideAcknowledgedAt?: Date | string | null; reason?: string | null; exactNextAction?: string | null }>,
  caseHref: string,
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
      meta: [], status: item.status, href: caseHref, entityType: null,
    })),
    actions: [],
  };
}

async function renovationPermitReadinessResult(propertyId: string, message: string): Promise<AskOperationResult> {
  const [cases, permitSummary] = await Promise.all([listRenovationCases(propertyId), permitTrackerService.getPermitSummary(propertyId)]);
  // FRD v1.47: renovation cases live on /renovations (the Renovations page reads the same cases and readiness). Both
  // links pointed at /projects, whose list page reads neither a case nor ?renovationCaseId=.
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/renovations`;
  const permitsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/permits`;
  if (!cases.length) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_CASE_REQUIRED',
    blocks: [{ type: 'SUMMARY', id: 'renovation-readiness-empty', title: 'Start a governed renovation case before checking readiness', body: `No active renovation case is recorded. The Permit Tracker currently shows ${permitSummary.totalPermits} permit record${permitSummary.totalPermits === 1 ? '' : 's'} and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}, but those records cannot establish the scope of new work.`, tone: 'CAUTION', actions: [{ id: 'start-renovation', label: 'Start renovation planning', href, style: 'PRIMARY' }, { id: 'open-permits', label: 'Review permits', href: permitsHref, style: 'SECONDARY' }] }, { type: 'BOUNDARY', id: 'renovation-empty-boundary', title: 'Scope and jurisdiction still control', body: 'Permit, zoning, HOA, licensing, inspection, and safety requirements depend on the exact scope and current authority rules. Absence of a record is not proof that approval is unnecessary.', severity: 'INFO', suggestions: [] }], suggestions: ['What permits are already recorded?'],
  };
  const lower = message.toLowerCase();
  const selected = cases.find((candidate) => lower.includes(candidate.name.toLowerCase())) ?? cases[0];
  let readiness: any;
  try { readiness = await getRenovationReadiness(propertyId, selected.id); } catch { readiness = { summary: { state: 'NOT_EVALUATED', disclaimer: 'Readiness has not been evaluated for the current scope.' }, items: [], project: null }; }
  const summary = readiness.summary ?? {};
  const items: any[] = readiness.items ?? [];
  const blockers = items.filter((item) => item.isBlocking && item.status !== 'SATISFIED');
  const open = items.filter((item) => item.status !== 'SATISFIED');
  const caseHref = `${href}/${encodeURIComponent(selected.id)}/readiness`;
  const blocks: AskPresentationBlock[] = [{ type: 'SUMMARY', id: 'renovation-readiness-summary', title: summary.state === 'READY' ? `${selected.name} is recorded as ready to start` : summary.state === 'NOT_EVALUATED' ? `${selected.name} needs a current readiness evaluation` : `${blockers.length} blocking item${blockers.length === 1 ? '' : 's'} remain for ${selected.name}`, body: `${summary.disclaimer ?? 'This organizes canonical project records and does not establish legal compliance.'} Permit Tracker: ${permitSummary.activePermits} active permit${permitSummary.activePermits === 1 ? '' : 's'}, ${permitSummary.finaledPermits} finaled, and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}.`, tone: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'DEFAULT' : 'CAUTION', actions: [{ id: 'open-case', label: 'Open renovation case', href: caseHref, style: 'PRIMARY' }, { id: 'open-permits', label: 'Open Permit Tracker', href: permitsHref, style: 'SECONDARY' }] }];
  // IW-PRES-020 (FRD v1.94): the blocking items as a ring, ahead of the checklist.
  const ring = renovationReadinessProgress(items, caseHref);
  if (ring) blocks.push(ring);
  if (items.length) blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'renovation-readiness-items', title: 'Readiness checklist', description: 'Blocking state is owned by the canonical renovation scope, requirement, compliance, quote, schedule, and evidence records.', sections: [{ id: 'blocking', title: 'Blocking', count: blockers.length, items: blockers.slice(0, 20).map((item) => ({ id: item.id, title: item.title, description: item.reason, meta: [item.exactNextAction, item.evidenceRequired].filter(Boolean), status: item.status, href: caseHref })) }, { id: 'other-open', title: 'Other open items', count: Math.max(0, open.length - blockers.length), items: open.filter((item) => !item.isBlocking).slice(0, 20).map((item) => ({ id: item.id, title: item.title, description: item.reason, meta: [item.exactNextAction].filter(Boolean), status: item.status, href: caseHref })) }].filter((section) => section.count > 0), actions: [] });
  blocks.push({ type: 'EVIDENCE', id: 'renovation-readiness-evidence', title: 'Readiness sources', items: items.slice(0, 25).map((item) => ({ label: item.title, source: String(item.sourceType ?? 'Renovation readiness').toLowerCase().replace(/_/g, ' '), observedAt: item.sourceObservedAt?.toISOString?.() ?? item.derivedAt?.toISOString?.() ?? null })) });
  blocks.push({ type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization—not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A “ready” app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] });
  return { status: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: summary.state === 'READY' ? (permitSummary.openFlags ? 'PERMIT_FLAGS_OPEN' : undefined) : `RENOVATION_${summary.state ?? 'NOT_READY'}`, contextVersion: selected.updatedAt.toISOString(), blocks, suggestions: cases.length > 1 ? cases.slice(1, 4).map((candidate) => `Is ${candidate.name} ready to start?`) : ['What is blocking this renovation?'] };
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
  return { ...result, reasonCode: `MAJOR_EVENT_${event}`, suggestions: event === 'SELLING' ? ['Should I sell, hold, or rent?', 'Check sale readiness'] : event === 'RENOVATION' ? ['Is my renovation ready to start?', 'Do I need a permit?'] : ['Summarize my home record', 'What should I do next?'] };
}

registerCapabilityHandler('capital-reserve.plan', async (envelope) => capitalReservePlanResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('property-tax.appeal-readiness', async (envelope) => propertyTaxAppealReadinessResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('renovation-permit.readiness', async (envelope) => renovationPermitReadinessResult(envelope.propertyId!, envelope.message));

registerCapabilityHandler('major-event.entry', async (envelope) => majorEventEntryResult(envelope.userId, envelope.propertyId!, envelope.message));
