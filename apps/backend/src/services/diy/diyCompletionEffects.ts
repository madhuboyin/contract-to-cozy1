// apps/backend/src/services/diy/diyCompletionEffects.ts
//
// The worker handler for DIY_PROJECT_COMPLETED (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 3.2). PURE: it imports no service and no
// database client, only types and the terminal-error class; everything it touches comes through `DiyCompletionEffectDeps`, the same injected-dependency
// shape the domain-events job uses. The default wiring (home event service, governed maintenance completion, Prisma) lives in
// `diyCompletionEffectsAdapters.ts`.
//
// What it does, in order: (1) PREFLIGHT every condition that can fail for good, before anything is written, so an integrity failure never leaves a
// half-applied completion; (2) attempt each effect, even if an earlier one failed, and throw at the end if any failed so the event retries and the
// retry skips what is already done. Every effect is idempotent by its own key. Incidents are deliberately not touched (decision O13).
import { TerminalDomainEventError } from '../domainEvents/terminalDomainEventError';

export type DiyCompletionSnapshot = {
  projectId: string;
  propertyId: string;
  actorUserId: string;
  completedAt: string; // ISO
  title: string;
  category: string;
  actualMinutes: number | null;
  actualMaterialCostCents: number | null;
  maintenanceTaskId: string | null;
};

export type TaskRef = { id: string; propertyId: string; status: string };

export interface DiyCompletionEffectDeps {
  getTask(taskId: string): Promise<TaskRef | null>;
  /** Returns the keyed home event, creating it only if it does not exist. */
  ensureHomeEvent(input: { snapshot: DiyCompletionSnapshot; eventType: 'IMPROVEMENT' | 'MAINTENANCE'; idempotencyKey: string }): Promise<{ id: string; existed: boolean }>;
  /** Stores the home event id on the project only where it has none. */
  linkHomeEvent(projectId: string, homeEventId: string): Promise<void>;
  /** The governed maintenance completion, with the actor and the project's key. Throws on a lost race or any failure. */
  completeTask(input: { snapshot: DiyCompletionSnapshot; taskId: string; completionKey: string }): Promise<void>;
}

export type HomeEventOutcome = 'DONE' | 'ALREADY_DONE';
export type MaintenanceOutcome = 'NOT_LINKED' | 'DONE' | 'ALREADY_DONE' | 'SKIPPED_TARGET_MISSING';
export type DiyCompletionOutcome = { homeEvent: HomeEventOutcome; maintenance: MaintenanceOutcome };

export const DIY_COMPLETION_EVENT_KEY = (projectId: string) => `diy-project-completed:${projectId}`;
export const DIY_HOME_EVENT_KEY = (projectId: string) => `diy-complete-${projectId}`;

const IMPROVEMENT_CATEGORIES = ['PAINTING', 'EXTERIOR', 'FLOORING'];

/** Raised when one or more effects failed after preflight; the event retries. `failures` names each failing effect with its typed reason. */
export class DiyCompletionEffectsFailed extends Error {
  constructor(readonly failures: Array<{ effect: 'HOME_EVENT' | 'MAINTENANCE'; reason: string; message: string }>, readonly partial: Partial<DiyCompletionOutcome>) {
    super(failures.map((failure) => `${failure.effect}:${failure.reason}: ${failure.message}`).join('; '));
    this.name = 'DiyCompletionEffectsFailed';
  }
}

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function parseSnapshot(payload: unknown): DiyCompletionSnapshot {
  const p = (payload ?? {}) as Record<string, unknown>;
  const ok = text(p.projectId) && text(p.propertyId) && text(p.actorUserId) && text(p.completedAt) && !Number.isNaN(new Date(p.completedAt as string).getTime())
    && text(p.title) && text(p.category) && (p.maintenanceTaskId === null || p.maintenanceTaskId === undefined || text(p.maintenanceTaskId));
  if (!ok) throw new TerminalDomainEventError('SNAPSHOT_INVALID', 'The DIY completion event payload is missing required fields.');
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    projectId: p.projectId as string,
    propertyId: p.propertyId as string,
    actorUserId: p.actorUserId as string,
    completedAt: p.completedAt as string,
    title: p.title as string,
    category: p.category as string,
    actualMinutes: number(p.actualMinutes),
    actualMaterialCostCents: number(p.actualMaterialCostCents),
    maintenanceTaskId: text(p.maintenanceTaskId) ? (p.maintenanceTaskId as string) : null,
  };
}

export async function processDiyProjectCompletedEvent(event: { id: string; payload: unknown }, deps: DiyCompletionEffectDeps): Promise<DiyCompletionOutcome> {
  const snapshot = parseSnapshot(event.payload);

  // 1. Preflight: everything that can fail terminally, before any effect.
  let task: TaskRef | null = null;
  if (snapshot.maintenanceTaskId) {
    task = await deps.getTask(snapshot.maintenanceTaskId);
    if (task && task.propertyId !== snapshot.propertyId) {
      throw new TerminalDomainEventError('INTEGRITY_CROSS_PROPERTY', 'The linked maintenance task belongs to a different property than the DIY project.');
    }
  }

  // 2. Effects. Each is attempted even if the other failed.
  const failures: Array<{ effect: 'HOME_EVENT' | 'MAINTENANCE'; reason: string; message: string }> = [];
  const partial: Partial<DiyCompletionOutcome> = {};

  try {
    const eventType = IMPROVEMENT_CATEGORIES.includes(snapshot.category) ? 'IMPROVEMENT' : 'MAINTENANCE';
    const home = await deps.ensureHomeEvent({ snapshot, eventType, idempotencyKey: DIY_HOME_EVENT_KEY(snapshot.projectId) });
    await deps.linkHomeEvent(snapshot.projectId, home.id);
    partial.homeEvent = home.existed ? 'ALREADY_DONE' : 'DONE';
  } catch (error: any) {
    failures.push({ effect: 'HOME_EVENT', reason: 'UNEXPECTED', message: String(error?.message ?? error).slice(0, 300) });
  }

  if (!snapshot.maintenanceTaskId) {
    partial.maintenance = 'NOT_LINKED';
  } else if (!task) {
    partial.maintenance = 'SKIPPED_TARGET_MISSING';
  } else if (task.status === 'COMPLETED') {
    partial.maintenance = 'ALREADY_DONE';
  } else {
    try {
      await deps.completeTask({ snapshot, taskId: snapshot.maintenanceTaskId, completionKey: DIY_COMPLETION_EVENT_KEY(snapshot.projectId) });
      partial.maintenance = 'DONE';
    } catch (error: any) {
      // The task may have been completed by someone else between the pre-read and the governed call (or by an earlier attempt of this event whose
      // later steps then failed). Re-read: a task that is now COMPLETED is a transition that already succeeded elsewhere, not a failure to retry.
      let current: TaskRef | null = null;
      try { current = await deps.getTask(snapshot.maintenanceTaskId); } catch { /* fall through to the original error */ }
      if (current?.status === 'COMPLETED') partial.maintenance = 'ALREADY_DONE';
      else if (current === null) partial.maintenance = 'SKIPPED_TARGET_MISSING';
      else if (/concurrent update/i.test(String(error?.message))) failures.push({ effect: 'MAINTENANCE', reason: 'CONFLICT_STATE', message: `The task is ${current.status} and could not be completed.` });
      else failures.push({ effect: 'MAINTENANCE', reason: 'UNEXPECTED', message: String(error?.message ?? error).slice(0, 300) });
    }
  }

  if (failures.length > 0) throw new DiyCompletionEffectsFailed(failures, partial);
  return partial as DiyCompletionOutcome;
}
