export type DummyRadarRawSignal = {
  provider:
    | 'weather_provider'
    | 'insurance_market_feed'
    | 'utility_feed'
    | 'tax_assessor_feed'
    | 'internal_derived'
    | 'manual_import';
  providerEventId: string;
  signalType:
    | 'weather'
    | 'insurance_market'
    | 'utility_outage'
    | 'utility_rate_change'
    | 'tax_reassessment'
    | 'tax_rate_change'
    | 'air_quality'
    | 'wildfire_smoke'
    | 'flood_risk'
    | 'heat_wave'
    | 'freeze'
    | 'hail'
    | 'heavy_rain'
    | 'wind'
    | 'power_surge_risk'
    | 'nearby_construction'
    | 'other';
  headline: string;
  summary?: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  startsAt: string;
  endsAt?: string | null;
  geography: {
    type: 'property' | 'zip' | 'city' | 'county' | 'state' | 'polygon';
    key: string;
  };
  raw: Record<string, unknown>;
};

export type CanonicalRadarSignal = {
  eventType: DummyRadarRawSignal['signalType'];
  eventSubType?: string | null;
  title: string;
  summary?: string | null;
  sourceType: DummyRadarRawSignal['provider'];
  sourceRef?: string | null;
  severity: DummyRadarRawSignal['severity'];
  startAt: string;
  endAt?: string | null;
  locationType: DummyRadarRawSignal['geography']['type'];
  locationKey: string;
  geoJson?: Record<string, unknown> | null;
  payloadJson?: Record<string, unknown> | null;
  dedupeKey: string;
  status: 'active' | 'resolved' | 'archived';
};

export type DummyRadarSignalFixture = {
  provider: DummyRadarRawSignal['provider'];
  signalType: DummyRadarRawSignal['signalType'];
  severity: DummyRadarRawSignal['severity'];
  headlineTemplate: string;
  summaryTemplate?: string | null;
  geographyType?: DummyRadarRawSignal['geography']['type'];
  startOffsetHours: number;
  endOffsetHours?: number | null;
};

export type DummyRadarFixtureSet = 'property_scoped' | 'zip_scoped';
