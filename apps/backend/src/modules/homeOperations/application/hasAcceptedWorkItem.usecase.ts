import { countAcceptedWorkItemsForProperty } from '../infrastructure/workItemRepository';

export async function hasAcceptedWorkItemForProperty(propertyId: string): Promise<boolean> {
  return (await countAcceptedWorkItemsForProperty(propertyId)) > 0;
}
