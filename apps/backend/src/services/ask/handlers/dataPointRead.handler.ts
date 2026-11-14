// DATA_POINT_READ (reliability FRD D12, Phase 1b): "what is the serial number of my fridge", "when was my furnace installed", "what did I pay for my dryer".
// A STANDARD, read-only fact read through the one allowlisted template in dataPoint/dataPointReader.ts. No side effects; a value that is not recorded is said plainly,
// with the authorised way to add it, and never guessed (FR-REC-2 MISSING_RECORD_DATA).
import { sourceRef, type CompositeSourceType } from '../composition/sourceAuthorization';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ALTERNATE_POINT, audienceFloorCopy, DATA_POINT_BY_ID, resolveDataPoint, resolveDataPointsMulti, roleMayRead, type DataPointDefinition } from '../dataPoint/dataPointCatalogue';
import { namedTaxYears, readDataPoint } from '../dataPoint/dataPointReader';
import { planDataPointQuery, pointOf, type QueryPlan } from '../dataPoint/dataPointQueryPlan';
import { prisma } from '../../../lib/prisma';
import { safeTimezone } from '../support/propertyContext';
import { runDataPointQuery } from '../dataPoint/dataPointQueryRunner';
import { applyLaunchHints } from '../dataPoint/dataPointLaunchHints';
import { planShape789, runShape789, shapePointIds, type Shape789Plan } from '../dataPoint/dataPointShapes789';

const ENTITY_COPY: Record<string, { plural: string; singular: string; collection: string; record: string; none?: string }> = {
  InventoryItem: { plural: 'items', singular: 'inventory', collection: 'inventory', record: 'Home inventory record' },
  Warranty: { plural: 'warranties', singular: 'warranty', collection: 'warranties', record: 'Warranty record' },
  InsurancePolicy: { plural: 'insurance policies', singular: 'insurance policy', collection: 'insurance policies', record: 'Insurance policy record' },
  PropertyMaintenanceTask: { plural: 'maintenance tasks', singular: 'maintenance task', collection: 'maintenance tasks', record: 'Maintenance task record' },
  Property: { plural: 'homes', singular: 'home', collection: 'home profile', record: 'Home profile', none: 'No home profile is recorded yet' },
  HomeReserveFund: { plural: 'reserve funds', singular: 'reserve fund', collection: 'reserve fund', record: 'Home reserve fund record', none: 'No reserve fund is set up for this home yet' },
  PropertySalePrepProfile: { plural: 'sale prep profiles', singular: 'sale prep profile', collection: 'sale prep profile', record: 'Sale prep profile', none: 'No sale prep profile is recorded yet' },
  PropertySaleCase: { plural: 'sale plans', singular: 'sale plan', collection: 'sale plan', record: 'Sale plan record', none: 'No sale plan is started for this home yet' },
  HomeBuyerChecklist: { plural: 'buyer journeys', singular: 'buyer journey', collection: 'buyer journey', record: 'Buyer journey record', none: 'No buyer journey is started for this home yet' },
  BuyerJourneyMilestone: { plural: 'buyer milestones', singular: 'buyer milestone', collection: 'buyer milestones', record: 'Buyer journey milestone', none: 'No buyer milestone is recorded yet' },
  SaleReadinessItem: { plural: 'sale-readiness items', singular: 'sale-readiness item', collection: 'sale-readiness items', record: 'Sale-readiness item', none: 'No sale-readiness item is recorded yet' },
  PropertyRecordVersion: { plural: 'record versions', singular: 'record', collection: 'home records', record: 'Home record version', none: 'No home record is on file yet' },
  Claim: { plural: 'claims', singular: 'claim', collection: 'claims', record: 'Claim', none: 'No claim is recorded for this home yet' },
  ClaimChecklistItem: { plural: 'claim checklist steps', singular: 'claim checklist step', collection: 'claim checklist', record: 'Claim checklist step', none: 'No claim is recorded for this home yet' },
  ClaimTimelineEvent: { plural: 'claim timeline events', singular: 'claim timeline event', collection: 'claim timeline', record: 'Claim timeline event', none: 'No claim is recorded for this home yet' },
  ClaimDocument: { plural: 'claim documents', singular: 'claim document', collection: 'claim documents', record: 'Claim document', none: 'No claim is recorded for this home yet' },
  HomeBuyerTask: { plural: 'buyer tasks', singular: 'buyer task', collection: 'buyer tasks', record: 'Buyer plan task', none: 'No buyer task is recorded yet' },
  PropertyRecord: { plural: 'home records', singular: 'home record', collection: 'home records', record: 'Home record' },
  PropertyTaxBillRecord: { plural: 'property tax bills', singular: 'property tax bill', collection: 'property tax bills', record: 'Property tax bill record', none: 'No property tax bill is recorded yet' },
  PropertyTaxAssessmentRecord: { plural: 'property tax assessments', singular: 'property tax assessment', collection: 'property tax assessments', record: 'Property tax assessment record', none: 'No property tax assessment is recorded yet' },
};
const words = (v: unknown) => String(v).toLowerCase().replace(/_/g, ' ');
/** "How old is it": the recorded install date (or year) read back as an approximate age. Only for the install-date points, only when the question asks for an age, and never for a date in the future. */
export function ageSentence(point: DataPointDefinition, value: unknown, message: string, now: Date = new Date()): string {
  if (!/\bhow old\b|\bage\b/i.test(message)) return '';
  let years: number | null = null;
  if (point.id === 'item.installedOn' || point.id === 'item.purchasedOn') { const when = value instanceof Date ? value : new Date(String(value)); if (!Number.isNaN(when.getTime())) years = (now.getTime() - when.getTime()) / (365.25 * 86_400_000); }
  else if (point.id === 'home.roofReplacementYear') years = now.getUTCFullYear() - Number(value);
  if (years === null || !Number.isFinite(years) || years < 0) return '';
  const whole = Math.floor(years);
  return whole < 1 ? ' That is less than a year ago.' : ` That makes it about ${whole} ${whole === 1 ? 'year' : 'years'} old.`;
}
export function formatDataPointValue(point: DataPointDefinition, value: unknown): string {
  switch (point.family) {
    case 'date': return humanDate(value instanceof Date ? value : new Date(String(value))) ?? '';
    case 'money': return money(Math.round(Number(value) / 100));
    case 'dollars': return money(Math.round(Number(typeof value === 'object' && value && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : value)));
    case 'enum': return words(value);
    case 'percent': return `${(Number(typeof value === 'object' && value && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : value) * 100).toFixed(3)}%`;
    case 'number': {
      const n = Number(value);
      if (point.id === 'home.livingArea') return `${n.toLocaleString('en-US')} sq ft`;
      if (point.id === 'home.bedrooms') return `${n} ${n === 1 ? 'bedroom' : 'bedrooms'}`;
      if (point.id === 'home.bathrooms') return `${n} ${n === 1 ? 'bathroom' : 'bathrooms'}`;
      return String(value);
    }
    case 'flag': return value === true ? 'yes' : value === false ? 'no' : String(value);
    case 'tags': return (value as unknown[]).map(String).join(', ');
    default: return String(value);
  }
}
const notice = (reasonCode: string, id: string, title: string, body: string): AskOperationResult => ({
  status: 'READY_WITH_LIMITATIONS', reasonCode, parameters: { sources: [] }, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] } as AskPresentationBlock], suggestions: [],
});

async function propertyTimeZone(propertyId: string): Promise<string> {
  try { const row = await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }); return safeTimezone(row?.timezone); } catch { return 'UTC'; }
}
const ROLE_RANK: Record<string, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const RANK_ROLE = ['VIEWER', 'CONTRIBUTOR', 'OWNER'] as const;
const NUMBER_FAMILY_LABEL = (family: string, value: unknown) => formatDataPointValue({ family } as unknown as DataPointDefinition, value);

/** Shapes 3-6 (list, filter, sort/top-k, aggregate), FR-DATA-10/15. The plan is allowlisted and pure (dataPointQueryPlan); the audience floor of EVERY field the plan touches is checked here before anything is read. */
async function dataPointQueryResult(propertyId: string, role: string, plan: QueryPlan): Promise<AskOperationResult> {
  const t = plan.template;
  const touchedFields = [...new Set([...plan.touched, ...(plan.showField ? [plan.showField] : []), ...(plan.aggregate?.field ? [plan.aggregate.field] : [])])];
  let floor = ROLE_RANK[t.countFloor];
  for (const field of touchedFields) {
    const point = pointOf(t, field);
    floor = Math.max(floor, ROLE_RANK[point.audience]);
    if (!roleMayRead(role, point)) {
      const copy = audienceFloorCopy(point.audience);
      return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', copy.title, `${point.label} is only shown to ${copy.who}, so I can't filter, rank or total by it for you. Ask the home’s owner if you need it.`);
    }
  }
  if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[t.countFloor]) {
    const copy = audienceFloorCopy(t.countFloor);
    return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', copy.title, `Your ${t.plural} are only shown to ${copy.who}. Ask the home’s owner if you need them.`);
  }
  const run = await runDataPointQuery(propertyId, plan, role);
  const minRole = RANK_ROLE[floor] !== 'VIEWER' ? { minRole: RANK_ROLE[floor] } : {};
  const where = ENTITY_COPY[t.entity];
  const conditions = [...new Set(plan.predicates.map((p) => p.describe))].filter((d) => d !== 'from today');
  const qualifier = conditions.length ? ` (${conditions.join(', ')})` : '';
  const noun = (n: number) => (n === 1 ? t.singular : t.plural);
  const showFam = plan.showField ? pointOf(t, plan.showField).family : null;
  const valueText = (v: unknown) => (v === null || v === undefined ? 'not recorded' : NUMBER_FAMILY_LABEL(showFam ?? 'text', v));
  const lines: string[] = []; let title = ''; let limited = false;
  if (plan.shape === 'AGGREGATE') {
    const a = run.aggregate!;
    if (a.fn === 'COUNT') {
      title = `${run.total} ${noun(run.total)}`;
      lines.push(`You have ${run.total} ${noun(run.total)}${qualifier}.`);
      if (run.groups) lines.push(`By ${plan.aggregate!.groupBy}: ${run.groups.map((g) => `${g.key.toLowerCase().replace(/_/g, ' ')} ${g.count}`).join(', ')}.`);
    } else {
      const fam = pointOf(t, a.field!).family; const label = t.fields[a.field!].label;
      title = a.value === null ? `No ${label} recorded` : `${a.fn === 'SUM' ? 'Total' : 'Average'} ${label}: ${formatDataPointValue({ family: fam } as unknown as DataPointDefinition, a.value)}`;
      lines.push(a.value === null ? `None of your ${t.plural}${qualifier} has a ${label} recorded, so there is nothing to ${a.fn === 'SUM' ? 'add up' : 'average'}.` : `The ${a.fn === 'SUM' ? 'total' : 'average'} ${label} across your ${t.plural}${qualifier} is ${formatDataPointValue({ family: fam } as unknown as DataPointDefinition, a.value)}, from ${a.counted} ${noun(a.counted)} with a recorded value.`);
      if (run.unrecorded > 0) { limited = true; lines.push(`${run.unrecorded} ${noun(run.unrecorded)} ${run.unrecorded === 1 ? 'has' : 'have'} no ${label} recorded and ${run.unrecorded === 1 ? 'is' : 'are'} not included.`); }
    }
  } else {
    const shown = run.rows.slice(0, 10);
    const sorted = plan.shape === 'TOP_K';
    title = run.total === 0 ? `No ${t.plural} match` : sorted ? (plan.limit === 1 ? `Top ${t.singular}: ${shown[0]?.label}` : `Top ${Math.min(plan.limit, run.total)} ${t.plural}`) : `${run.total} ${noun(run.total)}${qualifier}`;
    if (run.total === 0) lines.push(`No ${t.plural}${qualifier} match.`);
    else {
      lines.push(`${sorted ? `Ranked${plan.sort ? ` by ${t.fields[plan.sort.field].label}, ${plan.sort.dir === 'desc' ? 'highest' : 'lowest'} first` : ''}: ` : `${run.total} ${noun(run.total)}${qualifier}: `}${shown.map((r) => (plan.showField ? `${r.label} (${valueText(r.value)})` : r.label)).join('; ')}${!sorted && run.total > shown.length ? `; and ${run.total - shown.length} more` : ''}.`);
    }
    if (run.unrecorded > 0) { limited = true; lines.push(`${run.unrecorded} ${noun(run.unrecorded)} ${run.unrecorded === 1 ? 'has' : 'have'} no ${t.fields[plan.sort!.field].label} recorded, so ${run.unrecorded === 1 ? 'it is' : 'they are'} not ranked.`); }
  }
  const sources = plan.shape === 'AGGREGATE' || !run.rows.length ? [{ ...sourceRef('Property', propertyId), ...minRole }] : run.rows.slice(0, 10).map((r) => ({ ...sourceRef(t.entity as CompositeSourceType, r.id), ...minRole }));
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: limited ? 'DATA_POINT_QUERY_PARTIAL' : undefined,
    // A count, total, ranking or filter changes when ANY record is added, removed, edited or stops matching, which per-row sources cannot detect. It is therefore a snapshot as of `asOf`, and is NOT composable: a composite
    // never reuses it (describeSources returns null for it); asking again re-runs the plan.
    parameters: { sources, dataPointQuery: { snapshot: true, shape: plan.shape, template: t.id, asOf: new Date().toISOString() } },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-query-summary', title, body: lines.join(' '), tone: limited ? 'CAUTION' : 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: [{ label: `Your ${t.plural}`, source: where?.record ?? t.entity, observedAt: new Date().toISOString() }] },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}


const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fmtMoney = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
/** Shapes 7-9: change over tax years, a field not recorded / not serviced since, items with no warranty. Always a snapshot (never composable), as every computed answer is. */
async function shape789Result(propertyId: string, role: string, plan: Shape789Plan): Promise<AskOperationResult> {
  for (const id of shapePointIds(plan)) {
    const p = DATA_POINT_BY_ID.get(id);
    if (p && !roleMayRead(role, p)) { const copy = audienceFloorCopy(p.audience); return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', copy.title, `${p.label} is only shown to ${copy.who}, so I can't answer this for you. Ask the home’s owner if you need it.`); }
  }
  const run = await runShape789(propertyId, plan);
  const lines: string[] = []; let title = ''; let limited = false; let evidenceLabel = 'Your inventory';
  const names = (n: number) => run.rows.slice(0, 10).map((r) => r.label).join('; ') + (run.total > 10 ? `; and ${run.total - 10} more` : '');
  if (plan.shape === 'TIME_SERIES') {
    evidenceLabel = plan.label === 'total assessed value' ? 'Your property tax assessments' : 'Your property tax bills';
    const series = run.series ?? []; const known = series.filter((x) => x.value !== null) as Array<{ id: string; year: number; value: number }>;
    if (!series.length) { title = `No ${plan.label} history recorded`; lines.push(`I don’t have any active ${plan.label} records for this home, so there is no change to show.`); }
    else if (known.length < 2) { limited = true; title = `Only ${known.length === 1 ? 'one' : 'no'} ${plan.label} on record`; lines.push(`I have ${series.length} tax ${plural(series.length, 'year', 'years')} on record${known.length === 1 ? `: ${known[0].year} was ${fmtMoney(known[0].value)}` : ' with no amount'}. I need at least two years with an amount to show a change.`); }
    else {
      const first = known[0]; const last = known[known.length - 1]; const diff = last.value - first.value; const pct = first.value ? (diff / first.value) * 100 : null;
      title = `${plan.label[0].toUpperCase()}${plan.label.slice(1)}: ${diff === 0 ? 'unchanged' : diff > 0 ? 'up' : 'down'} since ${first.year}`;
      lines.push(`${known.map((x, i) => `${x.year}: ${fmtMoney(x.value)}${i ? ` (${x.value - known[i - 1].value >= 0 ? '+' : '−'}${fmtMoney(Math.abs(x.value - known[i - 1].value))})` : ''}`).join('; ')}.`);
      lines.push(`From ${first.year} to ${last.year} it ${diff === 0 ? 'did not change' : `${diff > 0 ? 'rose' : 'fell'} by ${fmtMoney(Math.abs(diff))}${pct === null ? '' : ` (${Math.abs(pct).toFixed(1)}%)`}`}.`);
      if (known.length < series.length) { limited = true; lines.push(`${series.length - known.length} ${plural(series.length - known.length, 'year has', 'years have')} no amount recorded and ${plural(series.length - known.length, 'is', 'are')} left out.`); }
      lines.push('Based on the active tax records on file, one per tax year.');
    }
    const sources = series.length ? series.map((x) => sourceRef((plan.entity) as CompositeSourceType, x.id)) : [sourceRef('Property', propertyId)];
    return snapshotResult(sources, 'TIME_SERIES', title, lines, limited, evidenceLabel);
  }
  if (plan.shape === 'ABSENCE') {
    title = run.total === 0 ? `Every item has its ${plan.label} recorded` : `${run.total} ${plural(run.total, 'item has', 'items have')} no ${plan.label} recorded`;
    lines.push(run.total === 0 ? `None of your inventory items is missing a ${plan.label}.` : `${plan.count ? `${run.total} of your items` : names(run.total)} ${plan.count ? plural(run.total, 'has', 'have') + ` no ${plan.label} recorded.` : `${plural(run.total, 'has', 'have')} no ${plan.label} recorded.`}`);
    if (run.total > 0) lines.push('“Not recorded” means nothing is saved for it yet, not that it does not exist.');
  } else if (plan.shape === 'STALE_SERVICE') {
    const never = run.neverServiced ?? 0;
    title = run.total === 0 ? 'Nothing is overdue for service' : `${run.total} ${plural(run.total, 'item', 'items')} not serviced ${plan.cutoff ? `in over ${plan.windowText}` : 'ever'}`;
    lines.push(run.total === 0 ? `Every item with a service date was serviced ${plan.cutoff ? `within ${plan.windowText}` : 'at some point'}.` : `${plan.count ? `${run.total} of your items` : names(run.total)} ${plan.cutoff ? `${plural(run.total, 'was', 'were')} last serviced more than ${plan.windowText} ago or ${plural(run.total, 'has', 'have')} no service recorded` : `${plural(run.total, 'has', 'have')} no service recorded`}.`);
    if (plan.cutoff && never > 0) { limited = true; lines.push(`${never} of these ${plural(never, 'has', 'have')} no service date at all, so ${plural(never, 'it may', 'they may')} have been serviced without being recorded.`); }
  } else {
    const where = plan.currentOnly ? 'no current warranty' : 'no warranty record';
    title = run.total === 0 ? `Every item has a ${plan.currentOnly ? 'current ' : ''}warranty record` : `${run.total} ${plural(run.total, 'item has', 'items have')} ${where}`;
    lines.push(run.total === 0 ? `Each of your inventory items has a ${plan.currentOnly ? 'warranty that has not expired' : 'warranty record'}.` : `${plan.count ? `${run.total} of your items` : names(run.total)} ${plural(run.total, 'has', 'have')} ${where}${plan.currentOnly ? ' (none that has not expired)' : ''}.`);
    if (run.total > 0) { limited = true; lines.push('This only reflects warranties saved against an item; a warranty that is recorded without being linked to the item is not counted.'); }
  }
  const sources = run.rows.length ? run.rows.slice(0, 10).map((r) => sourceRef('InventoryItem', r.id)) : [sourceRef('Property', propertyId)];
  return snapshotResult(sources, plan.shape, title, lines, limited, evidenceLabel);
}
function snapshotResult(sources: ReturnType<typeof sourceRef>[], shape: string, title: string, lines: string[], limited: boolean, evidenceLabel: string): AskOperationResult {
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: limited ? 'DATA_POINT_QUERY_PARTIAL' : undefined,
    parameters: { sources, dataPointQuery: { snapshot: true, shape, template: 'shape789', asOf: new Date().toISOString() } },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-query-summary', title, body: lines.join(' '), tone: limited ? 'CAUTION' : 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: [{ label: evidenceLabel, source: evidenceLabel, observedAt: new Date().toISOString() }] },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}

/** One summary for a multi-part question: each facet's own answer (value, limitation or notice) in order, with the union of their sources, so no facet is silently dropped. */
function mergeFacetResults(results: AskOperationResult[]): AskOperationResult {
  const summaries = results.map((r) => r.blocks.find((b) => (b as { type: string }).type === 'SUMMARY') as { title?: string; body?: string } | undefined);
  const evidence = results.flatMap((r) => ((r.blocks.find((b) => (b as { type: string }).type === 'EVIDENCE') as { items?: unknown[] } | undefined)?.items ?? []));
  const sources = results.flatMap((r) => ((r.parameters as { sources?: Array<Record<string, unknown>> } | undefined)?.sources ?? []));
  const seen = new Set<string>(); const uniqueSources = sources.filter((x) => { const k = JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; });
  const allAnswered = results.every((r) => r.status === 'ANSWERED');
  return {
    status: allAnswered ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: results.find((r) => r.reasonCode)?.reasonCode,
    parameters: { dataPointRead: { pointIds: [...new Set(results.flatMap((r) => ((r.parameters as { dataPointRead?: { pointIds?: string[] } } | undefined)?.dataPointRead?.pointIds ?? [])))] }, sources: uniqueSources },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-summary', title: summaries.map((x) => x?.title ?? '').filter(Boolean).join(' · '), body: summaries.map((x) => x?.body ?? '').filter(Boolean).join(' '), tone: allAnswered ? 'DEFAULT' : 'CAUTION', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: evidence },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}

export async function dataPointReadResult(userId: string, propertyId: string, message: string, forcedPoint?: DataPointDefinition): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const role = String(access.role);
  // The planner is pure: the property's timezone is read here and passed in, so calendar periods (this month, next week) use the property's calendar, not UTC.
  const timeZone = await propertyTimeZone(propertyId);
  const queryOutcome = forcedPoint ? ({ kind: 'NONE' } as const) : planDataPointQuery(message, new Date(), timeZone);
  if (!forcedPoint) { const shapePlan = planShape789(message); if (shapePlan) return shape789Result(propertyId, role, shapePlan); }
  // A multi-part question ("what is my deductible and when does my insurance policy expire") has several facets: each is read through the ordinary single-point path and all are answered in one summary.
  if (!forcedPoint && queryOutcome.kind === 'NONE') {
    const facets = resolveDataPointsMulti(message);
    if (facets.length >= 2) return mergeFacetResults(await Promise.all(facets.map((facet) => dataPointReadResult(userId, propertyId, message, facet))));
  }
  if (queryOutcome.kind === 'CLARIFY') return notice(queryOutcome.reasonCode, 'data-point-query-clarify', queryOutcome.title, queryOutcome.body);
  if (queryOutcome.kind === 'PLAN') return dataPointQueryResult(propertyId, role, queryOutcome.plan);
  const point = forcedPoint ?? resolveDataPoint(message);
  if (!point) return notice('DATA_POINT_NOT_IDENTIFIED', 'data-point-unidentified', 'Which detail do you mean?', 'Tell me the detail and the item, for example “the serial number of my refrigerator” or “when my furnace was installed”.');
  if (!roleMayRead(role, point)) {
    const copy = audienceFloorCopy(point.audience);
    return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', copy.title, `${point.label} is only shown to ${copy.who}. Ask the home’s owner if you need it.`);
  }
  let readPoint = point;
  let read = await readDataPoint(propertyId, role, point, message);
  // "How old is my furnace?" with no install date recorded: the purchase date is the nearest recorded start, said as such (never presented as the install date).
  let ageFromPurchase = false;
  if (point.id === 'item.installedOn' && /\bhow old\b|\bage\b/i.test(message) && read.status === 'NOT_RECORDED') {
    const purchased = DATA_POINT_BY_ID.get('item.purchasedOn');
    if (purchased && roleMayRead(role, purchased)) { const other = await readDataPoint(propertyId, role, purchased, message); if (other.rows.some((r) => r.value !== null && r.value !== '')) { read = other; readPoint = purchased; ageFromPurchase = true; } }
  }
  // "When is my closing date?" is a buyer or a seller question: when the home has no record of the kind the wording leans to, the other kind answers it.
  const alternateId = ALTERNATE_POINT[point.id]; const alternate = alternateId ? DATA_POINT_BY_ID.get(alternateId) : undefined;
  if (read.status === 'ITEM_NOT_FOUND' && alternate && roleMayRead(role, alternate)) { const other = await readDataPoint(propertyId, role, alternate, message); if (other.status !== 'ITEM_NOT_FOUND') { read = other; readPoint = alternate; } }

  const where = ENTITY_COPY[readPoint.entity];
  if (read.status === 'AMBIGUOUS' && !read.rows.length) return notice('DATA_POINT_AMBIGUOUS', 'data-point-ambiguous', `Which ${where.singular} do you mean?`, `${read.candidateCount ?? 'More than one'} ${where.plural} could match. Name the one you mean more specifically and I’ll tell you ${readPoint.label.charAt(0).toLowerCase()}${readPoint.label.slice(1)}.`);
  if (read.status === 'AMBIGUOUS') return notice('DATA_POINT_AMBIGUOUS', 'data-point-ambiguous', `Which ${where.singular} do you mean?`, `You have more than one: ${read.rows.map((r) => r.name).join(', ')}. Name one and I’ll tell you ${readPoint.label.charAt(0).toLowerCase()}${readPoint.label.slice(1)}.`);
  if (read.status === 'ITEM_NOT_FOUND') return notice('DATA_POINT_NO_INVENTORY', 'data-point-no-inventory', where.none ?? `No ${where.plural} are recorded yet`, where.none ? 'Add it to your home record and I can tell you.' : `Add it to your home record and I can tell you its details.`);
  if (read.status === 'NO_ITEM_NAMED' && namedTaxYears(message).length) return notice('DATA_POINT_ITEM_NOT_FOUND', 'data-point-year-not-found', `No ${namedTaxYears(message)[0]} record`, `I don’t have an active ${where.singular} for that tax year. Ask without a year and I’ll use your latest.`);
  if (read.status === 'NO_ITEM_NAMED') return notice('DATA_POINT_ITEM_NOT_FOUND', 'data-point-item-not-found', `I don’t see that in your ${where.collection}`, `${readPoint.label} comes from the ${where.singular} record. Name one you have recorded, or add it first.`);
  const present = read.rows.filter((r) => r.value !== null && r.value !== '' && !(Array.isArray(r.value) && r.value.length === 0));
  if (read.status === 'NOT_RECORDED') {
    const names = read.rows.map((r) => r.name).join(' and ');
    return notice('DATA_POINT_NOT_RECORDED', 'data-point-not-recorded', `${readPoint.label.replace(/^The /, 'The ')} for your ${names} isn’t recorded`, `Nothing is saved for this yet. You can add it by editing the record, and then I can tell you.`);
  }
  // A cancelled / not-needed child is worded as a recorded past value, never as a current obligation ("is due" is not used for it).
  const sentences = present.map((r) => (r.historicalStatus ? `Your ${r.name} is ${r.historicalStatus}. Its recorded ${readPoint.family === 'date' ? 'date' : 'value'} was ${formatDataPointValue(readPoint, r.value)}.` : `Your ${r.name} ${readPoint.sentence} ${formatDataPointValue(readPoint, r.value)}.${ageSentence(readPoint, r.value, message)}`));
  if (ageFromPurchase) sentences.unshift('No install date is recorded, so this goes by the purchase date.');
  const missing = read.rows.length - present.length;
  if (missing > 0) sentences.push(`${missing === 1 ? 'One matching item has' : `${missing} matching items have`} nothing recorded for this.`);
  // Provenance/confidence limitation (FR-REC-2): a low-confidence or self-entered record is not stated plainly.
  const limits = [...new Set(present.map((r) => r.limitation).filter((x): x is string => Boolean(x)))];
  sentences.push(...limits);
  return {
    status: missing > 0 || limits.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: missing > 0 ? 'DATA_POINT_PARTIAL' : limits.length ? 'DATA_POINT_LIMITED_PROVENANCE' : undefined,
    // `dataPointRead` names the reviewed data point(s) whose VALUE this answer states, so the delivery gate can check the answer against the question without a text-similarity guess.
    parameters: { dataPointRead: { pointIds: [readPoint.id] }, sources: present.map((r) => ({ ...sourceRef((r.sourceType ?? readPoint.entity) as CompositeSourceType, r.id), ...(readPoint.audience !== 'VIEWER' ? { minRole: readPoint.audience } : {}) })) },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-summary', title: `${readPoint.label}: ${present.map((r) => formatDataPointValue(readPoint, r.value)).join('; ')}`, body: sentences.join(' '), tone: missing > 0 || limits.length ? 'CAUTION' : 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: present.map((r) => ({ label: r.name, source: `${where.record}${r.roomName ? ` (${r.roomName})` : ''}`, observedAt: null })) },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}

/** The data-point read capability, exported so it can be exercised directly. */
export const handleDataPointRead: Parameters<typeof registerCapabilityHandler>[1] = async (envelope) => {
  const requestedId = envelope.launchContext?.dataPointId;
  const forcedPoint = requestedId ? DATA_POINT_BY_ID.get(requestedId) : undefined;
  // A server-authored launch id that is no longer catalogued fails closed; it
  // is never silently reinterpreted from message text.
  if (requestedId && !forcedPoint) return notice('DATA_POINT_NOT_IDENTIFIED', 'data-point-unidentified', 'That home detail is not available', 'Ask for the detail again and I’ll use the current home-data catalogue.');
  const requiredSlots = envelope.launchContext?.dataPointRequiredSlots ?? [];
  if (requiredSlots.length) return notice('DATA_POINT_REQUIRED_SLOT_MISSING', 'data-point-required-slot', 'I need one more detail', `Tell me ${requiredSlots.join(' and ')} so I can read the right home record.`);
  // The entity a plan carried across facets and a short allowlist of parameters (an item name, a tax year) are turned into words the ordinary reader already understands, so they are matched against the home's own records under
  // this caller's authorization. Any other model-chosen key is refused, never guessed: that would recreate the raw-predicate path FR-DATA-15 forbids.
  const hinted = applyLaunchHints(envelope.message, { entityRef: envelope.launchContext?.dataPointEntityRef, parameters: envelope.launchContext?.dataPointParameters });
  if (hinted.kind === 'UNSUPPORTED') return notice('DATA_POINT_PARAMETERS_UNSUPPORTED', 'data-point-parameters-unsupported', 'I need a simpler question', 'Ask for the recorded detail directly. Filtered and grouped questions use only reviewed query templates.');
  return dataPointReadResult(envelope.userId, envelope.propertyId!, hinted.message, forcedPoint);
};
registerCapabilityHandler('data-point-read.read', handleDataPointRead);
