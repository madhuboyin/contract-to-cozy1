// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { eventAddCaptureRequest, USER_ADD_ORIGIN, warrantyAddCaptureRequest } from '../conversationalUnderstanding/conversationalCapture';
import { HomeEventsService } from '../../homeEvents.service';
import { visibleInventoryItemWhere } from '../../riskAssetApplicability';
import { HouseholdService } from '../../household.service';
import { correctionDateString, correctionDisplay, correctionMoneyFromDollars, correctionValueError, type CorrectionFieldSpec, type CorrectionOption } from '../askCorrectionFields';
import { humanDate } from '../askFormatting';
import { durableFreeTextClarification, ensurePropertyAccess, exactEntityMatch, HOME_EVENT_CORRECTION_FIELDS, HOME_EVENT_LINK_FIELDS, HOME_EVENT_VISIBILITY_LABELS, HomeEventCorrectionField, HomeEventCorrectionInputSchema, HomeEventVisibilityInputSchema, HouseholdInvitationInputSchema, invitationRoleCopy, isValidDateEditInput, propertySummary, readablePropertyValue, ROOM_TYPE_VALUES, RoomCreateInputSchema, RoomRenameInputSchema, WarrantyCorrectionInputSchema } from '../askHandlerSupport';

export const householdService = new HouseholdService();

export async function householdWorkflowVersion(propertyId: string): Promise<string> {
  const [members, invites] = await Promise.all([
    prisma.householdMember.findMany({
      where: { propertyId }, orderBy: { id: 'asc' },
      select: { id: true, role: true, isPrimaryOwner: true, updatedAt: true },
    }),
    prisma.householdInvite.findMany({
      where: { propertyId }, orderBy: { id: 'asc' },
      select: { id: true, role: true, status: true, createdAt: true, acceptedAt: true, revokedAt: true, expiresAt: true },
    }),
  ]);
  return createHash('sha256').update(JSON.stringify({
    propertyId,
    members,
    invites,
  })).digest('hex');
}

function extractHouseholdInvitationInput(message: string): Partial<z.input<typeof HouseholdInvitationInputSchema>> {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const role = /\b(viewer|read[ -]?only)\b/i.test(message)
    ? HouseholdRole.VIEWER
    : /\b(contributor|edit(?:or)?|help (?:manage|maintain)|complete tasks?)\b/i.test(message)
      ? HouseholdRole.CONTRIBUTOR
      : undefined;
  return { ...(email ? { email } : {}), ...(role ? { role } : {}) };
}

export async function householdInvitationResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: z.infer<typeof HouseholdInvitationInputSchema>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const householdHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/household`;
  if (access.role !== HouseholdRole.OWNER) {
    return {
      status: 'BLOCKED',
      reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'household-invite-owner-required', title: 'A household owner needs to send this invitation',
        body: 'Inviting someone changes access to this home’s records. Contributors and viewers can review their current access, but only an owner can choose a role and send an invitation.',
        tone: 'CAUTION', actions: [{ id: 'open-household', label: 'Review household access', href: householdHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What can my current household role do?'],
    };
  }

  const contextVersion = await householdWorkflowVersion(propertyId);
  const extracted = suppliedInput ?? extractHouseholdInvitationInput(message);
  const parsed = HouseholdInvitationInputSchema.safeParse(extracted);
  if (!parsed.success) {
    const currentAnswer = {
      ...(typeof extracted.email === 'string' ? { email: extracted.email } : {}),
      ...(extracted.role ? { role: extracted.role } : {}),
    };
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOUSEHOLD_INVITATION_INPUT_REQUIRED', contextVersion,
      parameters: { householdContextVersion: contextVersion },
      blocks: [{
        type: 'SUMMARY', id: 'household-invite-input', title: 'Choose who to invite and what they can do',
        body: 'Use Contributor for someone who helps maintain the home record. Use Viewer for read-only access. An invitation does not establish a legal ownership interest or imply a family relationship.',
        tone: 'DEFAULT', actions: [],
      }],
      captureRequests: [{
        requirementId: `household-invite-${contextVersion.slice(0, 20)}`,
        captureKey: 'HOUSEHOLD_INVITATION_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Household invitation details', question: 'Who should receive access, and which role should they have?',
        helpText: 'The email and role are used only for this invitation workflow. They are not saved as inferred household facts.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'email', label: 'Email address', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 254 } },
          { key: 'role', label: 'Access role', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Contributor — can help manage the home', value: HouseholdRole.CONTRIBUTOR },
            { label: 'Viewer — read-only access', value: HouseholdRole.VIEWER },
          ] } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used for this household invitation',
        confirmationText: null, expectedContextVersion: contextVersion,
      }],
      suggestions: ['Open household settings instead'],
    };
  }

  const property = await propertySummary(propertyId);
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOUSEHOLD_INVITATION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      inviteEmail: parsed.data.email,
      inviteRole: parsed.data.role,
      householdContextVersion: contextVersion,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'household-invite-review', title: 'Review the household invitation',
      body: 'No invitation has been created yet. Confirm the recipient and role below. The recipient must accept before access becomes active.',
      tone: 'DEFAULT', actions: [{ id: 'manage-household', label: 'Open household settings', href: householdHref, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `household-invite-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Send this household invitation?',
      description: 'This creates a seven-day invitation for the selected home. Access begins only after the recipient accepts it.',
      fields: [
        { label: 'Home', value: property?.label ?? 'Selected home' },
        { label: 'Recipient', value: parsed.data.email },
        { label: 'Role', value: invitationRoleCopy(parsed.data.role) },
        { label: 'Legal ownership', value: 'Not changed by this invitation' },
      ],
      editableFields: [], confirmLabel: 'Send invitation',
      consentText: 'I confirm this recipient and access role are correct and authorize ContractToCozy to create the invitation.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

// Sentinel written into the SELECT dropdown to mean "no room" / "no item" (parallel to INVENTORY_ITEM_CREATE's
// INVENTORY_NO_ROOM_VALUE) -- an editable field's value is always a non-empty string, never JSON null.
const HOME_EVENT_LINK_NONE_VALUE = 'NONE';

// "amount"/"cost"/"price" are checked before "type" and "date" only to keep the parse order explicit; the
// fields do not overlap in practice.
function homeEventCorrectionField(message: string): HomeEventCorrectionField | null {
  if (/\binventory\s+item\b/i.test(message)) return 'inventoryItemId';
  if (/\broom\b/i.test(message)) return 'roomId';
  if (/\b(?:amount|cost|price)\b/i.test(message)) return 'amount';
  if (/\b(?:summary|description)\b/i.test(message)) return 'summary';
  if (/\bimportance\b/i.test(message)) return 'importance';
  if (/\btype\b/i.test(message)) return 'type';
  if (/\b(?:title|name)\b/i.test(message)) return 'title';
  if (/\bdate\b/i.test(message)) return 'occurredAt';
  return null;
}

// Async (unlike every other correction's value check) because the two link fields must be re-verified against live,
// property-scoped data -- a static option list cannot tell a stale or cross-property id from a real one.
export async function homeEventCorrectionValueError(propertyId: string, field: HomeEventCorrectionField, value: unknown): Promise<string | null> {
  if (field === 'roomId' || field === 'inventoryItemId') {
    if (value === HOME_EVENT_LINK_NONE_VALUE) return null;
    if (typeof value !== 'string' || !value.trim()) return field === 'roomId' ? 'Choose a room, or "No room".' : 'Choose an item, or "No item".';
    const found = field === 'roomId'
      ? await prisma.inventoryRoom.findFirst({ where: { id: value, propertyId }, select: { id: true } })
      : await prisma.inventoryItem.findFirst({ where: { id: value, propertyId, ...visibleInventoryItemWhere() }, select: { id: true } });
    return found ? null : (field === 'roomId' ? 'That room is not in this home. Choose a recorded room, or "No room".' : 'That item is not in this home. Choose a recorded item, or "No item".');
  }
  return correctionValueError(HOME_EVENT_CORRECTION_FIELDS[field], value);
}

// The value currently recorded for a field, in the canonical string form the card edits.
export function homeEventFieldCurrent(event: object, field: HomeEventCorrectionField): string | null {
  const raw = (event as Record<string, unknown>)[field === 'occurredAt' ? 'occurredAt' : field];
  const kind = HOME_EVENT_CORRECTION_FIELDS[field].kind;
  if (kind === 'DATE') return correctionDateString(raw);
  if (kind === 'MONEY') return correctionMoneyFromDollars(raw);
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

export function homeEventFieldPatch(field: HomeEventCorrectionField, normalized: string): Record<string, unknown> {
  if (field === 'occurredAt') return { occurredAt: `${normalized}T00:00:00.000Z`, datePrecision: 'EXACT_DATE' };
  if (field === 'amount') return { amount: Number(normalized) };
  if (HOME_EVENT_LINK_FIELDS.has(field)) return { [field]: normalized === HOME_EVENT_LINK_NONE_VALUE ? null : normalized };
  return { [field]: normalized };
}

// The property's own rooms (or visible, non-deleted inventory items), as SELECT options for a link field, with a
// leading "No room"/"No item" entry -- capped like every other inline room/item picker in this file.
export async function homeEventLinkOptions(propertyId: string, field: 'roomId' | 'inventoryItemId'): Promise<CorrectionOption[]> {
  if (field === 'roomId') {
    const rooms = await prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 50, select: { id: true, name: true } });
    return [{ label: 'No room', value: HOME_EVENT_LINK_NONE_VALUE }, ...rooms.map((room) => ({ label: room.name, value: room.id }))];
  }
  const items = await prisma.inventoryItem.findMany({ where: { propertyId, ...visibleInventoryItemWhere() }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true } });
  return [{ label: 'No item', value: HOME_EVENT_LINK_NONE_VALUE }, ...items.map((item) => ({ label: item.name, value: item.id }))];
}

// Why this event cannot take this correction, or null.
export function homeEventCorrectionBlocker(event: { datePrecision: string; type?: string }, field: HomeEventCorrectionField): string | null {
  if (field === 'occurredAt' && event.datePrecision === 'RANGE') return 'This event is recorded as a date range and cannot be corrected here.';
  if (field === 'type' && event.type === 'VERIFIED_RESOLUTION') return 'This event was created automatically when a guided plan was completed, so its type cannot be changed here.';
  return null;
}

export function homeEventContextVersion(event: { id: string; revision: number }): string {
  return createHash('sha256').update(`${event.id}:${event.revision}`).digest('hex');
}

export function homeEventCorrectionConfirmation(event: { id: string; title: string }, field: HomeEventCorrectionField, current: string | null, proposed: string | null, version: number, expiresAt: Date, dynamicOptions?: readonly CorrectionOption[]) {
  // A link field's options come from the property's live rooms/items, not a static list; substituting them into
  // `meta` lets the "Current value" display and the editable field's own options share the exact same lookup.
  const meta = dynamicOptions ? { ...HOME_EVENT_CORRECTION_FIELDS[field], options: dynamicOptions } : HOME_EVENT_CORRECTION_FIELDS[field];
  return {
    confirmationId: `home-event-correct-${event.id}-${version}`, version, title: `Correct the ${meta.label} of "${event.title}"?`,
    description: 'This records a new revision on the canonical home timeline; the original is preserved as history. An evidence-verified event returns to pending confirmation until it is verified again.',
    fields: [{ label: 'Event', value: event.title }, { label: 'Field', value: meta.label }, { label: 'Current value', value: correctionDisplay(meta, current) },
      ...(field === 'occurredAt' ? [{ label: 'Date precision', value: 'Recorded as an exact date' }] : [])],
    editableFields: [{
      key: 'value', label: `Corrected ${meta.label}`, type: meta.kind, value: proposed ?? '',
      ...(meta.kind === 'SELECT' ? { options: [...(meta.options ?? [])] } : {}),
    }],
    confirmLabel: `Save ${meta.label}`, consentText: 'I authorize this correction to the shared home timeline.', expiresAt: expiresAt.toISOString(),
  };
}

async function homeEventCorrectResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const timelineHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/timeline`;
  const events = await prisma.homeEvent.findMany({
    where: { propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }] },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 200,
    select: { id: true, title: true, revision: true, occurredAt: true, datePrecision: true, summary: true, amount: true, type: true, importance: true, roomId: true, inventoryItemId: true },
  });
  const selected = exactEntityMatch(events, message, launchContext);
  if (!selected) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HOME_EVENT_TARGET_REQUIRED',
      ...durableFreeTextClarification('HOME_EVENT_CORRECT', 'Which timeline event should Ask correct? Use its exact title.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'home-event-selection', title: 'Choose the event to correct',
        description: 'Use the exact event title in your next message; nothing has changed.',
        sections: [{ id: 'events', title: 'Timeline events', count: events.length, items: events.slice(0, 20).map((event) => ({
          id: event.id, title: event.title, description: null, meta: [humanDate(event.occurredAt) ?? 'Date unavailable'], status: null, href: null,
        })) }],
        actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'SECONDARY' }],
      }],
      suggestions: events.slice(0, 3).map((event) => `Correct the title of the timeline event ${event.title}`),
    };
  }
  const field = homeEventCorrectionField(message);
  if (!field) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'HOME_EVENT_CORRECTION_FIELD_REQUIRED',
      ...durableFreeTextClarification('HOME_EVENT_CORRECT', `Which detail of "${selected.title}" should change? Ask can correct its title, date, summary, amount, type, importance, room, or inventory item.`),
      blocks: [{ type: 'SUMMARY', id: 'home-event-correct-field', title: 'Which detail should change?', body: 'Say title, date, summary, amount, type, importance, room, or inventory item. Nothing has changed.', tone: 'CAUTION', actions: [] }],
      suggestions: [`Correct the title of the timeline event ${selected.title}`, `Correct the date of the timeline event ${selected.title}`],
    };
  }
  const blocker = homeEventCorrectionBlocker(selected, field);
  if (blocker) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: field === 'type' ? 'HOME_EVENT_TYPE_LOCKED' : 'HOME_EVENT_DATE_RANGE_UNSUPPORTED',
      blocks: [{ type: 'SUMMARY', id: 'home-event-correction-unsupported', title: 'This detail cannot be corrected here', body: `${blocker} Nothing has changed.`, tone: 'CAUTION', actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }
  const current = homeEventFieldCurrent(selected, field);
  const isLinkField = HOME_EVENT_LINK_FIELDS.has(field);
  const dynamicOptions = isLinkField ? await homeEventLinkOptions(propertyId, field as 'roomId' | 'inventoryItemId') : undefined;
  const stated = field === 'occurredAt' ? message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null : null;
  // A link field always pre-selects its current value (or "No room"/"No item") rather than extracting one from free
  // text -- a raw id typed into a message would mean nothing, and the dropdown is the only supported way to choose one.
  const proposed = isLinkField ? (current ?? HOME_EVENT_LINK_NONE_VALUE) : (stated && isValidDateEditInput(stated) ? stated : current);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = homeEventContextVersion(selected);
  const input = HomeEventCorrectionInputSchema.parse({ eventId: selected.id, field, value: proposed });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_CORRECTION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      homeEventCorrection: input, homeEventCorrectionContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'home-event-correct-review', title: `Review this ${HOME_EVENT_CORRECTION_FIELDS[field].label} correction`, body: 'No shared-home record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'SECONDARY' }] }],
    confirmation: homeEventCorrectionConfirmation(selected, field, current, proposed, 1, expiresAt, dynamicOptions),
    suggestions: [],
  };
}

registerCapabilityHandler('home-event.correct', async (envelope) => homeEventCorrectResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

const HOME_EVENT_VISIBILITY_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Private (only you)', value: 'PRIVATE' },
  { label: 'Household (everyone with access to this home)', value: 'HOUSEHOLD' },
  { label: 'Resale pack (also shared in resale summaries for buyers and listing agents)', value: 'RESALE_PACK' },
];

// Homeowner-facing reason this contributor cannot set this value on this event, or null. `current` is the event's
// visibility as recorded now (re-read at confirm, not trusted from the proposal).
export function homeEventVisibilityBlocker(userId: string, createdById: string | null, current: string, proposed: string | null): string | null {
  const changesPrivacy = proposed !== null && (current === 'PRIVATE' || proposed === 'PRIVATE') && current !== proposed;
  if (changesPrivacy && createdById !== userId) return 'Only the person who added this event can change it to or from private.';
  return null;
}

export function homeEventVisibilityConfirmation(event: { id: string; title: string }, current: string, proposed: string | null, version: number, expiresAt: Date) {
  return {
    confirmationId: `home-event-visibility-${event.id}-${version}`, version, title: `Change who can see "${event.title}"?`,
    description: 'This changes the timeline event in place; it does not create a new revision.',
    fields: [{ label: 'Event', value: event.title }, { label: 'Current visibility', value: HOME_EVENT_VISIBILITY_LABELS[current] ?? current }],
    editableFields: [{ key: 'value', label: 'New visibility', type: 'SELECT' as const, value: proposed ?? '', options: [...HOME_EVENT_VISIBILITY_OPTIONS] }],
    confirmLabel: 'Save visibility',
    consentText: proposed === 'RESALE_PACK'
      ? 'I authorize sharing this event with buyers and listing agents in resale summaries.'
      : 'I authorize this visibility change to the shared home timeline.',
    expiresAt: expiresAt.toISOString(),
  };
}

async function homeEventVisibilityResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const timelineHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/timeline`;
  const events = await prisma.homeEvent.findMany({
    where: { propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }] },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 200,
    select: { id: true, title: true, revision: true, visibility: true, createdById: true, occurredAt: true },
  });
  const selected = exactEntityMatch(events, message, launchContext);
  if (!selected) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HOME_EVENT_TARGET_REQUIRED',
      ...durableFreeTextClarification('HOME_EVENT_VISIBILITY', 'Which timeline event should Ask change the visibility of? Use its exact title.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'home-event-selection', title: 'Choose the event to change',
        description: 'Use the exact event title in your next message; nothing has changed.',
        sections: [{ id: 'events', title: 'Timeline events', count: events.length, items: events.slice(0, 20).map((event) => ({
          id: event.id, title: event.title, description: null, meta: [humanDate(event.occurredAt) ?? 'Date unavailable'], status: null, href: null,
        })) }],
        actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'SECONDARY' }],
      }],
      suggestions: events.slice(0, 3).map((event) => `Change the visibility of the timeline event ${event.title}`),
    };
  }
  const proposed = selected.visibility;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = homeEventContextVersion(selected);
  const input = HomeEventVisibilityInputSchema.parse({ eventId: selected.id, value: proposed });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_VISIBILITY_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      homeEventVisibility: input, homeEventVisibilityContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'home-event-visibility-review', title: `Review who can see ${selected.title}`, body: 'No shared-home record has changed yet. Choose the visibility, then confirm.', tone: 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'SECONDARY' }] }],
    confirmation: homeEventVisibilityConfirmation(selected, selected.visibility, proposed, 1, expiresAt),
    suggestions: [],
  };
}

registerCapabilityHandler('home-event.visibility', async (envelope) => homeEventVisibilityResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

// Phase 3 write slice 3: provider / expiry-date correction on a Warranty.
// OWNER-ONLY: a Warranty belongs to one member's homeownerProfile and the
// canonical updateWarranty is scoped to it (the traditional Warranties page
// has the same rule), so actions are declared only for warranties the
// requester added and confirm re-verifies ownership.
const WARRANTY_CATEGORY_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Appliance', value: 'APPLIANCE' }, { label: 'HVAC', value: 'HVAC' }, { label: 'Roofing', value: 'ROOFING' }, { label: 'Plumbing', value: 'PLUMBING' },
  { label: 'Electrical', value: 'ELECTRICAL' }, { label: 'Structural', value: 'STRUCTURAL' }, { label: 'Home warranty plan', value: 'HOME_WARRANTY_PLAN' }, { label: 'Other', value: 'OTHER' },
];

type WarrantyCorrectionMeta = CorrectionFieldSpec & { action: string; message: string };

export const WARRANTY_CORRECTION_FIELDS: Record<'providerName' | 'expiryDate' | 'startDate' | 'category' | 'policyNumber' | 'cost' | 'coverageDetails', WarrantyCorrectionMeta> = {
  providerName: { label: 'provider', action: 'Correct provider', message: 'Correct the provider of this warranty.', kind: 'TEXT', min: 2, max: 120 },
  expiryDate: { label: 'expiry date', action: 'Correct expiry date', message: 'Correct the expiry date of this warranty.', kind: 'DATE' },
  startDate: { label: 'start date', action: 'Correct start date', message: 'Correct the start date of this warranty.', kind: 'DATE' },
  category: { label: 'coverage type', action: 'Correct coverage type', message: 'Correct the coverage type of this warranty.', kind: 'SELECT', options: WARRANTY_CATEGORY_OPTIONS },
  policyNumber: { label: 'policy number', action: 'Correct policy number', message: 'Correct the policy number of this warranty.', kind: 'TEXT', max: 160 },
  cost: { label: 'cost', action: 'Correct cost', message: 'Correct the cost of this warranty.', kind: 'MONEY' },
  coverageDetails: { label: 'coverage details', action: 'Correct coverage details', message: 'Correct the coverage details of this warranty.', kind: 'TEXTAREA', max: 2000 },
};

type WarrantyCorrectionField = keyof typeof WARRANTY_CORRECTION_FIELDS;

// Order matters where words overlap: "coverage details" before "coverage type", and the dates before "provider".
function warrantyCorrectionField(message: string): WarrantyCorrectionField | null {
  if (/\b(?:coverage details|details)\b/i.test(message)) return 'coverageDetails';
  if (/\b(?:coverage type|category)\b/i.test(message)) return 'category';
  if (/\bpolicy\b/i.test(message)) return 'policyNumber';
  if (/\b(?:cost|price|premium)\b/i.test(message)) return 'cost';
  if (/\bstart(?:s|ed|ing)?\b/i.test(message)) return 'startDate';
  if (/\bexpir(?:y|ation|es)\b/i.test(message)) return 'expiryDate';
  if (/\b(?:provider|name)\b/i.test(message)) return 'providerName';
  return null;
}

// Field-level validation plus the one cross-field rule: the start date must stay before the expiry date.
export function warrantyCorrectionValueError(field: WarrantyCorrectionField, value: unknown, row: { startDate: Date; expiryDate: Date }): string | null {
  const base = correctionValueError(WARRANTY_CORRECTION_FIELDS[field], value);
  if (base || typeof value !== 'string') return base;
  if (field === 'expiryDate' && new Date(`${value.trim()}T00:00:00Z`) < row.startDate) return 'The expiry date cannot be before the warranty start date.';
  if (field === 'startDate' && new Date(`${value.trim()}T00:00:00Z`) >= row.expiryDate) return 'The start date must be before the warranty expiry date.';
  return null;
}

export function warrantyFieldCurrent(warranty: object, field: WarrantyCorrectionField): string | null {
  const raw = (warranty as Record<string, unknown>)[field];
  const kind = WARRANTY_CORRECTION_FIELDS[field].kind;
  if (kind === 'DATE') return correctionDateString(raw);
  if (kind === 'MONEY') return correctionMoneyFromDollars(raw);
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

// Narrowed patch: only the one confirmed field, never a request body.
export function warrantyFieldPatch(field: WarrantyCorrectionField, normalized: string): Record<string, unknown> {
  const kind = WARRANTY_CORRECTION_FIELDS[field].kind;
  if (kind === 'DATE') return { [field]: new Date(`${normalized}T00:00:00Z`) };
  if (kind === 'MONEY') return { [field]: Number(normalized) };
  return { [field]: normalized };
}

export function warrantyContextVersion(warranty: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${warranty.id}:${warranty.updatedAt.toISOString()}`).digest('hex');
}

// `owned` is decided by the caller from the requester's own homeownerProfile
// -- never from role alone.
export function warrantyCorrectionItemActions(canManage: boolean, owned: boolean) {
  if (!canManage || !owned) return undefined;
  return (Object.keys(WARRANTY_CORRECTION_FIELDS) as WarrantyCorrectionField[]).map((field) => ({
    id: `correct-${field}`, label: WARRANTY_CORRECTION_FIELDS[field].action, message: WARRANTY_CORRECTION_FIELDS[field].message,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'WARRANTY_CORRECT',
  }));
}

export function warrantyCorrectionConfirmation(warranty: { id: string; providerName: string }, field: WarrantyCorrectionField, current: string | null, proposed: string | null, version: number, expiresAt: Date) {
  const meta = WARRANTY_CORRECTION_FIELDS[field];
  return {
    confirmationId: `warranty-correct-${warranty.id}-${version}`, version, title: `Correct the ${meta.label} of the ${warranty.providerName} warranty?`,
    description: 'This writes through the canonical warranty service, the same record the Warranties page edits, and refreshes dependent coverage analysis.',
    fields: [{ label: 'Warranty', value: warranty.providerName }, { label: 'Field', value: meta.label }, { label: 'Current value', value: correctionDisplay(meta, current) }],
    editableFields: [{
      key: 'value', label: `Corrected ${meta.label}`, type: meta.kind, value: proposed ?? '',
      ...(meta.kind === 'SELECT' ? { options: [...(meta.options ?? [])] } : {}),
    }],
    confirmLabel: `Save ${meta.label}`, consentText: 'I authorize this correction to the warranty record.', expiresAt: expiresAt.toISOString(),
  };
}

// Phase 3 add slice: start a user-initiated warranty add. Returns the empty form; submitting it resumes through
// the existing CAPTURE_WARRANTY_EDIT path (validation, ISO date normalisation, confirmation card) and confirming
// writes through the existing confirmCaptureWarranty / captureWarranty writer.
export async function warrantyAddResult(userId: string, propertyId: string, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const warrantiesHref = '/dashboard/warranties';
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'warranty-add-permission', title: 'A contributor or owner can add a warranty', body: 'Your role can view warranties but not add them. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-warranties', label: 'Open Warranties', href: warrantiesHref, style: 'SECONDARY' }] }],
      suggestions: [],
    };
  }
  const contextVersion = createHash('sha256').update(`warranty-add:${propertyId}`).digest('hex');
  return {
    status: 'NEEDS_CONTEXT', reasonCode: 'WARRANTY_ADD_INPUT_REQUIRED', contextVersion,
    parameters: { captureOrigin: USER_ADD_ORIGIN, sourceExecutionId },
    blocks: [{ type: 'SUMMARY', id: 'warranty-add-input', title: 'Add a warranty', body: 'Nothing has been saved yet. Enter the details, then review them before the warranty is added.', tone: 'DEFAULT', actions: [{ id: 'open-warranties', label: 'Open Warranties instead', href: warrantiesHref, style: 'SECONDARY' }] }],
    captureRequests: [warrantyAddCaptureRequest(contextVersion)],
    suggestions: [],
  };
}

// Start a user-initiated timeline event add: returns the empty form. Submitting it (CAPTURE_EVENT_ADD) builds the
// review card with the parameters extraction produces, and confirming writes through the existing
// confirmCaptureEvent / createHomeEvent path keyed on this execution.
export async function eventAddResult(userId: string, propertyId: string, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const timelineHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/timeline`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'event-add-permission', title: 'A contributor or owner can add a timeline event', body: 'Your role can view the timeline but not add to it. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-timeline', label: 'Open home timeline', href: timelineHref, style: 'SECONDARY' }] }],
      suggestions: [],
    };
  }
  const contextVersion = createHash('sha256').update(`event-add:${propertyId}`).digest('hex');
  return {
    status: 'NEEDS_CONTEXT', reasonCode: 'EVENT_ADD_INPUT_REQUIRED', contextVersion,
    parameters: { captureOrigin: USER_ADD_ORIGIN, sourceExecutionId },
    blocks: [{ type: 'SUMMARY', id: 'event-add-input', title: 'Add a timeline event', body: 'Nothing has been saved yet. Enter the details, then review them before the event is added.', tone: 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open home timeline instead', href: timelineHref, style: 'SECONDARY' }] }],
    captureRequests: [eventAddCaptureRequest(contextVersion)],
    suggestions: [],
  };
}

// Evidence can be attached to a home timeline event (the original), and (FRD v1.99) to an inventory item or a warranty. All
// three reuse CAPTURE_EVIDENCE_CONFIRM: the target type travels in the execution's own stored parameters.
export type EvidenceAttachTargetType = 'HOME_EVENT' | 'INVENTORY_ITEM' | 'WARRANTY';
export const EVIDENCE_ATTACH_TARGET_TYPES: readonly EvidenceAttachTargetType[] = ['HOME_EVENT', 'INVENTORY_ITEM', 'WARRANTY'];
const EVIDENCE_TARGET_COPY: Record<EvidenceAttachTargetType, { noun: string; where: string; missingTitle: string; missingBody: string }> = {
  HOME_EVENT: { noun: 'timeline entry', where: 'home timeline entry', missingTitle: 'This timeline event is no longer available', missingBody: 'It may have been corrected, removed, or you no longer have access to it. Open the home timeline to find it.' },
  INVENTORY_ITEM: { noun: 'inventory item', where: 'inventory item', missingTitle: 'This inventory item is no longer available', missingBody: 'It may have been removed, or you no longer have access to it. Open the home inventory to find it.' },
  WARRANTY: { noun: 'warranty', where: 'warranty', missingTitle: 'This warranty is no longer available', missingBody: 'It may have been removed, or only the person who added it can attach documents to it. Open Warranties to check.' },
};

function evidenceAttachConfirmation(document: { id: string; name: string }, target: { id: string; title: string; type: EvidenceAttachTargetType }, version: number, expiresAt: Date) {
  const copy = EVIDENCE_TARGET_COPY[target.type];
  return {
    confirmationId: `evidence-attach-${target.id}-${version}`, version, title: 'Attach this document as evidence?',
    description: `You are attaching a document you just uploaded to this ${copy.where}. No change is saved until you confirm.`,
    fields: [{ label: 'Document', value: document.name }, { label: 'Attach to', value: target.title }],
    editableFields: [], confirmLabel: 'Attach document',
    consentText: target.type === 'HOME_EVENT' ? 'I confirm this document is evidence for this home record entry.' : `I confirm this document belongs with this ${copy.noun}.`,
    expiresAt: expiresAt.toISOString(),
  };
}

// The exact target is re-read at propose time (never trusted from launchContext), with the same scoping each type's own
// correction uses: a PRIVATE event only for its creator, an inventory item of this property, and a warranty only for the
// household member who added it.
async function evidenceTarget(userId: string, propertyId: string, type: EvidenceAttachTargetType, id: string): Promise<{ id: string; title: string; type: EvidenceAttachTargetType } | null> {
  if (type === 'HOME_EVENT') {
    const event = await prisma.homeEvent.findFirst({
      where: { id, propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }] },
      select: { id: true, title: true },
    });
    return event ? { id: event.id, title: event.title, type } : null;
  }
  if (type === 'INVENTORY_ITEM') {
    const item = await prisma.inventoryItem.findFirst({ where: { id, propertyId }, select: { id: true, name: true } });
    return item ? { id: item.id, title: item.name, type } : null;
  }
  const warranty = await prisma.warranty.findFirst({ where: { id, propertyId, homeownerProfile: { userId } }, select: { id: true, providerName: true } });
  return warranty ? { id: warranty.id, title: warranty.providerName, type } : null;
}

export async function evidenceAttachResult(userId: string, propertyId: string, targetId: string, documentId: string, sourceExecutionId: string | null, targetType: EvidenceAttachTargetType = 'HOME_EVENT'): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const copy = EVIDENCE_TARGET_COPY[targetType];
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'evidence-attach-permission', title: 'A contributor or owner can attach evidence', body: `Your role can view this ${copy.noun} but not attach documents to it.`, tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const target = await evidenceTarget(userId, propertyId, targetType, targetId);
  if (!target) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: `${targetType}_NOT_FOUND`,
      blocks: [{ type: 'SUMMARY', id: 'evidence-attach-event-missing', title: copy.missingTitle, body: copy.missingBody, tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  // The document was just uploaded (property-scoped) by POST .../evidence-upload; re-verified here rather than
  // trusted from launchContext, same "never trust the client's id" pattern as every dynamic room/item dropdown.
  const document = await prisma.document.findFirst({ where: { id: documentId, propertyId }, select: { id: true, name: true, inventoryItemId: true, warrantyId: true } });
  if (!document) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'DOCUMENT_NOT_FOUND',
      blocks: [{ type: 'SUMMARY', id: 'evidence-attach-document-missing', title: 'The uploaded document could not be found', body: `Upload the file again from this ${copy.noun}.`, tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  // A document already filed under a different item or warranty is not moved silently.
  const linkedElsewhere = (targetType === 'INVENTORY_ITEM' && document.inventoryItemId && document.inventoryItemId !== target.id)
    || (targetType === 'WARRANTY' && document.warrantyId && document.warrantyId !== target.id);
  if (linkedElsewhere) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'DOCUMENT_ALREADY_LINKED',
      blocks: [{ type: 'SUMMARY', id: 'evidence-attach-document-linked', title: 'This document is already filed elsewhere', body: 'It is attached to another record. Upload a new copy to attach it here.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'EVIDENCE_ATTACH_CONFIRMATION_REQUIRED',
    parameters: {
      documentId: document.id, eventId: targetType === 'HOME_EVENT' ? target.id : undefined, evidenceTargetType: targetType, evidenceTargetId: target.id,
      captureOrigin: USER_ADD_ORIGIN, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'evidence-attach-review', title: `Attach this document to "${target.title}"?`, body: 'Nothing has been saved yet. Review, then confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: evidenceAttachConfirmation(document, target, 1, expiresAt),
    suggestions: [],
  };
}

async function warrantyCorrectResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const warrantiesHref = '/dashboard/warranties';
  const warranties = await prisma.warranty.findMany({
    where: { propertyId }, orderBy: { expiryDate: 'asc' }, take: 200,
    select: { id: true, providerName: true, startDate: true, expiryDate: true, updatedAt: true, category: true, policyNumber: true, cost: true, coverageDetails: true, homeownerProfile: { select: { userId: true } } },
  });
  const selected = exactEntityMatch(warranties.map((warranty) => ({ ...warranty, title: warranty.providerName })), message, launchContext);
  if (!selected) {
    const mine = warranties.filter((warranty) => warranty.homeownerProfile.userId === userId);
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'WARRANTY_TARGET_REQUIRED',
      ...durableFreeTextClarification('WARRANTY_CORRECT', 'Which warranty should Ask correct? Use its exact provider name.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'warranty-selection', title: 'Choose the warranty to correct',
        description: 'Only warranties you added can be corrected here. Use the exact provider name in your next message; nothing has changed.',
        sections: [{ id: 'warranties', title: 'Your warranties', count: mine.length, items: mine.slice(0, 20).map((warranty) => ({
          id: warranty.id, title: warranty.providerName, description: null, meta: [`Expires ${humanDate(warranty.expiryDate) ?? 'date unavailable'}`], status: null, href: null,
        })) }],
        actions: [{ id: 'open-warranties', label: 'Open Warranties', href: warrantiesHref, style: 'SECONDARY' }],
      }],
      suggestions: mine.slice(0, 3).map((warranty) => `Correct the expiry date of the ${warranty.providerName} warranty`),
    };
  }
  if (selected.homeownerProfile.userId !== userId) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'WARRANTY_NOT_OWNED_BY_REQUESTER',
      blocks: [{ type: 'SUMMARY', id: 'warranty-not-owned', title: 'Only the member who added this warranty can change it', body: 'This warranty belongs to another household member\'s profile, so it cannot be corrected here. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-warranties', label: 'Open Warranties', href: warrantiesHref, style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }
  const field = warrantyCorrectionField(message);
  if (!field) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'WARRANTY_CORRECTION_FIELD_REQUIRED',
      ...durableFreeTextClarification('WARRANTY_CORRECT', `Which detail of the ${selected.providerName} warranty should change? Ask can correct its provider, dates, coverage type, policy number, cost, or coverage details.`),
      blocks: [{ type: 'SUMMARY', id: 'warranty-correct-field', title: 'Which detail should change?', body: 'Say provider, expiry date, start date, coverage type, policy number, cost, or coverage details. Nothing has changed.', tone: 'CAUTION', actions: [] }],
      suggestions: [`Correct the provider of the ${selected.providerName} warranty`, `Correct the expiry date of the ${selected.providerName} warranty`],
    };
  }
  const current = warrantyFieldCurrent(selected, field);
  const stated = WARRANTY_CORRECTION_FIELDS[field].kind === 'DATE' ? message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null : null;
  const proposed = stated && isValidDateEditInput(stated) ? stated : current;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = warrantyContextVersion(selected);
  const input = WarrantyCorrectionInputSchema.parse({ warrantyId: selected.id, field, value: proposed });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'WARRANTY_CORRECTION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      warrantyCorrection: input, warrantyCorrectionContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'warranty-correct-review', title: `Review this ${WARRANTY_CORRECTION_FIELDS[field].label} correction`, body: 'No warranty record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT', actions: [{ id: 'open-warranties', label: 'Open Warranties', href: warrantiesHref, style: 'SECONDARY' }] }],
    confirmation: warrantyCorrectionConfirmation(selected, field, current, proposed, 1, expiresAt),
    suggestions: [],
  };
}

registerCapabilityHandler('warranty.correct', async (envelope) => warrantyCorrectResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));


export const roomTypeLabel = (value: string): string => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

const ROOM_FLOOR_MIN = -5;

const ROOM_FLOOR_MAX = 50;

type RoomCorrectionMeta = CorrectionFieldSpec & { action: string; message: string };

export const ROOM_CORRECTION_FIELDS: Record<'name' | 'type' | 'floorLevel', RoomCorrectionMeta> = {
  name: { label: 'name', action: 'Rename room', message: 'Rename this room.', kind: 'TEXT', min: 1, max: 80 },
  type: { label: 'type', action: 'Change room type', message: 'Change the type of this room.', kind: 'SELECT', options: ROOM_TYPE_VALUES.map((value) => ({ label: roomTypeLabel(value), value })) },
  // Whole number of storeys from the ground floor (0); a basement is negative. Validated in roomCorrectionValueError.
  floorLevel: { label: 'floor level', action: 'Change floor level', message: 'Change the floor level of this room.', kind: 'TEXT', min: 1, max: 3 },
};

type RoomCorrectionField = keyof typeof ROOM_CORRECTION_FIELDS;

// Which field a message asks to change. The declared row actions send an exact canned message, and "rename" always means the
// name (so a room called "Floor 2 office" is not mistaken for a floor-level request); only free text falls back to keywords.
function roomCorrectionField(message: string): RoomCorrectionField {
  const exact = (Object.keys(ROOM_CORRECTION_FIELDS) as RoomCorrectionField[]).find((field) => ROOM_CORRECTION_FIELDS[field].message === message);
  if (exact) return exact;
  if (/\brename\b/i.test(message)) return 'name';
  if (/\bfloor\b|\bstor(?:e)?y\b/i.test(message)) return 'floorLevel';
  if (/\b(?:type|kind)\b/i.test(message)) return 'type';
  return 'name';
}

export function roomFieldCurrent(room: { name: string; type: string | null; floorLevel: number | null }, field: RoomCorrectionField): string | null {
  if (field === 'name') return room.name;
  if (field === 'type') return room.type;
  return room.floorLevel === null || room.floorLevel === undefined ? null : String(room.floorLevel);
}

export function roomFieldDisplay(field: RoomCorrectionField, value: string | null): string {
  if (value === null || value === '') return 'Not recorded';
  if (field === 'type') return roomTypeLabel(value);
  if (field === 'floorLevel') return value === '0' ? '0 (ground floor)' : Number(value) < 0 ? `${value} (below ground)` : value;
  return value;
}

export function roomContextVersion(room: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${room.id}:${room.updatedAt.toISOString()}`).digest('hex');
}

// Returns a homeowner-facing reason the proposed name is unusable, else null.
async function roomRenameNameError(propertyId: string, roomId: string, value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !value.trim()) return 'Enter the new room name.';
  const name = value.trim();
  if (name.length > 80) return 'A room name can be at most 80 characters.';
  const clash = await prisma.inventoryRoom.findFirst({ where: { propertyId, name, id: { not: roomId } }, select: { id: true } });
  return clash ? 'Another room in this home already has that name.' : null;
}

// A homeowner-facing reason the proposed value is unusable for this field, else null.
export async function roomCorrectionValueError(propertyId: string, roomId: string, field: RoomCorrectionField, value: unknown): Promise<string | null> {
  if (field === 'name') return roomRenameNameError(propertyId, roomId, value);
  if (field === 'type') return correctionValueError(ROOM_CORRECTION_FIELDS.type, value);
  if (typeof value !== 'string' || !/^-?\d{1,2}$/.test(value.trim())) return `Enter a whole number from ${ROOM_FLOOR_MIN} to ${ROOM_FLOOR_MAX}: 0 is the ground floor, -1 a basement.`;
  const level = Number(value.trim());
  return level >= ROOM_FLOOR_MIN && level <= ROOM_FLOOR_MAX ? null : `The floor level must be from ${ROOM_FLOOR_MIN} to ${ROOM_FLOOR_MAX}.`;
}

// Canonical stored form of a value: trimmed text; a floor level is a plain integer string ("01" and "-0" are "1" and "0").
export function roomCorrectionNormalized(field: RoomCorrectionField, value: string): string {
  const text = value.trim();
  return field === 'floorLevel' ? String(Number(text)) : text;
}

export function roomRenameItemActions(canManage: boolean) {
  if (!canManage) return undefined;
  return (Object.keys(ROOM_CORRECTION_FIELDS) as RoomCorrectionField[]).map((field) => ({
    id: field === 'name' ? 'rename-room' : `correct-room-${field}`, label: ROOM_CORRECTION_FIELDS[field].action, message: ROOM_CORRECTION_FIELDS[field].message,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'ROOM_RENAME',
  }));
}

export function roomRenameConfirmation(room: { id: string; name: string }, field: RoomCorrectionField, current: string | null, proposed: string | null, version: number, expiresAt: Date) {
  const meta = ROOM_CORRECTION_FIELDS[field];
  return {
    confirmationId: `room-${field === 'name' ? 'rename' : `correct-${field}`}-${room.id}-${version}`, version,
    title: field === 'name' ? `Rename "${room.name}"?` : `Change the ${meta.label} of "${room.name}"?`,
    description: 'This writes through the canonical inventory service, the same record the Rooms page edits, and refreshes dependent coverage analysis.',
    fields: [{ label: 'Room', value: room.name }, ...(field === 'name' ? [{ label: 'Current name', value: room.name }] : [{ label: 'Field', value: meta.label }, { label: 'Current value', value: roomFieldDisplay(field, current) }])],
    editableFields: [{
      key: 'value', label: field === 'name' ? 'New room name' : `New ${meta.label}`, type: meta.kind, value: proposed ?? '',
      ...(meta.kind === 'SELECT' ? { options: [...(meta.options ?? [])] } : {}),
    }],
    confirmLabel: field === 'name' ? 'Save room name' : `Save ${meta.label}`,
    consentText: field === 'name' ? 'I authorize this rename of the shared home record.' : `I authorize this ${meta.label} change to the shared home record.`,
    expiresAt: expiresAt.toISOString(),
  };
}

async function roomRenameResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const roomsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/rooms`;
  const rooms = await prisma.inventoryRoom.findMany({
    where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 200,
    select: { id: true, name: true, type: true, floorLevel: true, updatedAt: true },
  });
  const field = roomCorrectionField(message);
  const selected = exactEntityMatch(rooms.map((room) => ({ ...room, title: room.name })), message, launchContext);
  if (!selected) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'ROOM_TARGET_REQUIRED',
      ...durableFreeTextClarification('ROOM_RENAME', `Which room should Ask ${field === 'name' ? 'rename' : `change the ${ROOM_CORRECTION_FIELDS[field].label} of`}? Use its exact current name.`),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'room-selection', title: field === 'name' ? 'Choose the room to rename' : `Choose the room whose ${ROOM_CORRECTION_FIELDS[field].label} to change`,
        description: 'Use the exact room name in your next message; nothing has changed.',
        sections: [{ id: 'rooms', title: 'Rooms', count: rooms.length, items: rooms.slice(0, 20).map((room) => ({
          id: room.id, title: room.name, description: null, meta: [readablePropertyValue(room.type)], status: null, href: null,
        })) }],
        actions: [{ id: 'open-rooms', label: 'Open Rooms', href: roomsHref, style: 'SECONDARY' }],
      }],
      suggestions: rooms.slice(0, 3).map((room) => (field === 'name' ? `Rename ${room.name}` : `Change the ${ROOM_CORRECTION_FIELDS[field].label} of ${room.name}`)),
    };
  }
  const current = roomFieldCurrent(selected, field);
  // The new name comes from the confirmation card's editable field; a name
  // quoted in the message ("rename X to Y") only pre-fills it.
  const stated = field === 'name' ? message.match(/\brename\b.+?\bto\s+["']?([^"'.]{1,80}?)["']?\s*$/i)?.[1]?.trim() ?? null : null;
  // A type or floor level is always picked on the card, starting from what is recorded now.
  const proposed = field === 'name' ? (stated && stated.toLowerCase() !== selected.name.toLowerCase() ? stated : selected.name) : current;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = roomContextVersion(selected);
  const input = RoomRenameInputSchema.parse({ roomId: selected.id, field, value: proposed });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_RENAME_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      roomRename: input, roomRenameContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'room-rename-review', title: field === 'name' ? `Review renaming ${selected.name}` : `Review the ${ROOM_CORRECTION_FIELDS[field].label} of ${selected.name}`, body: `No shared-home record has changed yet. ${field === 'name' ? 'Enter the new name' : 'Choose the corrected value'}, then confirm.`, tone: 'DEFAULT', actions: [{ id: 'open-rooms', label: 'Open Rooms', href: roomsHref, style: 'SECONDARY' }] }],
    confirmation: roomRenameConfirmation(selected, field, current, proposed, 1, expiresAt),
    suggestions: [],
  };
}

registerCapabilityHandler('room.rename', async (envelope) => roomRenameResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('household.invitation', async (envelope) => householdInvitationResult(envelope.userId, envelope.propertyId!, envelope.message));

// A timeline event is added inline only from the declared "Add a timeline event" action (same guard as the warranty
// add: never for an ASK_REFRESH re-run of a pending extraction-created confirmation, never for a bare message).
export const EVENT_ADD_MESSAGE = 'Add an event to my home timeline.';

// A warranty is added inline only from the declared "Add a warranty" action on the warranties list. Every other
// call for this operation (an ASK_REFRESH re-run of a pending, extraction-created confirmation, or a message that
// merely names it) keeps the original not-directly-routable boundary, so a pending candidate is never replaced
// by an empty form.
export const WARRANTY_ADD_MESSAGE = 'Add a warranty to my home record.';

// ── Add a room (user-initiated) ──────────────────────────────────────────────────────────────────────────
// A room is added inline only from the declared "Add a room" action. The form asks for a type, a REQUIRED name (the
// service would otherwise derive a default name from the type, which could silently collide) and an optional floor
// level. Submitting builds the review card; confirming creates the room through inventoryService.createRoom and
// repeats the three stale-analysis markers the traditional POST controller calls.
export const ROOM_ADD_MESSAGE = 'Add a room to my home record.';

export const ROOM_CREATE_CAPTURE_KEY = 'ROOM_CREATE_INPUTS';

type RoomCreateInput = z.infer<typeof RoomCreateInputSchema>;

export const roomCreateContextVersion = (propertyId: string): string => createHash('sha256').update(`room-create:${propertyId}`).digest('hex');

function roomCreateCaptureRequest(contextVersion: string, entered?: Partial<RoomCreateInput>): AskCaptureRequest {
  return {
    requirementId: 'room-create-inputs', captureKey: ROOM_CREATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Add a room', question: 'Which room would you like to add to your home record?',
    helpText: 'Give the room a name that is not already used. The floor level is optional. You will review everything before it is added.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'type', label: 'Room type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: ROOM_TYPE_VALUES.map((value) => ({ label: roomTypeLabel(value), value })) } },
      { key: 'name', label: 'Room name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 80 } },
      { key: 'floorLevel', label: 'Floor level', helpText: 'Optional: 0 is the ground floor, -1 a basement.', required: false, inputSchema: { type: 'INTEGER', min: -5, max: 50 } },
    ] },
    currentAnswer: { type: entered?.type ?? null, name: entered?.name ?? null, floorLevel: entered?.floorLevel ?? null },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this room; nothing is added until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function roomCreateResult(userId: string, propertyId: string, suppliedInput: RoomCreateInput | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const roomsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/rooms`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'room-add-permission', title: 'A contributor or owner can add a room', body: 'Your role can view rooms but not add them. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-rooms', label: 'Open Rooms', href: roomsHref, style: 'SECONDARY' }] }],
      suggestions: [],
    };
  }
  const contextVersion = roomCreateContextVersion(propertyId);
  const openRooms = { id: 'open-rooms', label: 'Open Rooms instead', href: roomsHref, style: 'SECONDARY' as const };
  if (!suppliedInput) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_CREATE_INPUT_REQUIRED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'room-create-input', title: 'Add a room', body: 'Nothing has been added yet. Enter the details, then review them before the room is added.', tone: 'DEFAULT', actions: [openRooms] }],
      captureRequests: [roomCreateCaptureRequest(contextVersion)], suggestions: [],
    };
  }
  const clash = await prisma.inventoryRoom.findFirst({ where: { propertyId, name: suppliedInput.name }, select: { id: true } });
  if (clash) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_NAME_ALREADY_USED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'room-create-name-used', title: `A room named "${suppliedInput.name}" already exists`, body: 'Choose a different name. Nothing has been added.', tone: 'CAUTION', actions: [openRooms] }],
      captureRequests: [roomCreateCaptureRequest(contextVersion, suppliedInput)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_CREATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { roomCreate: suppliedInput, roomCreateContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'room-create-review', title: 'Review this room', body: 'You entered these details. Nothing is added until you confirm.', tone: 'DEFAULT', actions: [openRooms] }],
    confirmation: {
      confirmationId: `room-create-${createHash('sha256').update(`${propertyId}:${suppliedInput.name}`).digest('hex').slice(0, 12)}-1`, version: 1,
      title: `Add the room "${suppliedInput.name}"?`,
      description: 'This adds the room through the canonical inventory service, the same record the Rooms page edits, and refreshes dependent coverage analysis.',
      fields: [
        { label: 'Room name', value: suppliedInput.name }, { label: 'Type', value: roomTypeLabel(suppliedInput.type) },
        ...(suppliedInput.floorLevel !== null ? [{ label: 'Floor level', value: String(suppliedInput.floorLevel) }] : []),
      ],
      editableFields: [], confirmLabel: 'Add room', consentText: 'I authorize adding this room to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [roomCreateCaptureRequest(contextVersion, suppliedInput)],
    suggestions: [],
  };
}

registerCapabilityHandler('room.create', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'ROOM_CREATE'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === ROOM_ADD_MESSAGE;
  if (declaredAddAction) return roomCreateResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  // A refresh of an in-progress add, or a bare message: never start (or reset) a form here.
  return {
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_ROOM_CREATE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{ type: 'SUMMARY', id: 'room-create-not-routable', title: 'Use the Add a room button', body: 'Rooms are added from the Rooms list in your home summary. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
    suggestions: ['Show my rooms'],
  };
});

// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22). The
// two new capture-confirm write handlers -- the actual functional core this
// phase's acceptance criterion is about (a synthetic candidate can be
// confirmed, retried under a lease-reclaim race, rejected, and persisted
// exactly once). Both delegate the real write to an existing, idempotent
// writer (capturePropertyFact / HomeEventsService.createHomeEvent) keyed on
// this execution's own id -- captureExecutionId / idempotencyKey
// respectively -- rather than reimplementing idempotency here.
export const homeEventsServiceForCapture = new HomeEventsService();
