const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Ask Cozy Stage 3, Phase 5 (FRD §29/§31: "Home Event Radar migrates its
// direct Notification write onto this same DomainEvent rail"). These tests
// cover the migration's two halves: the emitter (called from the decision
// boundary instead of calling materialize() directly) and the consumer
// (registered in processDomainEvents.job.ts) that re-hydrates the full
// materialization input from just the durable decisionId.

const {
  radarNotificationMaterializePayloadSchema,
  requestRadarNotificationMaterialization,
  processRadarNotificationMaterializeEvent,
} = require('../../src/modules/homeEventRadar/services/radarNotificationMaterializationReconciliation.service');

test('materialize-request payloads are versioned and bounded to decisionId + propertyId', () => {
  const parsed = radarNotificationMaterializePayloadSchema.parse({
    payloadVersion: 1,
    decisionId: 'decision-1',
    propertyId: 'property-1',
  });
  assert.deepEqual(parsed, { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' });
  assert.throws(() => radarNotificationMaterializePayloadSchema.parse({ payloadVersion: 1, decisionId: '', propertyId: 'property-1' }));
});

test('requestRadarNotificationMaterialization upserts one DomainEvent, idempotent on decisionId', async () => {
  const upserts = [];
  const db = {
    domainEvent: {
      async upsert(args) {
        upserts.push(args);
        return { id: `domain-event-${upserts.length}`, ...args.create };
      },
    },
  };
  await requestRadarNotificationMaterialization({ decisionId: 'decision-1', propertyId: 'property-1' }, db);
  await requestRadarNotificationMaterialization({ decisionId: 'decision-1', propertyId: 'property-1' }, db);
  assert.equal(upserts.length, 2, 'both calls hit upsert (idempotency is enforced by the DB unique constraint on idempotencyKey, not by skipping the call)');
  assert.equal(upserts[0].where.idempotencyKey, upserts[1].where.idempotencyKey);
  assert.equal(upserts[0].create.type, 'RADAR_NOTIFICATION_MATERIALIZE_REQUESTED');
  assert.equal(upserts[0].create.status, 'PENDING');
  assert.equal(upserts[0].create.propertyId, 'property-1');
  assert.deepEqual(upserts[0].create.payload, { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' });
  assert.deepEqual(upserts[0].update, {});
});

function decisionRow(overrides = {}) {
  return {
    id: 'decision-1',
    propertyId: 'property-1',
    userId: 'user-1',
    notificationId: null,
    outcome: 'immediate',
    reasonCodes: ['ELIGIBLE_INITIAL_MATCH'],
    eligibleChannels: ['in_app', 'email'],
    deferredUntil: null,
    criticalOverrideApplied: false,
    policyVersion: 'radar-notification-policy-v1',
    evaluatedAt: new Date('2026-09-13T10:00:00.000Z'),
    evidenceJson: { normalized: { severity: 'severe' } },
    radarEventRevisionId: 'revision-1',
    propertyRadarMatch: {
      id: 'match-1',
      impactLevel: 'high',
      impactSummary: 'Severe storms expected',
      confidence: 'verified',
      lifecycleStatus: 'now',
      radarEvent: {
        id: 'event-1',
        title: 'Severe Thunderstorm Warning',
        summary: 'Damaging winds possible',
        eventType: 'weather',
        severity: 'severe',
        startAt: new Date('2026-09-13T12:00:00.000Z'),
        endAt: new Date('2026-09-13T18:00:00.000Z'),
        sourceDefinition: { key: 'nws-active-alerts', family: 'weather' },
      },
    },
    ...overrides,
  };
}

test('the consumer re-hydrates the full materialization input from just the decisionId and calls materialize()', async () => {
  let findUniqueArgs = null;
  const db = {
    propertyRadarNotificationDecision: {
      async findUnique(args) {
        findUniqueArgs = args;
        return decisionRow();
      },
    },
  };
  const materializeCalls = [];
  const deliveryService = {
    async materialize(input) {
      materializeCalls.push(input);
      return { outcome: 'created', notificationId: 'notification-1' };
    },
  };
  const result = await processRadarNotificationMaterializeEvent(
    { id: 'domain-event-1', propertyId: 'property-1', payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' } },
    { db, deliveryService },
  );
  assert.equal(findUniqueArgs.where.id, 'decision-1');
  assert.deepEqual(result, { outcome: 'created', notificationId: 'notification-1' });
  assert.equal(materializeCalls.length, 1);
  const call = materializeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.decision.id, 'decision-1');
  assert.equal(call.decision.outcome, 'immediate');
  assert.deepEqual(call.decision.eligibleChannels, ['in_app', 'email']);
  assert.equal(call.match.id, 'match-1');
  assert.equal(call.match.impactLevel, 'high');
  assert.equal(call.event.id, 'event-1');
  assert.equal(call.event.title, 'Severe Thunderstorm Warning');
  assert.deepEqual(call.event.sourceDefinition, { key: 'nws-active-alerts', family: 'weather' });
  assert.deepEqual(call.revision, { id: 'revision-1' });
});

test('a decision deleted between request and processing returns decision_missing instead of throwing or dead-lettering', async () => {
  const db = { propertyRadarNotificationDecision: { async findUnique() { return null; } } };
  const deliveryService = { async materialize() { throw new Error('must not be called'); } };
  const result = await processRadarNotificationMaterializeEvent(
    { id: 'domain-event-1', propertyId: 'property-1', payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' } },
    { db, deliveryService },
  );
  assert.deepEqual(result, { outcome: 'decision_missing' });
});

test('a payload/event propertyId mismatch throws rather than silently processing the wrong scope', async () => {
  const db = { propertyRadarNotificationDecision: { async findUnique() { return decisionRow(); } } };
  await assert.rejects(
    () => processRadarNotificationMaterializeEvent(
      { id: 'domain-event-1', propertyId: 'property-OTHER', payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' } },
      { db, deliveryService: { async materialize() { throw new Error('must not be called'); } } },
    ),
    /scope does not match/,
  );
});

test('a decision with no sourceDefinition on its radar event maps to a null sourceDefinition, not a crash', async () => {
  const db = {
    propertyRadarNotificationDecision: {
      async findUnique() {
        return decisionRow({
          propertyRadarMatch: {
            ...decisionRow().propertyRadarMatch,
            radarEvent: { ...decisionRow().propertyRadarMatch.radarEvent, sourceDefinition: null },
          },
        });
      },
    },
  };
  const materializeCalls = [];
  const result = await processRadarNotificationMaterializeEvent(
    { id: 'domain-event-1', propertyId: 'property-1', payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' } },
    { db, deliveryService: { async materialize(input) { materializeCalls.push(input); return { outcome: 'created', notificationId: null }; } } },
  );
  assert.equal(materializeCalls[0].event.sourceDefinition, null);
  assert.deepEqual(result, { outcome: 'created', notificationId: null });
});
