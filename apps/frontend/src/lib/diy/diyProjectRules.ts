import type { DiyProjectStep } from '@/types';

/**
 * The completion rule the server enforces (docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md section 3.4), mirrored here only to decide what the
 * page offers: every required step COMPLETED, every optional step COMPLETED or SKIPPED. The server stays the authority and refuses otherwise.
 */
export function openStepsForCompletion<T extends Pick<DiyProjectStep, 'isOptional' | 'status'>>(steps: readonly T[]): T[] {
  return steps.filter((step) => (step.isOptional ? !(step.status === 'COMPLETED' || step.status === 'SKIPPED') : step.status !== 'COMPLETED'));
}

/** A step can be skipped only if it is optional and carries no safety note (the server refuses anything else). */
export function canSkipStep(step: Pick<DiyProjectStep, 'isOptional' | 'safetyNote'>): boolean {
  return step.isOptional && !(step.safetyNote && step.safetyNote.trim());
}

export type DiyWriteErrorCode =
  | 'DIY_STALE' | 'DIY_PROJECT_CLOSED' | 'DIY_STEP_TRANSITION_NOT_ALLOWED' | 'DIY_PROJECT_STEPS_INCOMPLETE' | 'DIY_TOKEN_REQUIRED';

/** The server's error code for a failed DIY write (the API client keeps the response body on `payload`). */
export function diyErrorCode(error: unknown): string | null {
  const code = (error as { payload?: { error?: { code?: unknown } } } | null)?.payload?.error?.code;
  return typeof code === 'string' ? code : null;
}

export const STALE_MESSAGE = "This project changed while you were working. We've refreshed it.";
export const CLOSED_MESSAGE = 'This project is already finished and can no longer be changed.';
