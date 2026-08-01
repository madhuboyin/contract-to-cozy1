import type { IntelligenceProviderAdapter } from '@worker-shared/propertyIntelligence/propertyIntelligence.contracts';
import {
  USGS_HAZARD_OBSERVATION_TYPE,
  USGS_HAZARD_SOURCE_KEY,
} from '@worker-shared/propertyIntelligence/pilots/usgsHazardPilot';
import { fetchUsgsEarthquakeFeed } from '../../jobs/usgsEarthquake.job';
import { usgsMaterialityRadiusMeters } from '../../radar/usgsEarthquakeRadarAdapter';

export class UsgsHazardProviderAdapter implements IntelligenceProviderAdapter {
  readonly sourceKey = USGS_HAZARD_SOURCE_KEY;
  readonly adapterVersion = 'usgs-property-intelligence-v1';

  async fetch(_input: { checkedAfter: Date | null; environment: string }) {
    const result = await fetchUsgsEarthquakeFeed();
    if (result.status !== 'ok') {
      throw new Error(result.error || 'USGS earthquake feed failed');
    }
    const observations = result.events.flatMap((event) => {
      const radiusMeters = usgsMaterialityRadiusMeters(event.magnitude);
      if (radiusMeters == null || event.reviewStatus === 'deleted') return [];
      return [{
        externalId: `usgs:${event.id}`,
        observationType: USGS_HAZARD_OBSERVATION_TYPE,
        lifecycleStatus: 'COMPLETED' as const,
        observedAt: new Date(event.occurredAt),
        effectiveFrom: new Date(event.occurredAt),
        effectiveTo: null,
        latitude: event.latitude,
        longitude: event.longitude,
        geographyType: 'POINT_RADIUS' as const,
        geographyKey: `USGS:${event.id}`,
        geometryJson: null,
        matchRadiusMiles: radiusMeters / 1609.344,
        sourceUrl: event.canonicalUrl,
        sourcePublishedAt: new Date(event.updatedAt),
        lastVerifiedAt: new Date(event.updatedAt),
        factualPayload: {
          title: `Magnitude ${event.magnitude.toFixed(1)} earthquake`,
          summary:
            `USGS recorded an earthquake ${event.place} at a depth of `
            + `${event.depthKm.toFixed(1)} km. A geographic match does not establish `
            + 'shaking intensity or damage to this property.',
          magnitude: event.magnitude,
          depthKm: event.depthKm,
          place: event.place,
          reviewStatus: event.reviewStatus,
          alert: event.alert,
        },
      }];
    });
    return {
      checkedThrough: result.generatedAt ? new Date(result.generatedAt) : new Date(),
      observations,
    };
  }
}
