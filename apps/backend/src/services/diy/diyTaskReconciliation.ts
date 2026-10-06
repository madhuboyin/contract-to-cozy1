// apps/backend/src/services/diy/diyTaskReconciliation.ts
//
// The worker handler for DIY_TASK_COMPLETED_RECONCILE (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.2). PURE, like the completion
// effects handler: it imports no service and no database client, only the terminal-error class, and everything it touches comes through
// `DiyTaskReconciliationDeps`. The default wiring lives in `diyTaskReconciliationAdapters.ts`.
//
// Order: (1) PREFLIGHT, before any write: a well-formed snapshot, then the task (deleted, no longer completed, on another property). (2) For each
// snapshotted project that has no FINAL outcome yet, apply the approved O12 rule through the DIY service and RECORD the outcome on the event, so a retry or a
// recovery redoes only what failed. The mode is exactly what the completion said; an unknown mode is never inferred.
import { TerminalDomainEventError } from '../domainEvents/terminalDomainEventError';

export type ReconcileMode = 'DIY' | 'PROVIDER' | null;

export type DiyReconcileSnapshot = {
  taskId: string;
  propertyId: string;
  occurrenceId: string;
  actorUserId: string;
  completedAt: string; // ISO
  fulfillmentMode: ReconcileMode;
  completionKey: string | null;
  projectIds: string[];
};

/** Outcomes that are final: never revisited by a retry or a recovery. */
export type FinalProjectOutcome = 'HIRED_OUT' | 'COMPLETED' | 'CLOSED_BY_LINKED_TASK' | 'NEEDS_REVIEW' | 'ALREADY_CLOSED' | 'PROJECT_GONE';
export type ProjectOutcome = FinalProjectOutcome | 'FAILED';
export const FINAL_PROJECT_OUTCOMES: ReadonlySet<string> = new Set<FinalProjectOutcome>(['HIRED_OUT', 'COMPLETED', 'CLOSED_BY_LINKED_TASK', 'NEEDS_REVIEW', 'ALREADY_CLOSED', 'PROJECT_GONE']);

export type TaskRef = { id: string; propertyId: string; status: string };

export interface DiyTaskReconciliationDeps {
  getTask(taskId: string): Promise<TaskRef | null>;
  /** Applies the rule to one project (one transaction behind the project claim); returns its outcome. */
  reconcileProject(input: { projectId: string; propertyId: string; mode: ReconcileMode; actorUserId: string; completedAt: Date }): Promise<FinalProjectOutcome>;
  /** Persists one project's outcome on the event (bounded to the snapshotted ids). Called after each project, before the next. */
  recordOutcome(eventId: string, projectId: string, outcome: ProjectOutcome): Promise<void>;
}

export type DiyTaskReconciliationResult = {
  result: 'APPLIED' | 'TASK_DELETED' | 'TASK_NO_LONGER_COMPLETED';
  projectOutcomes: Record<string, ProjectOutcome>;
};

export const DIY_RECONCILE_MAX_PROJECTS = 25;

/** Raised when one or more projects failed; the event retries and only those projects are redone. */
export class DiyTaskReconciliationFailed extends Error {
  constructor(readonly failures: Array<{ projectId: string; message: string }>, readonly projectOutcomes: Record<string, ProjectOutcome>) {
    super(failures.map((failure) => `PROJECT ${failure.projectId}: ${failure.message}`).join('; '));
    this.name = 'DiyTaskReconciliationFailed';
  }
}

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function parseReconcileSnapshot(payload: unknown): DiyReconcileSnapshot {
  const p = (payload ?? {}) as Record<string, unknown>;
  const mode = p.fulfillmentMode;
  const ids = p.projectIds;
  const ok = text(p.taskId) && text(p.propertyId) && text(p.occurrenceId) && text(p.actorUserId) && text(p.completedAt) && !Number.isNaN(new Date(p.completedAt as string).getTime())
    && (mode === null || mode === undefined || mode === 'DIY' || mode === 'PROVIDER')
    && Array.isArray(ids) && ids.length > 0 && ids.length <= DIY_RECONCILE_MAX_PROJECTS && ids.every(text);
  if (!ok) throw new TerminalDomainEventError('SNAPSHOT_INVALID', 'The DIY task reconciliation event payload is missing required fields.');
  return {
    taskId: p.taskId as string, propertyId: p.propertyId as string, occurrenceId: p.occurrenceId as string, actorUserId: p.actorUserId as string,
    completedAt: p.completedAt as string, fulfillmentMode: (mode ?? null) as ReconcileMode, completionKey: text(p.completionKey) ? (p.completionKey as string) : null,
    projectIds: [...new Set(ids as string[])],
  };
}

export async function processDiyTaskReconciliationEvent(event: { id: string; payload: unknown }, deps: DiyTaskReconciliationDeps): Promise<DiyTaskReconciliationResult> {
  const snapshot = parseReconcileSnapshot(event.payload);
  const recorded = ((event.payload as Record<string, unknown>)?.projectOutcomes ?? {}) as Record<string, ProjectOutcome>;
  const outcomes: Record<string, ProjectOutcome> = {};
  for (const projectId of snapshot.projectIds) if (recorded[projectId]) outcomes[projectId] = recorded[projectId];

  // 1. Preflight, before any write.
  const task = await deps.getTask(snapshot.taskId);
  // `maintenanceTaskId` on a project is a plain string, so a deleted task leaves a dangling link: a typed, FINAL skip. The projects are left open and the
  // page says so (it never treats "not found" as "nothing to say").
  if (!task) return { result: 'TASK_DELETED', projectOutcomes: outcomes };
  if (task.propertyId !== snapshot.propertyId) {
    throw new TerminalDomainEventError('INTEGRITY_CROSS_PROPERTY', 'The completed maintenance task belongs to a different property than the DIY projects were snapshotted for.');
  }
  if (task.status !== 'COMPLETED') return { result: 'TASK_NO_LONGER_COMPLETED', projectOutcomes: outcomes };

  // 2. Each project that has no final outcome yet, independently.
  const failures: Array<{ projectId: string; message: string }> = [];
  for (const projectId of snapshot.projectIds) {
    if (FINAL_PROJECT_OUTCOMES.has(outcomes[projectId])) continue;
    try {
      const outcome = await deps.reconcileProject({ projectId, propertyId: snapshot.propertyId, mode: snapshot.fulfillmentMode, actorUserId: snapshot.actorUserId, completedAt: new Date(snapshot.completedAt) });
      outcomes[projectId] = outcome;
      await deps.recordOutcome(event.id, projectId, outcome);
    } catch (error: any) {
      outcomes[projectId] = 'FAILED';
      failures.push({ projectId, message: String(error?.message ?? error).slice(0, 300) });
      try { await deps.recordOutcome(event.id, projectId, 'FAILED'); } catch { /* the failure is reported below either way */ }
    }
  }
  if (failures.length > 0) throw new DiyTaskReconciliationFailed(failures, outcomes);
  return { result: 'APPLIED', projectOutcomes: outcomes };
}
