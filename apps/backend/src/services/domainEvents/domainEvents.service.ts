// apps/backend/src/services/domainEvents/domainEvents.service.ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type DomainEventDb = typeof prisma | Prisma.TransactionClient;

export type EmitDomainEventInput = {
  type:
    | 'CLAIM_SUBMITTED'
    | 'CLAIM_CLOSED'
    | 'FOLLOW_UP_DUE'
    | 'REFINANCE_OPPORTUNITY_OPENED'
    | 'REFINANCE_OPPORTUNITY_UPDATED'
    | 'REFINANCE_OPPORTUNITY_CLOSED'
    | 'RADAR_PROPERTY_RECONCILIATION_REQUESTED'
    | 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED'
    | 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED';
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
        type: input.type as any,
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
