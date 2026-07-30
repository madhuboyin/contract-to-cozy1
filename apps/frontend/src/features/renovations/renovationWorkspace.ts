export type RenovationLifecycle =
  | 'IDEA'
  | 'FEASIBILITY'
  | 'SCOPE_DEFINITION'
  | 'REQUIREMENTS_RESEARCH'
  | 'APPROVALS_IN_PROGRESS'
  | 'PREPARING_TO_START'
  | 'READY_TO_START'
  | 'IN_EXECUTION'
  | 'INSPECTION_AND_CLOSEOUT'
  | 'VERIFIED_COMPLETE'
  | 'COMPLETED_WITH_OPEN_ITEMS'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'HISTORICAL_RESEARCH';

export type RenovationReadinessSummary = {
  state?: 'NOT_EVALUATED' | 'NOT_READY' | 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS' | 'READY';
  openItems?: number;
  blockingItems?: number;
  acknowledgedOpenItems?: number;
  evaluatedAt?: string;
  disclaimer?: string;
};

export type RenovationWorkspaceCase = {
  id: string;
  name: string;
  objective?: string | null;
  lifecycle: RenovationLifecycle;
  outcomeStatus?: string;
  governanceTier?: string;
  updatedAt?: string;
  readinessSummary?: RenovationReadinessSummary | null;
  currentScopeVersion?: { version?: number; approvalStatus?: string } | null;
  links?: Array<{ linkType: string; targetId: string }>;
};

export type RenovationWorkspaceAction = {
  question: string;
  title: string;
  description: string;
  href: string;
  stage: 'explore' | 'scope' | 'requirements' | 'approvals' | 'readiness' | 'execution' | 'closeout';
};

export const RENOVATION_STAGE_LABELS = [
  'Explore',
  'Scope',
  'Requirements',
  'Approvals',
  'Readiness',
  'Execution',
  'Closeout',
] as const;

function caseHref(propertyId: string, caseId: string, suffix = '') {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/renovations/${encodeURIComponent(caseId)}${suffix}`;
}

export function getRenovationNextAction(
  renovationCase: RenovationWorkspaceCase,
  propertyId: string,
): RenovationWorkspaceAction {
  const base = caseHref(propertyId, renovationCase.id);
  const readiness = renovationCase.readinessSummary;

  switch (renovationCase.lifecycle) {
    case 'IDEA':
    case 'FEASIBILITY':
      return {
        question: 'Is this renovation worth pursuing for this home?',
        title: 'Clarify the idea and constraints',
        description: 'Compare the intended outcome with the property, budget, timing, and responsibility context.',
        href: `${base}/requirements`,
        stage: 'explore',
      };
    case 'SCOPE_DEFINITION':
      return {
        question: 'What exactly will change?',
        title: 'Confirm the working scope',
        description: 'Review the spaces, systems, work items, and evidence that define this renovation.',
        href: `${base}/requirements`,
        stage: 'scope',
      };
    case 'REQUIREMENTS_RESEARCH':
    case 'HISTORICAL_RESEARCH':
      return {
        question: 'Which requirements could apply?',
        title: 'Determine permit, HOA, and safety requirements',
        description: 'Resolve researched candidates against authoritative sources before treating them as requirements.',
        href: `${base}/requirements`,
        stage: 'requirements',
      };
    case 'APPROVALS_IN_PROGRESS':
      return {
        question: 'What must be approved or satisfied before work starts?',
        title: 'Advance the compliance workflow',
        description: 'Track permit and HOA records, conditions, owners, evidence, and due dates.',
        href: `${base}/compliance`,
        stage: 'approvals',
      };
    case 'PREPARING_TO_START':
    case 'READY_TO_START':
      return {
        question: 'Is this renovation ready to start?',
        title: readiness?.state === 'NOT_READY'
          ? `Resolve ${readiness.blockingItems ?? 0} blocking readiness item${readiness.blockingItems === 1 ? '' : 's'}`
          : readiness?.state === 'READY'
            ? 'Create or open the execution project'
            : 'Evaluate start readiness',
        description: 'Verify scope, approvals, provider or DIY responsibilities, evidence, and acknowledged open items.',
        href: `${base}/readiness`,
        stage: 'readiness',
      };
    case 'IN_EXECUTION':
      return {
        question: 'Is the work on track and supported by current records?',
        title: 'Open the execution project',
        description: 'Manage delivery in Projects while this renovation case remains the governing plan.',
        href: `/dashboard/properties/${encodeURIComponent(propertyId)}/projects`,
        stage: 'execution',
      };
    case 'INSPECTION_AND_CLOSEOUT':
    case 'COMPLETED_WITH_OPEN_ITEMS':
      return {
        question: 'What remains before this renovation is verifiably complete?',
        title: 'Finish closeout and preserve evidence',
        description: 'Reconcile inspections, permits, conditions, materials, costs, warranties, and completion evidence.',
        href: `${base}/compliance`,
        stage: 'closeout',
      };
    case 'VERIFIED_COMPLETE':
      return {
        question: 'Where are the durable records for this completed renovation?',
        title: 'Review the completed home record',
        description: 'Keep project, permit, approval, and material records available without creating another plan.',
        href: `/dashboard/properties/${encodeURIComponent(propertyId)}/materials`,
        stage: 'closeout',
      };
    case 'ON_HOLD':
      return {
        question: 'What must change before this renovation can resume?',
        title: 'Review the paused plan',
        description: 'Confirm the reason, scope, requirements, and timing before resuming work.',
        href: `${base}/requirements`,
        stage: 'scope',
      };
    case 'CANCELLED':
      return {
        question: 'What should be retained from this cancelled renovation?',
        title: 'Review the retained case record',
        description: 'Preserve decisions and evidence so the same research does not need to be repeated.',
        href: `${base}/requirements`,
        stage: 'closeout',
      };
  }
}

export function renovationLifecycleLabel(lifecycle: string) {
  return lifecycle.replace(/_/g, ' ').toLowerCase().replace(/^\w/, character => character.toUpperCase());
}
