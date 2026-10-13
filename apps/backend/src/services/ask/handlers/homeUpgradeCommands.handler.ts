// Manage saved Home Upgrade Planner options inside Ask (register P0 "Home Digital Twin / Upgrade Planner"; FRD v1.316).
//
// Reached only by declared row actions on the upgrade options answer. Each goes through HomeDigitalTwinScenarioService, the same methods the planner's
// scenario routes call (their controllers add no gate or analytics), behind a review card and a confirmation: Record my decision, Rename, Archive,
// Restore, Recalculate (queues the planner's calculation job; results arrive later and the answer says so) and Delete (archived options only, and never
// one a project was created from, as the service enforces). A decision is the homeowner's own: it does not commit to or start any work.
//
// Not here: creating a new option (a per-type input payload, its own slice), the handoff to a project, and the component comparison options.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HomeDigitalTwinScenarioService } from '../../homeDigitalTwinScenario.service';
import JobQueueService from '../../JobQueue.service';
import {
  UPGRADE_COMMAND_ACTION_IDS, UPGRADE_COMMAND_MESSAGES, UPGRADE_DECISIONS, UPGRADE_DECISION_OPTION_LABELS, UPGRADE_FORM_CAPTURE_KEYS, UPGRADE_SCENARIO_ENTITY_TYPE,
  parseUpgradeFormAnswer, upgradeCommandKindFromMessage, upgradeCommandOpensForm, type UpgradeCommandKind, type UpgradeDecisionInput, type UpgradeFormData, type UpgradeRenameInput,
} from '../support/homeUpgradeCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;
const service = new HomeDigitalTwinScenarioService();

export interface UpgradeCommandLaunch { kind: UpgradeCommandKind; entityId: string; sourceExecutionId: string | null }

const backToOptions = { id: 'home-upgrade-back', label: 'Back to my upgrade options', interactionType: 'START_WORKFLOW' as const, message: 'Show my upgrade planner options', operationId: 'HOME_UPGRADE_SCENARIOS' as const, style: 'SECONDARY' as const };
const DECISION_LABELS: Record<string, string> = { OPEN: 'Still deciding', SELECTED: 'Selected', DEFERRED: 'Deferred', REJECTED: 'Rejected', CLOSED: 'Closed' };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'home-upgrade-permission', title: 'A contributor or owner can change an upgrade option', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_HOME_UPGRADE_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'home-upgrade-not-routable', title: 'Open your upgrade options first', body: 'An option is changed from your list of upgrade options. Nothing has changed.', tone: 'DEFAULT', actions: [backToOptions] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-upgrade-unavailable', title, body, tone: 'DEFAULT', actions: [backToOptions] }], suggestions: [],
});

type ScenarioRow = { id: string; name: string; description: string | null; status: string; decisionStatus: string; decisionReason: string | null; isArchived: boolean; updatedAt: Date; digitalTwinId: string };
async function loadScenario(propertyId: string, scenarioId: string): Promise<ScenarioRow | null> {
  return database.homeTwinScenario.findFirst({
    where: { id: scenarioId, digitalTwin: { propertyId } },
    select: { id: true, name: true, description: true, status: true, decisionStatus: true, decisionReason: true, isArchived: true, updatedAt: true, digitalTwinId: true },
  });
}
/** Bound to the option's last change, status and decision, so a confirmation opened before it changed is refused as out of date. */
export const upgradeCommandContextVersion = (scenario: ScenarioRow) =>
  sha(`home-upgrade:${scenario.id}:${scenario.updatedAt.toISOString()}:${scenario.status}:${scenario.decisionStatus}:${scenario.isArchived}`);

function formCapture(kind: 'DECIDE' | 'RENAME', contextVersion: string, scenario: ScenarioRow, entered?: Record<string, unknown>): AskCaptureRequest {
  const base = { classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, allowNotSure: false, sensitivity: 'FINANCIAL' as const, confirmationText: null, expectedContextVersion: contextVersion };
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  if (kind === 'RENAME') {
    return { ...base, requirementId: 'home-upgrade-rename-inputs', captureKey: UPGRADE_FORM_CAPTURE_KEYS.RENAME, title: `Rename ${scenario.name}`, question: 'What should this option be called?',
      helpText: 'Only the name and note change. The calculation is not affected.',
      inputSchema: { type: 'GROUP', fields: [
        { key: 'name', label: 'Name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } },
        { key: 'description', label: 'Note', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      ] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered ?? { name: scenario.name, description: scenario.description }), destinationLabel: 'Renames the option after confirmation' };
  }
  return { ...base, requirementId: 'home-upgrade-decide-inputs', captureKey: UPGRADE_FORM_CAPTURE_KEYS.DECIDE, title: `Your decision: ${scenario.name}`, question: 'Where do you stand on this option?',
    helpText: 'A decision is your own record. It does not start any work or commit you to anything. A reason is needed to defer or reject.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'decisionStatus', label: 'Decision', required: true, inputSchema: { type: 'SINGLE_SELECT', options: UPGRADE_DECISIONS.map((value) => ({ label: UPGRADE_DECISION_OPTION_LABELS[value], value })) } },
      { key: 'decisionReason', label: 'Why', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered ?? { decisionStatus: scenario.decisionStatus, decisionReason: scenario.decisionReason }), destinationLabel: 'Records your decision after confirmation' };
}

export async function upgradeCommandResult(userId: string, propertyId: string, launch: UpgradeCommandLaunch, supplied?: UpgradeFormData): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const scenario = await loadScenario(propertyId, launch.entityId);
  if (!scenario) return unavailable('HOME_UPGRADE_NOT_FOUND', 'That option is no longer available', 'Ask could not find that upgrade option. It may have been removed. Nothing has changed.');
  const kind = launch.kind;
  const contextVersion = upgradeCommandContextVersion(scenario);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { homeUpgradeLaunch: { kind, entityId: scenario.id, sourceExecutionId: launch.sourceExecutionId } };
  const review = (title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, parameters: Record<string, unknown>,
    capture?: AskCaptureRequest, tone: 'DEFAULT' | 'CAUTION' = 'DEFAULT'): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_UPGRADE_COMMAND_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homeUpgradeCommand: { kind, entityId: scenario.id }, homeUpgradeContextVersion: contextVersion, ...parameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'home-upgrade-command-review', title, body: description, tone, actions: [] }],
    confirmation: {
      confirmationId: `home-upgrade-${sha(`${propertyId}:${kind}:${scenario.id}:${JSON.stringify(parameters)}`).slice(0, 12)}-1`, version: 1, title, description,
      fields: [{ label: 'Option', value: scenario.name }, ...fields], editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared upgrade plan.', expiresAt: expiresAt.toISOString(),
    },
    ...(capture ? { captureRequests: [capture] } : {}),
    suggestions: [],
  });

  if (kind === 'DECIDE') {
    if (scenario.isArchived) return unavailable('HOME_UPGRADE_ARCHIVED', 'This option is archived', 'Restore it before recording a decision. Nothing has changed.');
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'HOME_UPGRADE_DECIDE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'home-upgrade-decide-input', title: `Your decision: ${scenario.name}`, body: `Currently: ${DECISION_LABELS[scenario.decisionStatus] ?? scenario.decisionStatus}.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('DECIDE', contextVersion, scenario)], suggestions: [],
      };
    }
    const input = supplied as UpgradeDecisionInput;
    return review(`Record "${DECISION_LABELS[input.decisionStatus]}" for ${scenario.name}?`, 'This is your own record of where you stand. It does not start any work, commit you to a contractor or change the calculation.', 'Record decision',
      [{ label: 'Decision', value: `${DECISION_LABELS[scenario.decisionStatus] ?? scenario.decisionStatus} → ${DECISION_LABELS[input.decisionStatus]}` }, ...(input.decisionReason ? [{ label: 'Why', value: input.decisionReason }] : [])],
      { homeUpgradeDecision: input }, formCapture('DECIDE', contextVersion, scenario, input as unknown as Record<string, unknown>));
  }
  if (kind === 'RENAME') {
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'HOME_UPGRADE_RENAME_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'home-upgrade-rename-input', title: `Rename ${scenario.name}`, body: 'Change the name or the note, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('RENAME', contextVersion, scenario)], suggestions: [],
      };
    }
    const input = supplied as UpgradeRenameInput;
    if (input.name === scenario.name && (input.description ?? null) === (scenario.description ?? null)) return unavailable('HOME_UPGRADE_RENAME_NO_CHANGE', 'Nothing to change', 'The name and note match what is already saved. Nothing has changed.');
    return review(`Rename to "${input.name}"?`, 'Only the name and note change; the calculation is not affected.', 'Save name',
      [{ label: 'Name', value: `${scenario.name} → ${input.name}` }, ...((input.description ?? null) !== (scenario.description ?? null) ? [{ label: 'Note', value: input.description ?? 'None' }] : [])],
      { homeUpgradeRename: input }, formCapture('RENAME', contextVersion, scenario, input as unknown as Record<string, unknown>));
  }
  if (kind === 'ARCHIVE') {
    if (scenario.isArchived) return unavailable('HOME_UPGRADE_ALREADY_ARCHIVED', 'Already archived', 'Nothing has changed.');
    return review(`Archive ${scenario.name}?`, 'It leaves your active options and can be restored. Its calculation and decision are kept.', 'Archive option', [], {});
  }
  if (kind === 'RESTORE') {
    if (!scenario.isArchived) return unavailable('HOME_UPGRADE_NOT_ARCHIVED', 'This option is not archived', 'Nothing has changed.');
    return review(`Restore ${scenario.name}?`, 'It returns to your active options.', 'Restore option', [], {});
  }
  if (kind === 'COMPUTE') {
    if (scenario.isArchived) return unavailable('HOME_UPGRADE_ARCHIVED', 'This option is archived', 'Restore it before recalculating. Nothing has changed.');
    return review(`Recalculate ${scenario.name}?`, 'This queues the planner’s calculation from your home’s current records. The results arrive after a short wait; ask for your options again to see them. Earlier results stay until the new ones are ready.', 'Recalculate', [], {});
  }
  // DELETE
  if (!scenario.isArchived) return unavailable('HOME_UPGRADE_NOT_ARCHIVED', 'Archive this option before deleting it', 'Deleting is a second step after the reversible archive. Nothing has changed.');
  return review(`Delete ${scenario.name}?`, 'The option, its calculation results and its history are removed for good, which cannot be undone. An option a project was created from cannot be deleted.', 'Delete option', [], {}, undefined, 'CAUTION');
}

registerCapabilityHandler('home-digital-twin.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = upgradeCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'HOME_UPGRADE_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== UPGRADE_SCENARIO_ENTITY_TYPE || !launch.entityId) return notRoutable();
  return upgradeCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmUpgradeCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.homeUpgradeCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as UpgradeCommandKind | undefined;
  if (!kind || !(kind in UPGRADE_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const scenario = await loadScenario(propertyId, command.entityId);
  if (!scenario) throw stale('That option is no longer available.');
  if (parameters.homeUpgradeContextVersion !== upgradeCommandContextVersion(scenario)) {
    throw stale('This option changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  try {
    let title: string; let description: string;
    if (kind === 'DECIDE') {
      const checked = parseUpgradeFormAnswer('DECIDE', parameters.homeUpgradeDecision);
      if (!checked.success) throw stale('The decision to record is invalid.');
      const input = checked.data as UpgradeDecisionInput;
      await service.recordDecision(scenario.id, scenario.digitalTwinId, { decisionStatus: input.decisionStatus as never, decisionReason: input.decisionReason, userId });
      title = 'Decision recorded'; description = 'Your decision is saved. No work was started.';
    } else if (kind === 'RENAME') {
      const checked = parseUpgradeFormAnswer('RENAME', parameters.homeUpgradeRename);
      if (!checked.success) throw stale('The name to save is invalid.');
      const input = checked.data as UpgradeRenameInput;
      await service.updateScenario(scenario.id, scenario.digitalTwinId, { name: input.name, description: input.description } as never);
      title = 'Option renamed'; description = 'The name and note are saved.';
    } else if (kind === 'ARCHIVE' || kind === 'RESTORE') {
      await service.updateScenario(scenario.id, scenario.digitalTwinId, { isArchived: kind === 'ARCHIVE' } as never);
      title = kind === 'ARCHIVE' ? 'Option archived' : 'Option restored'; description = kind === 'ARCHIVE' ? 'It can be restored from your archived options.' : 'It is back in your active options.';
    } else if (kind === 'COMPUTE') {
      await service.getScenario(scenario.id, scenario.digitalTwinId);
      await JobQueueService.enqueueHomeDigitalTwinScenarioCompute(propertyId, scenario.digitalTwinId, scenario.id);
      title = 'Recalculation queued'; description = 'The results will update in a moment. Ask for your upgrade options again to see them.';
    } else {
      await service.deleteScenario(scenario.id, scenario.digitalTwinId, propertyId);
      title = 'Option deleted'; description = 'The option and its results were removed.';
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `HOME_UPGRADE_COMMAND_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-upgrade-command-${kind.toLowerCase()}-${scenario.id}`, title, status: 'COMPLETED', description,
        details: [{ label: 'Option', value: scenario.name }], actions: [{ ...backToOptions, label: 'See my upgrade options', style: 'PRIMARY' as const }] }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `home-upgrade-refresh-failed-${scenario.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'HOME_UPGRADE_SCENARIO', artifactId: scenario.id, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('home-digital-twin.command', confirmUpgradeCommand);
