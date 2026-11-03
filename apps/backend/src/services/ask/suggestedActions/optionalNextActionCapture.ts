// The "next actions" block (askNextActions.ts) can attach one optional prompt to an ordinary answer: a missing property fact the homeowner
// may fill in later. That prompt is an extra, not the thing the answer is waiting on, so it must not be treated as an open interaction by
// the finalizer, and an answer that carries only such a prompt is still finished. Kept dependency-free so the finalizer, completion and
// history code can share one definition without importing the heavier next-actions module (which re-exports these constants).
export const NEXT_ACTION_MISSING_FACT_CAPTURE_KEY = 'NEXT_ACTION_MISSING_FACT';
export const NEXT_ACTION_CONTEXT_PREFIX = 'NEXT_ACTION_CONTEXT:';

interface CaptureRequestLike { captureKey?: unknown }

export function isOptionalNextActionCapture(request: CaptureRequestLike | null | undefined): boolean {
  const key = request?.captureKey;
  return typeof key === 'string' && (key === NEXT_ACTION_MISSING_FACT_CAPTURE_KEY || key.startsWith(NEXT_ACTION_CONTEXT_PREFIX));
}

/** True when at least one capture request is something the answer is actually waiting on (not an optional next-action prompt). */
export function hasBlockingCaptureRequests(requests: readonly CaptureRequestLike[] | null | undefined): boolean {
  return Boolean(requests?.some((request) => !isOptionalNextActionCapture(request)));
}
