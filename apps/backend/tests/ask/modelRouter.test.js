const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_MODEL_ROUTER_CANDIDATE_LIMIT, buildAskModelRouterCandidates, isAskModelRoutableOperation, refineAskRoutingWithModel } = require('../../src/services/ask/askModelRouter.ts');
const { ASK_LLM_PURPOSE_CONTRACTS, validateAskLlmPurposeContracts } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

// The model-assisted router (review step 7): a model may choose between registered READ operations for a message the local router could not
// place. These tests use stub providers; nothing here calls a model. Real accuracy is measured with `node scripts/ask-routing-sweep.js --model`.

const eligible = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY')).map((definition) => definition.operationId);
const MESSAGE = 'what permits do I need for a deck';
const fallbackDecision = () => ({ ...resolveAskRoutingCascade('hi', { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' }) });
const stub = (reply) => { const calls = []; return { calls, select: async (request) => { calls.push(request); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply(request) : reply; } }; };
const run = async (reply, overrides = {}) => {
  const provider = stub(reply); const outcomes = [];
  const decision = overrides.decision ?? fallbackDecision();
  const result = await refineAskRoutingWithModel(decision, { enabled: true, message: MESSAGE, provider, eligibleOperationIds: eligible, propertyId: 'p1', onOutcome: (outcome) => outcomes.push(outcome), ...overrides.options });
  return { result, decision, provider, outcomes };
};

test('the starting point is a real fallback decision', () => {
  assert.equal(fallbackDecision().stage, 'REMOTE_FALLBACK');
});

test('the model is offered only read-only, routable operations, at most ten, each described', () => {
  const candidates = buildAskModelRouterCandidates(MESSAGE, { eligibleOperationIds: eligible });
  assert.ok(candidates.length > 0 && candidates.length <= ASK_MODEL_ROUTER_CANDIDATE_LIMIT);
  for (const candidate of candidates) {
    const definition = ASK_OPERATION_DEFINITIONS[candidate.operationId];
    assert.equal(definition.semantic.effect, 'READ', candidate.operationId);
    assert.ok(isAskModelRoutableOperation(candidate.operationId), candidate.operationId);
    assert.ok(candidate.description.length > 5, candidate.operationId);
  }
  const ids = candidates.map((candidate) => candidate.operationId);
  assert.ok(!ids.includes('GROUNDED_GUIDANCE'));
  assert.ok(ids.some((id) => /PERMIT/.test(id)), `a permit operation is among the candidates: ${ids.join(',')}`);
  for (const id of ['GROUNDED_GUIDANCE', 'EMERGENCY_BOUNDARY', 'HOME_RECORD_EXPORT', 'MAINTENANCE_TASK_CREATE', 'REFINANCE_RATE_MONITOR']) assert.equal(isAskModelRoutableOperation(id), false, id);
});

test('HIGH confidence on an offered operation routes to it, and records how it was routed', async () => {
  const { result, provider, outcomes } = await run((request) => ({ operationId: request.candidates[0].operationId, confidence: 'HIGH' }));
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].purpose, 'ASK_COZY_OPERATION_ROUTING');
  assert.equal(provider.calls[0].question, MESSAGE);
  assert.equal(result.stage, 'MODEL_CLASSIFIER');
  assert.equal(result.operation.operationId, provider.calls[0].candidates[0].operationId);
  assert.equal(result.requiresClarification, false);
  assert.deepEqual(result.candidates[0].reasonCodes, ['MODEL_ROUTER_SELECTED']);
  assert.deepEqual(outcomes, ['ROUTED']);
});

test('MEDIUM confidence offers the operation as a clarification instead of running it', async () => {
  const { result, provider, outcomes } = await run((request) => ({ operationId: request.candidates[0].operationId, confidence: 'MEDIUM' }));
  assert.equal(result.stage, 'CLARIFICATION');
  assert.equal(result.requiresClarification, true);
  assert.equal(result.candidates[0].operationId, provider.calls[0].candidates[0].operationId);
  assert.ok(result.candidates.length >= 1 && result.candidates.length <= 3);
  assert.deepEqual(outcomes, ['CLARIFY']);
});

test('NONE, LOW confidence, an operation that was not offered, and an off-schema reply all leave the local decision exactly as it was', async () => {
  for (const [reply, expected] of [
    [{ operationId: 'NONE', confidence: 'HIGH' }, 'NONE'],
    [(request) => ({ operationId: request.candidates[0].operationId, confidence: 'LOW' }), 'NONE'],
    [{ operationId: 'HOME_RECORD_EXPORT', confidence: 'HIGH' }, 'REJECTED'],
    [{ operationId: 'MAINTENANCE_TASK_CREATE', confidence: 'HIGH' }, 'REJECTED'],
    [{ operationId: 'GROUNDED_GUIDANCE', confidence: 'HIGH' }, 'REJECTED'],
    [{ operationId: 'NOT_A_REAL_OPERATION', confidence: 'HIGH' }, 'REJECTED'],
    [{ unexpected: true }, 'REJECTED'],
    ['not json at all', 'REJECTED'],
    [{ operationId: 'PERMIT_TRACKER_STATUS', confidence: 'HIGH', extra: 'prose' }, 'REJECTED'],
  ]) {
    const { result, decision, outcomes } = await run(reply);
    assert.equal(result, decision, JSON.stringify(reply));
    assert.deepEqual(outcomes, [expected], JSON.stringify(reply));
  }
});

test('a model failure or timeout never throws and leaves the decision as it was', async () => {
  const { result, decision, outcomes } = await run(new Error('Gemini unavailable'));
  assert.equal(result, decision);
  assert.deepEqual(outcomes, ['UNAVAILABLE']);
});

test('the model is not called for safety, deterministic or local-classifier decisions, or when disabled', async () => {
  const cases = [
    resolveAskRoutingCascade('show me my home inventory', { localRoutingEnabled: true, propertyId: 'p1' }),
    resolveAskRoutingCascade('i smell gas in my house', { localRoutingEnabled: true, propertyId: 'p1' }),
    resolveAskRoutingCascade('how much does it cost me to own this house each year', { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' }),
  ];
  assert.deepEqual(cases.map((decision) => decision.stage), ['DETERMINISTIC', 'SAFETY', 'LOCAL_CLASSIFIER']);
  for (const decision of cases) {
    const { result, provider, outcomes } = await run({ operationId: 'NONE', confidence: 'HIGH' }, { decision });
    assert.equal(result, decision);
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(outcomes, []);
  }
  const disabled = await run({ operationId: 'PERMIT_TRACKER_STATUS', confidence: 'HIGH' }, { options: { enabled: false } });
  assert.equal(disabled.provider.calls.length, 0);
  assert.equal(disabled.result, disabled.decision);
});

test('a message that may describe something happening now is never given to the model, even though the safety gate does not recognise it', async () => {
  for (const message of ['my house is on fire', 'there is a fire in my kitchen', 'my basement is flooded', 'my pipe burst', 'sparks are coming out of my panel', 'smoke coming from the outlet', 'someone broke into my house', 'call 911']) {
    const { result, decision, provider, outcomes } = await run({ operationId: 'PAST_HAZARD_EXPOSURE', confidence: 'HIGH' }, { options: { message } });
    assert.equal(provider.calls.length, 0, message);
    assert.equal(result, decision, message);
    assert.deepEqual(outcomes, ['SKIPPED_URGENT'], message);
  }
});

test('a clarification between local candidates keeps those candidates available to the model', async () => {
  const clarification = { ...fallbackDecision(), stage: 'CLARIFICATION', requiresClarification: true, candidates: [{ operationId: 'MAINTENANCE_STATUS', confidence: 0.5 }, { operationId: 'HOME_ACTIONS', confidence: 0.5 }] };
  const { provider } = await run({ operationId: 'NONE', confidence: 'LOW' }, { decision: clarification, options: { message: 'what is going on with the house' } });
  const ids = provider.calls[0].candidates.map((candidate) => candidate.operationId);
  assert.ok(ids.includes('MAINTENANCE_STATUS') && ids.includes('HOME_ACTIONS'));
});

test('the router is off by default, has a kill switch, and its model purpose is registered with structured output', () => {
  assert.equal(readAskOperationalControls({}).modelRouterEnabled, false);
  assert.equal(readAskOperationalControls({ ASK_MODEL_ROUTER_ENABLED: 'true' }).modelRouterEnabled, true);
  assert.equal(readAskOperationalControls({ ASK_MODEL_ROUTER_ENABLED: 'true', ASK_MODEL_ROUTER_KILL_SWITCH: 'true' }).modelRouterEnabled, false);
  assert.deepEqual(validateAskLlmPurposeContracts(), []);
  assert.equal(ASK_LLM_PURPOSE_CONTRACTS.ASK_COZY_OPERATION_ROUTING.structuredOutputRequired, true);
  assert.equal(ASK_LLM_PURPOSE_CONTRACTS.ASK_COZY_OPERATION_ROUTING.routeId, 'ai:ask');
});
