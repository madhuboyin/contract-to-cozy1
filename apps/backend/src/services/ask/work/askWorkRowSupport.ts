import type { AskWorkBoundary, AskWorkLaunch } from '../askWork.contract';

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
