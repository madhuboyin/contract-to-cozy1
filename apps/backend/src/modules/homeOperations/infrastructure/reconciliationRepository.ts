import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export async function recordReconciliationFailure(input: {
  propertyId: string;
  workItemId?: string | null;
  operation: string;
  sourceType?: string | null;
  sourceEntityId?: string | null;
  idempotencyKey: string;
  payload?: Prisma.InputJsonValue;
  error: unknown;
}) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const nextRetryAt = new Date(Date.now() + 5 * 60_000);
  return prisma.operationalWorkReconciliation.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      propertyId: input.propertyId,
      workItemId: input.workItemId ?? null,
      operation: input.operation,
      sourceType: input.sourceType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      idempotencyKey: input.idempotencyKey,
      status: 'PENDING',
      errorMessage: message,
      payload: input.payload,
      nextRetryAt,
    },
    update: {
      status: 'PENDING',
      errorMessage: message,
      payload: input.payload,
      nextRetryAt,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      resolvedAt: null,
    },
  });
}

export function markReconciliationResolved(idempotencyKey: string) {
  return prisma.operationalWorkReconciliation.updateMany({
    where: { idempotencyKey, status: { not: 'RESOLVED' } },
    data: { status: 'RESOLVED', errorMessage: null, nextRetryAt: null, resolvedAt: new Date(), lastAttemptAt: new Date() },
  });
}

export function listPendingReconciliations(propertyId: string) {
  return prisma.operationalWorkReconciliation.findMany({
    where: { propertyId, status: { in: ['PENDING', 'FAILED'] } },
    orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
  });
}

