const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const envelope = require('../../src/services/intelligenceEnvelope/index.ts');

const NOW = '2026-08-28T12:00:00.000Z';
const PRODUCERS = envelope.ENVELOPE_PRODUCER_MODELS;

function signalResult(id, createdAt, signalKey = 'RISK_SPIKE') {
  return envelope.signalEnvelopeAdapter.map({
    id,
    propertyId: 'property-1',
    signalKey,
    version: 1,
    sourceModel: 'Fixture',
    sourceId: id,
    capturedAt: createdAt,
    validUntil: '2026-08-29T12:00:00.000Z',
    createdAt,
    updatedAt: createdAt,
  }, {
    propertyId: 'property-1',
    userId: 'user-1',
    evidence: [{
      id: `evidence-${id}`,
      type: 'SYSTEM_DERIVATION',
      label: 'Fixture evidence',
      source: 'query-test',
      observedAt: createdAt,
      freshness: 'CURRENT',
      confidence: 0.9,
    }],
  });
}

function lifecycleSignalResult(id, category) {
  return envelope.signalEnvelopeAdapter.map({
    id,
    propertyId: 'property-1',
    signalKey: 'SYSTEM_DEGRADATION',
    homeItemId: `item-${id}`,
    version: 1,
    sourceModel: 'Fixture',
    sourceId: id,
    capturedAt: NOW,
    validUntil: '2026-08-29T12:00:00.000Z',
    createdAt: NOW,
    updatedAt: NOW,
    inventory: { category, assetType: null },
  }, {
    propertyId: 'property-1',
    userId: 'user-1',
    evidence: [{
      id: `evidence-${id}`,
      type: 'SYSTEM_DERIVATION',
      label: 'Fixture evidence',
      source: 'query-test',
      observedAt: NOW,
      freshness: 'CURRENT',
      confidence: 0.9,
    }],
  });
}

function readers(overrides = {}) {
  return Object.fromEntries(PRODUCERS.map((producerModel) => [producerModel, overrides[producerModel] ?? {
    producerModel,
    read: async () => [],
  }]));
}

function dependencies(overrides = {}) {
  return {
    authorizeProperty: async () => true,
    readers: readers(),
    now: () => new Date(NOW),
    perAdapterTimeoutMs: 50,
    totalTimeoutMs: 100,
    ...overrides,
  };
}

test('authorization fails closed before any registered producer read', async () => {
  let reads = 0;
  const allReaders = readers(Object.fromEntries(PRODUCERS.map((producerModel) => [producerModel, {
    producerModel,
    read: async () => { reads += 1; return []; },
  }])));
  await assert.rejects(
    envelope.queryIntelligenceEnvelope({
      propertyId: 'property-1',
      principal: { kind: 'HOMEOWNER_SESSION', userId: 'fabricated-user' },
    }, dependencies({ authorizeProperty: async () => false, readers: allReaders })),
    (error) => error.code === 'INTELLIGENCE_ENVELOPE_ACCESS_DENIED',
  );
  assert.equal(reads, 0);
});

test('pagination is deterministic for timestamp ties and cursor is query-bound', async () => {
  const results = [signalResult('signal-c', NOW), signalResult('signal-a', NOW), signalResult('signal-b', NOW)];
  const queryReaders = readers({ Signal: { producerModel: 'Signal', read: async () => results } });
  const query = {
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['Signal'],
    limit: 2,
  };
  const first = await envelope.queryIntelligenceEnvelope(query, dependencies({ readers: queryReaders }));
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.deepEqual(first.items.map((item) => item.envelopeKey), [...first.items.map((item) => item.envelopeKey)].sort());

  const second = await envelope.queryIntelligenceEnvelope({ ...query, cursor: first.nextCursor }, dependencies({ readers: queryReaders }));
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.envelopeKey)).size, 3);
  await assert.rejects(
    envelope.queryIntelligenceEnvelope({ ...query, limit: 3, cursor: first.nextCursor }, dependencies({ readers: queryReaders })),
    /does not match the query shape/,
  );
});

test('filtered queries page native readers until older matching rows are found', async () => {
  const rows = [
    ...Array.from({ length: 350 }, (_, index) => signalResult(
      `safety-${String(index).padStart(3, '0')}`,
      new Date(Date.parse(NOW) - index * 1000).toISOString(),
    )),
    signalResult('financial-match', '2026-08-20T12:00:00.000Z', 'COST_PRESSURE_PATTERN'),
  ];
  const queryReaders = readers({ Signal: {
    producerModel: 'Signal',
    read: async ({ offset, rowLimit }) => rows.slice(offset, offset + rowLimit),
  } });
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['Signal'],
    domains: ['FINANCIAL'],
    limit: 1,
  }, dependencies({ readers: queryReaders, perAdapterTimeoutMs: 1_000, totalTimeoutMs: 2_000 }));

  assert.deepEqual(page.items.map((item) => item.source.sourceRecordId), ['financial-match']);
  assert.equal(page.nextCursor, null);
});

test('pagination reaches rows beyond the first native batch when timestamps tie', async () => {
  const rows = Array.from({ length: 350 }, (_, index) => signalResult(
    `signal-${String(index).padStart(3, '0')}`,
    NOW,
  ));
  const queryReaders = readers({ Signal: {
    producerModel: 'Signal',
    read: async ({ offset, rowLimit }) => rows.slice(offset, offset + rowLimit),
  } });
  const baseQuery = {
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['Signal'],
    limit: 100,
  };
  const seen = [];
  let cursor;
  do {
    const page = await envelope.queryIntelligenceEnvelope(
      { ...baseQuery, ...(cursor ? { cursor } : {}) },
      dependencies({ readers: queryReaders, perAdapterTimeoutMs: 1_000, totalTimeoutMs: 2_000 }),
    );
    seen.push(...page.items.map((item) => item.envelopeKey));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  assert.equal(seen.length, 350);
  assert.equal(new Set(seen).size, 350);
});

test('one producer timeout returns a diagnostic while healthy producer items survive', async () => {
  const queryReaders = readers({
    Signal: { producerModel: 'Signal', read: async () => [signalResult('signal-healthy', NOW)] },
    GuidanceSignal: { producerModel: 'GuidanceSignal', read: async () => new Promise(() => {}) },
  });
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['Signal', 'GuidanceSignal'],
  }, dependencies({ readers: queryReaders, perAdapterTimeoutMs: 5, totalTimeoutMs: 20 }));

  assert.equal(page.items.length, 1);
  assert.deepEqual(page.diagnostics, [{
    producerModel: 'GuidanceSignal',
    code: 'TIME_BUDGET_EXHAUSTED',
    count: 1,
  }]);
});

test('empty healthy producers return an empty page without failure diagnostics', async () => {
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
  }, dependencies());
  assert.deepEqual(page.items, []);
  assert.deepEqual(page.diagnostics, []);
  assert.equal(page.nextCursor, null);
});

test('a PROPERTY roof component scope matches roof inventory intelligence but not unrelated assets', async () => {
  const queryReaders = readers({ Signal: {
    producerModel: 'Signal',
    read: async () => [lifecycleSignalResult('roof', 'ROOF_EXTERIOR'), lifecycleSignalResult('hvac', 'HVAC')],
  } });
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['Signal'],
    domains: ['ASSET_LIFECYCLE'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' }],
  }, dependencies({ readers: queryReaders }));

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].subject.entityRef.assetCategory, 'ROOF_EXTERIOR');
});

test('coverage query preserves exact internal adapter capabilities without widening the public page', async () => {
  const result = signalResult('signal-observed', NOW);
  const queryReaders = readers({ Signal: { producerModel: 'Signal', read: async () => [result] } });
  const query = {
    propertyId: 'property-1',
    principal: { kind: 'BACKGROUND_JOB_RESOLVED_OWNER', userId: 'user-1' },
    sourceModels: ['Signal'],
  };
  const coverage = await envelope.queryIntelligenceEnvelopeForCoverage(
    query,
    dependencies({ readers: queryReaders }),
  );
  const publicPage = await envelope.queryIntelligenceEnvelope(query, dependencies({ readers: queryReaders }));

  assert.deepEqual(coverage.page, publicPage);
  assert.deepEqual(coverage.observedCapabilities, [{
    producerModel: 'Signal',
    type: 'SIGNAL',
    domain: 'SAFETY',
    nativeSubtype: 'RISK_SPIKE',
    observedAt: NOW,
    envelopeKey: coverage.page.items[0].envelopeKey,
  }]);
  assert.equal('observedCapabilities' in publicPage, false);
});

// Implementation plan §4.6/§31 Scenario 8.4 ("is my roof at risk because of
// the storms?"). PropertyRadarMatch/PropertyRadarCompoundInsight never set
// entityRef until this fix, so no Radar-sourced item could ever satisfy a
// component-scoped query (matchesEntityScope returns false when `actual`
// is absent) -- regardless of domain-list breadth.

function radarMatchRow(overrides = {}) {
  return {
    id: 'match-1',
    propertyId: 'property-1',
    radarEventId: 'event-1',
    eventType: 'heavy_rain',
    provider: 'test-provider',
    eventObservedAt: NOW,
    eventExpiresAt: null,
    impactLevel: 'high',
    confidenceScore: 0.9,
    lifecycleStatus: 'now',
    sourceFreshnessStatus: 'fresh',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function radarMatchResult(overrides = {}) {
  return envelope.propertyRadarMatchEnvelopeAdapter.map(radarMatchRow(overrides), {
    propertyId: 'property-1',
    userId: 'user-1',
    evidence: [],
  });
}

function radarCompoundRow(overrides = {}) {
  return {
    id: 'compound-1',
    propertyId: 'property-1',
    ruleCode: 'SEVERE_WEATHER_OPEN_ROOF_ISSUE',
    ruleVersion: 'compound-v1',
    correlationKey: 'corr-1',
    status: 'active',
    evaluatedAt: NOW,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function radarCompoundResult(overrides = {}) {
  return envelope.propertyRadarCompoundInsightEnvelopeAdapter.map(radarCompoundRow(overrides), {
    propertyId: 'property-1',
    userId: 'user-1',
    evidence: [],
  });
}

test('radarMatchEntityRef derives a componentKind from the highest-relevance mappable matched system, and leaves it unset when none is mappable', () => {
  assert.deepEqual(
    envelope.radarMatchEntityRef('property-1', { systems: [{ type: 'roof', relevance: 'high' }] }),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' },
  );
  assert.deepEqual(
    envelope.radarMatchEntityRef('property-1', { systems: [{ type: 'foundation', relevance: 'medium' }] }),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'FOUNDATION' },
  );
  assert.deepEqual(
    envelope.radarMatchEntityRef('property-1', { systems: [{ type: 'drainage', relevance: 'high' }] }),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'SITE' },
  );
  // Highest relevance wins when multiple mappable systems are present.
  assert.deepEqual(
    envelope.radarMatchEntityRef('property-1', { systems: [
      { type: 'foundation', relevance: 'medium' },
      { type: 'roof', relevance: 'high' },
    ] }),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' },
  );
  // Appliance/system-level types (hvac, plumbing, electrical, water_heater,
  // sump_pump, insurance) have no PropertyComponentKind equivalent --
  // deliberately left unset rather than guessing.
  assert.equal(envelope.radarMatchEntityRef('property-1', { systems: [{ type: 'hvac', relevance: 'high' }] }), undefined);
  assert.equal(envelope.radarMatchEntityRef('property-1', { systems: [] }), undefined);
  assert.equal(envelope.radarMatchEntityRef('property-1', null), undefined);
  assert.equal(envelope.radarMatchEntityRef('property-1', 'not-an-object'), undefined);
});

test('radarCompoundEntityRef derives a componentKind for the three attributable compound rules, and leaves the two HVAC-only rules unset', () => {
  assert.deepEqual(
    envelope.radarCompoundEntityRef('property-1', 'SEVERE_WEATHER_OPEN_ROOF_ISSUE'),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' },
  );
  assert.deepEqual(
    envelope.radarCompoundEntityRef('property-1', 'HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE'),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'SITE' },
  );
  assert.deepEqual(
    envelope.radarCompoundEntityRef('property-1', 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP'),
    { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'FOUNDATION' },
  );
  assert.equal(envelope.radarCompoundEntityRef('property-1', 'SMOKE_HVAC_FILTER'), undefined);
  assert.equal(envelope.radarCompoundEntityRef('property-1', 'FREEZE_OUTAGE_ELECTRIC_HEAT'), undefined);
});

test('propertyRadarMatchEnvelopeAdapter and propertyRadarCompoundInsightEnvelopeAdapter forward an explicit entityRef onto the mapped item subject', () => {
  const withRef = radarMatchResult({ entityRef: { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' } });
  assert.deepEqual(withRef.item.subject.entityRef, { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' });
  const withoutRef = radarMatchResult();
  assert.equal('entityRef' in withoutRef.item.subject, false);

  const compoundWithRef = radarCompoundResult({ entityRef: { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' } });
  assert.deepEqual(compoundWithRef.item.subject.entityRef, { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' });
});

test('a WEATHER-domain ROOF-scoped query matches a Radar match carrying a roof entityRef but not one with no entityRef', async () => {
  const roofMatch = radarMatchResult({ id: 'match-roof', entityRef: { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' } });
  const unattributedMatch = radarMatchResult({ id: 'match-unattributed' });
  const queryReaders = readers({ PropertyRadarMatch: {
    producerModel: 'PropertyRadarMatch',
    read: async () => [roofMatch, unattributedMatch],
  } });
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['PropertyRadarMatch'],
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' }],
  }, dependencies({ readers: queryReaders }));

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].source.sourceRecordId, 'match-roof');
});

test('a ROOF-scoped query matches a Radar compound insight carrying a roof entityRef', async () => {
  const roofInsight = radarCompoundResult({ entityRef: { entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' } });
  const queryReaders = readers({ PropertyRadarCompoundInsight: {
    producerModel: 'PropertyRadarCompoundInsight',
    read: async () => [roofInsight],
  } });
  const page = await envelope.queryIntelligenceEnvelope({
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    sourceModels: ['PropertyRadarCompoundInsight'],
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' }],
  }, dependencies({ readers: queryReaders }));

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].source.sourceRecordId, 'compound-1');
});
