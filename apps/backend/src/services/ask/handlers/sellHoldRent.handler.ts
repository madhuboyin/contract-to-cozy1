// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { planningHomeValueRequestResult } from '../support/planningHomeValueRequest';
import { SALE_CASE_ACTION_IDS, SALE_CASE_MESSAGES, legalNextStatuses, type SaleCaseKind } from '../support/sellerPrepCaseCommand';
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { SellHoldRentService } from '../../sellHoldRent.service';
import { PropertySaleCaseService, SALE_READINESS_MUST_ADDRESS_CLASSES, saleReadinessFigure } from '../../propertySaleCase.service';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';
import { SELL_HOLD_RENT_WHAT_IF_LABELS, isSellHoldRentMoneyKey, parseSellHoldRentWhatIf, type SellHoldRentWhatIf } from '../support/sellHoldRentWhatIf';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { FINANCING_PROFILE_ACTION_ID, FINANCING_PROFILE_COMMAND_MESSAGE, FINANCING_PROFILE_ENTITY_TYPE } from '../support/financingProfileCommand';
import { SELL_HOLD_RENT_COMMAND_ACTION_IDS, SELL_HOLD_RENT_COMMAND_ENTITY_TYPE, SELL_HOLD_RENT_COMMAND_LABELS, SELL_HOLD_RENT_COMMAND_MESSAGES } from '../support/sellHoldRentCommand';
import { type AskViewState } from '../support/executionState';
import { loadAskViewState } from './maintenance.handler';

const sellHoldRentService = new SellHoldRentService();

// D07 fix (same defect independently found in Phase 7's Decisions doc,
// same root cause and fix shape as B06/P04 above -- confirmSellerPrepItemDecision
// previously threw a static "This checklist item changed while confirmation
// was open..." with zero item-specific content). No single status here is
// as clearly a "nothing further to do" terminal case as Maintenance's
// COMPLETED/CANCELLED (OPEN/PURSUING/RESOLVED/WAIVED are all legitimate,
// equally "current" states a homeowner might want disclosed), so this
// stays a single, unconditional current-status phrasing rather than
// special-casing any one of them.
export const SALE_READINESS_ITEM_STATUS_LABELS: Record<string, string> = {
  OPEN: 'open', RESOLVED: 'resolved', WAIVED: 'waived', PURSUING: 'pursuing',
};

// IW-PRES-016 (FRD v1.85): the sell, hold and rent scenarios as a comparison strip. The modeled outcomes can be
// negative and are different kinds of figure (net proceeds against a net change), so no price bars are drawn. The
// service, rather than the renderer, declares the directional model lead and explains its basis.
export function sellHoldRentComparison(analysis: Awaited<ReturnType<typeof sellHoldRentService.estimate>>, years: number): Extract<AskPresentationBlock, { type: 'COMPARISON' }> {
  const { scenarios } = analysis;
  const winner = analysis.recommendation?.winner?.toLowerCase();
  const option = (id: string, label: string, outcome: string, attributes: Array<{ label: string; value: string }>) => ({
    id, label, summary: null,
    ...(winner === id ? { badge: {
      label: 'Model lead',
      basis: `Highest modeled outcome under the current ${years}-year assumptions.`,
      policyCode: 'SELL_HOLD_RENT_MODELED_OUTCOME',
    } } : {}),
    attributes: [
      { label: 'Modeled outcome', value: outcome, tone: 'DEFAULT' as const },
      ...attributes.map((attribute) => ({ ...attribute, tone: 'DEFAULT' as const })),
    ],
    actions: [],
  });
  return {
    type: 'COMPARISON', id: 'sell-hold-rent-comparison', title: `${years}-year scenario snapshot`,
    description: 'All amounts are planning estimates. Different scenario rows describe different economic outcomes and should be reviewed with the assumptions below.',
    options: [
      option('sell', 'Sell', `${money(scenarios.sell.netProceeds)} net proceeds`, [
        { label: 'Projected sale price', value: money(scenarios.sell.projectedSalePrice) },
        { label: 'Selling costs', value: money(scenarios.sell.sellingCosts) },
      ]),
      option('hold', 'Hold', `${money(scenarios.hold.net)} net change`, [
        { label: 'Appreciation', value: money(scenarios.hold.appreciationGain) },
        { label: 'Ownership costs', value: money(scenarios.hold.totalOwnershipCosts) },
        { label: 'Principal paid down', value: money(scenarios.hold.principalPaydown ?? 0) },
      ]),
      option('rent', 'Rent', `${money(scenarios.rent.net)} net change`, [
        { label: 'Gross rent', value: money(scenarios.rent.totalRentalIncome) },
        { label: 'Vacancy and management', value: money(scenarios.rent.rentalOverheads.vacancyLoss + scenarios.rent.rentalOverheads.managementFees) },
        { label: 'Ownership costs', value: money(scenarios.rent.totalOwnershipCosts ?? 0) },
        { label: 'Appreciation and paydown', value: money((scenarios.rent.appreciationGain ?? 0) + (scenarios.rent.principalPaydown ?? 0)) },
      ]),
    ],
    actions: [],
  };
}

// FRD v1.321: the page's editable assumptions. A hypothetical ("what if I rent it for $3,200 and vacancy is 8%") is computed with those values for this
// answer only (`ephemeral`: the page route would save each set as a reusable assumption set, Ask saves nothing) and shown beside the unchanged standard
// estimate. No capture, no thread: the household's recorded context and plan are not touched.
type SellHoldRentAnalysis = Awaited<ReturnType<typeof sellHoldRentService.estimate>>;
export function sellHoldRentWhatIfFromAnalyses(standard: SellHoldRentAnalysis, scenario: SellHoldRentAnalysis, overrides: SellHoldRentWhatIf): AskOperationResult {
  const years = scenario.input.years;
  const winner = (analysis: SellHoldRentAnalysis) => (analysis.recommendation.winner === 'SELL' ? 'Selling' : analysis.recommendation.winner === 'HOLD' ? 'Holding' : 'Renting it out');
  const percent = (value: number) => `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1)}%`;
  const assumed = (Object.keys(overrides) as Array<keyof SellHoldRentWhatIf>).map((key) => ({
    id: `sell-hold-rent-what-if-${key}`,
    values: { assumption: SELL_HOLD_RENT_WHAT_IF_LABELS[key], value: isSellHoldRentMoneyKey(key) ? money(overrides[key] as number) : percent(overrides[key] as number) },
  }));
  const lowConfidence = scenario.recommendation.confidence !== 'HIGH';
  return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'SELL_HOLD_RENT_WHAT_IF',
    blocks: [{
      type: 'SUMMARY', id: 'sell-hold-rent-what-if-summary', title: `What if: the ${years}-year sell, hold and rent comparison`,
      body: `With the assumptions you changed, the model\u2019s directional indicator points to ${winner(scenario).toLowerCase()}; the standard estimate points to ${winner(standard).toLowerCase()}. This is a planning what-if, not a conclusion that now is the right time to sell. Nothing was saved, and your recorded assumptions and plan are unchanged.${lowConfidence ? ' Confidence in the estimate is limited.' : ''}`,
      tone: 'CAUTION', actions: [],
    }, {
      type: 'TABLE', id: 'sell-hold-rent-what-if-assumptions', title: 'The assumptions you changed',
      description: 'Everything else is the standard estimate.',
      columns: [{ key: 'assumption', label: 'Assumption' }, { key: 'value', label: 'Used here' }], rows: assumed, actions: [],
    }, {
      type: 'TABLE', id: 'sell-hold-rent-what-if-comparison', title: 'Your what-if against the standard estimate',
      columns: [{ key: 'measure', label: '' }, { key: 'standard', label: 'Standard' }, { key: 'whatIf', label: 'Your what-if' }],
      rows: [
        { id: 'sell-hold-rent-what-if-sell', values: { measure: 'Sell: modeled net proceeds', standard: money(standard.scenarios.sell.netProceeds), whatIf: money(scenario.scenarios.sell.netProceeds) } },
        { id: 'sell-hold-rent-what-if-hold', values: { measure: 'Hold: modeled net change', standard: money(standard.scenarios.hold.net), whatIf: money(scenario.scenarios.hold.net) } },
        { id: 'sell-hold-rent-what-if-rent', values: { measure: 'Rent: modeled net change', standard: money(standard.scenarios.rent.net), whatIf: money(scenario.scenarios.rent.net) } },
        { id: 'sell-hold-rent-what-if-indicator', values: { measure: 'Model indicator', standard: winner(standard), whatIf: winner(scenario) } },
      ],
      actions: [],
    }, sellHoldRentComparison(scenario, years), {
      type: 'EVIDENCE', id: 'sell-hold-rent-what-if-evidence', title: 'Sources used',
      items: scenario.meta.dataSources.map((source, index) => ({ label: index === 0 ? 'Ownership costs and forecast' : `Planning input source ${index + 1}`, source, observedAt: scenario.meta.generatedAt })),
    }, {
      type: 'BOUNDARY', id: 'sell-hold-rent-boundary', title: 'Planning comparison\u2014not financial, tax, legal, or valuation advice',
      body: 'A sale decision can depend on current local demand, a professional valuation, transaction costs, taxes, financing, rental rules, landlord workload, replacement housing, and personal timing. Validate those inputs with qualified professionals.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

async function sellHoldRentWhatIfResult(userId: string, propertyId: string, message: string, overrides: SellHoldRentWhatIf): Promise<AskOperationResult> {
  const years = /\b(?:10|ten)[- ]?years?\b/i.test(message) ? 10 : 5;
  const supplied = overrides.homeValueNow;
  // With no value on record, the value the homeowner just gave also stands in for the comparison's "standard" side, so the rest of the what-if still compares.
  let standard = await sellHoldRentService.estimateOutcome(propertyId, { years }, userId);
  if (standard.status === 'HOME_VALUE_REQUIRED' && supplied !== undefined) standard = await sellHoldRentService.estimateOutcome(propertyId, { years, homeValueNow: supplied, ephemeral: true }, userId);
  const scenario = await sellHoldRentService.estimateOutcome(propertyId, { years, ...overrides, ephemeral: true }, userId);
  if (standard.status !== 'OK' || scenario.status !== 'OK') return planningHomeValueRequestResult('Sell, hold or rent');
  return sellHoldRentWhatIfFromAnalyses(standard.value, scenario.value, overrides);
}

async function sellHoldRentAnalysisResult(userId: string, propertyId: string, message: string, priorViewState?: AskViewState | null): Promise<AskOperationResult> {
  const requestedYears: 5 | 10 = /\b(?:10|ten)[- ]?years?\b/i.test(message) ? 10 : 5;
  // Checked first: with no home value there is nothing to analyse, so none of the reads below are needed.
  const analysisOutcome = await sellHoldRentService.estimateOutcome(propertyId, { years: requestedYears }, userId);
  if (analysisOutcome.status !== 'OK') return planningHomeValueRequestResult('Sell, hold or rent');
  const analysis = analysisOutcome.value;
  const [access, context, threadSelection] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'SELL_HOLD_RENT', operationKey: 'VIEW_ANALYSIS' }),
    // FRD Sec22 decision (Option B): read-only lookup, never creates or
    // resumes a thread. AMBIGUOUS (multiple active threads for the same
    // property, which createOrResumeThread's own dedup should prevent in
    // practice) is treated the same as NONE here -- this analysis read
    // degrades to its pre-decision behavior rather than picking one.
    sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId),
  ]);
  const activeThread = threadSelection.kind === 'UNIQUE'
    ? await prisma.decisionThread.findUniqueOrThrow({
      where: { id: threadSelection.thread.decisionThreadId },
      include: { currentRecommendationSnapshot: true },
    })
    : null;

  const activeRequirement = context.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: context.contextVersion,
  }] : [];

  const years = analysis.input.years;
  const viewState: AskViewState = {
    resultId: priorViewState?.resultId ?? randomUUID(),
    domainScopePhrase: null,
    dateScopePhrase: null,
    statusFilter: `HORIZON_${years}`,
    selectedTaskId: priorViewState?.selectedTaskId ?? null,
    revision: (priorViewState?.revision ?? 0) + 1,
  };
  const winnerLabel = analysis.recommendation.winner === 'SELL'
    ? 'selling'
    : analysis.recommendation.winner === 'HOLD'
      ? 'holding'
      : 'renting the home out';
  const debtKnown = analysis.current.mortgageBalanceNow != null
    && analysis.current.mortgageAnnualRate != null
    && analysis.current.remainingTermMonths != null;
  const lowConfidence = analysis.recommendation.confidence !== 'HIGH';
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const contextLimited = captureRequests.length > 0 || permissionLimited;

  const winningOutcome = analysis.recommendation.winner === 'SELL'
    ? analysis.scenarios.sell.netProceeds
    : analysis.recommendation.winner === 'HOLD'
      ? analysis.scenarios.hold.net
      : analysis.scenarios.rent.net;
  const rationale = analysis.recommendation.rationale.filter(Boolean).slice(0, 3);
  const otherYears = years === 5 ? 10 : 5;
  const assumptionRows = [
    { id: 'home-value', values: { input: 'Home value', value: money(analysis.current.homeValueNow), source: analysis.current.homeValueDisclosure } },
    { id: 'rent', values: { input: 'Monthly rent', value: money(analysis.current.monthlyRentNow), source: analysis.input.overrides.monthlyRentNow === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'appreciation', values: { input: 'Appreciation', value: `${(analysis.current.appreciationRate * 100).toFixed(1)}% / year`, source: analysis.input.overrides.appreciationRate === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'selling-costs', values: { input: 'Selling costs', value: `${(analysis.current.sellingCostRate * 100).toFixed(1)}%`, source: analysis.input.overrides.sellingCostRate === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'rent-growth', values: { input: 'Rent growth', value: `${(analysis.current.rentGrowthRate * 100).toFixed(1)}% / year`, source: analysis.input.overrides.rentGrowthRate === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'vacancy', values: { input: 'Vacancy', value: `${(analysis.current.vacancyRate * 100).toFixed(1)}%`, source: analysis.input.overrides.vacancyRate === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'management', values: { input: 'Management', value: `${(analysis.current.managementRate * 100).toFixed(1)}%`, source: analysis.input.overrides.managementRate === undefined ? 'Saved or modeled planning estimate' : 'Used from this request' } },
    { id: 'mortgage', values: { input: 'Mortgage', value: debtKnown ? `${money(analysis.current.mortgageBalanceNow ?? 0)} balance` : 'Not fully modeled', source: analysis.current.mortgageRateDisclosure ?? 'No complete financing profile was available' } },
  ];
  const projectionIndexes = analysis.projection.map((_, index) => index);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'sell-hold-rent-summary',
    title: `${winnerLabel[0].toUpperCase()}${winnerLabel.slice(1)} currently leads in the ${years}-year sell, hold, or rent comparison`,
    body: `${rationale.join(' ')} Sell is projected liquidity; hold and rent are modeled changes, so compare the direction and assumptions rather than treating the totals as identical returns.`,
    tone: lowConfidence || contextLimited ? 'CAUTION' : 'DEFAULT',
    chips: [
      { label: `${money(winningOutcome)} modeled outcome`, tone: 'POSITIVE' },
      { label: `${analysis.recommendation.confidence.toLowerCase()} confidence`, tone: lowConfidence ? 'CAUTION' : 'DEFAULT' },
      { label: `${years}-year horizon`, tone: 'DEFAULT' },
    ],
    actions: [{
      id: `sell-hold-rent-horizon-${otherYears}`, label: `Compare ${otherYears} years`,
      interactionType: 'START_WORKFLOW', message: `Compare selling, holding, and renting this home over ${otherYears} years.`,
      operationId: 'SELL_HOLD_RENT_ANALYSIS', style: 'SECONDARY',
    }, ...(canImproveContext && !activeThread ? [{
      id: SELL_HOLD_RENT_COMMAND_ACTION_IDS.START_PLAN,
      label: SELL_HOLD_RENT_COMMAND_LABELS.START_PLAN,
      interactionType: 'START_WORKFLOW' as const,
      message: SELL_HOLD_RENT_COMMAND_MESSAGES.START_PLAN,
      operationId: 'SELL_HOLD_RENT_COMMAND' as const,
      entityType: SELL_HOLD_RENT_COMMAND_ENTITY_TYPE,
      entityId: propertyId,
      style: 'SECONDARY' as const,
    }] : [])],
  }, sellHoldRentComparison(analysis, years), ...(activeThread ? [{
    type: 'TABLE' as const,
    id: 'sell-hold-rent-tracked-decision',
    title: 'Tracked decision',
    description: 'The active planning thread for this home. It is refreshed against the latest recorded context whenever this comparison runs.',
    columns: [{ key: 'detail', label: 'Detail' }, { key: 'value', label: 'Current state' }],
    rows: [
      { id: 'lifecycle', values: { detail: 'Plan status', value: String(activeThread.lifecycleStatus).toLowerCase().replace(/_/g, ' ') } },
      { id: 'freshness', values: { detail: 'Context', value: String(activeThread.contextStatus).toLowerCase().replace(/_/g, ' ') } },
      { id: 'updated', values: { detail: 'Last updated', value: humanDate(activeThread.updatedAt) ?? 'Not recorded' } },
      { id: 'next', values: { detail: 'Next action', value: activeThread.contextStatus === 'STALE' ? 'Review the refreshed comparison and assumptions' : 'Review assumptions or stop tracking when this decision is no longer active' } },
    ],
    actions: canImproveContext ? [{
      id: SELL_HOLD_RENT_COMMAND_ACTION_IDS.STOP_PLAN,
      label: SELL_HOLD_RENT_COMMAND_LABELS.STOP_PLAN,
      interactionType: 'START_WORKFLOW' as const,
      message: SELL_HOLD_RENT_COMMAND_MESSAGES.STOP_PLAN,
      operationId: 'SELL_HOLD_RENT_COMMAND' as const,
      entityType: SELL_HOLD_RENT_COMMAND_ENTITY_TYPE,
      entityId: activeThread.id,
      style: 'SECONDARY' as const,
    }] : [],
  }] : []), {
    type: 'GROUPED_LIST', filters: [],
    id: 'sell-hold-rent-drivers', title: 'What is driving this result',
    description: 'The model ranks these inputs by how strongly they can change the comparison.', listDensity: 'DENSE',
    sections: [{ id: 'drivers', title: 'Key drivers', count: analysis.drivers.length, items: analysis.drivers.map((driver, index) => ({
      id: `driver-${index + 1}`, title: driver.factor, description: driver.explanation, meta: [], status: `${driver.impact} impact`, href: null,
      tone: driver.impact === 'HIGH' ? 'CAUTION' as const : 'DEFAULT' as const,
    })) }],
    actions: [],
  }, {
    type: 'TABLE', id: 'sell-hold-rent-projection', title: 'How hold and rent change over time',
    description: 'Three checkpoints from the annual model; sell remains the one-time projected net proceeds shown above.',
    columns: [{ key: 'year', label: 'Year' }, { key: 'homeValue', label: 'Home value' }, { key: 'hold', label: 'Hold change' }, { key: 'rent', label: 'Rent change' }],
    rows: projectionIndexes.map((index) => ({ id: `projection-${analysis.projection[index].year}`, values: {
      year: String(analysis.projection[index].year), homeValue: money(analysis.projection[index].homeValue),
      hold: money(analysis.projection[index].holdNetDelta), rent: money(analysis.projection[index].rentNetDelta),
    } })), actions: [],
  }, {
    type: 'TABLE', id: 'sell-hold-rent-assumptions', title: 'Inputs used',
    description: 'Recorded values and model defaults used for this comparison. The source column shows where each value came from.',
    columns: [{ key: 'input', label: 'Input' }, { key: 'value', label: 'Used' }, { key: 'source', label: 'Source' }],
    rows: assumptionRows, actions: [
      ...(canImproveContext ? [{
        id: SELL_HOLD_RENT_COMMAND_ACTION_IDS.EDIT_ASSUMPTIONS, label: SELL_HOLD_RENT_COMMAND_LABELS.EDIT_ASSUMPTIONS,
        interactionType: 'START_WORKFLOW' as const, message: SELL_HOLD_RENT_COMMAND_MESSAGES.EDIT_ASSUMPTIONS,
        operationId: 'SELL_HOLD_RENT_COMMAND' as const, entityType: SELL_HOLD_RENT_COMMAND_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
      }] : []),
      ...(access.role === HouseholdRole.OWNER ? [{
        id: FINANCING_PROFILE_ACTION_ID, label: 'Update mortgage details', interactionType: 'START_WORKFLOW' as const,
        message: FINANCING_PROFILE_COMMAND_MESSAGE, operationId: 'FINANCING_PROFILE_COMMAND' as const,
        entityType: FINANCING_PROFILE_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
      }] : []),
    ],
  }, {
    type: 'EVIDENCE',
    id: 'sell-hold-rent-evidence',
    title: 'Sources used',
    items: analysis.meta.dataSources.map((source, index) => ({
      label: index === 0 ? 'Ownership costs and forecast' : `Planning input source ${index + 1}`,
      source,
      observedAt: analysis.meta.generatedAt,
    })),
  }, {
    type: 'BOUNDARY',
    id: 'sell-hold-rent-boundary',
    title: 'Planning comparison—not financial, tax, legal, or valuation advice',
    body: 'A sale decision can depend on current local demand, a professional valuation, transaction costs, taxes, financing, rental rules, landlord workload, replacement housing, and personal timing. Validate those inputs with qualified professionals before committing.',
    severity: 'INFO',
    suggestions: [],
  }];

  return {
    status: contextLimited || lowConfidence || !debtKnown ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'SELL_HOLD_RENT_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'SELL_HOLD_RENT_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : lowConfidence || !debtKnown
          ? 'SELL_HOLD_RENT_ESTIMATED_INPUTS'
          : undefined,
    contextVersion: context.contextVersion,
    parameters: { viewState },
    captureRequests,
    blocks,
    suggestions: [
      'What if I rent it for $3,200 and vacancy is 8%?',
      'What if appreciation is 4% and selling costs are 7%?',
    ],
  };
}

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "Seller Prep
// — expose now, needs a new Ask operation registration, not new business
// logic"). Reads the real, canonical PropertySaleCase/SaleReadinessItem
// checklist directly -- the same PropertySaleCaseService.getCase call
// conversationalCapture.ts's own buildSellerPrepInlineBlock already makes
// for the SELL_HOLD_RENT_GOAL_CAPTURE addendum -- but as its own, richer,
// directly-askable answer (category-grouped, cost-estimated) rather than
// only a 5-item addendum. getCase's own requireAccess call already enforces
// this operation's VIEWER role floor; no separate ensurePropertyAccess call
// needed here. Deliberately read-only for this first Phase 7 slice: the
// real write path (PropertySaleCaseService.setItemDecision -- WAIVE/
// PURSUE/REOPEN/UNPURSUE) is a genuine, separate, confirmation-gated
// follow-up capability, not attempted here.
const SALE_READINESS_CATEGORY_LABELS: Record<string, string> = {
  SAFETY_STRUCTURAL: 'Safety & structural',
  SYSTEMS_MAINTENANCE: 'Systems & maintenance',
  PERMITS_DISCLOSURE: 'Permits & disclosure',
  DOCUMENTATION_RECORDS: 'Documentation & records',
  FINANCIAL_DECISION: 'Financial decisions',
  PRESENTATION: 'Presentation',
};

const SALE_READINESS_CLASS_LABELS: Record<string, string> = {
  MATERIAL_BLOCKER: 'Blocks a sale', VERIFICATION_NEEDED: 'Needs verifying', PROFESSIONAL_DECISION: 'Professional decision',
};

function sellerPrepCostRangeMeta(item: { estimatedCostMinCents: number | null; estimatedCostMaxCents: number | null }): string[] {
  if (item.estimatedCostMinCents == null) return [];
  const min = money(item.estimatedCostMinCents / 100);
  if (item.estimatedCostMaxCents == null || item.estimatedCostMaxCents === item.estimatedCostMinCents) {
    return [`${min} estimated`];
  }
  return [`${min}–${money(item.estimatedCostMaxCents / 100)} estimated`];
}

// IW-PRES-014 (FRD v1.84): the shelf-card facts for one checklist item. The lead fact is what kind of item it is (a
// blocker, one to verify, a professional decision; other items have none), a blocker is critical and the other two
// must-address kinds are cautions while the item is still open, and the amount is the recorded cost estimate.
export function sellerPrepShelfFacts(item: {
  status: string; requirementClass: string; category: string;
  estimatedCostMinCents: number | null; estimatedCostMaxCents: number | null;
}): { tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL'; timingLabel: string | null; amountLabel: string | null } {
  const mustAddress = item.category !== 'PRESENTATION' && item.requirementClass in SALE_READINESS_CLASS_LABELS;
  const open = item.status === 'OPEN';
  return {
    tone: !mustAddress || !open ? 'DEFAULT' : item.requirementClass === 'MATERIAL_BLOCKER' ? 'CRITICAL' : 'CAUTION',
    timingLabel: mustAddress ? SALE_READINESS_CLASS_LABELS[item.requirementClass] : null,
    amountLabel: sellerPrepCostRangeMeta(item)[0] ?? null,
  };
}

// Seller-prep capability-card slice (FRD v1.44). The four confirmed SELLER_PREP_ITEM_DECISION decisions, declared on
// each checklist row; the inline detail (SellerPrepItemResultList) shows only those the traditional sale-case page
// offers for the item's LIVE state. sellerPrepItemAction parses each message back to exactly its own decision.
export const SELLER_PREP_ITEM_ACTIONS = [
  { id: 'sale-item-pursue', label: 'Pursue before listing', message: 'Pursue this seller-prep checklist item.', action: 'PURSUE' },
  { id: 'sale-item-unpursue', label: 'Stop pursuing', message: 'Stop pursuing this seller-prep checklist item.', action: 'UNPURSUE' },
  { id: 'sale-item-waive', label: 'Disclose and waive', message: 'Waive this seller-prep checklist item.', action: 'WAIVE' },
  { id: 'sale-item-reopen', label: 'Reopen', message: 'Reopen this seller-prep checklist item.', action: 'REOPEN' },
] as const;

export function sellerPrepItemActions(role: HouseholdRole) {
  if (role === HouseholdRole.VIEWER) return [];
  return SELLER_PREP_ITEM_ACTIONS.map(({ id, label, message }) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'SELLER_PREP_ITEM_DECISION' }));
}

/** The case-level actions (FRD v1.338): start, dates, budget range, next stage. Contributors and owners only; the next stage only while there is one. */
export function sellerPrepCaseActions(role: HouseholdRole, status: string | null, canCreate: boolean) {
  if (role === HouseholdRole.VIEWER) return [];
  const action = (kind: SaleCaseKind, label: string) => ({
    id: SALE_CASE_ACTION_IDS[kind], label, message: SALE_CASE_MESSAGES[kind], style: 'SECONDARY' as const,
    interactionType: 'START_WORKFLOW' as const, operationId: 'SELLER_PREP_CASE_COMMAND' as const,
  });
  if (!status) return canCreate ? [action('START', 'Start a sale case')] : [];
  return [
    action('DATES', 'Set target dates'),
    action('BUDGET', 'Set prep budget range'),
    ...(legalNextStatuses(status).length ? [action('STATUS', 'Update sale stage')] : []),
  ];
}

async function sellerPrepChecklistResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const overview = await PropertySaleCaseService.getCase(userId, propertyId);

  if (!overview.saleCase) {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'SELLER_PREP_NO_ACTIVE_CASE',
      blocks: [{
        type: 'SUMMARY',
        id: 'seller-prep-no-case',
        title: 'No active sale case yet',
        body: overview.canCreate
          ? 'A sale case gives a personalized seller-prep checklist -- repairs, records, and cosmetic work prioritized for this home. You can start one now.'
          : 'A seller-prep checklist becomes available once this property is marked for sale.',
        tone: 'DEFAULT',
        actions: overview.canCreate ? sellerPrepCaseActions((await ensurePropertyAccess(userId, propertyId)).role, null, true) : [],
      }],
      suggestions: [],
    };
  }

  const access = await ensurePropertyAccess(userId, propertyId);
  const caseActions = sellerPrepCaseActions(access.role, overview.saleCase.status || 'PREPARING', overview.canCreate);
  const itemActions = sellerPrepItemActions(access.role);
  const openItems = overview.readinessItems.filter((item) => item.status === 'OPEN');
  const pursuingItems = overview.readinessItems.filter((item) => item.status === 'PURSUING');
  const waivedItems = overview.readinessItems.filter((item) => item.status === 'WAIVED');
  const waivedCount = waivedItems.length;

  const grouped = new Map<string, typeof openItems>();
  for (const item of openItems) {
    const existing = grouped.get(item.category) ?? [];
    existing.push(item);
    grouped.set(item.category, existing);
  }
  const row = (item: typeof openItems[number]) => ({
    id: item.id,
    title: item.title,
    description: item.detail ?? null,
    meta: sellerPrepCostRangeMeta(item),
    status: item.status,
    href: null,
    entityType: 'SALE_READINESS_ITEM',
    actions: itemActions,
    ...sellerPrepShelfFacts(item),
  });

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'seller-prep-summary',
    title: 'Your seller-prep checklist',
    body: openItems.length
      ? `${openItems.length} open item${openItems.length === 1 ? '' : 's'}${pursuingItems.length ? `, ${pursuingItems.length} already in progress` : ''}${waivedCount ? `, ${waivedCount} waived` : ''}.`
      : `No open items right now${waivedCount ? ` (${waivedCount} waived)` : ''}. This home is in good shape to list.`,
    tone: 'DEFAULT',
    // This response is the canonical sale-readiness checklist, including progress, item details and every supported decision,
    // and (FRD v1.338) the case's own dates, budget range and stage. No CTA that exits Ask for the desktop rendering of the same data.
    actions: caseActions,
  }];

  // IW-PRES-020 (FRD v1.80): the sale case's own readiness figure as a ring, with the must-address counts and the next
  // three open must-address items (blockers first), each with the two decisions an open item allows.
  const figure = saleReadinessFigure(overview.readinessItems);
  if (figure.percent !== null) {
    const classOrder = (item: typeof openItems[number]) => SALE_READINESS_MUST_ADDRESS_CLASSES.indexOf(item.requirementClass);
    const openActions = itemActions.filter((action) => action.id === 'sale-item-pursue' || action.id === 'sale-item-waive');
    const nextSteps = openItems
      .filter((item) => classOrder(item) >= 0 && item.category !== 'PRESENTATION')
      .map((item, index) => ({ item, index }))
      .sort((left, right) => classOrder(left.item) - classOrder(right.item) || left.index - right.index)
      .slice(0, 3)
      .map(({ item }) => ({
        id: item.id, title: item.title,
        description: [SALE_READINESS_CATEGORY_LABELS[item.category] ?? item.category, SALE_READINESS_CLASS_LABELS[item.requirementClass]].filter(Boolean).join(' · '),
        amountLabel: sellerPrepCostRangeMeta(item)[0] ?? null,
        meta: [], status: item.status, href: null, entityType: 'SALE_READINESS_ITEM', actions: openActions,
      }));
    blocks.push({
      type: 'PROGRESS', id: 'seller-prep-progress', title: 'Sale readiness',
      description: 'Counts the must-address items: material blockers, items that need verifying, and professional decisions. Optional improvements and presentation work are listed below but not counted.',
      percent: figure.percent,
      basis: `${figure.settled} of ${figure.total} must-address item${figure.total === 1 ? '' : 's'} resolved or disclosed`,
      metrics: [
        { label: 'Open', value: String(figure.open), tone: figure.open ? 'CAUTION' : 'DEFAULT' },
        { label: 'Pursuing', value: String(figure.pursuing), tone: 'DEFAULT' },
        { label: 'Waived', value: String(figure.waived), tone: 'DEFAULT' },
      ],
      nextSteps,
      actions: [],
    });
  }

  // FRD v1.44: items being pursued and items disclosed-and-waived are listed too (the traditional page shows both),
  // so their Stop pursuing / Reopen decisions are reachable inline.
  if (openItems.length || pursuingItems.length || waivedItems.length) {
    const sections = [
      ...[...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, items]) => ({
        id: `seller-prep-${category.toLowerCase()}`,
        title: SALE_READINESS_CATEGORY_LABELS[category] ?? category,
        count: items.length,
        items: items.slice(0, 20).map(row),
      })),
      ...(pursuingItems.length ? [{ id: 'seller-prep-pursuing', title: 'Pursuing before listing', count: pursuingItems.length, items: pursuingItems.slice(0, 20).map(row) }] : []),
      ...(waivedItems.length ? [{ id: 'seller-prep-waived', title: 'Disclosed, not addressed', count: waivedItems.length, items: waivedItems.slice(0, 20).map(row) }] : []),
    ];
    blocks.push({
      type: 'GROUPED_LIST', filters: [],
      id: 'seller-prep-open-items',
      title: openItems.length ? 'Open items' : 'Checklist items',
      // IW-PRES-014 / IW-PRES-022: the checklist renders as shelves (FRD v1.84); the live item detail keeps its decisions.
      presentation: { pattern: 'SHELVES' },
      description: 'Repairs, records, and presentation work recommended before listing, grouped by category. Open an item to see it and decide on it.',
      sections,
      collection: collectionDescriptor({ sourceTotal: openItems.length + pursuingItems.length + waivedItems.length, fetchedCount: openItems.length + pursuingItems.length + waivedItems.length, sections, nextPageAvailable: false }),
      actions: [],
    });
  }

  blocks.push({
    type: 'EVIDENCE', id: 'seller-prep-evidence', title: 'Checklist basis and freshness',
    items: [{
      label: 'Canonical seller-prep case and readiness items',
      source: 'Property Sale Case',
      observedAt: overview.saleCase.updatedAt.toISOString(),
    }],
  });
  blocks.push({
    type: 'BOUNDARY', id: 'seller-prep-boundary', title: 'Preparation guidance—not a listing or disclosure determination', severity: 'INFO',
    body: 'Checklist priorities and cost ranges organize the recorded sale-preparation work. They do not establish market value, guarantee buyer response, replace required disclosures, or substitute for advice from qualified real-estate, legal, tax, inspection, or repair professionals.',
    suggestions: [],
  });

  return {
    status: 'ANSWERED',
    reasonCode: openItems.length ? 'SELLER_PREP_ITEMS_OPEN' : 'SELLER_PREP_NO_OPEN_ITEMS',
    blocks,
    // The checklist already contains its prioritized next steps and live item decisions.
    // Do not suggest paraphrases that route straight back to this same operation.
    suggestions: [],
  };
}

// Ask Cozy Stage 3, Phase 7 write-path slice (implementation plan §13; FRD
// §31). The real write PropertySaleCaseService.setItemDecision exposes --
// WAIVE/PURSUE/REOPEN/UNPURSUE on a SaleReadinessItem -- deliberately
// scoped out of Slice 1 (SELLER_PREP_CHECKLIST). Mirrors
// INSPECTION_FINDING_UPDATE's own propose/confirm shape exactly (resolve
// an exact target + action from free text via exactEntityMatch, propose a
// NEEDS_CONFIRMATION card, apply the write only on confirm).
const SELLER_PREP_ITEM_ACTION_LABELS: Record<'WAIVE' | 'PURSUE' | 'REOPEN' | 'UNPURSUE', string> = {
  WAIVE: 'Waive',
  PURSUE: 'Pursue',
  REOPEN: 'Reopen',
  UNPURSUE: 'Unpursue',
};

const SELLER_PREP_ITEM_ACTION_COPY: Record<'WAIVE' | 'PURSUE' | 'REOPEN' | 'UNPURSUE', string> = {
  WAIVE: 'Waiving records that you have decided not to address this item before listing.',
  PURSUE: 'Pursuing records that you have committed to completing this item before listing.',
  REOPEN: 'Reopening returns this item to open, undecided.',
  UNPURSUE: 'Removing your pursue commitment returns this item to open, undecided.',
};

function sellerPrepItemAction(message: string): 'WAIVE' | 'PURSUE' | 'REOPEN' | 'UNPURSUE' | null {
  // REOPEN/UNPURSUE checked first -- "undo the waive" contains the literal
  // word "waive", so checking WAIVE first would misclassify it.
  if (/\b(?:reopen|re-open|undo (?:the |my )?waive|put (?:it |this )?back)\b/i.test(message)) return 'REOPEN';
  if (/\b(?:unpursue|no longer pursuing|stop pursuing|remove (?:it |this )?from my (?:list|plan))\b/i.test(message)) return 'UNPURSUE';
  if (/\b(?:waive|skip(?:ping)? this|not doing this|decided not to|won'?t (?:do|fix)|will not (?:do|fix))\b/i.test(message)) return 'WAIVE';
  if (/\b(?:pursue|i'?ll (?:do|handle|fix|take care of)|committing to|plan to (?:do|fix|handle)|going to (?:do|fix|handle))\b/i.test(message)) return 'PURSUE';
  return null;
}

// Optional, best-effort -- a stated "because X"/"since X" trailing clause
// becomes the durable waivedReason. Absent for every other action (only
// WAIVE stores a reason; see PropertySaleCaseService.setItemDecision).
function sellerPrepItemReason(message: string): string | null {
  const match = /\b(?:because|since)\b\s+(.+)$/i.exec(message.trim());
  return match ? match[1].trim().slice(0, 500) || null : null;
}

export function sellerPrepItemContextVersion(item: { id: string; status: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${item.id}:${item.status}:${item.updatedAt.toISOString()}`).digest('hex');
}

async function sellerPrepItemDecisionResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const overview = await PropertySaleCaseService.getCase(userId, propertyId);
  if (!overview.saleCase) {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'SELLER_PREP_NO_ACTIVE_CASE',
      blocks: [{
        type: 'SUMMARY',
        id: 'seller-prep-decision-no-case',
        title: 'No active sale case yet',
        body: 'There is no sale case to decide checklist items on. Start one from your seller prep checklist first.',
        tone: 'DEFAULT',
        actions: [],
      }],
      suggestions: [],
    };
  }

  // RESOLVED items have no further decision to make -- the underlying
  // source itself already cleared, distinct from a homeowner WAIVE/PURSUE
  // decision (see SaleReadinessItem.status's own schema comment).
  const decidable = overview.readinessItems.filter((item) => item.status !== 'RESOLVED');
  const selected = exactEntityMatch(decidable, message, launchContext);
  const action = sellerPrepItemAction(message);
  if (!selected || !action) {
    const rowActions = sellerPrepItemActions((await ensurePropertyAccess(userId, propertyId)).role);
    const sections = [{
      id: 'items', title: 'Checklist items', count: decidable.length,
      items: decidable.slice(0, 50).map((item) => ({ id: item.id, title: item.title, entityType: 'SALE_READINESS_ITEM', actions: rowActions, description: item.detail ?? null, meta: [], status: item.status, href: null })),
    }];
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'SELLER_PREP_ITEM_TARGET_REQUIRED',
      blocks: [{
        type: 'GROUPED_LIST', filters: [],
        id: 'seller-prep-item-targets',
        title: 'Choose an item and a decision',
        description: 'Use the exact item title and say waive, pursue, reopen, or unpursue.',
        sections,
        collection: collectionDescriptor({ sourceTotal: decidable.length, fetchedCount: decidable.length, sections, nextPageAvailable: false }),
        actions: [],
      }],
      suggestions: [],
    };
  }

  const contextVersion = sellerPrepItemContextVersion(selected);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const reason = action === 'WAIVE' ? sellerPrepItemReason(message) : null;
  const actionLabel = SELLER_PREP_ITEM_ACTION_LABELS[action];
  return {
    status: 'NEEDS_CONFIRMATION',
    reasonCode: 'SELLER_PREP_ITEM_DECISION_CONFIRMATION_REQUIRED',
    contextVersion,
    parameters: {
      saleReadinessItemId: selected.id,
      saleReadinessItemAction: action,
      saleReadinessItemReason: reason,
      saleReadinessItemContextVersion: contextVersion,
      confirmationVersion: 1,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY',
      id: 'seller-prep-item-review',
      title: `Review ${actionLabel.toLowerCase()} decision`,
      body: SELLER_PREP_ITEM_ACTION_COPY[action],
      tone: 'CAUTION',
      actions: [],
    }],
    confirmation: {
      confirmationId: `seller-prep-item-${selected.id}-1`,
      version: 1,
      title: `${actionLabel} "${selected.title}"?`,
      description: selected.detail ?? selected.title,
      fields: [
        { label: 'Item', value: selected.title },
        { label: 'Decision', value: actionLabel },
        ...(reason ? [{ label: 'Reason', value: reason }] : []),
      ],
      editableFields: [], confirmLabel: `${actionLabel} item`,
      consentText: 'I authorize this update to the shared seller-prep checklist.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('sale-case.analysis', async (envelope) => {
  const whatIf = parseSellHoldRentWhatIf(envelope.message);
  const priorViewState = !whatIf && envelope.launchContext?.sourceExecutionId
    ? await loadAskViewState(envelope.launchContext.sourceExecutionId, envelope.userId)
    : null;
  return whatIf ? sellHoldRentWhatIfResult(envelope.userId, envelope.propertyId!, envelope.message, whatIf) : sellHoldRentAnalysisResult(envelope.userId, envelope.propertyId!, envelope.message, priorViewState);
});

registerCapabilityHandler('seller-prep.checklist', async (envelope) => sellerPrepChecklistResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('seller-prep.item-decision', async (envelope) => sellerPrepItemDecisionResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

// Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21). Same
// defensive shape as the three capture operations above -- a
// SELL_HOLD_RENT_GOAL_CAPTURE execution is only ever created directly (in
// COMPLETED status, never NEEDS_CONFIRMATION) by conversationalCapture.ts's
// GOAL candidate processing; this handler exists only so the capability
// registry has no coverage gap if the router ever resolves a message to it.
function goalCaptureNotDirectlyRoutableResult(): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'ASK_GOAL_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{
      type: 'BOUNDARY', id: 'sell-hold-rent-goal-capture-not-routable', title: 'This isn\'t something you can ask for directly', severity: 'INFO',
      body: 'A sell, hold, or rent decision thread is attached automatically when Ask recognizes you mentioning a plan to sell, hold, or rent this home -- it can\'t be started directly.',
      suggestions: [],
    }],
    suggestions: [],
  };
}

registerCapabilityHandler('sell-hold-rent.goal-capture', async () => goalCaptureNotDirectlyRoutableResult());
