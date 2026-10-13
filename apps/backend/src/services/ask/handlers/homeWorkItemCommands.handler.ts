// Snooze, reschedule and bulk-accept Home Operations work inside Ask (register P2 "Maintenance and Home Operations"; FRD v1.342). Reached only by the
// declared actions on the work-items answer. The writes are the routes' own usecases (snoozeWorkItem, rescheduleWorkItem, batchTransitionWorkItems),
// behind a review that names what changes and a confirmation bound to the item (or, for the batch, the exact eligible set).
import crypto, { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getWorkItem as loadWorkItem } from '../../../modules/homeOperations/application/getWorkItem.usecase';
import { listWorkItems } from '../../../modules/homeOperations/application/listWorkItems.usecase';
import { snoozeWorkItem } from '../../../modules/homeOperations/application/snoozeWorkItem.usecase';
import { rescheduleWorkItem } from '../../../modules/homeOperations/application/rescheduleWorkItem.usecase';
import { batchTransitionWorkItems } from '../../../modules/homeOperations/application/batchTransitionWorkItems.usecase';
import {
  SNOOZE_CHOICES, WORK_ITEM_BATCH_MAX, WORK_ITEM_ENTITY_TYPE, WORK_ITEM_FORM_CAPTURE_KEYS, WORK_ITEM_MESSAGES, parseWorkItemAnswer, snoozeUntil, workItemBatchEligible,
  workItemChangeable, workItemKindFromMessage, type WorkItemCommandKind, type WorkItemFormKind,
} from '../support/homeWorkItemCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToList = { id: 'home-work-items-back', label: 'Back to my work items', interactionType: 'START_WORKFLOW' as const, message: 'Show my home operations work items', operationId: 'HOME_WORK_ITEMS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-work-item-unavailable', title, body, tone: 'DEFAULT', actions: [backToList] }], suggestions: [],
});
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : '');
const dayOf = (value: string) => humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value;

interface ItemRow { id: string; propertyId: string; title: string; state: string; safetyTier: string; dueAt: Date | null; dueWindowStart: Date | null; dueWindowEnd: Date | null; snoozedUntil: Date | null; supersededByWorkItemId: string | null; ownerUserId: string | null }
const itemVersion = (kind: string, item: ItemRow) =>
  sha(`work-item:${kind}:${item.id}:${item.state}:${iso(item.dueAt)}:${iso(item.dueWindowStart)}:${iso(item.dueWindowEnd)}:${iso(item.snoozedUntil)}:${item.supersededByWorkItemId ?? ''}`);
const batchVersion = (items: Array<{ id: string; state: string }>) => sha(`work-batch:${items.map((i) => `${i.id}:${i.state}`).sort().join('|')}`);

async function loadItem(propertyId: string, id: string): Promise<ItemRow | null> {
  const item = await loadWorkItem(id) as unknown as ItemRow | null;
  return item && item.propertyId === propertyId ? item : null;
}
async function eligibleBatch(propertyId: string) {
  const all = await listWorkItems({ propertyId }) as unknown as Array<ItemRow>;
  return all.filter(workItemBatchEligible).slice(0, WORK_ITEM_BATCH_MAX);
}

function formCapture(kind: WorkItemFormKind, contextVersion: string, item: ItemRow): AskCaptureRequest {
  const spec = kind === 'SNOOZE'
    ? { title: `Snooze ${item.title}`, question: 'How long should reminders for this wait?', help: 'Snoozing only hides reminders. It does not change the state or the due date.',
        fields: [{ key: 'snooze', label: 'Snooze for', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: SNOOZE_CHOICES.map((c) => ({ label: c.label, value: c.value })) } }], seed: {} }
    : { title: `Change the due date of ${item.title}`, question: 'When is it now due?', help: 'This replaces the date it is due. Nothing is saved until you confirm.',
        fields: [{ key: 'dueAt', label: 'New due date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } }],
        seed: item.dueAt ? { dueAt: item.dueAt.toISOString().slice(0, 10) } : {} };
  return {
    requirementId: `home-work-item-${kind.toLowerCase()}-inputs`, captureKey: WORK_ITEM_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.question, helpText: spec.help,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function workItemCommandResult(
  userId: string, propertyId: string, launch: { kind: WorkItemCommandKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-work-item-permission', title: 'A contributor or owner can change work items', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared home record.';

  if (kind === 'ACCEPT_ROUTINE') {
    const batch = await eligibleBatch(propertyId);
    if (batch.length === 0) return unavailable('HOME_WORK_ITEMS_NO_ROUTINE_CANDIDATES', 'No routine suggestions to accept', 'Nothing is waiting that can be accepted together. Nothing has changed.');
    const contextVersion = batchVersion(batch);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_WORK_ITEMS_ACCEPT_ROUTINE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { workItemCommand: { kind, entityId: null }, workItemBatchIds: batch.map((b) => b.id), workItemContextVersion: contextVersion, ...base },
      blocks: [
        { type: 'SUMMARY', id: 'home-work-item-batch-review', title: `Accept ${batch.length} routine suggestion${batch.length === 1 ? '' : 's'}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] },
        { type: 'GROUPED_LIST', filters: [], id: 'home-work-item-batch-items', title: 'These will be accepted', description: null, sections: [{
          id: 'batch', title: 'Routine low-risk work', count: batch.length,
          items: batch.map((item) => ({ id: item.id, title: item.title, description: null, meta: [], status: 'Suggested', href: null, entityType: WORK_ITEM_ENTITY_TYPE, actions: [] as never[] })),
        }], actions: [] },
      ],
      confirmation: {
        confirmationId: `home-work-batch-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: `Accept ${batch.length} routine suggestion${batch.length === 1 ? '' : 's'}?`,
        description: 'These low-risk suggestions become accepted work on your list. It does not schedule anyone or contact anyone, and it does not set due dates.',
        fields: [{ label: 'Suggestions to accept', value: String(batch.length) }], editableFields: [], confirmLabel: 'Accept them', consentText: consent, expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  if (!launch.entityId) return unavailable('HOME_WORK_ITEM_TARGET_REQUIRED', 'Choose a work item first', 'A change is made from an item in your work list. Nothing has changed.');
  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('HOME_WORK_ITEM_NOT_FOUND', 'That work item is no longer available', 'Ask could not find that work item. Nothing has changed.');
  if (!workItemChangeable(item)) return unavailable('HOME_WORK_ITEM_FINISHED', 'That work is already finished', 'Finished or replaced work is not changed here. Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const formKind = kind as WorkItemFormKind;
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `HOME_WORK_ITEM_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { workItemLaunch: { kind, entityId: item.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'home-work-item-input', title: item.title, body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, item)], suggestions: [],
    };
  }
  const parsed = parseWorkItemAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('HOME_WORK_ITEM_INPUT_INVALID', 'Check the details', kind === 'SNOOZE' ? 'Choose how long to snooze. Nothing has changed.' : 'Choose a due date. Nothing has changed.');
  const answer = parsed.data as Record<string, string>;
  let spec: { title: string; description: string; confirmLabel: string; field: { label: string; value: string }; stored: Record<string, unknown> };
  if (formKind === 'SNOOZE') {
    const until = snoozeUntil(answer.snooze, new Date());
    spec = {
      title: until ? 'Snooze this work item?' : 'Stop snoozing this work item?', confirmLabel: until ? 'Snooze it' : 'Stop snoozing',
      description: 'Snoozing only hides reminders. It does not change the work item’s state or due date.',
      field: { label: 'Reminders', value: `${item.snoozedUntil ? `Snoozed until ${humanDate(item.snoozedUntil)}` : 'Not snoozed'} → ${until ? `Snoozed until ${humanDate(until)}` : 'Not snoozed'}` },
      stored: { snoozedUntil: until ? until.toISOString() : null },
    };
  } else {
    const date = answer.dueAt;
    spec = {
      title: 'Change the due date?', confirmLabel: 'Change the date', description: 'This replaces the date the work is due. It does not schedule anyone or contact anyone.',
      field: { label: 'Due', value: `${item.dueAt ? humanDate(item.dueAt) : 'No due date'} → ${dayOf(date)}` }, stored: { dueAt: new Date(`${date}T12:00:00.000Z`).toISOString() },
    };
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_WORK_ITEM_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { workItemCommand: { kind, entityId: item.id }, workItemChange: spec.stored, workItemContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'home-work-item-review', title: item.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-work-${kind.toLowerCase()}-${sha(`${item.id}:${JSON.stringify(spec.stored)}`).slice(0, 12)}-1`, version: 1, title: spec.title, description: spec.description,
      fields: [{ label: 'Work item', value: item.title }, spec.field], editableFields: [], confirmLabel: spec.confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(formKind, contextVersion, item)], suggestions: [],
  };
}

registerCapabilityHandler('home-work-item.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = workItemKindFromMessage(envelope.message);
  const entityOk = kind === 'ACCEPT_ROUTINE' || (launch?.entityType === WORK_ITEM_ENTITY_TYPE && Boolean(launch.entityId));
  if (!kind || launch?.operationId !== 'HOME_WORK_ITEM_COMMAND' || launch.surface === 'ASK_REFRESH' || !entityOk) {
    return unavailable('ASK_HOME_WORK_ITEM_NOT_DIRECTLY_ROUTABLE', 'Open your work items first', 'Work is changed from your list of work items. Nothing has changed.');
  }
  return workItemCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId ?? null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmWorkItemCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.workItemCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as WorkItemCommandKind | undefined;
  if (!kind || !(kind in WORK_ITEM_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  let description: string;
  try {
    if (kind === 'ACCEPT_ROUTINE') {
      const ids = Array.isArray(parameters.workItemBatchIds) ? parameters.workItemBatchIds.filter((id): id is string => typeof id === 'string') : [];
      const current = await eligibleBatch(propertyId);
      if (!ids.length || parameters.workItemContextVersion !== batchVersion(current) || ids.join('|') !== current.map((c) => c.id).join('|')) {
        throw stale('Your suggestions changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const results = await batchTransitionWorkItems({ propertyId, workItemIds: ids, actorUserId: userId });
      const accepted = results.filter((r) => r.success).length;
      title = `${accepted} suggestion${accepted === 1 ? '' : 's'} accepted`;
      description = results.length === accepted ? 'They are accepted work on your list.' : `${results.length - accepted} could not be accepted and were left as they are.`;
    } else {
      if (typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
      const item = await loadItem(propertyId, command.entityId);
      if (!item) throw stale('That work item is no longer available.');
      if (parameters.workItemContextVersion !== itemVersion(kind, item)) throw stale('This work item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!workItemChangeable(item)) throw stale('That work is already finished.');
      const change = (parameters.workItemChange ?? {}) as Record<string, unknown>;
      if (kind === 'SNOOZE') {
        if (!('snoozedUntil' in change) || (change.snoozedUntil !== null && typeof change.snoozedUntil !== 'string')) throw stale('The snooze to apply is invalid.');
        await snoozeWorkItem({ workItemId: item.id, snoozedUntil: change.snoozedUntil ? new Date(change.snoozedUntil as string) : null, actorUserId: userId, idempotencyKey: crypto.randomUUID() });
        title = change.snoozedUntil ? 'Snoozed' : 'Snooze removed';
        description = 'Reminders for it were updated. Its state and due date are unchanged.';
      } else {
        if (typeof change.dueAt !== 'string') throw stale('The due date to apply is invalid.');
        await rescheduleWorkItem({ workItemId: item.id, dueAt: new Date(change.dueAt), actorUserId: userId, idempotencyKey: crypto.randomUUID() });
        title = 'Due date changed';
        description = 'It is on the work item. Nobody was scheduled or contacted.';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_WORK_ITEM_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-work-item-${kind.toLowerCase()}-${typeof command?.entityId === 'string' ? command.entityId : 'batch'}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToList, label: 'See my work items', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'home-work-item-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'OPERATIONAL_WORK_ITEM', artifactId: typeof command?.entityId === 'string' ? command.entityId : propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-work-item.command', confirmWorkItemCommand);
