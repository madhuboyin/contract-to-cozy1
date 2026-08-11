import { resolveNotificationActionUrl } from '@/lib/notifications/destination';

describe('resolveNotificationActionUrl', () => {
  it('prefers a durable Ask continuation over the canonical entity fallback', () => {
    expect(resolveNotificationActionUrl({
      actionUrl: '/dashboard/maintenance?propertyId=property-1&taskId=task-1',
      entityType: 'PROPERTY_MAINTENANCE_TASK',
      entityId: 'task-1',
      metadata: { propertyId: 'property-1', askSessionId: 'session-1', askExecutionId: 'execution-1' },
    })).toBe('/dashboard/ask?propertyId=property-1&sessionId=session-1&executionId=execution-1&from=notification');
  });

  test('routes maintenance entities to the selected task instead of a stale generic URL', () => {
    expect(resolveNotificationActionUrl({
      actionUrl: '/dashboard/properties/property-1/tools/guidance-overview',
      entityType: 'PROPERTY_MAINTENANCE_TASK',
      entityId: 'task-1',
      metadata: { propertyId: 'property-1' },
    })).toBe('/dashboard/maintenance?propertyId=property-1&taskId=task-1&from=notification');
  });

  test.each([
    ['seasonal', '/dashboard/seasonal?propertyId=property-1', 'SEASONAL_CHECKLIST'],
    ['coverage', '/dashboard/properties/property-1/inventory?tab=coverage&itemId=item-1', 'INVENTORY_ITEM'],
    ['booking', '/bookings/booking-1', 'BOOKING'],
    ['recall', '/dashboard/properties/property-1/recalls?matchId=recall-1', 'RECALL_MATCH'],
    ['project', '/dashboard/projects/project-1', 'PROJECT'],
    ['warranty', '/dashboard/properties/property-1/new-home-plan', 'NEW_HOME_WARRANTY_RIGHT'],
  ])('preserves the %s producer destination', (_label, actionUrl, entityType) => {
    expect(resolveNotificationActionUrl({
      actionUrl,
      entityType,
      entityId: 'entity-1',
      metadata: { propertyId: 'property-1' },
    })).toBe(actionUrl);
  });

  test('falls back to the stored URL when maintenance identity is incomplete', () => {
    expect(resolveNotificationActionUrl({
      actionUrl: '/dashboard/maintenance',
      entityType: 'PROPERTY_MAINTENANCE_TASK',
      entityId: 'task-1',
    })).toBe('/dashboard/maintenance');
  });
});
