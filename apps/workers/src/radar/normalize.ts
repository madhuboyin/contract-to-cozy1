import type { CanonicalRadarSignal, DummyRadarRawSignal } from './radar.types';

function buildDedupeKey(signal: DummyRadarRawSignal): string {
  return [
    'dummy-radar',
    signal.provider,
    signal.providerEventId,
    signal.signalType,
    signal.geography.type,
    signal.geography.key,
  ].join('|');
}

export function normalizeDummyRadarSignal(signal: DummyRadarRawSignal): CanonicalRadarSignal {
  return {
    eventType: signal.signalType,
    eventSubType: 'dummy_seed',
    title: signal.headline.trim(),
    summary: signal.summary?.trim() ?? null,
    sourceType: signal.provider,
    sourceRef: signal.providerEventId,
    severity: signal.severity,
    startAt: signal.startsAt,
    endAt: signal.endsAt ?? null,
    locationType: signal.geography.type,
    locationKey: signal.geography.key,
    geoJson: null,
    payloadJson: {
      ...(signal.raw ?? {}),
      providerEventId: signal.providerEventId,
      normalizedFrom: 'dummy_worker_signal',
    },
    dedupeKey: buildDedupeKey(signal),
    status: 'active',
  };
}
