// Worker-safe implementation of the backend admin audit contract. Worker
// callers have no Express request and only need the persisted audit record.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface RecordAdminActionInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  capability?: string;
  reason?: string;
  disposition?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  relatedRefs?: Record<string, string | number | boolean | null>;
}

export async function recordAdminAction(
  input: RecordAdminActionInput,
  client: Pick<Prisma.TransactionClient, 'auditLog'> | typeof prisma = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: input.oldValues ?? undefined,
      newValues: input.newValues ?? undefined,
      metadata: {
        capability: input.capability ?? null,
        reason: input.reason ?? null,
        disposition: input.disposition ?? null,
        relatedRefs: input.relatedRefs ?? null,
        workerPersisted: true,
      } as Prisma.InputJsonValue,
    },
  });
}
