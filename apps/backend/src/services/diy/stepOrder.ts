// apps/backend/src/services/diy/stepOrder.ts
//
// Pure helpers over the authored order of a project's steps, shared by the Ask step policy and the project guide builder (kept apart so neither imports the other).
// A step is FINISHED when it is COMPLETED or SKIPPED; the CURRENT step is the first unfinished one in authored order.
export const TERMINAL_STEP_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'SKIPPED']);
const TERMINAL = TERMINAL_STEP_STATUSES;

/** The first step, in authored order, that is not finished: the only step Ask advances. */
export function currentStepOf<T extends { stepNumber: number; status: string }>(steps: T[]): T | null {
  return [...steps].sort((a, b) => a.stepNumber - b.stepNumber).find((step) => !TERMINAL.has(step.status)) ?? null;
}

/** The nearest FINISHED step (completed or skipped) before `beforeStepNumber`, or the last finished step overall when it is null. The "previous step" of a view. */
export function previousFinishedStep<T extends { stepNumber: number; status: string }>(steps: T[], beforeStepNumber: number | null): T | null {
  const finished = [...steps].filter((step) => TERMINAL.has(step.status) && (beforeStepNumber === null || step.stepNumber < beforeStepNumber)).sort((a, b) => b.stepNumber - a.stepNumber);
  return finished[0] ?? null;
}

/** A step may be looked back at only when it is finished AND before the current step (or every step is resolved). Anything else is not a "previous step". */
export function isPreviousStepView<T extends { id: string; stepNumber: number; status: string }>(steps: T[], stepId: string): boolean {
  const step = steps.find((row) => row.id === stepId);
  if (!step || !TERMINAL.has(step.status)) return false;
  const current = currentStepOf(steps);
  return !current || step.stepNumber < current.stepNumber;
}

