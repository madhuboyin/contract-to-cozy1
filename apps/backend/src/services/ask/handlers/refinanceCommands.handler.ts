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
import { getCurrentRefinanceDecision, recordRefinanceDecision } from '../../../refinanceRadar/refinanceDecision.service';
import { parseRefinanceScenarioEdit } from './refinance.handler';
import { REFINANCE_CAPTURE_KEYS, parseRefinanceCommandAnswer, refinanceAlertAnswerSchema, refinanceComparisonAnswerSchema, refinanceDecisionAnswerSchema, refinanceFormKindFromCaptureKey, refinanceKindFromAction, type RefinanceCommandKind, type RefinanceFormKind } from '../support/refinanceCommand';

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

function fieldsFor(kind: RefinanceFormKind) {
  const text = (key: string, label: string, required = false) => ({ key, label, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 2000 } });
  const number = (key: string, label: string, required = false, min = 0, max = 100_000_000) => ({ key, label, required, inputSchema: { type: 'NUMBER' as const, min, max } });
  const bool = (key: string, label: string) => ({ key, label, required: true, inputSchema: { type: 'BOOLEAN' as const } });
  const select = (key: string, label: string, options: string[]) => ({ key, label, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((value) => ({ value, label: value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) })) } });
  if (kind === 'ALERT_SETTINGS') return [bool('emailEnabled', 'Email alerts'), bool('pushEnabled', 'Push alerts'), select('cadence', 'Cadence', ['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_BRIEF', 'MUTED']), select('sensitivity', 'Sensitivity', ['EARLY', 'CONSERVATIVE', 'BALANCED']), text('quietStart', 'Quiet hours start (HH:mm)', true), text('quietEnd', 'Quiet hours end (HH:mm)', true), text('timezone', 'Timezone', true)];
  if (kind === 'RECORD_DECISION') return [select('status', 'Decision', ['EXPLORING', 'DEFERRED', 'KEEP_CURRENT_LOAN', 'PROCEEDING', 'APPLICATION_IN_PROGRESS', 'DECLINED', 'ABANDONED', 'CLOSED']), text('rationale', 'Reason or note'), text('nextReviewAt', 'Review again (ISO date and time)'), number('currentMortgageBalanceUsd', 'New mortgage balance ($)'), number('interestRatePct', 'New interest rate (%)', false, 0.01, 30), number('remainingTermMonths', 'New remaining term (months)', false, 1, 600), number('monthlyPaymentUsd', 'New monthly payment ($)'), number('closingCostUsd', 'Recorded closing costs ($)')];
  const offerFields = (p: 'a' | 'b', label: string) => [text(`${p}Lender`, `${label} lender`, true), number(`${p}Amount`, `${label} loan amount ($)`, true, 1000), number(`${p}TermYears`, `${label} term (years)`, true, 1, 50), select(`${p}LoanType`, `${label} loan type`, ['FIXED', 'ARM', 'OTHER']), number(`${p}Rate`, `${label} note rate (%)`, true, 0.01, 30), number(`${p}Apr`, `${label} APR (%)`, true, 0.01, 30), number(`${p}MonthlyPI`, `${label} monthly principal and interest ($)`, true, 1), number(`${p}MonthlyMI`, `${label} monthly mortgage insurance ($)`), number(`${p}TotalPayment`, `${label} estimated total payment ($)`), number(`${p}LoanCosts`, `${label} loan costs ($)`, true), number(`${p}LenderCredits`, `${label} lender credits ($)`, true), number(`${p}CashToClose`, `${label} cash to close ($)`, true), select(`${p}CashDirection`, `${label} cash direction`, ['FROM_BORROWER', 'TO_BORROWER', 'UNKNOWN'])];
  return [text('label', 'Comparison label'), ...offerFields('a', 'Offer 1'), ...offerFields('b', 'Offer 2')];
}

function capture(kind: RefinanceFormKind, version: string, currentAnswer: Record<string, unknown>): AskCaptureRequest {
  const title = kind === 'ALERT_SETTINGS' ? 'Refinance alert settings' : kind === 'ADD_COMPARISON' ? 'Compare two official Loan Estimates' : 'Record your refinance decision';
  return { requirementId: `refinance-${kind.toLowerCase()}-inputs`, captureKey: REFINANCE_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title,
    question: kind === 'ADD_COMPARISON' ? 'Enter the figures exactly as shown on two reviewed Loan Estimates.' : 'Review the values before continuing.',
    helpText: kind === 'ADD_COMPARISON' ? 'The comparison does not select a lender or transmit information. Nothing is saved until you confirm.' : 'Nothing changes until you confirm.',
    inputSchema: { type: 'GROUP', fields: fieldsFor(kind) } as AskCaptureRequest['inputSchema'], currentAnswer, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Saved to the canonical refinance records after confirmation', confirmationText: null, expectedContextVersion: version };
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
      : formKind === 'RECORD_DECISION' ? { status: decision?.status ?? 'EXPLORING', rationale: decision?.rationale ?? '', nextReviewAt: decision?.nextReviewAt ?? '' } : {};
    return { status: 'NEEDS_CONTEXT', reasonCode: `REFINANCE_${formKind}_INPUT_REQUIRED`, contextVersion: version, parameters: { refinanceLaunch: { kind, entityId, message } }, blocks: [summary('Review the refinance details', 'Enter the details below. You will see a confirmation before anything is saved.')], captureRequests: [capture(formKind, version, seed)], suggestions: [] };
  }
  if (formKind && supplied && !parseRefinanceCommandAnswer(formKind, supplied).success) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_COMMAND_INPUT_INVALID', blocks: [summary('Check the refinance details', 'Fill in the required fields and make sure the values match the official source.')], suggestions: [] };
  if (kind === 'DELETE_COMPARISON' && !entityId) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_COMPARISON_NOT_FOUND', blocks: [summary('That saved comparison is no longer available', 'Nothing was deleted.')], suggestions: [] };
  const scenario = kind === 'SAVE_SCENARIO' ? parseRefinanceScenarioEdit(message) : null;
  if (kind === 'SAVE_SCENARIO' && !scenario?.targetRatePct) return { status: 'NOT_APPLICABLE', reasonCode: 'REFINANCE_SCENARIO_INVALID', blocks: [summary('The scenario could not be saved', 'Run a scenario with a target rate first, then choose Save.')], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const title = kind === 'ALERT_SETTINGS' ? 'Save these alert settings?' : kind === 'ADD_COMPARISON' ? 'Save and compare these Loan Estimates?' : kind === 'RECORD_DECISION' ? 'Record this refinance decision?' : kind === 'DELETE_COMPARISON' ? 'Permanently delete this comparison?' : 'Save this refinance scenario?';
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'REFINANCE_COMMAND_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { refinanceCommand: { kind, entityId, message }, refinanceForm: supplied ?? null, refinanceContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [summary(title, 'Nothing changes until you confirm.')], captureRequests: formKind ? [capture(formKind, version, supplied!)] : [],
    confirmation: { confirmationId: `refinance-${sha({ kind, entityId, supplied, message }).slice(0, 16)}`, version: 1, title, description: kind === 'ADD_COMPARISON' ? 'This stores the reviewed figures and compares disclosed metrics without choosing or contacting a lender.' : 'The canonical refinance record will be updated only after confirmation.', fields: [], editableFields: [], confirmLabel: kind === 'DELETE_COMPARISON' ? 'Delete permanently' : 'Confirm', consentText: 'I reviewed these refinance details and authorize this change.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('refinance.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = refinanceKindFromAction(launch?.actionId);
  if (!kind || launch?.operationId !== 'REFINANCE_COMMAND' || launch.surface === 'ASK_REFRESH') return { status: 'NOT_APPLICABLE', reasonCode: 'ASK_REFINANCE_COMMAND_NOT_DIRECTLY_ROUTABLE', blocks: [summary('Start from your refinance outlook', 'Choose an action from the current refinance answer so the exact context is preserved.')], suggestions: [] };
  return refinanceCommandResult(envelope.userId, envelope.propertyId!, kind, launch.entityId ?? null, envelope.message);
});

async function confirmRefinanceCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
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
    const offer = (p: 'a' | 'b') => ({ id: `${p}-${randomUUID()}`, lenderName: String(d[`${p}Lender`]), loanAmountUsd: Number(d[`${p}Amount`]), loanTermYears: Number(d[`${p}TermYears`]), loanType: d[`${p}LoanType`] as 'FIXED' | 'ARM' | 'OTHER', noteRatePct: Number(d[`${p}Rate`]), aprPct: Number(d[`${p}Apr`]), monthlyPrincipalAndInterestUsd: Number(d[`${p}MonthlyPI`]), ...(d[`${p}MonthlyMI`] != null ? { monthlyMortgageInsuranceUsd: Number(d[`${p}MonthlyMI`]) } : {}), ...(d[`${p}TotalPayment`] != null ? { estimatedTotalMonthlyPaymentUsd: Number(d[`${p}TotalPayment`]) } : {}), loanCostsUsd: Number(d[`${p}LoanCosts`]), lenderCreditsUsd: Number(d[`${p}LenderCredits`]), cashToCloseUsd: Number(d[`${p}CashToClose`]), cashToCloseDirection: d[`${p}CashDirection`] as 'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN' });
    await saveRefinanceLoanEstimateComparison({ propertyId: execution.propertyId, label: typeof d.label === 'string' ? d.label : undefined, offers: [offer('a'), offer('b')] }); title = 'Loan Estimates compared and saved';
  } else if (command.kind === 'DELETE_COMPARISON') {
    if (!command.entityId || !await deleteSavedRefinanceLoanEstimateComparison(execution.propertyId, command.entityId)) throw stale('That saved comparison is no longer available.'); title = 'Saved comparison deleted';
  } else if (command.kind === 'RECORD_DECISION') {
    const parsed = refinanceDecisionAnswerSchema.safeParse(form); if (!parsed.success) throw stale('The decision details are invalid.'); const d = parsed.data;
    const current = await getCurrentRefinanceDecision(execution.propertyId);
    await recordRefinanceDecision({ propertyId: execution.propertyId, userId, body: { status: d.status as RefinanceDecisionStatus, clientMutationId: `ask-refinance-${execution.id}`, ...(current ? { expectedVersion: current.version } : {}), ...(d.rationale ? { rationale: d.rationale } : {}), ...(d.status === 'DEFERRED' && d.nextReviewAt ? { nextReviewAt: new Date(d.nextReviewAt).toISOString() } : {}), ...(d.status === 'CLOSED' ? { completedMortgage: { currentMortgageBalanceUsd: d.currentMortgageBalanceUsd!, interestRatePct: d.interestRatePct!, remainingTermMonths: d.remainingTermMonths!, ...(d.monthlyPaymentUsd != null ? { monthlyPaymentUsd: d.monthlyPaymentUsd } : {}), ...(d.closingCostUsd != null ? { closingCostUsd: d.closingCostUsd } : {}), mortgageBalanceAsOfDate: new Date().toISOString() } } : {}) } }); title = d.status === 'CLOSED' ? 'Refinance closed and Financing updated' : 'Refinance decision recorded';
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
