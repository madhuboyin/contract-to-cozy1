// DATA_POINT_READ (reliability FRD D12, Phase 1b): "what is the serial number of my fridge", "when was my furnace installed", "what did I pay for my dryer".
// A STANDARD, read-only fact read through the one allowlisted template in dataPoint/dataPointReader.ts. No side effects; a value that is not recorded is said plainly,
// with the authorised way to add it, and never guessed (FR-REC-2 MISSING_RECORD_DATA).
import { sourceRef, type CompositeSourceType } from '../composition/sourceAuthorization';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ALTERNATE_POINT, audienceFloorCopy, DATA_POINT_BY_ID, resolveDataPoint, roleMayRead, type DataPointDefinition } from '../dataPoint/dataPointCatalogue';
import { namedTaxYears, readDataPoint } from '../dataPoint/dataPointReader';
import { planDataPointQuery, pointOf, type QueryPlan } from '../dataPoint/dataPointQueryPlan';
import { prisma } from '../../../lib/prisma';
import { safeTimezone } from '../support/propertyContext';
import { runDataPointQuery } from '../dataPoint/dataPointQueryRunner';

const ENTITY_COPY: Record<string, { plural: string; singular: string; collection: string; record: string; none?: string }> = {
  InventoryItem: { plural: 'items', singular: 'inventory', collection: 'inventory', record: 'Home inventory record' },
  Warranty: { plural: 'warranties', singular: 'warranty', collection: 'warranties', record: 'Warranty record' },
  InsurancePolicy: { plural: 'insurance policies', singular: 'insurance policy', collection: 'insurance policies', record: 'Insurance policy record' },
  PropertyMaintenanceTask: { plural: 'maintenance tasks', singular: 'maintenance task', collection: 'maintenance tasks', record: 'Maintenance task record' },
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
export function formatDataPointValue(point: DataPointDefinition, value: unknown): string {
  switch (point.family) {
    case 'date': return humanDate(value instanceof Date ? value : new Date(String(value))) ?? '';
    case 'money': return money(Math.round(Number(value) / 100));
    case 'dollars': return money(Math.round(Number(typeof value === 'object' && value && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : value)));
    case 'enum': return words(value);
    case 'percent': return `${(Number(typeof value === 'object' && value && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : value) * 100).toFixed(3)}%`;
    case 'number': return String(value);
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
  const run = await runDataPointQuery(propertyId, plan);
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

export async function dataPointReadResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const role = String(access.role);
  // The planner is pure: the property's timezone is read here and passed in, so calendar periods (this month, next week) use the property's calendar, not UTC.
  const timeZone = await propertyTimeZone(propertyId);
  const queryOutcome = planDataPointQuery(message, new Date(), timeZone);
  if (queryOutcome.kind === 'CLARIFY') return notice(queryOutcome.reasonCode, 'data-point-query-clarify', queryOutcome.title, queryOutcome.body);
  if (queryOutcome.kind === 'PLAN') return dataPointQueryResult(propertyId, role, queryOutcome.plan);
  const point = resolveDataPoint(message);
  if (!point) return notice('DATA_POINT_NOT_IDENTIFIED', 'data-point-unidentified', 'Which detail do you mean?', 'Tell me the detail and the item, for example “the serial number of my refrigerator” or “when my furnace was installed”.');
  if (!roleMayRead(role, point)) {
    const copy = audienceFloorCopy(point.audience);
    return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', copy.title, `${point.label} is only shown to ${copy.who}. Ask the home’s owner if you need it.`);
  }
  let readPoint = point;
  let read = await readDataPoint(propertyId, role, point, message);
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
  const sentences = present.map((r) => (r.historicalStatus ? `Your ${r.name} is ${r.historicalStatus}. Its recorded ${readPoint.family === 'date' ? 'date' : 'value'} was ${formatDataPointValue(readPoint, r.value)}.` : `Your ${r.name} ${readPoint.sentence} ${formatDataPointValue(readPoint, r.value)}.`));
  const missing = read.rows.length - present.length;
  if (missing > 0) sentences.push(`${missing === 1 ? 'One matching item has' : `${missing} matching items have`} nothing recorded for this.`);
  // Provenance/confidence limitation (FR-REC-2): a low-confidence or self-entered record is not stated plainly.
  const limits = [...new Set(present.map((r) => r.limitation).filter((x): x is string => Boolean(x)))];
  sentences.push(...limits);
  return {
    status: missing > 0 || limits.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: missing > 0 ? 'DATA_POINT_PARTIAL' : limits.length ? 'DATA_POINT_LIMITED_PROVENANCE' : undefined,
    parameters: { sources: present.map((r) => ({ ...sourceRef((r.sourceType ?? readPoint.entity) as CompositeSourceType, r.id), ...(readPoint.audience !== 'VIEWER' ? { minRole: readPoint.audience } : {}) })) },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-summary', title: `${readPoint.label}: ${present.map((r) => formatDataPointValue(readPoint, r.value)).join('; ')}`, body: sentences.join(' '), tone: missing > 0 || limits.length ? 'CAUTION' : 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: present.map((r) => ({ label: r.name, source: `${where.record}${r.roomName ? ` (${r.roomName})` : ''}`, observedAt: null })) },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}

registerCapabilityHandler('data-point-read.read', async (envelope) => dataPointReadResult(envelope.userId, envelope.propertyId!, envelope.message));
