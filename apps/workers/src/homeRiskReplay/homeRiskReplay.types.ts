export type HomeRiskReplaySignalProvider =
  | 'weather_archive'
  | 'air_quality_archive'
  | 'utility_history_feed'
  | 'internal_seed';

export type HomeRiskReplayEventType =
  | 'hail'
  | 'freeze'
  | 'heavy_rain'
  | 'flood_risk'
  | 'wind'
  | 'heat_wave'
  | 'wildfire_smoke'
  | 'air_quality'
  | 'power_outage'
  | 'power_surge_risk'
  | 'drought'
  | 'extreme_weather'
  | 'other';

export type HomeRiskReplayEventSeverity =
  | 'info'
  | 'low'
  | 'moderate'
  | 'high'
  | 'severe';

export type HomeRiskReplaySignalGeographyType =
  | 'property'
  | 'zip'
  | 'city'
  | 'county'
  | 'state'
  | 'polygon';

export type DummyHomeRiskRawSignal = {
  provider: HomeRiskReplaySignalProvider;
  providerEventId: string;
  eventType: HomeRiskReplayEventType;
  eventSubType?: string | null;
  title: string;
  summary?: string | null;
  severity: HomeRiskReplayEventSeverity;
  startsAt: string;
  endsAt?: string | null;
  geography: {
    type: HomeRiskReplaySignalGeographyType;
    key: string;
  };
  raw: Record<string, unknown>;
};

export type CanonicalHomeRiskEventSignal = {
  eventType: HomeRiskReplayEventType;
  eventSubType?: string | null;
  title: string;
  summary?: string | null;
  severity: HomeRiskReplayEventSeverity;
  startAt: string;
  endAt?: string | null;
  locationType: HomeRiskReplaySignalGeographyType;
  locationKey: string;
  geoJson?: Record<string, unknown> | null;
  payloadJson?: Record<string, unknown> | null;
  dedupeKey: string;
};

export type DummyHomeRiskEventFixture = {
  provider: HomeRiskReplaySignalProvider;
  eventType: HomeRiskReplayEventType;
  eventSubType?: string | null;
  severity: HomeRiskReplayEventSeverity;
  titleTemplate: string;
  summaryTemplate?: string | null;
  geographyType?: HomeRiskReplaySignalGeographyType;
  startOffsetDays: number;
  durationDays?: number | null;
  payloadTemplate?: Record<string, unknown> | null;
};

export type DummyHomeRiskFixtureSet = 'property_scoped' | 'zip_scoped';
