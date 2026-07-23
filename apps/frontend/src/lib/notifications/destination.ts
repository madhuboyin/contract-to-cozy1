type DestinationNotification = {
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Resolve destinations from canonical entity identity before accepting a
 * producer-authored URL. This keeps already-created notifications usable when
 * a producer previously stored an obsolete or overly generic destination.
 */
export function resolveNotificationActionUrl(notification: DestinationNotification): string | null {
  const entityType = notification.entityType?.trim().toUpperCase();
  const propertyId = metadataString(notification.metadata, 'propertyId');

  if (entityType === 'PROPERTY_MAINTENANCE_TASK' && notification.entityId && propertyId) {
    const params = new URLSearchParams({
      propertyId,
      taskId: notification.entityId,
      from: 'notification',
    });
    return `/dashboard/maintenance?${params.toString()}`;
  }

  return notification.actionUrl ?? null;
}
