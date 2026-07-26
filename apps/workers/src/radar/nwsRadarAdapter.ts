import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
  type NormalizedGeography,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import type {
  SevereWeatherAlert,
} from '@worker-shared/services/severeWeatherAlert.service';
import { summaryFor } from '../jobs/severeWeatherAlerts.scoring';
import type { RadarSourceAdapter } from './adapterConformance';
import { isSafeRadarCanonicalUrl } from './adapterConformance';

export type NwsRadarAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
  queryPoint: {
    latitude: number;
    longitude: number;
  };
  lifecycleStatus?: CanonicalRadarObservation['lifecycleStatus'];
};

function utcTimestamp(value: string | null | undefined, fallback?: string): string {
  const candidate = value ?? fallback;
  if (!candidate) throw new TypeError('NWS observation is missing a required timestamp');
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError(`Invalid NWS timestamp: ${candidate}`);
  return parsed.toISOString();
}

function severity(value: SevereWeatherAlert['severity']): CanonicalRadarObservation['severity'] {
  switch (value) {
    case 'Extreme':
      return 'extreme';
    case 'Severe':
      return 'severe';
    case 'Moderate':
      return 'moderate';
    case 'Minor':
      return 'low';
    default:
      return 'info';
  }
}

function eventType(alert: SevereWeatherAlert): CanonicalRadarObservation['eventType'] {
  switch (alert.hazardFamily) {
    case 'FLOOD':
      return 'flood_risk';
    case 'HEATWAVE':
      return 'heat_wave';
    case 'SNOW':
      return 'weather';
    case 'WILDFIRE':
      return 'weather';
    case 'HURRICANE':
      return alert.event.includes('Wind') ? 'wind' : 'weather';
    case 'STORM':
      if (/wind/i.test(alert.event)) return 'wind';
      if (/hail/i.test(alert.event)) return 'hail';
      if (/rain|flood/i.test(alert.event)) return 'heavy_rain';
      return 'weather';
  }
}

function lifecycleStatus(
  alert: SevereWeatherAlert,
  context: NwsRadarAdapterContext,
): CanonicalRadarObservation['lifecycleStatus'] {
  if (context.lifecycleStatus) return context.lifecycleStatus;
  if (alert.messageType?.toLowerCase() === 'cancel') return 'retracted';
  if (alert.messageType?.toLowerCase() === 'update') return 'updated';
  return 'active';
}

function geography(
  alert: SevereWeatherAlert,
  context: NwsRadarAdapterContext,
): NormalizedGeography {
  if (alert.geometry) {
    return {
      type: 'polygon',
      geoJson: alert.geometry,
    };
  }
  return {
    type: 'point',
    point: context.queryPoint,
  };
}

export const nwsRadarAdapter: RadarSourceAdapter<
  SevereWeatherAlert,
  NwsRadarAdapterContext
> = {
  normalize(alert, context) {
    if (!alert.nwsAlertId.trim()) throw new TypeError('NWS alert ID is required');
    const observedAt = utcTimestamp(context.observedAt);
    const effectiveAt = utcTimestamp(
      alert.effective ?? alert.onset ?? alert.sent,
      observedAt,
    );
    const expiresAt = alert.ends ?? alert.expires
      ? utcTimestamp(alert.ends ?? alert.expires)
      : null;
    const providerRevision = alert.sent
      ? utcTimestamp(alert.sent)
      : alert.effective ? utcTimestamp(alert.effective) : undefined;
    if (!isSafeRadarCanonicalUrl(alert.canonicalUrl, ['api.weather.gov'])) {
      throw new TypeError(`Unsafe NWS canonical URL: ${alert.canonicalUrl}`);
    }

    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId: alert.nwsAlertId.trim(),
      providerRevision,
      sourceFamily: 'weather',
      eventType: eventType(alert),
      title: alert.event.trim(),
      summary: summaryFor(alert),
      severity: severity(alert.severity),
      lifecycleStatus: lifecycleStatus(alert, context),
      effectiveAt,
      expiresAt,
      observedAt,
      geography: geography(alert, context),
      canonicalUrl: alert.canonicalUrl,
      deduplicationKeys: [
        `nws:${alert.nwsAlertId.trim()}`,
        ...alert.referencedAlertIds.map((id) => `nws-reference:${id}`),
      ],
      rawPayload: {
        provider: 'National Weather Service',
        nwsAlertId: alert.nwsAlertId,
        hazardFamily: alert.hazardFamily,
        event: alert.event,
        severity: alert.severity,
        urgency: alert.urgency,
        certainty: alert.certainty,
        status: alert.status,
        messageType: alert.messageType,
        sent: alert.sent,
        effective: alert.effective,
        onset: alert.onset,
        expires: alert.expires,
        ends: alert.ends,
        headline: alert.headline,
        description: alert.description,
        instruction: alert.instruction,
        senderName: alert.senderName,
        referencedAlertIds: alert.referencedAlertIds,
        geometry: alert.geometry,
        canonicalUrl: alert.canonicalUrl,
      },
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
