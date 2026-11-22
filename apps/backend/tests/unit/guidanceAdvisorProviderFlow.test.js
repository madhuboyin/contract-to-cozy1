const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { readGuidanceAdvisorControls } = require('../../src/config/guidanceAdvisorControls.ts');
const { serializeGuidanceAdvicePayload, buildGuidanceAdvicePrompt, GUIDANCE_ADVISOR_PERMITTED_FIELDS } = require('../../src/services/guidanceEngine/guidanceAdvisorPayload.ts');
const { guidanceAdvisorService } = require('../../src/services/guidanceEngine/guidanceAdvisor.service.ts');
const { geminiService } = require('../../src/services/gemini.service.ts');

// Owner decision 2026-11-22: the Guidance Advisor is its own provider flow, off by default, never enabled by an Ask approval.
const ALL_ON = { GUIDANCE_ADVISOR_AI_ENABLED: 'true', GUIDANCE_ADVISOR_PROVIDER_TERMS_RECORDED: 'true', GUIDANCE_ADVISOR_PROPERTY_DATA_APPROVED: 'true' };
const context = (extra = {}) => ({
  propertyId: 'property-secret-id', userId: 'user-secret-id', journeyId: 'journey-secret-id', issueDomain: 'HVAC',
  signalIntentFamily: 'FILTER_OVERDUE', assetName: 'Furnace', symptom: 'noisy, email me at owner@example.com or 415-555-0199',
  currentStepLabel: 'Check the filter', priorityBucket: 'HIGH', costOfDelay: 4_872, coverageImpact: 'Warranty expired', ...extra,
});

test('the flow is off by default and needs the flag, no kill switch, provider terms and property-data approval', () => {
  assert.equal(readGuidanceAdvisorControls({}).enabled, false);
  assert.equal(readGuidanceAdvisorControls({}).disabledReason, 'FEATURE_OFF');
  assert.equal(readGuidanceAdvisorControls({ GUIDANCE_ADVISOR_AI_ENABLED: 'true' }).disabledReason, 'PROVIDER_TERMS_NOT_RECORDED');
  assert.equal(readGuidanceAdvisorControls({ GUIDANCE_ADVISOR_AI_ENABLED: 'true', GUIDANCE_ADVISOR_PROVIDER_TERMS_RECORDED: 'true' }).disabledReason, 'PROPERTY_DATA_NOT_APPROVED');
  assert.equal(readGuidanceAdvisorControls(ALL_ON).enabled, true);
  assert.equal(readGuidanceAdvisorControls({ ...ALL_ON, GUIDANCE_ADVISOR_AI_KILL_SWITCH: 'true' }).disabledReason, 'KILL_SWITCH');
});

test('no Ask provider approval enables the Guidance Advisor', () => {
  const askApprovals = { ASK_UNDERSTANDING_PLANNER_ENABLED: 'true', ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED: 'true', ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED: 'true', ASK_SEMANTIC_PROVIDER_APPROVED: 'true', ASK_REMOTE_GENERATION_ENABLED: 'true', ASK_CONVERSATIONAL_CAPTURE_ENABLED: 'true' };
  assert.equal(readGuidanceAdvisorControls(askApprovals).enabled, false);
});

test('only the allowlisted fields are serialised: no identifier, no raw cost, redacted free text', () => {
  const payload = serializeGuidanceAdvicePayload(context());
  assert.deepEqual(Object.keys(payload).sort(), [...GUIDANCE_ADVISOR_PERMITTED_FIELDS].sort());
  assert.equal(payload.costOfDelay, 4_900, 'rounded to the nearest $100');
  const prompt = buildGuidanceAdvicePrompt(payload);
  assert.doesNotMatch(prompt, /property-secret-id|user-secret-id|journey-secret-id|owner@example\.com|415-555-0199/);
  assert.match(prompt, /\[email redacted\]/);
  assert.match(prompt, /\[phone redacted\]/);
  assert.equal(serializeGuidanceAdvicePayload(context({ symptom: 'x'.repeat(500) })).symptom.length, 120);
  assert.equal(serializeGuidanceAdvicePayload(context({ costOfDelay: null })).costOfDelay, null);
});

test('when the flow is off no provider call is made', async () => {
  const original = geminiService.generateGuidanceAdvice;
  let calls = 0;
  geminiService.generateGuidanceAdvice = async () => { calls += 1; return 'advice'; };
  try {
    assert.equal(await guidanceAdvisorService.generateStrategicAdvice(context()), null);
    assert.equal(calls, 0);
  } finally { geminiService.generateGuidanceAdvice = original; }
});

test('captured payload: with the flow on, the provider request carries only the minimised prompt and no property context', async () => {
  const captured = [];
  const original = geminiService.getAI;
  const previous = { ...process.env };
  Object.assign(process.env, ALL_ON);
  geminiService.getAI = () => ({ models: { generateContent: async (request) => { captured.push(request); return { text: ' Replacing the filter now avoids a costly breakdown. ' }; } } });
  try {
    const advice = await guidanceAdvisorService.generateStrategicAdvice(context());
    assert.equal(advice, 'Replacing the filter now avoids a costly breakdown.');
  } finally {
    geminiService.getAI = original;
    for (const key of Object.keys(ALL_ON)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
  assert.equal(captured.length, 1);
  assert.equal(typeof captured[0].contents, 'string');
  assert.doesNotMatch(captured[0].contents, /property-secret-id|user-secret-id|journey-secret-id|owner@example\.com|415-555-0199|4872/);
  assert.match(captured[0].contents, /Furnace/);
  assert.ok(!('tools' in captured[0].config) && !JSON.stringify(captured[0]).includes('propertyContext'));
});

test('failure fallback: a provider failure returns no advice and does not throw', async () => {
  const original = geminiService.generateGuidanceAdvice;
  const previous = { ...process.env };
  Object.assign(process.env, ALL_ON);
  geminiService.generateGuidanceAdvice = async () => { throw new Error('provider down'); };
  try {
    assert.equal(await guidanceAdvisorService.generateStrategicAdvice(context()), null);
  } finally {
    geminiService.generateGuidanceAdvice = original;
    for (const key of Object.keys(ALL_ON)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test('the old chat call that injected property facts no longer exists', () => {
  assert.equal(typeof geminiService.sendMessageToChat, 'undefined');
});
