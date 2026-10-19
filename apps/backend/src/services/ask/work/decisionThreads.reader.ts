import type { DecisionThreadContextStatus, DecisionThreadLifecycleStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { boundaryInstant, truncateTitle, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'decisionThread:';
/** The decision families Ask can continue today (HVAC_DECISION_CONTINUE). Every other family is still listed, with its resume marked unavailable. */
export const ASK_RESUMABLE_DECISION_DEFINITION_IDS: readonly string[] = ['HVAC_REPAIR_REPLACE'];

const LIFECYCLE_LABELS: Record<DecisionThreadLifecycleStatus, string> = {
  OPEN: 'Started', GATHERING_CONTEXT: 'Gathering details', READY_TO_COMPARE: 'Ready to compare', RECOMMENDATION_AVAILABLE: 'Recommendation ready',
  ACTION_IN_PROGRESS: 'Acting on it', DECIDED: 'Decided', COMPLETED: 'Completed', ABANDONED: 'Set aside', ARCHIVED: 'Archived',
};

const NEXT_STEP: Partial<Record<DecisionThreadLifecycleStatus, string>> = {
  OPEN: 'Add what Cozy needs to compare', GATHERING_CONTEXT: 'Add what Cozy needs to compare', READY_TO_COMPARE: 'Compare your options',
  RECOMMENDATION_AVAILABLE: 'Review the recommendation', ACTION_IN_PROGRESS: 'Continue this decision', DECIDED: 'Report how it went',
};

const AWAITING_YOU: DecisionThreadLifecycleStatus[] = ['OPEN', 'GATHERING_CONTEXT', 'READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE'];
const IN_MOTION: DecisionThreadLifecycleStatus[] = ['ACTION_IN_PROGRESS', 'DECIDED'];

/**
 * A thread needs the homeowner while it is gathering or comparing, or when its context went stale or conflicted while in motion; it is
 * active while an action is under way, waiting once decided (for its outcome), completed when finished, and archived when set aside.
 */
export function decisionThreadLifecycleView(lifecycle: DecisionThreadLifecycleStatus, context: DecisionThreadContextStatus): AskWorkLifecycleView {
  if (AWAITING_YOU.includes(lifecycle)) return 'NEEDS_YOU';
  if (IN_MOTION.includes(lifecycle)) return context !== 'CURRENT' ? 'NEEDS_YOU' : lifecycle === 'ACTION_IN_PROGRESS' ? 'ACTIVE' : 'WAITING';
  return lifecycle === 'COMPLETED' ? 'COMPLETED' : 'ARCHIVED';
}

function viewWhere(view: AskWorkLifecycleView): Prisma.DecisionThreadWhereInput {
  switch (view) {
    case 'NEEDS_YOU': return { OR: [{ lifecycleStatus: { in: AWAITING_YOU } }, { lifecycleStatus: { in: IN_MOTION }, contextStatus: { not: 'CURRENT' } }] };
    case 'ACTIVE': return { lifecycleStatus: 'ACTION_IN_PROGRESS', contextStatus: 'CURRENT' };
    case 'WAITING': return { lifecycleStatus: 'DECIDED', contextStatus: 'CURRENT' };
    case 'COMPLETED': return { lifecycleStatus: 'COMPLETED' };
    case 'ARCHIVED': return { lifecycleStatus: { in: ['ABANDONED', 'ARCHIVED'] } };
    default: return { id: { in: [] } };
  }
}

interface ThreadRecord {
  id: string;
  propertyId: string;
  title: string;
  lifecycleStatus: DecisionThreadLifecycleStatus;
  contextStatus: DecisionThreadContextStatus;
  decisionDefinitionId: string;
  primaryEntityType: string | null;
  primaryEntityId: string | null;
  version: number;
  updatedAt: Date;
  currentRecommendationSnapshot: { verdictCode: string | null } | null;
}

export function decisionThreadRow(thread: ThreadRecord): AskWorkRow {
  const sortAt = thread.updatedAt.toISOString();
  const resumable = ASK_RESUMABLE_DECISION_DEFINITION_IDS.includes(thread.decisionDefinitionId);
  const nextStep = resumable ? NEXT_STEP[thread.lifecycleStatus] : undefined;
  const stale = thread.contextStatus !== 'CURRENT' && IN_MOTION.includes(thread.lifecycleStatus);
  return {
    workKey: `${KEY_PREFIX}${thread.id}`,
    sourceAliases: [],
    providerId: 'DECISION_THREADS',
    workType: 'DECISION_THREAD',
    propertyId: thread.propertyId,
    entity: { type: 'DecisionThread', id: thread.id },
    title: truncateTitle(thread.title) || 'Decision',
    summary: stale ? 'Some of what this decision relied on has changed.' : null,
    status: { canonical: thread.lifecycleStatus, label: LIFECYCLE_LABELS[thread.lifecycleStatus] },
    lifecycleView: decisionThreadLifecycleView(thread.lifecycleStatus, thread.contextStatus),
    nextAction: !resumable ? null : stale ? { label: 'Review what changed', operationId: null, allowed: true } : nextStep ? { label: nextStep, operationId: null, allowed: true } : null,
    sortAt,
    freshness: { version: String(thread.version), asOf: sortAt },
    sourceOwner: 'decision-platform',
    resume: {
      kind: 'WORKSPACE', executionId: null, sessionId: null,
      launch: resumable
        ? workLaunch({ operationId: 'HVAC_DECISION_CONTINUE', entityType: thread.primaryEntityType, entityId: thread.primaryEntityId, decisionThreadId: thread.id, contextVersion: String(thread.version) })
        : workLaunch({ entityType: 'DecisionThread', entityId: thread.id, decisionThreadId: thread.id, contextVersion: String(thread.version) }),
      unavailableReason: resumable ? null : 'Ask cannot continue this kind of decision yet. Its current state is shown here.',
    },
  };
}

/** Every decision thread for the home (FR-WORK-001), whatever its family. Property-scoped like Concierge Home; read-only. `role` is unused: the read floor is the gate's. */
export const readDecisionThreadWork: AskWorkProviderReader = async (context, query) => {
  const base: Prisma.DecisionThreadWhereInput = { propertyId: context.propertyId };
  const statusFilter: Prisma.DecisionThreadWhereInput = query.status ? { lifecycleStatus: query.status as DecisionThreadLifecycleStatus } : {};
  const inView: Prisma.DecisionThreadWhereInput  = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view), statusFilter] };
  const instant = boundaryInstant(query.after);
  const sameInstant: Prisma.DecisionThreadWhereInput | null = !query.after ? null
    : query.after.workKey.startsWith(KEY_PREFIX) ? { id: { gt: query.after.workKey.slice(KEY_PREFIX.length) } }
      : KEY_PREFIX > query.after.workKey ? {} : { id: { in: [] } };
  const paged: Prisma.DecisionThreadWhereInput = instant && sameInstant
    ? { AND: [inView, { OR: [{ updatedAt: { lt: instant } }, { AND: [{ updatedAt: instant }, sameInstant] }] }] }
    : inView;
  const [threads, total, grouped] = await Promise.all([
    prisma.decisionThread.findMany({
      where: paged,
      select: {
        id: true, propertyId: true, title: true, lifecycleStatus: true, contextStatus: true, decisionDefinitionId: true, primaryEntityType: true, primaryEntityId: true, version: true, updatedAt: true,
        currentRecommendationSnapshot: { select: { verdictCode: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.decisionThread.count({ where: inView }),
    prisma.decisionThread.groupBy({ by: ['lifecycleStatus', 'contextStatus'], where: base, _count: { _all: true } }),
  ]);
  const viewCounts: Partial<Record<AskWorkLifecycleView, number>> = {};
  for (const view of ASK_WORK_LIFECYCLE_VIEWS) viewCounts[view] = 0;
  for (const group of grouped) {
    const view = decisionThreadLifecycleView(group.lifecycleStatus, group.contextStatus);
    viewCounts[view] = (viewCounts[view] ?? 0) + group._count._all;
  }
  return { rows: threads.map(decisionThreadRow), total, viewCounts };
};


