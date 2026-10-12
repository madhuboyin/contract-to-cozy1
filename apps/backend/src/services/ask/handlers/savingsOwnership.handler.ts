// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { HomeSavingsService } from '../../homeSavings.service';
import { HiddenAssetService } from '../../hiddenAssets.service';
import { savingsBenefitsUnifiedService } from '../../savingsBenefitsUnified.service';
import { ownershipCostReadModelService, type OwnershipCostCurrentLens } from '../../ownershipCosts/ownershipCostReadModel.service';
import { ownershipCostChangeService } from '../../ownershipCosts/ownershipCostChange.service';
import { ownershipCostForecastService } from '../../ownershipCosts/ownershipCostForecast.service';
import { ownershipCostVariabilityService } from '../../ownershipCosts/ownershipCostVariability.service';
import { ownershipCostDecisionService } from '../../ownershipCosts/ownershipCostDecision.service';
import type { OwnershipCostCategory } from '../../ownershipCosts/ownershipCost.contract';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { OWNERSHIP_COST_ACTION_IDS, OWNERSHIP_COST_COMMAND_MESSAGE } from '../support/ownershipCostConstants';

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
        href: null,
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
      href: null,
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
    href: null,
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
    href: null,
  }));

  const related = unified.relatedOpportunities.slice(0, 5).map((item) => ({
    id: `related-${item.domain}`,
    title: item.domain === 'PROPERTY_TAX' ? 'Property tax opportunity' : item.domain === 'COVERAGE' ? 'Coverage and premium review' : 'Mortgage refinance review',
    description: item.summary,
    meta: ['Owned by its dedicated ContractToCozy analysis'],
    status: 'RELATED',
    href: null,
  }));

  const relatedActions: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['actions'] = [];
  if (unified.relatedOpportunities.some((item) => item.domain === 'PROPERTY_TAX')) relatedActions.push({
    id: 'review-property-tax-opportunity', label: 'Review property tax opportunity', interactionType: 'START_WORKFLOW',
    message: 'Review my property-tax appeal readiness.', operationId: 'PROPERTY_TAX_APPEAL_READINESS', style: 'SECONDARY',
  });
  if (unified.relatedOpportunities.some((item) => item.domain === 'COVERAGE')) relatedActions.push({
    id: 'review-coverage-opportunity', label: 'Review coverage gaps', interactionType: 'START_WORKFLOW',
    message: 'Show my current coverage gaps.', operationId: 'COVERAGE_GAPS', style: 'SECONDARY',
  });
  if (unified.relatedOpportunities.some((item) => item.domain === 'REFINANCE')) relatedActions.push({
    id: 'review-refinance-opportunity', label: 'Review refinance opportunity', interactionType: 'START_WORKFLOW',
    message: 'Review my current refinance analysis.', operationId: 'REFINANCE_ANALYSIS', style: 'SECONDARY',
  });

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
        ? 'No savings analysis has been run for this home yet, and running one is not currently available in Ask. Ask will not infer that no savings exist from an empty record.'
        : 'The sections below separate available estimates, actions already in progress, verified or homeowner-recorded outcomes, and opportunities owned by other domain tools.',
    tone: homeSavings.potentialAnnualSavings > 0 || availableCount > 0 ? 'POSITIVE' : 'DEFAULT',
    actions: [],
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
      actions: relatedActions,
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
    suggestions: [],
  };
}

function ownershipCostLens(message: string): OwnershipCostCurrentLens {
  return /\b(?:cash outflow|out[ -]of[ -]pocket|including (?:the )?mortgage principal|total (?:cash|paid|payment)|monthly payment)\b/i.test(message)
    ? 'CASH_OUTFLOW'
    : 'OPERATING_EXPENSE';
}

const ownershipViewMessages = {
  current: 'Show my current ownership costs',
  changes: 'What changed in my ownership costs?',
  forecast: 'What may change in my ownership costs?',
  variability: 'Help me plan an ownership cost buffer',
} as const;

function ownershipView(message: string): keyof typeof ownershipViewMessages {
  if (/\b(?:what changed|changes?|increased?|decreased?|different)\b/i.test(message)) return 'changes';
  if (/\b(?:what may change|forecast|future|forward|scenario|scenarios|horizon)\b/i.test(message)) return 'forecast';
  if (/\b(?:plan (?:a )?buffer|buffer|variability|volatile|volatility|cash cushion)\b/i.test(message)) return 'variability';
  return 'current';
}

const viewAction = (key: keyof typeof ownershipViewMessages, label: string) => ({
  id: `ownership-cost-view-${key}`,
  label,
  message: ownershipViewMessages[key],
  operationId: 'OWNERSHIP_COSTS' as const,
  interactionType: 'CONVERSATION_CONTINUE' as const,
  style: 'SECONDARY' as const,
});

function ownershipViewSwitcher(active: keyof typeof ownershipViewMessages): AskPresentationBlock {
  const definitions = [
    ['current', 'Current cost', 'Recorded cost, completeness and evidence.'],
    ['changes', 'What changed', 'Compare observed periods and review material changes.'],
    ['forecast', 'What may change', 'See forward ranges, drivers and saved scenarios.'],
    ['variability', 'Plan a buffer', 'Review observed variability and planning buffers.'],
  ] as const;
  return {
    type: 'GROUPED_LIST', id: 'ownership-cost-views', title: 'Explore ownership costs',
    description: 'Continue with any part of the Ownership Costs workspace without leaving this conversation.', filters: [],
    sections: [{ id: 'ownership-cost-view-options', title: 'Views', count: definitions.length, items: definitions.map(([key, title, description]) => ({
      id: key, entityType: 'OWNERSHIP_COST_VIEW', title, description,
      status: key === active ? 'CURRENT' : undefined, meta: [],
      actions: key === active ? undefined : [viewAction(key, title)],
    })) }], actions: [],
  };
}

const categoryReview: Record<OwnershipCostCategory, { label: string; operationId: AskOperationId; message: string }> = {
  PROPERTY_TAX: { label: 'Review property tax', operationId: 'PROPERTY_TAX_APPEAL_READINESS', message: 'Review my property tax details and appeal readiness' },
  INSURANCE: { label: 'Review insurance', operationId: 'COVERAGE_GAPS', message: 'Review my insurance coverage and premium' },
  HOA: { label: 'Review HOA records', operationId: 'HOA_COMPLIANCE_STATUS', message: 'Review my HOA records and compliance status' },
  UTILITIES: { label: 'Review utilities', operationId: 'SAVINGS_OPPORTUNITIES', message: 'Review my utility costs and savings opportunities' },
  MORTGAGE_PRINCIPAL: { label: 'Review financing', operationId: 'REFINANCE_ANALYSIS', message: 'Review my mortgage financing and refinance outlook' },
  MORTGAGE_INTEREST: { label: 'Review financing', operationId: 'REFINANCE_ANALYSIS', message: 'Review my mortgage financing and refinance outlook' },
  PMI: { label: 'Review financing', operationId: 'REFINANCE_ANALYSIS', message: 'Review my mortgage financing and refinance outlook' },
  RECURRING_HOME_SERVICE: { label: 'Review recurring services', operationId: 'SAVINGS_OPPORTUNITIES', message: 'Review recurring home-service costs and savings opportunities' },
  ROUTINE_MAINTENANCE: { label: 'Review maintenance', operationId: 'MAINTENANCE_STATUS', message: 'Review my home maintenance plan' },
  KNOWN_REPAIR: { label: 'Review capital plan', operationId: 'CAPITAL_RESERVE_PLAN', message: 'Review my capital reserve plan and known repairs' },
  CAPITAL_PROJECT: { label: 'Review capital plan', operationId: 'CAPITAL_RESERVE_PLAN', message: 'Review my capital reserve plan and projects' },
  RESERVE_CONTRIBUTION: { label: 'Review reserve plan', operationId: 'CAPITAL_RESERVE_PLAN', message: 'Review my capital reserve plan' },
};

const moneyFromCents = (cents: number | null | undefined) => cents == null ? 'Unknown' : money(cents / 100);
const codeLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const ownershipCommandAction = (id: string, label: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' = 'SECONDARY') => ({ id, label, interactionType: 'MUTATE_RECORD' as const, message: OWNERSHIP_COST_COMMAND_MESSAGE, operationId: 'OWNERSHIP_COST_COMMAND', style, entityId, entityType: 'OWNERSHIP_COST_ACTION' });

async function ownershipChangesResult(userId: string, propertyId: string, lens: OwnershipCostCurrentLens): Promise<AskOperationResult> {
  const [changes, decisions, access] = await Promise.all([
    ownershipCostChangeService.getObservedChanges(propertyId, userId, lens),
    ownershipCostDecisionService.list(propertyId, userId),
    ensurePropertyAccess(userId, propertyId),
  ]);
  const canChange = access.role !== HouseholdRole.VIEWER;
  const currentByAction = new Map(decisions.decisions.map((decision) => [decision.sourceActionId, decision]));
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'ownership-cost-changes-summary',
    title: changes.comparable ? `${changes.changes.length} ownership-cost change${changes.changes.length === 1 ? '' : 's'} found` : 'More history is needed to compare ownership costs',
    body: changes.comparable ? `Recurring costs changed by ${moneyFromCents(changes.totalRecurringDeltaCents)} and one-time costs changed by ${moneyFromCents(changes.totalOneTimeDeltaCents)} across the compared periods.` : changes.reason ?? 'There are not yet two comparable observed periods.',
    tone: changes.changes.some((change) => change.materiality.material) ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (changes.changes.length) blocks.push({
    type: 'GROUPED_LIST', id: 'ownership-cost-changes', title: 'What changed', filters: [],
    description: 'Ranked observed changes; estimates and unsupported explanations remain visibly labeled.',
    sections: [{ id: 'observed-changes', title: 'Compared periods', count: changes.changes.length, items: changes.changes.map((change, index) => {
      const sourceActionId = `ownership-cost-change:${change.id}`;
      const decision = currentByAction.get(sourceActionId);
      return {
        id: change.id ?? `${change.category}-${index}`, entityType: 'OWNERSHIP_COST_CHANGE', title: change.label,
        description: `${change.explanation} Prior: ${moneyFromCents(change.priorAnnualCents)}. Current: ${moneyFromCents(change.currentAnnualCents)}. Change: ${change.deltaCents >= 0 ? '+' : ''}${moneyFromCents(change.deltaCents)}.`,
        status: decision?.lifecycleState ?? (change.materiality.material ? 'MATERIAL' : 'OBSERVED'),
        meta: [change.impact.toLowerCase(), change.confidence.toLowerCase() + ' confidence', change.explanationStatus.toLowerCase()],
        actions: canChange ? [
          ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_ACCEPT, decision?.destination?.label ?? 'Take action', change.id ?? '', 'PRIMARY'),
          ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_SAVE, 'Save', change.id ?? ''),
          ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_SNOOZE, 'Snooze', change.id ?? ''),
          ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_NO_ACTION, 'No action', change.id ?? ''),
          ...(decision ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_RESOLVE, 'Resolve', change.id ?? ''), ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_DISMISS, 'Dismiss', change.id ?? '')] : []),
          ...(decision && ['RESOLVED', 'DISMISSED', 'NO_ACTION'].includes(decision.lifecycleState) ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CHANGE_REOPEN, 'Reopen', change.id ?? '')] : []),
          { ...viewAction('current', categoryReview[change.category].label), operationId: categoryReview[change.category].operationId, message: categoryReview[change.category].message, id: `ownership-cost-review-${change.category.toLowerCase()}` },
        ] : [{ ...viewAction('current', categoryReview[change.category].label), operationId: categoryReview[change.category].operationId, message: categoryReview[change.category].message, id: `ownership-cost-review-${change.category.toLowerCase()}` }],
      };
    }) }], actions: [],
  });
  blocks.push({
    type: 'GROUPED_LIST', id: 'ownership-cost-notifications', title: 'Reminders and revisit events', description: decisions.lifecycleRule, filters: [],
    sections: [{ id: 'ownership-cost-notification-preferences', title: 'Reminder preferences', count: 4, items: (Object.entries(decisions.notificationPreferences) as Array<[keyof typeof decisions.notificationPreferences, boolean]>).map(([type, enabled]) => ({
      id: type, entityType: 'OWNERSHIP_COST_NOTIFICATION', title: codeLabel(type), description: enabled ? 'Enabled' : 'Disabled', status: enabled ? 'ON' : 'OFF', meta: [],
      actions: canChange ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.TOGGLE_NOTIFICATION, enabled ? 'Turn off' : 'Turn on', `${type}:${String(!enabled)}`)] : undefined,
    })) }], actions: [],
  });
  blocks.push(ownershipViewSwitcher('changes'));
  blocks.push({ type: 'BOUNDARY', id: 'ownership-cost-change-boundary', title: 'Observed comparison', body: changes.limitations.join(' ') || 'Changes compare recorded periods with stable category definitions; unexplained changes are not presented as facts.', severity: 'INFO', suggestions: [] });
  return { status: changes.comparable ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: changes.comparable ? undefined : 'OWNERSHIP_COST_HISTORY_LIMITED', blocks, suggestions: [] };
}

async function ownershipForecastResult(userId: string, propertyId: string, lens: OwnershipCostCurrentLens, message: string): Promise<AskOperationResult> {
  const requested = Number(message.match(/\b(1|3|5|10)[ -]year\b/i)?.[1] ?? 5);
  const horizonYears = [1, 3, 5, 10].includes(requested) ? requested : 5;
  const [forecast, scenarios, access] = await Promise.all([
    ownershipCostForecastService.getForecast(propertyId, userId, lens, horizonYears),
    ownershipCostForecastService.listScenarios(propertyId, userId),
    ensurePropertyAccess(userId, propertyId),
  ]);
  const canChange = access.role !== HouseholdRole.VIEWER;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'ownership-cost-forecast-summary', title: `The ${horizonYears}-year base case reaches ${moneyFromCents(forecast.summary.endYear.baseCents)}`,
    body: `The planning range is ${moneyFromCents(forecast.summary.endYear.lowCents)} to ${moneyFromCents(forecast.summary.endYear.highCents)}. It begins after the latest recorded period and is shown in nominal dollars.`,
    tone: forecast.stale.isStale ? 'CAUTION' : 'DEFAULT', actions: [],
  }, {
    type: 'TABLE', id: 'ownership-cost-forecast-periods', title: 'Annual planning range', description: 'Low, base and high forward scenarios.', preferredPresentation: 'TABLE',
    columns: [{ key: 'year', label: 'Year' }, { key: 'low', label: 'Low' }, { key: 'base', label: 'Base' }, { key: 'high', label: 'High' }],
    rows: forecast.periods.map((period) => ({ id: String(period.year), values: { year: String(period.year), low: moneyFromCents(period.lowCents), base: moneyFromCents(period.baseCents), high: moneyFromCents(period.highCents) } })), actions: [],
  }, {
    type: 'GROUPED_LIST', id: 'ownership-cost-forecast-drivers', title: 'What drives the range', description: 'Ranked by sensitivity at the selected horizon.', filters: [],
    sections: [{ id: 'forecast-drivers', title: 'Drivers', count: forecast.drivers.length, items: forecast.drivers.map((driver) => ({ id: driver.category, entityType: 'OWNERSHIP_COST_CATEGORY', title: driver.label, description: `${driver.rateSourceLabel} Annual rate: ${(driver.lowRate * 100).toFixed(1)}% / ${(driver.baseRate * 100).toFixed(1)}% / ${(driver.highRate * 100).toFixed(1)}%. Horizon sensitivity: ${moneyFromCents(driver.sensitivityCents)}.`, status: driver.rateSource.replace(/_/g, ' '), meta: driver.knownEvents.slice(0, 3).map((event) => `${event.year}: ${event.label}`) })) }], actions: [],
  }];
  if (canChange) blocks.push({
    type: 'GROUPED_LIST', id: 'ownership-cost-forecast-actions', title: 'Forecast actions', description: 'Save the current range or create a named scenario with a bounded category assumption.', filters: [],
    sections: [{ id: 'forecast-actions', title: 'Next steps', count: 2, items: [
      { id: 'save-forecast', entityType: 'OWNERSHIP_COST_FORECAST', title: forecast.forecastId ? 'Recalculate the saved forecast' : 'Save this forecast', description: `${horizonYears}-year ${lens === 'CASH_OUTFLOW' ? 'cash outflow' : 'operating expense'} range.`, meta: [], actions: [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.SAVE_FORECAST, forecast.forecastId ? 'Recalculate' : 'Save forecast', `${lens}:${horizonYears}`, 'PRIMARY')] },
      { id: 'create-scenario', entityType: 'OWNERSHIP_COST_SCENARIO', title: 'Save a planning scenario', description: 'Name and compare a bounded category growth or annual adjustment assumption.', meta: [], actions: [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CREATE_SCENARIO, 'Save a scenario', `${lens}:${horizonYears}`, 'PRIMARY')] },
    ] }], actions: [],
  });
  if (scenarios.length) blocks.push({
    type: 'GROUPED_LIST', id: 'ownership-cost-scenarios', title: 'Saved scenarios', description: 'Saved scenarios retain their base snapshot; stale scenarios are labeled.', filters: [],
    sections: [{ id: 'saved-scenarios', title: 'Compare', count: scenarios.length, items: scenarios.map((scenario) => ({ id: scenario.id, entityType: 'OWNERSHIP_COST_SCENARIO', title: scenario.name, description: `${scenario.forecast.horizonYears}-year base ${moneyFromCents(scenario.forecast.summary.endYear.baseCents)}; range ${moneyFromCents(scenario.forecast.summary.endYear.lowCents)} – ${moneyFromCents(scenario.forecast.summary.endYear.highCents)}.${scenario.staleReason ? ` ${scenario.staleReason}` : ''}`, status: scenario.isStale ? 'STALE' : scenario.status, meta: [], actions: canChange ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.RENAME_SCENARIO, 'Rename', scenario.id), ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.ARCHIVE_SCENARIO, 'Archive', scenario.id), ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.DELETE_SCENARIO, 'Delete', scenario.id)] : undefined })) }], actions: [],
  });
  blocks.push(ownershipViewSwitcher('forecast'));
  blocks.push({ type: 'BOUNDARY', id: 'ownership-cost-forecast-boundary', title: 'Planning range, not a prediction', body: forecast.disclaimer || forecast.limitations.join(' '), severity: 'INFO', suggestions: [] });
  return { status: forecast.stale.isStale ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: forecast.stale.isStale ? 'OWNERSHIP_COST_FORECAST_STALE' : undefined, blocks, suggestions: [] };
}

async function ownershipBufferResult(userId: string, propertyId: string, lens: OwnershipCostCurrentLens): Promise<AskOperationResult> {
  const [variability, access] = await Promise.all([ownershipCostVariabilityService.getVariability(propertyId, userId, lens), ensurePropertyAccess(userId, propertyId)]);
  const canChange = access.role !== HouseholdRole.VIEWER;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'ownership-cost-buffer-summary', title: `A monthly planning buffer of ${moneyFromCents(variability.planningBuffer.monthlyCashBufferCents)}`,
    body: `The separately tracked capital reserve is ${moneyFromCents(variability.planningBuffer.capitalReserveCents)}. ${variability.eligibility.reason}`,
    tone: variability.eligibility.eligible ? 'DEFAULT' : 'CAUTION', actions: [],
  }];
  if (variability.measured.periods.length) blocks.push({
    type: 'TABLE', id: 'ownership-cost-observed-variability', title: 'Observed annual periods', description: 'Recurring and one-time capital amounts remain separate.', preferredPresentation: 'TABLE',
    columns: [{ key: 'year', label: 'Year' }, { key: 'recurring', label: 'Recurring' }, { key: 'capital', label: 'One-time capital' }],
    rows: variability.measured.periods.map((period) => ({ id: period.snapshotId, values: { year: String(period.year), recurring: moneyFromCents(period.recurringCents), capital: moneyFromCents(period.oneTimeCents) } })), actions: [],
  });
  blocks.push({
    type: 'GROUPED_LIST', id: 'ownership-cost-buffer-options', title: 'Planning options', description: 'Continue in Ask with the canonical owner of each planning decision.', filters: [],
    sections: [{ id: 'buffer-options', title: 'Next steps', count: 2, items: [
      { id: 'monthly-buffer', entityType: 'OWNERSHIP_COST_BUFFER', title: 'Monthly cash buffer', description: `${moneyFromCents(variability.planningBuffer.monthlyCashBufferCents)} based on the forward scenario range.`, meta: [], actions: canChange && variability.planningBuffer.monthlyHandoff.enabled ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.MONTHLY_BUFFER, 'Use this monthly buffer', `${lens}:MONTHLY_CASH_BUFFER`, 'PRIMARY')] : undefined },
      { id: 'capital-reserve', entityType: 'OWNERSHIP_COST_BUFFER', title: 'Capital reserve', description: `${moneyFromCents(variability.planningBuffer.capitalReserveCents)} for supported upcoming capital needs.`, meta: [], actions: canChange && variability.planningBuffer.capitalHandoff.enabled ? [ownershipCommandAction(OWNERSHIP_COST_ACTION_IDS.CAPITAL_RESERVE, 'Use this capital reserve', `${lens}:CAPITAL_RESERVE`, 'PRIMARY')] : undefined },
    ] }], actions: [],
  });
  blocks.push(ownershipViewSwitcher('variability'));
  blocks.push({ type: 'BOUNDARY', id: 'ownership-cost-buffer-boundary', title: 'Scenario-based planning support', body: `${variability.planningBuffer.nonDuplicationRule} ${variability.limitations.join(' ')}`, severity: 'INFO', suggestions: [] });
  return { status: variability.eligibility.eligible ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: variability.eligibility.eligible ? undefined : 'OWNERSHIP_COST_VARIABILITY_LIMITED', blocks, suggestions: [] };
}

async function ownershipCostsResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const lens = ownershipCostLens(message);
  const view = ownershipView(message);
  if (view === 'changes') return ownershipChangesResult(userId, propertyId, lens);
  if (view === 'forecast') return ownershipForecastResult(userId, propertyId, lens, message);
  if (view === 'variability') return ownershipBufferResult(userId, propertyId, lens);
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
    if (/\brefresh\b/i.test(message)) await ownershipCostChangeService.refreshObservedChanges(propertyId, userId, lens);
  } catch {
    return {
      status: captureRequests.length ? 'NEEDS_CONTEXT' : 'UNAVAILABLE',
      reasonCode: captureRequests.length ? 'OWNERSHIP_COST_CONTEXT_REQUIRED' : 'OWNERSHIP_COST_SNAPSHOT_UNAVAILABLE',
      contextVersion: context.contextVersion,
      captureRequests,
      blocks: [{
        type: 'SUMMARY', id: 'ownership-costs-unavailable', title: 'A current ownership-cost total is not ready yet',
        body: 'Ask could not load a canonical ownership-cost snapshot. Missing categories are not treated as zero. Improve the home context below, then ask again.',
        tone: 'CAUTION',
        actions: [],
      }],
      suggestions: [],
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
    // This answer already contains the current canonical ownership-cost
    // review. Do not duplicate it with a desktop navigation CTA.
    actions: [],
  }, {
    type: 'TABLE', id: 'ownership-cost-categories', title: 'Cost by category',
    description: `Categories included in the ${lensLabel} lens, ordered by annual amount.`,
    preferredPresentation: 'TABLE',
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
      type: 'GROUPED_LIST', id: 'ownership-cost-missing', title: 'Information that could improve this total',
      description: 'These categories are applicable or unresolved, but no amount is currently included.',
      filters: [], sections: [{ id: 'missing-cost-categories', title: 'Missing categories', count: missing.length, items: missing.map((category) => {
        const review = categoryReview[category.category];
        return {
          id: category.category, entityType: 'OWNERSHIP_COST_CATEGORY', title: category.label,
          description: category.missingDependencies.length ? category.missingDependencies.join(' · ') : 'No usable current amount is recorded.',
          status: 'MISSING', meta: [],
          actions: [{ id: `ownership-cost-review-${category.category.toLowerCase()}`, label: review.label, interactionType: 'CONVERSATION_CONTINUE', message: review.message, operationId: review.operationId, style: 'PRIMARY' }],
        };
      }) }], actions: [],
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
  blocks.push(ownershipViewSwitcher('current'));
  blocks.push({
    type: 'SUMMARY', id: 'ownership-cost-refresh', title: 'Refresh source records',
    body: 'Re-read canonical property-tax, coverage, financing, utility, HOA, maintenance, service, project and reserve sources.', tone: 'DEFAULT',
    actions: [{ id: 'ownership-cost-refresh-sources', label: 'Refresh sources', interactionType: 'START_WORKFLOW', message: `Refresh my ${lens === 'CASH_OUTFLOW' ? 'cash outflow' : 'operating expense'} ownership cost sources`, operationId: 'OWNERSHIP_COSTS', style: 'SECONDARY' }],
  });
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
    suggestions: [],
  };
}

registerCapabilityHandler('savings.opportunities', async (envelope) => savingsOpportunitiesResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('ownership.costs', async (envelope) => ownershipCostsResult(envelope.userId, envelope.propertyId!, envelope.message));
