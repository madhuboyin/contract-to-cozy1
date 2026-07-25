const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildToolLifecycleAnalyticsEvents,
  canonicalizeToolLifecycleId,
  toolLifecycleEventName,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  toolLifecycleEventSchema,
} = require('../../src/routes/toolDiscovery.routes.ts');

test('tool lifecycle events use the durable TOOL_USED taxonomy', () => {
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [{
      toolId: 'coverage-options',
      stage: 'COMPLETED',
      surface: 'unified_home',
      recommendationReason: 'coverage-gap',
      recommendationVersion: 'capability-recommendation-v1',
      completionKind: 'DECISION_RECORDED',
      sessionKey: 'session-1',
    }],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'TOOL_USED');
  assert.equal(events[0].eventName, 'TOOL_COMPLETED');
  assert.equal(events[0].moduleKey, 'tool_discovery');
  assert.equal(events[0].featureKey, 'coverage-options');
  assert.equal(events[0].source, 'unified_home');
  assert.equal(events[0].metadataJson.lifecycleContractVersion, 'capability-lifecycle-v2');
  assert.equal(events[0].metadataJson.manifestVersion > 0, true);
  assert.equal(typeof events[0].metadataJson.registryVersion, 'string');
  assert.equal(events[0].metadataJson.recommendationVersion, 'capability-recommendation-v1');
  assert.equal(events[0].metadataJson.sourceKind, 'DIRECT');
  assert.equal(events[0].metadataJson.sourceId, 'direct:coverage-options');
  assert.equal(events[0].metadataJson.readiness, 'UNKNOWN');
  assert.equal(events[0].metadataJson.rolloutCohort, 'UNKNOWN');
  assert.equal(events[0].metadataJson.surface, 'unified_home');
  assert.equal(events[0].metadataJson.completionKind, 'DECISION_RECORDED');
  assert.equal(events[0].metadataJson.analyticsAudience, 'REAL_USER');
});

test('tool lifecycle stage names remain queryable without a Prisma enum change', () => {
  assert.equal(toolLifecycleEventName('ELIGIBLE'), 'TOOL_ELIGIBLE');
  assert.equal(toolLifecycleEventName('DISCOVERED'), 'TOOL_DISCOVERED');
  assert.equal(toolLifecycleEventName('OUTPUT_GENERATED'), 'TOOL_OUTPUT_GENERATED');
});

test('client lifecycle ingestion cannot forge server-owned eligibility', () => {
  const base = {
    toolId: 'coverage-options',
    surface: 'unified_home',
  };
  assert.equal(toolLifecycleEventSchema.safeParse({
    ...base,
    stage: 'DISCOVERED',
  }).success, true);
  assert.equal(toolLifecycleEventSchema.safeParse({
    ...base,
    stage: 'ELIGIBLE',
  }).success, false);

  const parsed = toolLifecycleEventSchema.parse({
    ...base,
    stage: 'DISCOVERED',
    analyticsAudience: 'SYNTHETIC_QA',
  });
  assert.equal(parsed.analyticsAudience, undefined);
});

test('backend feature aliases converge on the discovery catalog', () => {
  assert.equal(canonicalizeToolLifecycleId('coverage_analysis'), 'coverage-intelligence');
  assert.equal(canonicalizeToolLifecycleId('RENOVATION_ADVISOR_SESSION'), 'home-renovation-risk-advisor');
  assert.equal(canonicalizeToolLifecycleId('hoa'), 'hoa-compliance');
  assert.equal(canonicalizeToolLifecycleId('unrelated_backend_feature'), null);
});

test('canonical lifecycle rejects stale manifests and protects envelope fields', () => {
  assert.throws(() => buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [{
      toolId: 'coverage-options',
      stage: 'DISCOVERED',
      surface: 'property_detail',
      manifestVersion: 999,
    }],
  }), /Stale capability manifest/);

  const [event] = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [{
      toolId: 'coverage-options',
      stage: 'DISCOVERED',
      surface: 'property_detail',
      sourceKind: 'PROJECT',
      sourceId: 'project-1',
      metadata: {
        canonicalToolId: 'tampered-tool',
        sourceId: 'tampered-source',
        analyticsAudience: 'SYNTHETIC_QA',
        syntheticQa: true,
        qaRunId: 'forged-qa-run',
        smokeCorrelationId: 'forged-smoke-run',
      },
    }],
  });
  assert.equal(event.metadataJson.canonicalToolId, 'coverage-options');
  assert.equal(event.metadataJson.sourceId, 'project-1');
  assert.equal(event.metadataJson.analyticsAudience, 'REAL_USER');
  assert.equal(event.metadataJson.syntheticQa, false);
  assert.equal(event.metadataJson.qaRunId, null);
  assert.equal(event.metadataJson.smokeCorrelationId, null);
});

test('internal QA lifecycle events carry the canonical exclusion audience', () => {
  const [event] = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [{
      toolId: 'coverage-options',
      stage: 'DISCOVERED',
      surface: 'controlled_qa',
      analyticsAudience: 'SYNTHETIC_QA',
      metadata: { qaRunId: 'cap-906-qa-run' },
    }],
  });

  assert.equal(event.metadataJson.analyticsAudience, 'SYNTHETIC_QA');
  assert.equal(event.metadataJson.syntheticQa, true);
  assert.equal(event.metadataJson.qaRunId, 'cap-906-qa-run');
});
