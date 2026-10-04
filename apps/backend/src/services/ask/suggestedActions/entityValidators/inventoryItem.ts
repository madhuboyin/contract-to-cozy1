// Batched validator for INVENTORY_ITEM targets: one query for every inventory item any candidate points at.
import { prisma } from '../../../../lib/prisma';
import { inventoryItemContextVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('INVENTORY_ITEM', async (entityIds, scope) => {
  const rows = await prisma.inventoryItem.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}) },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: inventoryItemContextVersion(row) }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
