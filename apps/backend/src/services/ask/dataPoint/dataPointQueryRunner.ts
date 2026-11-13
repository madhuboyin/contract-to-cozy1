// FR-DATA-15: executes an allowlisted QueryPlan (dataPointQueryPlan.ts). The WHERE clause, ORDER BY, SELECT, GROUP BY and aggregate columns are built ONLY from the template's declared columns and operators; no message
// text reaches a query. Property scope is applied server-side (propertyId is always part of the where). Row limits (<= QUERY_MAX_LIMIT) and a single-level query keep the scan bounded. Read-only.
import { prisma } from '../../../lib/prisma';
import { QUERY_MAX_LIMIT, QUERY_MAX_PREDICATES, OPERATORS_BY_TYPE, type QueryPlan, type QueryTemplate } from './dataPointQueryPlan';

export interface QueryRow { readonly id: string; readonly label: string; readonly value: unknown }
export interface QueryRun {
  readonly total: number;
  readonly rows: readonly QueryRow[];
  /** Records the question could not rank or compare because the field is not recorded. */
  readonly unrecorded: number;
  readonly aggregate?: { readonly fn: string; readonly field: string | null; readonly value: number | null; readonly counted: number };
  readonly groups?: ReadonlyArray<{ readonly key: string; readonly count: number }>;
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : typeof v === 'object' && v && 'toNumber' in v ? (v as { toNumber(): number }).toNumber() : Number(v));
const CLOSED_TASK = ['COMPLETED', 'CANCELLED'];

/** The Prisma where for a plan. Exported so tests can assert exactly what would be sent. */
export function buildWhere(propertyId: string, plan: QueryPlan, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const t = plan.template;
  if (plan.predicates.length > QUERY_MAX_PREDICATES) throw new Error('too many predicates');
  const and: Array<Record<string, unknown>> = [];
  for (const p of plan.predicates) {
    const field = t.fields[p.field];
    if (!field) throw new Error(`predicate on undeclared field ${p.field}`);
    if (!OPERATORS_BY_TYPE[field.type].includes(p.op)) throw new Error(`operator ${p.op} is not allowed on ${field.type}`);
    const value = field.type === 'date' ? new Date(String(p.value)) : p.value;
    and.push({ [field.column]: p.op === 'equals' ? value : { [p.op]: value } });
  }
  if (plan.excludesClosed && t.fields.status) and.push({ [t.fields.status.column]: { notIn: CLOSED_TASK } });
  return { propertyId, ...(t.baseWhere ?? {}), ...(and.length ? { AND: and } : {}), ...extra };
}

function labelOf(t: QueryTemplate, row: any): string {
  for (const path of t.labelFields) {
    const value = path.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), row);
    if (value) return t.entity === 'Claim' ? `${String(value).toLowerCase().replace(/_/g, ' ')} claim` : String(value);
  }
  return t.singular;
}

export async function runDataPointQuery(propertyId: string, plan: QueryPlan): Promise<QueryRun> {
  const t = plan.template; const delegate = (prisma as any)[t.delegate];
  if (!delegate) throw new Error(`no delegate ${t.delegate}`);
  const where = buildWhere(propertyId, plan);

  if (plan.shape === 'AGGREGATE') {
    const agg = plan.aggregate!;
    if (agg.fn === 'COUNT') {
      if (agg.groupBy) {
        const col = t.fields[agg.groupBy].column;
        const grouped: any[] = await delegate.groupBy({ by: [col], where, _count: { _all: true } });
        const groups = grouped.map((g) => ({ key: String(g[col]), count: Number(g._count?._all ?? 0) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
        return { total: groups.reduce((s, g) => s + g.count, 0), rows: [], unrecorded: 0, groups, aggregate: { fn: 'COUNT', field: null, value: groups.reduce((s, g) => s + g.count, 0), counted: groups.reduce((s, g) => s + g.count, 0) } };
      }
      const total = await delegate.count({ where });
      return { total, rows: [], unrecorded: 0, aggregate: { fn: 'COUNT', field: null, value: total, counted: total } };
    }
    const col = t.fields[agg.field!].column;
    const [total, unrecorded, result] = await Promise.all([
      delegate.count({ where }),
      delegate.count({ where: { ...where, [col]: null } }),
      delegate.aggregate({ where: { ...where, [col]: { not: null } }, _sum: { [col]: true }, _avg: { [col]: true }, _count: { [col]: true } }),
    ]);
    const counted = Number(result?._count?.[col] ?? 0);
    return { total, rows: [], unrecorded, aggregate: { fn: agg.fn, field: agg.field, value: toNumber(agg.fn === 'SUM' ? result?._sum?.[col] : result?._avg?.[col]), counted } };
  }

  const sortCol = plan.sort ? t.fields[plan.sort.field].column : null;
  const showCol = plan.showField ? t.fields[plan.showField].column : null;
  const rankedWhere = sortCol && plan.shape === 'TOP_K' ? { ...where, [sortCol]: { not: null } } : where;
  const take = Math.min(plan.limit, QUERY_MAX_LIMIT);
  const [rows, total, unrecorded] = await Promise.all([
    delegate.findMany({
      where: rankedWhere, take, select: { id: true, ...t.labelSelect, ...(showCol ? { [showCol]: true } : {}), ...(sortCol ? { [sortCol]: true } : {}) },
      ...(plan.sort && sortCol ? { orderBy: [{ [sortCol]: plan.sort.dir }, { id: 'asc' }] } : { orderBy: [{ id: 'asc' }] }),
    }),
    delegate.count({ where: rankedWhere }),
    sortCol && plan.shape === 'TOP_K' ? delegate.count({ where: { ...where, [sortCol]: null } }) : Promise.resolve(0),
  ]);
  return { total, unrecorded, rows: (rows as any[]).map((r) => ({ id: String(r.id), label: labelOf(t, r), value: showCol ? r[showCol] ?? null : null })) };
}
