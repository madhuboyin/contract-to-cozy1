// apps/backend/src/services/diy/projectGuide.ts
//
// The read-only DIY project guide (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md). PURE: given a project, its template revision and the template's
// current head, it decides whether the project may be guided (the typed refusals of plan section 3.2, with the strict step rule of 3.2.1), applies the
// stale-source rule (3.3), and builds the answer blocks (3.4). It reads nothing and writes nothing; `diyService.getProjectGuideSource` supplies the inputs.
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { evaluateDiyEligibility } from './eligibilityPolicy';
import { checkRevisionIntegrity } from '../diyTemplateRevision.service';
import { eligibilityInputFromRevision, revisionContent, stepSnapshotId } from '../diyPublishedTemplate';
import { TASK_LINK_COPY } from './taskLinkStatus';
import { currentStepOf, isPreviousStepView, previousFinishedStep } from './stepOrder';

export const GUIDE_MAX_STEPS = 40;

export type GuideRefusalReason =
  | 'PROJECT_FINISHED' | 'AI_GUIDE_PROJECT' | 'NOT_TEMPLATE_PROJECT' | 'NO_REVISION' | 'NOT_REVIEWED' | 'REVISION_INTEGRITY' | 'NOT_ELIGIBLE'
  | 'TOO_MANY_STEPS' | 'STEPS_NOT_FROM_REVISION';

export const GUIDE_REFUSAL_COPY: Record<Exclude<GuideRefusalReason, 'PROJECT_FINISHED'>, { title: string; body: string }> = {
  AI_GUIDE_PROJECT: {
    title: "I can't guide this project here",
    body: "This project's steps were written by an AI guide and haven't been reviewed, so I can't walk you through them. They're on the project page.",
  },
  NOT_TEMPLATE_PROJECT: {
    title: "I can't guide this project here",
    body: "This project wasn't started from a reviewed guide, so I can't walk you through it. Its steps are on the project page.",
  },
  NO_REVISION: {
    title: "I can't guide this project here",
    body: "This project was started before its guide could be checked against a reviewed version, so I can't guide it here. The steps are on the project page.",
  },
  NOT_REVIEWED: {
    title: "I can't guide this project here",
    body: "This project was started before its guide could be checked against a reviewed version, so I can't guide it here. The steps are on the project page.",
  },
  REVISION_INTEGRITY: { title: 'This guide is temporarily unavailable', body: 'This guide is temporarily unavailable. The steps are on the project page.' },
  NOT_ELIGIBLE: {
    title: "This kind of work isn't covered here",
    body: "This kind of work isn't covered by guided DIY help. The project page has what you recorded.",
  },
  TOO_MANY_STEPS: {
    title: 'This project has more steps than I can show here',
    body: 'This project has more steps than I can show here. Open it on the project page.',
  },
  STEPS_NOT_FROM_REVISION: {
    title: "I can't confirm these steps",
    body: "I can't confirm these steps match the reviewed guide, so I won't walk you through them. They're on the project page.",
  },
};

export const GUIDE_WITHDRAWN_COPY = 'This guide has been withdrawn. You can keep reading the steps you started with, but check the project page before you rely on them.';
export const GUIDE_CORRECTED_COPY = 'A corrected version of this guide is available. This project keeps the steps it started with.';

type StepRow = {
  id: string; stepNumber: number; templateStepId: string | null; title: string; description: string; estimatedMinutes: number | null;
  isOptional: boolean; safetyNote: string | null; tipNote: string | null; status: string;
  /** Present when the source was read for a step command (the version token and the context version use it). */
  updatedAt?: Date | string | null;
};
export type GuideProject = {
  id: string; title: string; status: string; category: string; templateId: string | null; aiGuideId: string | null; templateRevisionId: string | null;
  completionBasis: string | null; steps: StepRow[]; updatedAt?: Date | string | null; maintenanceTaskId?: string | null;
};
/** A full revision row, as stored (the integrity check hashes it). */
export type GuideRevision = Record<string, any> & { id: string; provenance: string; contentJson: any; retiredAt: Date | null; retiredReason: string | null };
export type GuideSource = { project: GuideProject; revision: GuideRevision | null; head: { publishedRevisionId: string | null } | null };

export type GuideEvaluation =
  | { kind: 'REFUSED'; reason: GuideRefusalReason; mismatches?: string[] }
  | { kind: 'GUIDE'; revision: GuideRevision; sourceState: 'CURRENT' | 'WITHDRAWN' | 'SUPERSEDED' };

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * The strict rule of plan section 3.2.1: the project's steps are EXACTLY the revision's steps, or nothing is called reviewed. Returns the names of whatever
 * differs (never any text), empty when they match. Status and notes are the person's progress and are not compared.
 */
export function stepMismatches(projectSteps: StepRow[], revision: GuideRevision): string[] {
  const reviewed = [...revisionContent(revision).steps].sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber)) as Array<Record<string, any>>;
  const actual = [...projectSteps].sort((a, b) => a.stepNumber - b.stepNumber);
  const found = new Set<string>();
  if (actual.length !== reviewed.length) found.add(actual.length > reviewed.length ? 'extra step' : 'missing step');

  const seen = new Set<string>();
  const expectedIds = new Set(reviewed.map((step) => stepSnapshotId(revision.id, Number(step.stepNumber))));
  for (const step of actual) {
    if (!step.templateStepId) { found.add('missing step id'); continue; }
    if (seen.has(step.templateStepId)) found.add('duplicate step id');
    seen.add(step.templateStepId);
    if (!expectedIds.has(step.templateStepId)) found.add('foreign step id');
  }
  for (let i = 0; i < Math.min(actual.length, reviewed.length); i += 1) {
    const mine = actual[i]; const theirs = reviewed[i];
    if (mine.templateStepId !== stepSnapshotId(revision.id, Number(theirs.stepNumber))) found.add('step order');
    if (mine.stepNumber !== Number(theirs.stepNumber)) found.add('step numbering');
    for (const field of ['title', 'description', 'estimatedMinutes', 'isOptional', 'safetyNote', 'tipNote'] as const) {
      if (!same((mine as any)[field], theirs[field])) found.add(field);
    }
  }
  return [...found].sort();
}

/** The gate of plan section 3.2 in order, then the stale-source rule of 3.3. First failing reason wins. */
export function evaluateProjectGuide(source: GuideSource): GuideEvaluation {
  const { project, revision, head } = source;
  const refuse = (reason: GuideRefusalReason, mismatches?: string[]): GuideEvaluation => ({ kind: 'REFUSED', reason, ...(mismatches ? { mismatches } : {}) });
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) return refuse('PROJECT_FINISHED');
  // Only a project with an aiGuideId is called AI-written; a project whose origin is not recorded claims nothing about who wrote it.
  if (project.aiGuideId) return refuse('AI_GUIDE_PROJECT');
  if (!project.templateId) return refuse('NOT_TEMPLATE_PROJECT');
  if (!project.templateRevisionId || !revision) return refuse('NO_REVISION');
  if (revision.provenance !== 'GOVERNED') return refuse('NOT_REVIEWED');
  if (checkRevisionIntegrity(revision) !== 'VERIFIED') return refuse('REVISION_INTEGRITY');
  if (!evaluateDiyEligibility(eligibilityInputFromRevision(revision as any)).eligible) return refuse('NOT_ELIGIBLE');
  if (project.steps.length > GUIDE_MAX_STEPS) return refuse('TOO_MANY_STEPS');
  const mismatches = stepMismatches(project.steps, revision);
  if (mismatches.length > 0) return refuse('STEPS_NOT_FROM_REVISION', mismatches);

  // The stale-source rule. A superseded revision is retired with reason SUPERSEDED, so "retired" alone is NOT "withdrawn".
  const withdrawn = (revision.retiredAt && (revision.retiredReason === 'UNPUBLISHED' || revision.retiredReason === 'ARCHIVED')) || !head || head.publishedRevisionId === null;
  if (withdrawn) return { kind: 'GUIDE', revision, sourceState: 'WITHDRAWN' };
  return { kind: 'GUIDE', revision, sourceState: head.publishedRevisionId !== revision.id ? 'SUPERSEDED' : 'CURRENT' };
}

// ---- the answer ------------------------------------------------------------------------------------------------------------------------------------

export const DIY_GUIDE_ACTION_ID = 'open-diy-project';

// Step 6 (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md): the declared actions that advance the CURRENT step. The exact canned message selects the action;
// typed wording never writes. The ids are allow-listed for DIY_PROJECT_GUIDE in askAnswerTrustPolicy.
export const DIY_STEP_ENTITY_TYPE = 'DIY_STEP';
export const DIY_STEP_COMPLETE_MESSAGE = 'Mark this step done.';
export const DIY_STEP_SKIP_MESSAGE = 'Skip this step.';
export const DIY_STEP_REOPEN_MESSAGE = 'Reopen this step.';
export const DIY_STEP_ACTIONS = {
  COMPLETE: { id: 'diy-step-complete', message: DIY_STEP_COMPLETE_MESSAGE, target: 'COMPLETED' as const },
  SKIP: { id: 'diy-step-skip', message: DIY_STEP_SKIP_MESSAGE, target: 'SKIPPED' as const },
  // Step 7 (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md section 3.2): reopen a FINISHED step, offered only from the previous-step view.
  REOPEN: { id: 'diy-step-reopen', message: DIY_STEP_REOPEN_MESSAGE, target: 'IN_PROGRESS' as const },
};
// Step 7B (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md sections 3.4 and 3.5): the project-level declared actions. Finish is offered in the all-resolved summary;
// Stop and Hand off sit behind a read-only options view (the quiet "Stop or hand off" action), never beside the step buttons, because neither can be undone in Cozy.
export const DIY_PROJECT_ENTITY_TYPE = 'DIY_PROJECT';
export const DIY_PROJECT_FINISH = { id: 'diy-project-finish', label: 'Finish this project', message: 'Finish this project.', actionId: 'COMPLETE' };
export const DIY_PROJECT_STOP_ACTIONS = {
  STOP: { id: 'diy-project-stop', label: 'Stop this project', message: 'Stop this project.', actionId: 'STOP', status: 'ABANDONED' as const },
  HAND_OFF: { id: 'diy-project-handoff', label: 'Hand this off to a pro', message: 'Hand this off to a pro.', actionId: 'HAND_OFF', status: 'HIRED_OUT' as const },
};
export const DIY_PROJECT_MORE = { id: 'diy-project-more', label: 'Stop or hand off', message: 'Show the options to stop or hand off this project.', actionId: 'MORE' };
// Step 7C (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md section 3.6): asking for failed records to be queued again. Each action sits on the state whose status model can expose it:
// the completion-effects one on the finished-project view, the task one on the OPEN project's guide (a task link can only be recovered while the project is open).
export const DIY_RECOVER_ACTIONS = {
  COMPLETION_EFFECTS: { id: 'diy-record-again', label: 'Record my completion again', message: 'Record my completion again.', actionId: 'COMPLETION_EFFECTS' },
  TASK_LINK: { id: 'diy-task-record-again', label: 'Update my linked task again', message: 'Update my linked task again.', actionId: 'TASK_LINK' },
};
// The read-only launches of the previous-step view (a launch of DIY_PROJECT_GUIDE on entityType DIY_STEP with actionId VIEW) and the way back.
export const DIY_VIEW_ENTITY_TYPE = 'DIY_STEP';
export const DIY_VIEW_ACTION_ID = 'VIEW';
export const DIY_VIEW_ACTIONS = {
  PREVIOUS: { id: 'diy-step-previous', label: 'Previous step', message: 'Show the previous step.' },
  REVIEW_LAST: { id: 'diy-review-last-step', label: 'Review last step', message: 'Review the last step.' },
  BACK: { id: 'diy-step-back', message: 'Back to the guide.' },
};
export type DiyStepActionKey = keyof typeof DIY_STEP_ACTIONS;
export const DIY_GUIDE_BOUNDARY_IDS = ['diy-step-safety', 'diy-guide-withdrawn', 'diy-guide-corrected', 'diy-project-guide-boundary'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  HVAC: 'HVAC', PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical', PAINTING: 'Painting', GENERAL: 'General', EXTERIOR: 'Exterior',
  FLOORING: 'Flooring', APPLIANCE: 'Appliances', LANDSCAPING: 'Landscaping', OTHER: 'Other',
};
const GUIDE_ICONS: Record<string, 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'OUTDOOR' | 'APPLIANCE' | 'TASK'> = {
  HVAC: 'HVAC', PLUMBING: 'PLUMBING', ELECTRICAL: 'ELECTRICAL', EXTERIOR: 'OUTDOOR', LANDSCAPING: 'OUTDOOR', APPLIANCE: 'APPLIANCE',
};
const SAFETY_LABELS: Record<string, string> = { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk' };

/** Shortens to a schema limit with an ellipsis and reports that it did, so the answer can say "longer on the page" instead of silently cutting. */
function clip(value: string, max: number, flags: { truncated: boolean }): string {
  if (value.length <= max) return value;
  flags.truncated = true;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function projectGuideProgress(steps: Array<Pick<StepRow, 'id' | 'stepNumber' | 'status' | 'title' | 'isOptional'>>, asOf: Date) {
  const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const currentIndex = sorted.findIndex((step) => step.status === 'PENDING' || step.status === 'IN_PROGRESS');
  const completed = sorted.filter((step) => step.status === 'COMPLETED').length;
  const skipped = sorted.filter((step) => step.status === 'SKIPPED').length;
  const outline = sorted.map((step, index) => ({
    stepId: step.id, title: step.title, optional: step.isOptional,
    state: (index === currentIndex ? 'CURRENT' : step.status === 'COMPLETED' ? 'DONE' : step.status === 'SKIPPED' ? 'SKIPPED' : 'UPCOMING') as 'CURRENT' | 'DONE' | 'SKIPPED' | 'UPCOMING',
  }));
  if (currentIndex < 0) return { currentIndex: -1, progress: null, outline };
  const current = currentIndex + 1; // one-based position in the sorted outline, never the raw step number
  const label = `Step ${current} of ${sorted.length}, ${completed} done${skipped > 0 ? `, ${skipped} skipped` : ''}`;
  return { currentIndex, progress: { current, total: sorted.length, completed, skipped, label, asOf: asOf.toISOString() }, outline };
}

/** The progress of a project whose every step is resolved: the position is the last one, the label says so in words, and skipped steps are named separately. */
export function resolvedProgress(steps: Array<Pick<StepRow, 'status'>>, asOf: Date) {
  const total = steps.length;
  const completed = steps.filter((step) => step.status === 'COMPLETED').length;
  const skipped = steps.filter((step) => step.status === 'SKIPPED').length;
  return { current: Math.max(1, total), total: Math.max(1, total), completed, skipped, label: `All ${total} ${total === 1 ? 'step' : 'steps'} resolved, ${completed} done${skipped > 0 ? `, ${skipped} skipped` : ''}`, asOf: asOf.toISOString() };
}

export function projectPageHref(propertyId: string, projectId: string) {
  return `/dashboard/diy/projects/${encodeURIComponent(projectId)}?propertyId=${encodeURIComponent(propertyId)}`;
}
export const diyListHref = (propertyId: string) => `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/diy`;

const openAction = (href: string) => ({ id: DIY_GUIDE_ACTION_ID, label: 'Open this project', href, style: 'PRIMARY' as const });

/** The refusal answer: a fixed explanation and the page link, never a partial guide. */
export function refusalBlocks(reason: GuideRefusalReason, source: GuideSource | null, propertyId: string, projectId: string): AskPresentationBlock[] {
  const href = projectPageHref(propertyId, projectId);
  if (reason === 'PROJECT_FINISHED' && source) {
    const { status, completionBasis } = source.project;
    const body = completionBasis === 'LINKED_TASK' && status === 'HIRED_OUT' ? TASK_LINK_COPY.CLOSED_HIRED_OUT
      : completionBasis === 'LINKED_TASK' ? TASK_LINK_COPY.CLOSED_COMPLETED
        : status === 'COMPLETED' ? 'This project is finished.' : status === 'HIRED_OUT' ? 'This project was hired out.' : 'This project was stopped.';
    return [{ type: 'SUMMARY', id: 'diy-guide-finished', title: source.project.title, body, tone: 'DEFAULT', actions: [openAction(href)] }];
  }
  const copy = GUIDE_REFUSAL_COPY[reason as Exclude<GuideRefusalReason, 'PROJECT_FINISHED'>];
  return [{ type: 'EMPTY_STATE', id: 'diy-guide-unavailable', title: copy.title, body: copy.body, actions: [openAction(href)] }];
}

export function projectNotFoundBlocks(propertyId: string): AskPresentationBlock[] {
  return [{
    type: 'EMPTY_STATE', id: 'diy-guide-not-found', title: "I couldn't find that project",
    body: "I couldn't find that project. Your active DIY projects are in the DIY Project Center.",
    actions: [{ id: DIY_GUIDE_ACTION_ID, label: 'Open DIY Project Center', href: diyListHref(propertyId), style: 'PRIMARY' as const }],
  }];
}

/** The stale-source disclosure of a guide that passed the gate (withdrawn: caution with the page link; superseded: informational). Empty for a current one. */
function sourceDisclosure(evaluation: Extract<GuideEvaluation, { kind: 'GUIDE' }>, href: string): AskPresentationBlock[] {
  if (evaluation.sourceState === 'WITHDRAWN') {
    return [{ type: 'BOUNDARY', id: 'diy-guide-withdrawn', title: 'This guide has been withdrawn', body: GUIDE_WITHDRAWN_COPY, severity: 'CAUTION', suggestions: [], actions: [openAction(href)] }];
  }
  if (evaluation.sourceState === 'SUPERSEDED') {
    return [{ type: 'BOUNDARY', id: 'diy-guide-corrected', title: 'A corrected version is available', body: GUIDE_CORRECTED_COPY, severity: 'INFO', suggestions: [] }];
  }
  return [];
}

const SCOPE_COVERAGE = 'This guide covers reviewed, low-risk projects. Electrical panel or wiring work, gas lines, structural work, active leaks or flooding, and hazardous materials such as asbestos, lead paint or mold are not covered. ';
const scopeBoundary = (tail: string): AskPresentationBlock => ({ type: 'BOUNDARY', id: 'diy-project-guide-boundary', title: 'Only for reviewed low-risk projects', body: SCOPE_COVERAGE + tail, severity: 'INFO', suggestions: [] });

/** A declared project-level command action (Finish, Stop, Hand off): the exact message selects it, and the project id is the entity. */
const projectAction = (spec: { id: string; label: string; message: string; actionId: string }, operationId: string, projectId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET') => ({
  id: spec.id, label: spec.label, interactionType: 'START_WORKFLOW' as const, message: spec.message, operationId,
  entityType: DIY_PROJECT_ENTITY_TYPE, entityId: projectId, actionId: spec.actionId, style,
});

/** A declared recovery action (queue failed records again): the exact message selects it, and the project id is the entity. */
const recoverAction = (spec: { id: string; label: string; message: string; actionId: string }, projectId: string) => ({
  id: spec.id, label: spec.label, interactionType: 'START_WORKFLOW' as const, message: spec.message, operationId: 'DIY_COMPLETION_RECOVER',
  entityType: DIY_PROJECT_ENTITY_TYPE, entityId: projectId, actionId: spec.actionId, style: 'SECONDARY' as const,
});

/** A read-only launch of the guide: the previous-step view (entityType DIY_STEP, actionId VIEW) or the way back to the live guide (entityType DIY_PROJECT). */
const viewAction = (spec: { id: string; label: string; message: string }, target: { entityType: string; entityId: string; actionId?: string }, style: 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({
  id: spec.id, label: spec.label, interactionType: 'START_WORKFLOW' as const, message: spec.message, operationId: 'DIY_PROJECT_GUIDE',
  entityType: target.entityType, entityId: target.entityId, ...(target.actionId ? { actionId: target.actionId } : {}), style,
});

/** The guide for a project that passed the gate: disclosures, the current step's safety note, the guide block, and the scope boundary. */
export function buildProjectGuideBlocks(input: {
  source: GuideSource; evaluation: Extract<GuideEvaluation, { kind: 'GUIDE' }>; propertyId: string; asOf: Date; canAdvance?: boolean;
  /** The open project's linked-task status (read-only). Only a RECOVERABLE one is shown: the other states are on the project page. */
  taskLink?: { summary: string; canRecover: boolean } | null;
}): AskPresentationBlock[] {
  const { source, evaluation, propertyId, asOf } = input;
  const { project } = source;
  const href = projectPageHref(propertyId, project.id);
  const blocks: AskPresentationBlock[] = [];

  blocks.push(...sourceDisclosure(evaluation, href));
  // A linked task whose reconciliation failed (only possible while the project is open). Placed BEFORE the step's safety note, which must stay directly above the card.
  if (input.taskLink?.canRecover) {
    blocks.push({
      type: 'BOUNDARY', id: 'diy-task-link', title: 'Your linked task did not update', body: input.taskLink.summary, severity: 'CAUTION', suggestions: [],
      actions: input.canAdvance ? [recoverAction(DIY_RECOVER_ACTIONS.TASK_LINK, project.id)] : [],
    });
  }

  const { currentIndex, progress, outline } = projectGuideProgress(project.steps, asOf);
  if (currentIndex < 0 || !progress) {
    // Every step is resolved: there is no current step. The way back to a finished one (so Reopen stays reachable) is a read action, and Finish is offered here.
    // This is a TASK_GUIDE card, NOT a SUMMARY: the calm shell shows only a SUMMARY's first action (one primary action per turn), which would hide Review last step.
    const last = previousFinishedStep(project.steps, null);
    const canFinish = Boolean(input.canAdvance) && evaluation.sourceState !== 'WITHDRAWN';
    blocks.push({
      type: 'TASK_GUIDE', id: 'diy-project-guide', title: clip(project.title, 160, { truncated: false }), summary: resolvedProgress(project.steps, asOf).label,
      eyebrow: [CATEGORY_LABELS[project.category] ?? 'DIY', 'Reviewed guide'], icon: GUIDE_ICONS[project.category] ?? 'TASK', chips: [], tip: null,
      main: { title: 'Every step is resolved', body: canFinish ? 'You can finish the project here, or on the project page.' : 'Finish the project on the project page.', facts: [] },
      history: [], notes: [],
      actions: [
        ...(canFinish ? [projectAction(DIY_PROJECT_FINISH, 'DIY_PROJECT_COMPLETE', project.id, 'PRIMARY')] : []),
        ...(last ? [viewAction({ ...DIY_VIEW_ACTIONS.REVIEW_LAST }, { entityType: DIY_VIEW_ENTITY_TYPE, entityId: last.id, actionId: DIY_VIEW_ACTION_ID })] : []),
        openAction(href),
      ],
      progress: resolvedProgress(project.steps, asOf), outline: outline.map((entry) => ({ ...entry, title: clip(entry.title, 160, { truncated: false }) })),
    } as AskPresentationBlock);
    return blocks;
  }

  const ordered = [...project.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const step = ordered[currentIndex];
  const flags = { truncated: false };

  // The step's safety note is ALWAYS shown, in its own block immediately before the guide (plan S5-6): the guide block has no field for it.
  if (step.safetyNote && step.safetyNote.trim()) {
    blocks.push({ type: 'BOUNDARY', id: 'diy-step-safety', title: 'Safety for this step', body: step.safetyNote, severity: 'CAUTION', suggestions: [] });
  }
  // The advancing actions: only for a person who can edit, only on a guide that is not withdrawn, and only when the safety note (if any) is the block directly above.
  const safetyShown = !(step.safetyNote && step.safetyNote.trim()) || blocks[blocks.length - 1]?.id === 'diy-step-safety';
  const advance = Boolean(input.canAdvance) && evaluation.sourceState !== 'WITHDRAWN' && safetyShown;
  const stepAction = (key: DiyStepActionKey, label: string, style: 'PRIMARY' | 'QUIET') => ({
    id: DIY_STEP_ACTIONS[key].id, label, interactionType: 'START_WORKFLOW' as const, message: DIY_STEP_ACTIONS[key].message, operationId: 'DIY_STEP_UPDATE',
    entityType: DIY_STEP_ENTITY_TYPE, entityId: step.id, actionId: key, style,
  });
  const previous = previousFinishedStep(project.steps, step.stepNumber);
  const advancing = advance
    ? [stepAction('COMPLETE', 'Mark this step done', 'PRIMARY'), ...(step.isOptional && !(step.safetyNote && step.safetyNote.trim()) ? [stepAction('SKIP', 'Skip this step', 'QUIET')] : [])]
    : [];

  const facts: Array<{ label: string; value: string }> = [{ label: 'This step', value: step.isOptional ? 'Optional' : 'Required' }];
  if (step.estimatedMinutes) facts.unshift({ label: 'Estimated time', value: `About ${step.estimatedMinutes} min` });
  const chips: Array<{ label: string; kind: 'TIME' | 'TAG' }> = [];
  if (step.estimatedMinutes) chips.push({ label: `About ${step.estimatedMinutes} min`, kind: 'TIME' });
  const safety = SAFETY_LABELS[String(evaluation.revision.safetyLevel)];
  if (safety) chips.push({ label: safety, kind: 'TAG' });

  const tip = step.tipNote && step.tipNote.trim() ? { title: 'Tip', body: clip(step.tipNote, 400, flags) } : null;
  const mainBody = clip(step.description, 800, flags);
  const mainTitle = clip(step.title, 80, flags);
  const notes = flags.truncated ? [{ id: 'diy-guide-truncated', title: 'Longer on the page', body: 'Part of this step is shortened here. The full step is on the project page.' }] : [];

  blocks.push({
    type: 'TASK_GUIDE', id: 'diy-project-guide', title: clip(project.title, 160, flags), summary: progress.label,
    eyebrow: [CATEGORY_LABELS[project.category] ?? 'DIY', 'Reviewed guide'],
    icon: GUIDE_ICONS[project.category] ?? 'TASK',
    chips, tip, main: { title: mainTitle, body: mainBody, facts }, history: [], notes,
    actions: [...advancing, ...(previous ? [viewAction({ ...DIY_VIEW_ACTIONS.PREVIOUS }, { entityType: DIY_VIEW_ENTITY_TYPE, entityId: previous.id, actionId: DIY_VIEW_ACTION_ID })] : []),
      ...(input.canAdvance ? [viewAction(DIY_PROJECT_MORE, { entityType: DIY_PROJECT_ENTITY_TYPE, entityId: project.id, actionId: DIY_PROJECT_MORE.actionId }, 'QUIET')] : []), openAction(href)],
    progress, outline: outline.map((entry) => ({ ...entry, title: clip(entry.title, 160, { truncated: false }) })),
  } as AskPresentationBlock);

  blocks.push(scopeBoundary(advance ? 'You can mark the current step done or skip it here, or use the project page.' : 'You mark steps done on the project page.'));
  return blocks;
}

/**
 * The previous-step view (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md section 3.1): a READ of one finished step before the current one (or any finished step when
 * every step is resolved), on the same card. The viewed step's safety note is the block directly above the card; the outline keeps marking the REAL current step; the
 * progress label says plainly that this is a step looked back at. Returns null when the step is not a valid previous step (it is the current step, a later one, or
 * unfinished), so the caller shows the live guide instead. Reopen is offered only to a person who can edit, on a guide that is not withdrawn.
 */
export function buildPreviousStepBlocks(input: {
  source: GuideSource; evaluation: Extract<GuideEvaluation, { kind: 'GUIDE' }>; propertyId: string; asOf: Date; viewedStepId: string; canAdvance?: boolean;
}): AskPresentationBlock[] | null {
  const { source, evaluation, propertyId, asOf, viewedStepId } = input;
  const { project } = source;
  if (!isPreviousStepView(project.steps, viewedStepId)) return null;
  const ordered = [...project.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const viewedIndex = ordered.findIndex((row) => row.id === viewedStepId);
  const step = ordered[viewedIndex];
  const current = currentStepOf(ordered);
  const currentIndex = current ? ordered.findIndex((row) => row.id === current.id) : -1;
  const href = projectPageHref(propertyId, project.id);
  const flags = { truncated: false };

  const blocks: AskPresentationBlock[] = [...sourceDisclosure(evaluation, href)];
  const hasNote = Boolean(step.safetyNote && step.safetyNote.trim());
  if (hasNote) blocks.push({ type: 'BOUNDARY', id: 'diy-step-safety', title: 'Safety for this step', body: step.safetyNote as string, severity: 'CAUTION', suggestions: [] });
  const safetyShown = !hasNote || blocks[blocks.length - 1]?.id === 'diy-step-safety';
  const canReopen = Boolean(input.canAdvance) && evaluation.sourceState !== 'WITHDRAWN' && safetyShown;

  const stateWord = step.status === 'SKIPPED' ? 'skipped' : 'done';
  const completed = ordered.filter((row) => row.status === 'COMPLETED').length;
  const skipped = ordered.filter((row) => row.status === 'SKIPPED').length;
  const where = current ? ` You are on step ${currentIndex + 1}.` : ' Every step is resolved.';
  const label = `Looking back at step ${viewedIndex + 1} of ${ordered.length}, ${stateWord}.${where}`;
  const { outline } = projectGuideProgress(ordered, asOf);

  const chips: Array<{ label: string; kind: 'TIME' | 'TAG' | 'STATUS' }> = [{ label: step.status === 'SKIPPED' ? 'Skipped' : 'Done', kind: 'STATUS' }];
  if (step.estimatedMinutes) chips.push({ label: `About ${step.estimatedMinutes} min`, kind: 'TIME' });
  const tip = step.tipNote && step.tipNote.trim() ? { title: 'Tip', body: clip(step.tipNote, 400, flags) } : null;
  const previous = previousFinishedStep(ordered, step.stepNumber);
  const back = current
    ? viewAction({ id: DIY_VIEW_ACTIONS.BACK.id, label: `Back to step ${currentIndex + 1}`, message: DIY_VIEW_ACTIONS.BACK.message }, { entityType: 'DIY_PROJECT', entityId: project.id })
    : viewAction({ id: DIY_VIEW_ACTIONS.BACK.id, label: 'Back to the guide', message: DIY_VIEW_ACTIONS.BACK.message }, { entityType: 'DIY_PROJECT', entityId: project.id });
  const reopen = {
    id: DIY_STEP_ACTIONS.REOPEN.id, label: 'Reopen this step', interactionType: 'START_WORKFLOW' as const, message: DIY_STEP_ACTIONS.REOPEN.message, operationId: 'DIY_STEP_UPDATE',
    entityType: DIY_STEP_ENTITY_TYPE, entityId: step.id, actionId: 'REOPEN', style: 'SECONDARY' as const,
  };

  blocks.push({
    type: 'TASK_GUIDE', id: 'diy-project-guide', title: clip(project.title, 160, flags), summary: label,
    eyebrow: [CATEGORY_LABELS[project.category] ?? 'DIY', 'Reviewed guide', 'Earlier step'],
    icon: GUIDE_ICONS[project.category] ?? 'TASK',
    chips, tip, main: { title: clip(step.title, 80, flags), body: clip(step.description, 800, flags), facts: [{ label: 'This step', value: step.isOptional ? 'Optional' : 'Required' }] },
    history: [], notes: flags.truncated ? [{ id: 'diy-guide-truncated', title: 'Longer on the page', body: 'Part of this step is shortened here. The full step is on the project page.' }] : [],
    actions: [...(canReopen ? [reopen] : []), ...(previous ? [viewAction({ ...DIY_VIEW_ACTIONS.PREVIOUS }, { entityType: DIY_VIEW_ENTITY_TYPE, entityId: previous.id, actionId: DIY_VIEW_ACTION_ID })] : []), back, openAction(href)],
    progress: { current: viewedIndex + 1, total: ordered.length, completed, skipped, label, asOf: asOf.toISOString() },
    outline: outline.map((entry) => ({ ...entry, title: clip(entry.title, 160, { truncated: false }) })),
  } as AskPresentationBlock);
  blocks.push(scopeBoundary(canReopen ? 'You can reopen this step here, or use the project page.' : 'You change steps on the project page.'));
  return blocks;
}

/**
 * The stop-or-hand-off OPTIONS view (a READ): says what each does and that neither can be undone in Cozy, and, for a person who can edit, carries the two declared
 * confirm-launching actions beside a way back. A person who cannot edit sees the explanation and the way back only. It writes nothing.
 */
export function buildProjectOptionsBlocks(input: { source: GuideSource; evaluation: Extract<GuideEvaluation, { kind: 'GUIDE' }>; propertyId: string; asOf: Date; canEdit: boolean }): AskPresentationBlock[] {
  const { source, evaluation, propertyId, asOf } = input;
  const { project } = source;
  const href = projectPageHref(propertyId, project.id);
  const back = viewAction({ id: 'diy-step-back', label: 'Back to the guide', message: DIY_VIEW_ACTIONS.BACK.message }, { entityType: DIY_PROJECT_ENTITY_TYPE, entityId: project.id });
  const { currentIndex, progress, outline } = projectGuideProgress(project.steps, asOf);
  const shown = currentIndex >= 0 && progress ? progress : resolvedProgress(project.steps, asOf);
  // A TASK_GUIDE card, NOT a SUMMARY: the calm shell shows only a SUMMARY's first action, which would hide Hand off and Back.
  return [
    ...sourceDisclosure(evaluation, href),
    {
      type: 'TASK_GUIDE', id: 'diy-project-guide', title: clip(project.title, 160, { truncated: false }), summary: 'Stop or hand off this project',
      eyebrow: [CATEGORY_LABELS[project.category] ?? 'DIY', 'Reviewed guide', 'Stop or hand off'], icon: GUIDE_ICONS[project.category] ?? 'TASK', chips: [], tip: null,
      main: {
        title: 'What each choice does',
        body: 'Stopping marks the project as stopped. Handing off marks it as handed to a professional; it does not book or contact anyone. Neither can be undone in Cozy. Your steps and notes are kept, a linked maintenance task is not changed, and no incident changes.',
        facts: [],
      },
      history: [], notes: [],
      actions: input.canEdit
        ? [projectAction(DIY_PROJECT_STOP_ACTIONS.STOP, 'DIY_PROJECT_ABANDON', project.id, 'SECONDARY'), projectAction(DIY_PROJECT_STOP_ACTIONS.HAND_OFF, 'DIY_PROJECT_ABANDON', project.id, 'SECONDARY'), back]
        : [back],
      progress: shown, outline: outline.map((entry) => ({ ...entry, title: clip(entry.title, 160, { truncated: false }) })),
    } as AskPresentationBlock,
  ];
}

/**
 * The finished-project view of a COMPLETED project that would otherwise be guideable (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md section 3.6): a READ that says in
 * words what is known about the records that follow a completion (from the same status functions the page uses) and, for a person who can edit, offers to queue a
 * dead-lettered completion event again. A project closed from its linked task shows its closed-by-task disclosure and NO recovery. It is a TASK_GUIDE card, not a SUMMARY
 * (the calm shell shows only a SUMMARY's first action), and never marks a "current" step.
 */
export function buildFinishedProjectBlocks(input: {
  source: GuideSource; propertyId: string; asOf: Date; canEdit: boolean;
  effects: { completionEffects: { summary: string; canRecover: boolean } | null; taskLink: { summary: string } | null } | null;
}): AskPresentationBlock[] {
  const { source, propertyId, asOf } = input;
  const { project } = source;
  const href = projectPageHref(propertyId, project.id);
  const ordered = [...project.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const completed = ordered.filter((step) => step.status === 'COMPLETED').length;
  const skipped = ordered.filter((step) => step.status === 'SKIPPED').length;
  const status = input.effects?.completionEffects?.summary ?? input.effects?.taskLink?.summary ?? 'This project is finished.';
  const label = `Finished, ${completed} of ${ordered.length} ${ordered.length === 1 ? 'step' : 'steps'} done${skipped > 0 ? `, ${skipped} skipped` : ''}`;
  const canRecord = input.canEdit && Boolean(input.effects?.completionEffects?.canRecover);
  return [{
    type: 'TASK_GUIDE', id: 'diy-project-guide', title: clip(project.title, 160, { truncated: false }), summary: label,
    eyebrow: [CATEGORY_LABELS[project.category] ?? 'DIY', 'Finished'], icon: GUIDE_ICONS[project.category] ?? 'TASK', chips: [], tip: null,
    main: { title: 'This project is finished', body: `${status} You can still add time, cost and notes on the project page.`, facts: [] },
    history: [], notes: [],
    actions: [...(canRecord ? [recoverAction(DIY_RECOVER_ACTIONS.COMPLETION_EFFECTS, project.id)] : []), openAction(href)],
    progress: { current: Math.max(1, ordered.length), total: Math.max(1, ordered.length), completed, skipped, label, asOf: asOf.toISOString() },
    outline: ordered.map((step) => ({ stepId: step.id, title: clip(step.title, 160, { truncated: false }), optional: step.isOptional, state: (step.status === 'COMPLETED' ? 'DONE' : step.status === 'SKIPPED' ? 'SKIPPED' : 'UPCOMING') as 'DONE' | 'SKIPPED' | 'UPCOMING' })),
  } as AskPresentationBlock];
}
