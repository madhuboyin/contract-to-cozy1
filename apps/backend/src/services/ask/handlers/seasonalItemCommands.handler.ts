// Seasonal checklist task controls inside Ask (register P2 "Seasonal Home Care"; FRD v1.343). Reached only by the declared row actions on a seasonal task.
// The writes are the seasonal routes' own services: addSeasonalTaskToMaintenance, SeasonalChecklistService.snoozeTask, dismissTask and restoreTask,
// behind a review that names the effect on the linked maintenance task, and a confirmation bound to the item.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { SeasonalChecklistService } from '../../seasonalChecklist.service';
import { addSeasonalTaskToMaintenance, removeSeasonalTaskFromMaintenance } from '../../seasonalChecklistIntegration.service';
import {
  SEASONAL_CHECKLIST_ENTITY_TYPE, SEASONAL_CHECKLIST_MESSAGES, seasonalChecklistKindFromMessage, seasonalChecklistKinds, type SeasonalChecklistKind,
  SEASONAL_ITEM_ENTITY_TYPE, SEASONAL_ITEM_MESSAGES, SEASONAL_SNOOZE_CAPTURE_KEY, SEASONAL_SNOOZE_CHOICES, parseSeasonalSnoozeAnswer, seasonalItemKindFromMessage,
  seasonalItemKinds, type SeasonalItemKind,
} from '../support/seasonalItemCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToSeasonal = { id: 'seasonal-item-back', label: 'Back to my seasonal tasks', interactionType: 'START_WORKFLOW' as const, message: 'Show my seasonal maintenance tasks', operationId: 'MAINTENANCE_STATUS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'seasonal-item-unavailable', title, body, tone: 'DEFAULT', actions: [backToSeasonal] }], suggestions: [],
});

interface ItemRow { id: string; title: string; status: string; priority: string; snoozedUntil: Date | null; updatedAt: Date; maintenanceTask: { id: string; status: string } | null }
async function loadItem(propertyId: string, id: string) {
  return (prisma as any).seasonalChecklistItem.findFirst({
    where: { id, propertyId },
    select: { id: true, title: true, status: true, priority: true, snoozedUntil: true, updatedAt: true, maintenanceTask: { select: { id: true, status: true } } },
  }) as Promise<ItemRow | null>;
}
const isPrimaryHolder = async (userId: string, propertyId: string) =>
  Boolean(await prisma.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
const itemVersion = (kind: SeasonalItemKind, item: ItemRow) =>
  sha(`seasonal-item:${kind}:${item.id}:${item.status}:${item.priority}:${item.snoozedUntil?.toISOString() ?? ''}:${item.maintenanceTask?.id ?? ''}:${item.maintenanceTask?.status ?? ''}:${item.updatedAt.toISOString()}`);
const completed = (item: ItemRow) => item.status === 'COMPLETED' || item.maintenanceTask?.status === 'COMPLETED';

function snoozeCapture(contextVersion: string, item: ItemRow): AskCaptureRequest {
  return {
    requirementId: 'seasonal-item-snooze-inputs', captureKey: SEASONAL_SNOOZE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: `Snooze ${item.title}`,
    question: 'How long should this wait?', helpText: 'It comes back on the list afterwards. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'days', label: 'Snooze for', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: SEASONAL_SNOOZE_CHOICES.map((c) => ({ label: c.label, value: c.value })) } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function seasonalItemResult(
  userId: string, propertyId: string, launch: { kind: SeasonalItemKind; entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'seasonal-item-permission', title: 'A contributor or owner can change seasonal tasks', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('SEASONAL_ITEM_NOT_FOUND', 'That seasonal task is no longer available', 'Ask could not find that task. Nothing has changed.');
  const kind = launch.kind;
  const primary = await isPrimaryHolder(userId, propertyId);
  const allowed = seasonalItemKinds({ status: item.status, priority: item.priority, maintenanceTaskId: item.maintenanceTask?.id ?? null, completed: completed(item) }, { canManage: true, isPrimaryHolder: primary });
  if (!allowed.includes(kind)) {
    const needsPrimary = !primary && ['SNOOZE', 'DISMISS', 'RESTORE'].includes(kind);
    return unavailable(needsPrimary ? 'SEASONAL_ITEM_PRIMARY_HOLDER_ONLY' : 'SEASONAL_ITEM_STEP_NOT_AVAILABLE',
      needsPrimary ? 'Only the home’s primary account holder can do that' : 'That is not available for this task now',
      needsPrimary ? 'Snoozing, setting aside and bringing back seasonal tasks is kept for the home’s primary account holder. Nothing has changed.'
        : kind === 'DISMISS' && item.priority === 'CRITICAL' ? 'High-priority seasonal tasks protect against damage and safety issues, so they cannot be set aside. Nothing has changed.' : 'Nothing has changed.');
  }
  const contextVersion = itemVersion(kind, item);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  let days: number | null = null;
  if (kind === 'SNOOZE') {
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'SEASONAL_ITEM_SNOOZE_INPUT_REQUIRED', contextVersion, parameters: { seasonalItemLaunch: { kind, entityId: item.id, sourceExecutionId: launch.sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'seasonal-item-input', title: item.title, body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [snoozeCapture(contextVersion, item)], suggestions: [],
      };
    }
    const parsed = parseSeasonalSnoozeAnswer(supplied);
    if (!parsed.success) return unavailable('SEASONAL_ITEM_INPUT_INVALID', 'Check the details', 'Choose how long to snooze. Nothing has changed.');
    days = Number(parsed.data.days);
  }
  const linked = item.maintenanceTask ? ' It is linked to a maintenance task, which is' : '';
  const spec = {
    ADD: { title: 'Add this task to your maintenance?', label: 'Add to maintenance', description: 'This creates a maintenance task for it and links the two. It does not schedule anyone.', field: { label: 'Task', value: 'Not in maintenance → In maintenance' } },
    SNOOZE: {
      title: 'Snooze this task?', label: 'Snooze it', description: `It comes back on the list after the snooze.${linked ? `${linked} snoozed with it.` : ''}`,
      field: { label: 'Snoozed until', value: `${item.snoozedUntil ? humanDate(item.snoozedUntil) : 'Not snoozed'} → ${humanDate(new Date(Date.now() + (days ?? 7) * 86_400_000))}` },
    },
    DISMISS: { title: 'Set this task aside for the season?', label: 'Set it aside', description: `You can bring it back later.${linked ? `${linked} cancelled while it is set aside.` : ''}`, field: { label: 'Task', value: 'On the list → Set aside' } },
    RESTORE: { title: 'Bring this task back?', label: 'Bring it back', description: `It returns to the season’s list.${item.maintenanceTask?.status === 'CANCELLED' ? ' Its cancelled maintenance task is reactivated.' : ''}`, field: { label: 'Task', value: 'Set aside → On the list' } },
    REMOVE: {
      title: 'Remove this task from your maintenance?', label: 'Remove from maintenance',
      description: 'This unlinks the maintenance task from the seasonal checklist and puts the seasonal task back as recommended. The maintenance task itself is not deleted: it stays in your maintenance list as a separate task, and this seasonal task will not be added to maintenance again on its own.',
      field: { label: 'Task', value: 'In maintenance → Recommended again (the maintenance task is kept)' },
    },
  }[kind];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SEASONAL_ITEM_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { seasonalItemCommand: { kind, entityId: item.id }, ...(days ? { seasonalItemDays: days } : {}), seasonalItemContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'seasonal-item-review', title: item.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `seasonal-item-${kind.toLowerCase()}-${sha(`${item.id}:${days ?? ''}`).slice(0, 12)}-1`, version: 1, title: spec.title, description: spec.description,
      fields: [{ label: 'Seasonal task', value: item.title }, spec.field], editableFields: [], confirmLabel: spec.label,
      consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    ...(kind === 'SNOOZE' ? { captureRequests: [snoozeCapture(contextVersion, item)] } : {}),
    suggestions: [],
  };
}

interface ChecklistRow { id: string; season: string; year: number; status: string; updatedAt: Date; items: Array<{ id: string; title: string; status: string; priority: string }> }
async function loadChecklist(propertyId: string, id: string): Promise<ChecklistRow | null> {
  return prisma.seasonalChecklist.findFirst({
    where: { id, propertyId },
    select: { id: true, season: true, year: true, status: true, updatedAt: true, items: { select: { id: true, title: true, status: true, priority: true } } },
  }) as Promise<ChecklistRow | null>;
}
const checklistVersion = (kind: SeasonalChecklistKind, checklist: ChecklistRow) =>
  sha(`seasonal-checklist:${kind}:${checklist.id}:${checklist.status}:${checklist.updatedAt.toISOString()}:${[...checklist.items].map((item) => `${item.id}.${item.status}.${item.priority}`).sort().join(',')}`);
const checklistLabel = (checklist: ChecklistRow) => `${checklist.season.charAt(0)}${checklist.season.slice(1).toLowerCase()} ${checklist.year}`;
const waitingCritical = (checklist: ChecklistRow) => checklist.items.filter((item) => item.priority === 'CRITICAL' && item.status === 'RECOMMENDED');
const waitingToSetAside = (checklist: ChecklistRow) => checklist.items.filter((item) => item.status === 'RECOMMENDED');
const listTitles = (items: Array<{ title: string }>) => `${items.slice(0, 8).map((item) => item.title).join('; ')}${items.length > 8 ? `; and ${items.length - 8} more` : ''}`;

/** The whole-checklist controls: review (names exactly which tasks the canonical service would touch), then a confirmation bound to the checklist's state. */
export async function seasonalChecklistResult(userId: string, propertyId: string, launch: { kind: SeasonalChecklistKind; entityId: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'seasonal-checklist-permission', title: 'A contributor or owner can change seasonal checklists', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'DEFAULT', actions: [backToSeasonal] }], suggestions: [] };
  }
  const checklist = await loadChecklist(propertyId, launch.entityId);
  if (!checklist) return unavailable('SEASONAL_CHECKLIST_NOT_FOUND', 'That seasonal checklist is no longer available', 'Ask could not find that checklist. Nothing has changed.');
  const primary = await isPrimaryHolder(userId, propertyId);
  const { kind } = launch;
  if (!seasonalChecklistKinds({ status: checklist.status, items: checklist.items }, { canManage: true, isPrimaryHolder: primary }).includes(kind)) {
    return unavailable(!primary ? 'SEASONAL_CHECKLIST_PRIMARY_HOLDER_ONLY' : 'SEASONAL_CHECKLIST_STEP_NOT_AVAILABLE',
      !primary ? 'Only the home’s primary account holder can do that' : 'That is not available for this checklist now',
      !primary ? 'Adding every critical task and dismissing a whole seasonal checklist are kept for the home’s primary account holder. Nothing has changed.'
        : kind === 'ADD_ALL_CRITICAL' ? 'No high-priority task is waiting on this checklist. Nothing has changed.' : 'This checklist is already dismissed. Nothing has changed.');
  }
  const contextVersion = checklistVersion(kind, checklist);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const label = checklistLabel(checklist);
  const critical = waitingCritical(checklist);
  const toSetAside = waitingToSetAside(checklist);
  const spec = kind === 'ADD_ALL_CRITICAL'
    ? {
      title: `Add all ${critical.length} critical ${label} tasks to your maintenance?`, confirmLabel: 'Add them all',
      description: 'Each high-priority task that is still waiting on this checklist is added to your maintenance and linked to its seasonal task. Nothing is scheduled with anyone. A task that cannot be added is skipped and reported.',
      fields: [{ label: 'Checklist', value: label }, { label: 'Tasks to add', value: listTitles(critical) }],
    }
    : {
      title: `Dismiss the ${label} checklist?`, confirmLabel: 'Dismiss this season',
      description: `The checklist is marked dismissed and every task still waiting on it is set aside, including high-priority ones. Tasks already added to maintenance are not changed.${toSetAside.length ? '' : ' No task is waiting.'} Individual set-aside tasks can be brought back; the checklist itself is not offered again here.`,
      fields: [{ label: 'Checklist', value: label }, { label: 'Tasks set aside', value: toSetAside.length ? `${toSetAside.length}: ${listTitles(toSetAside)}` : 'None waiting' }],
    };
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SEASONAL_CHECKLIST_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { seasonalChecklistCommand: { kind, entityId: checklist.id }, seasonalChecklistContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'seasonal-checklist-review', title: `${label} checklist`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `seasonal-checklist-${kind.toLowerCase()}-${sha(checklist.id).slice(0, 12)}-1`, version: 1, title: spec.title, description: spec.description,
      fields: spec.fields, editableFields: [], confirmLabel: spec.confirmLabel,
      consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmSeasonalChecklist(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.seasonalChecklistCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as SeasonalChecklistKind | undefined;
  if (!kind || !(kind in SEASONAL_CHECKLIST_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const checklist = await loadChecklist(propertyId, command.entityId);
  if (!checklist) throw stale('That seasonal checklist is no longer available.');
  if (parameters.seasonalChecklistContextVersion !== checklistVersion(kind, checklist)) throw stale('This checklist changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const primary = await isPrimaryHolder(userId, propertyId);
  if (!seasonalChecklistKinds({ status: checklist.status, items: checklist.items }, { canManage: true, isPrimaryHolder: primary }).includes(kind)) throw stale('That change is not available for this checklist now.');
  const label = checklistLabel(checklist);
  let title: string;
  let description: string;
  try {
    if (kind === 'ADD_ALL_CRITICAL') {
      const expected = waitingCritical(checklist).length;
      const added = await SeasonalChecklistService.addAllCriticalTasks(checklist.id, userId);
      title = added.tasksAdded === expected ? `Added ${added.tasksAdded} critical ${added.tasksAdded === 1 ? 'task' : 'tasks'}` : `Added ${added.tasksAdded} of ${expected} critical tasks`;
      description = added.tasksAdded === expected ? 'They are in your maintenance and linked to the seasonal checklist.' : 'The others could not be added and were skipped. Ask for your seasonal tasks to see which are still waiting.';
    } else {
      await SeasonalChecklistService.dismissChecklist(checklist.id, userId);
      title = `${label} checklist dismissed`;
      description = 'The tasks that were waiting are set aside. Tasks already in maintenance were not changed.';
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SEASONAL_CHECKLIST_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `seasonal-checklist-${kind.toLowerCase()}-${checklist.id}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToSeasonal, label: 'See my seasonal tasks' }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `seasonal-checklist-refresh-failed-${checklist.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'SEASONAL_CHECKLIST', artifactId: checklist.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('seasonal-item.command', async (envelope) => {
  const launch = envelope.launchContext;
  const checklistKind = seasonalChecklistKindFromMessage(envelope.message);
  if (checklistKind && launch?.operationId === 'SEASONAL_ITEM_COMMAND' && launch.surface !== 'ASK_REFRESH' && launch.entityType === SEASONAL_CHECKLIST_ENTITY_TYPE && launch.entityId) {
    return seasonalChecklistResult(envelope.userId, envelope.propertyId!, { kind: checklistKind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
  }
  const kind = seasonalItemKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'SEASONAL_ITEM_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== SEASONAL_ITEM_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_SEASONAL_ITEM_NOT_DIRECTLY_ROUTABLE', 'Open your seasonal tasks first', 'A seasonal task is changed from your seasonal task list. Nothing has changed.');
  }
  return seasonalItemResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmSeasonalItem(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.seasonalItemCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as SeasonalItemKind | undefined;
  if (!kind || !(kind in SEASONAL_ITEM_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  try {
    const item = await loadItem(propertyId, command.entityId);
    if (!item) throw stale('That seasonal task is no longer available.');
    if (parameters.seasonalItemContextVersion !== itemVersion(kind, item)) throw stale('This task changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const primary = await isPrimaryHolder(userId, propertyId);
    if (!seasonalItemKinds({ status: item.status, priority: item.priority, maintenanceTaskId: item.maintenanceTask?.id ?? null, completed: completed(item) }, { canManage: true, isPrimaryHolder: primary }).includes(kind)) {
      throw stale('That change is not available for this task now.');
    }
    if (kind === 'ADD') {
      const added = await addSeasonalTaskToMaintenance(userId, item.id);
      if (!added.success) throw stale(added.message);
      title = 'Added to maintenance';
    } else if (kind === 'REMOVE') {
      const removed = await removeSeasonalTaskFromMaintenance(userId, item.id);
      if (!removed.success) throw stale(removed.message);
      title = 'Removed from maintenance';
    } else if (kind === 'SNOOZE') {
      const days = Number(parameters.seasonalItemDays);
      if (![7, 14, 30].includes(days)) throw stale('The snooze to apply is invalid.');
      await SeasonalChecklistService.snoozeTask(item.id, userId, days);
      title = 'Snoozed';
    } else if (kind === 'DISMISS') {
      await SeasonalChecklistService.dismissTask(item.id, userId);
      title = 'Set aside';
    } else {
      await SeasonalChecklistService.restoreTask(item.id, userId);
      title = 'Brought back';
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SEASONAL_ITEM_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `seasonal-item-${kind.toLowerCase()}-${command.entityId}`, title, status: 'COMPLETED', description: kind === 'REMOVE' ? 'The maintenance task was kept and is no longer linked to this seasonal task.' : 'It is on your seasonal checklist.', details: [], actions: [{ ...backToSeasonal, label: 'See my seasonal tasks', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `seasonal-item-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'SEASONAL_CHECKLIST_ITEM', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('seasonal-item.command', (ctx) => (ctx.parameters.seasonalChecklistCommand ? confirmSeasonalChecklist(ctx) : confirmSeasonalItem(ctx)));
