// Correct and refresh the Status Board inside Ask (register P1 "Status Board"; FRD v1.319). Reached only by declared actions on the status board answer:
// "Refresh the board" (a summary action) and "Correct this item" (a row action). The correction goes through the same patchItemStatus the page's route
// calls (the override is recorded as a user override event and never replaces the computed estimate), and the refresh through ensureHomeItems +
// computeStatuses, exactly the route's recompute. Both behind a review card and a confirmation.
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
import { humanDate } from '../askFormatting';
import { computeStatuses, ensureHomeItems, patchItemStatus } from '../../homeStatusBoard.service';
import {
  CONDITION_LABELS, CONDITION_OVERRIDES, RECOMMENDATION_LABELS, RECOMMENDATION_OVERRIDES, STATUS_BOARD_COMMAND_ACTION_IDS, STATUS_BOARD_COMMAND_MESSAGES,
  STATUS_BOARD_CORRECT_CAPTURE_KEY, STATUS_BOARD_ITEM_ENTITY_TYPE, STATUS_BOARD_PROPERTY_ENTITY_TYPE, USE_ESTIMATE, parseStatusBoardCorrectAnswer,
  statusBoardCommandKindFromMessage, type StatusBoardCommandKind, type StatusBoardPatch,
} from '../support/statusBoardCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface StatusBoardCommandLaunch { kind: StatusBoardCommandKind; entityId: string; sourceExecutionId: string | null }

const backToBoard = { id: 'status-board-back', label: 'Back to the status board', interactionType: 'START_WORKFLOW' as const, message: 'Show my status board', operationId: 'HOME_STATUS_BOARD' as const, style: 'PRIMARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'status-board-permission', title: 'A contributor or owner can change the status board', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_STATUS_BOARD_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'status-board-not-routable', title: 'Open the status board first', body: 'An item is corrected from the status board. Nothing has changed.', tone: 'DEFAULT', actions: [backToBoard] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'status-board-unavailable', title, body, tone: 'DEFAULT', actions: [backToBoard] }], suggestions: [],
});

type ItemRow = { id: string; displayName: string | null; categoryKey: string | null; status: { overrideCondition: string | null; overrideRecommendation: string | null; overrideNotes: string | null; isPinned: boolean; isHidden: boolean; updatedAt: Date } | null };
async function loadItem(propertyId: string, itemId: string): Promise<ItemRow | null> {
  return database.homeItem.findFirst({
    where: { id: itemId, propertyId },
    select: { id: true, displayName: true, categoryKey: true, status: { select: { overrideCondition: true, overrideRecommendation: true, overrideNotes: true, isPinned: true, isHidden: true, updatedAt: true } } },
  });
}
const itemName = (item: ItemRow) => item.displayName || String(item.categoryKey ?? 'This item').toLowerCase().replace(/_/g, ' ');
const itemVersion = (item: ItemRow) => sha(`status-board-item:${item.id}:${item.status?.updatedAt.toISOString() ?? ''}`);

function formCapture(item: ItemRow, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const select = (key: string, label: string, values: readonly string[], labels: Record<string, string>) =>
    ({ key, label, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Use the estimate', value: USE_ESTIMATE }, ...values.map((value) => ({ label: labels[value] ?? value, value }))] } });
  const date = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } });
  return {
    requirementId: 'status-board-correct-inputs', captureKey: STATUS_BOARD_CORRECT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Correct ${itemName(item)}`, question: 'What do you know that the estimate does not?',
    helpText: 'Fill in only what you want to change; blanks are left alone. Your correction sits beside the estimate and does not erase it. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      select('condition', 'Condition', CONDITION_OVERRIDES, CONDITION_LABELS), select('recommendation', 'Recommendation', RECOMMENDATION_OVERRIDES, RECOMMENDATION_LABELS),
      date('installedAt', 'Installed on'), date('purchaseDate', 'Purchased on'),
      { key: 'notes', label: 'Note', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'pinned', label: 'Pin to the top', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Pin it', value: 'PIN' }, { label: 'Unpin it', value: 'UNPIN' }] } },
      { key: 'hidden', label: 'Visibility', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Hide it from the board', value: 'HIDE' }, { label: 'Show it', value: 'SHOW' }] } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Records your correction after confirmation', confirmationText: null,
    expectedContextVersion: contextVersion,
  } as AskCaptureRequest;
}

function patchFields(patch: StatusBoardPatch): Array<{ label: string; value: string }> {
  const day = (iso?: string) => (iso ? humanDate(new Date(iso)) ?? iso : null);
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Condition', value: patch.overrideCondition === undefined ? null : patch.overrideCondition === null ? 'Back to the estimate' : CONDITION_LABELS[patch.overrideCondition] },
    { label: 'Recommendation', value: patch.overrideRecommendation === undefined ? null : patch.overrideRecommendation === null ? 'Back to the estimate' : RECOMMENDATION_LABELS[patch.overrideRecommendation] },
    { label: 'Installed on', value: day(patch.overrideInstalledAt) }, { label: 'Purchased on', value: day(patch.overridePurchaseDate) },
    { label: 'Note', value: patch.overrideNotes ?? null },
    { label: 'Pinned', value: patch.isPinned === undefined ? null : patch.isPinned ? 'Pinned' : 'Unpinned' },
    { label: 'Visibility', value: patch.isHidden === undefined ? null : patch.isHidden ? 'Hidden from the board' : 'Shown on the board' },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}
/** The form's own shape for a stored patch, so a stored review re-validates through the same schema as the form. */
function patchFormAnswer(patch: StatusBoardPatch): Record<string, unknown> {
  return {
    condition: patch.overrideCondition === undefined ? null : patch.overrideCondition ?? USE_ESTIMATE,
    recommendation: patch.overrideRecommendation === undefined ? null : patch.overrideRecommendation ?? USE_ESTIMATE,
    installedAt: patch.overrideInstalledAt ? patch.overrideInstalledAt.slice(0, 10) : null, purchaseDate: patch.overridePurchaseDate ? patch.overridePurchaseDate.slice(0, 10) : null,
    notes: patch.overrideNotes ?? null, pinned: patch.isPinned === undefined ? null : patch.isPinned ? 'PIN' : 'UNPIN', hidden: patch.isHidden === undefined ? null : patch.isHidden ? 'HIDE' : 'SHOW',
  };
}

export async function statusBoardCommandResult(userId: string, propertyId: string, launch: StatusBoardCommandLaunch, supplied?: StatusBoardPatch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  if (kind === 'REFRESH') {
    const contextVersion = sha(`status-board-refresh:${propertyId}`);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'STATUS_BOARD_REFRESH_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { statusBoardCommand: { kind, entityId: propertyId }, statusBoardContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'status-board-refresh-review', title: 'Refresh the status board?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `status-board-refresh-${sha(propertyId).slice(0, 12)}-1`, version: 1, title: 'Refresh the status board?',
        description: 'This recomputes every item’s estimated condition and recommendation from your current records. Your own corrections stay as they are.',
        fields: [], editableFields: [], confirmLabel: 'Refresh board', consentText: 'I authorize recomputing the shared status board.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }
  const item = await loadItem(propertyId, launch.entityId);
  if (!item || !item.status) return unavailable('STATUS_BOARD_ITEM_NOT_FOUND', 'That item is no longer on the board', 'Ask could not find that item. Nothing has changed.');
  const contextVersion = itemVersion(item);
  const launchParameters = { statusBoardCommandLaunch: { kind, entityId: item.id, sourceExecutionId: launch.sourceExecutionId } };
  const current = {
    condition: item.status.overrideCondition, recommendation: item.status.overrideRecommendation, notes: item.status.overrideNotes,
    pinned: item.status.isPinned ? 'PIN' : null, hidden: item.status.isHidden ? 'HIDE' : null,
  };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'STATUS_BOARD_CORRECT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'status-board-correct-input', title: `Correct ${itemName(item)}`, body: 'Fill in only what you want to change. Your correction sits beside the estimate and does not erase it.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(item, contextVersion, current)], suggestions: [],
    };
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'STATUS_BOARD_CORRECT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { statusBoardCorrect: patchFormAnswer(supplied), statusBoardCommand: { kind, entityId: item.id }, statusBoardContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'status-board-correct-review', title: `Review the correction to ${itemName(item)}`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `status-board-correct-${sha(`${propertyId}:${item.id}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1, title: `Save the correction to ${itemName(item)}?`,
      description: 'Your correction is recorded beside the estimate and shown on the board; the estimate is not erased.', fields: patchFields(supplied), editableFields: [],
      confirmLabel: 'Save correction', consentText: 'I authorize this correction on the shared status board.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(item, contextVersion, patchFormAnswer(supplied))], suggestions: [],
  };
}

registerCapabilityHandler('status-board.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = statusBoardCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'STATUS_BOARD_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  const entityType = kind === 'REFRESH' ? STATUS_BOARD_PROPERTY_ENTITY_TYPE : STATUS_BOARD_ITEM_ENTITY_TYPE;
  if (launch.entityType !== entityType) return notRoutable();
  return statusBoardCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmStatusBoardCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.statusBoardCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as StatusBoardCommandKind | undefined;
  if (!kind || !(kind in STATUS_BOARD_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  try {
    let title: string; let description: string; let artifactId = command.entityId;
    if (kind === 'REFRESH') {
      await ensureHomeItems(propertyId);
      await computeStatuses(propertyId);
      title = 'Status board refreshed'; description = 'Every item’s estimate is recomputed from your current records. Your corrections were kept.';
    } else {
      const item = await loadItem(propertyId, command.entityId);
      if (!item || !item.status) throw stale('That item is no longer on the board.');
      if (parameters.statusBoardContextVersion !== itemVersion(item)) {
        throw stale('This item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const checked = parseStatusBoardCorrectAnswer(parameters.statusBoardCorrect);
      if (!checked.success) throw stale('The correction to save is invalid.');
      await patchItemStatus(item.id, propertyId, userId, checked.data as never);
      artifactId = item.id;
      title = 'Correction saved'; description = 'It is shown beside the estimate on the board.';
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `STATUS_BOARD_COMMAND_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `status-board-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToBoard, label: 'See the status board' }] }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `status-board-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'HOME_ITEM_STATUS', artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('status-board.command', confirmStatusBoardCommand);
