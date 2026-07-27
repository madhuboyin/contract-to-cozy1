import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import { isSafeRadarCanonicalUrl, type RadarSourceAdapter } from './adapterConformance';

export const USGS_MINIMUM_MAGNITUDE = 2.5;
export const USGS_EVENT_TTL_HOURS = 24;

export type UsgsEarthquake = {
  id: string;
  magnitude: number;
  place: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  occurredAt: string;
  updatedAt: string;
  reviewStatus: 'automatic' | 'reviewed' | 'deleted';
  alert: 'green' | 'yellow' | 'orange' | 'red' | null;
  significance: number | null;
  feltReports: number | null;
  tsunamiFlag: boolean;
  canonicalUrl: string;
  rawPayload: unknown;
};

export type UsgsEarthquakeAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
};

/**
 * Product-reviewed relevance bands. These are monitoring radii, not predicted
 * shaking or damage contours. Property distance is checked independently by
 * the worker before an observation enters the canonical pipeline.
 */
export function usgsMaterialityRadiusMeters(magnitude: number): number | null {
  if (!Number.isFinite(magnitude) || magnitude < USGS_MINIMUM_MAGNITUDE) return null;
  if (magnitude < 3.5) return 25_000;
  if (magnitude < 4.5) return 75_000;
  if (magnitude < 5.5) return 200_000;
  if (magnitude < 6.5) return 500_000;
  return 1_000_000;
}

function severity(event: UsgsEarthquake): CanonicalRadarObservation['severity'] {
  if (event.alert === 'red' || event.magnitude >= 7.5) return 'extreme';
  if (event.alert === 'orange' || event.magnitude >= 6.5) return 'severe';
  if (event.alert === 'yellow' || event.magnitude >= 5.5) return 'high';
  if (event.magnitude >= 4.5) return 'moderate';
  if (event.magnitude >= 3.5) return 'low';
  return 'info';
}

function summary(event: UsgsEarthquake): string {
  const review = event.reviewStatus === 'reviewed'
    ? 'reviewed'
    : event.reviewStatus === 'automatic'
      ? 'automatically detected'
      : 'withdrawn';
  const awareness = event.magnitude < 4.5
    ? ' This is an awareness update, not a report of property damage.'
    : ' Local shaking varies with distance, depth, and ground conditions; review the official USGS event page for updates.';
  return `USGS ${review} a magnitude ${event.magnitude.toFixed(1)} earthquake ${event.place}. The epicenter was about ${event.depthKm.toFixed(1)} km deep.${awareness}`;
}

export const usgsEarthquakeRadarAdapter: RadarSourceAdapter<
  UsgsEarthquake,
  UsgsEarthquakeAdapterContext
> = {
  normalize(event, context) {
    const radiusMeters = usgsMaterialityRadiusMeters(event.magnitude);
    if (radiusMeters === null) {
      throw new TypeError('USGS earthquake is below the reviewed materiality threshold');
    }
    if (!event.id.trim() || !event.place.trim()) {
      throw new TypeError('USGS earthquake is missing event identity');
    }
    if (
      !Number.isFinite(event.latitude)
      || !Number.isFinite(event.longitude)
      || !Number.isFinite(event.depthKm)
    ) {
      throw new TypeError('USGS earthquake has invalid coordinates or depth');
    }
    if (!isSafeRadarCanonicalUrl(event.canonicalUrl, ['earthquake.usgs.gov'])) {
      throw new TypeError('Unsafe USGS canonical URL');
    }
    const lifecycleStatus = event.reviewStatus === 'deleted' ? 'retracted' : 'active';
    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId: `usgs:${event.id}`,
      providerRevision: event.updatedAt,
      sourceFamily: 'disaster',
      eventType: 'earthquake',
      eventSubType: event.reviewStatus === 'reviewed'
        ? 'reviewed_earthquake'
        : event.reviewStatus === 'automatic'
          ? 'automatic_earthquake'
          : 'deleted_earthquake',
      title: `Magnitude ${event.magnitude.toFixed(1)} earthquake near ${event.place}`,
      summary: summary(event),
      severity: severity(event),
      lifecycleStatus,
      effectiveAt: event.occurredAt,
      expiresAt: lifecycleStatus === 'retracted'
        ? context.observedAt
        : new Date(
            new Date(event.occurredAt).getTime() + USGS_EVENT_TTL_HOURS * 3_600_000,
          ).toISOString(),
      observedAt: context.observedAt,
      geography: {
        type: 'radius',
        center: {
          latitude: event.latitude,
          longitude: event.longitude,
        },
        radiusMeters,
      },
      canonicalUrl: event.canonicalUrl,
      deduplicationKeys: [`usgs:${event.id}`],
      rawPayload: {
        provider: 'U.S. Geological Survey',
        id: event.id,
        magnitude: event.magnitude,
        place: event.place,
        latitude: event.latitude,
        longitude: event.longitude,
        depthKm: event.depthKm,
        occurredAt: event.occurredAt,
        updatedAt: event.updatedAt,
        reviewStatus: event.reviewStatus,
        alert: event.alert,
        significance: event.significance,
        feltReports: event.feltReports,
        tsunamiFlag: event.tsunamiFlag,
        materialityRadiusMeters: radiusMeters,
        response: event.rawPayload,
      },
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
