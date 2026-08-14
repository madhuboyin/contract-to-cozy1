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

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function report(t, component, samples, objectiveMs, canonicalOperationIncluded = false) {
  const p95Ms = percentile(samples, 0.95);
  t.diagnostic(JSON.stringify({
    component,
    sampleCount: samples.length,
    p95Ms: Number(p95Ms.toFixed(3)),
    objectiveMs,
    canonicalOperationIncluded,
  }));
  return p95Ms;
}

test('registry lookup reports the component p95 and stays immutable', (t) => {
  const skillIds = Object.keys(SKILL_DEFINITIONS);
  const samples = [];
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const startedAt = performance.now();
    const skill = getSkillDefinition(skillIds[iteration % skillIds.length]);
    samples.push(performance.now() - startedAt);
    assert.ok(skill);
    assert.equal(Object.isFrozen(skill), true);
  }
  const p95Ms = report(t, 'SKILL_REGISTRY_LOOKUP', samples, 25);
  assert.ok(p95Ms <= 25, `Registry p95 objective exceeded: ${p95Ms.toFixed(2)}ms`);
});
test('deterministic candidate generation reports p95 and remains bounded', (t) => {
  const messages = [
    'What maintenance is overdue?',
    'Should I repair or replace my HVAC?',
    'Would refinancing my mortgage help?',
    'Summarize my property record',
    'Organize my home upkeep schedule',
  ];
  const samples = [];
  for (let iteration = 0; iteration < 500; iteration += 1) {
    for (const message of messages) {
      const startedAt = performance.now();
      const decision = resolveHierarchicalSkillRouting(message, resolveAskRoutingCascade(message));
      samples.push(performance.now() - startedAt);
      assert.ok(decision.skillCandidates.length <= 10);
      assert.ok(decision.operationCandidates.length <= 3);
      assert.match(decision.semanticIndexVersion, /^[a-f0-9]{16}$/);
    }
  }
  const p95Ms = report(t, 'SKILL_CANDIDATE_GENERATION_AND_FILTERING', samples, 100);
  assert.ok(p95Ms <= 100, `Routing p95 objective exceeded: ${p95Ms.toFixed(2)}ms`);
});

test('context composition reports Skill-layer p95 separately from canonical execution', async (t) => {
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
  const samples = [];
  for (let iteration = 0; iteration < 50; iteration += 1) {
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
    samples.push(performance.now() - startedAt);
    assert.equal(result.status, 'READY');
    assert.equal(result.entries.length, 1);
    assert.ok(result.totalSerializedBytes <= skill.contextBudget.maxSerializedBytes);
  }
  assert.equal(providerCalls, 50);
  const p95Ms = report(t, 'SKILL_CONTEXT_COMPOSITION', samples, 500, false);
  assert.ok(p95Ms <= 500, `Context-composition p95 objective exceeded: ${p95Ms.toFixed(2)}ms`);
  t.diagnostic(JSON.stringify({ component: 'CANONICAL_OPERATION', measuredSeparately: true, invokedByThisFixture: false }));
});

test('phase metrics use bounded registry dimensions and keep sensitive values out of labels', () => {
  const metrics = readFileSync(resolve(__dirname, '../../src/lib/metrics.ts'), 'utf8');
  for (const metric of [
    'ask_skill_routing_duration_seconds',
    'ask_skill_execution_duration_seconds',
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
