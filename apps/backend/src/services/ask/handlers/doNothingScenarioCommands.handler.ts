// Do-Nothing Simulator scenarios inside Ask (register P2 "Do-Nothing Simulator"; FRD v1.336). Reached only by the declared "Add a scenario" summary action
// and the Change / Delete row actions on a saved scenario. Every write is DoNothingSimulatorService's (createScenario, updateScenario, deleteScenario),
// the routes' own calls, behind a review and a confirmation. The service keeps scenarios for the home's primary account holder, and Ask says so. A saved
// scenario is a set of assumptions, not a result: saving, changing or deleting one runs nothing.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { money } from '../askFormatting';
import { DoNothingSimulatorService } from '../../doNothingSimulator.service';
import {
  DEDUCTIBLE_LABELS, DEDUCTIBLE_STRATEGIES, DO_NOTHING_FORM_CAPTURE_KEYS, DO_NOTHING_HORIZONS, DO_NOTHING_SCENARIO_MESSAGES, RISK_TOLERANCES, RISK_TOLERANCE_LABELS,
  doNothingScenarioEntityType, doNothingScenarioKindFromMessage, parseDoNothingScenarioAnswer,
  type DoNothingFormKind, type DoNothingOverrides, type DoNothingScenarioKind,
} from '../support/doNothingScenarioCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const service = () => new DoNothingSimulatorService();
const backToSimulator = { id: 'do-nothing-back', label: 'Back to the simulator', interactionType: 'START_WORKFLOW' as const, message: 'Show my do-nothing simulation', operationId: 'DO_NOTHING_SIMULATION' as const, style: 'SECONDARY' as const };

const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'do-nothing-command-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'do-nothing-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToSimulator] }], suggestions: [],
});

type Scenario = { id: string; name: string; horizonMonths: number; inputOverrides: DoNothingOverrides; updatedAt?: string | Date };
async function loadScenario(propertyId: string, userId: string, id: string): Promise<Scenario | null> {
  const { scenarios } = await service().listScenarios(propertyId, userId);
  return (scenarios as unknown as Scenario[]).find((s) => s.id === id) ?? null;
}
const versionOf = (s: Scenario | null, propertyId: string) => sha(`do-nothing-scenario:${s?.id ?? propertyId}:${s ? s.updatedAt ?? '' : ''}:${s ? JSON.stringify(s.inputOverrides) : ''}:${s?.name ?? ''}:${s?.horizonMonths ?? ''}`);

const showOverrides = (o: DoNothingOverrides) => [
  o.skipMaintenance !== undefined ? `Skips maintenance: ${o.skipMaintenance ? 'yes' : 'no'}` : null,
  o.skipWarranty !== undefined ? `Skips warranty: ${o.skipWarranty ? 'yes' : 'no'}` : null,
  o.deductibleStrategy ? `Deductible: ${DEDUCTIBLE_LABELS[o.deductibleStrategy] ?? o.deductibleStrategy}` : null,
  o.cashBufferCents !== undefined ? `Cash buffer: ${money(o.cashBufferCents / 100)}` : null,
  o.riskTolerance ? `Risk tolerance: ${RISK_TOLERANCE_LABELS[o.riskTolerance] ?? o.riskTolerance}` : null,
].filter((v): v is string => Boolean(v));

function formCapture(kind: DoNothingFormKind, contextVersion: string, seed: Record<string, unknown>, label?: string): AskCaptureRequest {
  const yn = (key: string, name: string) => ({ key, label: name, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } });
  return {
    requirementId: `do-nothing-scenario-${kind.toLowerCase()}-inputs`, captureKey: DO_NOTHING_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: kind === 'CREATE' ? 'Add a do-nothing scenario' : `Change ${label ?? 'this scenario'}`, question: 'What should this scenario assume?',
    helpText: 'A scenario is a set of assumptions you can run later; saving it runs nothing. A blank keeps what is recorded. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'name', label: 'Name', required: kind === 'CREATE', inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 120 } },
      { key: 'horizonMonths', label: 'How far ahead (months)', required: kind === 'CREATE', inputSchema: { type: 'SINGLE_SELECT' as const, options: DO_NOTHING_HORIZONS.map((h) => ({ label: `${h} months`, value: String(h) })) } },
      yn('skipMaintenance', 'Skip routine maintenance'), yn('skipWarranty', 'Let warranties lapse'),
      { key: 'deductibleStrategy', label: 'Insurance deductible', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: DEDUCTIBLE_STRATEGIES.map((v) => ({ label: DEDUCTIBLE_LABELS[v], value: v })) } },
      { key: 'cashBuffer', label: 'Cash buffer for repairs ($)', required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 100_000_000 } },
      { key: 'riskTolerance', label: 'Risk tolerance', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: RISK_TOLERANCES.map((v) => ({ label: RISK_TOLERANCE_LABELS[v], value: v })) } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(seed).filter(([, v]) => v !== null && v !== undefined && v !== '')),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function doNothingScenarioResult(userId: string, propertyId: string, launch: { kind: DoNothingScenarioKind; entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change scenarios', 'Your role can view this home but not change it. Nothing has changed.');
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { doNothingLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `do-nothing-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  let current: Scenario | null = null;
  if (kind !== 'CREATE') {
    try { current = await loadScenario(propertyId, userId, launch.entityId); } catch (error) {
      if (error instanceof Error && error.message === 'Property not found or access denied.') return blocked('DO_NOTHING_PRIMARY_OWNER_ONLY', 'Only the home’s primary owner can change scenarios', 'Scenarios are kept for the home’s primary account holder. Nothing has changed.');
      throw error;
    }
    if (!current) return unavailable('DO_NOTHING_SCENARIO_NOT_FOUND', 'That scenario is no longer saved', 'Ask could not find that scenario. Nothing has changed.');
  }
  const contextVersion = versionOf(current, propertyId);

  if (kind === 'DELETE') {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'DO_NOTHING_SCENARIO_DELETE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { doNothingCommand: { kind, entityId: current!.id }, doNothingContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'do-nothing-delete-review', title: `Delete "${current!.name}"?`, body: 'Nothing changes until you confirm.', tone: 'CAUTION', actions: [] }],
      confirmation: confirmation(`delete-${sha(current!.id).slice(0, 12)}`, {
        title: `Delete "${current!.name}"?`, confirmLabel: 'Delete scenario',
        description: 'The saved assumptions are removed. Runs already computed from it are kept. This cannot be undone.', fields: [{ label: 'Scenario', value: current!.name }, { label: 'Horizon', value: `${current!.horizonMonths} months` }],
      }),
      suggestions: [],
    };
  }
  if (!supplied) {
    const seed = current ? {
      name: current.name, horizonMonths: String(current.horizonMonths), skipMaintenance: current.inputOverrides.skipMaintenance === undefined ? null : current.inputOverrides.skipMaintenance ? 'YES' : 'NO',
      skipWarranty: current.inputOverrides.skipWarranty === undefined ? null : current.inputOverrides.skipWarranty ? 'YES' : 'NO', deductibleStrategy: current.inputOverrides.deductibleStrategy ?? null,
      cashBuffer: current.inputOverrides.cashBufferCents === undefined ? null : current.inputOverrides.cashBufferCents / 100, riskTolerance: current.inputOverrides.riskTolerance ?? null,
    } : { horizonMonths: '12' };
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `DO_NOTHING_SCENARIO_${kind}_INPUT_REQUIRED`, contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'do-nothing-input', title: kind === 'CREATE' ? 'Add a do-nothing scenario' : current!.name, body: 'Nothing has been saved yet; you will review it first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(kind, contextVersion, seed, current?.name)], suggestions: [],
    };
  }
  const parsed = parseDoNothingScenarioAnswer(kind, supplied, current?.inputOverrides ?? {});
  if (!parsed.success) return unavailable('DO_NOTHING_SCENARIO_NOTHING_TO_CHANGE', 'Nothing to change', 'Change at least one thing. Nothing has changed.');
  const lines = showOverrides(parsed.data.inputOverrides);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `DO_NOTHING_SCENARIO_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { doNothingForm: supplied, doNothingCommand: { kind, entityId: current?.id ?? propertyId }, doNothingContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'do-nothing-review', title: kind === 'CREATE' ? 'Review the new scenario' : `Review the changes to "${current!.name}"`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(JSON.stringify([current?.id, supplied])).slice(0, 12)}`, {
      title: kind === 'CREATE' ? 'Save this scenario?' : 'Save these changes?', confirmLabel: 'Save scenario',
      description: 'A scenario is a set of assumptions. Saving it runs no simulation; run it from the simulator when you want figures.',
      fields: [
        { label: 'Name', value: parsed.data.name ?? current?.name ?? '' }, { label: 'Horizon', value: `${parsed.data.horizonMonths ?? current?.horizonMonths ?? ''} months` },
        ...(lines.length ? lines.map((line) => ({ label: 'Assumption', value: line })) : [{ label: 'Assumptions', value: 'The simulator’s defaults' }]),
      ],
    }),
    captureRequests: [formCapture(kind, contextVersion, supplied, current?.name)], suggestions: [],
  };
}

registerCapabilityHandler('do-nothing-scenario.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = doNothingScenarioKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'DO_NOTHING_SCENARIO_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== doNothingScenarioEntityType(kind)) {
    return unavailable('ASK_DO_NOTHING_SCENARIO_NOT_DIRECTLY_ROUTABLE', 'Open the simulator first', 'A scenario is added or changed from the simulator. Nothing has changed.');
  }
  return doNothingScenarioResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmDoNothingScenario(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.doNothingCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as DoNothingScenarioKind | undefined;
  if (!kind || !(kind in DO_NOTHING_SCENARIO_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string; let artifactId = command.entityId;
  try {
    let current: Scenario | null = null;
    if (kind !== 'CREATE') {
      current = await loadScenario(propertyId, userId, command.entityId);
      if (!current) throw stale('That scenario is no longer saved.');
    }
    if (parameters.doNothingContextVersion !== versionOf(current, propertyId)) throw stale('This scenario changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'DELETE') {
      await service().deleteScenario(propertyId, current!.id, userId);
      title = 'Scenario deleted'; artifactId = current!.id;
    } else {
      const parsed = parseDoNothingScenarioAnswer(kind, parameters.doNothingForm, current?.inputOverrides ?? {});
      if (!parsed.success) throw stale('The details to save are invalid.');
      if (kind === 'CREATE') {
        const created: any = await service().createScenario(propertyId, userId, { name: parsed.data.name!, horizonMonths: parsed.data.horizonMonths as never, inputOverrides: parsed.data.inputOverrides as never });
        artifactId = created.scenario?.id ?? propertyId; title = 'Scenario saved';
      } else {
        await service().updateScenario(propertyId, current!.id, userId, { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.horizonMonths !== undefined ? { horizonMonths: parsed.data.horizonMonths as never } : {}), inputOverrides: parsed.data.inputOverrides as never });
        artifactId = current!.id; title = 'Scenario updated';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `DO_NOTHING_SCENARIO_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `do-nothing-scenario-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description: 'No simulation was run. Run it from the simulator when you want figures.', details: [], actions: [{ ...backToSimulator, label: 'See the simulator', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `do-nothing-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'DO_NOTHING_SCENARIO', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('do-nothing-scenario.command', confirmDoNothingScenario);
