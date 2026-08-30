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
