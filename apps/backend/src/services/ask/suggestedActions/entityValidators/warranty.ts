// Batched validator for WARRANTY targets: one query for every warranty any candidate points at.
import { prisma } from '../../../../lib/prisma';
import { warrantyContextVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('WARRANTY', async (entityIds, scope) => {
  const rows = await prisma.warranty.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}) },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: warrantyContextVersion(row) }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
