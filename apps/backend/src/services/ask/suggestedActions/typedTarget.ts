// A selected Suggested Next Action names its exact record and outcome (stored server-side and written into the launch context by
// createAskExecution). That target is authoritative: if the record is no longer among the live rows, or its version moved on since the
// action was offered, the selection is stale. Handlers must then return `staleSuggestedActionResult()` and must NOT fall back to matching
// the message text, which could land on a different record with a similar name.
export interface TypedTargetLaunch {
  entityType?: string | null;
  entityId?: string | null;
  outcomeKey?: string | null;
  contextVersion?: string | null;
}

export type TypedTargetResolution<T> =
  | { kind: 'NOT_TYPED' }
  | { kind: 'STALE' }
  | { kind: 'TARGET'; row: T };

/**
 * `outcomeRegistered` is the handler's own check that `launch.outcomeKey` is one of its registered outcomes; an unknown outcome is
 * ignored (NOT_TYPED), so a forged key cannot change behaviour. A null `contextVersion` on the launch (a receipt that had no record read)
 * means existence is the only check.
 */
export function resolveTypedActionTarget<T extends { id: string }>(
  rows: readonly T[],
  launch: TypedTargetLaunch | null | undefined,
  spec: { entityType: string; outcomeRegistered: boolean; versionOf: (row: T) => string },
): TypedTargetResolution<T> {
  if (!launch || launch.entityType !== spec.entityType || !launch.entityId || !spec.outcomeRegistered) return { kind: 'NOT_TYPED' };
  const row = rows.find((candidate) => candidate.id === launch.entityId);
  if (!row) return { kind: 'STALE' };
  if (launch.contextVersion && launch.contextVersion !== spec.versionOf(row)) return { kind: 'STALE' };
  return { kind: 'TARGET', row };
}
