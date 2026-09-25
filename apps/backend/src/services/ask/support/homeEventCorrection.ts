// Ask handler support: homeEventCorrection. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { type CorrectionFieldSpec, type CorrectionOption } from '../askCorrectionFields';

export function homeEventCorrectionItemActions(canManage: boolean) {
  if (!canManage) return undefined;
  const fields = (Object.keys(HOME_EVENT_CORRECTION_FIELDS) as HomeEventCorrectionField[]).map((field) => ({
    id: `correct-${field}`, label: HOME_EVENT_CORRECTION_FIELDS[field].action, message: HOME_EVENT_CORRECTION_FIELDS[field].message,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_EVENT_CORRECT',
  }));
  // Whether this contributor may go on to choose PRIVATE, or move a PRIVATE event to something else, is re-checked
  // against live data (createdById) in homeEventVisibilityResult/confirmHomeEventVisibility -- the action itself is
  // offered to any contributor exactly like the other event corrections, since a PRIVATE event a non-creator cannot
  // even see never reaches this list in the first place.
  return [...fields, {
    id: 'correct-visibility', label: 'Change visibility', message: HOME_EVENT_VISIBILITY_MESSAGE,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_EVENT_VISIBILITY',
  }];
}

// Phase 3 write slice 7: change who can see a HomeEvent (PRIVATE / HOUSEHOLD / RESALE_PACK). Written in place through the
// existing setVisibility writer -- unlike HOME_EVENT_CORRECT this does not supersede the event with a new revision, so the
// event id and every other field are untouched. STRICTER than the traditional PATCH route (any contributor, no ownership
// check): a change TO or FROM PRIVATE is creator-only, matching the read-side rule that a PRIVATE event is visible only to
// its creator (ensureHomeEventVisible below; every event query elsewhere in this file applies the same OR filter).
export const HOME_EVENT_VISIBILITY_MESSAGE = 'Change the visibility of this timeline event.';

// ASK_COZY_INTERACTION_MODEL_UI_FRD §8 (CONF-002/CONF-003): edits a
// declared field on an open confirmation, bumping its version rather than
// mutating in place -- a stale confirmationVersion (already superseded by
// a prior edit, or already claimed by confirmAskExecution's own claim
// transaction) is rejected exactly like an out-of-date confirm attempt is.
// This never performs the domain write itself; confirmAskExecution's own
// freshness re-check (confirmMaintenanceTaskUpdate's task-version compare)
// still runs when the edited proposal is actually confirmed. Scoped to the
// one editable-field case that exists (maintenance reschedule) rather than
// a generic per-operation registry -- extend this when a second case is
// actually implemented.
// Shared by both editAskConfirmation branches (Maintenance and, as of the
// B04 fix, Buyer) -- extracted so the exact-yyyy-mm-dd-plus-real-calendar-
// date validation is defined once and directly unit-testable, rather than
// duplicated inline in each operation's own edit path.
export function isValidDateEditInput(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Phase 3 write slice 2: title/date correction on an exact current HomeEvent.
// updateHomeEvent supersedes the row and creates a replacement with a NEW id,
// so the target is always re-resolved as (id, isCurrent, !deletedAt) and the
// receipt/artifact carries the replacement's id.
// VERIFIED_RESOLUTION is created by the system when a guidance journey completes, so it is not offered as a type
// and an event that already has it cannot have its type changed here.
export const HOME_EVENT_TYPE_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Purchase', value: 'PURCHASE' }, { label: 'Document', value: 'DOCUMENT' }, { label: 'Repair', value: 'REPAIR' },
  { label: 'Maintenance', value: 'MAINTENANCE' }, { label: 'Claim', value: 'CLAIM' }, { label: 'Improvement', value: 'IMPROVEMENT' },
  { label: 'Value update', value: 'VALUE_UPDATE' }, { label: 'Inspection', value: 'INSPECTION' }, { label: 'Note', value: 'NOTE' },
  { label: 'Milestone', value: 'MILESTONE' }, { label: 'Other', value: 'OTHER' },
];

export const HOME_EVENT_IMPORTANCE_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Low', value: 'LOW' }, { label: 'Normal', value: 'NORMAL' }, { label: 'High', value: 'HIGH' }, { label: 'Highlight', value: 'HIGHLIGHT' },
];

export type HomeEventCorrectionMeta = CorrectionFieldSpec & { action: string; message: string };

export const HOME_EVENT_CORRECTION_FIELDS: Record<'title' | 'occurredAt' | 'summary' | 'amount' | 'type' | 'importance' | 'roomId' | 'inventoryItemId', HomeEventCorrectionMeta> = {
  title: { label: 'title', action: 'Correct title', message: 'Correct the title of this timeline event.', kind: 'TEXT', min: 3, max: 140 },
  occurredAt: { label: 'date', action: 'Correct date', message: 'Correct the date of this timeline event.', kind: 'DATE' },
  summary: { label: 'summary', action: 'Correct summary', message: 'Correct the summary of this timeline event.', kind: 'TEXTAREA', max: 500 },
  amount: { label: 'amount', action: 'Correct amount', message: 'Correct the amount of this timeline event.', kind: 'MONEY' },
  type: { label: 'type', action: 'Correct type', message: 'Correct the type of this timeline event.', kind: 'SELECT', options: HOME_EVENT_TYPE_OPTIONS },
  importance: { label: 'importance', action: 'Correct importance', message: 'Correct the importance of this timeline event.', kind: 'SELECT', options: HOME_EVENT_IMPORTANCE_OPTIONS },
  // The two link fields below have no static option list -- homeEventLinkOptions builds it from the property's own
  // rooms/items at propose and edit time, and homeEventCorrectionConfirmation substitutes it in as `dynamicOptions`.
  // A raw id would mean nothing to a homeowner, so unlike every other field these are never message-extracted from
  // free text; the confirmation card's dropdown is the only way to choose a value.
  roomId: { label: 'room', action: 'Correct room', message: 'Correct the room of this timeline event.', kind: 'SELECT', options: [] },
  inventoryItemId: { label: 'inventory item', action: 'Correct inventory item', message: 'Correct the inventory item of this timeline event.', kind: 'SELECT', options: [] },
};

export type HomeEventCorrectionField = keyof typeof HOME_EVENT_CORRECTION_FIELDS;

export function readablePropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'UNKNOWN') return 'Not recorded';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const HOME_EVENT_LINK_FIELDS = new Set<HomeEventCorrectionField>(['roomId', 'inventoryItemId']);

export const HOME_EVENT_VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: 'Private (only you)', HOUSEHOLD: 'Household (everyone with access to this home)', RESALE_PACK: 'Resale pack (shared with buyers and listing agents)',
};
