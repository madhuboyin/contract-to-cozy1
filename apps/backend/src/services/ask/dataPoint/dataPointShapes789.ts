// FR-DATA-10 shapes 7-9 (time series / comparison, absence, cross-entity) for the OWNER path. Every plan here is built from a DECLARATION in queryShapeRegistries.ts (a catalogued point, a named history column, a declared
// relation); no message text reaches a query except a validated number of years or months. The planner is pure; `runShape789` is the only place that touches the database and it is read-only and property-scoped.
// Shape 7: change over the tax years on record (tax bill, assessed value). Shape 8: inventory items with a field NOT RECORDED, or not serviced since a cutoff. Shape 9: inventory items with no (current) warranty record.
import { DATA_POINT_BY_ID, type DataPointDefinition } from './dataPointCatalogue';
import { ABSENCE_REQUIREMENT_REGISTRY, CROSS_ENTITY_RELATION_REGISTRY, TIME_SERIES_REGISTRY, queryShapesEnabled } from './queryShapeRegistries';
import { prisma } from '../../../lib/prisma';

const norm = (m: string) => ` ${m.toLowerCase().replace(/[^a-z0-9$.%' -]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const ITEM_NOUN = /\b(?:appliances?|items?|inventory items?|household items?|items in my inventory|everything in my (?:home|house)|hvac (?:items|systems|equipment)|systems)\b/;
const COUNT = /\bhow many\b/;
const LEAD = /^\s*(?:what|which|how many|how much|list|show|tell me|do any|do i have|are there|are any|have i|has my|have my|how has|how have|is my|are my|did my|compare|give me|find)\b/i;
const NO_VALUE = /\b(?:no|without|missing|lacking|lacks|unrecorded)\b|\b(?:don'?t|do not|doesn'?t|does not) have\b|\bnot (?:been )?(?:recorded|listed|entered|filled in|on file)\b/;

export type Shape789Plan =
  | { readonly shape: 'TIME_SERIES'; readonly pointId: string; readonly entity: 'PropertyTaxBillRecord' | 'PropertyTaxAssessmentRecord'; readonly column: string; readonly maxPeriods: number; readonly label: string }
  | { readonly shape: 'ABSENCE'; readonly pointId: string; readonly column: string; readonly label: string; readonly count: boolean }
  | { readonly shape: 'STALE_SERVICE'; readonly pointId: string; readonly column: string; readonly cutoff: Date | null; readonly windowText: string; readonly count: boolean }
  | { readonly shape: 'NO_WARRANTY'; readonly relationId: string; readonly currentOnly: boolean; readonly count: boolean };

const point = (id: string): DataPointDefinition | undefined => DATA_POINT_BY_ID.get(id);

function absenceTarget(text: string): { pointId: string; column: string; label: string } | 'AMBIGUOUS' | null {
  const hits: Array<{ id: string; column: string; label: string; len: number }> = [];
  for (const e of ABSENCE_REQUIREMENT_REGISTRY) {
    const p = e.dataPointId ? point(e.dataPointId) : undefined; if (!p || p.entity !== 'InventoryItem') continue;
    for (const a of [...p.aliases, ...(e.words ?? [])]) if (a.length > 3 && text.includes(` ${a.toLowerCase()} `)) hits.push({ id: p.id, column: p.field, label: p.label.replace(/^The /, '').replace(/^When it was /, '').toLowerCase(), len: a.length });
  }
  if (!hits.length) return null;
  const best = Math.max(...hits.map((h) => h.len)); const top = [...new Set(hits.filter((h) => h.len === best).map((h) => h.id))];
  if (top.length !== 1) return 'AMBIGUOUS';
  const h = hits.find((x) => x.id === top[0])!; return { pointId: h.id, column: h.column, label: h.label };
}

export function planShape789(message: string, now: Date = new Date()): Shape789Plan | null {
  if (!LEAD.test(message)) return null;
  const text = norm(message); const enabled = queryShapesEnabled();
  const count = COUNT.test(text);

  // Shape 9: an item with no warranty record ("which appliances have no warranty", "appliances that are out of warranty").
  // "missing warranty coverage" / "coverage gaps" is the coverage-gaps analysis (COVERAGE_GAPS), not a record lookup: wording about coverage is never claimed here.
  if (enabled.crossEntity && ITEM_NOUN.test(text) && /\bwarrant(?:y|ies)\b/.test(text) && !/\bcover(?:age|ed|s)?\b/.test(text)) {
    const rel = CROSS_ENTITY_RELATION_REGISTRY.find((r) => r.from === 'InventoryItem' && r.to === 'Warranty');
    const outside = /\b(?:outside|out of|not under|no longer under|expired|off)\b/.test(text);
    const none = NO_VALUE.test(text) || /\bnot under\b/.test(text);
    if (rel && (outside || none)) return { shape: 'NO_WARRANTY', relationId: rel.relationId, currentOnly: outside, count };
  }
  // Shape 8 (service gap): "appliances I haven't serviced in over a year", "never been serviced".
  if (enabled.absence && ITEM_NOUN.test(text) && /\b(?:never (?:been )?serviced|not (?:been )?serviced|haven'?t (?:been )?serviced|hasn'?t (?:been )?serviced|have not (?:been )?serviced|no service)\b|\bunserviced\b|\bserviced? (?:in|for) (?:over|more than)\b/.test(text) === true) {
    const entry = ABSENCE_REQUIREMENT_REGISTRY.find((e) => e.dataPointId === 'item.lastServicedOn'); const p = entry?.dataPointId ? point(entry.dataPointId) : undefined;
    if (p) {
      const w = /\b(?:in|for|within)(?: over| more than| at least| the last| the past| last| past)? (a|an|one|two|three|four|five|ten|\d+) (year|month)s?\b/.exec(text);
      if (!w && !/\bnever\b|\bunserviced\b/.test(text)) return null;
      let cutoff: Date | null = null; let windowText = 'never';
      if (w) {
        const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10 } as Record<string, number>)[w[1]] ?? Number(w[1]);
        if (!Number.isFinite(n) || n < 1 || (w[2] === 'year' ? n > 50 : n > 600)) return null;
        cutoff = new Date(now); if (w[2] === 'year') cutoff.setUTCFullYear(cutoff.getUTCFullYear() - n); else cutoff.setUTCMonth(cutoff.getUTCMonth() - n);
        windowText = `${n} ${w[2]}${n === 1 ? '' : 's'}`;
      }
      return { shape: 'STALE_SERVICE', pointId: p.id, column: p.field, cutoff, windowText, count };
    }
  }
  // Shape 8 (absence): "which appliances have no serial number recorded", "items missing a purchase date".
  if (enabled.absence && ITEM_NOUN.test(text) && NO_VALUE.test(text)) {
    const target = absenceTarget(text);
    if (target && target !== 'AMBIGUOUS') return { shape: 'ABSENCE', pointId: target.pointId, column: target.column, label: target.label, count };
    return null;
  }
  // Shape 7: change over the tax years on record.
  if (enabled.timeSeries && /\b(?:chang(?:e|ed|es|ing)|trend|over time|over the years|year over year|year-over-year|going up|going down|gone up|gone down|risen|increas(?:e|ed|ing)|decreas(?:e|ed|ing)|dropped|history of|compared? (?:to|with) (?:last|previous)|compar\w* .*\b(?:last|previous) year|vs|versus)\b/.test(text)) {
    const assess = /\bassess(?:ed|ment|ments)\b/.test(text); const bill = /\b(?:property )?tax(?:es)?\b|\btax bills?\b/.test(text);
    if (assess !== bill || (assess && bill && /\bassess/.test(text) && !/\btax bills?\b/.test(text))) {
      const id = assess ? 'taxAssessment.totalAssessedValue' : 'taxBill.amount';
      const decl = TIME_SERIES_REGISTRY.find((e) => e.dataPointId === id); const p = point(id);
      if (decl && p) return { shape: 'TIME_SERIES', pointId: id, entity: decl.historyEntity as 'PropertyTaxBillRecord' | 'PropertyTaxAssessmentRecord', column: p.field, maxPeriods: decl.maxPeriods, label: assess ? 'total assessed value' : 'property tax bill' };
    }
  }
  return null;
}

export interface ShapeRow { readonly id: string; readonly label: string; readonly detail: string | null }
export interface ShapeRun { readonly total: number; readonly rows: readonly ShapeRow[]; readonly series?: ReadonlyArray<{ readonly id: string; readonly year: number; readonly value: number | null }>; readonly neverServiced?: number }
const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : typeof v === 'object' && v && 'toNumber' in v ? (v as { toNumber(): number }).toNumber() : Number(v));
const LIMIT = 100;

/** The where for the inventory-based shapes. Exported so a test can assert exactly what would be sent. Always property-scoped. */
export function shapeWhere(propertyId: string, plan: Shape789Plan, now: Date = new Date()): Record<string, unknown> {
  if (plan.shape === 'ABSENCE') return { propertyId, ...(point(plan.pointId)?.family === 'text' ? { OR: [{ [plan.column]: null }, { [plan.column]: '' }] } : { [plan.column]: null }) };
  if (plan.shape === 'STALE_SERVICE') return { propertyId, ...(plan.cutoff ? { OR: [{ [plan.column]: null }, { [plan.column]: { lt: plan.cutoff } }] } : { [plan.column]: null }) };
  if (plan.shape === 'NO_WARRANTY') return { propertyId, linkedWarranties: { none: plan.currentOnly ? { expiryDate: { gte: now } } : {} } };
  throw new Error('not an inventory shape');
}

export async function runShape789(propertyId: string, plan: Shape789Plan, now: Date = new Date()): Promise<ShapeRun> {
  if (plan.shape === 'TIME_SERIES') {
    const delegate = (prisma as any)[plan.entity === 'PropertyTaxBillRecord' ? 'propertyTaxBillRecord' : 'propertyTaxAssessmentRecord'];
    const rows: any[] = await delegate.findMany({ where: { propertyId, status: 'ACTIVE', supersededById: null }, select: { id: true, taxYear: true, [plan.column]: true }, orderBy: [{ taxYear: 'desc' }, { id: 'asc' }], take: plan.maxPeriods });
    const series = rows.reverse().map((r) => ({ id: String(r.id), year: Number(r.taxYear), value: toNumber(r[plan.column]) }));
    return { total: series.length, rows: [], series };
  }
  const where = shapeWhere(propertyId, plan, now);
  const lastCol = plan.shape === 'STALE_SERVICE' ? plan.column : null;
  const [rows, total, never] = await Promise.all([
    (prisma as any).inventoryItem.findMany({ where, take: LIMIT, select: { id: true, name: true, ...(lastCol ? { [lastCol]: true } : {}) }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    (prisma as any).inventoryItem.count({ where }),
    plan.shape === 'STALE_SERVICE' ? (prisma as any).inventoryItem.count({ where: { propertyId, [plan.column]: null } }) : Promise.resolve(0),
  ]);
  return { total, neverServiced: never, rows: (rows as any[]).map((r) => ({ id: String(r.id), label: String(r.name ?? 'inventory item'), detail: lastCol ? (r[lastCol] ? new Date(r[lastCol]).toISOString() : null) : null })) };
}

/** The points a plan touches, for the caller's audience floor. */
export function shapePointIds(plan: Shape789Plan): string[] {
  if (plan.shape === 'NO_WARRANTY') return ['warranty.expiryDate'];
  return [plan.pointId];
}
