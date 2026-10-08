import { prisma } from '../../../../lib/prisma';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('DIY_TEMPLATE', async (entityIds) => {
  const rows = await prisma.diyProjectTemplate.findMany({
    where: { id: { in: [...entityIds] }, publishedRevisionId: { not: null } },
    select: { id: true, publishedRevisionId: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: null, currentContextVersion: row.publishedRevisionId }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});

registerSuggestedNextActionEntityValidator('DIY_PROJECT', async (entityIds, scope) => {
  const rows = await prisma.diyProject.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), status: { in: ['PLANNING', 'IN_PROGRESS'] } },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: row.updatedAt.toISOString() }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
