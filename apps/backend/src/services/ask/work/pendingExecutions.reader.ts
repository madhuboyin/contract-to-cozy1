import type { AskExecution, AskExecutionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { ASK_RUNNING_RECLAIM_GRACE_MS, INTERACTIVE_ASK_STATUSES, pendingActionLabel, pendingInteractionExpiresAt, pendingKind } from '../execution/askSessions';
import { compareAskWorkRows, type AskWorkProviderReader, type AskWorkRow } from '../askWork.contract';
import type { AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import { truncateTitle, workLaunch } from './askWorkRowSupport';

type PendingRow = Pick<AskExecution, 'id' | 'sessionId' | 'propertyId' | 'status' | 'message' | 'operationId' | 'contextVersion' | 'resultJson' | 'updatedAt' | 'expiresAt'>;

const STATUS_LABELS: Record<string, string> = {
  NEEDS_PROPERTY: 'Waiting for a home', NEEDS_ENTITY: 'Waiting for a record choice', NEEDS_CLARIFICATION: 'Waiting for your answer',
  NEEDS_CONTEXT: 'Waiting for a detail', NEEDS_CONFIRMATION: 'Waiting for your confirmation', RUNNING: 'Action in progress',
};

/**
 * A pending request needs the homeowner unless a confirmed command is mid-flight (CLAIMED receipt or orphaned RUNNING), which is
 * something the system is doing and the homeowner may only need to check on.
 */
export function pendingExecutionView(status: AskExecutionStatus): AskWorkLifecycleView {
  return status === 'RUNNING' ? 'WAITING' : 'NEEDS_YOU';
}

export function pendingExecutionRow(row: PendingRow, propertyId: string | null): AskWorkRow {
  const sortAt = row.updatedAt.toISOString();
  const confirmation = row.status === 'NEEDS_CONFIRMATION';
  return {
    workKey: `execution:${row.id}`,
    sourceAliases: [],
    providerId: 'PENDING_EXECUTIONS',
    workType: 'PENDING_EXECUTION',
    propertyId,
    entity: { type: 'AskExecution', id: row.id },
    title: truncateTitle(row.message) || 'Pending request',
    summary: pendingKind(row.status).replace(/_/g, ' ').toLowerCase(),
    status: { canonical: row.status, label: STATUS_LABELS[row.status] ?? 'Pending' },
    lifecycleView: pendingExecutionView(row.status),
    nextAction: { label: pendingActionLabel(row.status), operationId: null, allowed: true },
    sortAt,
    freshness: { version: row.contextVersion ?? sortAt, asOf: sortAt },
    sourceOwner: 'ask-executions',
    resume: {
      kind: confirmation ? 'CONFIRMATION' : 'CONVERSATION', executionId: row.id, sessionId: row.sessionId,
      launch: workLaunch({ operationId: row.operationId, entityType: 'AskExecution', entityId: row.id, contextVersion: row.contextVersion }),
    },
  };
}

/**
 * Pending Ask executions (FR-WORK-001): the caller's own interactive requests for this home. Side-effect free: an expired interaction is
 * filtered out by its `expiresAt` and left for the resume path and `askPendingExpiryReconciliation` to expire durably; nothing is
 * updated, expired, or recorded here. The candidate set is the caller's open requests for one home, so it is read whole and paged by the
 * shared (sortAt desc, workKey asc) boundary without a hidden cap.
 */
const PENDING_SELECT = { id: true, sessionId: true, propertyId: true, status: true, message: true, operationId: true, contextVersion: true, resultJson: true, updatedAt: true, expiresAt: true } as const;

/** The caller's live pending requests for one home (or, with `propertyId: null`, the requests that belong to no home yet). Read-only. */
async function loadLivePending(userId: string, propertyId: string | null, entityId: string | null | undefined, now: Date): Promise<PendingRow[]> {
  const orphanRunningCutoff = new Date(now.getTime() - (readAskOperationalControls().executionTimeoutMs + ASK_RUNNING_RECLAIM_GRACE_MS));
  const candidates = await prisma.askExecution.findMany({
    where: {
      userId,
      // A resolve by id also finds the request while it is still homeless, so a request that gains a home while open stays openable.
      ...(entityId ? { id: entityId, OR: [{ propertyId }, { propertyId: null }] } : { propertyId }),
      AND: [
        { OR: [
          { status: { in: INTERACTIVE_ASK_STATUSES } },
          { status: 'RUNNING', confirmations: { some: { status: 'CLAIMED' } } },
          { status: 'RUNNING', confirmations: { none: {} }, updatedAt: { lte: orphanRunningCutoff } },
        ] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    select: PENDING_SELECT,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return candidates.filter((row) => {
    const interactionExpiry = pendingInteractionExpiresAt(row);
    return !interactionExpiry || interactionExpiry > now;
  });
}

export const readPendingExecutionWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const live = await loadLivePending(context.userId, context.propertyId, query.entityId, now);
  const viewCounts = { NEEDS_YOU: 0, WAITING: 0 };
  for (const row of live) viewCounts[pendingExecutionView(row.status) as 'NEEDS_YOU' | 'WAITING'] += 1;
  const inView = live
    .filter((row) => query.entityId || pendingExecutionView(row.status) === query.view)
    .filter((row) => query.entityId || !query.status || row.status === query.status)
    .map((row) => pendingExecutionRow(row, row.propertyId ? context.propertyId : null))
    .sort(compareAskWorkRows);
  const rows = inView.filter((row) => !query.after || compareAskWorkRows(row, query.after) > 0);
  return { rows: rows.slice(0, query.limit), total: inView.length, viewCounts };
};

/**
 * FR-WORK / exit criterion: every pending request stays discoverable outside its conversation, including one that still asks which home
 * it is about. Those belong to no home, so they are returned as an account-scoped bucket and never attached to a property.
 */
export async function readPropertylessPendingWork(userId: string, view: AskWorkLifecycleView, status: string | null): Promise<AskWorkRow[]> {
  const live = await loadLivePending(userId, null, null, new Date());
  return live
    .filter((row) => pendingExecutionView(row.status) === view && (!status || row.status === status))
    .map((row) => pendingExecutionRow(row, null))
    .sort(compareAskWorkRows);
}
