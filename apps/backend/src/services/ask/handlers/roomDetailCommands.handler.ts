// "More options for this room" (FRD v1.470): the room profile questionnaire, the room checklist (add, mark done, reopen, rename, remove) and deleting
// a room, reached from one choice form on a room row because a row carries at most four actions. Every write is RoomInsightsService's own method, the
// call the Rooms page makes, behind a review and a confirmation bound to the record's last change. Deleting a room reuses the delete confirmation.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import type { AskCaptureRequest, CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import type { ConfirmCapabilityContext, ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { RoomInsightsService } from '../../roomInsights.service';
import { roomContextVersion } from '../suggestedActions/domainVersions';
import { roomDeleteResult } from './inventoryDeleteCommands.handler';
import {
  CHECKLIST_FREQUENCIES, ChecklistFormSchema, PROFILE_NOT_SET, ROOM_CHOICE, ROOM_DETAIL_CAPTURE_KEY, ROOM_MORE_MESSAGE, parseRoomChoice, profileChanges, profileObject, roomProfileFields,
} from '../support/roomDetailCommand';

const roomInsights = new RoomInsightsService();
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONTEXT_VERSION_CONFLICT') => Object.assign(new Error(message), { code });
const label = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
type Launch = CreateAskExecutionRequest['launchContext'];
type Stored = { roomId: string; choice?: string; sourceExecutionId?: string | null };

const checklistVersion = (item: { id: string; status: string; title: string; updatedAt: Date }) => sha(`checklist:${item.id}:${item.status}:${item.title}:${item.updatedAt.toISOString()}`);
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'room-detail-unavailable', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});

function capture(title: string, question: string, fields: unknown[], current: Record<string, unknown>, contextVersion: string): AskCaptureRequest {
  return {
    requirementId: 'room-detail-inputs', captureKey: ROOM_DETAIL_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title, question, helpText: 'Nothing is saved until you review and confirm.',
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: current, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  } as AskCaptureRequest;
}

const confirmationFor = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
  confirmationId: `room-detail-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared home record.',
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
});

export const isRoomMoreMessage = (message: string) => message.trim() === ROOM_MORE_MESSAGE;

/** `answer` is the supplied form: the choice first, then (for profile, add and rename) the details. */
export async function roomDetailResult(userId: string, propertyId: string, launch: Launch, stored?: Stored, answer?: Record<string, unknown>): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const roomId = stored?.roomId ?? launch?.entityId ?? '';
  const room = roomId ? await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId }, select: { id: true, name: true, type: true, profile: true, updatedAt: true } }) : null;
  if (!room) return unavailable('ROOM_DETAIL_ROOM_MISSING', 'That room is no longer available', 'Nothing changed.');
  const source = stored?.sourceExecutionId ?? launch?.sourceExecutionId ?? null;
  const base = { sourceExecutionId: source, confirmationVersion: 1, confirmationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  const roomVersion = roomContextVersion(room);
  const items: Array<{ id: string; title: string; status: string; frequency: string; updatedAt: Date }> = await (prisma as any).roomChecklistItem.findMany({
    where: { propertyId, roomId: room.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 30, select: { id: true, title: true, status: true, frequency: true, updatedAt: true },
  });
  const choice = parseRoomChoice(stored?.choice ?? answer?.choice);

  if (!choice) {
    const options = [
      { label: 'Edit the room profile', value: ROOM_CHOICE.PROFILE }, { label: 'Add a checklist item', value: ROOM_CHOICE.ADD },
      ...items.flatMap((item) => item.status === 'DONE'
        ? [{ label: `Reopen: ${item.title}`, value: `reopen:${item.id}` }, { label: `Rename: ${item.title}`, value: `edit:${item.id}` }, { label: `Remove: ${item.title}`, value: `remove:${item.id}` }]
        : [{ label: `Mark done: ${item.title}`, value: `done:${item.id}` }, { label: `Rename: ${item.title}`, value: `edit:${item.id}` }, { label: `Remove: ${item.title}`, value: `remove:${item.id}` }]),
      { label: 'Delete this room', value: ROOM_CHOICE.DELETE },
    ].slice(0, 100);
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_DETAIL_CHOICE_REQUIRED', contextVersion: roomVersion, parameters: { roomDetailLaunch: { roomId: room.id, sourceExecutionId: source } },
      blocks: [{ type: 'SUMMARY', id: 'room-detail-choice', title: `${room.name}: what would you like to do?`, body: items.length ? `${items.filter((item) => item.status !== 'DONE').length} of ${items.length} checklist items are open. Nothing has changed.` : 'This room has no checklist items yet. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [capture(`${room.name}`, 'What would you like to do?', [{ key: 'choice', label: 'Choose one', required: true, inputSchema: { type: 'SINGLE_SELECT', options } }], {}, roomVersion)], suggestions: [],
    };
  }

  if (choice.kind === 'DELETE') return roomDeleteResult(userId, propertyId, { ...(launch ?? {}), entityId: room.id, sourceExecutionId: source } as Launch);

  if (choice.kind === 'PROFILE') {
    const fields = roomProfileFields(room.type);
    const have = profileObject(room.profile);
    if (!answer || answer.choice !== undefined && Object.keys(answer).length === 1) {
      const current = Object.fromEntries(fields.map((field) => [field.key, typeof have[field.key] === 'string' ? have[field.key] : PROFILE_NOT_SET]));
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_PROFILE_INPUT_REQUIRED', contextVersion: roomVersion, parameters: { roomDetailLaunch: { roomId: room.id, choice: ROOM_CHOICE.PROFILE, sourceExecutionId: source } },
        blocks: [{ type: 'SUMMARY', id: 'room-profile-input', title: `${room.name} profile`, body: 'The form shows what is recorded. Change what is wrong, then review the changes.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [capture(`${room.name} profile`, 'What is this room like?', fields.map((field) => ({ key: field.key, label: field.label, required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Not set', value: PROFILE_NOT_SET }, ...field.options] } })), current, roomVersion)], suggestions: [],
      };
    }
    const changes = profileChanges(room.type, room.profile, answer);
    if (!changes.ok) return unavailable('ROOM_PROFILE_INVALID', 'Check the room profile', `${changes.error} Nothing changed.`);
    const fieldLabel = (key: string) => fields.find((field) => field.key === key)?.label ?? key;
    const optionLabel = (key: string, value: string) => fields.find((field) => field.key === key)?.options.find((option) => option.value === value)?.label ?? value;
    const lines = [
      ...Object.entries(changes.set).map(([key, value]) => ({ label: fieldLabel(key), value: `${typeof have[key] === 'string' ? optionLabel(key, have[key] as string) : 'Not set'} → ${optionLabel(key, value)}` })),
      ...changes.clear.map((key) => ({ label: fieldLabel(key), value: `${optionLabel(key, have[key] as string)} → Not set` })),
    ];
    if (!lines.length) return unavailable('ROOM_PROFILE_NO_CHANGE', 'Nothing to change', 'The answers match what is already recorded. Nothing changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_PROFILE_CONFIRMATION_REQUIRED', contextVersion: roomVersion,
      parameters: { roomDetail: { kind: 'PROFILE', roomId: room.id, set: changes.set, clear: changes.clear }, roomDetailContextVersion: roomVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'room-profile-review', title: `Review the ${room.name} profile`, body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmationFor(`profile-${room.id}`, `Save ${lines.length === 1 ? '1 change' : `${lines.length} changes`} to the ${room.name} profile?`, 'This updates the room profile, the same answers the Rooms page shows.', 'Save profile', [{ label: 'Room', value: room.name }, ...lines]),
      suggestions: [],
    };
  }

  if (choice.kind === 'ADD' || choice.kind === 'EDIT') {
    const target = 'itemId' in choice ? items.find((item) => item.id === choice.itemId) : undefined;
    if (choice.kind === 'EDIT' && !target) return unavailable('ROOM_CHECKLIST_ITEM_MISSING', 'That checklist item is no longer available', 'Nothing changed.');
    const hasForm = answer && (answer.title !== undefined || answer.frequency !== undefined);
    const frequencyField = { key: 'frequency', label: 'How often', required: true, inputSchema: { type: 'SINGLE_SELECT', options: CHECKLIST_FREQUENCIES.map((value) => ({ label: label(value), value })) } };
    const titleField = { key: 'title', label: 'Checklist item', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 140 } };
    const launchParameters = { roomDetailLaunch: { roomId: room.id, choice: stored?.choice ?? answer?.choice, sourceExecutionId: source } };
    if (!hasForm) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_CHECKLIST_INPUT_REQUIRED', contextVersion: roomVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'room-checklist-input', title: choice.kind === 'ADD' ? `Add a checklist item to ${room.name}` : 'Rename this checklist item', body: 'Enter the details, then review them before they are saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [capture(choice.kind === 'ADD' ? 'Add a checklist item' : 'Change this checklist item', 'What should the item say?', [titleField, frequencyField], target ? { title: target.title, frequency: target.frequency } : { frequency: 'ONCE' }, roomVersion)], suggestions: [],
      };
    }
    const parsed = ChecklistFormSchema.safeParse({ title: answer?.title, frequency: answer?.frequency ?? target?.frequency ?? 'ONCE' });
    if (!parsed.success) return unavailable('ROOM_CHECKLIST_INVALID', 'Check the checklist item', 'Enter a title of up to 140 characters and choose how often. Nothing changed.');
    if (target && target.title === parsed.data.title && target.frequency === parsed.data.frequency) return unavailable('ROOM_CHECKLIST_NO_CHANGE', 'Nothing to change', 'The item already reads that way. Nothing changed.');
    const version = target ? checklistVersion(target) : roomVersion;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: choice.kind === 'ADD' ? 'ROOM_CHECKLIST_ADD_CONFIRMATION_REQUIRED' : 'ROOM_CHECKLIST_EDIT_CONFIRMATION_REQUIRED', contextVersion: version,
      parameters: { roomDetail: { kind: choice.kind === 'ADD' ? 'CHECKLIST_ADD' : 'CHECKLIST_EDIT', roomId: room.id, itemId: target?.id, title: parsed.data.title, frequency: parsed.data.frequency }, roomDetailContextVersion: version, ...base },
      blocks: [{ type: 'SUMMARY', id: 'room-checklist-review', title: 'Review this checklist item', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmationFor(`checklist-${choice.kind.toLowerCase()}-${target?.id ?? room.id}`, choice.kind === 'ADD' ? `Add “${parsed.data.title}” to ${room.name}?` : `Save this change to “${target!.title}”?`, 'This updates the room checklist the Rooms page shows.', choice.kind === 'ADD' ? 'Add item' : 'Save item',
        [{ label: 'Room', value: room.name }, { label: 'Item', value: parsed.data.title }, { label: 'How often', value: label(parsed.data.frequency) }]),
      suggestions: [],
    };
  }

  const item = 'itemId' in choice ? items.find((candidate) => candidate.id === choice.itemId) : undefined;
  if (!item) return unavailable('ROOM_CHECKLIST_ITEM_MISSING', 'That checklist item is no longer available', 'Nothing changed.');
  const kind = choice.kind === 'DONE' ? 'CHECKLIST_DONE' : choice.kind === 'REOPEN' ? 'CHECKLIST_REOPEN' : 'CHECKLIST_REMOVE';
  const verb = choice.kind === 'DONE' ? 'Mark done' : choice.kind === 'REOPEN' ? 'Reopen' : 'Remove';
  const version = checklistVersion(item);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_CHECKLIST_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { roomDetail: { kind, roomId: room.id, itemId: item.id }, roomDetailContextVersion: version, ...base },
    blocks: [{ type: 'SUMMARY', id: 'room-checklist-review', title: `Review: ${verb.toLowerCase()} “${item.title}”`, body: choice.kind === 'REMOVE' ? 'No shared-home record has changed yet. Removing cannot be undone.' : 'No shared-home record has changed yet.', tone: choice.kind === 'REMOVE' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: confirmationFor(`checklist-${choice.kind.toLowerCase()}-${item.id}`, `${verb}: ${item.title}?`, choice.kind === 'REMOVE' ? 'This permanently removes the item from the room checklist.' : 'This updates the room checklist the Rooms page shows.', verb, [{ label: 'Room', value: room.name }, { label: 'Item', value: item.title }]),
    suggestions: [],
  };
}

export async function confirmRoomDetail(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult | null> {
  const { execution, userId, parameters } = ctx;
  const stored = parameters.roomDetail as { kind?: string; roomId?: string; itemId?: string; set?: Record<string, string>; clear?: string[]; title?: string; frequency?: string } | undefined;
  if (!stored?.kind || !stored.roomId) return null;
  const propertyId = execution.propertyId!;
  const room = await prisma.inventoryRoom.findFirst({ where: { id: stored.roomId, propertyId }, select: { id: true, name: true, type: true, profile: true, updatedAt: true } });
  if (!room) throw stale('This room is no longer available. It may have been deleted.');
  let title = 'Room updated'; let description = '';
  if (stored.kind === 'PROFILE') {
    if (parameters.roomDetailContextVersion !== roomContextVersion(room)) throw stale('This room changed while confirmation was open. Review it and try again.');
    const next = profileObject(room.profile);
    for (const key of stored.clear ?? []) delete next[key];
    Object.assign(next, stored.set ?? {});
    const check = profileChanges(room.type, {}, next as Record<string, unknown>);
    if (!check.ok) throw Object.assign(new Error(check.error), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    await roomInsights.updateRoomProfile(propertyId, room.id, next);
    title = 'Room profile saved'; description = 'The room profile was updated.';
  } else if (stored.kind === 'CHECKLIST_ADD') {
    const parsed = ChecklistFormSchema.safeParse({ title: stored.title, frequency: stored.frequency });
    if (!parsed.success) throw stale('The checklist item is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
    if (parameters.roomDetailContextVersion !== roomContextVersion(room)) throw stale('This room changed while confirmation was open. Review it and try again.');
    await roomInsights.createRoomChecklistItem(propertyId, room.id, parsed.data);
    title = 'Checklist item added'; description = `“${parsed.data.title}” was added to the ${room.name} checklist.`;
  } else {
    const item = stored.itemId ? await (prisma as any).roomChecklistItem.findFirst({ where: { id: stored.itemId, propertyId, roomId: room.id }, select: { id: true, title: true, status: true, updatedAt: true } }) : null;
    if (!item) throw stale('This checklist item is no longer available. It may have been removed.');
    if (parameters.roomDetailContextVersion !== checklistVersion(item)) throw stale('This checklist item changed while confirmation was open. Review it and try again.');
    if (stored.kind === 'CHECKLIST_DONE' || stored.kind === 'CHECKLIST_REOPEN') {
      await roomInsights.updateRoomChecklistItem(propertyId, room.id, item.id, { status: stored.kind === 'CHECKLIST_DONE' ? 'DONE' : 'OPEN' });
      title = stored.kind === 'CHECKLIST_DONE' ? 'Checklist item done' : 'Checklist item reopened'; description = `“${item.title}” is ${stored.kind === 'CHECKLIST_DONE' ? 'marked done' : 'open again'}.`;
    } else if (stored.kind === 'CHECKLIST_EDIT') {
      const parsed = ChecklistFormSchema.safeParse({ title: stored.title, frequency: stored.frequency });
      if (!parsed.success) throw stale('The checklist item is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
      await roomInsights.updateRoomChecklistItem(propertyId, room.id, item.id, parsed.data);
      title = 'Checklist item saved'; description = `The item now reads “${parsed.data.title}”.`;
    } else if (stored.kind === 'CHECKLIST_REMOVE') {
      await roomInsights.deleteRoomChecklistItem(propertyId, room.id, item.id);
      title = 'Checklist item removed'; description = `“${item.title}” was removed from the ${room.name} checklist.`;
    } else throw stale('The change to make is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `ROOM_DETAIL_${stored.kind}`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `room-detail-${stored.kind.toLowerCase()}-${room.id}`, title, status: 'COMPLETED', description, details: [{ label: 'Room', value: room.name }], actions: [] }], suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'INVENTORY_ROOM', artifactId: room.id, refreshedExecutions: refresh.refreshedExecutions };
}
