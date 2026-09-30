import type { AskFollowUpNomination } from '../skills/skillHandoff';

/**
 * Handoff audit scope 3, slice 3 (FRD v1.167): the unfocused Home Actions answer's own decision about
 * whether a maintenance follow-up is worth offering, replacing the static HOME_ACTIONS ->
 * MAINTENANCE_STATUS entry that showed on every feed regardless of content.
 *
 * The rule is structural, never message-text based, and reads the canonical feed BEFORE presentation
 * capping (the shown-card limit is display policy, so urgent maintenance ranked below other domains
 * must still count):
 *  - nominate only when the canonical feed holds at least one MAINTENANCE-source action classified NOW or
 *    SOON ("actionable", not "urgent" -- SOON is deliberately not urgent);
 *  - decline when every displayed action is already a maintenance action, since the answer then already
 *    is the maintenance view and the follow-up would add nothing.
 * Focused guidance and the pre-close buyer branch never reach this function; they suppress their own handoff.
 */
export interface HomeActionsFollowUpAction {
  source: { kind: string };
  priority: string;
}

export const HOME_ACTIONS_MAINTENANCE_FOLLOW_UP_GOAL = 'understand-maintenance-status';

export function resolveHomeActionsFollowUp(input: {
  feedActions: readonly HomeActionsFollowUpAction[];
  displayedActions: readonly HomeActionsFollowUpAction[];
}): AskFollowUpNomination | null {
  const isMaintenance = (action: HomeActionsFollowUpAction) => action.source.kind === 'MAINTENANCE';
  const actionable = input.feedActions.filter((action) => isMaintenance(action) && (action.priority === 'NOW' || action.priority === 'SOON'));
  if (!actionable.length) return null;
  if (input.displayedActions.length > 0 && input.displayedActions.every(isMaintenance)) return null;
  return {
    goal: HOME_ACTIONS_MAINTENANCE_FOLLOW_UP_GOAL,
    reasonCodes: ['HOME_ACTION_MAINTENANCE_ACTIONABLE'],
    label: `See your maintenance schedule (${actionable.length} due now or soon)`,
  };
}
