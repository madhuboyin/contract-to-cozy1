import type { CreateDiyProjectPayload } from '@/types';
import type { ResolvedToolDestinationContext } from './toolDestinationContext';

export function diyProjectSourcePayload(
  resolved?: ResolvedToolDestinationContext | null,
): Pick<CreateDiyProjectPayload, 'maintenanceTaskId' | 'incidentId' | 'inventoryItemId'> {
  const entityType = resolved?.prefill.entityType?.trim().toUpperCase();
  const entityId = resolved?.prefill.entityId;
  if (!entityType || !entityId) return {};

  if (entityType === 'MAINTENANCE_TASK') return { maintenanceTaskId: entityId };
  if (entityType === 'INCIDENT') return { incidentId: entityId };
  if (['INVENTORY_ITEM', 'APPLIANCE', 'ITEM'].includes(entityType)) {
    return { inventoryItemId: resolved?.prefill.itemId ?? entityId };
  }
  return {};
}

export function diyPromptFromLaunchContext(
  resolved?: ResolvedToolDestinationContext | null,
): string {
  if (!resolved) return '';
  const title = resolved.sourceTitle.trim();
  const summary = resolved.sourceSummary?.trim();
  const genericTitle = title === 'Continued from your Home plan'
    || title.startsWith('Recommended because:');
  if (genericTitle && !summary) return '';
  return [genericTitle ? null : title, summary].filter(Boolean).join('. ').slice(0, 1000);
}

