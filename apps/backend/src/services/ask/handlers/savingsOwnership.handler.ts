// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { HomeSavingsService } from '../../homeSavings.service';
import { HiddenAssetService } from '../../hiddenAssets.service';
import { savingsBenefitsUnifiedService } from '../../savingsBenefitsUnified.service';
import { ownershipCostReadModelService, type OwnershipCostCurrentLens } from '../../ownershipCosts/ownershipCostReadModel.service';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';

const homeSavingsService = new HomeSavingsService();

const hiddenAssetService = new HiddenAssetService();

function savingsValue(value: number | null, currency: string, basis: string): string | null {
  if (value == null) return null;
  const amount = currency === 'USD'
    ? money(value)
    : `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
  const suffix = basis === 'MONTHLY' ? '/month' : basis === 'ANNUAL' ? '/year' : basis === 'ONE_TIME' ? ' one-time' : '';
  return `${amount}${suffix}`;
}

async function savingsOpportunitiesResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/savings-benefits`;
  const realizedFocus = /\b(realized|received|already saved)\b/i.test(message);
  const paybackFocus = /\b(?:fastest|shortest|best) payback\b/i.test(message);
  const [access, homeSavings, benefits, unified, context] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    homeSavingsService.getSummary(propertyId, userId),
    hiddenAssetService.getMatchesForProperty(propertyId, userId, {}, { trackView: false }),
    savingsBenefitsUnifiedService.getUnified(propertyId, userId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'HOME_SAVINGS', operationKey: 'RUN_ANALYSIS' }),
  ]);

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

  const recurring = homeSavings.categories
    .filter((category) => category.topOpportunity && category.status === 'FOUND_SAVINGS')
    .map(({ category, topOpportunity }) => {
      const opportunity = topOpportunity!;
      const annual = opportunity.netAnnualSavings ?? opportunity.estimatedAnnualSavings;
      return {
        id: `recurring-${opportunity.id}`,
        title: opportunity.headline,
        description: opportunity.detail,
        meta: [
          category.label,
          annual == null ? null : `Estimated ${money(annual)}/year after modeled switching cost`,
          opportunity.confidence === 'HIGH' ? 'High confidence' : `${opportunity.confidence.toLowerCase()} confidence`,
          opportunity.offerSourceKind === 'ADDRESS_QUALIFIED' ? 'Address-qualified source' : 'Benchmark estimate',
          opportunity.estimatedPaybackMonths == null ? null : `Estimated payback ${opportunity.estimatedPaybackMonths} months`,
        ].filter((value): value is string => Boolean(value)),
        status: opportunity.status,
        href: `${workspaceHref}?family=RECURRING_COST&opportunityId=${encodeURIComponent(opportunity.id)}`,
        paybackMonths: opportunity.estimatedPaybackMonths,
      };
    })
    .sort((left, right) => (left.paybackMonths ?? Number.POSITIVE_INFINITY) - (right.paybackMonths ?? Number.POSITIVE_INFINITY))
    .slice(0, 8)
    .map(({ paybackMonths: _paybackMonths, ...item }) => item);

  const reviewedBenefits = benefits.matches.slice(0, 8).map((match) => {
    const value = match.estimatedValue != null
      ? savingsValue(match.estimatedValue, match.currency, match.benefitPeriod)
      : match.estimatedValueMin != null || match.estimatedValueMax != null
        ? `${match.currency} ${match.estimatedValueMin ?? 0}–${match.estimatedValueMax ?? 'unknown'}`
        : null;
    return {
      id: `benefit-${match.id}`,
      title: match.programName,
      description: match.description,
      meta: [value ? `Estimated ${value}` : 'Value not quantified', match.eligibilityLabel, match.sourceLabel, match.freshnessNote].filter((value): value is string => Boolean(value)),
      status: match.status,
      href: `${workspaceHref}?family=BENEFIT&opportunityId=${encodeURIComponent(match.id)}`,
    };
  });

  const inProgress = unified.inProgress.slice(0, 8).map((item) => ({
    id: `progress-${item.family}-${item.id}`,
    title: item.title,
    description: item.explanation,
    meta: [
      item.family === 'BENEFIT' ? 'Benefit or rebate' : 'Recurring-cost savings',
      savingsValue(item.estimatedValue, item.currency, item.estimatedValueBasis),
      item.deadline ? `Deadline ${humanDate(new Date(item.deadline))}` : null,
    ].filter((value): value is string => Boolean(value)),
    status: item.statusLabel,
    href: item.detailHref,
  }));

  const realized = unified.realized.slice(0, 8).map((item) => ({
    id: `realized-${item.family}-${item.id}`,
    title: item.title,
    description: item.explanation,
    meta: [
      savingsValue(item.realizedValue, item.currency, item.estimatedValueBasis) ?? 'Recorded value not quantified',
      item.verificationState ? `${item.verificationState.toLowerCase()} outcome` : 'Homeowner-recorded outcome',
    ],
    status: 'REALIZED',
    href: item.detailHref,
  }));

  const related = unified.relatedOpportunities.slice(0, 5).map((item) => ({
    id: `related-${item.domain}`,
    title: item.domain === 'PROPERTY_TAX' ? 'Property tax opportunity' : item.domain === 'COVERAGE' ? 'Coverage and premium review' : 'Mortgage refinance review',
    description: item.summary,
    meta: ['Owned by its dedicated ContractToCozy analysis'],
    status: 'RELATED',
    href: item.detailHref,
  }));

  const availableCount = recurring.length + reviewedBenefits.length;
  const hasAnyResult = availableCount + inProgress.length + realized.length + related.length > 0;
  const neverAnalyzed = !homeSavings.propertyContextVersion && benefits.summary.lastScanAt === null;
  const realizedTotal = unified.totals.realizedValueTotal;
  const realizedCurrency = unified.totals.realizedValueCurrency;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'savings-summary',
    title: realizedFocus
      ? unified.totals.realizedCount === 0
        ? 'No realized savings outcome is recorded yet'
        : realizedTotal != null && realizedCurrency
          ? `${unified.totals.realizedCount} realized outcome${unified.totals.realizedCount === 1 ? '' : 's'} totaling ${savingsValue(realizedTotal, realizedCurrency, 'UNKNOWN')}`
          : `${unified.totals.realizedCount} realized savings outcome${unified.totals.realizedCount === 1 ? ' is' : 's are'} recorded across one or more currencies`
      : paybackFocus && recurring[0]
        ? `${recurring[0].title} has the shortest recorded payback estimate`
      : homeSavings.potentialAnnualSavings > 0
      ? `The strongest recorded recurring-cost opportunity is about ${money(homeSavings.potentialAnnualSavings)} per year`
      : availableCount > 0
        ? `${availableCount} savings ${availableCount === 1 ? 'opportunity is' : 'opportunities are'} ready to review`
        : neverAnalyzed
          ? 'Savings analysis has not been completed for this home yet'
          : hasAnyResult
            ? 'Here is the current savings picture for this home'
            : 'No current savings opportunity is recorded—not the same as zero savings',
    body: realizedFocus
      ? unified.totals.realizedCount === 0
        ? 'Realized value is counted only from a recorded RECEIVED outcome; estimates and actions in progress are kept separate.'
        : 'These are recorded RECEIVED outcomes. Verification labels remain visible so homeowner-reported and independently verified values are not conflated.'
      : paybackFocus && recurring[0]
        ? `Its ${recurring[0].meta.find((item) => item.startsWith('Estimated payback'))?.toLowerCase() ?? 'payback estimate is available in Savings and Benefits'}. Payback uses modeled switching friction and is not a provider guarantee.`
      : homeSavings.potentialAnnualSavings > 0
      ? `This is the highest single net annual estimate, not a sum across categories. Ask also found ${reviewedBenefits.length} reviewed benefit or rebate match${reviewedBenefits.length === 1 ? '' : 'es'}, ${inProgress.length} item${inProgress.length === 1 ? '' : 's'} in progress, and ${realized.length} recorded realized outcome${realized.length === 1 ? '' : 's'}. Estimates are not provider quotes or eligibility guarantees.`
      : neverAnalyzed
        ? 'Open Savings and Benefits to run the governed analysis. Ask will not infer that no savings exist from an empty record.'
        : 'The sections below separate available estimates, actions already in progress, verified or homeowner-recorded outcomes, and opportunities owned by other domain tools.',
    tone: homeSavings.potentialAnnualSavings > 0 || availableCount > 0 ? 'POSITIVE' : 'DEFAULT',
    actions: [{ id: 'open-savings', label: neverAnalyzed ? 'Run Savings and Benefits' : 'Open Savings and Benefits', href: workspaceHref, style: 'PRIMARY' }],
  }];

  if (hasAnyResult) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'savings-opportunity-groups', title: 'Savings and benefits',
      description: 'Available estimates are planning signals. Realized value appears only from recorded RECEIVED outcomes.',
      sections: [
        { id: 'recurring', title: 'Recurring-cost opportunities', count: recurring.length, items: recurring },
        { id: 'benefits', title: 'Benefits and rebates to review', count: reviewedBenefits.length, items: reviewedBenefits },
        { id: 'in-progress', title: 'Already in progress', count: unified.totals.inProgressCount, items: inProgress },
        { id: 'realized', title: 'Recorded realized savings', count: unified.totals.realizedCount, items: realized },
        { id: 'related', title: 'Related savings decisions', count: related.length, items: related },
      ].filter((section) => section.count > 0),
      actions: [{ id: 'review-all-savings', label: 'Review all opportunities', href: workspaceHref, style: 'PRIMARY' }],
    });
  }

  const evidenceItems = [
    ...reviewedBenefits.slice(0, 5).map((item, index) => ({
      label: item.title,
      source: benefits.matches[index]?.sourceLabel ?? 'Reviewed Savings and Benefits registry',
      observedAt: benefits.matches[index]?.lastVerifiedAt ?? benefits.matches[index]?.lastEvaluatedAt ?? null,
    })),
    ...(homeSavings.propertyContextVersion ? [{ label: 'Recurring-cost comparison', source: 'Home Savings analysis', observedAt: homeSavings.updatedAt }] : []),
  ];
  if (evidenceItems.length) blocks.push({ type: 'EVIDENCE', id: 'savings-evidence', title: 'Sources and freshness', items: evidenceItems });

  const unsupportedInventoryCapture = canImproveContext && activeRequirement?.capture.inputSchema.type === 'RELATIONAL_SELECT_CREATE';
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  return {
    status: captureRequests.length || unsupportedInventoryCapture || permissionLimited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'SAVINGS_CONTEXT_OPTIONAL'
      : unsupportedInventoryCapture
        ? 'SAVINGS_INVENTORY_SETUP_AVAILABLE'
        : permissionLimited
          ? 'SAVINGS_CONTEXT_WRITE_PERMISSION_REQUIRED'
          : undefined,
    contextVersion: context.contextVersion,
    captureRequests,
    blocks,
    suggestions: permissionLimited
      ? ['Ask a household owner or contributor to improve the savings context', 'Which opportunity has the fastest payback?']
      : unsupportedInventoryCapture
      ? ['Open Savings and Benefits to add installed systems', 'Which opportunity has the fastest payback?']
      : realizedFocus
        ? ['Which opportunity has the fastest payback?', 'Where else could I save money?']
        : paybackFocus
          ? ['What savings have I already realized?', 'Where else could I save money?']
          : ['Which opportunity has the fastest payback?', 'What savings have I already realized?'],
  };
}

function ownershipCostLens(message: string): OwnershipCostCurrentLens {
  return /\b(?:cash outflow|out[ -]of[ -]pocket|including (?:the )?mortgage principal|total (?:cash|paid|payment)|monthly payment)\b/i.test(message)
    ? 'CASH_OUTFLOW'
    : 'OPERATING_EXPENSE';
}

async function ownershipCostsResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const lens = ownershipCostLens(message);
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/ownership-costs?view=current&lens=${lens}`;
  const [access, context] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'OWNERSHIP_COSTS', operationKey: 'VIEW_ANALYSIS' }),
  ]);
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

  let costs: Awaited<ReturnType<typeof ownershipCostReadModelService.getCurrent>>;
  try {
    costs = await ownershipCostReadModelService.getCurrent(propertyId, userId, lens, { refresh: true });
  } catch {
    return {
      status: captureRequests.length ? 'NEEDS_CONTEXT' : 'UNAVAILABLE',
      reasonCode: captureRequests.length ? 'OWNERSHIP_COST_CONTEXT_REQUIRED' : 'OWNERSHIP_COST_SNAPSHOT_UNAVAILABLE',
      contextVersion: context.contextVersion,
      captureRequests,
      blocks: [{
        type: 'SUMMARY', id: 'ownership-costs-unavailable', title: 'A current ownership-cost total is not ready yet',
        body: 'Ask could not load a canonical ownership-cost snapshot. Missing categories are not treated as zero. Improve the home context below or open Ownership Costs to review and refresh its source records.',
        tone: 'CAUTION',
        actions: [{ id: 'open-ownership-costs', label: 'Open Ownership Costs', href: workspaceHref, style: 'PRIMARY' }],
      }],
      suggestions: captureRequests.length ? ['Add this detail and retry automatically'] : ['Open Ownership Costs'],
    };
  }

  const included = costs.categories
    .filter((category) => category.includedInSelectedLens && category.amountCents != null)
    .sort((left, right) => (right.amountCents ?? 0) - (left.amountCents ?? 0));
  const missing = costs.categories.filter((category) =>
    category.includedInSelectedLens
    && category.applicability !== 'NOT_APPLICABLE'
    && category.amountCents == null);
  const categoryFocus = /\b(?:largest|biggest|highest|most expensive|which (?:cost |expense )?categor(?:y|ies))\b/i.test(message);
  const largestCategory = included[0];
  const lensLabel = lens === 'CASH_OUTFLOW' ? 'cash outflow' : 'operating expense';
  const monthly = money(costs.snapshot.monthlyTotalCents / 100);
  const annual = money(costs.snapshot.annualTotalCents / 100);
  const coverageLimited = costs.snapshot.coverageStatus !== 'CREDIBLE'
    || costs.snapshot.lastKnownGood
    || costs.stale.isStale
    || missing.length > 0;
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'ownership-costs-summary',
    title: categoryFocus && largestCategory?.monthlyAmountCents != null
      ? `${largestCategory.label} is the largest recorded category at about ${money(largestCategory.monthlyAmountCents / 100)} per month`
      : `This home’s recorded ${lensLabel} is about ${monthly} per month`,
    body: `${annual} per year is included in the ${lensLabel} lens.${categoryFocus && largestCategory ? ` ${largestCategory.label} represents ${costs.snapshot.annualTotalCents > 0 ? Math.round(((largestCategory.amountCents ?? 0) / costs.snapshot.annualTotalCents) * 100) : 0}% of that recorded total.` : ''} ${money(costs.evidenceSummary.confirmedAnnualCents / 100)} is supported by confirmed or observed records and ${money(costs.evidenceSummary.estimatedAnnualCents / 100)} is estimated. ${missing.length ? `${missing.length} included categor${missing.length === 1 ? 'y is' : 'ies are'} still missing and not counted as zero.` : 'No included category is currently marked missing.'}`,
    tone: coverageLimited ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-ownership-costs', label: 'Review Ownership Costs', href: workspaceHref, style: 'PRIMARY' }],
  }, {
    type: 'TABLE', id: 'ownership-cost-categories', title: 'Cost by category',
    description: `Categories included in the ${lensLabel} lens, ordered by annual amount.`,
    columns: [{ key: 'category', label: 'Category' }, { key: 'monthly', label: 'Monthly' }, { key: 'annual', label: 'Annual' }, { key: 'evidence', label: 'Evidence' }],
    rows: included.map((category) => ({
      id: category.category,
      values: {
        category: category.label,
        monthly: category.monthlyAmountCents == null ? 'Unknown' : money(category.monthlyAmountCents / 100),
        annual: category.amountCents == null ? 'Unknown' : money(category.amountCents / 100),
        evidence: `${category.amountKind.toLowerCase().replace(/_/g, ' ')}${category.freshnessStatus === 'CURRENT' ? '' : ` · ${category.freshnessStatus.toLowerCase()}`}`,
      },
    })),
    actions: [],
  }];

  if (missing.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'ownership-cost-missing', title: 'Information that could improve this total',
      description: 'These categories are applicable or unresolved, but no amount is currently included.',
      sections: [{
        id: 'missing', title: 'Missing from the selected lens', count: missing.length,
        items: missing.map((category) => ({
          id: category.category,
          title: category.label,
          description: category.missingDependencies.length ? category.missingDependencies.join(' · ') : 'No usable current amount is recorded.',
          meta: [category.correction.label],
          status: 'MISSING',
          href: category.correction.href,
        })),
      }],
      actions: [],
    });
  }

  const evidence = included.slice(0, 10).map((category) => ({
    label: category.label,
    source: category.sourceDomain
      ? `${category.sourceDomain.toLowerCase().replace(/_/g, ' ')} · ${category.evidenceStatus?.toLowerCase().replace(/_/g, ' ') ?? 'evidence status unknown'}`
      : 'Ownership Cost Intelligence',
    observedAt: category.periodEnd ?? costs.snapshot.calculatedAt,
    claim: {
      targetBlockId: 'ownership-cost-categories',
      targetItemId: category.category,
      text: `${category.label}: ${category.monthlyAmountCents == null ? 'monthly amount unknown' : `${money(category.monthlyAmountCents / 100)} per month`} and ${category.amountCents == null ? 'annual amount unknown' : `${money(category.amountCents / 100)} per year`}.`,
    },
  }));
  if (evidence.length) blocks.push({ type: 'EVIDENCE', id: 'ownership-cost-evidence', title: 'Sources and periods', items: evidence });
  blocks.push({
    type: 'BOUNDARY', id: 'ownership-cost-lens-boundary', title: `${lens === 'CASH_OUTFLOW' ? 'Cash outflow' : 'Operating expense'} lens`,
    body: lens === 'CASH_OUTFLOW'
      ? 'Cash outflow includes recorded mortgage principal, repairs, projects, and reserve contributions when available. Principal builds equity and should not be interpreted as an economic expense.'
      : 'Operating expense excludes mortgage principal, known repairs, capital projects, and reserve contributions. Switch to cash outflow to see those recorded payments when available.',
    severity: 'INFO', suggestions: [],
  });

  return {
    status: captureRequests.length || coverageLimited || permissionLimited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'OWNERSHIP_COST_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'OWNERSHIP_COST_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : coverageLimited
          ? 'OWNERSHIP_COST_COVERAGE_LIMITED'
          : undefined,
    contextVersion: context.contextVersion,
    captureRequests,
    blocks,
    suggestions: lens === 'CASH_OUTFLOW'
      ? ['Show operating expenses only', 'Which category costs the most?', 'Where could I save money?']
      : ['Show cash outflow including mortgage principal', 'Which category costs the most?', 'Where could I save money?'],
  };
}

registerCapabilityHandler('savings.opportunities', async (envelope) => savingsOpportunitiesResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('ownership.costs', async (envelope) => ownershipCostsResult(envelope.userId, envelope.propertyId!, envelope.message));
