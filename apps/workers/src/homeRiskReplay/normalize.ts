import type {
  CanonicalHomeRiskEventSignal,
  DummyHomeRiskRawSignal,
} from './homeRiskReplay.types';

export function normalizeDummyHomeRiskEvent(
  signal: DummyHomeRiskRawSignal,
): CanonicalHomeRiskEventSignal {
  return {
    eventType: signal.eventType,
    eventSubType: signal.eventSubType ?? null,
    title: signal.title,
    summary: signal.summary ?? null,
    severity: signal.severity,
    startAt: signal.startsAt,
    endAt: signal.endsAt ?? null,
    locationType: signal.geography.type,
    locationKey: signal.geography.key,
    geoJson: signal.geography.type === 'polygon'
      ? { type: 'FeatureCollection', features: [] }
      : null,
    payloadJson: {
      provider: signal.provider,
      providerEventId: signal.providerEventId,
      ...signal.raw,
    },
    dedupeKey: `${signal.provider}:${signal.providerEventId}`,
  };
}
