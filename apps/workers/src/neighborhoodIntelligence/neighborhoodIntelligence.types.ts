// apps/workers/src/neighborhoodIntelligence/neighborhoodIntelligence.types.ts
//
// Worker-level types for the Neighborhood Intelligence dummy event client.
// Self-contained — no Prisma imports — so they compile cleanly in the workers package.

export type DummyNeighborhoodEventProvider =
  | 'city_planning_feed'
  | 'fema_feed'
  | 'school_district_feed'
  | 'state_dot_feed'
  | 'utility_planning_feed'
  | 'internal_seed';

export type DummyNeighborhoodEventType =
  | 'TRANSIT_PROJECT'
  | 'HIGHWAY_PROJECT'
  | 'COMMERCIAL_DEVELOPMENT'
  | 'RESIDENTIAL_DEVELOPMENT'
  | 'INDUSTRIAL_PROJECT'
  | 'WAREHOUSE_PROJECT'
  | 'ZONING_CHANGE'
  | 'SCHOOL_RATING_CHANGE'
  | 'SCHOOL_BOUNDARY_CHANGE'
  | 'FLOOD_MAP_UPDATE'
  | 'UTILITY_INFRASTRUCTURE'
  | 'PARK_DEVELOPMENT'
  | 'LARGE_CONSTRUCTION';

export type DummyNeighborhoodFixtureSet = 'property_scoped' | 'city_scoped';

/**
 * Raw event output from the dummy neighborhood event client.
 * Shape matches NormalizedNeighborhoodEventInput from the backend ingestion service,
 * making it safe to pass directly to NeighborhoodIntelligenceService.ingestAndProcessEvent().
 */
export type DummyNeighborhoodRawEvent = {
  externalSourceId: string;
  eventType: DummyNeighborhoodEventType;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  sourceName: string;
  sourceUrl: string | null;
  announcedDate: string;
  expectedStartDate: string | null;
  expectedEndDate: string | null;
  raw: Record<string, unknown>;
};

/**
 * Single fixture entry in a JSON fixture file.
 */
export type DummyNeighborhoodEventFixture = {
  /** Prefix used to build the externalSourceId. Combined with scopeKey at runtime. */
  externalSourceIdPrefix: string;
  provider: DummyNeighborhoodEventProvider;
  eventType: DummyNeighborhoodEventType;
  titleTemplate: string;
  descriptionTemplate: string | null;
  sourceName: string;
  /** Omit to simulate a low-data-quality event (lowers confidence score). */
  sourceUrl: string | null;
  /**
   * Degrees offset from the base latitude.
   * Keeps the event at a realistic nearby coordinate without requiring geocoding.
   */
  latOffsetDegrees: number;
  lonOffsetDegrees: number;
  /** Days in the past the event was announced (e.g. -60 = 2 months ago). */
  announcedOffsetDays: number;
  /** Days from today for expected project start. null = not specified. */
  expectedStartOffsetDays: number | null;
  /** Days from today for expected project end. null = open-ended. */
  expectedEndOffsetDays: number | null;
};
