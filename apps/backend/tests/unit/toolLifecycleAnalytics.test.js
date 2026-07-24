const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildToolLifecycleAnalyticsEvents,
  canonicalizeToolLifecycleId,
  toolLifecycleEventName,
} = require('../../src/services/analytics/toolLifecycle.ts');

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
  assert.equal(events[0].metadataJson.completionKind, 'DECISION_RECORDED');
  assert.equal(events[0].metadataJson.recommendationVersion, 'capability-recommendation-v1');
});

test('tool lifecycle stage names remain queryable without a Prisma enum change', () => {
  assert.equal(toolLifecycleEventName('DISCOVERED'), 'TOOL_DISCOVERED');
  assert.equal(toolLifecycleEventName('OUTPUT_GENERATED'), 'TOOL_OUTPUT_GENERATED');
});

test('backend feature aliases converge on the discovery catalog', () => {
  assert.equal(canonicalizeToolLifecycleId('coverage_analysis'), 'coverage-intelligence');
  assert.equal(canonicalizeToolLifecycleId('RENOVATION_ADVISOR_SESSION'), 'home-renovation-risk-advisor');
  assert.equal(canonicalizeToolLifecycleId('hoa'), 'hoa-compliance');
  assert.equal(canonicalizeToolLifecycleId('unrelated_backend_feature'), null);
});
