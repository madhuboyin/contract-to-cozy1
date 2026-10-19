import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

// Sole Homeowner Interface Phase 8 (FR-PLAT-002): keeping answers that are still on screen honest after a canonical write.
// A write that may have changed an answer marks it STALE (durably, on the execution) and then tries to refresh it. A refresh that works clears the mark
// with the new answer; a refresh that cannot run leaves the mark, so the answer is shown as possibly out of date with a way to refresh it. A stale mark never
// changes the receipt of the write that caused it.
const KEY = 'reconciliation';

export interface StaleMarker { staleSince: string; becauseOperationId: string | null }

type Json = Prisma.JsonValue | Prisma.InputJsonValue | null | undefined;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function staleMarkerFor(parametersJson: Json): StaleMarker | null {
  if (!isObject(parametersJson)) return null;
  const marker = (parametersJson as Record<string, unknown>)[KEY];
  if (!isObject(marker) || typeof marker.staleSince !== 'string') return null;
  return { staleSince: marker.staleSince, becauseOperationId: typeof marker.becauseOperationId === 'string' ? marker.becauseOperationId : null };
}

export function withStaleMarker(parametersJson: Json, marker: StaleMarker): Prisma.InputJsonValue {
  return { ...(isObject(parametersJson) ? (parametersJson as Record<string, unknown>) : {}), [KEY]: { ...marker } } as Prisma.InputJsonValue;
}

export function withoutStaleMarker<T extends Json>(parametersJson: T): T {
  if (!isObject(parametersJson) || !(KEY in (parametersJson as Record<string, unknown>))) return parametersJson;
  const { [KEY]: _removed, ...rest } = parametersJson as Record<string, unknown>;
  void _removed;
  return rest as unknown as T;
}

/**
 * Marks executions stale without changing when they were last updated (their place in history is theirs, not the write's). A row that changed since it was
 * read is left alone: whoever changed it was refreshing it. Returns the ids actually marked.
 */
export async function markExecutionsStale(
  rows: ReadonlyArray<{ id: string; updatedAt: Date; parametersJson: Prisma.JsonValue | null }>,
  becauseOperationId: string | null,
): Promise<string[]> {
  const marker: StaleMarker = { staleSince: new Date().toISOString(), becauseOperationId };
  const outcomes = await Promise.allSettled(rows.map(async (row) => {
    if (staleMarkerFor(row.parametersJson)) return row.id; // already stale: keep the earlier time
    const write = await prisma.askExecution.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { parametersJson: withStaleMarker(row.parametersJson, marker), updatedAt: row.updatedAt },
    });
    return write.count === 1 ? row.id : null;
  }));
  return outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []));
}

/** What reconciliation did for one confirmed write, collected without every handler having to pass it along. */
export interface ReconciliationScope {
  invoked: boolean;
  refreshedExecutionIds: Set<string>;
  /** Answers in this conversation that could not be refreshed and are marked stale. */
  staleExecutionIds: Set<string>;
  /** Answers in other conversations marked stale; they show it when reopened. */
  markedElsewhere: number;
}

const storage = new AsyncLocalStorage<ReconciliationScope>();

export async function runInReconciliationScope<T>(work: () => Promise<T>): Promise<{ value: T; scope: ReconciliationScope }> {
  const scope: ReconciliationScope = { invoked: false, refreshedExecutionIds: new Set(), staleExecutionIds: new Set(), markedElsewhere: 0 };
  const value = await storage.run(scope, work);
  return { value, scope };
}

export function recordReconciliationOutcome(outcome: { refreshedExecutionIds: readonly string[]; staleExecutionIds: readonly string[]; markedElsewhere: number }): void {
  const scope = storage.getStore();
  if (!scope) return;
  scope.invoked = true;
  for (const id of outcome.refreshedExecutionIds) { scope.refreshedExecutionIds.add(id); scope.staleExecutionIds.delete(id); }
  for (const id of outcome.staleExecutionIds) if (!scope.refreshedExecutionIds.has(id)) scope.staleExecutionIds.add(id);
  scope.markedElsewhere += outcome.markedElsewhere;
}

/** True once reconciliation has run in the current confirmation. */
export function reconciliationWasRun(): boolean {
  return storage.getStore()?.invoked ?? false;
}
