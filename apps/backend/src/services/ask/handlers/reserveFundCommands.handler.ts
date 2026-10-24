import { createHash } from 'node:crypto';
import { HouseholdRole, HomeReserveFundPosture } from '@prisma/client';
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { homeReserveFundService } from '../../homeReserveFund.service';
import { homeReserveFundReconciliationService } from '../../homeReserveFundReconciliation.service';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { ReserveFundContributionInputSchema } from '../support/commandInputs';
import { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_BALANCE_CAPTURE_KEY, RESERVE_FUND_COMMAND_MESSAGE, RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY } from '../support/reserveFundConstants';
import { parseReserveFundMessage, type ReserveFundContributionMessage } from '../support/reserveFundMessage';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { prisma } from '../../../lib/prisma';
import { confirmReserveAllocationWithEffects, resolveFundingStepBinding } from '../../reserveAllocationOperations';
import { homeReserveFundCalculationService } from '../../homeReserveFundCalculation.service';
import { GUIDANCE_STEP_REFUSAL_TEXT, guidanceStepIdFromSourceExecution, launchedGuidanceStepId } from '../support/guidanceStepBinding';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const expiry = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
type Launch = { actionId?: string | null; entityId?: string | null; sourceExecutionId?: string | null } | null | undefined;
type Contribution = ReturnType<typeof ReserveFundContributionInputSchema.parse>;
/** A stated balance (FRD v1.329): the figure the person says the reserve fund holds. Zero is a legitimate balance. */
export interface ReserveFundBalanceTarget { targetDollars: number; note: string | null }
const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const currentBalanceCents = async (propertyId: string): Promise<number> => Number((await homeReserveFundService.getSummary(propertyId)).currentBalanceCents ?? 0);

function balanceCapture(prefillDollars?: number | null): AskCaptureRequest {
  return {
    requirementId: 'reserve-fund-balance-input', captureKey: RESERVE_FUND_BALANCE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
    title: 'Set the reserve fund balance', question: 'What does your reserve fund hold now?',
    helpText: 'Ask works out the difference from the balance on record and logs it as a balance correction. This does not connect to a bank or move money.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'targetDollars', label: 'Balance now ($)', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'note', label: 'Note', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 500 } },
    ] }, currentAnswer: prefillDollars != null ? { targetDollars: prefillDollars } : {}, allowNotSure: false, sensitivity: 'FINANCIAL',
    destinationLabel: 'Logs a self-reported balance correction after confirmation', confirmationText: null, expectedContextVersion: 'reserve-fund-live',
  };
}

const showFundAction = { id: 'reserve-fund-show-current', label: 'Show updated reserve fund', interactionType: 'START_WORKFLOW' as const, message: 'How is my reserve fund doing?', operationId: 'CAPITAL_RESERVE_PLAN' as const, style: 'SECONDARY' as const };

// What a typed "add $500 to my reserve fund" already told us, shown in the form so it can be reviewed and changed before confirmation.
function contributionCapture(prefill?: ReserveFundContributionMessage | null): AskCaptureRequest {
  const type = prefill?.type ?? 'DEPOSIT';
  return {
    requirementId: 'reserve-fund-contribution-input', captureKey: RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY,
    classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Log a reserve-fund entry',
    question: 'What changed in your self-reported reserve balance?',
    helpText: 'This records a ledger entry only. It does not connect to a bank or transfer money.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'type', label: 'Entry type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
        { label: 'Deposit', value: 'DEPOSIT' }, { label: 'Withdrawal', value: 'WITHDRAWAL' }, { label: 'Balance correction', value: 'BALANCE_CORRECTION' },
      ] } },
      { key: 'direction', label: 'Balance direction', required: true, helpText: 'Used for a balance correction; deposits increase and withdrawals decrease automatically.', inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Increase', value: 'INCREASE' }, { label: 'Decrease', value: 'DECREASE' }] } },
      { key: 'amountDollars', label: 'Amount ($)', required: true, inputSchema: { type: 'NUMBER', min: 0.01, max: 100_000_000 } },
      { key: 'occurredAt', label: 'Date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'note', label: 'Note', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 500 } },
    ] }, currentAnswer: { type, direction: type === 'WITHDRAWAL' ? 'DECREASE' : 'INCREASE', ...(prefill?.amountDollars ? { amountDollars: prefill.amountDollars } : {}) }, allowNotSure: false, sensitivity: 'FINANCIAL',
    destinationLabel: 'Adds a self-reported Reserve Fund ledger entry after confirmation', confirmationText: null,
    expectedContextVersion: 'reserve-fund-live',
  };
}

// A block-level action launches with its own `actionId` (the client sends action.actionId, not action.id), so both carry the governed id.
const choiceAction = (id: string, label: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({ id, label, interactionType: 'START_WORKFLOW' as const, message: RESERVE_FUND_COMMAND_MESSAGE, operationId: 'RESERVE_FUND_COMMAND' as const, actionId: id, style });

// "Change my reserve plan" names no change. The three changes are offered as the same governed actions the reserve-plan answer's buttons launch.
const changeChoice = (): AskOperationResult => ({ status: 'COMPLETED', reasonCode: 'RESERVE_FUND_ACTION_CHOICE', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-change-choice', title: 'What would you like to change?', body: 'Nothing changes until you choose an option and confirm it.', tone: 'DEFAULT', actions: [
  choiceAction(RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, 'Log a balance change'),
  choiceAction(RESERVE_FUND_ACTION_IDS.SET_BALANCE, 'Set the balance to a figure'),
  choiceAction(RESERVE_FUND_ACTION_IDS.RECALCULATE, 'Recalculate the plan'),
  choiceAction(RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE, 'Change planning posture'),
] }], suggestions: [] });

const postureChoice = (): AskOperationResult => ({ status: 'COMPLETED', reasonCode: 'RESERVE_FUND_POSTURE_CHOICE', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-posture-choice', title: 'Which planning posture?', body: 'The posture sets which point in each estimated cost range the plan uses. You will review the change before it is applied.', tone: 'DEFAULT', actions: [
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_CONSERVATIVE, 'Conservative'),
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_MODERATE, 'Moderate'),
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_AGGRESSIVE, 'Aggressive'),
] }], suggestions: [] });

const blocked = (): AskOperationResult => ({ status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-command-permission', title: 'A contributor or owner is required', body: 'You can review the reserve plan, but your role cannot change its shared balance or planning settings.', tone: 'CAUTION', actions: [] }], suggestions: [] });

export async function reserveFundCommandResult(userId: string, propertyId: string, launch: Launch, supplied?: Contribution, prefill?: ReserveFundContributionMessage | null, balance?: ReserveFundBalanceTarget | null, balancePrefill?: number | null): Promise<AskOperationResult> {
  if ((await ensurePropertyAccess(userId, propertyId)).role === HouseholdRole.VIEWER) return blocked();
  const actionId = launch?.actionId ?? '';
  const entityId = launch?.entityId ?? '';
  if (!Object.values(RESERVE_FUND_ACTION_IDS).includes(actionId as never)) return { status: 'NOT_APPLICABLE', reasonCode: 'RESERVE_FUND_ACTION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-command-launch', title: 'Choose an action from the reserve-fund answer', body: 'Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  if (actionId === RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE) return postureChoice();
  if (actionId === RESERVE_FUND_ACTION_IDS.SET_BALANCE && !balance) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'RESERVE_FUND_BALANCE_REQUIRED', parameters: { reserveFundLaunch: launch },
      blocks: [{ type: 'SUMMARY', id: 'reserve-fund-balance-input', title: 'Set the reserve fund balance', body: 'Say what the fund holds now. Nothing is logged until you review and confirm.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [balanceCapture(balancePrefill)], suggestions: [],
    };
  }
  if (actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'RESERVE_FUND_CONTRIBUTION_REQUIRED', parameters: { reserveFundLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'reserve-fund-contribution-input', title: 'Log a reserve-fund entry', body: 'Enter the self-reported balance change, then review it before it is recorded.', tone: 'DEFAULT', actions: [] }], captureRequests: [contributionCapture(prefill)], suggestions: [] };

  const command: Record<string, unknown> = { actionId, entityId };
  let title = 'Update the reserve fund?';
  let description = 'Nothing changes until you confirm.';
  const fields: Array<{ label: string; value: string }> = [];
  if (actionId === RESERVE_FUND_ACTION_IDS.SET_BALANCE && balance) {
    // Re-read the canonical balance, show the arithmetic, and do nothing when it already matches (FRD v1.329).
    const baselineCents = await currentBalanceCents(propertyId);
    const targetCents = Math.round(balance.targetDollars * 100);
    const deltaCents = targetCents - baselineCents;
    if (deltaCents === 0) {
      return { status: 'NOT_APPLICABLE', reasonCode: 'RESERVE_FUND_BALANCE_ALREADY_SET', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-balance-unchanged', title: `The reserve fund already holds ${usd(baselineCents)}`, body: 'Nothing needs correcting, so nothing was logged.', tone: 'DEFAULT', actions: [showFundAction] }], suggestions: [] };
    }
    command.balance = { targetCents, baselineCents, note: balance.note };
    title = `Set the reserve fund balance to ${usd(targetCents)}?`;
    description = `This logs one balance correction of ${deltaCents > 0 ? 'an increase' : 'a decrease'} of ${usd(Math.abs(deltaCents))}. It is not a deposit or a withdrawal, it changes only the self-reported balance, and no money moves.`;
    fields.push({ label: 'Balance on record', value: usd(baselineCents) }, { label: 'Balance you stated', value: usd(targetCents) },
      { label: 'Correction', value: `${deltaCents > 0 ? '+' : '\u2212'}${usd(Math.abs(deltaCents))} (${deltaCents > 0 ? 'increase' : 'decrease'})` });
  } else if (actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION && supplied) {
    command.input = supplied;
    const signed = supplied.type === 'WITHDRAWAL' || (supplied.type === 'BALANCE_CORRECTION' && supplied.direction === 'DECREASE') ? -supplied.amountDollars : supplied.amountDollars;
    title = `Log a ${supplied.type.toLowerCase().replace('_', ' ')} of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(signed))}?`;
    description = 'This changes only the self-reported Reserve Fund ledger and balance. No money is transferred.';
    fields.push({ label: 'Balance change', value: `${signed >= 0 ? '+' : '−'}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(signed))}` });
  } else if (actionId === RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION) { title = 'Remove this ledger entry?'; description = 'The entry will be deleted and its balance effect reversed.'; }
  else if (actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE) { title = 'Recalculate the reserve plan?'; description = 'The plan will be rebuilt from the current Capital Timeline and property context.'; }
  else if (actionId === RESERVE_FUND_ACTION_IDS.CONFIRM_ALLOCATION) {
    // One expense's allocation, confirmed by the homeowner. The line item is re-read here (this home's fund, still active) and the confirmation shows the amount being confirmed.
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    const line = await prisma.homeReserveFundLineItem.findFirst({ where: { id: entityId, fundId: fund.id }, include: { timelineItem: { include: { inventoryItem: { select: { name: true } } } } } });
    if (!line || line.status !== 'ACTIVE') return { status: 'NOT_APPLICABLE', reasonCode: 'RESERVE_FUND_LINE_ITEM_NOT_AVAILABLE', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-allocation-unavailable', title: 'That reserve item is no longer available', body: 'It was retired or does not belong to this home. Nothing was changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
    // The journey step this belongs to, if any: the one the launch names, else the one the reserve plan it came from was opened for. A step that does not fit this expense is remembered as
    // refused, so nothing is reported to any journey; the allocation itself can still be confirmed.
    const supplied = launchedGuidanceStepId(launch) ?? await guidanceStepIdFromSourceExecution(userId, propertyId, launch?.sourceExecutionId ?? null);
    const bound = supplied ? await resolveFundingStepBinding(propertyId, supplied, line) : null;
    if (supplied) { command.guidanceStepId = bound?.ok ? supplied : null; if (!bound?.ok) command.guidanceStepRefused = true; }
    const expense = line.timelineItem?.inventoryItem?.name ?? String(line.timelineItem?.category ?? 'Capital item').toLowerCase().replace(/_/g, ' ');
    title = `Confirm the funding plan for ${expense}?`;
    description = `This records that you confirm saving ${usd(line.allocatedMonthlyCents)} a month toward ${usd(line.targetCostCents)} for this expense. It does not move money; it is your confirmation of the plan.`;
    fields.push({ label: 'Expense', value: expense }, { label: 'Monthly allocation', value: usd(line.allocatedMonthlyCents) }, { label: 'Target', value: usd(line.targetCostCents) });
    if (supplied && !bound?.ok) fields.push({ label: 'Guided journey', value: bound ? GUIDANCE_STEP_REFUSAL_TEXT[bound.reason] : 'No journey step' });
  }
  else if (actionId === RESERVE_FUND_ACTION_IDS.ACCEPT_RECONCILIATION) { title = 'Mark this reserve item retired?'; description = 'The matched expense will be recorded as evidence that this planned need was completed.'; }
  else { const posture = actionId.split('reserve-fund-posture-')[1]; title = `Use the ${posture} planning posture?`; description = 'This changes which point in each estimated cost range is used and immediately recalculates the plan.'; command.posture = posture?.toUpperCase(); }
  const expiresAt = expiry();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'RESERVE_FUND_COMMAND_CONFIRMATION_REQUIRED', parameters: { reserveFundCommand: command, sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'reserve-fund-command-review', title, body: description, tone: actionId === RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: `reserve-fund-${sha(`${propertyId}:${actionId}:${entityId}:${JSON.stringify(supplied ?? null)}`).slice(0, 16)}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel: 'Confirm', consentText: 'I authorize this change to the shared Reserve Fund record.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('reserve-fund.command', async (envelope) => {
  const launch = envelope.launchContext;
  // A typed request (no declared action, not a refresh) is resolved to the same governed action the buttons launch: a contribution opens the
  // form with what the message said filled in; recalculate and a named posture go straight to the confirmation; an unnamed change or posture
  // is answered with the choices. The message writes nothing.
  if (launch?.surface !== 'ASK_REFRESH' && launch?.operationId !== 'RESERVE_FUND_COMMAND') {
    const typed = parseReserveFundMessage(envelope.message);
    if (typed) {
      const sourceExecutionId = launch?.sourceExecutionId ?? null;
      const resolve = (actionId: string, supplied?: Contribution, prefill?: ReserveFundContributionMessage) =>
        reserveFundCommandResult(envelope.userId, envelope.propertyId!, { actionId, entityId: null, sourceExecutionId }, supplied, prefill);
      if (typed.kind === 'SET_BALANCE') {
        // A stated figure goes straight to the arithmetic review; without one the form asks for it.
        return reserveFundCommandResult(envelope.userId, envelope.propertyId!, { actionId: RESERVE_FUND_ACTION_IDS.SET_BALANCE, entityId: null, sourceExecutionId },
          undefined, null, typed.targetDollars != null ? { targetDollars: typed.targetDollars, note: null } : null, typed.targetDollars);
      }
      if (typed.kind === 'CONTRIBUTION') return resolve(RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, undefined, { type: typed.type, amountDollars: typed.amountDollars });
      if (typed.kind === 'RECALCULATE') return resolve(RESERVE_FUND_ACTION_IDS.RECALCULATE);
      if (typed.kind === 'POSTURE') return resolve(`reserve-fund-posture-${typed.posture.toLowerCase()}`);
      // Every choice is a change, so a viewer is told the role requirement instead of being offered buttons that would refuse.
      if ((await ensurePropertyAccess(envelope.userId, envelope.propertyId!)).role === HouseholdRole.VIEWER) return blocked();
      return typed.kind === 'POSTURE_UNSPECIFIED' ? postureChoice() : changeChoice();
    }
  }
  if (launch?.operationId !== 'RESERVE_FUND_COMMAND' || launch.surface === 'ASK_REFRESH' || envelope.message !== RESERVE_FUND_COMMAND_MESSAGE) return reserveFundCommandResult(envelope.userId, envelope.propertyId!, null);
  return reserveFundCommandResult(envelope.userId, envelope.propertyId!, launch);
});

async function confirmReserveFundCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, parameters, userId } = ctx;
  const propertyId = execution.propertyId;
  const command = parameters.reserveFundCommand as { actionId: string; entityId?: string; posture?: HomeReserveFundPosture; input?: Contribution; balance?: { targetCents: number; baselineCents: number; note: string | null }; guidanceStepId?: string | null; guidanceStepRefused?: boolean };
  let artifactType = 'HOME_RESERVE_FUND';
  let artifactId = propertyId;
  let title = 'Reserve Fund updated';
  let journeyNote: string | null = null;
  if (command.actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE || command.posture) {
    const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: 'RESERVE_FUND', operationKey: 'RECALCULATE' });
    if (!evaluation.canExecute) throw Object.assign(new Error('Required property context is incomplete. Review the missing home details, then try again.'), { code: 'PROPERTY_CONTEXT_REQUIRED' });
  }
  if (command.actionId === RESERVE_FUND_ACTION_IDS.SET_BALANCE) {
    const stated = command.balance;
    if (!stated || !Number.isInteger(stated.targetCents) || !Number.isInteger(stated.baselineCents) || stated.targetCents < 0) {
      throw Object.assign(new Error('The balance to set is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    }
    // Revalidate at execution: the correction was computed against a balance that must still be the balance.
    const nowCents = await currentBalanceCents(propertyId);
    if (nowCents !== stated.baselineCents) {
      throw Object.assign(new Error(`The reserve fund balance changed to ${usd(nowCents)} while the confirmation was open. Review it again and try again.`), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    const delta = stated.targetCents - nowCents;
    if (delta === 0) throw Object.assign(new Error('The balance already matches, so nothing was logged.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const contribution = await homeReserveFundService.addContribution(propertyId, { type: 'BALANCE_CORRECTION', amountCents: delta, occurredAt: new Date(), note: stated.note ?? 'Balance set from Ask' });
    artifactType = 'HOME_RESERVE_FUND_CONTRIBUTION'; artifactId = contribution.id; title = 'Reserve balance corrected';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION) {
    const input = ReserveFundContributionInputSchema.parse(command.input);
    const negative = input.type === 'WITHDRAWAL' || (input.type === 'BALANCE_CORRECTION' && input.direction === 'DECREASE');
    const contribution = await homeReserveFundService.addContribution(propertyId, { type: input.type, amountCents: Math.round(input.amountDollars * 100) * (negative ? -1 : 1), occurredAt: input.occurredAt ? new Date(`${input.occurredAt}T12:00:00.000Z`) : undefined, note: input.note });
    artifactType = 'HOME_RESERVE_FUND_CONTRIBUTION'; artifactId = contribution.id; title = 'Reserve entry logged';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION) {
    await homeReserveFundService.removeContribution(propertyId, command.entityId!); artifactType = 'HOME_RESERVE_FUND_CONTRIBUTION'; artifactId = command.entityId!; title = 'Reserve entry removed';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE) {
    const context = await getFinancialContextDecisions(propertyId, userId, 'RESERVE_FUND');
    const fund = await homeReserveFundService.recalculate(propertyId, context.contextVersion, userId); artifactId = fund.id; title = 'Reserve plan recalculated';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.CONFIRM_ALLOCATION) {
    // The shared write and journey report (the Desktop route calls the same function). The confirmation is saved even if the step cannot be reported; a refused step reports nothing.
    const stepId = typeof command.guidanceStepId === 'string' ? command.guidanceStepId : null;
    const confirmed = await confirmReserveAllocationWithEffects(propertyId, userId, command.entityId!, { guidanceStepId: stepId });
    artifactType = 'HOME_RESERVE_FUND_LINE_ITEM'; artifactId = confirmed.lineItem.id; title = 'Funding plan confirmed';
    journeyNote = stepId ? (confirmed.guidanceReported ? 'This step is recorded as done' : confirmed.guidanceRefusal ? GUIDANCE_STEP_REFUSAL_TEXT[confirmed.guidanceRefusal as keyof typeof GUIDANCE_STEP_REFUSAL_TEXT] ?? 'No journey step was updated' : 'The funding is confirmed, but the journey step could not be updated. Open the journey to check it')
      : command.guidanceStepRefused ? 'This expense is not the one the journey step is about, so no journey step was updated' : null;
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.ACCEPT_RECONCILIATION) {
    const [lineItemId, expenseId] = (command.entityId ?? '').split(':');
    const line = await homeReserveFundReconciliationService.acceptMatch(propertyId, lineItemId, expenseId); artifactType = 'HOME_RESERVE_FUND_LINE_ITEM'; artifactId = line.id; title = 'Matched reserve item retired';
  } else if (command.posture) {
    const context = await getFinancialContextDecisions(propertyId, userId, 'RESERVE_FUND');
    const fund = await homeReserveFundService.updatePosture(propertyId, command.posture, context.contextVersion, userId); artifactId = fund.id; title = 'Planning posture updated';
  } else throw Object.assign(new Error('That reserve-fund action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  return { result: { status: 'COMPLETED', reasonCode: 'RESERVE_FUND_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `reserve-fund-command-${artifactId}`, title, status: 'COMPLETED', description: 'The canonical Reserve Fund now reflects this change.', details: journeyNote ? [{ label: 'Guided journey', value: journeyNote }] : [], actions: [showFundAction] }], suggestions: [] }, artifactType, artifactId };
}

registerConfirmCapabilityHandler('reserve-fund.command', confirmReserveFundCommand);
