// Composition FRD §4.2: decide whether a typed message is a composed (two-component) question, before anything runs. Pure: routing, safety and the
// operation registry are the only inputs, so every rule is tested without a database. Nothing here executes an operation.
import { COMPOSITION_PURE_VARIANTS, getAskOperationDefinition, isReadOnlyOperation, resolveAskOperation, type AskOperationId } from '../askOperationRegistry';
import { resolveAskRoutingCascade } from '../askRoutingCascade';
import { clarificationLabelFor } from '../support/clarificationLabels';
import { operationCoversClause, resolveClauseOperation, splitQuestionClauses, standalone, subjectOf } from '../support/alsoAnswer';
import { parseTargetDate } from '../support/targetDate';
import { COVERAGE_DECLARATIONS, coverageSkips } from './quantities';
import { MAX_ASK_CHILD_EXECUTIONS } from '../../../productFramework/ask/ask.contract';

/** Understanding reliability FRD D4/Amendment A (FR-DEC-1): up to six facets are composed; more are never silently truncated. */
export const MAX_COMPOSED_COMPONENTS = MAX_ASK_CHILD_EXECUTIONS;
const MIN_CLAUSE_CONFIDENCE = 0.85;

export interface ComposedClause {
  clause: string;
  operationId: AskOperationId;
  confidence: number;
  /** Present only for a validated model-selected DATA_POINT target. */
  dataPointId?: string;
  /** Stable facet ids of earlier clauses this clause depends on. */
  facetId?: string;
  dependsOn?: readonly string[];
}
/** FR-DEC-4a: a part that was NOT run. It is named in the answer with the reason, never dropped and never guessed. */
export interface ClarificationOption { operationId: AskOperationId; label: string }
/** `NEEDS_CLARIFICATION` (FR-FACET-9b): the part is plausibly more than one thing, so it is asked about inline (one question, up to three options) beside the parts that were answered, instead of being dropped. */
export interface DeferredClause { clause: string; reason: 'NOT_ROUTED' | 'LOW_CONFIDENCE' | 'NOT_ELIGIBLE' | 'NOT_COMPOSABLE' | 'OVER_LIMIT' | 'NEEDS_CLARIFICATION'; operationId: AskOperationId | null; options?: readonly ClarificationOption[] }

const MAX_CLARIFICATION_OPTIONS = 3;
/** The read operations a clause could plausibly mean, when the router itself could not choose between two or more (never fewer than two, never a write, never an operation this home cannot run). */
function clarificationOptionsFor(clause: string, eligible: ReadonlySet<AskOperationId> | undefined): ClarificationOption[] {
  const decision = resolveAskRoutingCascade(clause);
  if (decision.stage !== 'CLARIFICATION' || decision.candidates.length < 2) return [];
  const options: ClarificationOption[] = [];
  for (const candidate of decision.candidates) {
    const id = candidate.operationId as AskOperationId;
    if (id === 'GROUNDED_GUIDANCE' || (eligible && !eligible.has(id)) || !isReadOnlyOperation(id) || options.some((o) => o.operationId === id)) continue;
    options.push({ operationId: id, label: clarificationLabelFor(id) });
    if (options.length === MAX_CLARIFICATION_OPTIONS) break;
  }
  return options.length >= 2 ? options : [];
}

export type DecompositionOutcome =
  | { kind: 'SINGLE'; reason: 'ONE_CLAUSE' | 'FULL_MESSAGE_GATE' | 'SAME_OPERATION' }
  | { kind: 'NOT_COMPOSED'; reason: 'TOO_MANY_CLAUSES' | 'CLAUSE_NOT_COMPOSABLE' | 'CLAUSE_NOT_ELIGIBLE' | 'LOW_CONFIDENCE'; detail: string; clauseCount: number }
  | { kind: 'COMPOSE'; clauses: ComposedClause[]; skipped: ComposedClause[]; deferred: DeferredClause[] };

export interface DecomposeOptions {
  /** Operations this user and property may run (the existing discoverability set). Omitted means every registered operation. */
  eligibleOperationIds?: ReadonlySet<AskOperationId>;
  now?: Date;
}

/**
 * FR-DEC-0: the safety, restricted-request and boundary interception runs on the COMPLETE original message first. A safety result governs the whole turn
 * (the single-operation path handles it) and no clause is routed. Only after that gate passes are clauses split and routed individually.
 */
export function decomposeForComposition(message: string, options: DecomposeOptions = {}): DecompositionOutcome {
  const whole = resolveAskRoutingCascade(message);
  // Used only for declared coverage and clause inheritance; it does not admit
  // or execute the raw deterministic match.
  const wholeOperationId = resolveAskOperation(message).operationId;
  if (whole.stage === 'SAFETY') return { kind: 'SINGLE', reason: 'FULL_MESSAGE_GATE' };

  const clauses = splitQuestionClauses(message);
  if (clauses.length < 2) return { kind: 'SINGLE', reason: 'ONE_CLAUSE' };
  // FR-FACET-2 / FR-DEC-1: the first MAX_COMPOSED_COMPONENTS parts are answered; every part beyond them is named as not answered (never silently truncated).
  const overflow = clauses.splice(MAX_COMPOSED_COMPONENTS);
  const overLimit: DeferredClause[] = overflow.map((part) => ({ clause: part.charAt(0).toUpperCase() + part.slice(1) + (part.endsWith('?') ? '' : '?'), reason: 'OVER_LIMIT', operationId: null }));

  const subject = subjectOf(clauses[0]);
  const date = parseTargetDate(clauses[0], options.now);
  const routed: ComposedClause[] = [];
  const definitions: Array<ReturnType<typeof getAskOperationDefinition>> = [];
  const deferred: DeferredClause[] = [...overLimit];
  const tail = (clause: string) => clause.charAt(0).toUpperCase() + clause.slice(1) + (clause.endsWith('?') ? '' : '?');
  const refusals: Array<{ reason: 'CLAUSE_NOT_COMPOSABLE' | 'CLAUSE_NOT_ELIGIBLE' | 'LOW_CONFIDENCE'; detail: string }> = [];
  const refuse = (reason: (typeof refusals)[number]['reason'], detail: string) => { refusals.push({ reason, detail }); };
  for (const part of clauses) {
    // FR-DEC-5 (interim, until Phase 3 slots): a later part's referent comes from the first part.
    const spoken = standalone(part, subject);
    const clause = date && !parseTargetDate(spoken, options.now) && /\b(?:cost|price|how much)\b/i.test(spoken) ? `${spoken} ${date.label}` : spoken;
    const resolved = resolveClauseOperation(clause) ?? (
      wholeOperationId === 'CAPITAL_ITEM_FUNDING_GOAL'
      && /\b(?:save|saving|set aside|put aside|per month|each month|a month)\b/i.test(clause)
        ? { operationId: 'CAPITAL_ITEM_FUNDING_GOAL' as const, family: 'DECISION_ANALYSIS', confidence: MIN_CLAUSE_CONFIDENCE }
        : null
    );
    if (!resolved) { refuse('CLAUSE_NOT_COMPOSABLE', `“${part}” did not route to a known read.`); const choices = clarificationOptionsFor(clause, options.eligibleOperationIds); deferred.push(choices.length ? { clause: tail(clause), reason: 'NEEDS_CLARIFICATION', operationId: null, options: choices } : { clause: tail(clause), reason: 'NOT_ROUTED', operationId: null }); continue; }
    // FR-DEC-3: confident routing to an operation on the composable allowlist, eligible for this user and property.
    if (resolved.confidence < MIN_CLAUSE_CONFIDENCE) { refuse('LOW_CONFIDENCE', `“${part}” routed with low confidence.`); const choices = clarificationOptionsFor(clause, options.eligibleOperationIds); deferred.push(choices.length ? { clause: tail(clause), reason: 'NEEDS_CLARIFICATION', operationId: resolved.operationId, options: choices } : { clause: tail(clause), reason: 'LOW_CONFIDENCE', operationId: resolved.operationId }); continue; }
    // D17: an operation that persists runs inside a composed answer as its pure variant. Eligibility is judged on the operation the homeowner asked for.
    const requestedOperationId = resolved.operationId;
    const operationId = COMPOSITION_PURE_VARIANTS[requestedOperationId] ?? requestedOperationId;
    const definition = getAskOperationDefinition(operationId);
    if (options.eligibleOperationIds && !options.eligibleOperationIds.has(requestedOperationId)) {
      refuse('CLAUSE_NOT_ELIGIBLE', `${resolved.operationId} is not available for this home.`); deferred.push({ clause: tail(clause), reason: 'NOT_ELIGIBLE', operationId: resolved.operationId }); continue;
    }
    // FR-FACET-5/6: a detail question with no item of its own is about the item the first part named ("what is the model number" -> "... for my water heater"), so every
    // facet reads the same resolved entity and the handler never has to guess.
    const noun = subject ? subject.replace(/^(?:my|our)\s+/, '').toLowerCase() : null;
    const aboutSubject = operationId === 'DATA_POINT_READ' && subject && noun && !clause.toLowerCase().includes(noun) ? `${clause.replace(/\?+$/, '')} for ${subject}` : clause;
    routed.push({ clause: tail(aboutSubject), operationId, confidence: resolved.confidence });
    definitions.push(definition);
  }

  // FR-DEC-6: clauses covered by the whole-message operation are one component.
  // This includes the funding goal, whose contract already states the dated
  // replacement cost as well as the reserve gap and monthly amount.
  // Coverage is a declaration lookup, not a routing claim. Use the registry's
  // raw match so fast-path demotion does not turn one handler that covers two
  // clauses into two child executions.
  if (!deferred.length && routed.every((entry) => operationCoversClause(wholeOperationId, entry.operationId, entry.clause))) {
    return { kind: 'SINGLE', reason: 'SAME_OPERATION' };
  }

  // A part that routes to an operation that is not a composable read (a decision that persists, or a write) is NOT run here (FR-DEC-4a, FR-DEC-0): it is named.
  const composable: ComposedClause[] = [];
  routed.forEach((entry, index) => {
    if (definitions[index].composableRead) composable.push(entry);
    else { refuse('CLAUSE_NOT_COMPOSABLE', `“${entry.clause}” needs ${entry.operationId}, which is not a composable read.`); deferred.push({ clause: entry.clause, reason: 'NOT_COMPOSABLE', operationId: entry.operationId }); }
  });
  // FR-DEC-4a: partial execution needs at least two parts that can run together; with fewer, the single-operation path answers and notes what it left out.
  if (composable.length < 2) {
    if (overLimit.length && !refusals.length) return { kind: 'NOT_COMPOSED', reason: 'TOO_MANY_CLAUSES', detail: `${clauses.length + overflow.length} parts were seen; at most ${MAX_COMPOSED_COMPONENTS} are composed.`, clauseCount: clauses.length + overflow.length };
    if (refusals.length) return { kind: 'NOT_COMPOSED', reason: refusals[0].reason, detail: refusals[0].detail, clauseCount: clauses.length + overflow.length };
    return { kind: 'SINGLE', reason: 'SAME_OPERATION' };
  }

  // FR-DEC-7: contractual coverage only; a part an earlier kept part already states is skipped.
  const skipped: ComposedClause[] = [];
  const kept: ComposedClause[] = [];
  for (const entry of composable) {
    if (kept.some((earlier) => coverageSkips(earlier.operationId, entry.clause))) skipped.push(entry); else kept.push(entry);
  }
  void COVERAGE_DECLARATIONS;
  if (kept.length < 2) return { kind: 'SINGLE', reason: 'SAME_OPERATION' };
  return { kind: 'COMPOSE', clauses: kept, skipped, deferred };
}
