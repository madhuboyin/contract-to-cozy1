import { prisma } from '../../../../lib/prisma';
import { ACTIVE_LIFECYCLE_STATUSES } from '../../../decisionPlatform/decisionThreadService';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('DECISION_THREAD', async (entityIds, scope) => {
  const rows = await prisma.decisionThread.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] } },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row = byId.get(id);
    return [id, row ? { exists: true, propertyId: row.propertyId, currentContextVersion: row.updatedAt.toISOString() } : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
