// apps/backend/src/services/incidents/incident.events.ts
import { prisma } from '../../lib/prisma';
import { IncidentEventType } from '@prisma/client';

export async function logIncidentEvent(args: {
  incidentId: string;
  propertyId: string;
  userId?: string | null;
  type: IncidentEventType;
  message?: string | null;
  payload?: any;
}) {
  return prisma.incidentEvent.create({
    data: {
      incidentId: args.incidentId,
      propertyId: args.propertyId,
      userId: args.userId ?? null,
      type: args.type,
      message: args.message ?? null,
      payload: args.payload ?? null,
    },
  });
}
