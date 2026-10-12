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
import { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_COMMAND_MESSAGE, RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY } from '../support/reserveFundConstants';
import { parseReserveFundMessage, type ReserveFundContributionMessage } from '../support/reserveFundMessage';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const expiry = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
type Launch = { actionId?: string | null; entityId?: string | null; sourceExecutionId?: string | null } | null | undefined;
type Contribution = ReturnType<typeof ReserveFundContributionInputSchema.parse>;

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
  choiceAction(RESERVE_FUND_ACTION_IDS.RECALCULATE, 'Recalculate the plan'),
  choiceAction(RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE, 'Change planning posture'),
] }], suggestions: [] });

const postureChoice = (): AskOperationResult => ({ status: 'COMPLETED', reasonCode: 'RESERVE_FUND_POSTURE_CHOICE', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-posture-choice', title: 'Which planning posture?', body: 'The posture sets which point in each estimated cost range the plan uses. You will review the change before it is applied.', tone: 'DEFAULT', actions: [
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_CONSERVATIVE, 'Conservative'),
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_MODERATE, 'Moderate'),
  choiceAction(RESERVE_FUND_ACTION_IDS.POSTURE_AGGRESSIVE, 'Aggressive'),
] }], suggestions: [] });

const blocked = (): AskOperationResult => ({ status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-command-permission', title: 'A contributor or owner is required', body: 'You can review the reserve plan, but your role cannot change its shared balance or planning settings.', tone: 'CAUTION', actions: [] }], suggestions: [] });

export async function reserveFundCommandResult(userId: string, propertyId: string, launch: Launch, supplied?: Contribution, prefill?: ReserveFundContributionMessage | null): Promise<AskOperationResult> {
  if ((await ensurePropertyAccess(userId, propertyId)).role === HouseholdRole.VIEWER) return blocked();
  const actionId = launch?.actionId ?? '';
  const entityId = launch?.entityId ?? '';
  if (!Object.values(RESERVE_FUND_ACTION_IDS).includes(actionId as never)) return { status: 'NOT_APPLICABLE', reasonCode: 'RESERVE_FUND_ACTION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'reserve-fund-command-launch', title: 'Choose an action from the reserve-fund answer', body: 'Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  if (actionId === RESERVE_FUND_ACTION_IDS.CHOOSE_POSTURE) return postureChoice();
  if (actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'RESERVE_FUND_CONTRIBUTION_REQUIRED', parameters: { reserveFundLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'reserve-fund-contribution-input', title: 'Log a reserve-fund entry', body: 'Enter the self-reported balance change, then review it before it is recorded.', tone: 'DEFAULT', actions: [] }], captureRequests: [contributionCapture(prefill)], suggestions: [] };

  const command: Record<string, unknown> = { actionId, entityId };
  let title = 'Update the reserve fund?';
  let description = 'Nothing changes until you confirm.';
  const fields: Array<{ label: string; value: string }> = [];
  if (actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION && supplied) {
    command.input = supplied;
    const signed = supplied.type === 'WITHDRAWAL' || (supplied.type === 'BALANCE_CORRECTION' && supplied.direction === 'DECREASE') ? -supplied.amountDollars : supplied.amountDollars;
    title = `Log a ${supplied.type.toLowerCase().replace('_', ' ')} of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(signed))}?`;
    description = 'This changes only the self-reported Reserve Fund ledger and balance. No money is transferred.';
    fields.push({ label: 'Balance change', value: `${signed >= 0 ? '+' : '−'}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(signed))}` });
  } else if (actionId === RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION) { title = 'Remove this ledger entry?'; description = 'The entry will be deleted and its balance effect reversed.'; }
  else if (actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE) { title = 'Recalculate the reserve plan?'; description = 'The plan will be rebuilt from the current Capital Timeline and property context.'; }
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
  const command = parameters.reserveFundCommand as { actionId: string; entityId?: string; posture?: HomeReserveFundPosture; input?: Contribution };
  let artifactType = 'HOME_RESERVE_FUND';
  let artifactId = propertyId;
  let title = 'Reserve Fund updated';
  if (command.actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE || command.posture) {
    const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: 'RESERVE_FUND', operationKey: 'RECALCULATE' });
    if (!evaluation.canExecute) throw Object.assign(new Error('Required property context is incomplete. Review the missing home details, then try again.'), { code: 'PROPERTY_CONTEXT_REQUIRED' });
  }
  if (command.actionId === RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION) {
    const input = ReserveFundContributionInputSchema.parse(command.input);
    const negative = input.type === 'WITHDRAWAL' || (input.type === 'BALANCE_CORRECTION' && input.direction === 'DECREASE');
    const contribution = await homeReserveFundService.addContribution(propertyId, { type: input.type, amountCents: Math.round(input.amountDollars * 100) * (negative ? -1 : 1), occurredAt: input.occurredAt ? new Date(`${input.occurredAt}T12:00:00.000Z`) : undefined, note: input.note });
    artifactType = 'HOME_RESERVE_FUND_CONTRIBUTION'; artifactId = contribution.id; title = 'Reserve entry logged';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.REMOVE_CONTRIBUTION) {
    await homeReserveFundService.removeContribution(propertyId, command.entityId!); artifactType = 'HOME_RESERVE_FUND_CONTRIBUTION'; artifactId = command.entityId!; title = 'Reserve entry removed';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.RECALCULATE) {
    const context = await getFinancialContextDecisions(propertyId, userId, 'RESERVE_FUND');
    const fund = await homeReserveFundService.recalculate(propertyId, context.contextVersion, userId); artifactId = fund.id; title = 'Reserve plan recalculated';
  } else if (command.actionId === RESERVE_FUND_ACTION_IDS.ACCEPT_RECONCILIATION) {
    const [lineItemId, expenseId] = (command.entityId ?? '').split(':');
    const line = await homeReserveFundReconciliationService.acceptMatch(propertyId, lineItemId, expenseId); artifactType = 'HOME_RESERVE_FUND_LINE_ITEM'; artifactId = line.id; title = 'Matched reserve item retired';
  } else if (command.posture) {
    const context = await getFinancialContextDecisions(propertyId, userId, 'RESERVE_FUND');
    const fund = await homeReserveFundService.updatePosture(propertyId, command.posture, context.contextVersion, userId); artifactId = fund.id; title = 'Planning posture updated';
  } else throw Object.assign(new Error('That reserve-fund action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  return { result: { status: 'COMPLETED', reasonCode: 'RESERVE_FUND_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `reserve-fund-command-${artifactId}`, title, status: 'COMPLETED', description: 'The canonical Reserve Fund now reflects this change.', details: [], actions: [showFundAction] }], suggestions: [] }, artifactType, artifactId };
}

registerConfirmCapabilityHandler('reserve-fund.command', confirmReserveFundCommand);
