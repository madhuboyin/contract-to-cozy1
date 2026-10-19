import { prisma } from '../../../lib/prisma';
import type { AskWorkBoundary, AskWorkLaunch } from '../askWork.contract';
import type { AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';

export const EMPTY_WORK_LAUNCH: AskWorkLaunch = Object.freeze({
  operationId: null, entityType: null, entityId: null, actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null,
});

export function workLaunch(overrides: Partial<AskWorkLaunch>): AskWorkLaunch {
  return { ...EMPTY_WORK_LAUNCH, ...overrides };
}

/** The boundary a reader's keyset resumes after: the row's `sortAt` instant and its workKey suffix, ordered (sortAt desc, key asc). */
export function boundaryInstant(after: AskWorkBoundary | null): Date | null {
  if (!after) return null;
  const instant = new Date(after.sortAt);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function truncateTitle(value: string, max = 120): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Narrows a where clause to the rows strictly after the shared (sortAt desc, workKey asc) boundary. `prefix` is the reader's workKey
 * prefix: at the boundary's exact instant a row resumes by workKey order across every provider, so this reader's rows follow a boundary
 * key that sorts before its prefix, follow the same prefix by id, and never follow a boundary key that sorts after it.
 */
export function afterBoundaryWhere<W extends object>(inView: W, after: AskWorkBoundary | null, prefix: string): W | { AND: object[] } {
  const instant = boundaryInstant(after);
  if (!after || !instant) return inView;
  const sameInstant = after.workKey.startsWith(prefix) ? { id: { gt: after.workKey.slice(prefix.length) } }
    : prefix > after.workKey ? {} : { id: { in: [] as string[] } };
  return { AND: [inView, { OR: [{ updatedAt: { lt: instant } }, { AND: [{ updatedAt: instant }, sameInstant] }] }] };
}

/** The home work items that back the given source entities, from one batched lookup (never one call per row). */
export async function workItemIdsByExecution(executionType: 'PROJECT' | 'GUIDANCE' | 'CLAIM', entityIds: readonly string[]): Promise<Map<string, string[]>> {
  const byEntity = new Map<string, string[]>();
  if (entityIds.length === 0) return byEntity;
  const executions = await prisma.operationalWorkExecution.findMany({
    where: { executionType, executionEntityId: { in: [...entityIds] } },
    select: { workItemId: true, executionEntityId: true },
  });
  for (const execution of executions) byEntity.set(execution.executionEntityId, [...(byEntity.get(execution.executionEntityId) ?? []), execution.workItemId]);
  return byEntity;
}

/** Counts every view a provider serves with the same predicate its row query uses, so tabs and lists cannot disagree. */
export async function countViews(
  views: readonly AskWorkLifecycleView[],
  served: readonly AskWorkLifecycleView[],
  count: (view: AskWorkLifecycleView) => Promise<number>,
): Promise<Partial<Record<AskWorkLifecycleView, number>>> {
  const counts = await Promise.all(served.map((view) => count(view)));
  const result: Partial<Record<AskWorkLifecycleView, number>> = {};
  for (const view of views) result[view] = 0;
  served.forEach((view, index) => { result[view] = counts[index]; });
  return result;
}
