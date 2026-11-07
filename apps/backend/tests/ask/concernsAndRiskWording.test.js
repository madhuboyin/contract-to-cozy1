const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { readableStoredValue, selectAndRenderAskRemoteFallbackClaims, ASK_UNVERIFIABLE_ANSWER_TEXT } = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { offerDidYouMean } = require('../../src/services/ask/support/didYouMean.ts');

// Review screenshots (2026-11-07): "what is the single most important thing i need to be concerned of about my home" reached the radar feed ("Monitoring
// is degraded"); "what are the most risky items in my home inventory" was taken by HOME_WORK_ITEMS on the word "items"; "by how much my cost of ownership
// … will increase in next 5 years" fell to the fallback, whose answer was then blocked ("I couldn't verify this answer", with a Try again that cannot help).

// Production hides buyer-only operations from a non-buyer; the same here, because that changes which candidate wins.
const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY') && !definition.operationId.startsWith('BUYER_')).map((definition) => definition.operationId);
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner });

test('questions about what to be concerned about, or what comes first, reach Home Actions', () => {
  for (const message of [
    'what is the single most important thing i need to be concerned of about my home',
    'what are the main things i need to be concerned of for next few days',
    'what is the most important thing to do first',
    'what should i be concerned about in my home',
  ]) assert.equal(route(message).operation.operationId, 'HOME_ACTIONS', message);
});

test('a concern about a named subject is not taken by Home Actions', () => {
  for (const message of ['what should i be worried about with my roof', 'what should i worry about with my insurance', 'should i be concerned about the weather this week', 'what are the top risks to my home value', 'what is the most important thing to know before buying a house']) {
    assert.notEqual(route(message).operation.operationId, 'HOME_ACTIONS', message);
  }
});

test('risky or at-risk items, appliances and systems reach the appliance failure risk view', () => {
  for (const message of ['what are the most risky items in my home inventory', 'what are the riskiest appliances i own', 'which appliances are at risk of failing', 'which systems are most at risk of failing']) {
    assert.equal(route(message).operation.operationId, 'APPLIANCE_FAILURE_RISK', message);
  }
});

test('"cost of ownership" reaches the ownership costs view, projections included', () => {
  for (const message of ['by how much my cost of ownership for my home will increase in next 5 years', 'what is the cost of ownership for my home', 'how much will my home costs go up over the next 5 years']) {
    assert.equal(route(message).operation.operationId, 'OWNERSHIP_COSTS', message);
  }
});

test('rebates, incentives and tax credits reach savings and benefits, not tool discovery', () => {
  for (const message of ['are there any federal/ state rebates for my home', 'what energy incentives can i get', 'is there a tax credit for a heat pump', 'any utility rebates available']) {
    assert.equal(route(message).operation.operationId, 'SAVINGS_OPPORTUNITIES', message);
  }
});

test('a stored enum value is shown the way a homeowner reads it', () => {
  assert.equal(readableStoredValue('ASPHALT_SHINGLE'), 'Asphalt shingle');
  assert.equal(readableStoredValue('FORCED_AIR'), 'Forced air');
  assert.equal(readableStoredValue('POOR'), 'POOR', 'a single word has no underscore and is left as recorded');
  assert.equal(readableStoredValue('Asphalt shingle'), 'Asphalt shingle');
  assert.equal(readableStoredValue('HVAC system'), 'HVAC system');
});

test('a fallback answer that states a stored enum value passes the answer-trust check instead of being blocked', async () => {
  const facts = [{ key: 'structure.roofType', value: 'ASPHALT_SHINGLE', source: 'USER_REPORTED', observedAt: null, confidence: 0.8 }, { key: 'systems.heatingType', value: 'FORCED_AIR', source: 'USER_REPORTED', observedAt: null, confidence: 0.8 }];
  const rendered = await selectAndRenderAskRemoteFallbackClaims({ question: 'what is my roof and heating', facts, provider: { select: async ({ candidates }) => ({ claims: candidates }) } });
  const body = rendered.map((claim) => claim.text).join(' ');
  assert.match(body, /Asphalt shingle/);
  assert.match(body, /Forced air/);
  const result = attachEvidence({
    status: 'ANSWERED',
    blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body, tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  }, [completedAskAuthoritativeSourceEvidence('GROUNDED_GUIDANCE')]);
  const validation = validateAskAnswerTrustPipeline({ question: 'what is my roof and heating', operationId: 'GROUNDED_GUIDANCE', result, semanticEnabled: false, propertyId: 'p1' });
  assert.equal(validation.trust.outcome, 'PASS');
  assert.ok(!validation.trust.reasonCodes.includes('INTERNAL_PRESENTATION_TOKEN'));
});

test('a blocked fallback answer is the plain unverified message with a Did you mean, not an error with Try again', () => {
  const blockedBody = 'Roof Type is recorded as MAINTENANCE_STATUS.';
  const result = attachEvidence({
    status: 'ANSWERED',
    blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body: blockedBody, tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  }, [completedAskAuthoritativeSourceEvidence('GROUNDED_GUIDANCE')]);
  const validation = validateAskAnswerTrustPipeline({ question: 'by how much will my costs increase', operationId: 'GROUNDED_GUIDANCE', result, semanticEnabled: false, propertyId: 'p1' });
  assert.equal(validation.trust.outcome, 'BLOCK');
  assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE');
  assert.equal(validation.result.blocks[0].body, ASK_UNVERIFIABLE_ANSWER_TEXT);
  assert.ok(!JSON.stringify(validation.result).includes('MAINTENANCE_STATUS'));
  const decision = route('by how much will my overall expenses go up');
  const offered = offerDidYouMean({ operationId: 'GROUNDED_GUIDANCE', routingDecision: { ...decision, stage: 'REMOTE_FALLBACK' }, result: validation.result, eligibleOperationIds: owner });
  assert.ok(offered === null || offered.status === 'NEEDS_CLARIFICATION', 'the unverified answer is eligible for a Did you mean');
  // Any other operation's blocked answer is still an error the homeowner can retry.
  const other = validateAskAnswerTrustPipeline({ question: 'what maintenance is due', operationId: 'MAINTENANCE_STATUS', semanticEnabled: false, propertyId: 'p1', result: attachEvidence({ status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 'Maintenance', body: 'Status is MAINTENANCE_STATUS.', tone: 'DEFAULT', actions: [] }], suggestions: [] }, [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')]) });
  assert.equal(other.result.status, 'FAILED_RETRYABLE');
});
