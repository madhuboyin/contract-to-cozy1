const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  propertyChangeEmissionSchema,
} = require('../../src/propertyChanges/propertyChange.contracts.ts');
const {
  deriveBriefingEligibility,
  derivePropertyChangeMateriality,
} = require('../../src/propertyChanges/propertyChangePolicy.ts');
const {
  buildPropertyChangeDeduplicationKey,
} = require('../../src/propertyChanges/propertyChange.service.ts');

const backendRoot = path.resolve(__dirname, '../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

const baseSignals = {
  homeownerRelevant: false,
  lifecycleAdvanced: false,
  propertyEffectConfirmed: false,
  urgentSafetyCondition: false,
  canonicalActionPriority: null,
};

test('materiality is derived from canonical facts and action priority', () => {
  assert.equal(
    derivePropertyChangeMateriality(baseSignals).materiality,
    'INFORMATIONAL',
  );
  assert.equal(
    derivePropertyChangeMateriality({
      ...baseSignals,
      homeownerRelevant: true,
    }).materiality,
    'MEANINGFUL',
  );
  assert.equal(
    derivePropertyChangeMateriality({
      ...baseSignals,
      propertyEffectConfirmed: true,
    }).materiality,
    'IMPORTANT',
  );
  assert.equal(
    derivePropertyChangeMateriality({
      ...baseSignals,
      canonicalActionPriority: 'NOW',
    }).materiality,
    'URGENT',
  );
});

test('briefing eligibility distinguishes material, degraded, stale, low-confidence, and superseded changes', () => {
  assert.equal(deriveBriefingEligibility({
    materiality: 'MEANINGFUL',
    confidence: 0.9,
    sourceHealth: 'CURRENT',
  }).eligibility, 'ELIGIBLE');
  assert.deepEqual(deriveBriefingEligibility({
    materiality: 'IMPORTANT',
    confidence: 0.9,
    sourceHealth: 'DEGRADED',
  }), {
    eligibility: 'ELIGIBLE',
    reasonCodes: ['MATERIAL_CHANGE_WITH_DEGRADED_SOURCE'],
    rulesVersion: 'property-change-briefing-v1',
  });
  assert.equal(deriveBriefingEligibility({
    materiality: 'MEANINGFUL',
    confidence: 0.9,
    sourceHealth: 'STALE',
  }).eligibility, 'DEFERRED');
  assert.equal(deriveBriefingEligibility({
    materiality: 'MEANINGFUL',
    confidence: 0.4,
    sourceHealth: 'CURRENT',
  }).eligibility, 'DEFERRED');
  assert.equal(deriveBriefingEligibility({
    materiality: 'URGENT',
    confidence: 1,
    sourceHealth: 'CURRENT',
    superseded: true,
  }).eligibility, 'INELIGIBLE');
});

test('deduplication identity is stable per source revision and changes across revisions', () => {
  const base = {
    propertyId: '4b63ec90-e1a8-4d87-b6f5-7bb8500e4c61',
    sourceType: 'intelligence_observation',
    sourceEntityId: 'provider:event-7',
    sourceRevision: '1',
  };
  assert.equal(
    buildPropertyChangeDeduplicationKey(base),
    buildPropertyChangeDeduplicationKey({
      ...base,
      sourceType: 'INTELLIGENCE_OBSERVATION',
    }),
  );
  assert.notEqual(
    buildPropertyChangeDeduplicationKey(base),
    buildPropertyChangeDeduplicationKey({
      ...base,
      sourceRevision: '2',
    }),
  );
});

test('emission contract requires a monotonic revision ordinal and bounded confidence', () => {
  const result = propertyChangeEmissionSchema.safeParse({
    propertyId: '4b63ec90-e1a8-4d87-b6f5-7bb8500e4c61',
    sourceType: 'INTELLIGENCE_OBSERVATION',
    sourceEntityId: 'provider:event-7',
    sourceRevision: '2',
    sourceRevisionOrdinal: 2,
    changeType: 'SOURCE_RECORD_REVISED',
    confidence: 0.8,
    sourceHealth: 'CURRENT',
    signals: baseSignals,
  });
  assert.equal(result.success, true);
  assert.equal(propertyChangeEmissionSchema.safeParse({
    ...result.data,
    sourceRevisionOrdinal: -1,
  }).success, false);
  assert.equal(propertyChangeEmissionSchema.safeParse({
    ...result.data,
    confidence: 1.1,
  }).success, false);
});

test('ledger schema enforces one change per source revision and one per-user audience state', () => {
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /model PropertyChange \{/);
  assert.match(schema, /model PropertyChangeAudienceState \{/);
  assert.match(
    schema,
    /@@unique\(\[propertyId, sourceType, sourceEntityId, sourceRevision\]\)/,
  );
  assert.match(schema, /@@unique\(\[propertyChangeId, userId\]\)/);
  assert.match(schema, /firstDeliveredAt\s+DateTime\?/);
  assert.match(schema, /lastDeliveredAt\s+DateTime\?/);
  assert.match(schema, /seenAt\s+DateTime\?/);
  assert.match(schema, /dismissedAt\s+DateTime\?/);
  assert.match(schema, /supersededAt\s+DateTime\?/);
  assert.match(schema, /canonicalAction\s+OperationalWorkItem\?/);
  assert.match(schema, /canonicalEvent\s+HomeEvent\?/);
});

test('emission is replay-safe, supersedes only older ordinals, and never creates notifications', () => {
  const service = read('src/propertyChanges/propertyChange.service.ts');
  assert.match(service, /propertyId_sourceType_sourceEntityId_sourceRevision/);
  assert.match(service, /propertyChangeSourceCursor\.upsert/);
  assert.match(service, /cursor\.latestRevisionOrdinal > input\.sourceRevisionOrdinal/);
  assert.match(service, /PROPERTY_CHANGE_REVISION_ORDINAL_COLLISION/);
  assert.match(service, /supersededByChangeId/);
  assert.match(service, /briefingReasonCodes: \['CHANGE_SUPERSEDED'\]/);
  assert.doesNotMatch(service, /notification\.(?:create|upsert)/i);
  assert.doesNotMatch(service, /notificationService/);
});

test('property APIs keep audience state per user and admin inspection explains eligibility decisions', () => {
  const routes = read('src/propertyChanges/propertyChange.routes.ts');
  assert.match(routes, /properties\/:propertyId\/changes/);
  assert.match(routes, /changes\/:changeId\/seen/);
  assert.match(routes, /changes\/:changeId\/dismiss/);
  assert.match(routes, /admin\/property-changes\/inspect/);
  assert.match(routes, /requireCapability\('INTEGRATION_MANAGE'\)/);
});

test('reviewed observation revisions emit ledger changes in the same transaction', () => {
  const intelligenceService = read(
    'src/propertyIntelligence/propertyIntelligence.service.ts',
  );
  assert.match(intelligenceService, /emitPropertyChangeWithTransaction/);
  assert.match(intelligenceService, /sourceType: 'INTELLIGENCE_OBSERVATION'/);
  assert.match(intelligenceService, /sourceRevisionOrdinal: source\.revision/);
  assert.match(intelligenceService, /SOURCE_LIFECYCLE_CHANGED/);
  assert.match(intelligenceService, /briefingEligibility: 'INELIGIBLE'/);
});

test('canonical domain events reference their source row without copying payloads', () => {
  const producer = read(
    'src/propertyChanges/domainEventPropertyChangeProducer.ts',
  );
  assert.match(producer, /domainEvent\.findUnique/);
  assert.match(producer, /sourceEntityId: event\.id/);
  assert.match(producer, /sourceRevisionOrdinal: event\.attempts \* 10 \+ statusOrdinal/);
  assert.doesNotMatch(producer, /payload:/);
  assert.match(producer, /DOMAIN_EVENT_PROPERTY_SCOPE_REQUIRED/);
});
