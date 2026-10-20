// Timeline-event domain definition for the shared RecordEditor (FRD v1.386): the nine fields, the values read from the
// current revision, the rules that depend on the record or the requester (disabled-with-reason fields, creator-only
// Private), and the patch written on confirm. Freshness and idempotency stay in the handlers.
import { prisma } from '../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../riskAssetApplicability';
import { correctionDateString, correctionMoneyFromDollars } from '../askCorrectionFields';
import { diffEditorValues, readEditorAnswer, type RecordEditorDescriptor, type RecordEditorErrors, type RecordEditorField } from '../recordEditor/recordEditor.contract';
import { HOME_EVENT_IMPORTANCE_OPTIONS, HOME_EVENT_TYPE_OPTIONS } from './homeEventCorrection';

export const HOME_EVENT_EDITOR_SECTIONS = [
  { id: 'event', title: 'Event' },
  { id: 'details', title: 'Details' },
  { id: 'links', title: 'Links' },
] as const;

const VISIBILITY_OPTIONS = [
  { label: 'Private (only you)', value: 'PRIVATE' },
  { label: 'Household', value: 'HOUSEHOLD' },
  { label: 'Resale pack', value: 'RESALE_PACK' },
];

const GUIDED_PLAN_TYPE = 'VERIFIED_RESOLUTION';

export interface HomeEventEditorRow {
  id: string;
  title: string;
  revision: number;
  occurredAt: Date;
  datePrecision: string;
  summary: string | null;
  amount: unknown;
  type: string;
  importance: string;
  visibility: string;
  verificationStatus?: string | null;
  createdById: string | null;
  roomId: string | null;
  inventoryItemId: string | null;
}

export const HOME_EVENT_EDITOR_SELECT = {
  id: true, title: true, revision: true, occurredAt: true, datePrecision: true, summary: true, amount: true, type: true, importance: true,
  visibility: true, verificationStatus: true, createdById: true, roomId: true, inventoryItemId: true,
} as const;

export const homeEventEditorValues = (row: HomeEventEditorRow): Record<string, string> => ({
  title: row.title,
  type: row.type,
  occurredAt: correctionDateString(row.occurredAt) ?? '',
  importance: row.importance,
  summary: row.summary ?? '',
  amount: correctionMoneyFromDollars(row.amount) ?? '',
  visibility: row.visibility,
  roomId: row.roomId ?? '',
  inventoryItemId: row.inventoryItemId ?? '',
});

/** Why this requester cannot move this event to or from PRIVATE, or null. Re-checked at confirm. */
export function homeEventPrivacyBlocker(userId: string, createdById: string | null, current: string, proposed: string): string | null {
  return current !== proposed && (current === 'PRIVATE' || proposed === 'PRIVATE') && createdById !== userId
    ? 'Only the person who added this event can change it to or from private.'
    : null;
}

const dateHelp = (precision: string): string | undefined => precision === 'MONTH' || precision === 'YEAR' || precision === 'UNKNOWN'
  ? `${precision === 'UNKNOWN' ? 'This date is not recorded exactly.' : `This date is recorded by ${precision.toLowerCase()}.`} Choosing a day makes the date exact.`
  : undefined;

/** Live, property-scoped options for the two link fields, always including what the event currently links to. */
async function linkOptions(propertyId: string, row: HomeEventEditorRow) {
  const [rooms, items] = await Promise.all([
    prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 50, select: { id: true, name: true } }),
    prisma.inventoryItem.findMany({ where: { propertyId, ...visibleInventoryItemWhere() }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true } }),
  ]);
  const withCurrent = async <T extends { id: string; name: string }>(list: T[], id: string | null, load: () => Promise<{ id: string; name: string } | null>) => {
    if (!id || list.some((entry) => entry.id === id)) return list;
    const found = await load();
    return found ? [found, ...list] : list;
  };
  const allRooms = await withCurrent(rooms, row.roomId, () => prisma.inventoryRoom.findFirst({ where: { id: row.roomId!, propertyId }, select: { id: true, name: true } }));
  const allItems = await withCurrent(items, row.inventoryItemId, () => prisma.inventoryItem.findFirst({ where: { id: row.inventoryItemId!, propertyId, ...visibleInventoryItemWhere() }, select: { id: true, name: true } }));
  return {
    rooms: allRooms.map((room) => ({ label: room.name, value: room.id })),
    items: allItems.map((item) => ({ label: item.name, value: item.id })),
  };
}

/** The fields for THIS event and requester: disabled-with-reason and option filters depend on both. */
export async function homeEventEditorFields(propertyId: string, row: HomeEventEditorRow, userId: string): Promise<RecordEditorField[]> {
  const links = await linkOptions(propertyId, row);
  const isGuidedPlan = row.type === GUIDED_PLAN_TYPE;
  const isRange = row.datePrecision === 'RANGE';
  const creator = row.createdById === userId;
  return [
    { key: 'title', label: 'Title', kind: 'TEXT', section: 'event', required: true, maxLength: 140 },
    {
      key: 'type', label: 'Type', kind: 'SELECT', section: 'event', required: true,
      options: isGuidedPlan ? [{ label: 'Guided plan completion', value: GUIDED_PLAN_TYPE }, ...HOME_EVENT_TYPE_OPTIONS] : HOME_EVENT_TYPE_OPTIONS,
      ...(isGuidedPlan ? { disabledReason: 'Type is fixed because this event records completion of a guided plan.' } : {}),
    },
    {
      key: 'occurredAt', label: 'Date', kind: 'DATE', section: 'event', required: true,
      ...(isRange ? { disabledReason: 'This event is recorded as a date range; editing a range is not supported here yet.' } : dateHelp(row.datePrecision) ? { helpText: dateHelp(row.datePrecision) } : {}),
    },
    { key: 'importance', label: 'Importance', kind: 'SELECT', section: 'event', required: true, options: HOME_EVENT_IMPORTANCE_OPTIONS },
    { key: 'summary', label: 'Summary', kind: 'TEXTAREA', section: 'details', required: false, maxLength: 500 },
    { key: 'amount', label: 'Amount (USD)', kind: 'MONEY', section: 'details', required: false },
    {
      key: 'visibility', label: 'Visibility', kind: 'SELECT', section: 'details', required: true,
      options: creator || row.visibility === 'PRIVATE' ? VISIBILITY_OPTIONS : VISIBILITY_OPTIONS.filter((option) => option.value !== 'PRIVATE'),
      ...(creator || row.visibility === 'PRIVATE' ? {} : { helpText: 'Only the person who added this event can make it private.' }),
    },
    { key: 'roomId', label: 'Room', kind: 'SELECT', section: 'links', required: false, options: links.rooms, emptyLabel: 'No room' },
    { key: 'inventoryItemId', label: 'Inventory item', kind: 'SELECT', section: 'links', required: false, options: links.items, emptyLabel: 'No item' },
  ];
}

export async function homeEventEditorDescriptor(propertyId: string, row: HomeEventEditorRow, userId: string, version: string): Promise<RecordEditorDescriptor & { fields: RecordEditorField[] }> {
  return { recordLabel: row.title, sections: HOME_EVENT_EDITOR_SECTIONS, fields: await homeEventEditorFields(propertyId, row, userId), original: homeEventEditorValues(row), version };
}

/** Field rules (disabled fields must be unchanged), the 3-character title floor and the creator-only Private rule. */
export function validateHomeEventEditorAnswer(fields: readonly RecordEditorField[], original: Record<string, string>, answer: unknown, ctx: { userId: string; createdById: string | null }): { values: Record<string, string>; errors: RecordEditorErrors } {
  const { values, errors } = readEditorAnswer(fields, answer, original);
  if (!errors.title && values.title.length < 3) errors.title = 'Use at least 3 characters for the title.';
  if (!errors.visibility) {
    const blocked = homeEventPrivacyBlocker(ctx.userId, ctx.createdById, original.visibility, values.visibility);
    if (blocked) errors.visibility = blocked;
  }
  return { values, errors };
}

export const homeEventEditorChanges = (fields: readonly RecordEditorField[], original: Record<string, string>, values: Record<string, string>) => diffEditorValues(fields, original, values);

/** The narrowed patch for ONLY the changed keys. A changed date records an exact day; a cleared optional field writes null. */
export function homeEventEditorPatch(changedKeys: readonly string[], values: Record<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of changedKeys) {
    const value = values[key];
    if (key === 'occurredAt') { patch.occurredAt = `${value}T00:00:00.000Z`; patch.datePrecision = 'EXACT_DATE'; }
    else if (key === 'amount') patch.amount = value ? Number(value) : null;
    else if (key === 'summary' || key === 'roomId' || key === 'inventoryItemId') patch[key] = value || null;
    else patch[key] = value;
  }
  return patch;
}

/** How the saved change reads to the homeowner, including what happens to verification. */
export function homeEventUpdateDescription(changedKeys: readonly string[], verificationStatus: string | null | undefined): string {
  if (changedKeys.length === 1 && changedKeys[0] === 'visibility') return 'This changes who can see the event in place. It does not create a new revision, and verification is unchanged.';
  const verification = verificationStatus === 'EVIDENCE_VERIFIED'
    ? 'This event is evidence-verified, so after this edit it returns to pending confirmation until it is verified again.'
    : 'After this edit the event is marked unverified until it is verified again.';
  return `This records ONE new revision on the canonical home timeline; the original is preserved as history. ${verification}`;
}
