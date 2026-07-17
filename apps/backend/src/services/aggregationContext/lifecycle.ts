import type { PropertyContextSnapshot } from '../../modules/propertyContext';

export type AggregationLifecycleStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'SNOOZED'
  | 'SUPPRESSED'
  | 'EXPIRED';

export interface AggregationLifecycleItem {
  identity: string;
  source: 'MAINTENANCE' | 'GUIDANCE';
  sourceId: string | null;
  actionKey: string | null;
  status: AggregationLifecycleStatus;
  updatedAt: string | null;
}

const STATUS_PRIORITY: Record<AggregationLifecycleStatus, number> = {
  COMPLETED: 5,
  SUPPRESSED: 4,
  SNOOZED: 3,
  ACTIVE: 2,
  EXPIRED: 1,
};

function normalizeStatus(value: unknown): AggregationLifecycleStatus {
  const status = String(value ?? '').toUpperCase();
  if (['COMPLETED', 'DONE', 'RESOLVED'].includes(status)) return 'COMPLETED';
  if (['SNOOZED', 'DEFERRED'].includes(status)) return 'SNOOZED';
  if (['SUPPRESSED', 'DISMISSED', 'CANCELLED', 'CANCELED'].includes(status)) return 'SUPPRESSED';
  if (['EXPIRED', 'ARCHIVED'].includes(status)) return 'EXPIRED';
  return 'ACTIVE';
}

export function aggregationLifecycleIdentity(input: {
  actionKey?: unknown;
  sourceId?: unknown;
  fallback: string;
}): string {
  const actionKey = typeof input.actionKey === 'string' ? input.actionKey.trim().toUpperCase() : '';
  if (actionKey) return `ACTION:${actionKey}`;
  const sourceId = typeof input.sourceId === 'string' ? input.sourceId.trim() : '';
  return sourceId ? `SOURCE:${sourceId}` : input.fallback;
}

/**
 * Produces the shared lifecycle projection used by every Phase 7 surface.
 * Duplicate identities collapse deterministically and terminal state wins.
 */
export function projectAggregationLifecycle(
  context: PropertyContextSnapshot,
): AggregationLifecycleItem[] {
  const output = new Map<string, AggregationLifecycleItem>();
  const add = (item: AggregationLifecycleItem) => {
    const current = output.get(item.identity);
    if (!current || STATUS_PRIORITY[item.status] > STATUS_PRIORITY[current.status]) {
      output.set(item.identity, item);
    }
  };

  const maintenance = context.facts['maintenance.tasks'];
  if (maintenance?.state === 'KNOWN' && Array.isArray(maintenance.value)) {
    maintenance.value.forEach((raw: any, index: number) => {
      const identity = aggregationLifecycleIdentity({
        actionKey: raw.actionKey ?? raw.seasonalTaskKey,
        sourceId: raw.id,
        fallback: `MAINTENANCE:${index}`,
      });
      add({
        identity,
        source: 'MAINTENANCE',
        sourceId: typeof raw.id === 'string' ? raw.id : null,
        actionKey: typeof (raw.actionKey ?? raw.seasonalTaskKey) === 'string'
          ? (raw.actionKey ?? raw.seasonalTaskKey)
          : null,
        status: normalizeStatus(raw.status),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      });
    });
  }

  const guidance = context.facts['guidance.activeSignals'];
  if (guidance?.state === 'KNOWN' && Array.isArray(guidance.value)) {
    guidance.value.forEach((raw: any, index: number) => {
      const identity = aggregationLifecycleIdentity({
        actionKey: raw.actionKey ?? raw.signalKey ?? raw.intentFamily,
        sourceId: raw.id ?? raw.signalId,
        fallback: `GUIDANCE:${index}`,
      });
      add({
        identity,
        source: 'GUIDANCE',
        sourceId: typeof (raw.id ?? raw.signalId) === 'string' ? (raw.id ?? raw.signalId) : null,
        actionKey: typeof (raw.actionKey ?? raw.signalKey ?? raw.intentFamily) === 'string'
          ? (raw.actionKey ?? raw.signalKey ?? raw.intentFamily)
          : null,
        status: normalizeStatus(raw.status),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      });
    });
  }

  return [...output.values()].sort((a, b) => a.identity.localeCompare(b.identity));
}

export function isAggregationItemActionable(
  lifecycle: AggregationLifecycleItem[],
  identity: string,
): boolean {
  const item = lifecycle.find((candidate) => candidate.identity === identity);
  return !item || item.status === 'ACTIVE';
}
