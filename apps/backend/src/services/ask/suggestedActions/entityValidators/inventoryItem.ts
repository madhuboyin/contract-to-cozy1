// Batched validator for INVENTORY_ITEM targets: one query for every inventory item any candidate points at.
import { prisma } from '../../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../../riskAssetApplicability';
import { inventoryItemContextVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('INVENTORY_ITEM', async (entityIds, scope) => {
  const rows = await prisma.inventoryItem.findMany({
    // Same visibility as every normal inventory read: a hidden or not-present item must not validate as an offerable target.
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), ...visibleInventoryItemWhere() },
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
