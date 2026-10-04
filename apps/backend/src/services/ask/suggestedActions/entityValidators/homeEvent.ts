// Batched validator for HOME_EVENT targets: one query for every timeline event any candidate points at. An event counts only while it
// is the current revision, not deleted, and visible to the requester (a PRIVATE event is visible only to its creator), the same
// rules `homeEventCorrectResult` applies when it lists events to correct. A superseded or private-to-someone-else event is "not found".
import { prisma } from '../../../../lib/prisma';
import { homeEventContextVersion } from '../domainVersions';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('HOME_EVENT', async (entityIds, scope) => {
  const rows = await prisma.homeEvent.findMany({
    where: {
      id: { in: [...entityIds] }, isCurrent: true, deletedAt: null,
      ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
      OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: scope.userId }],
    },
    select: { id: true, propertyId: true, revision: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row
      ? { exists: true, propertyId: row.propertyId, currentContextVersion: homeEventContextVersion(row) }
      : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
