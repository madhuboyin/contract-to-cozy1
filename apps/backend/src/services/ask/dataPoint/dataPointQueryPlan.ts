// FR-DATA-10 / FR-DATA-15: query shapes 3-6 (list, filter, sort or top-k, aggregate) for the generic data-point reader. This file is PURE (no database): it turns wording into an allowlisted QueryPlan, or says why it cannot.
// It is not an open query interface. Every (entity, shape) pair resolves to a declared template (QUERY_TEMPLATES) with: the fields a predicate, sort, group or aggregate may touch (each mapped to a CATALOGUED data point, whose audience
// floor is applied to every field the plan touches), the operators allowed by field type, a maximum predicate count (5), a maximum result limit (100), a maximum relative date range (50 years) and the measures an aggregate may use.
// Anything outside a template yields no plan. A plan never contains free text from the message except validated numbers, years and enum words.
import { DATA_POINT_BY_ID, type DataPointDefinition, type DataPointEntity } from './dataPointCatalogue';

export type QueryShape = 'LIST' | 'FILTER' | 'TOP_K' | 'AGGREGATE';
export type FieldType = 'date' | 'money' | 'dollars' | 'enum';
export type Operator = 'lt' | 'lte' | 'gt' | 'gte' | 'equals' | 'in';
export type AggregateFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export const QUERY_MAX_PREDICATES = 5;
export const QUERY_MAX_LIMIT = 100;
export const QUERY_DEFAULT_SHOWN = 10;
export const QUERY_MAX_RELATIVE_YEARS = 50;
/** Operators allowed per field type: the allowlist FR-DATA-15 asks for. */
export const OPERATORS_BY_TYPE: Readonly<Record<FieldType, readonly Operator[]>> = Object.freeze({ date: ['lt', 'lte', 'gt', 'gte'], money: ['lt', 'lte', 'gt', 'gte'], dollars: ['lt', 'lte', 'gt', 'gte'], enum: ['equals', 'in'] });

export interface QueryField {
  /** The catalogued data point this field is read through: its audience floor and family apply to every use of the field. */
  readonly point: string;
  readonly type: FieldType;
  readonly column: string;
  readonly sortable: boolean;
  readonly measure: boolean;
  readonly groupable: boolean;
  /** Words that name the field in a question. */
  readonly words: readonly string[];
  readonly label: string;
}
export interface QueryTemplate {
  readonly id: string;
  readonly entity: DataPointEntity;
  readonly delegate: string;
  /** Compound plural nouns that select this template. A bare "items" or "tasks" selects nothing. */
  readonly nouns: readonly string[];
  readonly singularNouns: readonly string[];
  readonly plural: string;
  readonly singular: string;
  /** Columns needed to label a row (never returned as a data point). */
  readonly labelSelect: Record<string, unknown>;
  readonly labelFields: readonly string[];
  /** The lowest role that may even see these records exist (counts, lists). */
  readonly countFloor: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  readonly fields: Readonly<Record<string, QueryField>>;
  /** Enum words a question may use, mapped to stored values, per field. */
  readonly enumWords: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly dateField: string | null;
  /** An optional base filter (for example a task that is not cancelled). */
  readonly baseWhere?: Record<string, unknown>;
}

const f = (point: string, type: FieldType, column: string, words: string[], label: string, o: { sortable?: boolean; measure?: boolean; groupable?: boolean } = {}): QueryField =>
  ({ point, type, column, words, label, sortable: o.sortable ?? true, measure: o.measure ?? false, groupable: o.groupable ?? false });

export const QUERY_TEMPLATES: readonly QueryTemplate[] = Object.freeze([
  {
    id: 'inventory', entity: 'InventoryItem', delegate: 'inventoryItem', nouns: ['appliances', 'inventory items', 'household items', 'items in my inventory'], singularNouns: ['appliance', 'inventory item'], plural: 'items', singular: 'item',
    labelSelect: { name: true }, labelFields: ['name'], countFloor: 'VIEWER',
    fields: {
      installedOn: f('item.installedOn', 'date', 'installedOn', ['installed', 'install date', 'age', 'old', 'older', 'oldest', 'newest', 'newer'], 'installed'),
      purchasedOn: f('item.purchasedOn', 'date', 'purchasedOn', ['purchased', 'bought', 'purchase date'], 'purchased'),
      purchaseCost: f('item.purchaseCost', 'money', 'purchaseCostCents', ['purchase price', 'purchase cost', 'paid', 'bought for', 'purchase'], 'purchase price', { measure: true }),
      replacementCost: f('item.replacementCost', 'money', 'replacementCostCents', ['replacement cost', 'replacement value', 'replace', 'replacement'], 'replacement cost', { measure: true }),
      condition: f('item.condition', 'enum', 'condition', ['condition'], 'condition', { sortable: false, groupable: true }),
      category: f('item.category', 'enum', 'category', ['category'], 'category', { sortable: false, groupable: true }),
    },
    enumWords: {
      condition: { new: 'NEW', good: 'GOOD', fair: 'FAIR', poor: 'POOR', unknown: 'UNKNOWN' },
      category: { hvac: 'HVAC', plumbing: 'PLUMBING', electrical: 'ELECTRICAL', roof: 'ROOF_EXTERIOR', safety: 'SAFETY', 'smart home': 'SMART_HOME', furniture: 'FURNITURE', electronics: 'ELECTRONICS' },
    },
    dateField: 'installedOn',
  },
  {
    id: 'warranties', entity: 'Warranty', delegate: 'warranty', nouns: ['warranties', 'home warranties'], singularNouns: ['warranty'], plural: 'warranties', singular: 'warranty',
    labelSelect: { providerName: true, inventoryItem: { select: { name: true } } }, labelFields: ['inventoryItem.name', 'providerName'], countFloor: 'VIEWER',
    fields: {
      expiryDate: f('warranty.expiryDate', 'date', 'expiryDate', ['expire', 'expires', 'expiring', 'expired', 'expiry', 'run out', 'ends', 'ending'], 'expires'),
      startDate: f('warranty.startDate', 'date', 'startDate', ['started', 'start date', 'begins', 'began'], 'starts'),
      cost: f('warranty.cost', 'dollars', 'cost', ['cost', 'price', 'paid', 'premium'], 'cost', { measure: true }),
    },
    enumWords: {}, dateField: 'expiryDate',
  },
  {
    id: 'policies', entity: 'InsurancePolicy', delegate: 'insurancePolicy', nouns: ['insurance policies', 'policies'], singularNouns: ['insurance policy', 'policy'], plural: 'insurance policies', singular: 'insurance policy',
    labelSelect: { carrierName: true, coverageType: true }, labelFields: ['carrierName', 'coverageType'], countFloor: 'VIEWER',
    fields: {
      expiryDate: f('policy.expiryDate', 'date', 'expiryDate', ['expire', 'expires', 'expiring', 'expired', 'expiry', 'renew', 'renewal', 'ends'], 'expires'),
      startDate: f('policy.startDate', 'date', 'startDate', ['started', 'start date', 'begins'], 'starts'),
      premium: f('policy.premium', 'dollars', 'premiumAmount', ['premium', 'premiums', 'cost', 'price'], 'premium', { measure: true }),
      deductible: f('policy.deductible', 'money', 'deductibleCents', ['deductible', 'deductibles'], 'deductible', { measure: true }),
    },
    enumWords: {}, dateField: 'expiryDate',
  },
  {
    id: 'tasks', entity: 'PropertyMaintenanceTask', delegate: 'propertyMaintenanceTask', nouns: ['maintenance tasks', 'maintenance items'], singularNouns: ['maintenance task'], plural: 'maintenance tasks', singular: 'maintenance task',
    labelSelect: { title: true }, labelFields: ['title'], countFloor: 'VIEWER',
    fields: {
      nextDueDate: f('task.nextDueDate', 'date', 'nextDueDate', ['due', 'overdue', 'next due', 'deadline'], 'due'),
      status: f('task.status', 'enum', 'status', ['status'], 'status', { sortable: false, groupable: true }),
      priority: f('task.priority', 'enum', 'priority', ['priority'], 'priority', { sortable: false, groupable: true }),
      estimatedCost: f('task.estimatedCost', 'dollars', 'estimatedCost', ['estimated cost', 'estimate', 'expensive', 'cost'], 'estimated cost', { measure: true }),
      actualCost: f('task.actualCost', 'dollars', 'actualCost', ['actual cost', 'spent', 'actually cost'], 'actual cost', { measure: true }),
    },
    enumWords: {
      status: { pending: 'PENDING', 'in progress': 'IN_PROGRESS', completed: 'COMPLETED', done: 'COMPLETED', cancelled: 'CANCELLED', 'needs review': 'NEEDS_REVIEW' },
      priority: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT' },
    },
    dateField: 'nextDueDate',
  },
  {
    id: 'claims', entity: 'Claim', delegate: 'claim', nouns: ['claims', 'insurance claims'], singularNouns: ['claim'], plural: 'claims', singular: 'claim',
    labelSelect: { type: true }, labelFields: ['type'], countFloor: 'CONTRIBUTOR',
    fields: {
      status: f('claim.status', 'enum', 'status', ['status'], 'status', { sortable: false, groupable: true }),
      type: f('claim.type', 'enum', 'type', ['type'], 'type', { sortable: false, groupable: true }),
      openedAt: f('claim.openedDate', 'date', 'openedAt', ['opened', 'open date'], 'opened'),
      incidentAt: f('claim.incidentDate', 'date', 'incidentAt', ['incident', 'happened', 'loss date'], 'incident date'),
      settlement: f('claim.settlement', 'dollars', 'settlementAmount', ['settlement', 'settled', 'payout', 'paid out'], 'settlement', { measure: true }),
      deductible: f('claim.deductible', 'dollars', 'deductibleAmount', ['deductible'], 'deductible', { measure: true }),
    },
    enumWords: {
      status: { draft: 'DRAFT', 'in progress': 'IN_PROGRESS', submitted: 'SUBMITTED', 'under review': 'UNDER_REVIEW', approved: 'APPROVED', denied: 'DENIED', closed: 'CLOSED' },
      type: { water: 'WATER_DAMAGE', fire: 'FIRE_SMOKE', storm: 'STORM_WIND_HAIL', hail: 'STORM_WIND_HAIL', theft: 'THEFT_VANDALISM', liability: 'LIABILITY', hvac: 'HVAC', plumbing: 'PLUMBING', electrical: 'ELECTRICAL', appliance: 'APPLIANCE' },
    },
    dateField: 'openedAt',
  },
] as QueryTemplate[]);

export interface Predicate { readonly field: string; readonly op: Operator; readonly value: string | number; readonly describe: string }
export interface QueryPlan {
  readonly shape: QueryShape;
  readonly template: QueryTemplate;
  readonly predicates: readonly Predicate[];
  readonly sort: { readonly field: string; readonly dir: 'asc' | 'desc' } | null;
  readonly limit: number;
  readonly aggregate: { readonly fn: AggregateFn; readonly field: string | null; readonly groupBy: string | null } | null;
  /** Fields whose catalogued floor must pass for the caller: every field the plan touches, not only the one displayed. */
  readonly touched: readonly string[];
  /** The field shown beside each listed row, when there is one. */
  readonly showField: string | null;
  /** True when "overdue" asked for an open task (not completed or cancelled), added as an internal predicate. */
  readonly excludesClosed: boolean;
}
export type QueryPlanOutcome =
  | { readonly kind: 'PLAN'; readonly plan: QueryPlan }
  | { readonly kind: 'CLARIFY'; readonly reasonCode: string; readonly title: string; readonly body: string }
  | { readonly kind: 'NONE' };

const norm = (m: string) => ` ${m.replace(/(\d),(?=\d{3}\b)/g, '$1').toLowerCase().replace(/[^a-z0-9$.%' -]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
const num = (w: string): number | null => { const k = w.replace(/,/g, ''); if (/^\d+(?:\.\d+)?$/.test(k)) return Number(k); return NUMBER_WORDS[k] ?? null; };

export function templateFor(entity: DataPointEntity): QueryTemplate | undefined { return QUERY_TEMPLATES.find((t) => t.entity === entity); }
export function pointOf(template: QueryTemplate, field: string): DataPointDefinition { const p = DATA_POINT_BY_ID.get(template.fields[field].point); if (!p) throw new Error(`template ${template.id} field ${field} is not a catalogued data point`); return p; }

function pickTemplate(text: string): { template: QueryTemplate; plural: boolean } | 'AMBIGUOUS' | null {
  const hits: Array<{ template: QueryTemplate; plural: boolean; len: number }> = [];
  for (const t of QUERY_TEMPLATES) {
    for (const n of t.nouns) if (text.includes(` ${n} `)) hits.push({ template: t, plural: true, len: n.length });
    for (const n of t.singularNouns) if (text.includes(` ${n} `)) hits.push({ template: t, plural: false, len: n.length });
  }
  if (!hits.length) return null;
  // A noun contained in a longer matched noun ("claims" in "insurance claims", "policies" in "insurance policies") is the same mention. Different kinds left over are never merged or guessed.
  const nounText = (h: { template: QueryTemplate; plural: boolean; len: number }) => [...h.template.nouns, ...h.template.singularNouns].find((n) => n.length === h.len && text.includes(` ${n} `)) ?? '';
  const distinct = hits.filter((h) => !hits.some((g) => g !== h && g.len > h.len && nounText(g).includes(nounText(h))));
  const ids = new Set(distinct.map((h) => h.template.id));
  if (ids.size > 1) return 'AMBIGUOUS';
  return { template: distinct[0].template, plural: distinct.some((h) => h.plural) };
}

/** The field a message names, restricted to the fields acceptable for the clause (a date clause never picks the "condition" field just because that word is also in the message). */
function fieldNamed(template: QueryTemplate, text: string, fallback?: string, accept: (field: QueryField) => boolean = () => true): string | null {
  let best: { key: string; len: number } | null = null;
  for (const [key, field] of Object.entries(template.fields)) if (accept(field)) for (const w of field.words) if (text.includes(` ${w} `) || text.includes(` ${w}s `)) { if (!best || w.length > best.len) best = { key, len: w.length }; }
  return best?.key ?? fallback ?? null;
}

function addYears(now: Date, years: number) { const d = new Date(now); d.setUTCFullYear(d.getUTCFullYear() + years); return d; }
function addDays(now: Date, days: number) { return new Date(now.getTime() + days * 86_400_000); }
function addMonths(now: Date, months: number) { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + months); return d; }
const unitDate = (now: Date, n: number, unit: string, sign: 1 | -1): Date | null => {
  const u = unit.replace(/s$/, '');
  if (u === 'day') return addDays(now, sign * n); if (u === 'week') return addDays(now, sign * n * 7); if (u === 'month') return addMonths(now, sign * n); if (u === 'year') return addYears(now, sign * n);
  return null;
};
const withinRange = (n: number, unit: string) => !(unit.startsWith('year') && n > QUERY_MAX_RELATIVE_YEARS) && n > 0 && n <= 1000;

// ---- calendar boundaries in the PROPERTY's timezone (never rolling windows, never UTC) ----
const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) { let f = DTF_CACHE.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }); DTF_CACHE.set(tz, f); } return f; }
function zonedParts(date: Date, tz: string) { const o: Record<string, string> = {}; for (const part of dtf(tz).formatToParts(date)) o[part.type] = part.value; return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour), mi: Number(o.minute), s: Number(o.second), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) }; }
function offsetMinutes(date: Date, tz: string) { const p = zonedParts(date, tz); return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - (date.getTime() - date.getUTCMilliseconds())) / 60_000; }
/** The instant local midnight of y-m-d occurs in `tz` (month and day may overflow; Date.UTC normalises). Handles DST by re-checking the offset at the candidate instant. */
export function zonedMidnightUtc(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d); const first = offsetMinutes(new Date(guess), tz); let t = guess - first * 60_000;
  const second = offsetMinutes(new Date(t), tz); if (second !== first) t = guess - second * 60_000;
  return new Date(t);
}
/** [start, end) of the calendar month, week (Monday start) or year `offset` periods from the current one, in the property's timezone. */
export function calendarRange(now: Date, tz: string, unit: 'month' | 'week' | 'year', offset: number): { start: Date; end: Date } {
  const p = zonedParts(now, tz);
  if (unit === 'year') return { start: zonedMidnightUtc(p.y + offset, 1, 1, tz), end: zonedMidnightUtc(p.y + offset + 1, 1, 1, tz) };
  if (unit === 'month') return { start: zonedMidnightUtc(p.y, p.m + offset, 1, tz), end: zonedMidnightUtc(p.y, p.m + offset + 1, 1, tz) };
  const sinceMonday = (p.dow + 6) % 7;
  return { start: zonedMidnightUtc(p.y, p.m, p.d - sinceMonday + 7 * offset, tz), end: zonedMidnightUtc(p.y, p.m, p.d - sinceMonday + 7 * (offset + 1), tz) };
}
const validZone = (tz: string) => { try { dtf(tz); return true; } catch { return false; } };

/** The plan for a message at a given time (and property timezone), or why there is none. Never throws on user text. */
export function planDataPointQuery(message: string, now: Date = new Date(), timeZoneIn: string = 'UTC'): QueryPlanOutcome {
  const timeZone = validZone(timeZoneIn) ? timeZoneIn : 'UTC';
  const text = norm(message);
  // "claim checklist step", "claim timeline event", "claim document" name a child of one claim (a point read), not the kind "claims".
  if (/\bclaim (?:checklist|timeline|events?|documents?|steps?|attachments?)\b/.test(text)) return { kind: 'NONE' };
  const picked = pickTemplate(text);
  if (!picked) return { kind: 'NONE' };
  if (picked === 'AMBIGUOUS') return { kind: 'CLARIFY', reasonCode: 'DATA_POINT_QUERY_AMBIGUOUS_KIND', title: 'Which records do you mean?', body: 'Your question could be about more than one kind of record. Name one, for example “my warranties” or “my insurance policies”.' };
  const { template, plural } = picked;
  const predicates: Predicate[] = [];
  let excludesClosed = false;
  const touched = new Set<string>();
  // More recognised qualifiers than the template allows is NEVER executed as a partial set (a truncated filter would look like it honored the whole question): it is asked back.
  let overflow = false;
  const push = (p: Predicate) => { if (predicates.length < QUERY_MAX_PREDICATES) { predicates.push(p); touched.add(p.field); } else overflow = true; };

  // ---- predicates ----
  let m: RegExpExecArray | null;
  if (template.fields.installedOn && (m = /\b(older|newer) than (\d+|[a-z]+) (years?|months?)\b/.exec(text))) {
    const n = num(m[2]); if (n === null || !withinRange(n, m[3])) return { kind: 'NONE' };
    const cutoff = unitDate(now, n, m[3], -1); if (!cutoff) return { kind: 'NONE' };
    push({ field: 'installedOn', op: m[1] === 'older' ? 'lt' : 'gt', value: cutoff.toISOString(), describe: `${m[1]} than ${n} ${m[3]}` });
  }
  const dateField = template.dateField;
  if (dateField && (m = /\b(before|after|in|since) (19\d\d|20\d\d)\b/.exec(text)) && !/\bin (?:the )?next\b/.test(text)) {
    const year = Number(m[2]); const key = fieldNamed(template, text, dateField, (x) => x.type === 'date') ?? dateField; const field = template.fields[key];
    if (field?.type === 'date') {
      const start = zonedMidnightUtc(year, 1, 1, timeZone); const end = zonedMidnightUtc(year + 1, 1, 1, timeZone);
      if (m[1] === 'before') push({ field: key, op: 'lt', value: start.toISOString(), describe: `before ${year}` });
      else if (m[1] === 'after') push({ field: key, op: 'gte', value: end.toISOString(), describe: `after ${year}` });
      else if (m[1] === 'since') push({ field: key, op: 'gte', value: start.toISOString(), describe: `since ${year}` });
      else { push({ field: key, op: 'gte', value: start.toISOString(), describe: `in ${year}` }); push({ field: key, op: 'lt', value: end.toISOString(), describe: `in ${year}` }); }
    }
  }
  if (dateField && (m = /\b(?:expiring|expire|expires|due|ending|renewing|coming due)\b (?:in|within) (?:the )?(?:next )?(\d+|[a-z]+) (days?|weeks?|months?|years?)\b/.exec(text))) {
    const n = num(m[1]); if (n === null || !withinRange(n, m[2])) return { kind: 'NONE' };
    const end = unitDate(now, n, m[2], 1); if (!end) return { kind: 'NONE' };
    push({ field: dateField, op: 'gte', value: now.toISOString(), describe: `from today` }); push({ field: dateField, op: 'lte', value: end.toISOString(), describe: `within ${n} ${m[2]}` });
  } else if (dateField && /\b(?:this|next) (month|week|year)\b/.test(text) && /\b(?:expiring|expire|expires|due|ending)\b/.test(text)) {
    // A calendar period, not a rolling window: [start, end) of this or next month, week (Monday start) or year in the PROPERTY's timezone.
    const mm = /\b(this|next) (month|week|year)\b/.exec(text)!; const unit = mm[2] as 'month' | 'week' | 'year';
    const { start, end } = calendarRange(now, timeZone, unit, mm[1] === 'this' ? 0 : 1);
    push({ field: dateField, op: 'gte', value: start.toISOString(), describe: `${mm[1]} ${unit}` }); push({ field: dateField, op: 'lt', value: end.toISOString(), describe: `${mm[1]} ${unit}` });
  } else if (dateField && /\b(?:expired|lapsed)\b/.test(text)) {
    push({ field: dateField, op: 'lt', value: now.toISOString(), describe: 'already past' });
  } else if (template.id === 'tasks' && /\boverdue\b/.test(text)) {
    push({ field: 'nextDueDate', op: 'lt', value: now.toISOString(), describe: 'overdue' }); excludesClosed = true;
  }
  // money thresholds: "more than $1,000", "over 500 dollars", "less than $200"
  if ((m = /\b(more than|over|above|greater than|less than|under|below|cheaper than)\s+\$?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars|bucks)?\b/.exec(text)) && !/\b(older|newer) than\b/.test(m[0])) {
    const key = fieldNamed(template, text, Object.keys(template.fields).find((k) => template.fields[k].measure) ?? undefined, (x) => x.measure);
    const field = key ? template.fields[key] : null;
    if (field && (field.type === 'money' || field.type === 'dollars')) {
      const amount = Number(m[2].replace(/,/g, ''));
      if (Number.isFinite(amount) && amount >= 0 && amount < 1e9) push({ field: key!, op: /more|over|above|greater/.test(m[1]) ? 'gt' : 'lt', value: field.type === 'money' ? Math.round(amount * 100) : amount, describe: `${/more|over|above|greater/.test(m[1]) ? 'over' : 'under'} $${amount.toLocaleString('en-US')}` });
    }
  }
  // enum words: "in poor condition", "high priority", "approved claims"
  for (const [key, words] of Object.entries(template.enumWords)) {
    const field = template.fields[key];
    for (const [word, value] of Object.entries(words).sort((a, b) => b[0].length - a[0].length)) {
      const rx = key === 'condition' ? new RegExp(`\\b${word} condition\\b`) : key === 'priority' ? new RegExp(`\\b${word} priority\\b`) : new RegExp(`\\b${word}\\b`);
      if (key === 'category' && !/\bcategory\b|\bhvac\b|\bplumbing\b|\belectrical\b|\bsafety\b|\bfurniture\b|\belectronics\b/.test(text)) continue;
      if (key === 'status' && template.id === 'tasks' && /\boverdue\b/.test(text)) continue;
      if (rx.test(text) && !predicates.some((p) => p.field === key)) { push({ field: key, op: 'equals', value, describe: `${field.label} ${value.toLowerCase().replace(/_/g, ' ')}` }); break; }
    }
  }

  if (overflow) return { kind: 'CLARIFY', reasonCode: 'DATA_POINT_QUERY_TOO_MANY_FILTERS', title: 'That is more filters than I can apply at once', body: `I can apply up to ${QUERY_MAX_PREDICATES} conditions to one question. Ask with fewer, or in two steps, so I do not answer only part of what you asked.` };
  // A qualifier the plan did not turn into a predicate must not be silently dropped ("how many OPEN claims" answered as "how many claims" would be a wrong answer): such a question gets no plan.
  if (template.id === 'tasks' && /\b(open|active|outstanding|incomplete)\b/.test(text) && !excludesClosed) { excludesClosed = true; }
  const stray = /\b(open|active|current|upcoming|recent|unresolved|outstanding|incomplete|late|broken|failing|unpaid|expensive|valuable)\b/.exec(text);
  const strayConsumed = stray && ((template.id === 'tasks' && /open|active|outstanding|incomplete/.test(stray[1])) || (/expensive|valuable/.test(stray[1]) && /\b(most|least) (expensive|valuable)\b|\bexpensive\b.*\b(than|over|under)\b/.test(text)));
  if (stray && !strayConsumed) return { kind: 'NONE' };

  // A singular noun names ONE record ("my claim roof hail", "my warranty"): only a superlative ("the oldest appliance", "which warranty expires first") may use it; everything else needs the plural kind.
  const preSuperlative = /\b(most expensive|priciest|costliest|most costly|least expensive|cheapest|oldest|newest|youngest|largest|highest|lowest|biggest|soonest|earliest|latest|next to expire|expires? (?:first|soonest|next)|expiring (?:first|soonest|next)|due (?:first|soonest|next)|first to expire)\b/.test(text);
  if (!plural && !preSuperlative) return { kind: 'NONE' };

  // ---- shape ----
  // "claim number of my claim" and "serial number of my fridge" are point reads, not counts: "number of" counts only over a plural noun.
  const countQ = /\bhow many\b|\bcount\b/.test(text) || (plural && /\bnumber of\b/.test(text));
  const sumQ = /\b(total|sum|combined|altogether|add up)\b/.test(text);
  const avgQ = /\b(average|mean|typical)\b/.test(text);
  const superlative = /\b(most expensive|priciest|costliest|most costly|least expensive|cheapest|oldest|newest|youngest|largest|highest|lowest|biggest|soonest|earliest|latest|next to expire|expires? (?:first|soonest|next)|expiring (?:first|soonest|next)|due (?:first|soonest|next)|first to expire)\b/.exec(text);
  const listQ = /\b(list|show|what|which)\b.*\b(?:do i have|have i got|are there|i have|i own)\b|\b(?:list|show) (?:all )?(?:of )?(?:my|our|the)\b/.test(text);

  const limitAsk = (() => { const k = /\b(?:top|first|my)?\s*(\d+|three|five|ten)\b\s+(?:most|oldest|newest|cheapest|priciest|costliest)/.exec(text) ?? /\btop (\d+|three|five|ten)\b/.exec(text); return k ? num(k[1]) : null; })();
  const limit = (n: number | null | undefined, dflt: number) => Math.max(1, Math.min(QUERY_MAX_LIMIT, n ?? dflt));

  if (sumQ || avgQ || (countQ && !superlative)) {
    if (countQ && !sumQ && !avgQ) {
      const groupWord = /\bby (category|condition|status|priority|type)\b/.exec(text); const groupBy = groupWord && template.fields[groupWord[1]]?.groupable ? groupWord[1] : null;
      if (groupBy) touched.add(groupBy);
      return { kind: 'PLAN', plan: { shape: 'AGGREGATE', template, predicates, sort: null, limit: QUERY_MAX_LIMIT, aggregate: { fn: 'COUNT', field: null, groupBy }, touched: [...touched], showField: null, excludesClosed } };
    }
    const measure = fieldNamed(template, text, undefined, (x) => x.measure); const measureKey = measure && template.fields[measure].measure ? measure : null;
    if (!measureKey) {
      const measures = Object.entries(template.fields).filter(([, v]) => v.measure).map(([, v]) => v.label);
      if (!measures.length) return { kind: 'NONE' };
      return { kind: 'CLARIFY', reasonCode: 'DATA_POINT_QUERY_MEASURE_REQUIRED', title: `${sumQ ? 'Total' : 'Average'} of what?`, body: `I can ${sumQ ? 'add up' : 'average'} the ${measures.join(' or ')} of your ${template.plural}. Say which one.` };
    }
    touched.add(measureKey);
    return { kind: 'PLAN', plan: { shape: 'AGGREGATE', template, predicates, sort: null, limit: QUERY_MAX_LIMIT, aggregate: { fn: sumQ ? 'SUM' : 'AVG', field: measureKey, groupBy: null }, touched: [...touched], showField: null, excludesClosed } };
  }

  if (superlative) {
    const word = superlative[1];
    const dir: 'asc' | 'desc' = /most expensive|priciest|costliest|most costly|largest|highest|biggest|newest|youngest|latest/.test(word) ? 'desc' : 'asc';
    let key: string | null = null;
    if (/oldest|newest|youngest/.test(word)) key = template.fields.installedOn ? 'installedOn' : null;
    else if (/soonest|earliest|first|next|latest/.test(word) || /expire|due/.test(word)) key = template.dateField;
    else if (/expensive|priciest|costliest|costly|cheapest|largest|highest|lowest|biggest/.test(word)) {
      const named = fieldNamed(template, text, undefined, (x) => x.measure);
      const namedField = named ? template.fields[named] : null;
      if (namedField && namedField.measure) key = named;
      else {
        const measures = Object.entries(template.fields).filter(([, v]) => v.measure);
        if (measures.length === 1) key = measures[0][0];
        else if (measures.length > 1) return { kind: 'CLARIFY', reasonCode: 'DATA_POINT_QUERY_MEASURE_REQUIRED', title: 'Ranked by what?', body: `I can rank your ${template.plural} by ${measures.map(([, v]) => v.label).join(' or ')}. Say which one.` };
      }
    }
    if (!key || !template.fields[key]?.sortable) return { kind: 'NONE' };
    // "the oldest appliance" ranks by install date; an item with no recorded value is not ranked.
    touched.add(key);
    const k = limitAsk ?? (plural && !/\bthe (most|oldest|newest|cheapest|priciest)\b/.test(text) ? 5 : 1);
    return { kind: 'PLAN', plan: { shape: 'TOP_K', template, predicates, sort: { field: key, dir }, limit: limit(k, 1), aggregate: null, touched: [...touched], showField: key, excludesClosed } };
  }

  if (predicates.length) {
    const shown = predicates[0].field;
    return { kind: 'PLAN', plan: { shape: 'FILTER', template, predicates, sort: template.fields[shown]?.sortable ? { field: shown, dir: 'asc' } : null, limit: QUERY_MAX_LIMIT, aggregate: null, touched: [...touched], showField: template.fields[shown]?.type === 'enum' ? null : shown, excludesClosed } };
  }
  if (listQ && plural) {
    return { kind: 'PLAN', plan: { shape: 'LIST', template, predicates: [], sort: null, limit: QUERY_MAX_LIMIT, aggregate: null, touched: [], showField: null, excludesClosed } };
  }
  return { kind: 'NONE' };
}

/** Cheap guard for routing: a message that is plausibly a query question (so the router need not build a plan for every message). */
export const dataPointQueryLead = /^\s*(?:what|which|how many|how much|list|show|tell me|do i have|are there|count|give me|find)\b/i;
export function isDataPointQuery(message: string, now: Date = new Date()): boolean { return dataPointQueryLead.test(message) && planDataPointQuery(message, now).kind !== 'NONE'; }
/** Shapes 4-6 over entities with no dedicated filtering operation (the router uses this ahead of the generic lookups). */
export function isDataPointComputedQuery(message: string, now: Date = new Date()): boolean {
  if (!dataPointQueryLead.test(message)) return false;
  const o = planDataPointQuery(message, now);
  if (o.kind !== 'PLAN' || o.plan.shape === 'LIST' || o.plan.template.id === 'tasks') return false;
  // Warranties and policies already have dedicated operations that filter by expiry window (WARRANTY_LOOKUP, the coverage operations); they keep plain filters. Counts, rankings and totals are not theirs.
  if (o.plan.shape === 'FILTER' && (o.plan.template.id === 'warranties' || o.plan.template.id === 'policies')) return false;
  return true;
}
