import { getGuidanceModels } from '../../../guidanceEngine/guidanceTypes';
import { ACTIVE_GUIDANCE_JOURNEY_STATUSES } from '../../../guidanceEngine/guidanceJourney.service';
import { registerSuggestedNextActionEntityValidator } from '../suggestedNextActionEntityValidators';

registerSuggestedNextActionEntityValidator('GUIDANCE_JOURNEY', async (entityIds, scope) => {
  const { guidanceJourney } = getGuidanceModels();
  const rows = await guidanceJourney.findMany({
    where: { id: { in: [...entityIds] }, ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), status: { in: [...ACTIVE_GUIDANCE_JOURNEY_STATUSES] } },
    select: { id: true, propertyId: true, updatedAt: true },
  });
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  return new Map(entityIds.map((id) => {
    const row: any = byId.get(id);
    return [id, row ? { exists: true, propertyId: row.propertyId, currentContextVersion: row.updatedAt.toISOString() } : { exists: false, propertyId: null, currentContextVersion: null }];
  }));
});
