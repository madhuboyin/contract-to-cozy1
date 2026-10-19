import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { afterBoundaryWhere, truncateTitle, workLaunch } from './askWorkRowSupport';

// The same identity as any other execution: one execution is only ever in one of these providers at a time, by its status.
const KEY_PREFIX = 'execution:';

interface UnknownRecord {
  id: string;
  sessionId: string;
  message: string;
  operationId: string | null;
  contextVersion: string | null;
  updatedAt: Date;
  confirmations: Array<{ outcomeUnknownAt: Date | null; attemptCount: number }>;
}

export function unknownOutcomeRow(execution: UnknownRecord, propertyId: string): AskWorkRow {
  const sortAt = execution.updatedAt.toISOString();
  const recordedAt = execution.confirmations[0]?.outcomeUnknownAt?.toISOString() ?? sortAt;
  return {
    workKey: `${KEY_PREFIX}${execution.id}`,
    sourceAliases: [],
    providerId: 'UNKNOWN_OUTCOME_EXECUTIONS',
    workType: 'UNKNOWN_OUTCOME_EXECUTION',
    propertyId,
    entity: { type: 'AskExecution', id: execution.id },
    title: truncateTitle(execution.message) || 'Request with an unconfirmed result',
    summary: 'We could not confirm whether this finished. Checking picks up the result if it did, or finishes it if it did not, and will not apply it twice.',
    status: { canonical: 'OUTCOME_UNKNOWN', label: 'Result not confirmed' },
    lifecycleView: 'NEEDS_YOU',
    nextAction: { label: 'Check what happened', operationId: null, allowed: true },
    sortAt,
    freshness: { version: recordedAt, asOf: recordedAt },
    sourceOwner: 'ask-executions',
    resume: { kind: 'CONFIRMATION', executionId: execution.id, sessionId: execution.sessionId, launch: workLaunch({ operationId: execution.operationId, entityType: 'AskExecution', entityId: execution.id, contextVersion: execution.contextVersion }) },
  };
}

/**
 * Executions whose confirmed command may or may not have run: only those the unknown-outcome sweep durably recorded as OUTCOME_UNKNOWN.
 * Nothing is inferred here. An ordinary failure, a retryable failure, and a command still running under a live lease are never listed.
 */
export const readUnknownOutcomeWork: AskWorkProviderReader = async (context, query) => {
  const inView: Prisma.AskExecutionWhereInput = {
    userId: context.userId,
    propertyId: context.propertyId,
    status: 'OUTCOME_UNKNOWN',
    ...(query.entityId ? { id: query.entityId } : {}),
    ...(!query.entityId && query.status && query.status !== 'OUTCOME_UNKNOWN' ? { id: { in: [] } } : {}),
  };
  const asNeeds = query.view === 'NEEDS_YOU' || Boolean(query.entityId);
  const [executions, total] = await Promise.all([
    prisma.askExecution.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, sessionId: true, message: true, operationId: true, contextVersion: true, updatedAt: true, confirmations: { select: { outcomeUnknownAt: true, attemptCount: true }, take: 1 } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: asNeeds ? query.limit : 0,
    }),
    prisma.askExecution.count({ where: inView }),
  ]);
  return {
    rows: asNeeds ? executions.map((execution) => unknownOutcomeRow(execution, context.propertyId)) : [],
    total: asNeeds ? total : 0,
    viewCounts: { NEEDS_YOU: total },
  };
};
