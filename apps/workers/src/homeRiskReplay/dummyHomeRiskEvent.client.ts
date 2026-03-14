import propertyScopedFixtures from './fixtures/propertyScopedEvents.json';
import zipScopedFixtures from './fixtures/zipScopedEvents.json';
import type {
  DummyHomeRiskEventFixture,
  DummyHomeRiskFixtureSet,
  DummyHomeRiskRawSignal,
  HomeRiskReplaySignalGeographyType,
} from './homeRiskReplay.types';

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

function isoAtDayOffset(daysOffset: number): string {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
}

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function buildSignalId(
  scopeKey: string,
  eventType: DummyHomeRiskRawSignal['eventType'],
  geographyType: DummyHomeRiskRawSignal['geography']['type'],
  startsAt: string,
): string {
  return `dummy-home-risk:${dayKeyFromIso(startsAt)}:${geographyType}:${scopeKey}:${eventType}`;
}

function renderTemplate(template: string | null | undefined, property: TargetProperty): string | null {
  if (!template) return null;

  return [
    ['{{address}}', property.address],
    ['{{city}}', property.city],
    ['{{state}}', property.state],
    ['{{zipCode}}', property.zipCode],
    ['{{propertyId}}', property.id],
  ].reduce((value, [token, replacement]) => value.split(token).join(replacement), template);
}

function geographyKeyForType(type: HomeRiskReplaySignalGeographyType, property: TargetProperty): string {
  switch (type) {
    case 'property':
      return property.id;
    case 'zip':
      return property.zipCode;
    case 'city':
      return property.city;
    case 'state':
      return property.state;
    default:
      return property.id;
  }
}

function resolveFixtureSet(): DummyHomeRiskFixtureSet {
  const value = (process.env.HOME_RISK_REPLAY_DUMMY_FIXTURE_SET || 'zip_scoped').trim().toLowerCase();
  return value === 'property_scoped' ? 'property_scoped' : 'zip_scoped';
}

function loadFixtures(set: DummyHomeRiskFixtureSet): DummyHomeRiskEventFixture[] {
  if (set === 'property_scoped') {
    return propertyScopedFixtures as DummyHomeRiskEventFixture[];
  }
  return zipScopedFixtures as DummyHomeRiskEventFixture[];
}

function groupPropertiesByZip(properties: TargetProperty[]): TargetProperty[][] {
  const groups = new Map<string, TargetProperty[]>();

  for (const property of properties) {
    const key = property.zipCode.trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(property);
  }

  return Array.from(groups.values());
}

export async function fetchDummyHomeRiskEvents(properties: TargetProperty[]): Promise<DummyHomeRiskRawSignal[]> {
  const signals: DummyHomeRiskRawSignal[] = [];
  const fixtureSet = resolveFixtureSet();
  const fixtures = loadFixtures(fixtureSet);
  const groups = fixtureSet === 'property_scoped'
    ? properties.map((property) => [property])
    : groupPropertiesByZip(properties);

  for (const group of groups) {
    const primaryProperty = group[0];
    const targetPropertyIds = group.map((property) => property.id);

    for (const fixture of fixtures) {
      const geographyType = fixture.geographyType ?? 'property';
      const geographyKey = geographyKeyForType(geographyType, primaryProperty);
      const startsAt = isoAtDayOffset(fixture.startOffsetDays);
      const endsAt = fixture.durationDays !== undefined && fixture.durationDays !== null
        ? isoAtDayOffset(fixture.startOffsetDays + fixture.durationDays)
        : null;
      const providerEventId = buildSignalId(geographyKey, fixture.eventType, geographyType, startsAt);

      signals.push({
        provider: fixture.provider,
        providerEventId,
        eventType: fixture.eventType,
        eventSubType: fixture.eventSubType ?? null,
        title: renderTemplate(fixture.titleTemplate, primaryProperty) ?? `Historical ${fixture.eventType} event`,
        summary: renderTemplate(fixture.summaryTemplate, primaryProperty),
        severity: fixture.severity,
        startsAt,
        endsAt,
        geography: {
          type: geographyType,
          key: geographyKey,
        },
        raw: {
          seed: true,
          seedType: 'dummy_home_risk_event',
          fixtureSet,
          fixtureEventType: fixture.eventType,
          targetPropertyIds,
          property: {
            id: primaryProperty.id,
            address: primaryProperty.address,
            city: primaryProperty.city,
            state: primaryProperty.state,
            zipCode: primaryProperty.zipCode,
          },
          geographyType,
          generatedAt: new Date().toISOString(),
        },
      });
    }
  }

  return signals;
}
