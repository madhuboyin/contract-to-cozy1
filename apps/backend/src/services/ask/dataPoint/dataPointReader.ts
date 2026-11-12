// Generic data-point read (reliability FRD FR-DATA-3/4/15, D12), shape 1 (point read) and shape 2 (record lookup) for InventoryItem.
// The ONLY query that can run is the allowlisted template below: property-scoped, a select list built from the reviewed catalogue, a hard row cap. Nothing in the
// message reaches a query string; the message only chooses WHICH reviewed data point and WHICH records (matched in memory against the property's own item names).
import { prisma } from '../../../lib/prisma';
import { DATA_POINT_DEFINITIONS, READABLE_ITEM_FIELDS, type DataPointDefinition } from './dataPointCatalogue';

export const DATA_POINT_ITEM_ROW_CAP = 200;
const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'my', 'our', 'in', 'a', 'an', 'unit', 'system']);
const SYNONYMS: Readonly<Record<string, readonly string[]>> = { refrigerator: ['fridge'], fridge: ['refrigerator'], 'air conditioner': ['ac', 'a/c'], ac: ['air conditioner'], dishwasher: ['dish washer'], 'water heater': ['hot water heater', 'boiler tank'], hvac: ['furnace', 'heat pump'], microwave: ['micro wave'] };

export interface ItemRow { id: string; name: string; [field: string]: unknown }

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 3 ? t.replace(/(?:es|s)$/, '') : t));

/** Items the message names. Every significant token of an item's name (or of one of its synonyms) must appear in the message; a token-subset of the message never matches. */
export function matchItemsByName<T extends { id: string; name: string }>(message: string, items: readonly T[]): T[] {
  const lower = ` ${message.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ')} `; const spoken = new Set(tokens(message));
  const out: T[] = [];
  for (const item of items) {
    const names = [item.name.toLowerCase(), ...(SYNONYMS[item.name.toLowerCase()] ?? [])];
    const hit = names.some((n) => { const t = tokens(n); return t.length > 0 && t.every((x) => spoken.has(x)); })
      || Object.entries(SYNONYMS).some(([k, alts]) => item.name.toLowerCase().includes(k) && alts.some((a) => lower.includes(` ${a} `)));
    if (hit) out.push(item);
  }
  return out;
}

export interface DataPointReadResult {
  readonly point: DataPointDefinition;
  readonly status: 'FOUND' | 'ITEM_NOT_FOUND' | 'NO_ITEM_NAMED' | 'NOT_RECORDED';
  readonly rows: ReadonlyArray<{ id: string; name: string; value: unknown; roomName: string | null }>;
}

/** The single allowlisted template. `propertyId` is the authorised property; the caller has already run ensurePropertyAccess. */
export async function readItemDataPoint(propertyId: string, point: DataPointDefinition, message: string): Promise<DataPointReadResult> {
  if (!READABLE_ITEM_FIELDS.includes(point.field) || !DATA_POINT_DEFINITIONS.includes(point)) throw new Error(`data point ${point.id} is not in the reviewed catalogue`);
  const select: Record<string, unknown> = { id: true, name: true, room: { select: { name: true } }, [point.field]: true };
  const items: any[] = await (prisma as any).inventoryItem.findMany({ where: { propertyId }, select, take: DATA_POINT_ITEM_ROW_CAP, orderBy: { name: 'asc' } });
  const matched = matchItemsByName(message, items);
  if (!matched.length) return { point, status: items.length ? 'NO_ITEM_NAMED' : 'ITEM_NOT_FOUND', rows: [] };
  const rows = matched.map((i) => ({ id: i.id, name: i.name, value: i[point.field] ?? null, roomName: i.room?.name ?? null }));
  const present = rows.filter((r) => r.value !== null && !(Array.isArray(r.value) && r.value.length === 0) && r.value !== '');
  return { point, status: present.length ? 'FOUND' : 'NOT_RECORDED', rows };
}
