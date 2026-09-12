// apps/backend/src/services/domainEvents/domainEvents.service.ts
import type { DomainEventType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type DomainEventDb = typeof prisma | Prisma.TransactionClient;

// Ask Cozy Stage 3, Phase 1 (implementation plan §4.4/§7). Previously a
// hand-copied 9-member literal union that had silently drifted 5 members
// behind the real, correct 14-member DomainEventType Prisma enum
// (schema.prisma) -- importing the generated enum directly instead means
// this can never drift again.
export type EmitDomainEventInput = {
  type: DomainEventType;
  propertyId?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
  availableAt?: Date;
  payload: any;
};


export class DomainEventsService {
  /**
   * db defaults to the global client but accepts a transaction client too —
   * needed so a caller that wants the DomainEvent write to be durable with
   * (atomic with) its own write can pass its own tx rather than emitting
   * only after that transaction commits. See propertyChange.service.ts's
   * emitPropertyChangeWithTransaction for why this matters: an event write
   * that only happens post-commit, best-effort, has no recovery path if it
   * fails — the canonical change is committed but the recompute request
   * that should follow from it is silently lost forever.
   */
  static async emit(input: EmitDomainEventInput, db: DomainEventDb = prisma) {
    // If idempotencyKey is provided, we upsert-ish by unique key
    if (input.idempotencyKey) {
      const existing = await db.domainEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    return db.domainEvent.create({
      data: {
        type: input.type,
        status: 'PENDING',
        propertyId: input.propertyId ?? null,
        userId: input.userId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        availableAt: input.availableAt ?? new Date(),
        payload: input.payload,
      },
    });
  }
}
