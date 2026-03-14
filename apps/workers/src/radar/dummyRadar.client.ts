import propertyScopedSignalFixtures from './fixtures/propertyScopedSignals.json';
import zipScopedSignalFixtures from './fixtures/zipScopedSignals.json';
import type {
  DummyRadarFixtureSet,
  DummyRadarRawSignal,
  DummyRadarSignalFixture,
} from './radar.types';

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

function isoAtOffset(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildSignalId(scopeKey: string, type: DummyRadarRawSignal['signalType'], geographyType: DummyRadarRawSignal['geography']['type']): string {
  return `dummy:${dayKey()}:${geographyType}:${scopeKey}:${type}`;
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

function geographyKeyForType(type: DummyRadarRawSignal['geography']['type'], property: TargetProperty): string {
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

function resolveFixtureSet(): DummyRadarFixtureSet {
  const value = (process.env.RADAR_DUMMY_FIXTURE_SET || 'zip_scoped').trim().toLowerCase();
  return value === 'property_scoped' ? 'property_scoped' : 'zip_scoped';
}

function loadFixtures(set: DummyRadarFixtureSet): DummyRadarSignalFixture[] {
  if (set === 'property_scoped') {
    return propertyScopedSignalFixtures as DummyRadarSignalFixture[];
  }
  return zipScopedSignalFixtures as DummyRadarSignalFixture[];
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

export async function fetchDummyRadarSignals(properties: TargetProperty[]): Promise<DummyRadarRawSignal[]> {
  const signals: DummyRadarRawSignal[] = [];
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
      const providerEventId = buildSignalId(geographyKey, fixture.signalType, geographyType);
      signals.push({
        provider: fixture.provider,
        providerEventId,
        signalType: fixture.signalType,
        headline: renderTemplate(fixture.headlineTemplate, primaryProperty) ?? `Test radar signal for ${primaryProperty.address}`,
        summary: renderTemplate(fixture.summaryTemplate, primaryProperty),
        severity: fixture.severity,
        startsAt: isoAtOffset(fixture.startOffsetHours),
        endsAt: fixture.endOffsetHours !== undefined && fixture.endOffsetHours !== null
          ? isoAtOffset(fixture.endOffsetHours)
          : null,
        geography: {
          type: geographyType,
          key: geographyKey,
        },
        raw: {
          seed: true,
          seedType: 'dummy_radar_signal',
          fixtureSet,
          fixtureSignalType: fixture.signalType,
          targetPropertyIds,
          property: {
            id: primaryProperty.id,
            address: primaryProperty.address,
            city: primaryProperty.city,
            state: primaryProperty.state,
            zipCode: primaryProperty.zipCode,
          },
          generatedAt: new Date().toISOString(),
        },
      });
    }
  }

  return signals;
}
