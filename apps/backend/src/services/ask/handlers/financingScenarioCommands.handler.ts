// Save, choose a way to pay on, and archive a financing scenario, and refresh the equity position (register "Financing"; FRD v1.484). Reached only by the
// declared actions on the Financing answer, through the FINANCING_PROFILE_COMMAND capability, so the owner floor, the mutation impact and the governance of
// that command already apply. Every write is the canonical financing.service function the Desktop routes call (createScenario, updateScenario,
// archiveScenario, refreshEquity), behind a review and a confirmation bound to the scenario's last change.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { money } from '../askFormatting';
import { archiveScenario, createScenario, getLatestEquity, getScenario, refreshEquity, updateScenario } from '../../financing.service';
import { getFinancialContextDecisions } from '../../financialContext/context';
import {
  FINANCING_OPTIONS, FINANCING_OPTION_LABELS, FINANCING_SCENARIO_ACTION_IDS, FINANCING_SCENARIO_CAPTURE_KEY, parseScenarioChooseAnswer, parseScenarioSaveAnswer,
  projectCostFromEntityId, type FinancingScenarioActionId,
} from '../support/financingScenarioCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'financing-profile-back', label: 'Back to financing', interactionType: 'START_WORKFLOW' as const, message: 'Show my financing', operationId: 'FINANCING_OVERVIEW' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'financing-scenario-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

export interface FinancingScenarioLaunch { actionId: FinancingScenarioActionId; entityId: string | null; sourceExecutionId: string | null }

interface ScenarioRow { id: string; title: string; status: string; selectedOption: string | null; projectCostCents: number; updatedAt: Date }
const scenarioVersion = (row: ScenarioRow) => sha(`financing-scenario:${row.id}:${row.status}:${row.selectedOption ?? ''}:${row.updatedAt.toISOString()}`);
const optionLabel = (value: string | null | undefined) => (value ? FINANCING_OPTION_LABELS[value] ?? value : 'None chosen');

async function equityVersion(propertyId: string): Promise<string> {
  const latest = await getLatestEquity(propertyId).catch(() => null) as { id?: string; computedAt?: Date } | null;
  return sha(`financing-equity:${propertyId}:${latest && latest.id !== 'ephemeral' && latest.computedAt ? latest.computedAt.toISOString() : 'none'}`);
}

function formCapture(kind: 'SAVE' | 'CHOOSE', contextVersion: string, current: Record<string, unknown>): AskCaptureRequest {
  const fields = kind === 'SAVE'
    ? [
      { key: 'title', label: 'Name this comparison', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
      { key: 'notes', label: 'Notes (optional)', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 1000 } },
    ]
    : [{ key: 'option', label: 'Way to pay', required: true, inputSchema: { type: 'SINGLE_SELECT', options: FINANCING_OPTIONS.map((value) => ({ label: FINANCING_OPTION_LABELS[value], value })) } }];
  return {
    requirementId: 'financing-scenario-inputs', captureKey: FINANCING_SCENARIO_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: kind === 'SAVE' ? 'Save this comparison' : 'Which way to pay are you leaning toward?',
    question: kind === 'SAVE' ? 'What should it be called?' : 'Choose one; you can change it later.',
    helpText: 'Nothing is saved until you confirm. This records your own preference and does not apply for anything.',
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(current).filter(([, value]) => value !== undefined && value !== null && value !== '')),
    allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function financingScenarioCommandResult(userId: string, propertyId: string, launch: FinancingScenarioLaunch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role !== HouseholdRole.OWNER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_OWNER_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'financing-scenario-blocked', title: 'Only an owner can change saved financing', body: 'Saved comparisons keep a snapshot of the home’s equity, which only an owner can see. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const launchParameters = { financingScenarioLaunch: { actionId: launch.actionId, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (contextVersion: string, command: Record<string, unknown>, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, consentText: string, id: string): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'FINANCING_SCENARIO_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { financingScenarioCommand: command, financingScenarioContextVersion: contextVersion, ...launchParameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'financing-scenario-review', title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `financing-scenario-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText, expiresAt: expiresAt.toISOString() },
    suggestions: [],
  });

  if (launch.actionId === FINANCING_SCENARIO_ACTION_IDS.REFRESH_EQUITY) {
    const contextVersion = await equityVersion(propertyId);
    return confirmation(contextVersion, { actionId: launch.actionId }, 'Refresh your equity position?',
      'This recalculates the home’s equity from your recorded value and mortgage and saves the new snapshot, which the financing comparisons use. Your mortgage details are not changed.', 'Refresh equity',
      [{ label: 'What changes', value: 'A new equity snapshot is saved' }], 'I authorize refreshing the equity position.', `equity-${contextVersion.slice(0, 12)}`);
  }

  if (launch.actionId === FINANCING_SCENARIO_ACTION_IDS.SAVE) {
    const cents = projectCostFromEntityId(launch.entityId);
    if (cents === null) return unavailable('FINANCING_SCENARIO_COST_MISSING', 'Compare a project first', 'A comparison is saved from a project cost, for example “How should I pay for a $40,000 kitchen?”. Nothing has changed.');
    const contextVersion = sha(`financing-scenario-save:${propertyId}:${cents}`);
    const defaultTitle = `${money(cents / 100)} project`;
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'FINANCING_SCENARIO_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'financing-scenario-input', title: 'Save this comparison', body: `The ways to pay for ${money(cents / 100)} are saved with today’s rates and your equity snapshot. Nothing has been saved yet.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('SAVE', contextVersion, { title: defaultTitle })], suggestions: [],
      };
    }
    const parsed = parseScenarioSaveAnswer(supplied);
    if (!parsed.success) return unavailable('FINANCING_SCENARIO_INPUT_INVALID', 'Name the comparison', 'Give the comparison a name of up to 200 characters. Nothing has changed.');
    return {
      ...confirmation(contextVersion, { actionId: launch.actionId, projectCostCents: cents, input: parsed.data }, `Save “${parsed.data.title}”?`,
        'This saves the comparison with today’s rates and your current equity snapshot. It does not apply for any loan.', 'Save comparison',
        [{ label: 'Name', value: parsed.data.title }, { label: 'Project cost', value: money(cents / 100) }, ...(parsed.data.notes ? [{ label: 'Notes', value: parsed.data.notes }] : [])],
        'I authorize saving this comparison.', `save-${sha(`${propertyId}:${cents}:${parsed.data.title}`).slice(0, 12)}`),
      captureRequests: [formCapture('SAVE', contextVersion, parsed.data)],
    };
  }

  const row = launch.entityId ? await getScenario(launch.entityId, propertyId) as ScenarioRow | null : null;
  if (!row || row.status === 'ARCHIVED') return unavailable('FINANCING_SCENARIO_NOT_FOUND', 'That comparison is not available', 'It may have been archived. Nothing has changed.');
  const contextVersion = scenarioVersion(row);

  if (launch.actionId === FINANCING_SCENARIO_ACTION_IDS.ARCHIVE) {
    return confirmation(contextVersion, { actionId: launch.actionId, entityId: row.id }, `Archive “${row.title}”?`,
      'It leaves your saved comparisons. Your mortgage details and other comparisons are not changed.', 'Archive comparison',
      [{ label: 'Comparison', value: row.title }, { label: 'Project cost', value: money(Number(row.projectCostCents) / 100) }], 'I authorize archiving this comparison.', `archive-${row.id}`);
  }

  // CHOOSE
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'FINANCING_SCENARIO_CHOICE_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'financing-scenario-choice', title: row.title, body: `Currently: ${optionLabel(row.selectedOption)}. Nothing has been changed.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('CHOOSE', contextVersion, { option: row.selectedOption })], suggestions: [],
    };
  }
  const parsed = parseScenarioChooseAnswer(supplied);
  if (!parsed.success) return unavailable('FINANCING_SCENARIO_CHOICE_INVALID', 'Choose a way to pay', 'Pick one of the ways to pay. Nothing has changed.');
  if (parsed.data.option === row.selectedOption) return unavailable('FINANCING_SCENARIO_NO_CHANGE', 'Nothing to change', 'That is already the way to pay recorded for this comparison. Nothing has changed.');
  return {
    ...confirmation(contextVersion, { actionId: launch.actionId, entityId: row.id, input: parsed.data }, `Lean toward ${optionLabel(parsed.data.option)}?`,
      'This records your preference on the comparison. It does not apply for anything.', 'Save my choice',
      [{ label: 'Comparison', value: row.title }, { label: 'Way to pay', value: `${optionLabel(row.selectedOption)} → ${optionLabel(parsed.data.option)}` }],
      'I authorize recording this choice.', `choose-${sha(`${row.id}:${parsed.data.option}`).slice(0, 12)}`),
    captureRequests: [formCapture('CHOOSE', contextVersion, parsed.data)],
  };
}

export async function confirmFinancingScenarioCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role !== HouseholdRole.OWNER) throw stale('Only an owner can change saved financing.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  const stored = parameters.financingScenarioCommand as { actionId?: unknown; entityId?: unknown; input?: unknown; projectCostCents?: unknown } | undefined;
  const actionId = stored?.actionId as FinancingScenarioActionId | undefined;
  let title: string; let description: string; let artifactType = 'FINANCING_SCENARIO'; let artifactId = propertyId;
  const details: Array<{ label: string; value: string }> = [];

  if (actionId === FINANCING_SCENARIO_ACTION_IDS.REFRESH_EQUITY) {
    if (parameters.financingScenarioContextVersion !== await equityVersion(propertyId)) throw stale('Your equity position changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const context = await getFinancialContextDecisions(propertyId, userId, 'FINANCING_CENTER');
    await refreshEquity(propertyId, context.contextVersion);
    artifactType = 'PROPERTY_FINANCING_PROFILE'; title = 'Equity position refreshed'; description = 'The financing comparisons now use the new snapshot.';
  } else if (actionId === FINANCING_SCENARIO_ACTION_IDS.SAVE) {
    const parsed = parseScenarioSaveAnswer(stored?.input);
    const cents = typeof stored?.projectCostCents === 'number' ? stored.projectCostCents : null;
    if (!parsed.success || cents === null || cents < 100) throw stale('The comparison to save is invalid.');
    const context = await getFinancialContextDecisions(propertyId, userId, 'FINANCING_CENTER');
    const created = await createScenario(propertyId, userId, { title: parsed.data.title, notes: parsed.data.notes, projectCostCents: cents, entryPoint: 'DIRECT' as never }, context.contextVersion);
    artifactId = created.id; title = 'Comparison saved'; description = 'It is listed under your saved scenarios.';
    details.push({ label: 'Name', value: parsed.data.title }, { label: 'Project cost', value: money(cents / 100) });
  } else if (actionId === FINANCING_SCENARIO_ACTION_IDS.CHOOSE || actionId === FINANCING_SCENARIO_ACTION_IDS.ARCHIVE) {
    const scenarioId = typeof stored?.entityId === 'string' ? stored.entityId : null;
    const row = scenarioId ? await getScenario(scenarioId, propertyId) as ScenarioRow | null : null;
    if (!row || !scenarioId || row.status === 'ARCHIVED') throw stale('That comparison is no longer available. It may have been archived.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (parameters.financingScenarioContextVersion !== scenarioVersion(row)) throw stale('This comparison changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    artifactId = scenarioId; details.push({ label: 'Comparison', value: row.title });
    if (actionId === FINANCING_SCENARIO_ACTION_IDS.ARCHIVE) {
      await archiveScenario(scenarioId, propertyId);
      title = 'Comparison archived'; description = 'It no longer appears in your saved scenarios.';
    } else {
      const parsed = parseScenarioChooseAnswer(stored?.input);
      if (!parsed.success) throw stale('The choice to save is invalid.');
      await updateScenario(scenarioId, propertyId, { selectedOption: parsed.data.option });
      title = 'Choice saved'; description = 'The comparison now shows the way to pay you are leaning toward.';
      details.push({ label: 'Way to pay', value: `${optionLabel(row.selectedOption)} → ${optionLabel(parsed.data.option)}` });
    }
  } else {
    throw stale('The change to make is invalid.');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'FINANCING_SCENARIO_UPDATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `financing-scenario-${actionId}-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [{ ...back, label: 'See my financing', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `financing-scenario-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
