import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import { radarObservationFingerprint } from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import { isSafeRadarCanonicalUrl } from './adapterConformance';
import type { RadarSourceAdapter } from './adapterConformance';

export type FreezeForecast = {
  propertyId: string;
  latitude: number;
  longitude: number;
  minimumFahrenheit: number;
  windowStart: string;
  windowEnd: string;
  sourceUrl: string;
  rawPayload: unknown;
};

export type FreezeRadarAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
  lifecycleStatus?: CanonicalRadarObservation['lifecycleStatus'];
};

export const FREEZE_THRESHOLD_F = 28;

function utc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid freeze forecast timestamp: ${value}`);
  return date.toISOString();
}

function severity(minF: number): CanonicalRadarObservation['severity'] {
  if (minF <= 10) return 'extreme';
  if (minF <= 15) return 'severe';
  if (minF <= 20) return 'high';
  if (minF < FREEZE_THRESHOLD_F) return 'moderate';
  return 'info';
}

export const freezeRadarAdapter: RadarSourceAdapter<FreezeForecast, FreezeRadarAdapterContext> = {
  normalize(forecast, context) {
    if (!forecast.propertyId.trim()) throw new TypeError('Freeze forecast propertyId is required');
    if (!Number.isFinite(forecast.minimumFahrenheit)) {
      throw new TypeError('Freeze forecast minimum must be finite');
    }
    if (!isSafeRadarCanonicalUrl(forecast.sourceUrl, ['api.open-meteo.com'])) {
      throw new TypeError(`Unsafe Open-Meteo source URL: ${forecast.sourceUrl}`);
    }
    const active = forecast.minimumFahrenheit < FREEZE_THRESHOLD_F;
    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId: `open-meteo:freeze-risk:${forecast.propertyId.trim()}`,
      sourceFamily: 'weather',
      eventType: 'freeze',
      title: active ? 'Freeze risk forecast' : 'Freeze risk cleared',
      summary: active
        ? `Forecast minimum is ${forecast.minimumFahrenheit.toFixed(1)}°F in the next 36 hours.`
        : `Forecast minimum has risen to ${forecast.minimumFahrenheit.toFixed(1)}°F; freeze risk is no longer indicated.`,
      severity: severity(forecast.minimumFahrenheit),
      lifecycleStatus: context.lifecycleStatus ?? (active ? 'active' : 'resolved'),
      effectiveAt: utc(forecast.windowStart),
      expiresAt: utc(forecast.windowEnd),
      observedAt: utc(context.observedAt),
      geography: { type: 'property', propertyId: forecast.propertyId.trim() },
      canonicalUrl: forecast.sourceUrl,
      deduplicationKeys: [`freeze-risk:${forecast.propertyId.trim()}`],
      rawPayload: {
        provider: 'Open-Meteo',
        thresholdFahrenheit: FREEZE_THRESHOLD_F,
        minimumFahrenheit: forecast.minimumFahrenheit,
        latitude: forecast.latitude,
        longitude: forecast.longitude,
        windowStart: forecast.windowStart,
        windowEnd: forecast.windowEnd,
        forecast: forecast.rawPayload,
      },
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
