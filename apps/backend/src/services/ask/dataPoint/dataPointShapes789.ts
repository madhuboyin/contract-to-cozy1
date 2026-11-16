// FR-DATA-10 shapes 7-9 (time series / comparison, absence, cross-entity) for the OWNER path. Every plan here is built from a DECLARATION in queryShapeRegistries.ts (a catalogued point, a named history column, a declared
// relation); no message text reaches a query except a validated number of years or months. The planner is pure; `runShape789` is the only place that touches the database and it is read-only and property-scoped.
// Shape 7: change over the tax years on record (tax bill, assessed value). Shapes 8 (field absence, stale service) and 9 (warranty relation) were retired: the typed grammar's query.inventory_item.field_absence, query.inventory_item.service_gap and warranty-relation jobs are their sole producers (FR-ONT-8); only the tax time series remains here. Shape 9 (inventory items with / without a warranty record) was retired: the typed grammar plus the cross-domain executor is the sole producer for the warranty relation (FR-ONT-8).
import { DATA_POINT_BY_ID, type DataPointDefinition } from './dataPointCatalogue';
import { TIME_SERIES_REGISTRY, queryShapesEnabled } from './queryShapeRegistries';
import { prisma } from '../../../lib/prisma';

const norm = (m: string) => ` ${m.toLowerCase().replace(/[^a-z0-9$.%' -]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const LEAD = /^\s*(?:what|which|how many|how much|list|show|provide|tell me|do any|do i have|are there|are any|have i|has my|have my|how has|how have|is my|are my|did my|compare|give me|find)\b/i;

export type Shape789Plan =
  | { readonly shape: 'TIME_SERIES'; readonly pointId: string; readonly entity: 'PropertyTaxBillRecord' | 'PropertyTaxAssessmentRecord'; readonly column: string; readonly maxPeriods: number; readonly label: string };

const point = (id: string): DataPointDefinition | undefined => DATA_POINT_BY_ID.get(id);

export function planShape789(message: string, now: Date = new Date()): Shape789Plan | null {
  if (!LEAD.test(message)) return null;
  const text = norm(message); const enabled = queryShapesEnabled();

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
export interface ShapeRun {
  readonly total: number;
  readonly rows: readonly ShapeRow[];
  readonly series?: ReadonlyArray<{ readonly id: string; readonly year: number; readonly value: number | null }>;
}
const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : typeof v === 'object' && v && 'toNumber' in v ? (v as { toNumber(): number }).toNumber() : Number(v));
const LIMIT = 100;

export async function runShape789(propertyId: string, plan: Shape789Plan, now: Date = new Date()): Promise<ShapeRun> {
  if (plan.shape === 'TIME_SERIES') {
    const delegate = (prisma as any)[plan.entity === 'PropertyTaxBillRecord' ? 'propertyTaxBillRecord' : 'propertyTaxAssessmentRecord'];
    const rows: any[] = await delegate.findMany({ where: { propertyId, status: 'ACTIVE', supersededById: null }, select: { id: true, taxYear: true, [plan.column]: true }, orderBy: [{ taxYear: 'desc' }, { id: 'asc' }], take: plan.maxPeriods });
    const series = rows.reverse().map((r) => ({ id: String(r.id), year: Number(r.taxYear), value: toNumber(r[plan.column]) }));
    return { total: series.length, rows: [], series };
  }
  throw new Error('unreachable: every remaining shape is handled above');
}

/** The points a plan touches, for the caller's audience floor. */
export function shapePointIds(plan: Shape789Plan): string[] {
  return [plan.pointId];
}
