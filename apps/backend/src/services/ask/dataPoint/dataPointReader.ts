// Generic data-point read (reliability FRD FR-DATA-3/4/15, D12), shape 1 (point read) and shape 2 (record lookup) for the reviewed entities.
// The ONLY query that can run is the allowlisted template below: property-scoped, a select list built from the reviewed catalogue, a hard row cap. Nothing in the
// message reaches a query string; the message only chooses WHICH reviewed data point and WHICH records (matched in memory against the property's own item names).
import { prisma } from '../../../lib/prisma';
import { DATA_POINT_DEFINITIONS, READABLE_FIELDS, roleMayRead, type DataPointDefinition, type DataPointEntity } from './dataPointCatalogue';

export const DATA_POINT_ITEM_ROW_CAP = 200;
export const DATA_POINT_TAX_ROW_CAP = 20;
/** The tax year a message names: a four-digit number in 1900-2199 (a bare 4500 or 1234 is not a year). Null when none. Several candidates: the first that matches a record year is used by the reader. */
export function namedTaxYears(message: string): string[] {
  return [...message.matchAll(/(?<![\d$,.])(19\d\d|20\d\d|21\d\d)(?![\d,]|\.\d)/g)].map((m) => m[1]);
}
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
  readonly status: 'FOUND' | 'ITEM_NOT_FOUND' | 'NO_ITEM_NAMED' | 'NOT_RECORDED' | 'AMBIGUOUS';
  readonly rows: ReadonlyArray<{ id: string; name: string; value: unknown; roomName: string | null; /** Provenance or confidence caveat for this record (FR-REC-2 style); the handler states it instead of giving the value plainly. */ limitation?: string | null }>;
}

/** Per entity: the Prisma delegate, how a record is named in a question, and whether an unnamed question may list the (few) records. Each query is property-scoped. */
/** A tax record from a homeowner's own entry, or one the system could not rate above LOW, is not stated plainly (FR-REC-2). OFFICIAL_SOURCE/DOCUMENT at MEDIUM or better is. */
function taxLimitation(r: any): string | null {
  const low = !r.confidence || r.confidence === 'UNKNOWN' || r.confidence === 'LOW';
  if (low) return `This ${r.taxYear} record has ${String(r.confidence ?? 'UNKNOWN').toLowerCase()} confidence, so check the figure against your official notice.`;
  if (r.sourceType === 'HOMEOWNER_REPORTED' && r.confidence !== 'VERIFIED') return `This ${r.taxYear} figure was entered by you and has not been matched to an official source.`;
  return null;
}
interface EntitySpec { readonly mode?: 'NAMED' | 'SINGLETON' | 'LATEST_TAX_YEAR'; readonly where?: Record<string, unknown>; readonly orderBy?: unknown; readonly limitation?: (row: any) => string | null; readonly delegate: string; readonly extraSelect: Record<string, unknown>; readonly labels: (row: any) => string[]; readonly display: (row: any) => string; readonly listUnnamedUpTo: number; readonly roomName?: (row: any) => string | null }
const ENTITY_SPECS: Readonly<Record<DataPointEntity, EntitySpec>> = {
  InventoryItem: { delegate: 'inventoryItem', extraSelect: { name: true, room: { select: { name: true } } }, labels: (r) => [r.name], display: (r) => r.name, listUnnamedUpTo: 0, roomName: (r) => r.room?.name ?? null },
  Warranty: { delegate: 'warranty', extraSelect: { providerName: true, category: true, inventoryItem: { select: { name: true } } }, labels: (r) => [r.inventoryItem?.name, r.providerName, String(r.category ?? '').replace(/_/g, ' ')].filter(Boolean), display: (r) => (r.inventoryItem?.name ? `${r.inventoryItem.name} warranty` : r.providerName ? `${r.providerName} warranty` : 'warranty'), listUnnamedUpTo: 1 },
  InsurancePolicy: { delegate: 'insurancePolicy', extraSelect: { carrierName: true, coverageType: true }, labels: (r) => [r.carrierName, r.coverageType].filter(Boolean), display: (r) => (r.carrierName ? `${r.carrierName} policy` : 'insurance policy'), listUnnamedUpTo: 1 },
  PropertyMaintenanceTask: { delegate: 'propertyMaintenanceTask', extraSelect: { title: true }, labels: (r) => [r.title], display: (r) => r.title, listUnnamedUpTo: 0 },
  // HomeReserveFund is one row per property (propertyId @unique): singleton read, no name to match. Its balance columns default to 0, so a fund that was never recalculated is flagged.
  HomeReserveFund: { mode: 'SINGLETON', delegate: 'homeReserveFund', extraSelect: { lastRecalculatedAt: true }, labels: () => [], display: () => 'home reserve fund', listUnnamedUpTo: 0,
    limitation: (r) => (r.lastRecalculatedAt ? null : 'The fund has never been recalculated, so zeros here may be defaults rather than your real figures.') },
  PropertyTaxBillRecord: { mode: 'LATEST_TAX_YEAR', delegate: 'propertyTaxBillRecord', where: { status: 'ACTIVE', supersededById: null }, orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }], extraSelect: { taxYear: true, sourceType: true, confidence: true }, labels: () => [], display: (r) => `${r.taxYear} property tax bill`, listUnnamedUpTo: 0, limitation: taxLimitation },
  // Sale prep, sale case and buyer journey are one row per property (propertyId @unique): singleton reads. A buyer journey that is not ACTIVE says so, so a stale stage is not stated plainly.
  PropertySalePrepProfile: { mode: 'SINGLETON', delegate: 'propertySalePrepProfile', extraSelect: {}, labels: () => [], display: () => 'sale prep profile', listUnnamedUpTo: 0 },
  PropertySaleCase: { mode: 'SINGLETON', delegate: 'propertySaleCase', extraSelect: {}, labels: () => [], display: () => 'sale plan', listUnnamedUpTo: 0 },
  HomeBuyerChecklist: { mode: 'SINGLETON', delegate: 'homeBuyerChecklist', extraSelect: { status: true }, labels: () => [], display: () => 'buyer journey', listUnnamedUpTo: 0,
    limitation: (r) => (r.status && r.status !== 'ACTIVE' ? `This buyer journey is ${String(r.status).toLowerCase().replace(/_/g, ' ')}, so what is recorded may be out of date.` : null) },
  PropertyTaxAssessmentRecord: { mode: 'LATEST_TAX_YEAR', delegate: 'propertyTaxAssessmentRecord', where: { status: 'ACTIVE', supersededById: null }, orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }], extraSelect: { taxYear: true, sourceType: true, confidence: true }, labels: () => [], display: (r) => `${r.taxYear} property tax assessment`, listUnnamedUpTo: 0, limitation: taxLimitation },
};

const isPresent = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** The single allowlisted template per entity. `propertyId` is the authorised property; the caller has already run ensurePropertyAccess. */
export async function readDataPoint(propertyId: string, role: string, point: DataPointDefinition, message: string): Promise<DataPointReadResult> {
  // Per-field audience floor, enforced here as well as in the handler so no caller can read a restricted field for a role that may not see it.
  if (!roleMayRead(role, point)) throw new Error(`role ${role} may not read ${point.id}`);
  const allowed = READABLE_FIELDS[point.entity];
  if (!allowed?.includes(point.field) || !DATA_POINT_DEFINITIONS.includes(point)) throw new Error(`data point ${point.id} is not in the reviewed catalogue`);
  const spec = ENTITY_SPECS[point.entity];
  const select: Record<string, unknown> = { id: true, ...spec.extraSelect, [point.field]: true };
  if (spec.mode === 'SINGLETON' || spec.mode === 'LATEST_TAX_YEAR') {
    // Singleton: the one row for the property. Latest tax year: ACTIVE, non-superseded records ordered newest year first; the year named in the message (4 digits, 2000-2099) is used
    // when present, otherwise the latest year. The answer names the year it used (display), and a named year with no record says so rather than falling back to another year.
    const records: any[] = await (prisma as any)[spec.delegate].findMany({ where: { propertyId, ...(spec.where ?? {}) }, select, ...(spec.orderBy ? { orderBy: spec.orderBy } : {}), take: spec.mode === 'SINGLETON' ? 1 : DATA_POINT_TAX_ROW_CAP });
    if (!records.length) return { point, status: 'ITEM_NOT_FOUND', rows: [] };
    let record = records[0];
    if (spec.mode === 'LATEST_TAX_YEAR') {
      const named = namedTaxYears(message);
      if (named.length) { record = records.find((r) => named.includes(String(r.taxYear))); if (!record) return { point, status: 'NO_ITEM_NAMED', rows: [] }; }
    }
    const value = record[point.field] ?? null;
    return { point, status: isPresent(value) ? 'FOUND' : 'NOT_RECORDED', rows: [{ id: String(record.id), name: spec.display(record), value, roomName: null, limitation: spec.limitation?.(record) ?? null }] };
  }
  const records: any[] = await (prisma as any)[spec.delegate].findMany({ where: { propertyId }, select, take: DATA_POINT_ITEM_ROW_CAP });
  const named = records.map((r) => ({ r, id: String(r.id), name: spec.labels(r).join(' ') }));
  // A record is named when every significant word of one of its labels is in the message (matchItemsByName works on one label string; try each label).
  const hit = new Set<string>();
  for (const label of new Set(records.flatMap((r) => spec.labels(r)))) for (const m of matchItemsByName(message, records.filter((r) => spec.labels(r).includes(label)).map((r) => ({ id: String(r.id), name: label })))) hit.add(m.id);
  let chosen = named.filter((n) => hit.has(n.id)).map((n) => n.r);
  if (!chosen.length && spec.listUnnamedUpTo > 0 && records.length > 0 && records.length <= spec.listUnnamedUpTo) chosen = records;
  // Several records and none named: ask which, never list them all unasked.
  if (!chosen.length && spec.listUnnamedUpTo > 0 && records.length > spec.listUnnamedUpTo && !named.some((n) => hit.has(n.id))) return { point, status: 'AMBIGUOUS', rows: records.slice(0, 8).map((r) => ({ id: String(r.id), name: spec.display(r), value: null, roomName: null })) };
  if (!chosen.length) return { point, status: records.length ? 'NO_ITEM_NAMED' : 'ITEM_NOT_FOUND', rows: [] };
  const rows = chosen.map((r) => ({ id: String(r.id), name: spec.display(r), value: r[point.field] ?? null, roomName: spec.roomName?.(r) ?? null }));
  return { point, status: rows.some((r) => isPresent(r.value)) ? 'FOUND' : 'NOT_RECORDED', rows };
}


