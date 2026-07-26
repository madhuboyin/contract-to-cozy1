const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  configuredRadarPropertyReconciliationPageSize,
  processRadarPropertyReconciliationEvent,
  radarPropertyReconciliationPayloadSchema,
  radarReconciliationReasonForFactKey,
  requestRadarPropertyReconciliation,
} = require('../../src/modules/homeEventRadar/services/radarPropertyReconciliation.service');

function payload(overrides = {}) {
  return {
    payloadVersion: 1,
    propertyId: 'property-1',
    reasons: ['property_facts_changed'],
    changeToken: 'property-version-7',
    correlationId: 'correlation-1',
    requestedAt: '2026-07-26T18:00:00.000Z',
    pageSize: 2,
    ...overrides,
  };
}

function fakeDb(overrides = {}) {
  const upserts = [];
  const queries = [];
  return {
    upserts,
    queries,
    property: {
      async findUnique() {
        return { id: 'property-1' };
      },
    },
    radarEvent: {
      async findMany(args) {
        queries.push(args);
        return [
          {
            id: 'event-1',
            sourceDefinitionId: 'source-1',
            sourceRunId: 'run-1',
            revisions: [{
              id: 'revision-1',
              revisionIdentity: 'provider:revision-1',
              sourceRunId: 'run-1',
            }],
          },
          {
            id: 'event-2',
            sourceDefinitionId: 'source-2',
            sourceRunId: 'run-2',
            revisions: [],
          },
          {
            id: 'event-3',
            sourceDefinitionId: 'source-3',
            sourceRunId: 'run-3',
            revisions: [],
          },
        ];
      },
    },
    domainEvent: {
      async upsert(args) {
        upserts.push(args);
        return { id: `domain-event-${upserts.length}`, ...args.create };
      },
    },
    ...overrides,
  };
}

test('reconciliation payloads are versioned, normalized, and bounded', async () => {
  const parsed = radarPropertyReconciliationPayloadSchema.parse(payload({
    reasons: [
      'responsibility_changed',
      'property_facts_changed',
      'responsibility_changed',
    ],
  }));
  assert.deepEqual(parsed.reasons, [
    'property_facts_changed',
    'responsibility_changed',
  ]);
  assert.equal(configuredRadarPropertyReconciliationPageSize({}), 25);
  assert.equal(
    configuredRadarPropertyReconciliationPageSize({
      RADAR_PROPERTY_RECONCILIATION_PAGE_SIZE: '0',
    }),
    1,
  );
  assert.equal(
    configuredRadarPropertyReconciliationPageSize({
      RADAR_PROPERTY_RECONCILIATION_PAGE_SIZE: '999',
    }),
    100,
  );

  const db = fakeDb();
  const first = await requestRadarPropertyReconciliation({
    propertyId: 'property-1',
    reasons: ['property_created'],
    changeToken: 'version-1',
    correlationId: 'correlation-1',
    pageSize: 5,
  }, db, new Date('2026-07-26T18:00:00Z'));
  const replay = await requestRadarPropertyReconciliation({
    propertyId: 'property-1',
    reasons: ['property_created'],
    changeToken: 'version-1',
    correlationId: 'correlation-1',
    pageSize: 5,
  }, db, new Date('2026-07-26T18:01:00Z'));
  assert.equal(
    first.idempotencyKey,
    replay.idempotencyKey,
    'the same property mutation must retain one durable identity',
  );
  assert.match(first.idempotencyKey, /^radar-property-reconcile:[a-f0-9]{64}$/);
  assert.equal(first.type, 'RADAR_PROPERTY_RECONCILIATION_REQUESTED');
});

test('one bounded page re-evaluates active events and publishes one continuation', async () => {
  const db = fakeDb();
  const calls = [];
  const result = await processRadarPropertyReconciliationEvent(
    {
      id: 'domain-event-1',
      propertyId: 'property-1',
      payload: payload(),
    },
    {
      db,
      now: () => new Date('2026-07-26T18:05:00Z'),
      async matchEvent(eventId, propertyIds, revision) {
        calls.push({ eventId, propertyIds, revision });
        return {
          matched: eventId === 'event-1' ? 1 : 0,
          skipped: 0,
          failedPropertyIds: [],
        };
      },
    },
  );

  assert.deepEqual(result, {
    outcome: 'page_reconciled',
    propertyId: 'property-1',
    reasons: ['property_facts_changed'],
    evaluatedEvents: 2,
    matched: 1,
    noLongerEligible: 1,
    continuationCreated: true,
    nextCursor: 'event-2',
  });
  assert.equal(db.queries[0].take, 3);
  assert.deepEqual(db.queries[0].where.status.in, ['active', 'updated']);
  assert.deepEqual(calls, [
    {
      eventId: 'event-1',
      propertyIds: ['property-1'],
      revision: {
        radarEventRevisionId: 'revision-1',
        revisionIdentity: 'provider:revision-1',
        sourceRunId: 'run-1',
        sourceDefinitionId: 'source-1',
        correlationId: 'correlation-1',
      },
    },
    {
      eventId: 'event-2',
      propertyIds: ['property-1'],
      revision: {
        radarEventRevisionId: null,
        revisionIdentity: null,
        sourceRunId: 'run-2',
        sourceDefinitionId: 'source-2',
        correlationId: 'correlation-1',
      },
    },
  ]);
  assert.equal(db.upserts.length, 1);
  assert.equal(db.upserts[0].create.payload.afterEventId, 'event-2');
});

test('missing properties terminate cleanly and match failures remain retryable', async () => {
  const missingDb = fakeDb({
    property: {
      async findUnique() {
        return null;
      },
    },
  });
  const missing = await processRadarPropertyReconciliationEvent(
    { id: 'domain-event-1', propertyId: 'property-1', payload: payload() },
    { db: missingDb },
  );
  assert.equal(missing.outcome, 'property_missing');
  assert.equal(missingDb.upserts.length, 0);

  const failedDb = fakeDb();
  await assert.rejects(
    () => processRadarPropertyReconciliationEvent(
      { id: 'domain-event-2', propertyId: 'property-1', payload: payload() },
      {
        db: failedDb,
        async matchEvent() {
          return {
            matched: 0,
            skipped: 1,
            failedPropertyIds: ['property-1'],
          };
        },
      },
    ),
    /failed for event event-1/,
  );
  assert.equal(failedDb.upserts.length, 0);
});

test('fact routing is narrow and every required mutation path publishes reconciliation', () => {
  assert.equal(
    radarReconciliationReasonForFactKey('location.zipCode'),
    'geography_changed',
  );
  assert.equal(
    radarReconciliationReasonForFactKey('responsibility.roof'),
    'responsibility_changed',
  );
  assert.equal(
    radarReconciliationReasonForFactKey('safety.hasSumpPumpBackup'),
    'property_facts_changed',
  );
  assert.equal(radarReconciliationReasonForFactKey('core.bedrooms'), null);
  assert.equal(radarReconciliationReasonForFactKey('location.timezone'), null);

  const root = path.resolve(__dirname, '../..');
  const propertyService = fs.readFileSync(
    path.join(root, 'src/services/property.service.ts'),
    'utf8',
  );
  const factCapture = fs.readFileSync(
    path.join(
      root,
      'src/modules/propertyContext/application/capturePropertyFact.ts',
    ),
    'utf8',
  );
  const radarService = fs.readFileSync(
    path.join(root, 'src/services/homeEventRadar.service.ts'),
    'utf8',
  );
  const completionService = fs.readFileSync(
    path.join(root, 'src/services/orchestrationCompletion.service.ts'),
    'utf8',
  );
  const maintenanceService = fs.readFileSync(
    path.join(root, 'src/services/PropertyMaintenanceTask.service.ts'),
    'utf8',
  );
  const worker = fs.readFileSync(
    path.resolve(root, '../workers/src/jobs/processDomainEvents.job.ts'),
    'utf8',
  );
  const propertyGeo = fs.readFileSync(
    path.resolve(root, '../workers/src/lib/propertyGeo.ts'),
    'utf8',
  );

  assert.match(propertyService, /reasons: \['property_created'\]/);
  assert.match(propertyService, /radarReconciliationReasonsForPropertyUpdate/);
  assert.doesNotMatch(
    propertyService,
    /propertyRadarMatch\.deleteMany\(\{ where: \{ propertyId \} \}\)/,
  );
  assert.match(factCapture, /radarReconciliationReasonForFactKey/);
  assert.match(radarService, /reasons: \['mitigation_changed'\]/);
  assert.match(completionService, /reasons: \['mitigation_changed'\]/);
  assert.match(maintenanceService, /reasons: \['mitigation_changed'\]/);
  assert.match(propertyGeo, /reasons: \['geography_changed'\]/);
  assert.doesNotMatch(
    propertyGeo,
    /propertyRadarMatch\.deleteMany\(\{ where: \{ propertyId \} \}\)/,
  );
  assert.match(
    worker,
    /case 'RADAR_PROPERTY_RECONCILIATION_REQUESTED'/,
  );
});
