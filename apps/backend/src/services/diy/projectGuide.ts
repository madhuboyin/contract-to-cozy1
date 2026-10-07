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
  completionBasis: string | null; steps: StepRow[]; updatedAt?: Date | string | null;
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
export const DIY_STEP_ACTIONS = {
  COMPLETE: { id: 'diy-step-complete', message: DIY_STEP_COMPLETE_MESSAGE, target: 'COMPLETED' as const },
  SKIP: { id: 'diy-step-skip', message: DIY_STEP_SKIP_MESSAGE, target: 'SKIPPED' as const },
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

/** The guide for a project that passed the gate: disclosures, the current step's safety note, the guide block, and the scope boundary. */
export function buildProjectGuideBlocks(input: { source: GuideSource; evaluation: Extract<GuideEvaluation, { kind: 'GUIDE' }>; propertyId: string; asOf: Date; canAdvance?: boolean }): AskPresentationBlock[] {
  const { source, evaluation, propertyId, asOf } = input;
  const { project } = source;
  const href = projectPageHref(propertyId, project.id);
  const blocks: AskPresentationBlock[] = [];

  if (evaluation.sourceState === 'WITHDRAWN') {
    blocks.push({ type: 'BOUNDARY', id: 'diy-guide-withdrawn', title: 'This guide has been withdrawn', body: GUIDE_WITHDRAWN_COPY, severity: 'CAUTION', suggestions: [], actions: [openAction(href)] });
  } else if (evaluation.sourceState === 'SUPERSEDED') {
    blocks.push({ type: 'BOUNDARY', id: 'diy-guide-corrected', title: 'A corrected version is available', body: GUIDE_CORRECTED_COPY, severity: 'INFO', suggestions: [] });
  }

  const { currentIndex, progress, outline } = projectGuideProgress(project.steps, asOf);
  if (currentIndex < 0 || !progress) {
    // Nothing left to do but finish; completing from Ask is a later step.
    blocks.push({
      type: 'SUMMARY', id: 'diy-guide-resolved', title: project.title, tone: 'POSITIVE', actions: [openAction(href)],
      body: 'Every step is resolved. Finish the project on the project page.',
    });
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
    actions: [...advancing, openAction(href)],
    progress, outline: outline.map((entry) => ({ ...entry, title: clip(entry.title, 160, { truncated: false }) })),
  } as AskPresentationBlock);

  blocks.push({
    type: 'BOUNDARY', id: 'diy-project-guide-boundary', title: 'Only for reviewed low-risk projects',
    body: 'This guide covers reviewed, low-risk projects. Electrical panel or wiring work, gas lines, structural work, active leaks or flooding, and hazardous materials such as asbestos, lead paint or mold are not covered. ' + (advance ? 'You can mark the current step done or skip it here, or use the project page.' : 'You mark steps done on the project page.'),
    severity: 'INFO', suggestions: [],
  });
  return blocks;
}
