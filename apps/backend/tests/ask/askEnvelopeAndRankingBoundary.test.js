const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// C2C Intelligence & Agentic Evolution Phase 3 / PR 12 (plan §8). Locks in the
// acceptance criteria for the Ask <-> Envelope integration that P0C wired.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { SKILL_DEFINITIONS, getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskEnvelopeQueryScope } = require('../../src/services/ask/askEnvelopeQueryScope.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message).operation.operationId;
}

test('non-actionable intelligence questions route to INTELLIGENCE_ENVELOPE_QUERY', () => {
  for (const message of [
    'Show my intelligence envelope',
    'Query the intelligence envelope for my home',
    'What derived intelligence does this property have?',
    'What do you know about my roof?',
  ]) {
    assert.equal(routeOf(message), 'INTELLIGENCE_ENVELOPE_QUERY', message);
  }
});

test('natural component questions compile to a typed, property-bound Envelope scope', () => {
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about my roof?'), {
    domains: ['ASSET_LIFECYCLE'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' }],
  });
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'Show my intelligence envelope'), {});
});

test('proactive / priority questions still route to HOME_ACTIONS, never to the Envelope', () => {
  for (const message of [
    'What should I do next for this home?',
    'Which home actions should I plan for next?',
    'What needs my attention first?',
  ]) {
    const routed = routeOf(message);
    assert.equal(routed, 'HOME_ACTIONS', message);
    assert.notEqual(routed, 'INTELLIGENCE_ENVELOPE_QUERY', message);
  }
});

test('ordinary-record questions route away from the Envelope', () => {
  assert.notEqual(routeOf('Show my inspection findings'), 'INTELLIGENCE_ENVELOPE_QUERY');
  assert.notEqual(routeOf('List my home records'), 'INTELLIGENCE_ENVELOPE_QUERY');
});

test('the Envelope operation is read-only and journey-neutral', () => {
  assert.equal(getSkillForOperation('INTELLIGENCE_ENVELOPE_QUERY').id, 'query-envelope');
  assert.equal(SKILL_DEFINITIONS['query-envelope'].autonomyLevel, 0);
  assert.deepEqual(SKILL_DEFINITIONS['query-envelope'].riskPolicy.effects, ['READ']);

  const def = ASK_OPERATION_DEFINITIONS.INTELLIGENCE_ENVELOPE_QUERY;
  assert.equal(def.executionMode, 'DETERMINISTIC');
  const policy = getAskAudiencePolicy('INTELLIGENCE_ENVELOPE_QUERY', def.version);
  assert.ok(policy, 'audience policy is registered');
  assert.equal(policy.journeyPresentation, 'NEUTRAL');
  assert.deepEqual([...policy.eligibleOperatingModes].sort(), ['BUYING', 'OWNING', 'SELLING', 'UNKNOWN']);
});

test('the orchestrator Envelope case does not reach promotion, ranking, or coverage owners', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const start = source.indexOf('async function intelligenceEnvelopeQueryResult');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2);
  for (const forbidden of ['homeActionSourcePromotion', 'getHomeActionFeed', 'compoundRuleRegistry', 'envelopeCoverage', 'CoverageAudit']) {
    assert.equal(body.includes(forbidden), false, `envelope result must not use ${forbidden}`);
  }
  // It reads the authorized query service and nothing broader.
  assert.ok(body.includes('queryIntelligenceEnvelope'));
});
