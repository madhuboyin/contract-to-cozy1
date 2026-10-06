// apps/backend/src/services/diy/stepTransitions.ts
//
// The rules for DIY step transitions and for when a project may complete (docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md section 3.2 and 3.4).
// Pure: no database. The service applies these inside a transaction after claiming the project row.
//
//   PENDING -> IN_PROGRESS                      start
//   PENDING | IN_PROGRESS -> COMPLETED          complete
//   PENDING | IN_PROGRESS -> SKIPPED            only an OPTIONAL step with NO safety note
//   COMPLETED | SKIPPED -> IN_PROGRESS          reopen (a correction)
//   the same status again                       already applied (idempotent by resulting state)
//   anything else                               refused
//
// Step order is deliberately not a rule here: "current step" is a presentation concept (the first step not yet done), and a person may work on any
// step.
export type DiyStepStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type DiyStepEventType = 'STEP_STARTED' | 'STEP_COMPLETED' | 'STEP_SKIPPED' | 'STEP_REOPENED';

export interface StepForTransition {
  status: DiyStepStatusValue;
  isOptional: boolean;
  safetyNote?: string | null;
}

export type StepTransitionDecision =
  | { kind: 'ALREADY' }
  | { kind: 'ALLOWED'; event: DiyStepEventType }
  | { kind: 'REFUSED'; reason: 'NOT_ALLOWED' | 'SKIP_REQUIRED_STEP' | 'SKIP_SAFETY_STEP' };

const hasSafetyNote = (step: StepForTransition) => Boolean(step.safetyNote && step.safetyNote.trim());

export function evaluateStepTransition(step: StepForTransition, to: DiyStepStatusValue): StepTransitionDecision {
  const from = step.status;
  if (from === to) return { kind: 'ALREADY' };
  const open = from === 'PENDING' || from === 'IN_PROGRESS';
  const closed = from === 'COMPLETED' || from === 'SKIPPED';
  if (to === 'IN_PROGRESS' && from === 'PENDING') return { kind: 'ALLOWED', event: 'STEP_STARTED' };
  if (to === 'IN_PROGRESS' && closed) return { kind: 'ALLOWED', event: 'STEP_REOPENED' };
  if (to === 'COMPLETED' && open) return { kind: 'ALLOWED', event: 'STEP_COMPLETED' };
  if (to === 'SKIPPED' && open) {
    if (!step.isOptional) return { kind: 'REFUSED', reason: 'SKIP_REQUIRED_STEP' };
    if (hasSafetyNote(step)) return { kind: 'REFUSED', reason: 'SKIP_SAFETY_STEP' };
    return { kind: 'ALLOWED', event: 'STEP_SKIPPED' };
  }
  return { kind: 'REFUSED', reason: 'NOT_ALLOWED' };
}

export interface StepForCompletion { id: string; stepNumber: number; title: string; isOptional: boolean; status: DiyStepStatusValue }

/**
 * The steps that stop a project from completing: every required step must be COMPLETED, and every optional step COMPLETED or SKIPPED. A project with
 * no steps is not blocked. There is no "finish early" path.
 */
export function openStepsForCompletion(steps: readonly StepForCompletion[]): StepForCompletion[] {
  return steps.filter((step) => (step.isOptional ? !(step.status === 'COMPLETED' || step.status === 'SKIPPED') : step.status !== 'COMPLETED'));
}
