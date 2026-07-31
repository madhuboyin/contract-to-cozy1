import type { PropertyChangeType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import type {
  PropertyChangeSignals,
  PropertyChangeSourceHealth,
} from './propertyChange.contracts';
import { emitPropertyChange } from './propertyChange.service';

const DOMAIN_EVENT_STATUS_ORDINAL = {
  PENDING: 0,
  PROCESSING: 1,
  PROCESSED: 2,
  FAILED: 3,
  DEAD_LETTER: 4,
} as const;

/**
 * Canonical domain-event adapter. It references the DomainEvent row by id and
 * deliberately does not copy its payload into PropertyChange.
 */
export async function emitCanonicalDomainEventPropertyChange(input: {
  domainEventId: string;
  changeType?: PropertyChangeType;
  confidence?: number | null;
  sourceHealth: PropertyChangeSourceHealth;
  signals: PropertyChangeSignals;
  canonicalActionId?: string | null;
  canonicalEventId?: string | null;
}) {
  const event = await prisma.domainEvent.findUnique({
    where: { id: input.domainEventId },
    select: {
      id: true,
      type: true,
      status: true,
      propertyId: true,
      attempts: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!event) {
    throw new APIError('Domain event not found.', 404, 'DOMAIN_EVENT_NOT_FOUND');
  }
  if (!event.propertyId) {
    throw new APIError(
      'Only property-scoped domain events can enter the property change ledger.',
      422,
      'DOMAIN_EVENT_PROPERTY_SCOPE_REQUIRED',
    );
  }
  const statusOrdinal = DOMAIN_EVENT_STATUS_ORDINAL[event.status];
  return emitPropertyChange({
    propertyId: event.propertyId,
    sourceType: `DOMAIN_EVENT_${event.type}`,
    sourceEntityId: event.id,
    sourceRevision: `${event.attempts}:${event.status}`,
    sourceRevisionOrdinal: event.attempts * 10 + statusOrdinal,
    changeType: input.changeType ?? 'ACTION_STATE_CHANGED',
    occurredAt: event.createdAt,
    detectedAt: event.updatedAt,
    confidence: input.confidence ?? null,
    sourceHealth: input.sourceHealth,
    signals: input.signals,
    canonicalActionId: input.canonicalActionId ?? null,
    canonicalEventId: input.canonicalEventId ?? null,
  });
}
