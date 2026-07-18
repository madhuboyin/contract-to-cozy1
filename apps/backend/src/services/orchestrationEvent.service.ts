// apps/backend/src/services/orchestrationEvent.service.ts
import { prisma } from '../lib/prisma';

export async function recordOrchestrationEvent(params: {
  propertyId: string;
  actionKey: string;
  actionType: 'USER_MARKED_COMPLETE' | 'USER_UNMARKED_COMPLETE' | 'USER_DISMISSED';
  source: 'USER' | 'SYSTEM';
  createdBy?: string | null;
  payload?: Record<string, any>;
}) {
  const {
    propertyId,
    actionKey,
    actionType,
    source,
    createdBy,
    payload,
  } = params;

  // ✅ Idempotent write (unique constraint enforces it)
  const event = await prisma.orchestrationActionEvent.upsert({
    where: {
      propertyId_actionKey_actionType: {
        propertyId,
        actionKey,
        actionType,
      },
    },
    create: {
      propertyId,
      actionKey,
      actionType,
      source,
      createdBy: createdBy ?? null,
      payload: payload ?? undefined,
    },
    update: {
      source,
      createdBy: createdBy ?? null,
      payload: payload ?? undefined,
    },
  });

  return event; // Return the event so we can link it to completion
}
