const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { composeSkillContext } = require('../../src/services/skills/context/skillContextComposer.ts');
const { getSkillDefinition, SKILL_DEFINITIONS } = require('../../src/services/skills/skillRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

test('registry lookup stays bounded and immutable under representative repetition', () => {
  const skillIds = Object.keys(SKILL_DEFINITIONS);
  const startedAt = performance.now();
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const skill = getSkillDefinition(skillIds[iteration % skillIds.length]);
    assert.ok(skill);
    assert.equal(Object.isFrozen(skill), true);
  }
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 2_000, `Registry smoke ceiling exceeded: ${elapsedMs.toFixed(2)}ms`);
});
test('deterministic and semantic routing remain bounded by candidate and time ceilings', () => {
  const messages = [
    'What maintenance is overdue?',
    'Should I repair or replace my HVAC?',
    'Would refinancing my mortgage help?',
    'Summarize my property record',
    'Organize my home upkeep schedule',
  ];
  const startedAt = performance.now();
  for (let iteration = 0; iteration < 500; iteration += 1) {
    for (const message of messages) {
      const decision = resolveHierarchicalSkillRouting(message, resolveAskRoutingCascade(message));
      assert.ok(decision.skillCandidates.length <= 10);
      assert.ok(decision.operationCandidates.length <= 3);
      assert.match(decision.semanticIndexVersion, /^[a-f0-9]{16}$/);
    }
  }
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 5_000, `Routing smoke ceiling exceeded: ${elapsedMs.toFixed(2)}ms`);
});

test('context composition deduplicates provider fan-out and enforces payload budgets', async () => {
  const providerReference = { id: 'smoke.context', version: '1.0.0' };
  const skill = {
    ...SKILL_DEFINITIONS.maintenance,
    operations: [{
      operationId: 'MAINTENANCE_STATUS',
      version: '1.0',
      requiredContextProviders: [providerReference],
      optionalContextProviders: [providerReference],
    }],
    requiredContextProviders: [providerReference],
    optionalContextProviders: [providerReference],
    contextBudget: { ...SKILL_DEFINITIONS.maintenance.contextBudget, maxSerializedBytes: 512 },
  };
  let providerCalls = 0;
  const startedAt = performance.now();
  const result = await composeSkillContext({
    skill,
    operationId: 'MAINTENANCE_STATUS',
    userId: 'smoke-user',
    propertyId: 'smoke-property',
  }, {
    authorizeProperty: async () => ({ propertyId: 'smoke-property', role: 'VIEWER' }),
    resolveProvider: () => ({
      id: providerReference.id,
      version: providerReference.version,
      canonicalOwner: 'Performance smoke fixture',
      description: 'Bounded fixture',
      minimumRole: 'VIEWER',
      sensitivity: 'STANDARD',
      defaultTimeoutMs: 100,
      maxSerializedBytes: 512,
      supportedOperations: ['MAINTENANCE_STATUS'],
      load: async () => {
        providerCalls += 1;
        return { status: 'AVAILABLE', data: { facts: ['bounded'] }, factCount: 1, entityCount: 0 };
      },
    }),
  });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.status, 'READY');
  assert.equal(providerCalls, 1);
  assert.equal(result.entries.length, 1);
  assert.ok(result.totalSerializedBytes <= skill.contextBudget.maxSerializedBytes);
  assert.ok(elapsedMs < 1_000, `Context smoke ceiling exceeded: ${elapsedMs.toFixed(2)}ms`);
});

test('phase metrics use bounded registry dimensions and keep sensitive values out of labels', () => {
  const metrics = readFileSync(resolve(__dirname, '../../src/lib/metrics.ts'), 'utf8');
  for (const metric of [
    'ask_skill_routing_duration_seconds',
    'ask_skill_context_composition_duration_seconds',
    'ask_skill_context_payload_bytes',
    'ask_skill_context_provider_fanout',
    'ask_skill_adapter_resolution_duration_seconds',
    'ask_skill_canonical_operation_duration_seconds',
    'ask_skill_presentation_duration_seconds',
    'ask_model_duration_seconds',
  ]) assert.match(metrics, new RegExp(`name: '${metric}'`));

  const metricSection = metrics.slice(metrics.indexOf("name: 'ask_skill_routing_duration_seconds'"));
  assert.doesNotMatch(metricSection, /labelNames:\s*\[[^\]]*(?:user|property|execution|session|prompt|message|address|email)/i);
});
