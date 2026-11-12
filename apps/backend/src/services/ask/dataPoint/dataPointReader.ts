// Generic data-point read (reliability FRD FR-DATA-3/4/15, D12), shape 1 (point read) and shape 2 (record lookup) for the reviewed entities.
// The ONLY query that can run is the allowlisted template below: property-scoped, a select list built from the reviewed catalogue, a hard row cap. Nothing in the
// message reaches a query string; the message only chooses WHICH reviewed data point and WHICH records (matched in memory against the property's own item names).
import { prisma } from '../../../lib/prisma';
import { DATA_POINT_DEFINITIONS, READABLE_FIELDS, type DataPointDefinition, type DataPointEntity } from './dataPointCatalogue';

export const DATA_POINT_ITEM_ROW_CAP = 200;
const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'my', 'our', 'in', 'a', 'an', 'unit', 'system']);
const SYNONYMS: Readonly<Record<string, readonly string[]>> = { refrigerator: ['fridge'], fridge: ['refrigerator'], 'air conditioner': ['ac', 'a/c'], ac: ['air conditioner'], dishwasher: ['dish washer'], 'water heater': ['hot water heater', 'boiler tank'], hvac: ['furnace', 'heat pump'], microwave: ['micro wave'] };

export interface ItemRow { id: string; name: string; [field: string]: unknown }

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 5 ? t.replace(/(?:ing|ed|es|s)$/, '') : t.length > 3 ? t.replace(/(?:es|s)$/, '') : t));

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

/** Per entity: the Prisma delegate, how a record is named in a question, and whether an unnamed question may list the (few) records. Each query is property-scoped. */
interface EntitySpec { readonly delegate: string; readonly extraSelect: Record<string, unknown>; readonly labels: (row: any) => string[]; readonly display: (row: any) => string; readonly listUnnamedUpTo: number; readonly roomName?: (row: any) => string | null }
const ENTITY_SPECS: Readonly<Record<DataPointEntity, EntitySpec>> = {
  InventoryItem: { delegate: 'inventoryItem', extraSelect: { name: true, room: { select: { name: true } } }, labels: (r) => [r.name], display: (r) => r.name, listUnnamedUpTo: 0, roomName: (r) => r.room?.name ?? null },
  Warranty: { delegate: 'warranty', extraSelect: { providerName: true, category: true, inventoryItem: { select: { name: true } } }, labels: (r) => [r.inventoryItem?.name, r.providerName, String(r.category ?? '').replace(/_/g, ' ')].filter(Boolean), display: (r) => (r.inventoryItem?.name ? `${r.inventoryItem.name} warranty` : r.providerName ? `${r.providerName} warranty` : 'warranty'), listUnnamedUpTo: 5 },
  InsurancePolicy: { delegate: 'insurancePolicy', extraSelect: { carrierName: true, coverageType: true }, labels: (r) => [r.carrierName, r.coverageType].filter(Boolean), display: (r) => (r.carrierName ? `${r.carrierName} policy` : 'insurance policy'), listUnnamedUpTo: 5 },
  PropertyMaintenanceTask: { delegate: 'propertyMaintenanceTask', extraSelect: { title: true }, labels: (r) => [r.title], display: (r) => r.title, listUnnamedUpTo: 0 },
};

const isPresent = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** The single allowlisted template per entity. `propertyId` is the authorised property; the caller has already run ensurePropertyAccess. */
export async function readDataPoint(propertyId: string, point: DataPointDefinition, message: string): Promise<DataPointReadResult> {
  const allowed = READABLE_FIELDS[point.entity];
  if (!allowed?.includes(point.field) || !DATA_POINT_DEFINITIONS.includes(point)) throw new Error(`data point ${point.id} is not in the reviewed catalogue`);
  const spec = ENTITY_SPECS[point.entity];
  const select: Record<string, unknown> = { id: true, ...spec.extraSelect, [point.field]: true };
  const records: any[] = await (prisma as any)[spec.delegate].findMany({ where: { propertyId }, select, take: DATA_POINT_ITEM_ROW_CAP });
  const named = records.map((r) => ({ r, id: String(r.id), name: spec.labels(r).join(' ') }));
  // A record is named when every significant word of one of its labels is in the message (matchItemsByName works on one label string; try each label).
  const hit = new Set<string>();
  for (const label of new Set(records.flatMap((r) => spec.labels(r)))) for (const m of matchItemsByName(message, records.filter((r) => spec.labels(r).includes(label)).map((r) => ({ id: String(r.id), name: label })))) hit.add(m.id);
  let chosen = named.filter((n) => hit.has(n.id)).map((n) => n.r);
  if (!chosen.length && spec.listUnnamedUpTo > 0 && records.length > 0 && records.length <= spec.listUnnamedUpTo) chosen = records;
  if (!chosen.length) return { point, status: records.length ? 'NO_ITEM_NAMED' : 'ITEM_NOT_FOUND', rows: [] };
  const rows = chosen.map((r) => ({ id: String(r.id), name: spec.display(r), value: r[point.field] ?? null, roomName: spec.roomName?.(r) ?? null }));
  return { point, status: rows.some((r) => isPresent(r.value)) ? 'FOUND' : 'NOT_RECORDED', rows };
}

/** Back-compatible name for the inventory entity (Phase 1b-1). */
export const readItemDataPoint = readDataPoint;
