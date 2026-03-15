// apps/workers/src/neighborhoodIntelligence/dummyNeighborhoodEvent.client.ts
//
// Dummy neighborhood event client for end-to-end and QA testing.
//
// Mirrors the pattern established by dummyRadar.client.ts and
// dummyHomeRiskEvent.client.ts. Generates realistic NormalizedNeighborhoodEventInput-
// shaped objects from fixture files, ready to pass to:
//   NeighborhoodIntelligenceService.ingestAndProcessEvent()
//
// Fixture sets:
//   property_scoped — unique events per property (distinct neighborhoods)
//   city_scoped     — shared events per city+state (city-wide developments)
//
// Select the active fixture set via:
//   NEIGHBORHOOD_DUMMY_FIXTURE_SET=property_scoped  (or city_scoped, the default)
//
// Base coordinates:
//   Property lat/lng are used when provided via baseLatitude / baseLongitude.
//   Falls back to a reference coordinate (33.749, -84.388) for any property
//   that doesn't carry explicit coordinates. Matching is city+state-based
//   in the current MVP, so the coordinates just need to be valid.

import propertyScopedFixtures from './fixtures/propertyScopedEvents.json';
import cityScopedFixtures from './fixtures/cityScopedEvents.json';
import type {
  DummyNeighborhoodEventFixture,
  DummyNeighborhoodFixtureSet,
  DummyNeighborhoodRawEvent,
} from './neighborhoodIntelligence.types';

// Fallback base coordinate when a property doesn't provide explicit lat/lng.
// 33.749, -84.388 = Atlanta, GA — same reference used in the dev seed script.
const FALLBACK_BASE_LATITUDE = 33.749;
const FALLBACK_BASE_LONGITUDE = -84.388;

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  /** Optional: used for geo-accurate fixture offsets. Falls back to FALLBACK_BASE if absent. */
  baseLatitude?: number | null;
  baseLongitude?: number | null;
};

function isoAtDayOffset(daysOffset: number): string {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildEventId(
  scopeKey: string,
  prefix: string,
  eventType: string,
): string {
  return `dummy-neighborhood:${dayKey()}:${prefix}:${scopeKey}:${eventType.toLowerCase()}`;
}

function renderTemplate(
  template: string | null | undefined,
  property: TargetProperty,
): string | null {
  if (!template) return null;
  return [
    ['{{address}}', property.address],
    ['{{city}}', property.city],
    ['{{state}}', property.state],
    ['{{zipCode}}', property.zipCode],
    ['{{propertyId}}', property.id],
  ].reduce(
    (value, [token, replacement]) => value.split(token).join(replacement),
    template,
  );
}

function resolveFixtureSet(): DummyNeighborhoodFixtureSet {
  const value = (process.env.NEIGHBORHOOD_DUMMY_FIXTURE_SET ?? 'city_scoped')
    .trim()
    .toLowerCase();
  return value === 'property_scoped' ? 'property_scoped' : 'city_scoped';
}

function loadFixtures(set: DummyNeighborhoodFixtureSet): DummyNeighborhoodEventFixture[] {
  if (set === 'property_scoped') {
    return propertyScopedFixtures as DummyNeighborhoodEventFixture[];
  }
  return cityScopedFixtures as DummyNeighborhoodEventFixture[];
}

function cityKey(property: TargetProperty): string {
  return `${property.city.trim().toLowerCase()}_${property.state.trim().toLowerCase()}`;
}

function groupPropertiesByCity(properties: TargetProperty[]): TargetProperty[][] {
  const groups = new Map<string, TargetProperty[]>();
  for (const property of properties) {
    const key = cityKey(property);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(property);
  }
  return Array.from(groups.values());
}

function buildEvent(
  fixture: DummyNeighborhoodEventFixture,
  property: TargetProperty,
  scopeKey: string,
  targetPropertyIds: string[],
  fixtureSet: DummyNeighborhoodFixtureSet,
): DummyNeighborhoodRawEvent {
  const baseLat = property.baseLatitude ?? FALLBACK_BASE_LATITUDE;
  const baseLon = property.baseLongitude ?? FALLBACK_BASE_LONGITUDE;

  const latitude = baseLat + fixture.latOffsetDegrees;
  const longitude = baseLon + fixture.lonOffsetDegrees;

  const announcedDate = isoAtDayOffset(fixture.announcedOffsetDays);
  const expectedStartDate =
    fixture.expectedStartOffsetDays !== null
      ? isoAtDayOffset(fixture.expectedStartOffsetDays)
      : null;
  const expectedEndDate =
    fixture.expectedEndOffsetDays !== null
      ? isoAtDayOffset(fixture.expectedEndOffsetDays)
      : null;

  const externalSourceId = buildEventId(scopeKey, fixture.externalSourceIdPrefix, fixture.eventType);

  return {
    externalSourceId,
    eventType: fixture.eventType,
    title:
      renderTemplate(fixture.titleTemplate, property) ??
      `Test ${fixture.eventType.toLowerCase().replace(/_/g, ' ')} near ${property.city}`,
    description: renderTemplate(fixture.descriptionTemplate, property),
    latitude,
    longitude,
    city: property.city,
    state: property.state,
    country: 'US',
    sourceName: fixture.sourceName,
    sourceUrl: fixture.sourceUrl ?? null,
    announcedDate,
    expectedStartDate,
    expectedEndDate,
    raw: {
      seed: true,
      seedType: 'dummy_neighborhood_event',
      fixtureSet,
      fixtureEventType: fixture.eventType,
      fixturePrefix: fixture.externalSourceIdPrefix,
      targetPropertyIds,
      property: {
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate dummy neighborhood events for a list of target properties.
 *
 * Returns DummyNeighborhoodRawEvent[] whose shape matches
 * NormalizedNeighborhoodEventInput, ready to be passed to
 * NeighborhoodIntelligenceService.ingestAndProcessEvent().
 */
export async function fetchDummyNeighborhoodEvents(
  properties: TargetProperty[],
): Promise<DummyNeighborhoodRawEvent[]> {
  const events: DummyNeighborhoodRawEvent[] = [];
  const fixtureSet = resolveFixtureSet();
  const fixtures = loadFixtures(fixtureSet);

  if (fixtureSet === 'property_scoped') {
    // Each property gets its own unique set of events (distinct neighborhoods).
    for (const property of properties) {
      const scopeKey = property.id;
      const targetPropertyIds = [property.id];
      for (const fixture of fixtures) {
        events.push(buildEvent(fixture, property, scopeKey, targetPropertyIds, fixtureSet));
      }
    }
  } else {
    // city_scoped: properties sharing city+state receive the same set of events.
    const groups = groupPropertiesByCity(properties);
    for (const group of groups) {
      const primaryProperty = group[0];
      const scopeKey = cityKey(primaryProperty);
      const targetPropertyIds = group.map((p) => p.id);
      for (const fixture of fixtures) {
        events.push(buildEvent(fixture, primaryProperty, scopeKey, targetPropertyIds, fixtureSet));
      }
    }
  }

  return events;
}
