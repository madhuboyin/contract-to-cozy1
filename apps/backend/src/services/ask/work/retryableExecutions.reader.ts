import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { afterBoundaryWhere, truncateTitle, workLaunch } from './askWorkRowSupport';

// Same identity as a pending request: both are the caller's own Ask execution, and one execution is never in both lists.
const KEY_PREFIX = 'execution:';

interface RetryableRecord {
  id: string;
  sessionId: string;
  propertyId: string | null;
  message: string;
  operationId: string | null;
  contextVersion: string | null;
  updatedAt: Date;
}

export function retryableExecutionRow(execution: RetryableRecord, propertyId: string): AskWorkRow {
  const sortAt = execution.updatedAt.toISOString();
  return {
    workKey: `${KEY_PREFIX}${execution.id}`,
    sourceAliases: [],
    providerId: 'RETRYABLE_EXECUTIONS',
    workType: 'RETRYABLE_EXECUTION',
    propertyId,
    entity: { type: 'AskExecution', id: execution.id },
    title: truncateTitle(execution.message) || 'Request that did not finish',
    summary: 'This did not finish and can be tried again.',
    status: { canonical: 'FAILED_RETRYABLE', label: 'Did not finish' },
    lifecycleView: 'NEEDS_YOU',
    // The retry runs through the normal execution path, which reauthorizes, rereads current records and is idempotent per client request id.
    nextAction: { label: 'Try this again', operationId: null, allowed: true, retryExecutionId: execution.id },
    sortAt,
    freshness: { version: execution.contextVersion ?? sortAt, asOf: sortAt },
    sourceOwner: 'ask-executions',
    resume: { kind: 'CONVERSATION', executionId: execution.id, sessionId: execution.sessionId, launch: workLaunch({ operationId: execution.operationId, entityType: 'AskExecution', entityId: execution.id, contextVersion: execution.contextVersion }) },
  };
}

/**
 * The caller's own Ask requests for this home that failed in a way that can be retried (`FAILED_RETRYABLE`). A request that was already
 * retried (a RETRY_STARTED event) is superseded by its retry and is not listed, so a retry never leaves two rows. Only the explicit
 * retryable status counts: an ordinary terminal failure is not listed here, and nothing is inferred from a missing result.
 */
export const readRetryableExecutionWork: AskWorkProviderReader = async (context, query) => {
  const inView: Prisma.AskExecutionWhereInput = {
    userId: context.userId,
    propertyId: context.propertyId,
    status: 'FAILED_RETRYABLE',
    events: { none: { eventType: 'RETRY_STARTED' } },
    ...(query.status && query.status !== 'FAILED_RETRYABLE' ? { id: { in: [] } } : {}),
  };
  const [executions, total] = await Promise.all([
    prisma.askExecution.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, sessionId: true, propertyId: true, message: true, operationId: true, contextVersion: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.view === 'NEEDS_YOU' ? query.limit : 0,
    }),
    prisma.askExecution.count({ where: inView }),
  ]);
  return {
    rows: query.view === 'NEEDS_YOU' ? executions.map((execution) => retryableExecutionRow(execution, context.propertyId)) : [],
    total: query.view === 'NEEDS_YOU' ? total : 0,
    viewCounts: { NEEDS_YOU: total },
  };
};
