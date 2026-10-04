// Batched validator for INVENTORY_ROOM targets: one query for every room any candidate points at.
import { prisma } from '../../../../lib/prisma';
import { roomContextVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('INVENTORY_ROOM', async (entityIds, scope) => {
  const rows = await prisma.inventoryRoom.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}) },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: roomContextVersion(row) }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
