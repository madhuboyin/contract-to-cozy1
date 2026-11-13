// Generic data-point read (reliability FRD FR-DATA-3/4/15, D12), shape 1 (point read) and shape 2 (record lookup) for the reviewed entities.
// The ONLY query that can run is the allowlisted template below: property-scoped, a select list built from the reviewed catalogue, a hard row cap. Nothing in the
// message reaches a query string; the message only chooses WHICH reviewed data point and WHICH records (matched in memory against the property's own item names).
import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { visibleRecordWhere } from '../../homeRecordsAccess';
import { DATA_POINT_DEFINITIONS, READABLE_FIELDS, RELATION_ENTITIES, roleMayRead, type DataPointDefinition, type DataPointEntity } from './dataPointCatalogue';

export const DATA_POINT_ITEM_ROW_CAP = 200;
export const DATA_POINT_TAX_ROW_CAP = 20;
/** Relation reads (design): at most 5 parents and 50 children per read. */
export const DATA_POINT_RELATION_PARENT_CAP = 5;
export const DATA_POINT_RELATION_CHILD_CAP = 50;
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
  /** Ambiguous relation reads: how many children matched, WITHOUT their names (a child's title is never returned as a value). */
  readonly candidateCount?: number;
  readonly rows: ReadonlyArray<{ id: string; name: string; value: unknown; roomName: string | null; /** Provenance or confidence caveat for this record (FR-REC-2 style); the handler states it instead of giving the value plainly. */ limitation?: string | null; /** Set when the value belongs to a cancelled/not-needed child: the handler words it as a recorded past value, never as a current obligation. */ historicalStatus?: string | null }>;
}

/** Per entity: the Prisma delegate, how a record is named in a question, and whether an unnamed question may list the (few) records. Each query is property-scoped. */
/** A tax record from a homeowner's own entry, or one the system could not rate above LOW, is not stated plainly (FR-REC-2). OFFICIAL_SOURCE/DOCUMENT at MEDIUM or better is. */
function taxLimitation(r: any): string | null {
  const low = !r.confidence || r.confidence === 'UNKNOWN' || r.confidence === 'LOW';
  if (low) return `This ${r.taxYear} record has ${String(r.confidence ?? 'UNKNOWN').toLowerCase()} confidence, so check the figure against your official notice.`;
  if (r.sourceType === 'HOMEOWNER_REPORTED' && r.confidence !== 'VERIFIED') return `This ${r.taxYear} figure was entered by you and has not been matched to an official source.`;
  return null;
}
interface EntitySpec { readonly mode?: 'NAMED' | 'SINGLETON' | 'LATEST_TAX_YEAR' | 'RELATION_CHILD' | 'RECORD_VERSION'; /** Relation children: statuses at which a date/priority is not an active obligation (the status itself is still answered plainly). */ readonly inactiveChildStatuses?: readonly string[]; readonly where?: Record<string, unknown>; readonly roleWhere?: (role: string) => Record<string, unknown>; readonly orderBy?: unknown; readonly limitation?: (row: any) => string | null; /** NAMED reads: a status word when this field of this row is a recorded past value rather than an active obligation. */ readonly inactiveStatus?: (row: any, point: DataPointDefinition) => string | null; readonly delegate: string; readonly extraSelect: Record<string, unknown>; readonly labels: (row: any) => string[]; readonly display: (row: any) => string; readonly listUnnamedUpTo: number; readonly roomName?: (row: any) => string | null }
const ENTITY_SPECS: Readonly<Record<DataPointEntity, EntitySpec>> = {
  InventoryItem: { delegate: 'inventoryItem', extraSelect: { name: true, room: { select: { name: true } } }, labels: (r) => [r.name], display: (r) => r.name, listUnnamedUpTo: 0, roomName: (r) => r.room?.name ?? null },
  Warranty: { delegate: 'warranty', extraSelect: { providerName: true, category: true, inventoryItem: { select: { name: true } } }, labels: (r) => [r.inventoryItem?.name, r.providerName, String(r.category ?? '').replace(/_/g, ' ')].filter(Boolean), display: (r) => (r.inventoryItem?.name ? `${r.inventoryItem.name} warranty` : r.providerName ? `${r.providerName} warranty` : 'warranty'), listUnnamedUpTo: 1 },
  InsurancePolicy: { delegate: 'insurancePolicy', extraSelect: { carrierName: true, coverageType: true }, labels: (r) => [r.carrierName, r.coverageType].filter(Boolean), display: (r) => (r.carrierName ? `${r.carrierName} policy` : 'insurance policy'), listUnnamedUpTo: 1 },
  PropertyMaintenanceTask: { delegate: 'propertyMaintenanceTask', extraSelect: { title: true }, labels: (r) => [r.title], display: (r) => r.title, listUnnamedUpTo: 0 },
  // HomeReserveFund is one row per property (propertyId @unique): singleton read, no name to match. Its balance columns default to 0, so a fund that was never recalculated is flagged.
  HomeReserveFund: { mode: 'SINGLETON', delegate: 'homeReserveFund', extraSelect: { lastRecalculatedAt: true }, labels: () => [], display: () => 'home reserve fund', listUnnamedUpTo: 0,
    limitation: (r) => (r.lastRecalculatedAt ? null : 'The fund has never been recalculated, so zeros here may be defaults rather than your real figures.') },
  // Home Records metadata: named by title. The canonical visibility rule (visibleRecordWhere) is applied to the query itself, so a record this role may not see is never selected and is
  // indistinguishable from one that does not exist. Active, not trashed. The data-point floor (record.retainUntil is OWNER) can only narrow this.
  // Relation read: tasks of the property's buyer checklist (design: allowlisted path, parent-first). The title only SELECTS a task; it never reaches a row's name or value. Child lifecycle: a task marked not applicable is not read.
  HomeBuyerTask: { mode: 'RELATION_CHILD', delegate: 'homeBuyerTask', where: { applicability: { not: 'NOT_APPLICABLE' } }, orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }], inactiveChildStatuses: ['CANCELLED', 'NOT_NEEDED'], extraSelect: { title: true, status: true }, labels: (r) => [r.title], display: () => 'buyer task', listUnnamedUpTo: 1 },
  // Milestones of the same checklist. The STRUCTURED type selects a row and is returned as a value; the free-form customLabel, notes, responsible user and source ids are never selected.
  BuyerJourneyMilestone: { mode: 'RELATION_CHILD', delegate: 'buyerJourneyMilestone', orderBy: [{ dueAt: 'asc' }], inactiveChildStatuses: ['CANCELLED', 'WAIVED'], extraSelect: { type: true, status: true }, labels: (r) => [typeWords(r.type)], display: (r) => `${typeWords(r.type)} milestone`, listUnnamedUpTo: 1 },
  // Sale-readiness items of the property's sale case. Title selects a row and is never returned; detail, cost/value-add ranges, waiver reason, ids are never selected. RESOLVED/WAIVED items answer their
  // status plainly; a due date is a recorded past value.
  SaleReadinessItem: { mode: 'RELATION_CHILD', delegate: 'saleReadinessItem', orderBy: [{ dueAt: 'asc' }], inactiveChildStatuses: ['RESOLVED', 'WAIVED'], extraSelect: { title: true, status: true }, labels: (r) => [r.title], display: () => 'sale-readiness item', listUnnamedUpTo: 1 },
  // Record versions: the PARENT record must be named and visible to this role (visibleRecordWhere, ACTIVE, not trashed); only then are its versions read. Metadata columns only.
  PropertyRecordVersion: { mode: 'RECORD_VERSION', delegate: 'propertyRecordVersion', extraSelect: { versionNumber: true }, labels: () => [], display: () => 'record version', listUnnamedUpTo: 0 },
  // Claims have a plain propertyId (NAMED read). The title only selects; the row is named by its type. A closed or denied claim's follow-up date is a recorded past value.
  Claim: { delegate: 'claim', extraSelect: { title: true, type: true, status: true }, labels: (r) => [r.title], display: (r) => `${typeWords(r.type)} claim`, listUnnamedUpTo: 1,
    inactiveStatus: (r, point) => (point.field === 'nextFollowUpAt' && ['CLOSED', 'DENIED'].includes(String(r.status)) ? String(r.status).toLowerCase() : null) },
  PropertyRecord: { delegate: 'propertyRecord', extraSelect: { title: true }, roleWhere: (role) => ({ lifecycleStatus: 'ACTIVE', trashedAt: null, ...visibleRecordWhere(role as HouseholdRole) }), labels: (r) => [r.title], display: (r) => String(r.title), listUnnamedUpTo: 0 },
  PropertyTaxBillRecord: { mode: 'LATEST_TAX_YEAR', delegate: 'propertyTaxBillRecord', where: { status: 'ACTIVE', supersededById: null }, orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }], extraSelect: { taxYear: true, sourceType: true, confidence: true }, labels: () => [], display: (r) => `${r.taxYear} property tax bill`, listUnnamedUpTo: 0, limitation: taxLimitation },
  // Sale prep, sale case and buyer journey are one row per property (propertyId @unique): singleton reads. A buyer journey that is not ACTIVE says so, so a stale stage is not stated plainly.
  PropertySalePrepProfile: { mode: 'SINGLETON', delegate: 'propertySalePrepProfile', extraSelect: {}, labels: () => [], display: () => 'sale prep profile', listUnnamedUpTo: 0 },
  PropertySaleCase: { mode: 'SINGLETON', delegate: 'propertySaleCase', extraSelect: {}, labels: () => [], display: () => 'sale plan', listUnnamedUpTo: 0 },
  HomeBuyerChecklist: { mode: 'SINGLETON', delegate: 'homeBuyerChecklist', extraSelect: { status: true }, labels: () => [], display: () => 'buyer journey', listUnnamedUpTo: 0,
    limitation: (r) => (r.status && r.status !== 'ACTIVE' ? `This buyer journey is ${String(r.status).toLowerCase().replace(/_/g, ' ')}, so what is recorded may be out of date.` : null) },
  PropertyTaxAssessmentRecord: { mode: 'LATEST_TAX_YEAR', delegate: 'propertyTaxAssessmentRecord', where: { status: 'ACTIVE', supersededById: null }, orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }], extraSelect: { taxYear: true, sourceType: true, confidence: true }, labels: () => [], display: (r) => `${r.taxYear} property tax assessment`, listUnnamedUpTo: 0, limitation: taxLimitation },
};

const typeWords = (t: unknown) => String(t ?? '').toLowerCase().replace(/_/g, ' ');
const isPresent = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** The single allowlisted template per entity. `propertyId` is the authorised property; the caller has already run ensurePropertyAccess. */
export async function readDataPoint(propertyId: string, role: string, point: DataPointDefinition, message: string): Promise<DataPointReadResult> {
  // Per-field audience floor, enforced here as well as in the handler so no caller can read a restricted field for a role that may not see it.
  if (!roleMayRead(role, point)) throw new Error(`role ${role} may not read ${point.id}`);
  const allowed = READABLE_FIELDS[point.entity];
  if (!allowed?.includes(point.field) || !DATA_POINT_DEFINITIONS.includes(point)) throw new Error(`data point ${point.id} is not in the reviewed catalogue`);
  const spec = ENTITY_SPECS[point.entity];
  const select: Record<string, unknown> = { id: true, ...spec.extraSelect, [point.field]: true };
  if (spec.mode === 'RECORD_VERSION') {
    const parentSpec = ENTITY_SPECS.PropertyRecord;
    const records: any[] = await (prisma as any)[parentSpec.delegate].findMany({ where: { propertyId, ...(parentSpec.roleWhere?.(role) ?? {}) }, select: { id: true, title: true, currentVersionId: true }, take: DATA_POINT_ITEM_ROW_CAP });
    if (!records.length) return { point, status: 'ITEM_NOT_FOUND', rows: [] };
    const hitIds = new Set(matchItemsByName(message, records.map((r) => ({ id: String(r.id), name: String(r.title) }))).map((m) => m.id));
    let named = records.filter((r) => hitIds.has(String(r.id)));
    if (named.length > 1) { const specificity = (r: any) => tokens(String(r.title)).length; const top = Math.max(...named.map(specificity)); named = named.filter((r) => specificity(r) === top); }
    if (!named.length) return { point, status: 'NO_ITEM_NAMED', rows: [] };
    if (named.length > 1) return { point, status: 'AMBIGUOUS', candidateCount: named.length, rows: [] };
    const record = named[0];
    const versions: any[] = await (prisma as any)[spec.delegate].findMany({ where: { recordId: record.id }, select, orderBy: [{ versionNumber: 'desc' }], take: 50 });
    const current = versions.find((v) => String(v.id) === String(record.currentVersionId)) ?? null;
    // "version 2" picks that version for the date/scan/integrity points; the version-number point always reports the CURRENT version.
    const asked = point.field === 'versionNumber' ? null : /\bversion\s+(\d{1,3})\b|\bv(\d{1,3})\b/i.exec(message);
    const wanted = asked ? Number(asked[1] ?? asked[2]) : null;
    const chosen = wanted !== null ? versions.find((v) => v.versionNumber === wanted) ?? null : current;
    if (wanted !== null && !chosen) return { point, status: 'NO_ITEM_NAMED', rows: [] };
    if (!chosen) return { point, status: 'NOT_RECORDED', rows: [{ id: String(record.id), name: String(record.title), value: null, roomName: null }] };
    const value = chosen[point.field] ?? null;
    const limitation = current && String(chosen.id) !== String(current.id) ? `This is version ${chosen.versionNumber}, which is not the current version (${current.versionNumber}).` : null;
    return { point, status: isPresent(value) ? 'FOUND' : 'NOT_RECORDED', rows: [{ id: String(chosen.id), name: point.field === 'versionNumber' ? String(record.title) : `${record.title} version ${chosen.versionNumber}`, value, roomName: null, limitation }] };
  }
  if (spec.mode === 'RELATION_CHILD') {
    const path = RELATION_ENTITIES[point.entity];
    if (!path) throw new Error(`no relation path declared for ${point.entity}`);
    // Parent first: the property-scoped parent is found by propertyId; children are read ONLY through it. A child id is never trusted.
    const parents: any[] = await (prisma as any)[path.parentDelegate].findMany({ where: { propertyId }, select: { id: true, status: true }, take: DATA_POINT_RELATION_PARENT_CAP });
    if (!parents.length) return { point, status: 'ITEM_NOT_FOUND', rows: [] };
    const journeyStatus = new Map(parents.map((p) => [String(p.id), String(p.status ?? path.normalStatuses[0])]));
    const children: any[] = await (prisma as any)[spec.delegate].findMany({ where: { [path.key]: { in: parents.map((p) => String(p.id)) }, ...(spec.where ?? {}) }, select: { ...select, [path.key]: true }, ...(spec.orderBy ? { orderBy: spec.orderBy } : {}), take: DATA_POINT_RELATION_CHILD_CAP });
    if (!children.length) return { point, status: 'ITEM_NOT_FOUND', rows: [] };
    const hit = new Set<string>();
    for (const label of new Set(children.flatMap((r) => spec.labels(r)))) for (const m of matchItemsByName(message, children.filter((r) => spec.labels(r).includes(label)).map((r) => ({ id: String(r.id), name: label })))) hit.add(m.id);
    let chosen = children.filter((r) => hit.has(String(r.id)));
    // Most specific title wins: "inspection follow up" names the longer task, not also the shorter "inspection". Equal specificity stays ambiguous.
    if (chosen.length > 1) { const specificity = (r: any) => Math.max(...spec.labels(r).map((l: string) => tokens(l).length)); const top = Math.max(...chosen.map(specificity)); chosen = chosen.filter((r) => specificity(r) === top); }
    // A single unnamed row is a safe default only while its journey is ACTIVE or PAUSED; for a cancelled, handed-off or archived journey the row must be named explicitly (historical read).
    const journeyOf = (r: any) => journeyStatus.get(String(r[path.key])) ?? path.normalStatuses[0];
    if (!chosen.length && children.length === 1 && [...path.normalStatuses, ...path.pausedStatuses].includes(journeyOf(children[0]))) chosen = children;
    if (!chosen.length) return { point, status: 'AMBIGUOUS', candidateCount: children.length, rows: [] };
    if (chosen.length > 1) return { point, status: 'AMBIGUOUS', candidateCount: chosen.length, rows: [] };
    const row = chosen[0]; const value = row[point.field] ?? null;
    // Lifecycle limitations (owner rules 2026-11-12). Journey: paused says so; any other non-active state is a historical read. Child: a cancelled / not-needed row answers its STATUS plainly, but a date or
    // priority is carried only as a recorded past value, never as an active obligation. The limitation is part of the result, so replay of the stored answer keeps it.
    const js = journeyOf(row); const jw = js.toLowerCase().replace(/_/g, ' ');
    const journeyLimit = path.normalStatuses.includes(js) ? null : path.pausedStatuses.includes(js) ? `This ${path.parentNoun} is ${jw}.` : `This ${path.parentNoun} is ${jw}, so this value may no longer represent an active obligation.`;
    const childStatus = String(row.status ?? ''); const inactive = point.field !== 'status' && (spec.inactiveChildStatuses ?? []).includes(childStatus);
    const childLimit = inactive ? `This ${spec.display(row)} is ${childStatus.toLowerCase().replace(/_/g, ' ')}, so this is a recorded past value, not an active obligation.` : null;
    return { point, status: isPresent(value) ? 'FOUND' : 'NOT_RECORDED', rows: [{ id: String(row.id), name: spec.display(row), value, roomName: null, limitation: [journeyLimit, childLimit].filter(Boolean).join(' ') || null, historicalStatus: inactive ? childStatus.toLowerCase().replace(/_/g, ' ') : null }] };
  }
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
  const records: any[] = await (prisma as any)[spec.delegate].findMany({ where: { propertyId, ...(spec.roleWhere?.(role) ?? {}) }, select, take: DATA_POINT_ITEM_ROW_CAP });
  const named = records.map((r) => ({ r, id: String(r.id), name: spec.labels(r).join(' ') }));
  // A record is named when every significant word of one of its labels is in the message (matchItemsByName works on one label string; try each label).
  const hit = new Set<string>();
  for (const label of new Set(records.flatMap((r) => spec.labels(r)))) for (const m of matchItemsByName(message, records.filter((r) => spec.labels(r).includes(label)).map((r) => ({ id: String(r.id), name: label })))) hit.add(m.id);
  let chosen = named.filter((n) => hit.has(n.id)).map((n) => n.r);
  if (!chosen.length && spec.listUnnamedUpTo > 0 && records.length > 0 && records.length <= spec.listUnnamedUpTo) chosen = records;
  // Several records and none named: ask which, never list them all unasked.
  if (!chosen.length && spec.listUnnamedUpTo > 0 && records.length > spec.listUnnamedUpTo && !named.some((n) => hit.has(n.id))) return { point, status: 'AMBIGUOUS', rows: records.slice(0, 8).map((r) => ({ id: String(r.id), name: spec.display(r), value: null, roomName: null })) };
  if (!chosen.length) return { point, status: records.length ? 'NO_ITEM_NAMED' : 'ITEM_NOT_FOUND', rows: [] };
  const rows = chosen.map((r) => ({ id: String(r.id), name: spec.display(r), value: r[point.field] ?? null, roomName: spec.roomName?.(r) ?? null, historicalStatus: spec.inactiveStatus?.(r, point) ?? null }));
  return { point, status: rows.some((r) => isPresent(r.value)) ? 'FOUND' : 'NOT_RECORDED', rows };
}


