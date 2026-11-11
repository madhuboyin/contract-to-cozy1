// Composition FRD §4.2: decide whether a typed message is a composed (two-component) question, before anything runs. Pure: routing, safety and the
// operation registry are the only inputs, so every rule is tested without a database. Nothing here executes an operation.
import { getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { resolveAskRoutingCascade } from '../askRoutingCascade';
import { operationCoversClause, resolveClauseOperation, splitQuestionClauses, standalone, subjectOf } from '../support/alsoAnswer';
import { parseTargetDate } from '../support/targetDate';
import { COVERAGE_DECLARATIONS, coverageSkips } from './quantities';

export const MAX_COMPOSED_COMPONENTS = 2;
const MIN_CLAUSE_CONFIDENCE = 0.85;

export interface ComposedClause { clause: string; operationId: AskOperationId; confidence: number }

export type DecompositionOutcome =
  | { kind: 'SINGLE'; reason: 'ONE_CLAUSE' | 'FULL_MESSAGE_GATE' | 'SAME_OPERATION' }
  | { kind: 'NOT_COMPOSED'; reason: 'TOO_MANY_CLAUSES' | 'CLAUSE_NOT_COMPOSABLE' | 'CLAUSE_NOT_ELIGIBLE' | 'LOW_CONFIDENCE'; detail: string; clauseCount: number }
  | { kind: 'COMPOSE'; clauses: ComposedClause[]; skipped: ComposedClause[] };

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
  if (whole.stage === 'SAFETY') return { kind: 'SINGLE', reason: 'FULL_MESSAGE_GATE' };

  const clauses = splitQuestionClauses(message);
  if (clauses.length < 2) return { kind: 'SINGLE', reason: 'ONE_CLAUSE' };
  // FR-DEC-1: more than the cap is not composed and never silently truncated.
  if (clauses.length > MAX_COMPOSED_COMPONENTS) {
    return { kind: 'NOT_COMPOSED', reason: 'TOO_MANY_CLAUSES', detail: `${clauses.length} parts were seen; at most ${MAX_COMPOSED_COMPONENTS} are composed.`, clauseCount: clauses.length };
  }

  const subject = subjectOf(clauses[0]);
  const date = parseTargetDate(clauses[0], options.now);
  const routed: ComposedClause[] = [];
  const definitions: Array<ReturnType<typeof getAskOperationDefinition>> = [];
  for (const part of clauses) {
    // FR-DEC-5 (interim, until Phase 3 slots): a later part's referent comes from the first part.
    const spoken = standalone(part, subject);
    const clause = date && !parseTargetDate(spoken, options.now) && /\b(?:cost|price|how much)\b/i.test(spoken) ? `${spoken} ${date.label}` : spoken;
    const resolved = resolveClauseOperation(clause) ?? (
      whole.operation.operationId === 'CAPITAL_ITEM_FUNDING_GOAL'
      && /\b(?:save|saving|set aside|put aside|per month|each month|a month)\b/i.test(clause)
        ? { operationId: 'CAPITAL_ITEM_FUNDING_GOAL' as const, family: 'DECISION_ANALYSIS', confidence: MIN_CLAUSE_CONFIDENCE }
        : null
    );
    if (!resolved) return { kind: 'NOT_COMPOSED', reason: 'CLAUSE_NOT_COMPOSABLE', detail: `“${part}” did not route to a known read.`, clauseCount: clauses.length };
    // FR-DEC-3: confident routing to an operation on the composable allowlist, eligible for this user and property.
    if (resolved.confidence < MIN_CLAUSE_CONFIDENCE) return { kind: 'NOT_COMPOSED', reason: 'LOW_CONFIDENCE', detail: `“${part}” routed with low confidence.`, clauseCount: clauses.length };
    const definition = getAskOperationDefinition(resolved.operationId);
    if (options.eligibleOperationIds && !options.eligibleOperationIds.has(resolved.operationId)) {
      return { kind: 'NOT_COMPOSED', reason: 'CLAUSE_NOT_ELIGIBLE', detail: `${resolved.operationId} is not available for this home.`, clauseCount: clauses.length };
    }
    routed.push({ clause: clause.charAt(0).toUpperCase() + clause.slice(1) + (clause.endsWith('?') ? '' : '?'), operationId: resolved.operationId, confidence: resolved.confidence });
    definitions.push(definition);
  }

  // FR-DEC-6: clauses covered by the whole-message operation are one component.
  // This includes the funding goal, whose contract already states the dated
  // replacement cost as well as the reserve gap and monthly amount.
  const wholeOperationId = whole.operation.operationId;
  if (routed.every((entry) => operationCoversClause(wholeOperationId, entry.operationId, entry.clause))) {
    return { kind: 'SINGLE', reason: 'SAME_OPERATION' };
  }

  const nonComposableIndex = definitions.findIndex((definition) => !definition.composableRead);
  if (nonComposableIndex >= 0) {
    return { kind: 'NOT_COMPOSED', reason: 'CLAUSE_NOT_COMPOSABLE', detail: `“${clauses[nonComposableIndex]}” needs ${routed[nonComposableIndex].operationId}, which is not a composable read.`, clauseCount: clauses.length };
  }

  // FR-DEC-7: contractual coverage only; inactive while no operation declares any.
  const skipped: ComposedClause[] = [];
  const kept = routed.filter((entry, index) => {
    const other = routed[index === 0 ? 1 : 0];
    if (index === 1 && coverageSkips(routed[0].operationId, entry.clause)) { skipped.push(entry); return false; }
    return other != null;
  });
  void COVERAGE_DECLARATIONS;
  if (kept.length < 2) return { kind: 'SINGLE', reason: 'SAME_OPERATION' };
  return { kind: 'COMPOSE', clauses: kept, skipped };
}
