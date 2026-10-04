// Batched validator for MAINTENANCE_TASK targets: one query for every maintenance task any candidate points at.
import { prisma } from '../../../../lib/prisma';
import { maintenanceTaskVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('MAINTENANCE_TASK', async (entityIds, scope) => {
  const rows = await prisma.propertyMaintenanceTask.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}) },
    select: { id: true, propertyId: true, status: true, updatedAt: true, snoozedUntil: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: maintenanceTaskVersion(row) }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
