// apps/backend/src/services/domainEvents/domainEvents.service.ts
import { prisma } from '../../lib/prisma';

export type EmitDomainEventInput = {
  type: 'CLAIM_SUBMITTED' | 'CLAIM_CLOSED';
  propertyId?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
  payload: any;
};

export class DomainEventsService {
  static async emit(input: EmitDomainEventInput) {
    // If idempotencyKey is provided, we upsert-ish by unique key
    if (input.idempotencyKey) {
      const existing = await prisma.domainEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.domainEvent.create({
      data: {
        type: input.type as any,
        status: 'PENDING',
        propertyId: input.propertyId ?? null,
        userId: input.userId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        payload: input.payload,
      },
    });
  }
}
