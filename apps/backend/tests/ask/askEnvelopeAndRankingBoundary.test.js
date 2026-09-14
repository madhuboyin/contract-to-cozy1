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

// Implementation plan §4.6 (Phase 0 decision, resolved this pass): roof/
// foundation/exterior/site each have a plausible WEATHER-domain rule
// (envelopeMappingRegistry.ts), so a component-scoped query for any of
// them widens to ['ASSET_LIFECYCLE', 'WEATHER'] -- the per-component
// allowlist option, adopted because entity-ref scoping is confirmed not
// to compensate for an overly broad domain list (matchesQuery ANDs both
// independently). INTERIOR has no WEATHER-domain rule and stays narrow.
test('natural component questions compile to a typed, property-bound Envelope scope', () => {
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about my roof?'), {
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'ROOF' }],
  });
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about the foundation?'), {
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'FOUNDATION' }],
  });
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about the exterior?'), {
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'EXTERIOR' }],
  });
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about the site?'), {
    domains: ['ASSET_LIFECYCLE', 'WEATHER'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'SITE' }],
  });
  assert.deepEqual(resolveAskEnvelopeQueryScope('property-1', 'What do you know about the interior?'), {
    domains: ['ASSET_LIFECYCLE'],
    entityRefs: [{ entityType: 'PROPERTY', entityId: 'property-1', componentKind: 'INTERIOR' }],
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

// External review [P1]: Radar's own suggested follow-ups ("What should I do
// about this?") used to reach this operation with zero memory of the
// triggering match -- askFollowUpContext.ts now resolves that into
// suppliedInput.radarMatchId, and this operation must actually use it to
// scope its answer, not just accept and ignore the parameter. Source-
// governance style (DB-touching function, no mock harness in this repo for
// this class of function -- same convention askNextActions.test.js
// documents for buildAskNextActionsBlock).
test('intelligenceEnvelopeQueryResult accepts suppliedInput and scopes items to the supplied radarMatchId via source.sourceRecordId', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const start = source.indexOf('async function intelligenceEnvelopeQueryResult');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2);
  assert.match(body, /suppliedInput\?: RadarEnvelopeQuerySuppliedInput/);
  assert.match(body, /const radarMatchId = suppliedInput\?\.radarMatchId \?\? null;/);
  assert.match(body, /item\.source\.sourceRecordId === radarMatchId/);
  // Falls back to the unfiltered page when nothing matched, rather than an
  // artificially empty result for a signal the homeowner was just notified about.
  assert.match(body, /scopedToRadarMatch\.length \? scopedToRadarMatch : page\.items/);
});

test('the maintenance.complete and intelligence-envelope.query registrations both read envelope.suppliedInput', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/ACT-003: maintenance.complete
  // now also falls back to launchContext.entityId (a fresh execution's
  // canonical target, e.g. a "Complete" row action) when suppliedInput is
  // absent -- suppliedInput (the same-session follow-up path) still takes
  // priority when both are present. Also threads launchContext.sourceExecutionId
  // (MAINT-005/A12) so the confirm handler can refresh the list the row
  // action came from once its mutation succeeds.
  assert.match(
    source,
    /registerCapabilityHandler\('maintenance\.complete', async \(envelope\) => maintenanceTaskCompleteResult\(envelope\.userId, envelope\.propertyId!, envelope\.message, \(envelope\.suppliedInput as MaintenanceCompletionWorkflowInput \| undefined\) \?\? \(launchMaintenanceTaskId\(envelope\) \? \{ taskId: launchMaintenanceTaskId\(envelope\)! \} : undefined\), envelope\.launchContext\?\.sourceExecutionId \?\? null\)\);/,
  );
  assert.match(
    source,
    /registerCapabilityHandler\('intelligence-envelope\.query', async \(envelope\) => intelligenceEnvelopeQueryResult\(envelope\.userId, envelope\.propertyId!, envelope\.message, envelope\.continuationCursor, envelope\.suppliedInput as RadarEnvelopeQuerySuppliedInput \| undefined\)\);/,
  );
});

test('suppliedInput is threaded end-to-end: askFollowUpContext\'s result reaches buildCapabilityInvocationEnvelope', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  // The one call site that actually has a resolved followUp to thread.
  assert.match(source, /suppliedInput: followUp\.suppliedInput,/);
  // The envelope builder actually sets it on CapabilityInvocationEnvelope,
  // not just accepting and dropping it (envelope.suppliedInput was
  // previously declared on the contract but never populated anywhere --
  // confirmed by grep before this fix).
  const envelopeBuilderStart = source.indexOf('function buildCapabilityInvocationEnvelope(');
  assert.ok(envelopeBuilderStart >= 0);
  const envelopeBuilderBody = source.slice(envelopeBuilderStart, source.indexOf('\n}\n', envelopeBuilderStart) + 2);
  assert.match(envelopeBuilderBody, /suppliedInput: input\.suppliedInput \?\? undefined,/);
});
