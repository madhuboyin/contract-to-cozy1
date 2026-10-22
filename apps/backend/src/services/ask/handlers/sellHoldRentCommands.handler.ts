// Governed Sell / Hold / Rent writes for Ask. Scenario assumptions use the same ToolOverride rows as the desktop
// tool, financing delegates to FINANCING_PROFILE_COMMAND, and plan tracking uses the canonical decision-family
// adapter. Every write is reached from a declared action and reviewed before confirmation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { money } from '../askFormatting';
import { listToolOverrides, upsertToolOverrides, type ToolOverrideWrite } from '../../toolOverride.service';
import { SELL_HOLD_RENT_OVERRIDE_SPECS, validateToolOverrideWrite } from '../../toolOverrideContract';
import { SellHoldRentService } from '../../sellHoldRent.service';
import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';
import { abandonDecisionThread } from '../../decisionPlatform/decisionThreadService';
import {
  SELL_HOLD_RENT_ASSUMPTIONS_CAPTURE_KEY,
  SELL_HOLD_RENT_COMMAND_ENTITY_TYPE,
  SELL_HOLD_RENT_COMMAND_LABELS,
  sellHoldRentCommandKindFromMessage,
  type SellHoldRentCommandKind,
} from '../support/sellHoldRentCommand';

const TOOL_KEY = 'SELL_HOLD_RENT';
const EDITABLE_KEYS = ['HOME_VALUE_NOW', 'MONTHLY_RENT_NOW', 'APPRECIATION_RATE', 'SELLING_COST_RATE', 'RENT_GROWTH_RATE', 'VACANCY_RATE', 'MANAGEMENT_RATE'] as const;
type EditableKey = typeof EDITABLE_KEYS[number];
const specs = Object.fromEntries(SELL_HOLD_RENT_OVERRIDE_SPECS.map((spec) => [spec.key, spec])) as Record<EditableKey, typeof SELL_HOLD_RENT_OVERRIDE_SPECS[number]>;
const fieldKeys: Record<EditableKey, string> = {
  HOME_VALUE_NOW: 'homeValueNow', MONTHLY_RENT_NOW: 'monthlyRentNow', APPRECIATION_RATE: 'appreciationPct', SELLING_COST_RATE: 'sellingCostPct',
  RENT_GROWTH_RATE: 'rentGrowthPct', VACANCY_RATE: 'vacancyPct', MANAGEMENT_RATE: 'managementPct',
};
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const back = { id: 'sell-hold-rent-back', label: 'See updated comparison', interactionType: 'START_WORKFLOW' as const, message: 'Should I sell, hold, or rent my home?', operationId: 'SELL_HOLD_RENT_ANALYSIS' as const, style: 'PRIMARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'sell-hold-rent-command-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

const overridesVersion = (rows: Array<{ key: string; value: number }>) => sha(rows.map((row) => [row.key, row.value]).sort());
const threadVersion = (selection: Awaited<ReturnType<typeof sellHoldRentDecisionFamilyAdapter.selectThread>>) => sha(selection.kind === 'UNIQUE'
  ? [selection.thread.decisionThreadId, selection.thread.lifecycleStatus, selection.thread.contextStatus, selection.thread.currentRecommendationSnapshotId]
  : [selection.kind]);

function assumptionsCapture(contextVersion: string, rows: Array<{ key: string; value: number }>, entered?: Record<string, unknown>): AskCaptureRequest {
  const saved = new Map(rows.map((row) => [row.key, row.value]));
  const seed = entered ?? Object.fromEntries(EDITABLE_KEYS.flatMap((key) => {
    const value = saved.get(key);
    if (value === undefined) return [];
    return [[fieldKeys[key], specs[key].unit === 'DECIMAL_RATE' ? value * 100 : value]];
  }));
  const numberField = (key: EditableKey) => ({
    key: fieldKeys[key], label: `${specs[key].label}${specs[key].unit === 'DECIMAL_RATE' ? ' (%)' : specs[key].unit === 'USD_PER_MONTH' ? ' ($/month)' : ' ($)'}`,
    required: false,
    inputSchema: { type: 'NUMBER' as const, min: specs[key].unit === 'DECIMAL_RATE' ? specs[key].min * 100 : specs[key].min, max: specs[key].unit === 'DECIMAL_RATE' ? specs[key].max * 100 : specs[key].max },
  });
  return {
    requirementId: 'sell-hold-rent-assumptions-inputs', captureKey: SELL_HOLD_RENT_ASSUMPTIONS_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Scenario assumptions', question: 'What should the comparison use?',
    helpText: 'These values affect future Sell / Hold / Rent comparisons; they do not change your Home Record. Rates are entered as percentages. You will review the changes before anything is saved.',
    inputSchema: { type: 'GROUP', fields: [
      ...EDITABLE_KEYS.map(numberField),
      { key: 'resetAll', label: 'Use model defaults for these inputs', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Keep or save the values above', value: 'NO' }, { label: 'Clear the seven assumptions shown above', value: 'YES' }] } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: { ...seed, resetAll: entered?.resetAll ?? 'NO' }, allowNotSure: false, sensitivity: 'FINANCIAL',
    destinationLabel: 'Saved only as Sell / Hold / Rent scenario assumptions after confirmation', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

function parseAssumptions(answer: Record<string, unknown>): { writes: ToolOverrideWrite[]; error?: string } {
  if (answer.resetAll === 'YES') return { writes: EDITABLE_KEYS.map((key) => ({ key, value: null })) };
  const writes: ToolOverrideWrite[] = [];
  for (const key of EDITABLE_KEYS) {
    const raw = answer[fieldKeys[key]];
    if (raw === undefined || raw === null || raw === '') continue;
    const entered = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(entered)) return { writes: [], error: `${specs[key].label} must be a number.` };
    writes.push({ key, value: specs[key].unit === 'DECIMAL_RATE' ? entered / 100 : entered });
  }
  if (!writes.length) return { writes: [], error: 'Enter at least one assumption, or choose to clear the saved assumptions.' };
  const issues = validateToolOverrideWrite(TOOL_KEY, writes);
  return issues.length ? { writes: [], error: issues[0].detail } : { writes };
}

function display(key: EditableKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Model default';
  return specs[key].unit === 'DECIMAL_RATE' ? `${(value * 100).toFixed(1)}%` : money(value);
}

export async function sellHoldRentCommandResult(userId: string, propertyId: string, launch: { kind: SellHoldRentCommandKind; entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return unavailable('ASK_PERMISSION_REQUIRED', 'A contributor or owner can manage this comparison', 'Your role can view the comparison but cannot change its assumptions or tracked plan. Nothing changed.');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const common = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  if (launch.kind === 'EDIT_ASSUMPTIONS') {
    const rows = await listToolOverrides(propertyId, TOOL_KEY);
    const contextVersion = overridesVersion(rows);
    if (!supplied) return {
      status: 'NEEDS_CONTEXT', reasonCode: 'SELL_HOLD_RENT_ASSUMPTIONS_INPUT_REQUIRED', contextVersion,
      parameters: { sellHoldRentLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'sell-hold-rent-assumptions-input', title: 'Edit scenario assumptions', body: 'Use the values that best match your planning case. Nothing has been saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [assumptionsCapture(contextVersion, rows)], suggestions: [],
    };
    const parsed = parseAssumptions(supplied);
    if (parsed.error) return unavailable('SELL_HOLD_RENT_ASSUMPTIONS_INVALID', 'Check the assumptions', `${parsed.error} Nothing changed.`);
    const current = new Map(rows.map((row) => [row.key, row.value]));
    const changed = parsed.writes.filter((write) => current.get(write.key) !== write.value && !(write.value === null && !current.has(write.key)));
    if (!changed.length) return unavailable('SELL_HOLD_RENT_ASSUMPTIONS_NO_CHANGE', 'Nothing to change', 'Those assumptions already match what is saved. Nothing changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'SELL_HOLD_RENT_ASSUMPTIONS_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { sellHoldRentCommand: { kind: launch.kind, entityId: propertyId }, sellHoldRentForm: supplied, sellHoldRentContextVersion: contextVersion, ...common },
      blocks: [{ type: 'SUMMARY', id: 'sell-hold-rent-assumptions-review', title: 'Review the scenario changes', body: 'These settings change future comparisons, not your Home Record. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: { confirmationId: `sell-hold-rent-assumptions-${sha(supplied).slice(0, 12)}-1`, version: 1, title: 'Save these scenario assumptions?', description: 'The next Sell / Hold / Rent comparison will use these saved values. Your recorded home facts are unchanged.',
        fields: changed.map((write) => ({ label: specs[write.key as EditableKey].label, value: `${display(write.key as EditableKey, current.get(write.key))} → ${display(write.key as EditableKey, write.value)}` })), editableFields: [], confirmLabel: 'Save assumptions', consentText: 'I authorize these scenario settings for this shared home.', expiresAt: expiresAt.toISOString() },
      captureRequests: [assumptionsCapture(contextVersion, rows, supplied)], suggestions: [],
    };
  }

  const selection = await sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId);
  const contextVersion = threadVersion(selection);
  if (launch.kind === 'START_PLAN' && selection.kind === 'UNIQUE') return unavailable('SELL_HOLD_RENT_PLAN_ALREADY_ACTIVE', 'This decision is already being tracked', 'Ask found the active decision plan and did not create another one.');
  if (launch.kind === 'STOP_PLAN' && (selection.kind !== 'UNIQUE' || selection.thread.decisionThreadId !== launch.entityId)) return unavailable('SELL_HOLD_RENT_PLAN_NOT_ACTIVE', 'That tracked plan is no longer active', 'Nothing changed. Open the comparison to see its current state.');
  const start = launch.kind === 'START_PLAN';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SELL_HOLD_RENT_PLAN_${start ? 'START' : 'STOP'}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { sellHoldRentCommand: { kind: launch.kind, entityId: launch.entityId }, sellHoldRentContextVersion: contextVersion, ...common },
    blocks: [{ type: 'SUMMARY', id: 'sell-hold-rent-plan-review', title: start ? 'Track this decision?' : 'Stop tracking this decision?', body: start ? 'Ask will keep one durable plan for this home and refresh its recommendation when the modeled context changes.' : 'The comparison remains available, but this tracked decision plan will close.', tone: start ? 'DEFAULT' : 'CAUTION', actions: [] }],
    confirmation: { confirmationId: `sell-hold-rent-plan-${start ? 'start' : 'stop'}-${sha(launch.entityId).slice(0, 12)}-1`, version: 1, title: start ? 'Start tracking this decision?' : 'Stop tracking this decision?',
      description: start ? 'This creates or resumes one property-scoped decision plan. It does not list, sell, rent, or otherwise transact on the home.' : 'This closes the tracked plan. It does not change the comparison or any Home Record facts.',
      fields: [{ label: 'Decision', value: 'Sell, hold, or rent this home' }], editableFields: [], confirmLabel: start ? 'Track decision' : 'Stop tracking', consentText: start ? 'I want Cozy to track this decision.' : 'I want Cozy to stop tracking this decision.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

registerCapabilityHandler('sell-hold-rent.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = sellHoldRentCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'SELL_HOLD_RENT_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== SELL_HOLD_RENT_COMMAND_ENTITY_TYPE) {
    return unavailable('ASK_SELL_HOLD_RENT_COMMAND_NOT_DIRECTLY_ROUTABLE', 'Open the comparison first', 'Manage assumptions and the tracked plan from the Sell / Hold / Rent comparison. Nothing changed.');
  }
  return sellHoldRentCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
async function confirmSellHoldRentCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, parameters, userId } = ctx;
  const propertyId = execution.propertyId;
  const command = parameters.sellHoldRentCommand as { kind?: SellHoldRentCommandKind; entityId?: string } | undefined;
  if (!command?.kind || !command.entityId) throw stale('The change to make is invalid.');
  let title: string; let artifactId = propertyId;
  if (command.kind === 'EDIT_ASSUMPTIONS') {
    const rows = await listToolOverrides(propertyId, TOOL_KEY);
    if (parameters.sellHoldRentContextVersion !== overridesVersion(rows)) throw stale('The saved assumptions changed while confirmation was open. Review them again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const parsed = parseAssumptions(parameters.sellHoldRentForm as Record<string, unknown>);
    if (parsed.error) throw stale(parsed.error);
    await upsertToolOverrides(propertyId, TOOL_KEY, parsed.writes);
    title = 'Scenario assumptions updated';
  } else {
    const selection = await sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId);
    if (parameters.sellHoldRentContextVersion !== threadVersion(selection)) throw stale('The tracked plan changed while confirmation was open. Review it again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (command.kind === 'START_PLAN') {
      const analysis = await new SellHoldRentService().estimateOutcome(propertyId, { years: 5 }, userId);
      if (analysis.status !== 'OK') throw stale('The home value needed for this decision is no longer available. Open the comparison and review the current inputs.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const lineage = await sellHoldRentDecisionFamilyAdapter.createOrResumeThread({ propertyId, userId, primaryEntityId: propertyId, askExecutionId: execution.id });
      artifactId = lineage.decisionThreadId; title = 'Decision tracking started';
    } else if (command.kind === 'STOP_PLAN') {
      if (selection.kind !== 'UNIQUE' || selection.thread.decisionThreadId !== command.entityId) throw stale('That tracked plan is no longer active.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await abandonDecisionThread(command.entityId, propertyId); artifactId = command.entityId; title = 'Decision tracking stopped';
    } else throw stale('The change to make is invalid.');
  }
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: `SELL_HOLD_RENT_${command.kind}_COMPLETED`, blocks: [{ type: 'WORKFLOW_PROGRESS', id: `sell-hold-rent-command-${artifactId}`, title, status: 'COMPLETED', description: command.kind === 'EDIT_ASSUMPTIONS' ? 'Future comparisons will use the saved scenario assumptions.' : 'The Sell / Hold / Rent comparison remains available.', details: [], actions: [back] }], suggestions: [] };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'LIMITATION', id: `sell-hold-rent-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. Ask for the comparison again to see the current result.' });
  return { result, artifactType: command.kind === 'EDIT_ASSUMPTIONS' ? 'SELL_HOLD_RENT_ANALYSIS' : 'DECISION_THREAD', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('sell-hold-rent.command', confirmSellHoldRentCommand);
