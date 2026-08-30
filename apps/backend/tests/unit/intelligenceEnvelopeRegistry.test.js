const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const intelligence = require('../../src/productFramework/intelligence/index.ts');
const envelope = require('../../src/services/intelligenceEnvelope/index.ts');
const { RISK_ASSET_CONFIG } = require('../../src/config/risk-constants.ts');

const NOW = '2026-08-28T12:00:00.000Z';
const EVIDENCE = [{
  id: 'evidence-1',
  type: 'SYSTEM_DERIVATION',
  label: 'Deterministic source evidence',
  source: 'test-fixture',
  observedAt: NOW,
  freshness: 'CURRENT',
  confidence: 0.9,
}];

test('Envelope registry owns exactly the seven ARD-001 producer models and certifies cleanly', () => {
  assert.deepEqual(
    envelope.ENVELOPE_ADAPTERS.map((adapter) => adapter.descriptor.producerModel).sort(),
    [...envelope.ENVELOPE_PRODUCER_MODELS].sort(),
  );
  assert.equal(envelope.ENVELOPE_PRODUCER_MODELS.includes('RadarEvent'), false);
  assert.deepEqual(envelope.validateEnvelopeRegistry(), []);
});

test('approved Signal mappings are exact and unknown values fail closed', () => {
  const expected = {
    MAINT_ADHERENCE: 'MAINTENANCE',
    COVERAGE_GAP: 'INSURANCE',
    SAVINGS_REALIZATION: 'FINANCIAL',
    RISK_SPIKE: 'SAFETY',
    COST_ANOMALY: 'PRICING',
    RISK_ACCUMULATION: 'MAINTENANCE',
    SYSTEM_DEGRADATION: 'ASSET_LIFECYCLE',
    COST_PRESSURE_PATTERN: 'FINANCIAL',
    FINANCIAL_DISCIPLINE: 'FINANCIAL',
  };
  for (const [nativeSubtype, domain] of Object.entries(expected)) {
    assert.equal(envelope.getEnvelopeMapping('Signal', nativeSubtype)?.domain, domain);
  }
  assert.equal(envelope.getEnvelopeMapping('Signal', 'ROOF_RISK'), null);

  const result = envelope.signalEnvelopeAdapter.map({
    id: 'signal-unknown',
    propertyId: 'property-1',
    signalKey: 'ROOF_RISK',
    version: 1,
    sourceModel: 'Fixture',
    sourceId: 'source-1',
    capturedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }, { propertyId: 'property-1', evidence: EVIDENCE });
  assert.deepEqual(result.diagnostic, {
    producerModel: 'Signal',
    code: 'UNMAPPED_NATIVE_VALUE',
    count: 1,
    nativeValue: 'ROOF_RISK',
  });
});

test('entity registries are closed, category-aware, and seeded from risk configuration', () => {
  assert.deepEqual(
    Object.keys(intelligence.ASSET_KIND_REGISTRY).sort(),
    RISK_ASSET_CONFIG.map(({ systemType }) => systemType).sort(),
  );
  assert.deepEqual(Object.keys(intelligence.PROPERTY_COMPONENT_KIND_REGISTRY), [
    'ROOF', 'FOUNDATION', 'EXTERIOR', 'INTERIOR', 'SITE',
  ]);
  assert.equal(intelligence.IntelligenceIssueDomainSchema.safeParse('ROOF').success, false);
  assert.equal(intelligence.EnvelopeEntityRefSchema.safeParse({
    entityType: 'INVENTORY_ITEM',
    entityId: 'item-1',
    assetCategory: 'HVAC',
    assetKind: 'ROOF_SHINGLE',
  }).success, false);
});

test('stable lineage survives immutable recommendation revisions while envelope identity changes', () => {
  const base = {
    propertyId: 'property-1',
    decisionThreadId: 'thread-1',
    recommendationOwner: 'DecisionPlatform',
    recommendationDefinitionId: 'HVAC_REPAIR_REPLACE',
    recommendationDefinitionVersion: '1.0',
    scenarioId: 'scenario-1',
    verdictCode: 'REPAIR',
    confidence: 0.82,
    generatedAt: NOW,
    isCurrent: true,
    entityRef: {
      entityType: 'INVENTORY_ITEM',
      entityId: 'hvac-1',
      assetCategory: 'HVAC',
      assetKind: 'HVAC_FURNACE',
    },
  };
  const first = envelope.recommendationSnapshotEnvelopeAdapter.map({
    ...base,
    id: 'snapshot-1',
    inputDigest: 'digest-1',
  }, { propertyId: 'property-1', evidence: EVIDENCE }).item;
  const second = envelope.recommendationSnapshotEnvelopeAdapter.map({
    ...base,
    id: 'snapshot-2',
    inputDigest: 'digest-2',
    verdictCode: 'REPLACE',
  }, { propertyId: 'property-1', evidence: EVIDENCE }).item;

  assert.equal(first.lineageKey, second.lineageKey);
  assert.notEqual(first.envelopeKey, second.envelopeKey);
  assert.equal(first.qualifiedClaim.claimKey.propositionType, 'HVAC_REPAIR_REPLACE_VERDICT');
  assert.equal(first.qualifiedClaim.claimKey.entityRef, 'INVENTORY_ITEM:hvac-1:HVAC_FURNACE');
  assert.equal('priorityScore' in first, false);
  assert.equal('score' in first, false);
});

test('each registered producer adapter emits its reviewed primary domain', () => {
  const context = { propertyId: 'property-1', evidence: EVIDENCE };
  const fixtures = [
    [envelope.guidanceSignalEnvelopeAdapter, {
      id: 'guidance-1', propertyId: 'property-1', issueDomain: 'INSURANCE', status: 'ACTIVE',
      severityScore: 75, confidenceScore: 0.8, lastObservedAt: NOW, expiresAt: '2026-08-29T12:00:00.000Z',
      createdAt: NOW, updatedAt: NOW,
    }, 'INSURANCE'],
    [envelope.intelligenceObservationEnvelopeAdapter, {
      id: 'observation-1', propertyId: 'property-1', observationType: 'NYC_ZONING_APPLICATION',
      lifecycleStatus: 'ACTIVE', externalId: 'zap-1', revision: 1, contentHash: 'hash-1',
      sourceId: 'nyc-dcp-zap-projects', sourceRunId: 'run-1', lastVerifiedAt: NOW,
      matchConfidence: 0.95, createdAt: NOW, updatedAt: NOW,
    }, 'NEIGHBORHOOD'],
    [envelope.personalizedRecommendationEnvelopeAdapter, {
      id: 'personalized-1', propertyId: 'property-1', definitionCode: 'aging_roof_condition_review',
      status: 'ACTIVE', ruleVersion: 1, contentVersion: 1, confidence: 0.7,
      firstEligibleAt: NOW, lastEvaluatedAt: NOW,
    }, 'ASSET_LIFECYCLE'],
    [envelope.propertyRadarMatchEnvelopeAdapter, {
      id: 'radar-match-1', propertyId: 'property-1', radarEventId: 'event-1', eventType: 'heavy_rain',
      provider: 'National Weather Service', eventRevisionId: 'revision-1', eventObservedAt: NOW,
      impactLevel: 'high', confidenceScore: 0.9, lifecycleStatus: 'now', sourceFreshnessStatus: 'fresh',
      matcherVersion: 'matcher-v1', createdAt: NOW, updatedAt: NOW,
    }, 'WEATHER'],
    [envelope.propertyRadarCompoundInsightEnvelopeAdapter, {
      id: 'compound-1', propertyId: 'property-1', ruleCode: 'SMOKE_HVAC_FILTER',
      ruleVersion: 'compound-v1', correlationKey: 'correlation-1', status: 'active',
      evaluatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    }, 'SAFETY'],
  ];

  for (const [adapter, row, expectedDomain] of fixtures) {
    const result = adapter.map(row, context);
    assert.ok(result.item, `${adapter.descriptor.producerModel} should emit an item`);
    assert.equal(result.item.domain, expectedDomain);
    assert.equal(result.item.source.sourceModel, adapter.descriptor.producerModel);
  }
});

test('suppressed Guidance signals are never emitted as current', () => {
  const result = envelope.guidanceSignalEnvelopeAdapter.map({
    id: 'guidance-suppressed', propertyId: 'property-1', issueDomain: 'SAFETY', status: 'SUPPRESSED',
    severityScore: 75, confidenceScore: 0.8, lastObservedAt: NOW,
    expiresAt: '2026-08-29T12:00:00.000Z', createdAt: NOW, updatedAt: NOW,
  }, { propertyId: 'property-1', evidence: EVIDENCE });

  assert.equal(result.item.freshness.currentness, 'STALE');
});

test('qualified-claim compatibility is explicit and otherwise remains unknown', () => {
  assert.equal(envelope.evaluateQualifiedClaimVerdicts({
    propositionType: 'HVAC_REPAIR_REPLACE_VERDICT',
    leftVerdict: 'REPAIR',
    rightVerdict: 'REPLACE',
  }), 'CONFLICTED');
  assert.equal(envelope.evaluateQualifiedClaimVerdicts({
    propositionType: 'COVERAGE_QUESTION_VERDICT',
    leftVerdict: 'COVERED',
    rightVerdict: 'NOT_COVERED',
  }), 'UNKNOWN');
  const left = {
    claimKey: {
      propertyId: 'property-1',
      entityRef: 'INVENTORY_ITEM:hvac-1:HVAC_FURNACE',
      propositionType: 'HVAC_REPAIR_REPLACE_VERDICT',
      assessmentHorizonVersion: '1.0:scenario-1',
    },
    verdict: 'REPAIR',
  };
  assert.equal(envelope.evaluateQualifiedClaimRelationship(left, {
    ...left,
    verdict: 'REPLACE',
  }), 'CONFLICTED');
  assert.equal(envelope.evaluateQualifiedClaimRelationship(left, {
    ...left,
    claimKey: { ...left.claimKey, entityRef: 'INVENTORY_ITEM:hvac-2:HVAC_FURNACE' },
    verdict: 'REPLACE',
  }), 'UNKNOWN');
});

test('observed undeclared capabilities fail certification', () => {
  assert.deepEqual(envelope.certifyObservedEnvelopeCapabilities([
    { producerModel: 'Signal', nativeSubtype: 'RISK_SPIKE' },
    { producerModel: 'PropertyRadarMatch', nativeSubtype: 'alien_landing' },
    { producerModel: 'PropertyRadarMatch', nativeSubtype: 'alien_landing' },
  ]), ['PropertyRadarMatch:alien_landing: observed capability is not declared']);
});

test('cursor binds deterministic ordering state to the full query shape', () => {
  const query = {
    propertyId: 'property-1',
    principal: { kind: 'HOMEOWNER_SESSION', userId: 'user-1' },
    types: ['SIGNAL'],
    domains: ['SAFETY'],
    limit: 25,
  };
  const identity = envelope.deriveEnvelopeIdentity({
    producerModel: 'Signal',
    sourceRecordId: 'signal-1',
    nativeLineageId: 'lineage-1',
    nativeRevisionToken: 'revision-1',
  });
  const cursor = envelope.encodeEnvelopeCursor({
    createdAt: NOW,
    envelopeKey: identity.envelopeKey,
    query,
  });
  assert.deepEqual(envelope.decodeEnvelopeCursor(cursor, query), {
    createdAt: NOW,
    envelopeKey: identity.envelopeKey,
  });
  assert.throws(
    () => envelope.decodeEnvelopeCursor(cursor, { ...query, domains: ['WEATHER'] }),
    /does not match the query shape/,
  );
});

test('Envelope modules do not import ranking, delivery, or producer-write services', () => {
  const root = path.resolve(__dirname, '../../src/services/intelligenceEnvelope');
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.ts')) files.push(target);
    }
  };
  visit(root);
  const forbidden = [
    'homeActions.service',
    'priorityListPolicy',
    'homeActionProactiveDelivery',
    'homeActionSourcePromotion',
    'signal.service',
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const dependency of forbidden) {
      assert.doesNotMatch(source, new RegExp(dependency), `${file} must not import ${dependency}`);
    }
  }
});
