const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  FAILURE_REFRESH_MS,
  MATCH_REFRESH_MS,
  NEGATIVE_MATCH_REFRESH_MS,
  PropertyEnrichmentService,
  canRentCastReplaceCoordinates,
  refreshAtForStatus,
  shouldSuppressEnrichment,
} = require('../../src/propertyEnrichment/propertyEnrichment.service.ts');

const completedAt = new Date('2026-09-09T12:00:00.000Z');
const payload = {
  propertyId: '11111111-1111-4111-8111-111111111111',
  provider: 'RENTCAST',
  addressVersion: 1,
  contractVersion: 1,
};

function record(overrides = {}) {
  return {
    id: 'rentcast-record-1',
    formattedAddress: '5500 Grand Lake Dr, San Antonio, TX 78244',
    addressLine1: '5500 Grand Lake Dr',
    addressLine2: null,
    city: 'San Antonio',
    state: 'TX',
    stateFips: '48',
    zipCode: '78244',
    county: 'Bexar',
    countyFips: '029',
    latitude: 29.475962,
    longitude: -98.351442,
    propertyType: 'Single Family',
    bedrooms: 0,
    bathrooms: 2.5,
    squareFootage: 1878,
    lotSize: 8850,
    yearBuilt: 1973,
    assessorID: '05076-103-0500',
    ...overrides,
  };
}

function property(overrides = {}) {
  return {
    id: payload.propertyId,
    address: '5500 Grand Lake Dr',
    unit: null,
    city: 'San Antonio',
    state: 'TX',
    zipCode: '78244',
    addressIdentityVersion: 1,
    dwellingType: 'UNKNOWN',
    yearBuilt: null,
    propertySize: null,
    bedrooms: null,
    bathrooms: null,
    county: null,
    countyFips: null,
    latitude: null,
    longitude: null,
    geocodingProvider: null,
    exteriorProfile: null,
    propertyFactEvidence: [],
    externalIdentities: [],
    ...overrides,
  };
}

function harness(options = {}) {
  const calls = {
    client: 0,
    transactions: 0,
    committed: [],
  };
  const outerProperty = options.outerProperty === null
    ? null
    : options.outerProperty ?? property();
  const innerProperty = options.innerProperty === null
    ? null
    : options.innerProperty ?? property();
  const innerExternalState = options.innerExternalState ?? null;
  const clientOutcome = options.clientOutcome ?? {
    kind: 'SUCCESS',
    records: [record()],
    requestCompletedAt: completedAt,
  };

  const db = {
    property: {
      findUnique: async () => outerProperty,
    },
    $transaction: async (callback) => {
      calls.transactions += 1;
      const pending = [];
      const tx = {
        property: {
          findUnique: async () => innerProperty,
          update: async (args) => {
            pending.push({ type: 'property.update', args });
            return innerProperty;
          },
        },
        propertyExternalIdentity: {
          findUnique: async () => innerExternalState,
          upsert: async (args) => {
            pending.push({ type: 'identity.upsert', args });
            return args.update;
          },
        },
        propertyExteriorProfile: {
          upsert: async (args) => {
            pending.push({ type: 'exterior.upsert', args });
            return args.update;
          },
        },
        propertyFactEvidence: {
          updateMany: async (args) => {
            pending.push({ type: 'evidence.supersede', args });
            return { count: 1 };
          },
          create: async (args) => {
            if (options.failEvidenceCreate) throw new Error('simulated evidence failure');
            pending.push({ type: 'evidence.create', args });
            return { id: `evidence-${pending.length}`, ...args.data };
          },
        },
        propertyRadarCoverage: {
          deleteMany: async (args) => {
            pending.push({ type: 'radarCoverage.deleteMany', args });
            return { count: 0 };
          },
        },
        $executeRaw: async (...args) => {
          pending.push({ type: 'locationPoint.update', args });
          return 1;
        },
        $queryRaw: async () => innerProperty === null
          ? []
          : [{ addressIdentityVersion: innerProperty.addressIdentityVersion }],
      };
      const result = await callback(tx);
      calls.committed.push(...pending);
      return result;
    },
  };
  const client = {
    fetchPropertyRecords: async () => {
      calls.client += 1;
      return clientOutcome;
    },
  };
  const emitPropertyChange = async (_tx, input) => {
    if (options.failChangeEmission) throw new Error('simulated recompute failure');
    calls.committed.push({ type: 'change.emit', args: input });
    return { change: { id: 'change-1' }, deduped: false };
  };
  const service = new PropertyEnrichmentService({
    prisma: db,
    client,
    now: () => completedAt,
    emitPropertyChange,
  });
  return { service, calls };
}

function operations(calls, type) {
  return calls.committed.filter((call) => call.type === type);
}

test('applies the FRD cache windows and only suppresses the same current contract/address', () => {
  assert.equal(MATCH_REFRESH_MS, 90 * 24 * 60 * 60 * 1000);
  assert.equal(NEGATIVE_MATCH_REFRESH_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(FAILURE_REFRESH_MS, 24 * 60 * 60 * 1000);
  assert.equal(refreshAtForStatus('MATCHED', completedAt).toISOString(), '2026-12-08T12:00:00.000Z');
  assert.equal(refreshAtForStatus('NO_MATCH', completedAt).toISOString(), '2026-09-16T12:00:00.000Z');
  assert.equal(refreshAtForStatus('FAILED', completedAt).toISOString(), '2026-09-10T12:00:00.000Z');

  const state = {
    addressVersion: 1,
    contractVersion: 1,
    matchStatus: 'MATCHED',
    nextRefreshAt: new Date('2026-09-10T00:00:00.000Z'),
  };
  assert.equal(shouldSuppressEnrichment(state, payload, completedAt), true);
  assert.equal(shouldSuppressEnrichment({ ...state, addressVersion: 2 }, payload, completedAt), false);
  assert.equal(shouldSuppressEnrichment({ ...state, contractVersion: 2 }, payload, completedAt), false);
  assert.equal(shouldSuppressEnrichment({ ...state, matchStatus: 'STALE' }, payload, completedAt), false);
  assert.equal(shouldSuppressEnrichment({ ...state, nextRefreshAt: completedAt }, payload, completedAt), false);
});

test('only permits RentCast to replace missing, RentCast-owned, or ZIP-centroid coordinates', () => {
  assert.equal(canRentCastReplaceCoordinates({ latitude: null, longitude: null, geocodingProvider: null }), true);
  assert.equal(canRentCastReplaceCoordinates({ latitude: 1, longitude: 2, geocodingProvider: 'rentcast' }), true);
  assert.equal(canRentCastReplaceCoordinates({ latitude: 1, longitude: 2, geocodingProvider: 'open-meteo' }), true);
  assert.equal(canRentCastReplaceCoordinates({ latitude: 1, longitude: 2, geocodingProvider: 'google-maps' }), false);
});

test('skips deleted, old-address, and fresh-cache jobs before provider I/O', async () => {
  const missing = harness({ outerProperty: null });
  assert.deepEqual(await missing.service.enrich(payload), { kind: 'NOT_FOUND' });
  assert.equal(missing.calls.client, 0);

  const stale = harness({ outerProperty: property({ addressIdentityVersion: 2 }) });
  assert.deepEqual(await stale.service.enrich(payload), { kind: 'STALE' });
  assert.equal(stale.calls.client, 0);

  const cached = harness({ outerProperty: property({
    externalIdentities: [{
      addressVersion: 1,
      contractVersion: 1,
      matchStatus: 'MATCHED',
      nextRefreshAt: new Date('2026-10-01T00:00:00.000Z'),
    }],
  }) });
  assert.deepEqual(await cached.service.enrich(payload), { kind: 'CACHE_HIT', status: 'MATCHED' });
  assert.equal(cached.calls.client, 0);
  assert.equal(cached.calls.transactions, 0);
});

test('rechecks address version after provider I/O and performs no stale writes', async () => {
  const state = harness({ innerProperty: property({ addressIdentityVersion: 2 }) });
  assert.deepEqual(await state.service.enrich(payload), { kind: 'STALE' });
  assert.equal(state.calls.client, 1);
  assert.equal(state.calls.transactions, 1);
  assert.deepEqual(state.calls.committed, []);
});

test('coalesces a duplicate outcome that became fresh while provider I/O was in flight', async () => {
  const state = harness({
    innerExternalState: {
      addressVersion: 1,
      contractVersion: 1,
      matchStatus: 'MATCHED',
      nextRefreshAt: new Date('2026-12-08T12:00:00.000Z'),
    },
  });
  assert.deepEqual(await state.service.enrich(payload), { kind: 'CACHE_HIT', status: 'MATCHED' });
  assert.equal(state.calls.client, 1);
  assert.equal(state.calls.transactions, 1);
  assert.deepEqual(state.calls.committed, []);
});

test('persists no-match and ambiguity with the seven-day negative cache', async () => {
  const noMatch = harness({
    clientOutcome: { kind: 'NO_RESULT', requestCompletedAt: completedAt },
  });
  assert.deepEqual(await noMatch.service.enrich(payload), {
    kind: 'COMPLETED', status: 'NO_MATCH', changedFactKeys: [], protectedFactKeys: [],
  });
  const noMatchState = operations(noMatch.calls, 'identity.upsert')[0].args.update;
  assert.equal(noMatchState.matchStatus, 'NO_MATCH');
  assert.equal(noMatchState.nextRefreshAt.toISOString(), '2026-09-16T12:00:00.000Z');
  assert.equal(noMatchState.externalId, null);

  const ambiguous = harness({
    clientOutcome: {
      kind: 'SUCCESS', records: [record({ id: 'one' }), record({ id: 'two' })], requestCompletedAt: completedAt,
    },
  });
  const result = await ambiguous.service.enrich(payload);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(operations(ambiguous.calls, 'identity.upsert')[0].args.update.matchStatus, 'AMBIGUOUS');
  assert.equal(operations(ambiguous.calls, 'evidence.create').length, 0);
});

test('persists retry progress, exhausted failure, and missing configuration safely', async () => {
  const retry = harness({ clientOutcome: { kind: 'RETRYABLE', code: 'TIMEOUT' } });
  assert.deepEqual(await retry.service.enrich(payload, { attemptNumber: 1, maxAttempts: 3 }), {
    kind: 'RETRYABLE', code: 'TIMEOUT',
  });
  assert.equal(operations(retry.calls, 'identity.upsert')[0].args.update.matchStatus, 'PENDING');
  assert.equal(operations(retry.calls, 'identity.upsert')[0].args.update.nextRefreshAt, null);

  const exhausted = harness({ clientOutcome: { kind: 'RETRYABLE', code: 'RATE_LIMIT' } });
  const failed = await exhausted.service.enrich(payload, { attemptNumber: 3, maxAttempts: 3 });
  assert.equal(failed.status, 'FAILED');
  assert.equal(operations(exhausted.calls, 'identity.upsert')[0].args.update.nextRefreshAt.toISOString(), '2026-09-10T12:00:00.000Z');

  const unconfigured = harness({ clientOutcome: { kind: 'NOT_CONFIGURED' } });
  const absent = await unconfigured.service.enrich(payload);
  assert.equal(absent.status, 'NOT_CONFIGURED');
  assert.equal(operations(unconfigured.calls, 'identity.upsert')[0].args.update.failureCode, 'NOT_CONFIGURED');
  assert.equal(operations(unconfigured.calls, 'evidence.create').length, 0);
});

test('atomically fills sparse canonical facts, evidence, identity, geocode, and one recompute', async () => {
  const state = harness();
  const result = await state.service.enrich(payload);

  assert.equal(result.kind, 'COMPLETED');
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.changedFactKeys.length, 9);
  assert.deepEqual(result.protectedFactKeys, []);
  assert.equal(operations(state.calls, 'property.update').length, 1);
  const propertyUpdate = operations(state.calls, 'property.update')[0].args.data;
  assert.equal(propertyUpdate.dwellingType, 'DETACHED_SINGLE_FAMILY');
  assert.equal(propertyUpdate.bedrooms, 0);
  assert.equal(propertyUpdate.countyFips, '48029');
  assert.equal(propertyUpdate.geocodingProvider, 'rentcast');
  assert.equal(operations(state.calls, 'exterior.upsert')[0].args.update.lotSizeSqFt, 8850);
  assert.equal(operations(state.calls, 'locationPoint.update').length, 1);
  assert.equal(operations(state.calls, 'radarCoverage.deleteMany').length, 1);
  assert.equal(operations(state.calls, 'evidence.create').length, 9);
  for (const evidence of operations(state.calls, 'evidence.create')) {
    assert.equal(evidence.args.data.sourceType, 'PUBLIC_RECORD');
    assert.equal(evidence.args.data.sourceEntityType, 'RENTCAST_PROPERTY_RECORD');
    assert.equal(evidence.args.data.sourceEntityId, 'rentcast-record-1');
    assert.equal(evidence.args.data.verifiedAt, null);
    assert.equal(evidence.args.data.confidence, null);
  }
  const identity = operations(state.calls, 'identity.upsert')[0].args.update;
  assert.equal(identity.matchStatus, 'MATCHED');
  assert.equal(identity.externalId, 'rentcast-record-1');
  assert.equal(identity.acceptedFactKeys.length, 9);
  assert.match(identity.responseFingerprint, /^[a-f0-9]{64}$/);
  const change = operations(state.calls, 'change.emit');
  assert.equal(change.length, 1);
  assert.deepEqual(change[0].args.changedFactKeys, result.changedFactKeys);
});

test('retains homeowner/document/inspection facts and canonical values without recognized evidence', async () => {
  const higherEvidence = [
    ['core.dwellingType', 'USER_REPORTED'],
    ['core.yearBuilt', 'DOCUMENT'],
    ['core.propertySizeSqFt', 'INSPECTION'],
  ].map(([factKey, sourceType]) => ({
    factKey, sourceType, sourceEntityType: 'OTHER', sourceEntityId: 'source-1',
  }));
  const state = harness({ innerProperty: property({
    dwellingType: 'TOWNHOUSE',
    yearBuilt: 1980,
    propertySize: 2000,
    bedrooms: 4,
    bathrooms: 3,
    county: 'Protected County',
    countyFips: '48001',
    latitude: 30,
    longitude: -99,
    geocodingProvider: 'google-maps',
    exteriorProfile: { lotSizeSqFt: 9000 },
    propertyFactEvidence: higherEvidence,
  }) });

  const result = await state.service.enrich(payload);
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.changedFactKeys.length, 0);
  assert.equal(result.protectedFactKeys.length, 9);
  assert.equal(operations(state.calls, 'property.update').length, 0);
  assert.equal(operations(state.calls, 'exterior.upsert').length, 0);
  assert.equal(operations(state.calls, 'evidence.create').length, 0);
  assert.equal(operations(state.calls, 'change.emit').length, 0);
  assert.deepEqual(operations(state.calls, 'identity.upsert')[0].args.update.acceptedFactKeys, []);
});

test('refreshes same-record evidence without duplicate active rows or needless recomputation', async () => {
  const facts = [
    'core.dwellingType', 'core.yearBuilt', 'core.propertySizeSqFt', 'core.bedrooms',
    'core.bathrooms', 'exterior.lotSizeSqFt', 'location.county',
    'location.countyFips', 'location.geocoded',
  ];
  const sameProviderEvidence = facts.map((factKey) => ({
    factKey,
    sourceType: 'PUBLIC_RECORD',
    sourceEntityType: 'RENTCAST_PROPERTY_RECORD',
    sourceEntityId: 'rentcast-record-1',
  }));
  const state = harness({ innerProperty: property({
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    yearBuilt: 1973,
    propertySize: 1878,
    bedrooms: 0,
    bathrooms: 2.5,
    county: 'Bexar',
    countyFips: '48029',
    latitude: 29.475962,
    longitude: -98.351442,
    geocodingProvider: 'rentcast',
    exteriorProfile: { lotSizeSqFt: 8850 },
    propertyFactEvidence: sameProviderEvidence,
  }) });

  const result = await state.service.enrich(payload);
  assert.deepEqual(result.changedFactKeys, []);
  assert.deepEqual(result.protectedFactKeys, []);
  assert.equal(operations(state.calls, 'evidence.supersede').length, 9);
  assert.equal(operations(state.calls, 'evidence.create').length, 9);
  assert.equal(operations(state.calls, 'property.update').length, 0);
  assert.equal(operations(state.calls, 'change.emit').length, 0);
  for (const supersede of operations(state.calls, 'evidence.supersede')) {
    assert.equal(supersede.args.where.sourceType, 'PUBLIC_RECORD');
    assert.equal(supersede.args.where.sourceEntityType, 'RENTCAST_PROPERTY_RECORD');
    assert.equal(supersede.args.where.sourceEntityId, undefined);
  }
});

test('updates a changed same-record fact and supersedes its provider evidence exactly once', async () => {
  const state = harness({ innerProperty: property({
    dwellingType: 'TOWNHOUSE',
    yearBuilt: 1970,
    propertySize: 2000,
    bedrooms: 4,
    bathrooms: 3,
    county: 'Protected County',
    countyFips: '48001',
    latitude: 30,
    longitude: -99,
    geocodingProvider: 'google-maps',
    exteriorProfile: { lotSizeSqFt: 9000 },
    propertyFactEvidence: [{
      factKey: 'core.yearBuilt',
      sourceType: 'PUBLIC_RECORD',
      sourceEntityType: 'RENTCAST_PROPERTY_RECORD',
      sourceEntityId: 'rentcast-record-1',
    }],
  }) });

  const result = await state.service.enrich(payload);
  assert.deepEqual(result.changedFactKeys, ['core.yearBuilt']);
  assert.equal(result.protectedFactKeys.length, 8);
  assert.equal(operations(state.calls, 'property.update')[0].args.data.yearBuilt, 1973);
  assert.equal(operations(state.calls, 'evidence.supersede').length, 1);
  assert.equal(operations(state.calls, 'evidence.create').length, 1);
  assert.equal(operations(state.calls, 'change.emit').length, 1);
  assert.deepEqual(
    operations(state.calls, 'change.emit')[0].args.changedFactKeys,
    ['core.yearBuilt'],
  );
});

test('rolls back identity, canonical, evidence, and recompute work on transaction failure', async () => {
  const evidenceFailure = harness({ failEvidenceCreate: true });
  await assert.rejects(evidenceFailure.service.enrich(payload), /simulated evidence failure/);
  assert.deepEqual(evidenceFailure.calls.committed, []);

  const recomputeFailure = harness({ failChangeEmission: true });
  await assert.rejects(recomputeFailure.service.enrich(payload), /simulated recompute failure/);
  // The harness publishes transaction operations only after the callback
  // resolves, mirroring database rollback semantics.
  assert.deepEqual(recomputeFailure.calls.committed, []);
});
