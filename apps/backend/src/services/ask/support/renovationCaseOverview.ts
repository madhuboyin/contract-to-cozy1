// The renovation case overview in Ask (parity register "Renovation Risk Advisor", slice 1). Desktop's Renovations page lists every case with its lifecycle
// stage, readiness and next step; the readiness answer used to show one case only (the one named, else the most recently updated) without saying so.
// Pure: the "show my renovation cases" detection, the stage-to-next-step reading and the case rows. The next steps mirror the desktop workspace's own
// (`features/renovations/renovationWorkspace.ts`), as plain statements: Ask names the step, and says so when the step itself is not yet available in Ask.

/** "Show my renovation cases / renovations / remodel plans": the overview, not a readiness question about one case. */
// Narrow on purpose: "which renovations add value" or "my renovation costs" are other questions. Either name the cases, or ask for my/all/the list of renovations and stop.
const OVERVIEW_PATTERN = /\b(?:renovation|remodel)\s+cases?\b|\b(?:my|all|list|show)\s+(?:current\s+|active\s+|open\s+)?(?:renovations?|remodels?)(?:\s+(?:plans?|projects?))?\s*[?.!]*\s*$/i;
import { READINESS_COMMAND_ACTION_IDS, READINESS_COMMAND_MESSAGES, RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE, RENOVATION_RETROACTIVE_ENTITY_TYPE } from './renovationReadinessCommand';
import { RENOVATION_HOA_READING_ENTITY_TYPE, RENOVATION_REQUIREMENT_ENTITY_TYPE } from './renovationAuthorityWrites';
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
    case 'REQUIREMENTS_RESEARCH': case 'HISTORICAL_RESEARCH': return { title: 'Determine permit, HOA and safety requirements', inAsk: true };
    case 'ON_HOLD': case 'CANCELLED': return { title: lifecycle === 'ON_HOLD' ? 'Review the paused plan' : 'Review the retained case record', inAsk: false };
    case 'APPROVALS_IN_PROGRESS': return { title: 'Advance the permit and HOA approvals', inAsk: true };
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
      description: `Next: ${next.title}.${next.inAsk ? '' : RENOVATION_COMPLIANCE_STAGES.has(renovationCase.lifecycle) ? ' You can review the approvals here, attach records, mark conditions satisfied and review HOA document readings.' : RENOVATION_REQUIREMENT_STAGES.has(renovationCase.lifecycle) ? ' This step is not currently available in Ask; you can review the requirements here.' : ' This step is not currently available in Ask.'}`,
      meta: [
        renovationLifecycleLabel(renovationCase.lifecycle),
        READINESS_LABELS[summary.state ?? 'NOT_EVALUATED'] ?? READINESS_LABELS.NOT_EVALUATED,
        ...(scope ? [`Scope ${scope.toLowerCase()}`] : []),
        ...(renovationCase.id === shownId ? ['Detailed below'] : []),
      ],
      status: renovationCase.lifecycle,
      href: null,
      ...(renovationCase.id === shownId && !RENOVATION_REQUIREMENT_STAGES.has(renovationCase.lifecycle) && !RENOVATION_COMPLIANCE_STAGES.has(renovationCase.lifecycle) ? {} : {
        actions: [
          ...(renovationCase.id === shownId ? [] : [{
            id: RENOVATION_CASE_SHOW_READINESS_ACTION_ID, label: 'Show readiness', interactionType: 'CONVERSATION_CONTINUE' as const,
            message: `Is my renovation ${renovationCase.name.slice(0, 120)} ready to start?`, operationId: 'RENOVATION_PERMIT_READINESS', style: 'SECONDARY' as const,
          }]),
          ...(RENOVATION_COMPLIANCE_STAGES.has(renovationCase.lifecycle) ? [{
            id: RENOVATION_CASE_SHOW_COMPLIANCE_ACTION_ID, label: 'Show approvals', interactionType: 'CONVERSATION_CONTINUE' as const,
            message: `Show the compliance status for my renovation ${renovationCase.name.slice(0, 120)}.`, operationId: 'RENOVATION_PERMIT_READINESS', style: 'SECONDARY' as const,
          }] : []),
          ...(RENOVATION_REQUIREMENT_STAGES.has(renovationCase.lifecycle) ? [{
            id: RENOVATION_CASE_SHOW_REQUIREMENTS_ACTION_ID, label: 'Show requirements', interactionType: 'CONVERSATION_CONTINUE' as const,
            message: `Show the requirements for my renovation ${renovationCase.name.slice(0, 120)}.`, operationId: 'RENOVATION_PERMIT_READINESS', style: 'SECONDARY' as const,
          }] : []),
        ],
      }),
    };
  });
}

// ---- Requirements (slice 2a: the read view of Desktop's Requirements page) ----

/** "What requirements apply to my renovation", "show the permit requirements for my remodel". Narrow: needs the plural noun next to renovation or remodel. */
const REQUIREMENTS_PATTERN = /\b(?:renovation|remodel)\b.{0,50}\brequirements\b|\brequirements\b.{0,50}\b(?:renovation|remodel)\b/i;
export const isRenovationRequirementsRequest = (message: string) => REQUIREMENTS_PATTERN.test(message);

export const RENOVATION_CASE_SHOW_REQUIREMENTS_ACTION_ID = 'renovation-case-show-requirements';
/** Stages where Desktop's next step is the requirements page, so the case row also offers the requirements view. */
export const RENOVATION_REQUIREMENT_STAGES = new Set(['IDEA', 'FEASIBILITY', 'SCOPE_DEFINITION', 'REQUIREMENTS_RESEARCH', 'HISTORICAL_RESEARCH', 'ON_HOLD', 'CANCELLED']);

const titleCase = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export interface RenovationRequirementInput {
  id: string;
  family: string;
  question: string;
  advisoryLikelihood: string;
  determination: string;
  truthLayer: string;
  confidence: string;
  limitation?: string | null;
  exactNextAction: string;
  dueAt?: Date | null;
  isBlocking: boolean;
  sourceUrl?: string | null;
  sourceSection?: string | null;
  confirmedByName?: string | null;
  confirmedByOrg?: string | null;
}

const sourceHost = (url?: string | null) => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};

/** Research candidates are not requirements: an undetermined row says what to research, a determined one says who confirmed it and from what source. */
export function renovationRequirementRows(requirements: readonly RenovationRequirementInput[], dateLabel: (value: Date) => string, canChange = false) {
  const row = (requirement: RenovationRequirementInput) => {
    const determined = requirement.determination !== 'UNDETERMINED';
    const confirmer = requirement.confirmedByName || requirement.confirmedByOrg;
    const host = sourceHost(requirement.sourceUrl);
    return {
      id: `requirement-${requirement.id}`,
      title: titleCase(requirement.family),
      description: requirement.question,
      meta: [
        determined ? titleCase(requirement.determination) : 'Research needed',
        `Advisory likelihood: ${titleCase(requirement.advisoryLikelihood).toLowerCase()}`,
        `Confidence: ${requirement.confidence.toLowerCase()}`,
        ...(requirement.isBlocking && !determined ? ['Blocks starting'] : []),
      ],
      status: requirement.determination,
      href: null,
      // Recording a sourced determination is a contributor's step on a requirement still needing research; the row carries its own action.
      ...(canChange && !determined ? { entityType: RENOVATION_REQUIREMENT_ENTITY_TYPE, actions: [{
        id: READINESS_COMMAND_ACTION_IDS.DETERMINE_REQUIREMENT, label: 'Record a determination', message: READINESS_COMMAND_MESSAGES.DETERMINE_REQUIREMENT,
        operationId: 'RENOVATION_READINESS_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const, entityType: RENOVATION_REQUIREMENT_ENTITY_TYPE, entityId: requirement.id,
      }] } : {}),
      detail: determined
        ? [`Source type: ${titleCase(requirement.truthLayer).toLowerCase()}`, confirmer ? `Confirmed by: ${confirmer}` : null, host ? `Source: ${host}${requirement.sourceSection ? `, ${requirement.sourceSection}` : ''}` : null].filter(Boolean).join('\n')
        : [`Next step: ${requirement.exactNextAction}`, requirement.dueAt ? `Research due ${dateLabel(requirement.dueAt)}` : null, requirement.limitation ? `Limitation: ${requirement.limitation}` : null].filter(Boolean).join('\n'),
    };
  };
  return {
    unresolved: requirements.filter((requirement) => requirement.determination === 'UNDETERMINED').map(row),
    determined: requirements.filter((requirement) => requirement.determination !== 'UNDETERMINED').map(row),
  };
}

// ---- Compliance (slice 3a: the read view of Desktop's permit and HOA workflow page) ----

/** "Show the compliance status for my renovation", "what approvals does my remodel still need". Narrow: needs renovation or remodel beside the compliance noun. */
const COMPLIANCE_PATTERN = /\b(?:renovation|remodel)\b.{0,50}\b(?:compliance|approvals?|conditions|closeout)\b|\b(?:compliance|approvals?|conditions|closeout)\b.{0,50}\b(?:renovation|remodel)\b/i;
export const isRenovationComplianceRequest = (message: string) => COMPLIANCE_PATTERN.test(message);

export const RENOVATION_CASE_SHOW_COMPLIANCE_ACTION_ID = 'renovation-case-show-compliance';
/** Stages where Desktop's next step is the compliance page, so the case row also offers the compliance view. */
export const RENOVATION_COMPLIANCE_STAGES = new Set(['APPROVALS_IN_PROGRESS', 'INSPECTION_AND_CLOSEOUT', 'COMPLETED_WITH_OPEN_ITEMS']);

const asDate = (value: unknown): Date | null => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null);

export interface RenovationComplianceInput {
  permits: ReadonlyArray<{ id: string; permitNumber?: string | null; category?: string | null; status?: string | null; reportedStatus?: string | null; officialTruthLayer?: string | null; officialSourceReference?: string | null; expirationDate?: Date | string | null }>;
  hoaApprovals: ReadonlyArray<{ id: string; workType?: string | null; decisionStatus?: string | null; reportedStatus?: string | null; decisionTruthLayer?: string | null; decisionSourceReference?: string | null; expirationDate?: Date | string | null }>;
  conditions: ReadonlyArray<{ id: string; title: string; description?: string | null; status: string; isBlocking: boolean; sourceReference?: string | null; dueAt?: Date | string | null }>;
  hoaDocumentReviews: ReadonlyArray<{ id: string; status: string; extractedDecisionStatus?: string | null; extractedReferenceNumber?: string | null; extractedExpirationDate?: Date | string | null; extractedConditions?: unknown }>;
  alerts: ReadonlyArray<{ type: string; subjectId: string; message: string; expiresAt?: Date | string | null }>;
  coverage: { permit: { state: string; message: string }; hoa: { state: string; message: string } };
}

/**
 * Official status and reported status are different things and are kept apart: a record shows what an authority recorded (and from what source) separately
 * from what the household reported, and says plainly when nothing authority-backed exists. Candidate extractions from HOA documents are never decisions.
 */
export function renovationComplianceSections(workflow: RenovationComplianceInput, dateLabel: (value: Date) => string, canChange = false) {
  const date = (value: unknown) => { const parsed = asDate(value); return parsed && !Number.isNaN(parsed.getTime()) ? dateLabel(parsed) : null; };
  const permits = workflow.permits.map((record) => ({
    id: `permit-${record.id}`, title: record.permitNumber || titleCase(record.category ?? 'Permit'), description: record.officialTruthLayer
      ? `${titleCase(record.officialTruthLayer)}${record.officialSourceReference ? ` · ${record.officialSourceReference}` : ' · evidence attached'}`
      : 'No authority-backed status has been recorded.',
    meta: [`Official: ${titleCase(record.status ?? 'unknown')}`, `Reported: ${titleCase(record.reportedStatus ?? 'unknown')}`, ...(date(record.expirationDate) ? [`Expires ${date(record.expirationDate)}`] : [])],
    status: record.status ?? 'UNKNOWN', href: null,
  }));
  const hoaApprovals = workflow.hoaApprovals.map((record) => ({
    id: `hoa-${record.id}`, title: titleCase(record.workType ?? 'HOA approval'), description: record.decisionTruthLayer
      ? `${titleCase(record.decisionTruthLayer)}${record.decisionSourceReference ? ` · ${record.decisionSourceReference}` : ' · evidence attached'}`
      : 'No association-backed decision has been recorded.',
    meta: [`Decision: ${titleCase(record.decisionStatus ?? 'unknown')}`, `Reported: ${titleCase(record.reportedStatus ?? 'unknown')}`, ...(date(record.expirationDate) ? [`Expires ${date(record.expirationDate)}`] : [])],
    status: record.decisionStatus ?? 'UNKNOWN', href: null,
  }));
  const condition = (entry: RenovationComplianceInput['conditions'][number]) => ({
    id: `condition-${entry.id}`, title: entry.title, description: entry.description ?? null,
    meta: [titleCase(entry.status), ...(entry.isBlocking && entry.status === 'OPEN' ? ['Blocks closeout'] : []), ...(date(entry.dueAt) ? [`Due ${date(entry.dueAt)}`] : [])],
    status: entry.status, href: null, ...(entry.sourceReference ? { detail: `Source: ${entry.sourceReference}` } : {}),
    // Marking a condition satisfied is a contributor's step on an open condition; the row carries its own action.
    ...(canChange && entry.status === 'OPEN' ? { entityType: RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE, actions: [{
      id: READINESS_COMMAND_ACTION_IDS.SATISFY_CONDITION, label: 'Mark satisfied with a document', message: READINESS_COMMAND_MESSAGES.SATISFY_CONDITION,
      operationId: 'RENOVATION_READINESS_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const, entityType: RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE, entityId: entry.id,
    }] } : {}),
  });
  const reviews = workflow.hoaDocumentReviews.map((review) => {
    const extracted = Array.isArray(review.extractedConditions) ? review.extractedConditions as Array<{ title?: string; description?: string }> : [];
    return {
      id: `hoa-review-${review.id}`, title: 'HOA document reading', description: `Candidate decision: ${titleCase(review.extractedDecisionStatus ?? 'unknown')}. Extracted details are candidates until a homeowner reviews them.`,
      meta: [titleCase(review.status), ...(review.extractedReferenceNumber ? [`Reference ${review.extractedReferenceNumber}`] : []), ...(date(review.extractedExpirationDate) ? [`Candidate expiration ${date(review.extractedExpirationDate)}`] : [])],
      status: review.status, href: null,
      // Deciding a reading is a contributor's step on a reading still waiting for review; once decided it cannot be decided again.
      ...(canChange && review.status === 'NEEDS_REVIEW' ? { entityType: RENOVATION_HOA_READING_ENTITY_TYPE, actions: [{
        id: READINESS_COMMAND_ACTION_IDS.REVIEW_HOA_READING, label: 'Review this reading', message: READINESS_COMMAND_MESSAGES.REVIEW_HOA_READING,
        operationId: 'RENOVATION_READINESS_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const, entityType: RENOVATION_HOA_READING_ENTITY_TYPE, entityId: review.id,
      }] } : {}),
      ...(extracted.length ? { detail: extracted.slice(0, 10).map((entry) => `${entry.title ?? 'Condition'}: ${entry.description ?? ''}`.trim()).join('\n') } : {}),
    };
  });
  return {
    permits, hoaApprovals,
    openConditions: workflow.conditions.filter((entry) => entry.status !== 'SATISFIED').map(condition),
    satisfiedConditions: workflow.conditions.filter((entry) => entry.status === 'SATISFIED').map(condition),
    reviews,
    alerts: workflow.alerts.map((alert) => `${alert.message}${date(alert.expiresAt) ? ` (${date(alert.expiresAt)})` : ''}`),
  };
}

// ---- Historical (retroactive) review: past work worth checking for permit, tax, licensing and closeout gaps (desktop Renovations "Start historical review") ----

/** "Review my past renovation work", "historical compliance review", "retroactive review". Narrow: it must name a past-work or review phrase. */
const RETROACTIVE_PATTERN = /\b(?:retroactive|historical)\s+(?:compliance\s+)?(?:review|check)\b|\b(?:review|check)\b.{0,40}\b(?:past|previous|prior|completed|old|earlier)\b.{0,30}\b(?:renovations?|remodels?|improvements?)\b|\b(?:past|previous|prior|completed|old|earlier)\b.{0,30}\b(?:renovations?|remodels?|improvements?)\b.{0,40}\b(?:compliance|permits?|reviewed?)\b/i;
export const isRenovationRetroactiveRequest = (message: string) => RETROACTIVE_PATTERN.test(message);
export const RENOVATION_RETROACTIVE_MESSAGE = 'Show the past renovation work I could review for compliance.';
export const RENOVATION_RETROACTIVE_LIST_ACTION_ID = 'renovation-retroactive-list';

export interface RetroactiveCandidateInput {
  timelineEventId: string; eventTitle: string; occurredAt: string; amount: number | null;
  suggestedRenovationLabel: string | null; existingRenovationCaseId: string | null;
}

/** One row per completed improvement; a review already started is said so and offers its requirements, otherwise the row offers to start one. */
export function renovationRetroactiveRows(
  candidates: readonly RetroactiveCandidateInput[], caseNameById: ReadonlyMap<string, string>, options: { canChange: boolean; date: (value: string) => string | null; money: (value: number) => string },
) {
  return candidates.map((candidate) => {
    const started = candidate.existingRenovationCaseId;
    const startedName = started ? caseNameById.get(started) ?? null : null;
    const when = options.date(candidate.occurredAt);
    return {
      id: `retroactive-${candidate.timelineEventId}`, title: candidate.eventTitle,
      description: started ? 'A historical review of this work has been started.' : 'Completed work on your home timeline. A review checks it for permit, tax, licensing, zoning and closeout gaps.',
      meta: [...(when ? [`Completed ${when}`] : []), ...(candidate.amount != null ? [options.money(candidate.amount)] : []), ...(candidate.suggestedRenovationLabel ? [candidate.suggestedRenovationLabel] : []), started ? 'Review started' : 'Not reviewed yet'],
      status: started ? 'STARTED' : 'NOT_STARTED', href: null,
      ...(options.canChange && !started ? { entityType: RENOVATION_RETROACTIVE_ENTITY_TYPE, actions: [{
        id: READINESS_COMMAND_ACTION_IDS.RETROACTIVE_REVIEW, label: 'Start a historical review', message: READINESS_COMMAND_MESSAGES.RETROACTIVE_REVIEW,
        operationId: 'RENOVATION_READINESS_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const, entityType: RENOVATION_RETROACTIVE_ENTITY_TYPE, entityId: candidate.timelineEventId,
      }] } : {}),
      ...(started && startedName ? { actions: [{
        id: RENOVATION_CASE_SHOW_REQUIREMENTS_ACTION_ID, label: 'Show requirements', interactionType: 'CONVERSATION_CONTINUE' as const,
        message: `Show the requirements for my renovation ${startedName.slice(0, 120)}.`, operationId: 'RENOVATION_PERMIT_READINESS', style: 'SECONDARY' as const,
      }] } : {}),
    };
  });
}
