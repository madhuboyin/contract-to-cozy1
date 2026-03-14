import type { DummyRadarRawSignal } from './radar.types';

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

function buildSignalId(propertyId: string, type: DummyRadarRawSignal['signalType']): string {
  return `dummy:${dayKey()}:${propertyId}:${type}`;
}

function buildSummary(type: DummyRadarRawSignal['signalType'], property: TargetProperty): string {
  switch (type) {
    case 'hail':
      return `Synthetic hail signal for ${property.city}, ${property.state}, generated for Home Event Radar end-to-end testing.`;
    case 'utility_outage':
      return `Synthetic utility outage signal for ${property.zipCode}, generated to test property feed delivery.`;
    case 'insurance_market':
      return `Synthetic insurance market shift signal for ${property.state}, generated for Home Event Radar QA.`;
    case 'tax_reassessment':
      return `Synthetic tax reassessment signal for ${property.city}, generated for Home Event Radar QA.`;
    default:
      return `Synthetic radar signal for ${property.address}.`;
  }
}

function signalBlueprints(property: TargetProperty): Array<{
  provider: DummyRadarRawSignal['provider'];
  signalType: DummyRadarRawSignal['signalType'];
  severity: DummyRadarRawSignal['severity'];
  headline: string;
  startOffsetHours: number;
  endOffsetHours?: number;
}> {
  return [
    {
      provider: 'weather_provider',
      signalType: 'hail',
      severity: 'high',
      headline: `Test hail activity near ${property.address}`,
      startOffsetHours: -6,
      endOffsetHours: -2,
    },
    {
      provider: 'utility_feed',
      signalType: 'utility_outage',
      severity: 'medium',
      headline: `Test utility outage watch for ${property.zipCode}`,
      startOffsetHours: -3,
      endOffsetHours: 3,
    },
    {
      provider: 'insurance_market_feed',
      signalType: 'insurance_market',
      severity: 'low',
      headline: `Test insurance market pressure in ${property.state}`,
      startOffsetHours: -12,
      endOffsetHours: 24,
    },
    {
      provider: 'tax_assessor_feed',
      signalType: 'tax_reassessment',
      severity: 'info',
      headline: `Test reassessment notice for ${property.city}`,
      startOffsetHours: -24,
      endOffsetHours: 72,
    },
  ];
}

export async function fetchDummyRadarSignals(properties: TargetProperty[]): Promise<DummyRadarRawSignal[]> {
  const signals: DummyRadarRawSignal[] = [];

  for (const property of properties) {
    for (const blueprint of signalBlueprints(property)) {
      const providerEventId = buildSignalId(property.id, blueprint.signalType);
      signals.push({
        provider: blueprint.provider,
        providerEventId,
        signalType: blueprint.signalType,
        headline: blueprint.headline,
        summary: buildSummary(blueprint.signalType, property),
        severity: blueprint.severity,
        startsAt: isoAtOffset(blueprint.startOffsetHours),
        endsAt: blueprint.endOffsetHours !== undefined ? isoAtOffset(blueprint.endOffsetHours) : null,
        geography: {
          type: 'property',
          key: property.id,
        },
        raw: {
          seed: true,
          seedType: 'dummy_radar_signal',
          property: {
            id: property.id,
            address: property.address,
            city: property.city,
            state: property.state,
            zipCode: property.zipCode,
          },
          generatedAt: new Date().toISOString(),
        },
      });
    }
  }

  return signals;
}
