import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
  type NormalizedGeography,
  type RadarSourceFamily,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import type { DummyRadarRawSignal } from './radar.types';
import type { RadarSourceAdapter } from './adapterConformance';

export type DummyRadarAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
  countryCode?: string;
};

function utcTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError(`${field} is not a valid timestamp`);
  return timestamp.toISOString();
}

export function dummyRadarSourceFamily(
  sourceType: DummyRadarRawSignal['provider'],
): RadarSourceFamily {
  switch (sourceType) {
    case 'weather_provider':
      return 'weather';
    case 'air_quality_provider':
      return 'air_quality';
    case 'insurance_market_feed':
      return 'insurance';
    case 'utility_feed':
      return 'utility';
    case 'tax_assessor_feed':
      return 'tax';
    default:
      return 'other';
  }
}

function geography(
  signal: DummyRadarRawSignal,
  countryCode: string,
): NormalizedGeography {
  const key = signal.geography.key.trim();
  if (!key) throw new TypeError('Dummy Radar geography key is required');
  switch (signal.geography.type) {
    case 'property':
      return { type: 'property', propertyId: key };
    case 'zip':
      return { type: 'postal_code', countryCode, postalCode: key };
    case 'city':
      return {
        type: 'administrative_area',
        countryCode,
        level: 'city',
        name: key,
      };
    case 'county':
      return {
        type: 'administrative_area',
        countryCode,
        level: 'county',
        name: key,
      };
    case 'state':
      return {
        type: 'administrative_area',
        countryCode,
        level: 'state',
        name: key,
        code: key,
      };
    case 'polygon':
      throw new TypeError('Dummy polygon signals require canonical GeoJSON and cannot use a key');
  }
}

function severity(
  value: DummyRadarRawSignal['severity'],
): CanonicalRadarObservation['severity'] {
  if (value === 'medium') return 'moderate';
  if (value === 'critical') return 'severe';
  return value;
}

export const canonicalDummyRadarAdapter: RadarSourceAdapter<
  DummyRadarRawSignal,
  DummyRadarAdapterContext
> = {
  normalize(signal, context) {
    if (!signal.providerEventId.trim()) throw new TypeError('providerEventId is required');
    const countryCode = (context.countryCode ?? 'US').trim().toUpperCase();
    const effectiveAt = utcTimestamp(signal.startsAt, 'startsAt');
    const observedAt = utcTimestamp(context.observedAt, 'observedAt');
    const providerRevision =
      typeof signal.raw.providerRevision === 'string' && signal.raw.providerRevision.trim()
        ? signal.raw.providerRevision.trim()
        : undefined;
    const headline = signal.headline.trim();
    const title = headline.startsWith('[Test data]')
      ? headline
      : `[Test data] ${headline}`;

    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId: signal.providerEventId.trim(),
      providerRevision,
      sourceFamily: dummyRadarSourceFamily(signal.provider),
      eventType: signal.signalType,
      title,
      summary: signal.summary?.trim() ||
        `Test ${signal.signalType.split('_').join(' ')} signal from the reviewed fixture provider.`,
      severity: severity(signal.severity),
      lifecycleStatus: signal.lifecycleStatus ?? 'active',
      effectiveAt,
      expiresAt: signal.endsAt ? utcTimestamp(signal.endsAt, 'endsAt') : null,
      observedAt,
      geography: geography(signal, countryCode),
      deduplicationKeys: [
        `dummy:${signal.provider}:${signal.providerEventId.trim()}`,
      ],
      rawPayload: signal.raw,
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
