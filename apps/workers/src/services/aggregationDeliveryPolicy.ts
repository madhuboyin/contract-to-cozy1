import { DeliveryStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAggregationContextBatch } from '@worker-shared/services/aggregationContext/batch';

type NotificationLike = {
  id: string;
  userId: string;
  metadata: unknown;
  entityId?: string | null;
};

function propertyIdOf(notification: NotificationLike): string | null {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return typeof (metadata as any).propertyId === 'string' ? (metadata as any).propertyId : null;
}

/** Rechecks current feature policy immediately before an external send. */
export async function filterDeliveriesByAggregationPolicy<T extends {
  id: string;
  notification: NotificationLike;
}>(deliveries: T[]): Promise<T[]> {
  const scoped = deliveries.flatMap((delivery) => {
    const propertyId = propertyIdOf(delivery.notification);
    return propertyId ? [{ propertyId, userId: delivery.notification.userId }] : [];
  });
  if (!scoped.length) return deliveries;

  const contexts = await getAggregationContextBatch(scoped, 'NOTIFICATIONS', 8);
  const contextByProperty = new Map(contexts
    .filter((result) => result.status === 'READY' && result.envelope?.decision.status === 'APPLICABLE')
    .map((result) => [result.propertyId, result.envelope!]));
  const blocked = deliveries.filter((delivery) => {
    const propertyId = propertyIdOf(delivery.notification);
    if (!propertyId) return false;
    const envelope = contextByProperty.get(propertyId);
    if (!envelope) return true;
    const metadata = delivery.notification.metadata as Record<string, unknown> | null;
    const explicitIdentity = typeof metadata?.aggregationIdentity === 'string'
      ? metadata.aggregationIdentity
      : null;
    const actionKey = typeof metadata?.actionKey === 'string' ? metadata.actionKey.toUpperCase() : null;
    const lifecycle = envelope.lifecycle.find((item) =>
      (explicitIdentity && item.identity === explicitIdentity) ||
      (delivery.notification.entityId && item.sourceId === delivery.notification.entityId) ||
      (actionKey && item.actionKey?.toUpperCase() === actionKey),
    );
    return Boolean(lifecycle && lifecycle.status !== 'ACTIVE');
  });
  if (blocked.length) {
    await prisma.notificationDelivery.updateMany({
      where: { id: { in: blocked.map((delivery) => delivery.id) } },
      data: {
        status: DeliveryStatus.SKIPPED,
        failureReason: 'PROPERTY_CONTEXT_POLICY_BLOCKED',
      },
    });
  }
  return deliveries.filter((delivery) => {
    const propertyId = propertyIdOf(delivery.notification);
    return !propertyId || !blocked.some((candidate) => candidate.id === delivery.id);
  });
}
