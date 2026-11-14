// FR-GATE (provisional reads): an uncertified deterministic rule may START a harmless read, so the READ's result must earn delivery on its own evidence. This is the grounded relevance check for the data-point read: it compares what the
// answer says it read with what the question asked for, deterministically, from the reviewed catalogue. It replaces the text-similarity relevance guess for these reads and grants NOTHING else: no canonical bypass, no skipped validation.
// An answer is delivered when (1) it states the value of exactly the data point(s) the question names, from a recorded source, or (2) it is an honest limitation that states no value (not recorded, which one, restricted, a simpler
// question needed). Anything else, a value for a different point or a value with no source, is not grounded and is withheld.
import type { AskOperationId, AskOperationResult } from '../askOperationRegistry';
import { matchesOperationAnswerContract } from '../answerContract/operationAnswerContract';
import { ALTERNATE_POINT, resolveDataPoint, resolveDataPointsMulti } from '../dataPoint/dataPointCatalogue';
import { planDataPointQuery } from '../dataPoint/dataPointQueryPlan';
import { planShape789 } from '../dataPoint/dataPointShapes789';

export interface GroundedReadVerdict { readonly outcome: 'PASS' | 'FAIL'; readonly reasonCodes: readonly string[] }

/** Results of the data-point read that state no value: the honest limitations and the questions it asks back. */
export const DATA_POINT_LIMITATION_REASONS: ReadonlySet<string> = new Set([
  'DATA_POINT_NOT_RECORDED', 'DATA_POINT_ITEM_NOT_FOUND', 'DATA_POINT_NO_INVENTORY', 'DATA_POINT_AMBIGUOUS', 'DATA_POINT_NOT_IDENTIFIED', 'DATA_POINT_RESTRICTED',
  'DATA_POINT_PARAMETERS_UNSUPPORTED', 'DATA_POINT_REQUIRED_SLOT_MISSING', 'DATA_POINT_QUERY_AMBIGUOUS_KIND', 'DATA_POINT_QUERY_MEASURE_REQUIRED', 'DATA_POINT_QUERY_TOO_MANY_FILTERS',
]);

/** The data points a question names: the single resolved point, every point of a multi-part question, and the alternate a point may fall back to. */
export function pointsNamedBy(question: string): Set<string> {
  const named = new Set<string>();
  const single = resolveDataPoint(question); if (single) named.add(single.id);
  for (const point of resolveDataPointsMulti(question)) named.add(point.id);
  for (const id of [...named]) { const alternate = ALTERNATE_POINT[id]; if (alternate) named.add(alternate); }
  return named;
}

export function groundedReadVerdict(question: string, result: AskOperationResult): GroundedReadVerdict {
  const parameters = (result.parameters ?? {}) as { dataPointRead?: { pointIds?: string[] }; dataPointQuery?: { template?: string }; sources?: unknown[] };
  const pointIds = parameters.dataPointRead?.pointIds ?? [];
  // 1. a value: it must be the value of a point the question names, and it must come from a recorded source
  if (pointIds.length) {
    const named = pointsNamedBy(question);
    const strays = pointIds.filter((id) => !named.has(id));
    if (strays.length) return { outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', 'ANSWERED_A_DIFFERENT_DATA_POINT'] };
    if (!Array.isArray(parameters.sources) || parameters.sources.length === 0) return { outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', 'NO_SOURCE_RECORD'] };
    return { outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_GROUNDED'] };
  }
  // 2. a computed answer (list, count, total, ranking, absence, change over time): the question must itself plan to the same template
  if (parameters.dataPointQuery?.template) {
    const template = parameters.dataPointQuery.template;
    const shape = planShape789(question);
    const plan = planDataPointQuery(question);
    const planned = template === 'shape789' ? shape !== null : plan.kind === 'PLAN' && plan.plan.template.id === template;
    return planned ? { outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_GROUNDED'] } : { outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', 'QUESTION_DOES_NOT_PLAN_TO_THIS_QUERY'] };
  }
  // 3. an honest limitation: it states no value, so it can only be a reason, a question back, or a boundary
  if (result.reasonCode && DATA_POINT_LIMITATION_REASONS.has(result.reasonCode)) return { outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_HONEST_LIMITATION'] };
  return { outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', 'NO_GROUNDING_EVIDENCE'] };
}

// ---- MAINTENANCE_STATUS (slice 2) ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const MAINTENANCE_TOPIC = /\b(?:maintenance|maintain|tasks?|chores?|upkeep|to-?dos?|checklist|inspect(?:ion)?s?|service[sd]?|seasonal|winterize|filters?)\b/i;
// Another operation owns the question when it is about one of these: a misrouted match is withheld instead of answered with a maintenance list.
const OTHER_OWNER = /\b(?:warrant(?:y|ies)|polic(?:y|ies)|insurance|claims?|tax(?:es)?|assess(?:ed|ment)|mortgage|refinanc\w*|closing|buyer|seller|sell(?:ing)?|quotes?|bids?|permits?|inspection report|reserve|appraisal|hoa|recalls?)\b/i;
const ASKS_OVERDUE = /\b(?:overdue|past due|late|behind)\b/i;
const ASKS_DUE_SOON = /\b(?:due soon|coming up|upcoming|next 30 days)\b/i;
const ASKS_COMPLETED = /\b(?:completed|done|finished|did i (?:complete|do|finish)|history)\b/i;

/** The sections the answer really shows, from its own grouped list: the view the handler applied, observed rather than re-derived. */
function appliedSections(result: AskOperationResult): string[] {
  const list = result.blocks.find((block) => (block as { id?: string }).id === 'maintenance-groups') as { sections?: Array<{ id?: string }> } | undefined;
  return (list?.sections ?? []).map((section) => String(section.id ?? ''));
}

/**
 * Grounded delivery check for the maintenance status read: (1) the question is about maintenance and no other operation owns it, (2) the answer is a variant a real-path execution produced (the runtime contract is built from
 * that evidence), and (3) a view the homeowner named (overdue, due soon, completed) is the view that was applied, so a filtered question is never answered with an unfiltered list or the other way round.
 */
export function groundedMaintenanceVerdict(question: string, result: AskOperationResult): GroundedReadVerdict {
  const fail = (code: string): GroundedReadVerdict => ({ outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', code] });
  if (!MAINTENANCE_TOPIC.test(question) && !(ASKS_OVERDUE.test(question) || ASKS_DUE_SOON.test(question))) return fail('QUESTION_NOT_ABOUT_MAINTENANCE');
  if (OTHER_OWNER.test(question)) return fail('ANOTHER_OPERATION_OWNS_THE_QUESTION');
  if (MAINTENANCE_COMMAND.test(question) && !ASKS_COMPLETED.test(question)) return fail('QUESTION_IS_A_COMMAND');
  if (MAINTENANCE_OTHER_JOB.test(question)) return fail('ANOTHER_OPERATION_OWNS_THE_QUESTION');
  if (!matchesOperationAnswerContract('MAINTENANCE_STATUS', result)) return fail('ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  const sections = appliedSections(result); const only = (allowed: string[]) => sections.every((id) => allowed.includes(id));
  const overdue = ASKS_OVERDUE.test(question); const soon = ASKS_DUE_SOON.test(question); const completed = ASKS_COMPLETED.test(question);
  if (overdue && !soon && !completed && !only(['overdue', 'open'])) return fail('VIEW_DOES_NOT_MATCH_OVERDUE_QUESTION');
  if (soon && !overdue && !completed && !only(['due', 'due-soon', 'open'])) return fail('VIEW_DOES_NOT_MATCH_DUE_SOON_QUESTION');
  if (completed && !overdue && !soon && !(sections.includes('completed') || only(['open']))) return fail('VIEW_DOES_NOT_MATCH_COMPLETED_QUESTION');
  if (!overdue && !soon && !completed && sections.length === 1 && ['overdue', 'due', 'due-soon', 'completed'].includes(sections[0])) return fail('FILTERED_VIEW_FOR_AN_UNFILTERED_QUESTION');
  return { outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_GROUNDED'] };
}

// A rule that matched a COMMAND ("snooze that task"), a cost or forecast question or a snoozed-items question is not asking for the maintenance list, whatever word it shares with it. These are checked BEFORE the read runs (the
// cascade does not start it) and again at delivery, so a broad rule never turns a different request into a maintenance answer.
const MAINTENANCE_COMMAND = /\b(?:snooze|snoozed|defer|postpone|reschedule|move|push back|mark|complete|finish|add|create|remind|schedule|delete|remove|cancel|resolve|dismiss|reopen|accept)\b/i;
const MAINTENANCE_OTHER_JOB = /\b(?:cost|costs|estimate|estimates|budget|forecast|predict|spend|price|how much|expect)\b/i;
function maintenanceRouteGuard(message: string): boolean {
  if (MAINTENANCE_COMMAND.test(message) && !ASKS_COMPLETED.test(message)) return false;
  return !MAINTENANCE_OTHER_JOB.test(message) && !OTHER_OWNER.test(message);
}

// ---- which operations may be tried provisionally --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type GroundedReadCheck = (question: string, result: AskOperationResult) => GroundedReadVerdict;
/** FR-GATE-8: an operation may be tried provisionally only together with a grounded delivery check. This table IS the allowlist (fastPathCertificates derives PROVISIONAL_READ_OPERATIONS from it). */
export const GROUNDED_READ_CHECKS: Readonly<Partial<Record<AskOperationId, GroundedReadCheck>>> = Object.freeze({ DATA_POINT_READ: groundedReadVerdict, MAINTENANCE_STATUS: groundedMaintenanceVerdict });
export const hasGroundedReadCheck = (operationId: AskOperationId): boolean => operationId in GROUNDED_READ_CHECKS;
/** Checked before a provisional read is started: false means the rule's match is not the request this read answers, so the turn keeps the strict path. */
export const GROUNDED_READ_ROUTE_GUARDS: Readonly<Partial<Record<AskOperationId, (message: string) => boolean>>> = Object.freeze({ MAINTENANCE_STATUS: maintenanceRouteGuard });
export const provisionalRouteAllowed = (operationId: AskOperationId, message: string): boolean => (GROUNDED_READ_ROUTE_GUARDS[operationId]?.(message) ?? true);
export function groundedVerdictFor(operationId: AskOperationId, question: string, result: AskOperationResult): GroundedReadVerdict {
  const check = GROUNDED_READ_CHECKS[operationId];
  return check ? check(question, result) : { outcome: 'FAIL', reasonCodes: ['PROVISIONAL_READ_NOT_GROUNDED', 'NO_GROUNDED_CHECK_FOR_OPERATION'] };
}
