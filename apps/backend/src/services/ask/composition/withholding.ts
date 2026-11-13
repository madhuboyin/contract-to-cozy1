// FR-FACET-9(c): a facet that depends on a facet needing clarification (or one that failed) is WITHHELD, not run on a guessed value, while the independent facets run and answer. Pure: callers say which runs have
// settled in which state, and this decides which not-yet-run facets must be held back, transitively, so a dependent of a dependent is held back too.
import type { ComponentState } from './compositeResult';

export interface WithholdingRun { readonly key: string; readonly facetId?: string; readonly dependsOn?: readonly string[] }
export type WithholdingReason = 'WAITING_FOR_CLARIFICATION' | 'PREDECESSOR_FAILED';

/**
 * `stateOf(key)` is the settled state of a run that has run, or null when it has not run. A run that has NOT run is withheld when any facet it names in `dependsOn` is clarifying, failed or itself withheld.
 * Returns the withheld run keys with the reason (a clarification outranks a failure so the homeowner is told what to answer).
 */
export function withheldRuns(runs: readonly WithholdingRun[], stateOf: (key: string) => ComponentState | null, unresolvedFacetIds: ReadonlySet<string> = new Set()): Map<string, WithholdingReason> {
  const byFacet = new Map(runs.filter((run) => run.facetId).map((run) => [run.facetId!, run]));
  const withheld = new Map<string, WithholdingReason>();
  const blockerOf = (run: WithholdingRun): WithholdingReason | null => {
    let reason: WithholdingReason | null = null;
    for (const dependency of run.dependsOn ?? []) {
      // A facet that was not run at all because it is waiting on a clarification (an inline question was asked for it) holds its dependents back the same way.
      if (unresolvedFacetIds.has(dependency)) return 'WAITING_FOR_CLARIFICATION';
      const predecessor = byFacet.get(dependency); if (!predecessor) continue;
      const state = stateOf(predecessor.key);
      const inherited = withheld.get(predecessor.key) ?? null;
      const found: WithholdingReason | null = state === 'CLARIFICATION' ? 'WAITING_FOR_CLARIFICATION' : state === 'FAILED' || state === 'VIOLATION' ? 'PREDECESSOR_FAILED' : inherited;
      if (found === 'WAITING_FOR_CLARIFICATION') return found;
      if (found) reason = found;
    }
    return reason;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const run of runs) {
      if (withheld.has(run.key) || stateOf(run.key) !== null) continue;
      const reason = blockerOf(run);
      if (reason) { withheld.set(run.key, reason); changed = true; }
    }
  }
  return withheld;
}

export const withheldDetail = (reason: WithholdingReason): string => reason === 'WAITING_FOR_CLARIFICATION'
  ? 'This part depends on a part that needs one more detail, so I held it back instead of guessing. Answer the question below, then ask this part again.'
  : 'This part depends on a part that could not be answered right now, so I held it back. Ask it again in a moment.';
