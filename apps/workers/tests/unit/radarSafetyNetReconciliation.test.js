const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  RADAR_SAFETY_NET_MAX_DEAD_LETTER_RETRIES,
  radarSafetyNetLimits,
  radarSafetyNetReconciliationJob,
} = require('../../src/jobs/radarSafetyNetReconciliation.job');

function sourceFixture() {
  return {
    id: 'source-1',
    key: 'source-key',
    family: 'weather',
    sourceType: 'weather_provider',
    name: 'Reviewed source',
    provider: 'Provider',
    adapterVersion: 'adapter-v1',
    contractVersion: 1,
    isEnabled: true,
    environments: ['test'],
    scheduleCron: '*/15 * * * *',
    freshnessSeconds: 1_800,
    supportedEventTypes: ['weather'],
    coverageDescription: 'US coverage',
    configJson: null,
    health: {
      status: 'healthy',
      lastAttemptAt: new Date('2026-07-26T17:55:00Z'),
      lastSuccessAt: new Date('2026-07-26T17:55:00Z'),
      dataFreshThrough: new Date('2026-07-26T18:00:00Z'),
      consecutiveFailures: 0,
      message: null,
    },
    coverage: [{
      id: 'coverage-1',
      coverageType: 'country',
      countryCode: 'US',
      stateCode: null,
      countyFips: null,
      postalCode: null,
      centerLatitude: null,
      centerLongitude: null,
      radiusMeters: null,
      geometryGeoJson: null,
      validFrom: null,
      validUntil: null,
    }],
  };
}

function propertyFixture(id = 'property-1') {
  return {
    id,
    state: 'NJ',
    zipCode: '08536',
    normalizedZipCode: '08536',
    countyFips: '34021',
    latitude: 40.3,
    longitude: -74.6,
    geographyVersion: 2,
  };
}

function eventFixture() {
  return {
    id: 'event-1',
    sourceDefinitionId: 'source-1',
    sourceRunId: 'run-1',
    safetyNetRevisionId: null,
    safetyNetAfterPropertyId: null,
    revisions: [{
      id: 'revision-1',
      revisionIdentity: 'provider:revision-1',
      sourceRunId: 'run-1',
    }],
  };
}

function fakeDeps(overrides = {}) {
  const calls = {
    match: [],
    eventUpdates: [],
    matchUpdates: [],
    domainUpdates: [],
    coverageUpserts: [],
  };
  const now = new Date('2026-07-26T18:00:00Z');
  const db = {
    propertyRadarMatch: {
      async findMany(args) {
        if (args.where.isVisible === true) return [{ id: 'expired-match-1' }];
        if (args.where.isMaterialUpdate === true) return [{ id: 'material-match-1' }];
        if (args.where.radarEventId) {
          return [{
            propertyId: 'property-1',
            lastEventRevisionId: 'revision-1',
            propertyGeographyVersion: 2,
            lastEvaluatedAt: new Date('2026-07-26T17:30:00Z'),
            lifecycleStatus: 'now',
            property: { geographyVersion: 2 },
          }];
        }
        return [];
      },
      async updateMany(args) {
        calls.matchUpdates.push(args);
        return { count: args.where.id.in.length };
      },
    },
    domainEvent: {
      async findMany() {
        return [{
          id: 'dead-claim-1',
          propertyId: 'property-2',
          attempts: 8,
          payload: {
            payloadVersion: 1,
            propertyId: 'property-2',
            safetyNetRetryCount: 0,
          },
        }];
      },
      async update(args) {
        calls.domainUpdates.push(args);
        return args.data;
      },
    },
    radarSourceDefinition: {
      async findMany() {
        return [sourceFixture()];
      },
    },
    property: {
      async findMany() {
        return [propertyFixture('property-coverage')];
      },
    },
    propertyRadarCoverage: {
      async findMany() {
        return [];
      },
      async upsert(args) {
        calls.coverageUpserts.push(args);
        return args.create;
      },
    },
    radarEvent: {
      async findMany() {
        return [eventFixture()];
      },
      async update(args) {
        calls.eventUpdates.push(args);
        return args.data;
      },
    },
  };
  return {
    calls,
    deps: {
      db,
      async listCandidates() {
        return {
          outcome: 'ready',
          propertyIds: ['property-1', 'property-2'],
          nextCursor: 'property-2',
        };
      },
      async matchEvent(eventId, propertyIds, revision) {
        calls.match.push({ eventId, propertyIds, revision });
        return { matched: 1, skipped: 0, failedPropertyIds: [] };
      },
      coverageDecision(source, property) {
        return {
          status: 'covered',
          sourceDefinitionId: source.id,
          sourceKey: source.key,
          detail: 'Covered',
          matchedCoverageIds: ['coverage-1'],
        };
      },
      now: () => now,
      env: { NODE_ENV: 'test' },
      logger: { error() {}, warn() {}, info() {}, debug() {} },
      ...overrides,
    },
  };
}

test('safety-net controls are bounded', () => {
  assert.deepEqual(radarSafetyNetLimits({}), {
    eventLimit: 20,
    propertyPageSize: 100,
    coverageLimit: 100,
    lifecycleLimit: 500,
    failedClaimLimit: 25,
  });
  assert.deepEqual(radarSafetyNetLimits({
    RADAR_SAFETY_NET_EVENT_LIMIT: '0',
    RADAR_SAFETY_NET_PROPERTY_PAGE_SIZE: '9999',
    RADAR_SAFETY_NET_COVERAGE_LIMIT: 'bad',
    RADAR_SAFETY_NET_LIFECYCLE_LIMIT: '9999',
    RADAR_SAFETY_NET_FAILED_CLAIM_LIMIT: '999',
  }), {
    eventLimit: 1,
    propertyPageSize: 500,
    coverageLimit: 100,
    lifecycleLimit: 2_000,
    failedClaimLimit: 100,
  });
  assert.equal(RADAR_SAFETY_NET_MAX_DEAD_LETTER_RETRIES, 3);
});

test('one run reconciles every bounded stage and advances the event cursor', async () => {
  const { deps, calls } = fakeDeps();

  const result = await radarSafetyNetReconciliationJob(undefined, deps);

  assert.deepEqual(result, {
    examined: 7,
    refreshed: 5,
    failed: 0,
    skipped: 1,
    reason: undefined,
    activeEventsExamined: 1,
    eventClaimsExamined: 2,
    eventClaimsReconciled: 1,
    eventClaimsCurrent: 1,
    coverageEvaluated: 1,
    coverageCovered: 1,
    failedClaimsRetried: 1,
    lifecycleExpired: 1,
    materialMarkersExpired: 1,
    dryRun: false,
  });
  assert.equal(calls.match.length, 1);
  assert.equal(calls.match[0].propertyIds[0], 'property-2');
  assert.equal(calls.match[0].revision.radarEventRevisionId, 'revision-1');
  assert.equal(calls.coverageUpserts.length, 1);
  assert.equal(calls.coverageUpserts[0].create.status, 'covered');
  assert.equal(calls.domainUpdates[0].data.status, 'PENDING');
  assert.equal(calls.domainUpdates[0].data.attempts, 0);
  assert.equal(
    calls.domainUpdates[0].data.payload.safetyNetRetryCount,
    1,
  );
  assert.deepEqual(
    calls.matchUpdates.map((update) => update.data),
    [{ isVisible: false }, { isMaterialUpdate: false }],
  );
  assert.equal(calls.eventUpdates[0].data.safetyNetStatus, 'in_progress');
  assert.equal(
    calls.eventUpdates[0].data.safetyNetAfterPropertyId,
    'property-2',
  );
});

test('a property-claim failure is observable and does not advance the cursor', async () => {
  const { deps, calls } = fakeDeps({
    async matchEvent() {
      return {
        matched: 0,
        skipped: 1,
        failedPropertyIds: ['property-2'],
      };
    },
  });

  const result = await radarSafetyNetReconciliationJob(undefined, deps);

  assert.equal(result.failed, 1);
  assert.equal(result.eventClaimsReconciled, 0);
  assert.equal(calls.eventUpdates[0].data.safetyNetStatus, 'failed');
  assert.equal(
    calls.eventUpdates[0].data.safetyNetLastError,
    'One or more property claims failed',
  );
  assert.equal(
    Object.hasOwn(calls.eventUpdates[0].data, 'safetyNetAfterPropertyId'),
    false,
  );
});

test('dry run reports work without mutating canonical state', async () => {
  const { deps, calls } = fakeDeps();

  const result = await radarSafetyNetReconciliationJob(
    { dryRun: true },
    deps,
  );

  assert.equal(result.dryRun, true);
  assert.equal(result.eventClaimsReconciled, 1);
  assert.equal(calls.match.length, 0);
  assert.equal(calls.eventUpdates.length, 0);
  assert.equal(calls.matchUpdates.length, 0);
  assert.equal(calls.domainUpdates.length, 0);
  assert.equal(calls.coverageUpserts.length, 0);
});

test('exhausted safety-net retries remain dead-lettered', async () => {
  const { deps, calls } = fakeDeps();
  deps.db.domainEvent.findMany = async () => [{
    id: 'dead-claim-exhausted',
    propertyId: 'property-2',
    attempts: 8,
    payload: {
      propertyId: 'property-2',
      safetyNetRetryCount: RADAR_SAFETY_NET_MAX_DEAD_LETTER_RETRIES,
    },
  }];

  const result = await radarSafetyNetReconciliationJob(undefined, deps);

  assert.equal(result.failedClaimsRetried, 0);
  assert.equal(calls.domainUpdates.length, 0);
});

test('scheduler, schema, lifecycle safety, and reactivation are wired', () => {
  const root = path.resolve(__dirname, '../..');
  const worker = fs.readFileSync(path.join(root, 'src/worker.ts'), 'utf8');
  const registry = fs.readFileSync(
    path.resolve(root, '../backend/src/config/workerJobRegistry.ts'),
    'utf8',
  );
  const schema = fs.readFileSync(
    path.resolve(root, '../backend/prisma/schema.prisma'),
    'utf8',
  );
  const matcher = fs.readFileSync(
    path.resolve(root, '../backend/src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  const job = fs.readFileSync(
    path.join(root, 'src/jobs/radarSafetyNetReconciliation.job.ts'),
    'utf8',
  );

  assert.match(worker, /'radar-safety-net-reconciliation'/);
  assert.match(worker, /RADAR_SAFETY_NET_RECONCILIATION_CRON/);
  assert.match(registry, /key: 'radar-safety-net-reconciliation'/);
  assert.match(registry, /cronExpression: '17 \* \* \* \*'/);
  assert.match(schema, /enum RadarSafetyNetStatus/);
  assert.match(schema, /safetyNetAfterPropertyId\s+String\?/);
  assert.match(schema, /@@index\(\[status, safetyNetStatus, safetyNetEvaluatedAt\]\)/);
  assert.doesNotMatch(
    matcher,
    /existingMatch\?\.lifecycleStatus === 'no_longer_applicable'/,
  );
  assert.doesNotMatch(job, /radarEvent\.(updateMany|update)\([^]*status: '(resolved|expired|retracted)'/);
});
