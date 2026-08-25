const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  executeGovernedAIRequest,
  resolveGovernedAIModel,
  resetAIRequestGovernanceForTests,
  getAIRequestHealthSnapshot,
} = require('../../src/services/ai/aiRequestGovernance.service.ts');
const {
  AI_SOURCE_REGISTRY,
  validateIntelligenceSourceRegistry,
} = require('../../src/services/intelligence/sourceRegistry.ts');
const { runPhase7EvaluationHarness } = require('../../src/services/intelligence/phase7EvaluationHarness.ts');

test('Phase 7 deterministic evaluation harness covers every required category and passes', () => {
  const results = runPhase7EvaluationHarness();
  assert.deepEqual(new Set(results.map((result) => result.category)), new Set([
    'RANKING', 'MINIMAL_DATA', 'CONFLICTING_FACTS', 'DECISIONS', 'EXTRACTION',
    'COMPOUND_RULES', 'GENERATED_EXPLANATIONS', 'SAFETY_BOUNDARIES',
  ]));
  assert.deepEqual(results.filter((result) => !result.passed), []);
  assert.ok(results.every((result) => result.capabilityId && result.capabilityVersion));
});

test('AI source registry is complete and every direct model-call file uses the governance boundary', () => {
  assert.deepEqual(validateIntelligenceSourceRegistry(), []);
  const repositoryRoot = path.resolve(__dirname, '../../../..');
  for (const entry of AI_SOURCE_REGISTRY) {
    assert.ok(entry.sourceFile, `${entry.sourceId} must declare its source file`);
    const source = fs.readFileSync(path.join(repositoryRoot, entry.sourceFile), 'utf8');
    assert.match(source, /executeGovernedAIRequest/, `${entry.sourceId} bypasses AI request governance`);
    assert.match(source, new RegExp(entry.sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('governed AI requests enforce model configuration, disable controls, structure, and per-route rate limits', async () => {
  resetAIRequestGovernanceForTests();
  assert.equal(resolveGovernedAIModel('FAST', { GEMINI_MODEL: 'reviewed-fast' }), 'reviewed-fast');
  await assert.rejects(
    executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', work: async () => ({}), env: { AI_REQUESTS_ENABLED: 'false' } }),
    (error) => error.code === 'AI_DISABLED',
  );
  await assert.rejects(
    executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', structuredOutputRequired: true, structuredOutputConfigured: false, work: async () => ({}), env: {} }),
    (error) => error.code === 'AI_STRUCTURE_REQUIRED',
  );

  resetAIRequestGovernanceForTests();
  const env = { AI_ROUTE_ASK_RATE_LIMIT_PER_MINUTE: '1', AI_REQUEST_MAX_ATTEMPTS: '1' };
  const response = await executeGovernedAIRequest({
    routeId: 'ai:ask', model: 'm', env,
    work: async () => ({ response: { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } } }),
  });
  assert.equal(response.response.usageMetadata.candidatesTokenCount, 3);
  assert.equal(getAIRequestHealthSnapshot('ai:ask').status, 'HEALTHY');
  await assert.rejects(
    executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => ({}) }),
    (error) => error.code === 'AI_RATE_LIMITED',
  );
});
