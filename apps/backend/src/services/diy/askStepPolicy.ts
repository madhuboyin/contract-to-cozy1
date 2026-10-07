// apps/backend/src/services/diy/askStepPolicy.ts
//
// Ask's narrower rules for changing a DIY project step, and the canonical snapshot a confirmation is versioned against
// (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md sections 3.2.1 and 3.9). PURE: it reads nothing and writes nothing. `diyService.updateStep` runs
// `evaluateAskStepPolicy` INSIDE the transaction that changes the step; the Ask handlers use `guideContextVersion` for an early, friendly "this changed".
// The canonical transition table still performs the actual transition: this only narrows what Ask may ask for.
import { createHash } from 'crypto';
import { evaluateProjectGuide, type GuideSource } from './projectGuide';

export type AskStepTarget = 'COMPLETED' | 'SKIPPED';
const TERMINAL = new Set(['COMPLETED', 'SKIPPED']);

type SnapshotStep = { id: string; stepNumber: number; status: string; isOptional: boolean; safetyNote: string | null; updatedAt?: Date | string | null };
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

/** The first step, in authored order, that is not finished: the only step Ask advances. */
export function currentStepOf<T extends { stepNumber: number; status: string }>(steps: T[]): T | null {
  return [...steps].sort((a, b) => a.stepNumber - b.stepNumber).find((step) => !TERMINAL.has(step.status)) ?? null;
}

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
  | { ok: false; code: 'DIY_GUIDE_NOT_CURRENT' | 'DIY_STEP_NOT_CURRENT' | 'DIY_STEP_TRANSITION_NOT_ALLOWED'; message: string; reason: string };

/**
 * Ask may only: complete or skip the CURRENT step of a project whose guide is reviewed, intact and not withdrawn; and skip only an optional step with no
 * safety note. A superseded guide is still usable (the project keeps the steps it started with).
 */
export function evaluateAskStepPolicy(source: GuideSource, stepId: string, target: string): AskStepPolicyDecision {
  const refuse = (code: Extract<AskStepPolicyDecision, { ok: false }>['code'], message: string, reason: string): AskStepPolicyDecision => ({ ok: false, code, message, reason });
  if (target !== 'COMPLETED' && target !== 'SKIPPED') return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', 'Ask only marks a step done or skips it.', 'TARGET_NOT_OFFERED');
  const evaluation = evaluateProjectGuide(source);
  if (evaluation.kind === 'REFUSED') return refuse('DIY_GUIDE_NOT_CURRENT', 'This project can no longer be guided here. Use the project page.', evaluation.reason);
  if (evaluation.sourceState === 'WITHDRAWN') return refuse('DIY_GUIDE_NOT_CURRENT', 'This guide has been withdrawn. Use the project page.', 'WITHDRAWN');
  const current = currentStepOf(source.project.steps);
  if (!current || current.id !== stepId) return refuse('DIY_STEP_NOT_CURRENT', 'This step is no longer the current step. Look at the guide again.', 'NOT_CURRENT_STEP');
  if (target === 'SKIPPED') {
    if (!current.isOptional) return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', 'A required step cannot be skipped.', 'SKIP_REQUIRED_STEP');
    if (current.safetyNote && current.safetyNote.trim() !== '') return refuse('DIY_STEP_TRANSITION_NOT_ALLOWED', 'A step with a safety note cannot be skipped.', 'SKIP_SAFETY_STEP');
  }
  return { ok: true };
}
