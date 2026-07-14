import type { PersonalizationCapabilities } from '../domain/capabilityPolicy';
import type { PersonalizationModule } from '../catalog/pilotDefinitions';
import { findPilotHouseholdForProperty, listActiveRecommendationsForModule } from '../infrastructure/pilotRepository';
import { materializePilotRecommendationsForProperty } from './materializePilotRecommendations.usecase';
import { mapRecommendationToModule } from '../adapters/recommendationPlacement.adapter';

export async function getModuleRecommendations(
  propertyId: string,
  module: PersonalizationModule,
  capabilities: PersonalizationCapabilities,
  limit = 10,
) {
  const household = await findPilotHouseholdForProperty(propertyId);
  await materializePilotRecommendationsForProperty(propertyId, `MODULE_${module}_READ`);
  const stored = await listActiveRecommendationsForModule(propertyId, household?.id, 25);
  const items = stored
    .map((recommendation) => mapRecommendationToModule(recommendation, module, capabilities.canAct))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, Math.min(Math.max(limit, 1), 25));

  return {
    configured: true,
    module,
    generatedAt: new Date().toISOString(),
    items,
  };
}
