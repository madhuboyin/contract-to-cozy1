// BICC-ANS-001 / ANS-005 / ANS-006 / ANS-011 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md §8): every substantive answer declares the
// origin and epistemic class of what it says. The mode is assigned by the deterministic handler's operation, never by a model and never from the model's
// "requested answer-mode hint" (UND-002).
//
// v1 is deliberately conservative:
//   - CALCULATION is reserved for a transformation whose inputs are all authoritative or user-supplied. No operation declares its input provenance yet,
//     so none is labelled CALCULATION; computed and forecast results are labelled ESTIMATE, which discloses uncertainty instead of overstating certainty.
//   - USER_DOCUMENT is for answers that quote document content with a citation (BICC-3.2); document lists are HOME_RECORD.
//   - One mode per response; per-facet modes for a composed answer arrive with BICC-2.2. A mixed answer must not be collapsed or relabelled.
import type { AskOperationId } from '../askOperationRegistry';
import { getAskOperationDefinition } from '../askOperationRegistry';

export const ANSWER_MODES = ['HOME_RECORD', 'USER_DOCUMENT', 'CALCULATION', 'ESTIMATE', 'RECOMMENDATION', 'GENERAL_GUIDANCE', 'UNAVAILABLE'] as const;
export type AnswerMode = typeof ANSWER_MODES[number];

/** Operations whose result is a forecast, projection or computed figure that rests on assumed, inferred or predicted inputs (ANS-006). */
export const ESTIMATE_OPERATIONS: ReadonlySet<string> = new Set([
  'MAINTENANCE_FORECAST', 'MAINTENANCE_BUDGET_FORECAST', 'APPLIANCE_FAILURE_RISK', 'CAPITAL_RESERVE_PLAN', 'CAPITAL_ITEM_FUNDING_GOAL', 'ITEM_REPLACEMENT_COST',
  'SAVINGS_OPPORTUNITIES', 'OWNERSHIP_COSTS', 'HOME_UPGRADE_SCENARIOS', 'PROPERTY_TAX_APPEAL_READINESS',
]);

const UNAVAILABLE_STATUSES = new Set(['UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'NOT_APPLICABLE', 'EXPIRED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED']);
const SETTLED_STATUSES = new Set(['ANSWERED', 'READY_WITH_LIMITATIONS', 'COMPLETED']);

export function deriveAnswerMode(input: { status: string; operationId: AskOperationId | null; hasProperty: boolean; reasonCode?: string | null }): AnswerMode | null {
  // A social reply (BICC-UX-010) states nothing about the home, so it declares no mode: labelling "hello" as a home record would be false.
  if (input.reasonCode === 'ASK_SOCIAL_TURN') return null;
  if (UNAVAILABLE_STATUSES.has(input.status)) return 'UNAVAILABLE';
  if (!SETTLED_STATUSES.has(input.status) || !input.operationId) return null;
  const definition = getAskOperationDefinition(input.operationId);
  // An explicitly declared estimate wins over its family: a plan built on assumed inputs discloses its uncertainty rather than reading as a bare recommendation.
  if (definition.family !== 'COMMAND' && ESTIMATE_OPERATIONS.has(input.operationId)) return 'ESTIMATE';
  switch (definition.family) {
    case 'COMMAND': return null; // a preview or receipt is not an answer facet
    case 'GENERAL_HOME_GUIDANCE': return input.hasProperty ? 'HOME_RECORD' : 'GENERAL_GUIDANCE';
    case 'DECISION_ANALYSIS': return 'RECOMMENDATION';
    case 'UNSAFE_OR_RESTRICTED': case 'OUT_OF_SCOPE': return 'UNAVAILABLE';
    default: return ESTIMATE_OPERATIONS.has(input.operationId) ? 'ESTIMATE' : 'HOME_RECORD';
  }
}

/** One facet of a composed answer and the mode of its own operation (BICC-ANS-001/002): a mixed answer keeps each facet's label and is never collapsed to one. */
export interface FacetMode {
  /** Every block of this facet has an id starting with this prefix (the delivery projection's `sN-`). */ blockIdPrefix: string; operationId: string; mode: AnswerMode | null; clause: string;
  /** The oldest KNOWN observation time among this facet's own evidence (ANS-002: each facet keeps its own freshness); null when none is known. An unknown time is never replaced by the request time. */
  asOf: string | null;
}

/** The oldest known, valid observation time in a section's provenance, or null. */
function facetAsOf(provenance: unknown): string | null {
  if (!Array.isArray(provenance)) return null;
  const known = provenance.map((item) => (item as { observedAt?: unknown })?.observedAt).filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))).sort();
  return known.length ? known[0] : null;
}

/**
 * The per-facet modes of a stored composite, in delivery order. A section's mode is derived from its own operation and status exactly as a single answer's is.
 * Fewer than two sections is not a mixed answer, so no facet modes are produced and the response-level mode stands.
 */
export function facetModesOf(composite: unknown): FacetMode[] {
  const sections = composite && typeof composite === 'object' ? (composite as { sections?: unknown }).sections : null;
  if (!Array.isArray(sections) || sections.length < 2) return [];
  const modes: FacetMode[] = [];
  sections.forEach((section, index) => {
    const entry = section as { operationId?: unknown; status?: unknown; reasonCode?: unknown; clause?: unknown; provenance?: unknown };
    if (typeof entry?.operationId !== 'string' || typeof entry.status !== 'string') return;
    let mode: AnswerMode | null = null;
    try { mode = deriveAnswerMode({ status: entry.status, operationId: entry.operationId as AskOperationId, hasProperty: true, reasonCode: typeof entry.reasonCode === 'string' ? entry.reasonCode : null }); } catch { mode = null; }
    modes.push({ blockIdPrefix: `s${index + 1}-`, operationId: entry.operationId, mode, clause: typeof entry.clause === 'string' ? entry.clause.slice(0, 200) : '', asOf: facetAsOf(entry.provenance) });
  });
  return modes;
}
