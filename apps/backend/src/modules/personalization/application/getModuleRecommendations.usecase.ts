import type { PersonalizationCapabilities } from '../domain/capabilityPolicy';
import type { PersonalizationModule } from '../catalog/personalizationDefinitions';
import { listActiveRecommendationsForModule } from '../infrastructure/personalizationRepository';
import { materializeRecommendationsForProperty } from './materializeRecommendations.usecase';
import { mapRecommendationToModule } from '../adapters/recommendationPlacement.adapter';

export async function getModuleRecommendations(
  propertyId: string,
  module: PersonalizationModule,
  capabilities: PersonalizationCapabilities,
  limit = 10,
  userId?: string,
) {
  const materialization = await materializeRecommendationsForProperty(propertyId, `MODULE_${module}_READ`, userId);
  if (materialization.paused) {
    return { configured: true, available: false, module, generatedAt: new Date().toISOString(), items: [] };
  }
  const stored = await listActiveRecommendationsForModule(propertyId, 25);
  const items = stored
    .map((recommendation) => mapRecommendationToModule(recommendation, module, capabilities.canAct))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, Math.min(Math.max(limit, 1), 25));

  return {
    configured: true,
    available: true,
    module,
    generatedAt: new Date().toISOString(),
    items,
  };
}
