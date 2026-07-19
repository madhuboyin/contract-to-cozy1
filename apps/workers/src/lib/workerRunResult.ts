// apps/workers/src/lib/workerRunResult.ts
//
// WKR-008: several job handlers previously caught errors, logged them, and
// returned normally — the scheduler in worker.ts then treated any resolved
// promise as SUCCEEDED regardless of what actually happened. This gives
// handlers an opt-in structured result so the scheduler can tell
// SUCCEEDED, PARTIAL (some items failed but the run made progress), and
// FAILED (nothing succeeded) apart, even when the handler's promise
// resolves rather than rejects.
//
// Deliberately workers-local (not apps/backend/src/config/) — this is a
// scheduler-only concern with no backend caller, so it doesn't need a slot
// in the Docker curated copy list.

export type WorkerRunStatus = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

export interface WorkerRunResult {
  /** Total candidate items considered this run. */
  examined: number;
  created?: number;
  updated?: number;
  notified?: number;
  /** Intentionally skipped (idempotency, not applicable, etc) — not a failure signal. */
  skipped?: number;
  /** Items that errored. Drives PARTIAL/FAILED classification below. */
  failed?: number;
  /** Human-readable context, surfaced in cron history/metrics on PARTIAL or FAILED. */
  reason?: string;
}

/**
 * A handler opts into structured reporting simply by returning an object
 * shaped like WorkerRunResult; a plain `Promise<void>` handler keeps
 * working exactly as before (treated as SUCCEEDED on resolve, FAILED on
 * reject) — this is purely additive.
 */
export function isWorkerRunResult(value: unknown): value is WorkerRunResult {
  return !!value && typeof value === 'object' && typeof (value as WorkerRunResult).examined === 'number';
}

/**
 * FAILED here means "resolved, but nothing succeeded" — the scheduler
 * treats this identically to a thrown error (see scheduleCronJobs in
 * worker.ts) rather than recording a false SUCCEEDED.
 */
export function deriveRunStatus(result: WorkerRunResult): WorkerRunStatus {
  const failed = result.failed ?? 0;
  if (failed <= 0) return 'SUCCEEDED';
  const succeededSome = (result.notified ?? 0) + (result.created ?? 0) + (result.updated ?? 0) > 0;
  return succeededSome ? 'PARTIAL' : 'FAILED';
}
