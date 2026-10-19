import type { OperationalWorkItemDisposition, OperationalWorkItemState, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_PROVIDER_REGISTRY, workActionAllowed, ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView, type AskWorkProviderDefinition } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { boundaryInstant, truncateTitle, workLaunch } from './askWorkRowSupport';

const WORK_ITEM_KEY_PREFIX = 'workItem:';

const STATE_LABELS: Record<OperationalWorkItemState, string> = {
  CANDIDATE: 'Suggested', ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', IN_GUIDANCE: 'In a guide', IN_PROJECT: 'In a project',
  BLOCKED: 'Blocked', DEFERRED: 'Deferred', REPORTED_COMPLETE: 'Reported complete', REOPENED: 'Reopened', VERIFIED: 'Verified', FOLLOW_UP_DUE: 'Follow-up due', CLOSED: 'Closed',
};

/** The homeowner's next step for each active state; null when there is nothing left to do. */
const NEXT_STEP: Partial<Record<OperationalWorkItemState, string>> = {
  ACCEPTED: 'Start or schedule this', REOPENED: 'Look at this again', FOLLOW_UP_DUE: 'Do the follow-up', IN_PROGRESS: 'Mark it done when finished',
  IN_GUIDANCE: 'Continue the guide', IN_PROJECT: 'Check the project', BLOCKED: 'Unblock this', DEFERRED: 'Decide when to return to this', REPORTED_COMPLETE: 'Confirm it is done', SCHEDULED: 'Review the schedule',
};

const VIEW_STATES: Record<AskWorkLifecycleView, OperationalWorkItemState[]> = {
  NEEDS_YOU: ['ACCEPTED', 'REOPENED', 'FOLLOW_UP_DUE'],
  ACTIVE: ['IN_PROGRESS', 'IN_GUIDANCE', 'IN_PROJECT'],
  WAITING: ['BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE'],
  SCHEDULED: ['SCHEDULED'],
  COMPLETED: ['VERIFIED', 'CLOSED'],
  ARCHIVED: ['CLOSED'],
};

/**
 * The lifecycle view of a work item, derived from its canonical state without replacing it. A CANDIDATE is a suggestion, not work (it
 * belongs to Home actions), so it has no view. A closed item with no disposition completed; one closed with a disposition (dismissed,
 * duplicate, expired, not relevant) is archived.
 */
export function workItemLifecycleView(state: OperationalWorkItemState, disposition: OperationalWorkItemDisposition | null): AskWorkLifecycleView | null {
  if (state === 'CANDIDATE') return null;
  if (state === 'CLOSED') return disposition ? 'ARCHIVED' : 'COMPLETED';
  return ASK_WORK_LIFECYCLE_VIEWS.find((view) => view !== 'ARCHIVED' && VIEW_STATES[view].includes(state)) ?? null;
}

function viewWhere(view: AskWorkLifecycleView): Prisma.OperationalWorkItemWhereInput {
  if (view === 'COMPLETED') return { OR: [{ state: 'VERIFIED' }, { state: 'CLOSED', disposition: null }] };
  if (view === 'ARCHIVED') return { state: 'CLOSED', disposition: { not: null } };
  return { state: { in: VIEW_STATES[view] } };
}

const EXECUTION_ALIAS_KINDS: Record<string, string> = { MAINTENANCE_TASK: 'maintenanceTask', GUIDANCE: 'journey', PROJECT: 'project', BOOKING: 'booking', CLAIM: 'claim' };

/**
 * Work whose resume owner is another canonical Work provider is that provider's row, not this projection's. Exclusion applies only once
 * the owning provider is CONNECTED, so work never disappears while its canonical reader does not exist yet.
 */
function ownedByConnectedProvider(registry: readonly AskWorkProviderDefinition[]): Prisma.OperationalWorkItemWhereInput[] {
  const connected = (id: string) => registry.find((entry) => entry.id === id)?.reader.state === 'CONNECTED';
  const exclusions: Prisma.OperationalWorkItemWhereInput[] = [];
  if (connected('PROJECTS')) exclusions.push({ executions: { some: { executionType: 'PROJECT', role: 'PRIMARY' } } });
  if (connected('GUIDANCE_JOURNEYS')) exclusions.push({ executions: { some: { executionType: 'GUIDANCE', role: 'PRIMARY' } } });
  if (connected('CLAIMS')) exclusions.push({ executions: { some: { executionType: 'CLAIM', role: 'PRIMARY' } } });
  if (connected('INCIDENTS')) exclusions.push({ sources: { some: { sourceType: 'INCIDENT', active: true } } });
  return exclusions;
}

interface WorkItemRecord {
  id: string;
  propertyId: string;
  state: OperationalWorkItemState;
  disposition: OperationalWorkItemDisposition | null;
  title: string;
  homeownerReason: string;
  updatedAt: Date;
  executions: Array<{ executionType: string; executionEntityId: string }>;
}

export function operationalWorkItemRow(item: WorkItemRecord, role: Parameters<typeof workActionAllowed>[2], definition: AskWorkProviderDefinition): AskWorkRow | null {
  const lifecycleView = workItemLifecycleView(item.state, item.disposition);
  if (!lifecycleView) return null;
  const sortAt = item.updatedAt.toISOString();
  const nextStep = NEXT_STEP[item.state];
  return {
    workKey: `${WORK_ITEM_KEY_PREFIX}${item.id}`,
    sourceAliases: [...new Set(item.executions.flatMap((execution) => EXECUTION_ALIAS_KINDS[execution.executionType] ? [`${EXECUTION_ALIAS_KINDS[execution.executionType]}:${execution.executionEntityId}`] : []))],
    providerId: 'OPERATIONAL_WORK_ITEMS',
    workType: 'HOME_WORK_ITEM',
    propertyId: item.propertyId,
    entity: { type: 'OperationalWorkItem', id: item.id },
    title: truncateTitle(item.title) || 'Home work item',
    summary: truncateTitle(item.homeownerReason, 200) || null,
    status: { canonical: item.state, label: STATE_LABELS[item.state] },
    lifecycleView,
    nextAction: nextStep ? { label: nextStep, operationId: 'HOME_WORK_ITEM_COMMAND', allowed: workActionAllowed(definition, 'HOME_WORK_ITEM_COMMAND', role) } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'home-operations',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'HOME_WORK_ITEMS', entityType: 'OperationalWorkItem', entityId: item.id, workItemId: item.id }) },
  };
}

/** Builds the reader against a registry (so ownership exclusion follows which canonical providers are connected). */
export function createOperationalWorkItemReader(registry: readonly AskWorkProviderDefinition[] = ASK_WORK_PROVIDER_REGISTRY): AskWorkProviderReader {
  const definition = registry.find((entry) => entry.id === 'OPERATIONAL_WORK_ITEMS')!;
  return async (context, query) => {
    const base: Prisma.OperationalWorkItemWhereInput = {
      propertyId: context.propertyId,
      supersededByWorkItemId: null,
      NOT: ownedByConnectedProvider(registry),
    };
    const statusFilter = query.status ? { state: query.status as OperationalWorkItemState } : {};
    const inView: Prisma.OperationalWorkItemWhereInput  = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view), statusFilter] };
    const instant = boundaryInstant(query.after);
    // Same-instant rows resume by workKey order across every provider: this provider's keys all start with the work-item prefix.
    const sameInstant: Prisma.OperationalWorkItemWhereInput | null = !query.after ? null
      : query.after.workKey.startsWith(WORK_ITEM_KEY_PREFIX) ? { id: { gt: query.after.workKey.slice(WORK_ITEM_KEY_PREFIX.length) } }
        : WORK_ITEM_KEY_PREFIX > query.after.workKey ? {} : { id: { in: [] } };
    const paged: Prisma.OperationalWorkItemWhereInput = instant && sameInstant
      ? { AND: [inView, { OR: [{ updatedAt: { lt: instant } }, { AND: [{ updatedAt: instant }, sameInstant] }] }] }
      : inView;
    const [items, total, grouped] = await Promise.all([
      prisma.operationalWorkItem.findMany({
        where: paged,
        select: { id: true, propertyId: true, state: true, disposition: true, title: true, homeownerReason: true, updatedAt: true, executions: { select: { executionType: true, executionEntityId: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: query.limit,
      }),
      prisma.operationalWorkItem.count({ where: inView }),
      prisma.operationalWorkItem.groupBy({ by: ['state', 'disposition'], where: { AND: [base, { state: { not: 'CANDIDATE' } }] }, _count: { _all: true } }),
    ]);
    const viewCounts: Partial<Record<AskWorkLifecycleView, number>> = {};
    for (const view of ASK_WORK_LIFECYCLE_VIEWS) viewCounts[view] = 0;
    for (const group of grouped) {
      const view = workItemLifecycleView(group.state, group.disposition);
      if (!view) continue;
      viewCounts[view] = (viewCounts[view] ?? 0) + group._count._all;
    }
    const rows = items.flatMap((item) => {
      const row = operationalWorkItemRow(item, context.role, definition);
      return row ? [row] : [];
    });
    return { rows, total, viewCounts };
  };
}
