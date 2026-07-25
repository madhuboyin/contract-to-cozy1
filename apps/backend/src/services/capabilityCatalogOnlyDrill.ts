import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} from '../productFramework/capabilities';
import {
  CAPABILITY_PROMOTION_SURFACES,
  capabilityRecommendationsEnabled,
} from './capabilityPromotionPolicy.service';

export function runCapabilityCatalogOnlyDrill(now = new Date()) {
  const availability = createCapabilityAvailabilityAdapter({
    registry: canonicalCapabilityRegistry,
    failureMode: 'BETA_FAIL_OPEN',
    loadPolicy: () => undefined,
  });
  const catalog = () => buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    includeWorkflowContext: true,
  }).capabilities.map(({ id }) => id);
  const baselineCatalog = catalog();
  const baselinePromotionsEnabled = capabilityRecommendationsEnabled({
    CAPABILITY_RECOMMENDATIONS_ENABLED: 'true',
  });
  const rollbackPromotionsEnabled = capabilityRecommendationsEnabled({
    CAPABILITY_RECOMMENDATIONS_ENABLED: 'false',
  });
  const rollbackCatalog = catalog();
  const restoredPromotionsEnabled = capabilityRecommendationsEnabled({
    CAPABILITY_RECOMMENDATIONS_ENABLED: 'true',
  });
  const restoredCatalog = catalog();
  const catalogPreserved =
    JSON.stringify(baselineCatalog) === JSON.stringify(rollbackCatalog);
  const catalogRestored =
    JSON.stringify(baselineCatalog) === JSON.stringify(restoredCatalog);
  const surfaces = CAPABILITY_PROMOTION_SURFACES.map((surface) => ({
    surface,
    suppressed: !rollbackPromotionsEnabled,
  }));
  const passed =
    baselinePromotionsEnabled
    && !rollbackPromotionsEnabled
    && restoredPromotionsEnabled
    && catalogPreserved
    && catalogRestored
    && surfaces.every(({ suppressed }) => suppressed);

  return {
    contractVersion: 'capability-catalog-only-drill-v1' as const,
    checkedAt: now.toISOString(),
    registryVersion: canonicalCapabilityRegistry.version,
    capabilityCount: canonicalCapabilityRegistry.capabilities.length,
    passed,
    baseline: {
      promotionsEnabled: baselinePromotionsEnabled,
      catalogCapabilityCount: baselineCatalog.length,
    },
    rollback: {
      promotionsEnabled: rollbackPromotionsEnabled,
      catalogCapabilityCount: rollbackCatalog.length,
      catalogPreserved,
      surfaces,
    },
    restoration: {
      promotionsEnabled: restoredPromotionsEnabled,
      catalogCapabilityCount: restoredCatalog.length,
      catalogRestored,
    },
  };
}
