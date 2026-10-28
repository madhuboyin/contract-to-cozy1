import { createHash } from 'node:crypto';
import { confirmExpenseCommand, expenseCommandResult } from './expenseCommands.handler';
import { isExpenseActionId } from '../support/expenseCommand';
import { HouseholdRole } from '@prisma/client';
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { OwnershipCostDecisionInputSchema, OwnershipCostScenarioInputSchema, OwnershipCostScenarioRenameInputSchema } from '../support/commandInputs';
import { OWNERSHIP_COST_ACTION_IDS, OWNERSHIP_COST_COMMAND_MESSAGE, OWNERSHIP_COST_DECISION_CAPTURE_KEY, OWNERSHIP_COST_SCENARIO_CAPTURE_KEY } from '../support/ownershipCostConstants';
import { OWNERSHIP_COST_CATEGORIES, type OwnershipCostCategory } from '../../ownershipCosts/ownershipCost.contract';
import { ownershipCostChangeService } from '../../ownershipCosts/ownershipCostChange.service';
import { ownershipCostDecisionService, type OwnershipCostDecisionAction, type OwnershipCostNotificationType } from '../../ownershipCosts/ownershipCostDecision.service';
import { ownershipCostForecastService } from '../../ownershipCosts/ownershipCostForecast.service';
import { ownershipCostVariabilityService } from '../../ownershipCosts/ownershipCostVariability.service';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const expires = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
const labels = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const completedAction = { id: 'ownership-cost-show-current', label: 'Show current ownership costs', interactionType: 'START_WORKFLOW' as const, message: 'Show my current ownership costs', operationId: 'OWNERSHIP_COSTS' as const, style: 'SECONDARY' as const };

type Launch = { actionId?: string | null; entityId?: string | null; entityType?: string | null; sourceExecutionId?: string | null } | null | undefined;
type Supplied = { kind: 'SCENARIO'; value: ReturnType<typeof OwnershipCostScenarioInputSchema.parse> } | { kind: 'RENAME'; value: ReturnType<typeof OwnershipCostScenarioRenameInputSchema.parse> } | { kind: 'DECISION'; value: ReturnType<typeof OwnershipCostDecisionInputSchema.parse> };

const blocked = (): AskOperationResult => ({ status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'ownership-cost-command-permission', title: 'A contributor or owner is required', body: 'You can review ownership costs, but your role cannot change shared planning records.', tone: 'CAUTION', actions: [] }], suggestions: [] });

function scenarioCapture(current?: Partial<ReturnType<typeof OwnershipCostScenarioInputSchema.parse>>): AskCaptureRequest {
  return { requirementId: 'ownership-cost-scenario-inputs', captureKey: OWNERSHIP_COST_SCENARIO_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Save a planning scenario', question: 'Name the scenario and choose the bounded assumption to explore.', helpText: 'Scenario assumptions never overwrite canonical facts. You will review everything before it is saved.', inputSchema: { type: 'GROUP', fields: [
    { key: 'name', label: 'Scenario name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 80 } },
    { key: 'lens', label: 'Cost lens', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Operating expense', value: 'OPERATING_EXPENSE' }, { label: 'Cash outflow', value: 'CASH_OUTFLOW' }] } },
    { key: 'horizonYears', label: 'Forecast horizon', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [1, 3, 5, 10].map((year) => ({ label: `${year} year${year === 1 ? '' : 's'}`, value: String(year) })) } },
    { key: 'category', label: 'Category to adjust', required: true, inputSchema: { type: 'SINGLE_SELECT', options: OWNERSHIP_COST_CATEGORIES.map((category) => ({ label: labels(category), value: category })) } },
    { key: 'growthPercent', label: 'Annual growth %', helpText: 'Optional, from -25% to 50%.', required: false, inputSchema: { type: 'NUMBER', min: -25, max: 50 } },
    { key: 'annualAdjustmentDollars', label: 'Annual adjustment $', helpText: 'Optional, from -$1,000,000 to $1,000,000.', required: false, inputSchema: { type: 'NUMBER', min: -1_000_000, max: 1_000_000 } },
  ] }, currentAnswer: { lens: 'OPERATING_EXPENSE', horizonYears: '5', category: 'PROPERTY_TAX', ...current }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved as a planning scenario after confirmation', confirmationText: null, expectedContextVersion: 'ownership-cost-live' };
}

function renameCapture(name: string): AskCaptureRequest {
  return { requirementId: 'ownership-cost-scenario-rename', captureKey: OWNERSHIP_COST_SCENARIO_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Rename scenario', question: 'What should this planning scenario be called?', helpText: null, inputSchema: { type: 'GROUP', fields: [{ key: 'name', label: 'Scenario name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 80 } }] }, currentAnswer: { name }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Renames this scenario after confirmation', confirmationText: null, expectedContextVersion: 'ownership-cost-live' };
}

function decisionCapture(action: string): AskCaptureRequest {
  const snooze = action === OWNERSHIP_COST_ACTION_IDS.CHANGE_SNOOZE;
  return { requirementId: 'ownership-cost-decision-inputs', captureKey: OWNERSHIP_COST_DECISION_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: snooze ? 'Snooze this change' : 'Explain this decision', question: snooze ? 'When should Cozy bring this ownership-cost change back?' : 'Why are you making this decision?', helpText: null, inputSchema: { type: 'GROUP', fields: snooze
    ? [{ key: 'revisitAt', label: 'Revisit date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } }]
    : [{ key: 'reason', label: 'Reason', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } }]
  }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Recorded with the ownership-cost decision after confirmation', confirmationText: null, expectedContextVersion: 'ownership-cost-live' };
}

const actionToDecision: Partial<Record<string, OwnershipCostDecisionAction>> = {
  [OWNERSHIP_COST_ACTION_IDS.CHANGE_ACCEPT]: 'ACCEPT', [OWNERSHIP_COST_ACTION_IDS.CHANGE_SAVE]: 'SAVE', [OWNERSHIP_COST_ACTION_IDS.CHANGE_SNOOZE]: 'SNOOZE',
  [OWNERSHIP_COST_ACTION_IDS.CHANGE_NO_ACTION]: 'NO_ACTION', [OWNERSHIP_COST_ACTION_IDS.CHANGE_RESOLVE]: 'RESOLVE', [OWNERSHIP_COST_ACTION_IDS.CHANGE_DISMISS]: 'DISMISS', [OWNERSHIP_COST_ACTION_IDS.CHANGE_REOPEN]: 'REOPEN',
};

export async function ownershipCostCommandResult(userId: string, propertyId: string, launch: Launch, supplied?: Supplied): Promise<AskOperationResult> {
  if ((await ensurePropertyAccess(userId, propertyId)).role === HouseholdRole.VIEWER) return blocked();
  const actionId = launch?.actionId ?? '';
  const entityId = launch?.entityId ?? '';
  if (!Object.values(OWNERSHIP_COST_ACTION_IDS).includes(actionId as never)) return { status: 'NOT_APPLICABLE', reasonCode: 'OWNERSHIP_COST_ACTION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'ownership-cost-command-launch', title: 'Choose an action from Ownership Costs', body: 'Open an ownership-cost answer and choose one of its actions. Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };

  if (actionId === OWNERSHIP_COST_ACTION_IDS.CREATE_SCENARIO && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'OWNERSHIP_COST_SCENARIO_INPUT_REQUIRED', parameters: { ownershipCostLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-scenario-input', title: 'Save a planning scenario', body: 'Choose a bounded assumption. Canonical facts will not change.', tone: 'DEFAULT', actions: [] }], captureRequests: [scenarioCapture()], suggestions: [] };
  if (actionId === OWNERSHIP_COST_ACTION_IDS.RENAME_SCENARIO && !supplied) {
    const scenario = (await ownershipCostForecastService.listScenarios(propertyId, userId, true)).find((item) => item.id === entityId);
    if (!scenario) return { status: 'NOT_APPLICABLE', reasonCode: 'OWNERSHIP_COST_SCENARIO_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'ownership-cost-scenario-missing', title: 'That scenario is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
    return { status: 'NEEDS_CONTEXT', reasonCode: 'OWNERSHIP_COST_SCENARIO_RENAME_REQUIRED', parameters: { ownershipCostLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-scenario-rename-input', title: `Rename ${scenario.name}`, body: 'Enter a new name, then review it before saving.', tone: 'DEFAULT', actions: [] }], captureRequests: [renameCapture(scenario.name)], suggestions: [] };
  }
  if (actionToDecision[actionId] && ['SNOOZE', 'NO_ACTION', 'RESOLVE', 'DISMISS'].includes(actionToDecision[actionId]!) && !supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'OWNERSHIP_COST_DECISION_INPUT_REQUIRED', parameters: { ownershipCostLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-decision-input', title: 'Complete this ownership-cost decision', body: 'The reason or revisit date remains attached to the source change.', tone: 'DEFAULT', actions: [] }], captureRequests: [decisionCapture(actionId)], suggestions: [] };
  if (actionToDecision[actionId] === 'SNOOZE' && supplied?.kind === 'DECISION' && !supplied.value.revisitAt) return { status: 'NEEDS_CONTEXT', reasonCode: 'OWNERSHIP_COST_REVISIT_DATE_REQUIRED', parameters: { ownershipCostLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-decision-input', title: 'Choose a revisit date', body: 'A snoozed change needs a date when Cozy should bring it back.', tone: 'CAUTION', actions: [] }], captureRequests: [decisionCapture(actionId)], suggestions: [] };
  if (actionToDecision[actionId] && ['NO_ACTION', 'RESOLVE', 'DISMISS'].includes(actionToDecision[actionId]!) && supplied?.kind === 'DECISION' && !supplied.value.reason) return { status: 'NEEDS_CONTEXT', reasonCode: 'OWNERSHIP_COST_DECISION_REASON_REQUIRED', parameters: { ownershipCostLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-decision-input', title: 'Add a reason', body: 'This decision requires a reason that remains attached to the ownership-cost change.', tone: 'CAUTION', actions: [] }], captureRequests: [decisionCapture(actionId)], suggestions: [] };

  let title = 'Review ownership-cost change'; let description = 'Nothing changes until you confirm.'; const fields: Array<{ label: string; value: string }> = [];
  const command: Record<string, unknown> = { actionId, entityId };
  if (actionId === OWNERSHIP_COST_ACTION_IDS.CREATE_SCENARIO && supplied?.kind === 'SCENARIO') { title = `Save scenario “${supplied.value.name}”?`; description = 'This saves a planning scenario. It does not change canonical home facts.'; command.input = supplied.value; fields.push({ label: 'Horizon', value: `${supplied.value.horizonYears} years` }, { label: 'Category', value: labels(supplied.value.category) }); }
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.RENAME_SCENARIO && supplied?.kind === 'RENAME') { title = `Rename this scenario to “${supplied.value.name}”?`; command.input = supplied.value; }
  else if (actionToDecision[actionId]) { const decision = actionToDecision[actionId]!; title = `${labels(decision)} this ownership-cost change?`; command.decision = decision; command.input = supplied?.kind === 'DECISION' ? supplied.value : {}; }
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.DELETE_SCENARIO) { title = 'Delete this planning scenario?'; description = 'This cannot be undone. Canonical home facts and other scenarios are not changed.'; }
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.ARCHIVE_SCENARIO) title = 'Archive this planning scenario?';
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.SAVE_FORECAST) title = 'Save this ownership-cost forecast?';
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.MONTHLY_BUFFER) title = 'Record this monthly cash buffer decision?';
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.CAPITAL_RESERVE) title = 'Record this capital-reserve decision?';
  else if (actionId === OWNERSHIP_COST_ACTION_IDS.TOGGLE_NOTIFICATION) title = 'Change this ownership-cost reminder?';
  const expiry = expires();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'OWNERSHIP_COST_COMMAND_CONFIRMATION_REQUIRED', parameters: { ownershipCostCommand: command, sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiry }, blocks: [{ type: 'SUMMARY', id: 'ownership-cost-command-review', title, body: description, tone: actionId === OWNERSHIP_COST_ACTION_IDS.DELETE_SCENARIO ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: `ownership-cost-${sha(`${propertyId}:${actionId}:${entityId}`).slice(0, 16)}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel: actionId === OWNERSHIP_COST_ACTION_IDS.DELETE_SCENARIO ? 'Delete scenario' : 'Confirm', consentText: 'I authorize this change to the shared ownership-cost planning record.', expiresAt: expiry }, suggestions: [] };
}

registerCapabilityHandler('ownership-costs.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.operationId !== 'OWNERSHIP_COST_COMMAND' || launch.surface === 'ASK_REFRESH' || envelope.message !== OWNERSHIP_COST_COMMAND_MESSAGE) return ownershipCostCommandResult(envelope.userId, envelope.propertyId!, null);
  // Expenses (FRD v1.467) are extra actions of this command with their own handler.
  if (isExpenseActionId(launch.actionId)) return expenseCommandResult(envelope.userId, envelope.propertyId!, { actionId: launch.actionId, entityId: launch.entityId ?? null, sourceExecutionId: launch.sourceExecutionId ?? null });
  return ownershipCostCommandResult(envelope.userId, envelope.propertyId!, launch);
});

async function confirmOwnershipCostCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  if (ctx.parameters.ownershipCostExpense) return confirmExpenseCommand(ctx);
  const { execution, userId, parameters } = ctx; const propertyId = execution.propertyId;
  const command = parameters.ownershipCostCommand as { actionId: string; entityId: string; decision?: OwnershipCostDecisionAction; input?: Record<string, unknown> };
  let artifactType = 'OWNERSHIP_COST_DECISION'; let artifactId = command.entityId || propertyId; let title = 'Ownership Costs updated';
  if (command.actionId === OWNERSHIP_COST_ACTION_IDS.CREATE_SCENARIO) { const input = OwnershipCostScenarioInputSchema.parse(command.input); const row = await ownershipCostForecastService.createScenario(propertyId, userId, { name: input.name, lens: input.lens, horizonYears: input.horizonYears, overrides: { ...(input.growthPercent == null ? {} : { categoryGrowthRates: { [input.category]: input.growthPercent / 100 } }), ...(input.annualAdjustmentDollars == null ? {} : { categoryAnnualAdjustmentsCents: { [input.category]: Math.round(input.annualAdjustmentDollars * 100) } }) } }); artifactType = 'OWNERSHIP_COST_SCENARIO'; artifactId = row.id; title = 'Planning scenario saved'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.RENAME_SCENARIO) { const input = OwnershipCostScenarioRenameInputSchema.parse(command.input); await ownershipCostForecastService.updateScenario(propertyId, command.entityId, userId, { name: input.name }); artifactType = 'OWNERSHIP_COST_SCENARIO'; title = 'Scenario renamed'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.ARCHIVE_SCENARIO) { await ownershipCostForecastService.updateScenario(propertyId, command.entityId, userId, { status: 'ARCHIVED' }); artifactType = 'OWNERSHIP_COST_SCENARIO'; title = 'Scenario archived'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.DELETE_SCENARIO) { await ownershipCostForecastService.deleteScenario(propertyId, command.entityId, userId); artifactType = 'OWNERSHIP_COST_SCENARIO'; title = 'Scenario deleted'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.SAVE_FORECAST) { const [lens, horizon] = command.entityId.split(':'); const forecast = await ownershipCostForecastService.recalculateForecast(propertyId, userId, lens as 'OPERATING_EXPENSE' | 'CASH_OUTFLOW', Number(horizon)); artifactType = 'OWNERSHIP_COST_FORECAST'; artifactId = forecast.forecastId!; title = 'Forecast saved'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.MONTHLY_BUFFER || command.actionId === OWNERSHIP_COST_ACTION_IDS.CAPITAL_RESERVE) { const [lens] = command.entityId.split(':'); const decision = await ownershipCostVariabilityService.recordPlanningDecision(propertyId, userId, lens as 'OPERATING_EXPENSE' | 'CASH_OUTFLOW', command.actionId === OWNERSHIP_COST_ACTION_IDS.MONTHLY_BUFFER ? 'MONTHLY_CASH_BUFFER' : 'CAPITAL_RESERVE'); artifactId = decision.id; title = 'Planning decision recorded'; }
  else if (command.actionId === OWNERSHIP_COST_ACTION_IDS.TOGGLE_NOTIFICATION) { const [type, enabled] = command.entityId.split(':') as [OwnershipCostNotificationType, string]; await ownershipCostDecisionService.updateNotificationPreferences(propertyId, userId, { [type]: enabled === 'true' }); artifactType = 'OWNERSHIP_COST_NOTIFICATION_PREFERENCE'; artifactId = type; title = 'Reminder preference updated'; }
  else if (command.decision) { const input = OwnershipCostDecisionInputSchema.parse(command.input ?? {}); const change = (await ownershipCostChangeService.getObservedChanges(propertyId, userId, 'OPERATING_EXPENSE')).changes.find((item) => item.id === command.entityId) ?? (await ownershipCostChangeService.getObservedChanges(propertyId, userId, 'CASH_OUTFLOW')).changes.find((item) => item.id === command.entityId); if (!change?.id) throw Object.assign(new Error('That ownership-cost change is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' }); const decision = await ownershipCostDecisionService.record(propertyId, userId, { action: command.decision, sourceChangeId: change.id, reason: input.reason, revisitAt: input.revisitAt ? `${input.revisitAt}T12:00:00.000Z` : null }); artifactId = decision.id; title = 'Change decision recorded'; }
  else throw Object.assign(new Error('That ownership-cost action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  return { result: { status: 'COMPLETED', reasonCode: 'OWNERSHIP_COST_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `ownership-cost-command-${artifactId}`, title, status: 'COMPLETED', description: 'The Ownership Costs workspace now reflects this choice.', details: [], actions: [completedAction] }], suggestions: [] }, artifactType, artifactId };
}
registerConfirmCapabilityHandler('ownership-costs.command', confirmOwnershipCostCommand);
