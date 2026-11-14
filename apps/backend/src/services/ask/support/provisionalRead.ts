// FR-GATE (provisional reads): an uncertified deterministic rule may START a harmless read, so the READ's result must earn delivery on its own evidence. This is the grounded relevance check for the data-point read: it compares what the
// answer says it read with what the question asked for, deterministically, from the reviewed catalogue. It replaces the text-similarity relevance guess for these reads and grants NOTHING else: no canonical bypass, no skipped validation.
// An answer is delivered when (1) it states the value of exactly the data point(s) the question names, from a recorded source, or (2) it is an honest limitation that states no value (not recorded, which one, restricted, a simpler
// question needed). Anything else, a value for a different point or a value with no source, is not grounded and is withheld.
import type { AskOperationResult } from '../askOperationRegistry';
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
