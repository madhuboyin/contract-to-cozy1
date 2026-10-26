// The renovation case overview in Ask (parity register "Renovation Risk Advisor", slice 1). Desktop's Renovations page lists every case with its lifecycle
// stage, readiness and next step; the readiness answer used to show one case only (the one named, else the most recently updated) without saying so.
// Pure: the "show my renovation cases" detection, the stage-to-next-step reading and the case rows. The next steps mirror the desktop workspace's own
// (`features/renovations/renovationWorkspace.ts`), as plain statements: Ask names the step, and says so when the step itself is not yet available in Ask.

/** "Show my renovation cases / renovations / remodel plans": the overview, not a readiness question about one case. */
// Narrow on purpose: "which renovations add value" or "my renovation costs" are other questions. Either name the cases, or ask for my/all/the list of renovations and stop.
const OVERVIEW_PATTERN = /\b(?:renovation|remodel)\s+cases?\b|\b(?:my|all|list|show)\s+(?:current\s+|active\s+|open\s+)?(?:renovations?|remodels?)(?:\s+(?:plans?|projects?))?\s*[?.!]*\s*$/i;
export const isRenovationCaseOverviewRequest = (message: string) => OVERVIEW_PATTERN.test(message);

export const RENOVATION_CASE_SHOW_READINESS_ACTION_ID = 'renovation-case-show-readiness';

const STAGE_LABELS: Record<string, string> = {
  IDEA: 'Idea', FEASIBILITY: 'Feasibility', SCOPE_DEFINITION: 'Defining scope', REQUIREMENTS_RESEARCH: 'Researching requirements',
  APPROVALS_IN_PROGRESS: 'Approvals in progress', PREPARING_TO_START: 'Preparing to start', READY_TO_START: 'Ready to start', IN_EXECUTION: 'In execution',
  INSPECTION_AND_CLOSEOUT: 'Inspection and closeout', VERIFIED_COMPLETE: 'Verified complete', COMPLETED_WITH_OPEN_ITEMS: 'Complete with open items',
  ON_HOLD: 'On hold', CANCELLED: 'Cancelled', HISTORICAL_RESEARCH: 'Historical research',
};
export const renovationLifecycleLabel = (lifecycle: string | null | undefined) => !lifecycle ? 'Not staged' : STAGE_LABELS[lifecycle] ?? lifecycle.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const READINESS_LABELS: Record<string, string> = {
  NOT_EVALUATED: 'Readiness not evaluated', NOT_READY: 'Not ready to start', READY_WITH_ACKNOWLEDGED_OPEN_ITEMS: 'Ready, with acknowledged open items', READY: 'Ready to start',
};

export interface RenovationCaseOverviewInput {
  id: string;
  name: string;
  lifecycle: string;
  updatedAt: Date;
  readinessSummary?: unknown;
  currentScopeVersion?: { approvalStatus?: string | null } | null;
}

/** What the case needs next, and whether Ask can do that step today (readiness and the project handoff: yes; requirements and compliance: not yet). */
export function renovationNextStep(lifecycle: string, readinessState?: string | null, blockingItems = 0): { title: string; inAsk: boolean } {
  switch (lifecycle) {
    case 'IDEA': case 'FEASIBILITY': return { title: 'Clarify the idea and constraints', inAsk: false };
    case 'SCOPE_DEFINITION': return { title: 'Confirm the working scope', inAsk: false };
    case 'REQUIREMENTS_RESEARCH': case 'HISTORICAL_RESEARCH': case 'ON_HOLD': case 'CANCELLED': return { title: lifecycle === 'ON_HOLD' ? 'Review the paused plan' : lifecycle === 'CANCELLED' ? 'Review the retained case record' : 'Determine permit, HOA and safety requirements', inAsk: false };
    case 'APPROVALS_IN_PROGRESS': return { title: 'Advance the permit and HOA approvals', inAsk: false };
    case 'PREPARING_TO_START': case 'READY_TO_START':
      return {
        title: readinessState === 'NOT_READY' ? `Resolve ${blockingItems} blocking readiness item${blockingItems === 1 ? '' : 's'}`
          : readinessState === 'READY' ? 'Create or open the execution project' : 'Evaluate start readiness',
        inAsk: true,
      };
    case 'IN_EXECUTION': return { title: 'Manage delivery in the execution project', inAsk: true };
    case 'INSPECTION_AND_CLOSEOUT': case 'COMPLETED_WITH_OPEN_ITEMS': return { title: 'Finish closeout and preserve evidence', inAsk: false };
    case 'VERIFIED_COMPLETE': return { title: 'Review the completed home record', inAsk: true };
    default: return { title: 'Review this case', inAsk: false };
  }
}

const readiness = (value: unknown): { state?: string; blockingItems?: number } => (value && typeof value === 'object' ? value as { state?: string; blockingItems?: number } : {});

/** One row per case. `shownId` is the case whose readiness is detailed below, so it carries no action to open itself. */
export function renovationCaseRows(cases: readonly RenovationCaseOverviewInput[], shownId: string | null) {
  return cases.map((renovationCase) => {
    const summary = readiness(renovationCase.readinessSummary);
    const next = renovationNextStep(renovationCase.lifecycle, summary.state, summary.blockingItems ?? 0);
    const scope = renovationCase.currentScopeVersion?.approvalStatus;
    return {
      id: `renovation-case-${renovationCase.id}`,
      title: renovationCase.name,
      description: `Next: ${next.title}.${next.inAsk ? '' : ' This step is not currently available in Ask.'}`,
      meta: [
        renovationLifecycleLabel(renovationCase.lifecycle),
        READINESS_LABELS[summary.state ?? 'NOT_EVALUATED'] ?? READINESS_LABELS.NOT_EVALUATED,
        ...(scope ? [`Scope ${scope.toLowerCase()}`] : []),
        ...(renovationCase.id === shownId ? ['Detailed below'] : []),
      ],
      status: renovationCase.lifecycle,
      href: null,
      ...(renovationCase.id === shownId ? {} : {
        actions: [{
          id: RENOVATION_CASE_SHOW_READINESS_ACTION_ID, label: 'Show readiness', interactionType: 'CONVERSATION_CONTINUE' as const,
          message: `Is my renovation ${renovationCase.name.slice(0, 120)} ready to start?`, operationId: 'RENOVATION_PERMIT_READINESS', style: 'SECONDARY' as const,
        }],
      }),
    };
  });
}
