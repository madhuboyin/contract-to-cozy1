// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { SellHoldRentService } from '../../sellHoldRent.service';
import { PropertySaleCaseService, SALE_READINESS_MUST_ADDRESS_CLASSES, saleReadinessFigure } from '../../propertySaleCase.service';
import { money } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
import { decisionProgressBlock, whyNowBlock } from '../decisionThreadPresentationBlocks';
import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';

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
// negative and are different kinds of figure (net proceeds against a net change), so no price bars are drawn (no option
// declares an amount) and no option is badged or marked leading: the summary already says which way the model's
// indicator points, and the strip does not repeat it as a winner.
export function sellHoldRentComparison(analysis: Awaited<ReturnType<typeof sellHoldRentService.estimate>>, years: number): Extract<AskPresentationBlock, { type: 'COMPARISON' }> {
  const { scenarios } = analysis;
  const option = (id: string, label: string, outcome: string, components: string) => ({
    id, label, summary: null,
    attributes: [
      { label: 'Modeled outcome', value: outcome, tone: 'DEFAULT' as const },
      { label: 'Key components', value: components, tone: 'DEFAULT' as const },
    ],
    actions: [],
  });
  return {
    type: 'COMPARISON', id: 'sell-hold-rent-comparison', title: `${years}-year scenario snapshot`,
    description: 'All amounts are planning estimates. Different scenario rows describe different economic outcomes and should be reviewed with the assumptions below.',
    options: [
      option('sell', 'Sell at the end of the horizon', `${money(scenarios.sell.netProceeds)} modeled net proceeds`,
        `${money(scenarios.sell.projectedSalePrice)} projected price · ${money(scenarios.sell.sellingCosts)} selling costs`),
      option('hold', 'Continue holding', `${money(scenarios.hold.net)} modeled net change`,
        `${money(scenarios.hold.appreciationGain)} appreciation · ${money(scenarios.hold.totalOwnershipCosts)} ownership and modeled interest costs`),
      option('rent', 'Rent the home out', `${money(scenarios.rent.net)} modeled net change`,
        `${money(scenarios.rent.totalRentalIncome)} gross rent · ${money(scenarios.rent.rentalOverheads.vacancyLoss + scenarios.rent.rentalOverheads.managementFees)} vacancy and management overhead`),
    ],
    actions: [],
  };
}

async function sellHoldRentAnalysisResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/sell-hold-rent`;
  const [access, context, analysis, threadSelection] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'SELL_HOLD_RENT', operationKey: 'VIEW_ANALYSIS' }),
    sellHoldRentService.estimate(propertyId, { years: 5 }, userId),
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

  const limitations = [
    `Home value ${money(analysis.current.homeValueNow)}`,
    `Rent ${money(analysis.current.monthlyRentNow)}/month`,
    `Appreciation ${(analysis.current.appreciationRate * 100).toFixed(1)}%/year`,
    `Selling costs ${(analysis.current.sellingCostRate * 100).toFixed(1)}%`,
    debtKnown ? 'Mortgage modeled from the home record' : 'Mortgage effects are not fully modeled',
  ];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'sell-hold-rent-summary',
    title: `Here is the current ${years}-year sell, hold, and rent comparison`,
    body: `The model’s directional indicator currently points to ${winnerLabel}, but this is not a conclusion that now is the right time to sell. The sell figure is projected liquidity after selling costs and a mortgage payoff when known; hold and rent figures are modeled changes over the horizon, so the totals should not be treated as directly interchangeable investment returns. Confidence is ${analysis.recommendation.confidence.toLowerCase()}.`,
    tone: lowConfidence || contextLimited ? 'CAUTION' : 'DEFAULT',
    // FRD Sec22 (Option B): reframed as continuing the tracked plan when one
    // exists, rather than the generic prompt every homeowner without an
    // active goal thread still sees.
    actions: [{ id: 'open-sell-hold-rent', label: activeThread ? 'Continue your plan' : 'Explore and adjust scenarios', href: workspaceHref, style: 'PRIMARY' }],
  }, sellHoldRentComparison(analysis, years), {
    type: 'GROUPED_LIST', filters: [],
    id: 'sell-hold-rent-assumptions',
    title: 'Assumptions that materially affect the answer',
    description: 'Adjust these in Sell / Hold / Rent before relying on the comparison for a major decision.',
    sections: [{
      id: 'assumptions', title: 'Current planning inputs', count: limitations.length,
      items: limitations.map((title, index) => ({ id: `assumption-${index + 1}`, title, description: null, meta: [], status: null, href: workspaceHref })),
    }],
    actions: [],
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

  // FRD Sec22 (Option B): surface the tracked plan's own progress when one
  // exists, right after the summary -- read-only, no recompute (selectThread
  // above already applied read-time freshness projection). Never creates a
  // thread; a property with no active goal sees the same blocks as before
  // this decision was implemented.
  if (activeThread) {
    blocks.splice(1, 0, decisionProgressBlock(
      'sell-hold-rent-analysis-progress',
      'Your sell, hold, or rent plan',
      activeThread,
      activeThread.currentRecommendationSnapshot,
      [{ id: 'open-sell-hold-rent-plan', label: 'Continue your plan', href: workspaceHref, style: 'PRIMARY' }],
    ));
    if (activeThread.currentRecommendationSnapshot) {
      blocks.splice(2, 0, whyNowBlock('sell-hold-rent-analysis-why-now', activeThread.currentRecommendationSnapshot, []));
    }
  }

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
    captureRequests,
    blocks,
    suggestions: permissionLimited
      ? ['Ask a household owner or contributor to improve the property context', 'Open Sell / Hold / Rent']
      : ['What assumptions matter most?', 'Open Sell / Hold / Rent', 'How much does this home cost each month?'],
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

// The readiness checklist lives on the sale-case page (it scrolls to and highlights ?focusItemId=). /seller-prep is the
// capability's entry page, which reads a different overview; FRD v1.44 moved checklist links off it.
export function saleCaseHref(propertyId: string, itemId?: string): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/sale-case`;
  return itemId ? `${base}?focusItemId=${encodeURIComponent(itemId)}` : base;
}

async function sellerPrepChecklistResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/seller-prep`;
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
          ? 'Start a sale case to get a personalized seller-prep checklist -- repairs, records, and cosmetic work prioritized for this home.'
          : 'A seller-prep checklist becomes available once this property is marked for sale.',
        tone: 'DEFAULT',
        actions: [{ id: 'open-seller-prep', label: 'Open seller prep', href, style: 'PRIMARY' }],
      }],
      suggestions: ['Should I sell, hold, or rent this home?'],
    };
  }

  const access = await ensurePropertyAccess(userId, propertyId);
  const itemActions = sellerPrepItemActions(access.role);
  const checklistHref = saleCaseHref(propertyId);
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
    href: saleCaseHref(propertyId, item.id),
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
    actions: [{ id: 'open-seller-prep', label: 'Open sale readiness checklist', href: checklistHref, style: 'SECONDARY' }],
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
        meta: [], status: item.status, href: saleCaseHref(propertyId, item.id), entityType: 'SALE_READINESS_ITEM', actions: openActions,
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
    blocks.push({
      type: 'GROUPED_LIST', filters: [],
      id: 'seller-prep-open-items',
      title: openItems.length ? 'Open items' : 'Checklist items',
      // IW-PRES-014 / IW-PRES-022: the checklist renders as shelves (FRD v1.84); the live item detail keeps its decisions.
      presentation: { pattern: 'SHELVES' },
      description: 'Repairs, records, and presentation work recommended before listing, grouped by category. Open an item to see it and decide on it.',
      sections: [
        ...[...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, items]) => ({
          id: `seller-prep-${category.toLowerCase()}`,
          title: SALE_READINESS_CATEGORY_LABELS[category] ?? category,
          count: items.length,
          items: items.slice(0, 20).map(row),
        })),
        ...(pursuingItems.length ? [{ id: 'seller-prep-pursuing', title: 'Pursuing before listing', count: pursuingItems.length, items: pursuingItems.slice(0, 20).map(row) }] : []),
        ...(waivedItems.length ? [{ id: 'seller-prep-waived', title: 'Disclosed, not addressed', count: waivedItems.length, items: waivedItems.slice(0, 20).map(row) }] : []),
      ],
      actions: [],
    });
  }

  return {
    status: 'ANSWERED',
    reasonCode: openItems.length ? 'SELLER_PREP_ITEMS_OPEN' : 'SELLER_PREP_NO_OPEN_ITEMS',
    blocks,
    suggestions: openItems.length
      ? ['What should I prioritize first?', 'Open seller prep']
      : ['Open Sell / Hold / Rent'],
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
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/seller-prep`;
  const overview = await PropertySaleCaseService.getCase(userId, propertyId);
  if (!overview.saleCase) {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'SELLER_PREP_NO_ACTIVE_CASE',
      blocks: [{
        type: 'SUMMARY',
        id: 'seller-prep-decision-no-case',
        title: 'No active sale case yet',
        body: 'Start a sale case before deciding on a seller-prep checklist item.',
        tone: 'DEFAULT',
        actions: [{ id: 'open-seller-prep', label: 'Open seller prep', href, style: 'PRIMARY' }],
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
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'SELLER_PREP_ITEM_TARGET_REQUIRED',
      blocks: [{
        type: 'GROUPED_LIST', filters: [],
        id: 'seller-prep-item-targets',
        title: 'Choose an item and a decision',
        description: 'Use the exact item title and say waive, pursue, reopen, or unpursue.',
        sections: [{
          id: 'items',
          title: 'Checklist items',
          count: decidable.length,
          items: decidable.slice(0, 50).map((item) => ({ id: item.id, title: item.title, description: item.detail ?? null, meta: [], status: item.status, href: saleCaseHref(propertyId, item.id) })),
        }],
        actions: [{ id: 'open-seller-prep', label: 'Open sale readiness checklist', href: saleCaseHref(propertyId), style: 'SECONDARY' }],
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
      title: `Review ${action.toLowerCase()} decision`,
      body: SELLER_PREP_ITEM_ACTION_COPY[action],
      tone: 'CAUTION',
      actions: [{ id: 'open-seller-prep', label: 'Review in the checklist', href: saleCaseHref(propertyId, selected.id), style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `seller-prep-item-${selected.id}-1`,
      version: 1,
      title: `${actionLabel} "${selected.title}"?`,
      description: selected.detail ?? selected.title,
      fields: [
        { label: 'Item', value: selected.title },
        { label: 'Decision', value: action.toLowerCase() },
        ...(reason ? [{ label: 'Reason', value: reason }] : []),
      ],
      editableFields: [], confirmLabel: `${actionLabel} item`,
      consentText: 'I authorize this update to the shared seller-prep checklist.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('sale-case.analysis', async (envelope) => sellHoldRentAnalysisResult(envelope.userId, envelope.propertyId!));

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
