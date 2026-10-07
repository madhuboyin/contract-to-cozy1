// apps/backend/src/services/diy/askStepPolicy.ts
//
// Ask's narrower rules for changing a DIY project step, and the canonical snapshot a confirmation is versioned against
// (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md sections 3.2.1 and 3.9). PURE: it reads nothing and writes nothing. `diyService.updateStep` runs
// `evaluateAskStepPolicy` INSIDE the transaction that changes the step; the Ask handlers use `guideContextVersion` for an early, friendly "this changed".
// The canonical transition table still performs the actual transition: this only narrows what Ask may ask for.
import { createHash } from 'crypto';
import { evaluateProjectGuide, type GuideSource } from './projectGuide';
import { TERMINAL_STEP_STATUSES as TERMINAL, currentStepOf, isPreviousStepView, previousFinishedStep } from './stepOrder';

export { currentStepOf, isPreviousStepView, previousFinishedStep };

export type AskStepTarget = 'COMPLETED' | 'SKIPPED' | 'IN_PROGRESS';
/** The named rule set Ask asks `updateStep` to enforce inside its transaction. The page passes none. */
export type AskStepPolicyName = 'ADVANCE_CURRENT_STEP' | 'REOPEN_FINISHED_STEP';

type SnapshotStep = { id: string; stepNumber: number; status: string; isOptional: boolean; safetyNote: string | null; updatedAt?: Date | string | null };
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

/**
 * Everything a confirmation depends on, in a fixed shape: the project (id, status, version), the current step, a fingerprint of EVERY step (so a change to
 * any other step changes it), and the revision's governance (id, hash, retirement) with the template's current head.
 */
export function guideSnapshot(source: GuideSource & { project: { updatedAt?: Date | string | null } }) {
  const { project, revision, head } = source;
  const steps = [...(project.steps as SnapshotStep[])].sort((a, b) => a.stepNumber - b.stepNumber);
  const current = currentStepOf(steps);
  return {
    project: { id: project.id, status: project.status, updatedAt: iso(project.updatedAt) },
    current: current ? { id: current.id, stepNumber: current.stepNumber, status: current.status, updatedAt: iso(current.updatedAt) } : null,
    steps: steps.map((step) => [step.id, step.stepNumber, step.status, iso(step.updatedAt)]),
    revision: revision
      ? { id: revision.id, contentHash: revision.contentHash ?? null, retiredAt: iso(revision.retiredAt), retiredReason: revision.retiredReason ?? null }
      : null,
    head: head ? { publishedRevisionId: head.publishedRevisionId ?? null } : null,
  };
}

export function guideContextVersion(source: Parameters<typeof guideSnapshot>[0]): string {
  return createHash('sha256').update(JSON.stringify(guideSnapshot(source))).digest('hex');
}

export type AskStepPolicyDecision =
  | { ok: true }
  | { ok: false; code: 'DIY_GUIDE_NOT_CURRENT' | 'DIY_STEP_NOT_CURRENT' | 'DIY_STEP_NOT_REOPENABLE' | 'DIY_STEP_TRANSITION_NOT_ALLOWED'; message: string; reason: string };

/** The project-level rule for finishing from Ask (COMPLETE_PROJECT): the guide is reviewed, intact and not withdrawn. Whether every step is resolved is the service's own check. */
export function evaluateAskProjectPolicy(source: GuideSource, _policy: 'COMPLETE_PROJECT'): AskStepPolicyDecision {
  const evaluation = evaluateProjectGuide(source);
  if (evaluation.kind === 'REFUSED') return { ok: false, code: 'DIY_GUIDE_NOT_CURRENT', message: 'This project can no longer be guided here. Use the project page.', reason: evaluation.reason };
  if (evaluation.sourceState === 'WITHDRAWN') return { ok: false, code: 'DIY_GUIDE_NOT_CURRENT', message: 'This guide has been withdrawn. Use the project page.', reason: 'WITHDRAWN' };
  return { ok: true };
}

/**
 * ADVANCE_CURRENT_STEP: complete or skip the CURRENT step of a project whose guide is reviewed, intact and not withdrawn; skip only an optional step with no safety
 * note. REOPEN_FINISHED_STEP: put a FINISHED step (completed or skipped) of such a project back in progress. A superseded guide is still usable (the project keeps the
 * steps it started with). Both refuse a withdrawn or unverifiable guide.
 */
export function evaluateAskStepPolicy(source: GuideSource, stepId: string, target: string, policy: AskStepPolicyName): AskStepPolicyDecision {
  const refuse = (code: Extract<AskStepPolicyDecision, { ok: false }>['code'], message: string, reason: string): AskStepPolicyDecision => ({ ok: false, code, message, reason });
  const offered = policy === 'REOPEN_FINISHED_STEP' ? target === 'IN_PROGRESS' : target === 'COMPLETED' || target === 'SKIPPED';
  if (!offered) return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', policy === 'REOPEN_FINISHED_STEP' ? 'Ask only reopens a finished step.' : 'Ask only marks a step done or skips it.', 'TARGET_NOT_OFFERED');
  const evaluation = evaluateProjectGuide(source);
  if (evaluation.kind === 'REFUSED') return refuse('DIY_GUIDE_NOT_CURRENT', 'This project can no longer be guided here. Use the project page.', evaluation.reason);
  if (evaluation.sourceState === 'WITHDRAWN') return refuse('DIY_GUIDE_NOT_CURRENT', 'This guide has been withdrawn. Use the project page.', 'WITHDRAWN');
  if (policy === 'REOPEN_FINISHED_STEP') {
    const step = source.project.steps.find((row) => row.id === stepId);
    if (!step || !TERMINAL.has(step.status)) return refuse('DIY_STEP_NOT_REOPENABLE', 'This step is not finished, so there is nothing to reopen. Look at the guide again.', 'NOT_FINISHED');
    return { ok: true };
  }
  const current = currentStepOf(source.project.steps);
  if (!current || current.id !== stepId) return refuse('DIY_STEP_NOT_CURRENT', 'This step is no longer the current step. Look at the guide again.', 'NOT_CURRENT_STEP');
  if (target === 'SKIPPED') {
    if (!current.isOptional) return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', 'A required step cannot be skipped.', 'SKIP_REQUIRED_STEP');
    if (current.safetyNote && current.safetyNote.trim() !== '') return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', 'A step with a safety note cannot be skipped.', 'SKIP_SAFETY_STEP');
  }
  return { ok: true };
}
