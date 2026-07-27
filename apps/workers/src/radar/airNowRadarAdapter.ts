import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import { isSafeRadarCanonicalUrl, type RadarSourceAdapter } from './adapterConformance';

export const AIRNOW_ACTIONABLE_AQI = 101;
export const AIRNOW_SEARCH_RADIUS_MILES = 25;
export const AIRNOW_SEARCH_RADIUS_METERS = Math.round(
  AIRNOW_SEARCH_RADIUS_MILES * 1_609.344,
);

export type AirNowReadingKind = 'current' | 'forecast';

export type AirNowReading = {
  kind: AirNowReadingKind;
  reportingArea: string;
  stateCode: string;
  latitude: number;
  longitude: number;
  parameterName: string;
  aqi: number | null;
  categoryNumber: number | null;
  categoryName: string;
  actionDay: boolean;
  discussion: string | null;
  providerObservedAt: string;
  effectiveAt: string;
  expiresAt: string;
  rawPayload: unknown;
};

export type AirNowAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
};

function normalizedToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function effectiveAqi(reading: AirNowReading): number {
  if (reading.aqi !== null) return reading.aqi;
  switch (reading.categoryNumber) {
    case 2: return 51;
    case 3: return 101;
    case 4: return 151;
    case 5: return 201;
    case 6: return 301;
    default: return 0;
  }
}

export function isActionableAirNowReading(reading: AirNowReading): boolean {
  return effectiveAqi(reading) >= AIRNOW_ACTIONABLE_AQI;
}

export function airNowProviderEventId(reading: AirNowReading): string {
  const episodeDay = reading.effectiveAt.slice(0, 10);
  return [
    'airnow',
    reading.kind,
    normalizedToken(reading.stateCode),
    normalizedToken(reading.reportingArea),
    normalizedToken(reading.parameterName),
    episodeDay,
  ].join(':');
}

function severity(reading: AirNowReading): CanonicalRadarObservation['severity'] {
  const aqi = effectiveAqi(reading);
  if (aqi >= 301) return 'extreme';
  if (aqi >= 201) return 'severe';
  if (aqi >= 151) return 'high';
  if (aqi >= AIRNOW_ACTIONABLE_AQI) return 'moderate';
  return 'info';
}

function isParticlePollution(parameterName: string): boolean {
  return /pm\s*2[._ ]?5|pm\s*10|particle/i.test(parameterName);
}

function isSmokeSpecific(reading: AirNowReading): boolean {
  return isParticlePollution(reading.parameterName)
    && /wildfire|wildland fire|smoke/i.test(reading.discussion ?? '');
}

function summary(reading: AirNowReading): string {
  const period = reading.kind === 'forecast' ? 'forecast' : 'current reading';
  const value = reading.aqi === null ? reading.categoryName : `AQI ${reading.aqi}`;
  const pollutant = reading.parameterName.trim();
  return `${reading.reportingArea}, ${reading.stateCode}: ${value} (${reading.categoryName}) for ${pollutant}, based on the AirNow ${period}.`;
}

export const airNowRadarAdapter: RadarSourceAdapter<AirNowReading, AirNowAdapterContext> = {
  normalize(reading, context) {
    if (!isActionableAirNowReading(reading)) {
      throw new TypeError('AirNow reading is below the actionable AQI threshold');
    }
    if (!reading.reportingArea.trim() || !reading.stateCode.trim() || !reading.parameterName.trim()) {
      throw new TypeError('AirNow reading is missing reporting-area identity');
    }
    if (!Number.isFinite(reading.latitude) || !Number.isFinite(reading.longitude)) {
      throw new TypeError('AirNow reading is missing valid reporting-area coordinates');
    }
    const canonicalUrl = 'https://www.airnow.gov/';
    if (!isSafeRadarCanonicalUrl(canonicalUrl, ['www.airnow.gov'])) {
      throw new TypeError('Unsafe AirNow canonical URL');
    }
    const smokeSpecific = isSmokeSpecific(reading);
    const particle = isParticlePollution(reading.parameterName);
    const providerEventId = airNowProviderEventId(reading);
    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId,
      providerRevision: [
        reading.kind,
        reading.providerObservedAt,
        reading.aqi ?? `category-${reading.categoryNumber ?? 'unknown'}`,
      ].join(':'),
      sourceFamily: 'air_quality',
      eventType: smokeSpecific ? 'wildfire_smoke' : 'air_quality',
      eventSubType: smokeSpecific
        ? 'wildfire_smoke'
        : particle
          ? `particle_pollution_${normalizedToken(reading.parameterName)}`
          : `pollutant_${normalizedToken(reading.parameterName)}`,
      title: smokeSpecific
        ? `${reading.kind === 'forecast' ? 'Forecast' : 'Current'} wildfire smoke risk`
        : `${reading.kind === 'forecast' ? 'Forecast' : 'Current'} unhealthy air quality`,
      summary: summary(reading),
      severity: severity(reading),
      lifecycleStatus: 'active',
      effectiveAt: reading.effectiveAt,
      expiresAt: reading.expiresAt,
      observedAt: context.observedAt,
      geography: {
        type: 'radius',
        center: {
          latitude: reading.latitude,
          longitude: reading.longitude,
        },
        radiusMeters: AIRNOW_SEARCH_RADIUS_METERS,
      },
      canonicalUrl,
      deduplicationKeys: [
        providerEventId,
        `airnow:${reading.reportingArea}:${reading.parameterName}:${reading.effectiveAt.slice(0, 10)}`,
      ],
      rawPayload: {
        provider: 'EPA AirNow',
        kind: reading.kind,
        reportingArea: reading.reportingArea,
        stateCode: reading.stateCode,
        latitude: reading.latitude,
        longitude: reading.longitude,
        parameterName: reading.parameterName,
        aqi: reading.aqi,
        categoryNumber: reading.categoryNumber,
        categoryName: reading.categoryName,
        actionDay: reading.actionDay,
        discussion: reading.discussion,
        providerObservedAt: reading.providerObservedAt,
        searchRadiusMiles: AIRNOW_SEARCH_RADIUS_MILES,
        response: reading.rawPayload,
      },
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
