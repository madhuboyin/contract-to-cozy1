// Add a timeline event on the shared RecordEditor (FRD v1.394): the field rules the server owns (which details matter for which kind of
// event), the date-with-precision encoding, and the conversion between the editor's strings and the typed answer the confirmation builder reads.
import { prisma } from '../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../riskAssetApplicability';
import { type RecordEditorField, type RecordEditorSection } from '../recordEditor/recordEditor.contract';
import { HOME_EVENT_IMPORTANCE_OPTIONS, HOME_EVENT_TYPE_OPTIONS } from './homeEventCorrection';

export const EVENT_AMOUNT_TYPES = ['PURCHASE', 'REPAIR', 'MAINTENANCE', 'CLAIM', 'IMPROVEMENT', 'VALUE_UPDATE'];
export const EVENT_PROVIDER_TYPES = ['PURCHASE', 'REPAIR', 'MAINTENANCE', 'CLAIM', 'IMPROVEMENT', 'INSPECTION'];

export const EVENT_ADD_EDITOR_SECTIONS: readonly RecordEditorSection[] = [
  { id: 'event', title: 'Event' },
  { id: 'details', title: 'Details' },
  { id: 'more', title: 'More details', collapsed: true },
];

const VISIBILITY_OPTIONS = [
  { label: 'Household', value: 'HOUSEHOLD' },
  { label: 'Private (only you)', value: 'PRIVATE' },
  { label: 'Resale pack', value: 'RESALE_PACK' },
];

export interface EventAddOptions {
  rooms: ReadonlyArray<{ id: string; name: string }>;
  items: ReadonlyArray<{ id: string; name: string }>;
}

/** The property's own rooms and visible inventory items, as the live choices for the two link fields (capped like every inline picker). */
export async function loadEventAddOptions(propertyId: string): Promise<EventAddOptions> {
  const [rooms, items] = await Promise.all([
    prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: 50, select: { id: true, name: true } }),
    prisma.inventoryItem.findMany({ where: { propertyId, ...visibleInventoryItemWhere() }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true } }),
  ]);
  return { rooms, items };
}

export const EVENT_ADD_DEFAULTS: Readonly<Record<string, string>> = {
  title: '', type: '', occurredAt: '', summary: '', amount: '', providerName: '', importance: 'NORMAL', visibility: 'HOUSEHOLD', roomId: '', inventoryItemId: '',
};

export function eventAddEditorFields(options: EventAddOptions = { rooms: [], items: [] }): RecordEditorField[] {
  return [
    { key: 'title', label: 'Title', kind: 'TEXT', section: 'event', required: true, maxLength: 140 },
    { key: 'type', label: 'Type', kind: 'SELECT', section: 'event', required: true, options: HOME_EVENT_TYPE_OPTIONS },
    { key: 'occurredAt', label: 'When did it happen?', shortLabel: 'date', kind: 'APPROX_DATE', section: 'event', required: true, helpText: 'Use the precision you actually know.' },
    { key: 'summary', label: 'What happened?', kind: 'TEXTAREA', section: 'details', required: false, maxLength: 500 },
    { key: 'amount', label: 'Amount (USD)', kind: 'MONEY', section: 'details', required: false, visibleWhen: { field: 'type', in: EVENT_AMOUNT_TYPES } },
    { key: 'providerName', label: 'Provider or contractor', kind: 'TEXT', section: 'details', required: false, maxLength: 160, visibleWhen: { field: 'type', in: EVENT_PROVIDER_TYPES } },
    { key: 'importance', label: 'Importance', kind: 'SELECT', section: 'more', required: true, options: HOME_EVENT_IMPORTANCE_OPTIONS },
    { key: 'visibility', label: 'Who can see it', kind: 'SELECT', section: 'more', required: true, options: VISIBILITY_OPTIONS },
    { key: 'roomId', label: 'Room', kind: 'SELECT', section: 'more', required: false, emptyLabel: 'No room', options: options.rooms.map((room) => ({ label: room.name, value: room.id })) },
    { key: 'inventoryItemId', label: 'Inventory item', kind: 'SELECT', section: 'more', required: false, emptyLabel: 'No item', options: options.items.map((item) => ({ label: item.name, value: item.id })) },
  ];
}

type TypedDate = { precision: 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE'; value: string; rangeEnd?: string };

/** The editor string for a typed date (or a bare YYYY-MM-DD). */
export function encodeApproxDate(date: unknown): string {
  if (typeof date === 'string') return date.includes('|') ? date : date ? `EXACT_DATE|${date}` : '';
  if (date && typeof date === 'object') {
    const typed = date as Partial<TypedDate>;
    if (!typed.precision || !typed.value) return '';
    return typed.precision === 'RANGE' ? `RANGE|${typed.value}|${typed.rangeEnd ?? ''}` : `${typed.precision}|${typed.value}`;
  }
  return '';
}

/** The typed date for an editor string. */
export function decodeApproxDate(text: string): TypedDate | null {
  const [precision, value, end] = text.split('|');
  if (!precision || !value) return null;
  return precision === 'RANGE' ? { precision: 'RANGE', value, rangeEnd: end } : { precision: precision as TypedDate['precision'], value };
}

/** The editor's strings for whatever was entered (typed answer or a re-ask), so a form sent back keeps what the person typed. */
export function eventAddEditorValues(entered: Record<string, unknown>): Record<string, string> {
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return {
    ...EVENT_ADD_DEFAULTS,
    title: text(entered.title), type: text(entered.type), occurredAt: encodeApproxDate(entered.occurredAt), summary: text(entered.summary),
    amount: typeof entered.amount === 'number' ? entered.amount.toFixed(2) : text(entered.amount), providerName: text(entered.providerName),
    importance: text(entered.importance) || 'NORMAL', visibility: text(entered.visibility) || 'HOUSEHOLD', roomId: text(entered.roomId), inventoryItemId: text(entered.inventoryItemId),
  };
}

/** The typed answer the confirmation builder validates, from the editor's validated strings. */
export function eventAddAnswerFromEditor(values: Record<string, string>): Record<string, unknown> {
  return {
    title: values.title, type: values.type, occurredAt: decodeApproxDate(values.occurredAt) ?? values.occurredAt,
    summary: values.summary || null, amount: values.amount ? Number(values.amount) : null, providerName: values.providerName || null,
    importance: values.importance || 'NORMAL', visibility: values.visibility || 'HOUSEHOLD', roomId: values.roomId || null, inventoryItemId: values.inventoryItemId || null,
  };
}
