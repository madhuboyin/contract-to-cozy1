import type { RankedHomeAction } from './homeActions.service';

export type HomeActionDashboardEntry = {
  kind: 'ACTION' | 'COVERAGE_CORRECTION_GROUP';
  actionIds: string[];
};

export type HomeActionDashboardSections = {
  attention: HomeActionDashboardEntry[];
  planAhead: HomeActionDashboardEntry[];
};

function coverageCorrectionSubject(action: RankedHomeAction): string | null {
  if (action.source.kind !== 'GUIDANCE' || action.governance.safetyTier !== 'REGULATED_COVERAGE') return null;
  return action.recommendedAction.match(/^(?:Add coverage information|Confirm coverage) for (.+)$/i)?.[1]?.trim() || null;
}

/**
 * The single compact projection used by Home and Ask. It preserves the
 * governed feed order, applies the same coverage-correction collapse as the
 * dashboard, and caps each homeowner-facing section independently.
 */
export function projectHomeActionDashboardSections(
  actions: RankedHomeAction[],
  limit = 3,
): HomeActionDashboardSections {
  const coverageActions = actions.filter((action) => coverageCorrectionSubject(action));
  const coverageIds = new Set(coverageActions.map((action) => action.id));
  let insertedCoverageGroup = false;

  const entries = actions.flatMap((action): Array<HomeActionDashboardEntry & { priority: RankedHomeAction['priority'] }> => {
    if (coverageActions.length < 2 || !coverageIds.has(action.id)) {
      return [{ kind: 'ACTION', actionIds: [action.id], priority: action.priority }];
    }
    if (insertedCoverageGroup) return [];
    insertedCoverageGroup = true;
    return [{
      kind: 'COVERAGE_CORRECTION_GROUP',
      actionIds: coverageActions.map((candidate) => candidate.id),
      priority: action.priority,
    }];
  });

  const stripPriority = ({ priority: _priority, ...entry }: typeof entries[number]): HomeActionDashboardEntry => entry;
  return {
    attention: entries
      .filter((entry) => entry.priority === 'NOW' || entry.priority === 'SOON')
      .slice(0, limit)
      .map(stripPriority),
    planAhead: entries
      .filter((entry) => entry.priority === 'PLAN' || entry.priority === 'CONSIDER')
      .slice(0, limit)
      .map(stripPriority),
  };
}

export function dashboardSectionRepresentativeActions(
  actions: RankedHomeAction[],
  entries: HomeActionDashboardEntry[],
): RankedHomeAction[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  return entries
    .map((entry) => byId.get(entry.actionIds[0]))
    .filter((action): action is RankedHomeAction => Boolean(action));
}
