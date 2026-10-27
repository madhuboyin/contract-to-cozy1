import { createHash, randomUUID } from 'node:crypto';
import { HouseholdRole, RefinanceDecisionStatus, RefinanceScenarioTerm } from '@prisma/client';
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { RefinanceRadarService } from '../../../refinanceRadar/refinanceRadar.service';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { getRefinanceAlertPreference, updateRefinanceAlertPreference } from '../../../refinanceRadar/refinanceAlertPreference.service';
import { deleteSavedRefinanceLoanEstimateComparison, listSavedRefinanceLoanEstimateComparisons, saveRefinanceLoanEstimateComparison } from '../../../refinanceRadar/refinanceLoanEstimateSnapshot.service';
import { assertRefinanceDecisionTransition, getCurrentRefinanceDecision, recordRefinanceDecision } from '../../../refinanceRadar/refinanceDecision.service';
import { parseRefinanceScenarioEdit } from './refinance.handler';
import { compareLoanEstimatesSchema } from '../../../refinanceRadar/validators/refinanceRadar.validators';
import { REFINANCE_CAPTURE_KEYS, refinanceOfferFromAnswer, REFINANCE_NO_LINK, parseRefinanceCommandAnswer, refinanceAlertAnswerSchema, refinanceComparisonAnswerSchema, refinanceDecisionAnswerSchema, refinanceFormKindFromCaptureKey, refinanceKindFromAction, type RefinanceCommandKind, type RefinanceFormKind } from '../support/refinanceCommand';

const radar = new RefinanceRadarService();
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'refinance-command-back', label: 'Review refinance outlook', interactionType: 'START_WORKFLOW' as const, operationId: 'REFINANCE_ANALYSIS' as const, message: 'Is refinancing worth reviewing now?', style: 'PRIMARY' as const };

async function commandVersion(userId: string, propertyId: string) {
  const [context, preference, decision, comparisons, scenarios] = await Promise.all([
    getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR'), getRefinanceAlertPreference(userId, propertyId),
    getCurrentRefinanceDecision(propertyId), listSavedRefinanceLoanEstimateComparisons(propertyId), radar.getSavedScenarios(propertyId),
  ]);
  return sha({ context: context.contextVersion, preference, decision: decision && { id: decision.id, version: decision.version, status: decision.status }, comparisons: comparisons.map((item) => [item.id, item.updatedAt]), scenarios: scenarios.map((item) => item.id) });
}

export interface DecisionLinkOptions {
  scenarios: Array<{ value: string; label: string }>;
  comparisons: Array<{ value: string; label: string; offerIds: string[] }>;
  offers: Array<{ value: string; label: string; comparisonId: string }>;
}
const TERM_LABELS: Record<string, string> = { THIRTY_YEAR: '30-year', TWENTY_YEAR: '20-year', FIFTEEN_YEAR: '15-year', TEN_YEAR: '10-year' };
/** The saved scenarios and Loan Estimate comparisons (and their offers) a decision can rest on, as plain labels; ids are what is stored. */
export async function loadDecisionLinkOptions(propertyId: string): Promise<DecisionLinkOptions> {
  const [scenarios, comparisons] = await Promise.all([radar.getSavedScenarios(propertyId), listSavedRefinanceLoanEstimateComparisons(propertyId)]);
  return {
    scenarios: scenarios.map((item) => ({ value: item.id, label: `${TERM_LABELS[item.targetTerm] ?? String(item.targetTerm).replace(/_/g, ' ').toLowerCase()} at ${item.targetRatePct.toFixed(3)}% (saved ${item.createdAt.slice(0, 10)})` })),
    comparisons: comparisons.map((item) => ({ value: item.id, label: item.label || `Comparison from ${item.createdAt.slice(0, 10)}`, offerIds: item.offers.map((offer) => offer.id) })),
    offers: comparisons.flatMap((item) => item.offers.map((offer) => ({ value: offer.id, label: `${offer.lenderName} (${item.label || item.createdAt.slice(0, 10)})`, comparisonId: item.id }))),
  };
}

export function fieldsFor(kind: RefinanceFormKind, links?: DecisionLinkOptions) {
  const text = (key: string, label: string, required = false) => ({ key, label, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 2000 } });
  const number = (key: string, label: string, required = false, min = 0, max = 100_000_000) => ({ key, label, required, inputSchema: { type: 'NUMBER' as const, min, max } });
  const bool = (key: string, label: string) => ({ key, label, required: true, inputSchema: { type: 'BOOLEAN' as const } });
  const select = (key: string, label: string, options: string[]) => ({ key, label, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((value) => ({ value, label: value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) })) } });
  if (kind === 'ALERT_SETTINGS') return [bool('emailEnabled', 'Email alerts'), bool('pushEnabled', 'Push alerts'), select('cadence', 'Cadence', ['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_BRIEF', 'MUTED']), select('sensitivity', 'Sensitivity', ['EARLY', 'CONSERVATIVE', 'BALANCED']), text('quietStart', 'Quiet hours start (HH:mm)', true), text('quietEnd', 'Quiet hours end (HH:mm)', true), text('timezone', 'Timezone', true)];
  const noLink = (label: string) => ({ value: REFINANCE_NO_LINK, label });
  const optionalSelect = (key: string, label: string, options: Array<{ value: string; label: string }>) => ({ key, label, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options } });
  if (kind === 'RECORD_DECISION') return [select('status', 'Decision', ['EXPLORING', 'DEFERRED', 'KEEP_CURRENT_LOAN', 'PROCEEDING', 'OFFER_SELECTED', 'APPLICATION_IN_PROGRESS', 'DECLINED', 'ABANDONED', 'CLOSED']), text('rationale', 'Reason or note'), text('nextReviewAt', 'Review again (ISO date and time)'), number('currentMortgageBalanceUsd', 'New mortgage balance ($)'), number('interestRatePct', 'New interest rate (%)', false, 0.01, 30), number('remainingTermMonths', 'New remaining term (months)', false, 1, 600), number('monthlyPaymentUsd', 'New monthly payment ($)'), number('closingCostUsd', 'Recorded closing costs ($)'),
    ...(links?.scenarios.length ? [optionalSelect('scenarioSnapshotId', 'Saved scenario this rests on', [...links.scenarios, noLink('No linked scenario')])] : []),
    ...(links?.comparisons.length ? [optionalSelect('loanEstimateComparisonId', 'Saved Loan Estimate comparison', [...links.comparisons.map(({ value, label }) => ({ value, label })), noLink('No linked comparison (also removes the offer)')])] : []),
    ...(links?.offers.length ? [optionalSelect('selectedOfferId', 'Offer you selected or are leaning toward (from that comparison)', [...links.offers.map(({ value, label }) => ({ value, label })), noLink('No selected offer')])] : [])];
  const offerFields = (p: 'a' | 'b', label: string) => [text(`${p}Lender`, `${label} lender`, true), number(`${p}Amount`, `${label} loan amount ($)`, true, 1000), number(`${p}TermYears`, `${label} term (years)`, true, 1, 50), select(`${p}LoanType`, `${label} loan type`, ['FIXED', 'ARM', 'OTHER']), number(`${p}Rate`, `${label} note rate (%)`, true, 0.01, 30), number(`${p}Apr`, `${label} APR (%)`, true, 0.01, 30), number(`${p}MonthlyPI`, `${label} monthly principal and interest ($)`, true, 1), number(`${p}MonthlyMI`, `${label} monthly mortgage insurance ($)`), number(`${p}TotalPayment`, `${label} estimated total payment ($)`), number(`${p}DiscountPointsPct`, `${label} discount points (% of the loan)`, false, 0, 10), number(`${p}DiscountPointsUsd`, `${label} discount points ($)`), number(`${p}FiveYearTotalPaid`, `${label} total paid in the first 5 years ($)`), number(`${p}FiveYearPrincipalPaid`, `${label} principal paid in the first 5 years ($)`), text(`${p}IssuedDate`, `${label} issued date (YYYY-MM-DD)`), number(`${p}LoanCosts`, `${label} loan costs ($)`, true), number(`${p}LenderCredits`, `${label} lender credits ($)`, true), number(`${p}CashToClose`, `${label} cash to close ($)`, true), select(`${p}CashDirection`, `${label} cash direction`, ['FROM_BORROWER', 'TO_BORROWER', 'UNKNOWN'])];
  return [text('label', 'Comparison label'), ...offerFields('a', 'Offer 1'), ...offerFields('b', 'Offer 2')];
}

function capture(kind: RefinanceFormKind, version: string, currentAnswer: Record<string, unknown>, links?: DecisionLinkOptions): AskCaptureRequest {
  const title = kind === 'ALERT_SETTINGS' ? 'Refinance alert settings' : kind === 'ADD_COMPARISON' ? 'Compare two official Loan Estimates' : 'Record your refinance decision';
  return { requirementId: `refinance-${kind.toLowerCase()}-inputs`, captureKey: REFINANCE_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title,
    question: kind === 'ADD_COMPARISON' ? 'Enter the figures exactly as shown on two reviewed Loan Estimates.' : 'Review the values before continuing.',
    helpText: kind === 'ADD_COMPARISON' ? 'The comparison does not select a lender or transmit information. Nothing is saved until you confirm.' : 'Nothing changes until you confirm.',
    inputSchema: { type: 'GROUP', fields: fieldsFor(kind, links) } as AskCaptureRequest['inputSchema'], currentAnswer, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Saved to the canonical refinance records after confirmation', confirmationText: null, expectedContextVersion: version };
}

/** True when a link names a record this home does not have saved, or an offer that is not one of the chosen comparison's. */
export function decisionLinksUnavailable(data: { scenarioSnapshotId?: string | null; loanEstimateComparisonId?: string | null; selectedOfferId?: string | null }, links: DecisionLinkOptions): boolean {
  const comparison = links.comparisons.find((item) => item.value === data.loanEstimateComparisonId);
  return Boolean((data.scenarioSnapshotId && !links.scenarios.some((item) => item.value === data.scenarioSnapshotId))
    || (data.loanEstimateComparisonId && !comparison)
    || (data.selectedOfferId && !comparison?.offerIds.includes(data.selectedOfferId)));
}

/** What the decision confirmation shows: the status, the note, any link by its label, and the closing figures when the refinance closed. */
export function decisionConfirmationFields(supplied: Record<string, unknown>, links?: DecisionLinkOptions, current?: { scenarioSnapshotId: string | null; loanEstimateComparisonId: string | null; selectedOfferId: string | null } | null): Array<{ label: string; value: string }> {
  const parsed = refinanceDecisionAnswerSchema.safeParse(supplied);
  if (!parsed.success) return [];
  const d = parsed.data;
  const label = (list: Array<{ value: string; label: string }> | undefined, id?: string | null) => list?.find((item) => item.value === id)?.label;
  // A link left blank stays as saved; a link set to "none" is removed. Say which, so the confirmation never hides what will remain.
  const link = (name: string, patch: string | null | undefined, saved: string | null | undefined, list: Array<{ value: string; label: string }> | undefined, fallback: string) => {
    if (patch === null) return saved ? [{ label: name, value: 'Removed' }] : [];
    const id = patch ?? saved;
    return id ? [{ label: name, value: `${label(list, id) ?? fallback}${patch === undefined ? ' (kept as saved)' : ''}` }] : [];
  };
  const comparisonChanged = d.loanEstimateComparisonId !== undefined && (d.loanEstimateComparisonId ?? null) !== (current?.loanEstimateComparisonId ?? null);
  const offerDropped = current?.selectedOfferId && d.selectedOfferId === undefined && (d.loanEstimateComparisonId === null || comparisonChanged);
  return [
    { label: 'Decision', value: d.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) },
    ...(d.rationale ? [{ label: 'Note', value: d.rationale }] : []),
    ...link('Saved scenario', d.scenarioSnapshotId, current?.scenarioSnapshotId, links?.scenarios, 'Linked scenario'),
    ...link('Loan Estimate comparison', d.loanEstimateComparisonId, current?.loanEstimateComparisonId, links?.comparisons, 'Linked comparison'),
    ...(offerDropped ? [{ label: 'Offer', value: 'Removed (it belonged to the earlier comparison)' }] : link('Offer', d.selectedOfferId, current?.selectedOfferId, links?.offers, 'Selected offer')),
    ...(d.status === 'CLOSED' ? [{ label: 'New loan', value: `$${Number(d.currentMortgageBalanceUsd).toLocaleString('en-US')} at ${d.interestRatePct}% for ${d.remainingTermMonths} months` }, { label: 'Financing Profile', value: 'Updated with these figures after you confirm' }] : []),
  ];
}

function summary(title: string, body: string): AskOperationResult['blocks'][number] { return { type: 'SUMMARY', id: 'refinance-command-summary', title, body, tone: 'DEFAULT', actions: [] }; }

export async function refinanceCommandResult(userId: string, propertyId: string, kind: RefinanceCommandKind, entityId: string | null, message: string, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [summary('A contributor or owner is required', 'You can review this information, but your role cannot change refinance records or notification settings.')], suggestions: [] };
  const version = await commandVersion(userId, propertyId);
  const formKind = kind === 'ALERT_SETTINGS' || kind === 'ADD_COMPARISON' || kind === 'RECORD_DECISION' ? kind : null;
  if (formKind && !supplied) {
    const preference = formKind === 'ALERT_SETTINGS' ? await getRefinanceAlertPreference(userId, propertyId) : null;
    const decision = formKind === 'RECORD_DECISION' ? await getCurrentRefinanceDecision(propertyId) : null;
    const seed = preference ? { emailEnabled: preference.emailEnabled, pushEnabled: preference.pushEnabled, cadence: preference.cadence, sensitivity: preference.sensitivity, quietStart: preference.quietStart ?? '21:00', quietEnd: preference.quietEnd ?? '07:00', timezone: preference.timezone }
      : formKind === 'RECORD_DECISION' ? { status: decision?.status ?? 'EXPLORING', rationale: decision?.rationale ?? '', nextReviewAt: decision?.nextReviewAt ?? '', ...(decision?.scenarioSnapshotId ? { scenarioSnapshotId: decision.scenarioSnapshotId } : {}), ...(decision?.loanEstimateComparisonId ? { loanEstimateComparisonId: decision.loanEstimateComparisonId } : {}), ...(decision?.selectedOfferId ? { selectedOfferId: decision.selectedOfferId } : {}) } : {};
    const links = formKind === 'RECORD_DECISION' ? await loadDecisionLinkOptions(propertyId) : undefined;
    return { status: 'NEEDS_CONTEXT', reasonCode: `REFINANCE_${formKind}_INPUT_REQUIRED`, contextVersion: version, parameters: { refinanceLaunch: { kind, entityId, message } }, blocks: [summary('Review the refinance details', 'Enter the details below. You will see a confirmation before anything is saved.')], captureRequests: [capture(formKind, version, seed, links)], suggestions: [] };
  }
  if (formKind && supplied && !parseRefinanceCommandAnswer(formKind, supplied).success) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_COMMAND_INPUT_INVALID', blocks: [summary('Check the refinance details', 'Fill in the required fields and make sure the values match the official source.')], suggestions: [] };
  // The canonical Loan Estimate rules (five-year pair, point amounts, dates, ranges) are Desktop's schema; Ask's offers are held to the same ones before anything is confirmed.
  if (kind === 'ADD_COMPARISON' && supplied) {
    const canonical = compareLoanEstimatesSchema.safeParse({ offers: [refinanceOfferFromAnswer(supplied, 'a', 'a'), refinanceOfferFromAnswer(supplied, 'b', 'b')] });
    if (!canonical.success) {
      const issue = canonical.error.issues[0];
      const where = issue.path[0] === 'offers' ? `Offer ${Number(issue.path[1]) + 1}` : 'The comparison';
      return { status: 'NEEDS_CONTEXT', reasonCode: 'REFINANCE_COMPARISON_FIGURES_INVALID', contextVersion: version, parameters: { refinanceLaunch: { kind, entityId, message } },
        blocks: [{ type: 'SUMMARY', id: 'refinance-comparison-figures-invalid', title: 'Check these Loan Estimate figures', body: `${where}: ${issue.message} Nothing has been saved.`, tone: 'CAUTION', actions: [] }],
        captureRequests: [capture('ADD_COMPARISON', version, supplied)], suggestions: [] };
    }
  }
  // A decision's links must be this home's own saved records, and the offer must belong to the comparison chosen with it: refuse here, with the form kept.
  let decisionLinks: DecisionLinkOptions | undefined;
  let currentDecision: Awaited<ReturnType<typeof getCurrentRefinanceDecision>> = null;
  if (kind === 'RECORD_DECISION' && supplied) {
    [decisionLinks, currentDecision] = await Promise.all([loadDecisionLinkOptions(propertyId), getCurrentRefinanceDecision(propertyId)]);
    const answer = parseRefinanceCommandAnswer('RECORD_DECISION', supplied);
    const data = answer.success ? answer.data as { status?: RefinanceDecisionStatus; scenarioSnapshotId?: string | null; loanEstimateComparisonId?: string | null; selectedOfferId?: string | null } : {};
    const cautionForm = (reasonCode: string, id: string, title: string, body: string): AskOperationResult => ({ status: 'NEEDS_CONTEXT', reasonCode, contextVersion: version, parameters: { refinanceLaunch: { kind, entityId, message } },
      blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] }], captureRequests: [capture('RECORD_DECISION', version, supplied, decisionLinks)], suggestions: [] });
    if (decisionLinksUnavailable(data, decisionLinks)) return cautionForm('REFINANCE_DECISION_LINK_UNAVAILABLE', 'refinance-decision-link-missing', 'One of those saved records is not available', 'Choose a saved scenario, a saved comparison, and an offer from that comparison, or leave them blank. Nothing has been saved.');
    // The same transition rule the canonical service enforces, checked before the confirmation so a move it would refuse never reaches one.
    if (data.status) {
      try { assertRefinanceDecisionTransition(currentDecision?.status ?? null, data.status); } catch {
        return cautionForm('REFINANCE_DECISION_TRANSITION_INVALID', 'refinance-decision-transition-invalid', 'That step does not follow from where this decision is', currentDecision ? `A decision that is ${currentDecision.status.replace(/_/g, ' ').toLowerCase()} cannot move straight to ${data.status.replace(/_/g, ' ').toLowerCase()}. Choose the next step in order. Nothing has been saved.` : 'A refinance decision starts as exploring, deferred, keeping the current loan, or proceeding. Nothing has been saved.');
      }
    }
  }
  if (kind === 'DELETE_COMPARISON' && !entityId) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_COMPARISON_NOT_FOUND', blocks: [summary('That saved comparison is no longer available', 'Nothing was deleted.')], suggestions: [] };
  const scenario = kind === 'SAVE_SCENARIO' ? parseRefinanceScenarioEdit(message) : null;
  if (kind === 'SAVE_SCENARIO' && !scenario?.targetRatePct) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_SCENARIO_INVALID', blocks: [summary('The scenario could not be saved', 'Run a scenario with a target rate first, then choose Save.')], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const title = kind === 'ALERT_SETTINGS' ? 'Save these alert settings?' : kind === 'ADD_COMPARISON' ? 'Save and compare these Loan Estimates?' : kind === 'RECORD_DECISION' ? 'Record this refinance decision?' : kind === 'DELETE_COMPARISON' ? 'Permanently delete this comparison?' : 'Save this refinance scenario?';
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'REFINANCE_COMMAND_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { refinanceCommand: { kind, entityId, message }, refinanceForm: supplied ?? null, refinanceContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [summary(title, 'Nothing changes until you confirm.')], captureRequests: formKind ? [capture(formKind, version, supplied!, decisionLinks)] : [],
    confirmation: { confirmationId: `refinance-${sha({ kind, entityId, supplied, message }).slice(0, 16)}`, version: 1, title, description: kind === 'ADD_COMPARISON' ? 'This stores the reviewed figures and compares disclosed metrics without choosing or contacting a lender.' : 'The canonical refinance record will be updated only after confirmation.', fields: kind === 'RECORD_DECISION' ? decisionConfirmationFields(supplied!, decisionLinks, currentDecision) : [], editableFields: [], confirmLabel: kind === 'DELETE_COMPARISON' ? 'Delete permanently' : 'Confirm', consentText: 'I reviewed these refinance details and authorize this change.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('refinance.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = refinanceKindFromAction(launch?.actionId);
  if (!kind || launch?.operationId !== 'REFINANCE_COMMAND' || launch.surface === 'ASK_REFRESH') return { status: 'NOT_APPLICABLE', reasonCode: 'ASK_REFINANCE_COMMAND_NOT_DIRECTLY_ROUTABLE', blocks: [summary('Start from your refinance outlook', 'Choose an action from the current refinance answer so the exact context is preserved.')], suggestions: [] };
  return refinanceCommandResult(envelope.userId, envelope.propertyId!, kind, launch.entityId ?? null, envelope.message);
});

const DECISION_LINK_ERRORS = new Set(['REFINANCE_SCENARIO_NOT_FOUND', 'REFINANCE_COMPARISON_NOT_FOUND', 'REFINANCE_SELECTED_OFFER_NOT_FOUND']);
/** A saved record the decision names can disappear between review and confirmation; say so as an out-of-date confirmation, not a server error. */
async function confirmRefinanceCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  try {
    return await confirmRefinanceCommandUnchecked(ctx);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && DECISION_LINK_ERRORS.has(code)) throw stale('A saved record this decision rests on is no longer available. Review the decision again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    throw error;
  }
}

async function confirmRefinanceCommandUnchecked(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.refinanceCommand as { kind?: RefinanceCommandKind; entityId?: string | null; message?: string } | undefined;
  if (!command?.kind) throw stale('The refinance change is no longer active.');
  if (parameters.refinanceContextVersion !== await commandVersion(userId, execution.propertyId)) throw stale('The refinance data changed while this confirmation was open. Review it again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const form = (parameters.refinanceForm ?? {}) as Record<string, unknown>;
  let title = 'Refinance record updated';
  if (command.kind === 'ALERT_SETTINGS') {
    const parsed = refinanceAlertAnswerSchema.safeParse(form); if (!parsed.success) throw stale('The alert settings are invalid.');
    await updateRefinanceAlertPreference(userId, execution.propertyId, parsed.data); title = 'Alert settings saved';
  } else if (command.kind === 'ADD_COMPARISON') {
    const parsed = refinanceComparisonAnswerSchema.safeParse(form); if (!parsed.success) throw stale('The Loan Estimate figures are invalid.'); const d = parsed.data as Record<string, unknown>;
    const offer = (p: 'a' | 'b') => refinanceOfferFromAnswer(d, p, `${p}-${randomUUID()}`);
    await saveRefinanceLoanEstimateComparison({ propertyId: execution.propertyId, label: typeof d.label === 'string' ? d.label : undefined, offers: [offer('a'), offer('b')] }); title = 'Loan Estimates compared and saved';
  } else if (command.kind === 'DELETE_COMPARISON') {
    if (!command.entityId || !await deleteSavedRefinanceLoanEstimateComparison(execution.propertyId, command.entityId)) throw stale('That saved comparison is no longer available.'); title = 'Saved comparison deleted';
  } else if (command.kind === 'RECORD_DECISION') {
    const parsed = refinanceDecisionAnswerSchema.safeParse(form); if (!parsed.success) throw stale('The decision details are invalid.'); const d = parsed.data;
    const current = await getCurrentRefinanceDecision(execution.propertyId);
    await recordRefinanceDecision({ propertyId: execution.propertyId, userId, body: { status: d.status as RefinanceDecisionStatus, clientMutationId: `ask-refinance-${execution.id}`, ...(current ? { expectedVersion: current.version } : {}), ...(d.rationale ? { rationale: d.rationale } : {}), ...(d.scenarioSnapshotId !== undefined ? { scenarioSnapshotId: d.scenarioSnapshotId } : {}), ...(d.loanEstimateComparisonId !== undefined ? { loanEstimateComparisonId: d.loanEstimateComparisonId } : {}), ...(d.selectedOfferId !== undefined ? { selectedOfferId: d.selectedOfferId } : {}), ...(d.status === 'DEFERRED' && d.nextReviewAt ? { nextReviewAt: new Date(d.nextReviewAt).toISOString() } : {}), ...(d.status === 'CLOSED' ? { completedMortgage: { currentMortgageBalanceUsd: d.currentMortgageBalanceUsd!, interestRatePct: d.interestRatePct!, remainingTermMonths: d.remainingTermMonths!, ...(d.monthlyPaymentUsd != null ? { monthlyPaymentUsd: d.monthlyPaymentUsd } : {}), ...(d.closingCostUsd != null ? { closingCostUsd: d.closingCostUsd } : {}), mortgageBalanceAsOfDate: new Date().toISOString() } } : {}) } }); title = d.status === 'CLOSED' ? 'Refinance closed and Financing updated' : 'Refinance decision recorded';
  } else {
    const edit = parseRefinanceScenarioEdit(command.message ?? ''); if (!edit?.targetRatePct) throw stale('The scenario details are no longer available.');
    const context = await getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR');
    await radar.runScenario(execution.propertyId, { targetRate: edit.targetRatePct, targetTerm: edit.targetTerm ?? RefinanceScenarioTerm.THIRTY_YEAR, ...(edit.closingCostAmount != null ? { closingCostAmount: edit.closingCostAmount } : {}), borrowerCreditBand: edit.borrowerCreditBand, objective: edit.objective, saveScenario: true, propertyContextVersion: context.contextVersion }); title = 'Refinance scenario saved';
  }
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'REFINANCE_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `refinance-command-${execution.id}`, title, status: 'COMPLETED', description: 'The canonical refinance record now reflects this confirmed change.', details: [], actions: [back] }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters); if (refresh.attemptedAndFailed) result.blocks.push({ type: 'LIMITATION', id: 'refinance-command-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. Ask for your refinance outlook again to see the current state.' });
  return { result, artifactType: 'REFINANCE_SCENARIO', artifactId: command.entityId ?? execution.propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('refinance.command', confirmRefinanceCommand);

export { refinanceFormKindFromCaptureKey, parseRefinanceCommandAnswer };
