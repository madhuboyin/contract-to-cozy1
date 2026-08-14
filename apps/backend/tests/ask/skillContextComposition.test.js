const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { composeSkillContext } = require('../../src/services/skills/context/skillContextComposer.ts');
const {
  REGISTERED_SKILL_CONTEXT_PROVIDER_REFS,
  validateSkillContextProviderDefinitions,
} = require('../../src/services/skills/context/skillContextProviderRegistry.ts');
const { SKILL_DEFINITIONS, validateSkillDefinitions } = require('../../src/services/skills/skillRegistry.ts');

const ref = { id: 'test.context', version: '1.0.0' };

function skill(overrides = {}) {
  return {
    ...SKILL_DEFINITIONS.maintenance,
    operations: [{
      operationId: 'MAINTENANCE_STATUS',
      version: '1.0',
      requiredContextProviders: [ref],
      optionalContextProviders: [],
    }],
    requiredContextProviders: [ref],
    optionalContextProviders: [],
    contextBudget: {
      ...SKILL_DEFINITIONS.maintenance.contextBudget,
      maxFacts: 10,
      maxEntities: 10,
      maxSerializedBytes: 1_000,
      maxProviderLatencyMs: 100,
      maxOverallLatencyMs: 200,
    },
    ...overrides,
  };
}

function provider(load, overrides = {}) {
  return {
    ...ref,
    canonicalOwner: 'TestCanonicalService',
    description: 'Test-only context provider',
    minimumRole: 'VIEWER',
    sensitivity: 'STANDARD',
    defaultTimeoutMs: 100,
    maxSerializedBytes: 1_000,
    supportedOperations: ['MAINTENANCE_STATUS'],
    load,
    ...overrides,
  };
}

const authorizeViewer = async (_userId, propertyId) => ({ propertyId, role: 'VIEWER' });

test('the context provider registry and provider-backed Skill manifests validate', () => {
  assert.deepEqual(validateSkillContextProviderDefinitions(), []);
  assert.ok(REGISTERED_SKILL_CONTEXT_PROVIDER_REFS.has('maintenance.task-context@1.0.0'));
  assert.deepEqual(validateSkillDefinitions(), []);
});

test('Ask exposes stable provider and budget error codes for blocked required context', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(orchestrator, /budgetFailure \? 'ASK_CONTEXT_BUDGET_EXCEEDED' : 'ASK_CONTEXT_PROVIDER_UNAVAILABLE'/);
  assert.doesNotMatch(orchestrator, /ASK_REQUIRED_CONTEXT_UNAVAILABLE/);
});

test('composer invokes only declared operation providers and records provenance', async () => {
  let calls = 0;
  const result = await composeSkillContext({
    skill: skill(), operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: authorizeViewer,
    resolveProvider: () => provider(async () => {
      calls += 1;
      return { status: 'AVAILABLE', data: { answer: 42 }, observedAt: '2026-08-13T00:00:00.000Z', sourceVersion: 'source-v1', entityCount: 1, factCount: 1 };
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.values['test.context@1.0.0'], { answer: 42 });
  assert.equal(result.entries[0].provenance.canonicalOwner, 'TestCanonicalService');
  assert.equal(result.entries[0].provenance.sourceVersion, 'source-v1');
});

test('composer rechecks property authorization before invoking a provider', async () => {
  let calls = 0;
  const result = await composeSkillContext({
    skill: skill(), operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: async () => null,
    resolveProvider: () => provider(async () => {
      calls += 1;
      return { status: 'AVAILABLE', data: {} };
    }),
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.entries[0].status, 'UNAUTHORIZED');
});

test('composer deduplicates identical provider requests within one composition', async () => {
  let calls = 0;
  const duplicateSkill = skill({
    operations: [{
      operationId: 'MAINTENANCE_STATUS', version: '1.0',
      requiredContextProviders: [ref], optionalContextProviders: [ref],
    }],
    optionalContextProviders: [ref],
  });
  const result = await composeSkillContext({
    skill: duplicateSkill, operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: authorizeViewer,
    resolveProvider: () => provider(async () => {
      calls += 1;
      return { status: 'AVAILABLE', data: { value: true } };
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].required, true);
});

test('required provider timeout blocks execution and aborts the provider signal', async () => {
  let aborted = false;
  const result = await composeSkillContext({
    skill: skill({ contextBudget: { ...skill().contextBudget, maxProviderLatencyMs: 5 } }),
    operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: authorizeViewer,
    resolveProvider: () => provider(({ signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      setTimeout(() => resolve({ status: 'AVAILABLE', data: {} }), 50);
    })),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.entries[0].status, 'TIMED_OUT');
  assert.equal(aborted, true);
});

test('optional unknown context degrades without blocking usable results', async () => {
  const optionalSkill = skill({
    operations: [{ operationId: 'MAINTENANCE_STATUS', version: '1.0', requiredContextProviders: [], optionalContextProviders: [ref] }],
    requiredContextProviders: [],
    optionalContextProviders: [ref],
  });
  const result = await composeSkillContext({
    skill: optionalSkill, operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: authorizeViewer,
    resolveProvider: () => provider(async () => ({ status: 'UNKNOWN', detail: 'Not recorded.' })),
  });
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.entries[0].status, 'UNKNOWN');
  assert.deepEqual(result.values, {});
});

test('provider and aggregate entity/byte budgets fail closed for required context', async () => {
  const result = await composeSkillContext({
    skill: skill(), operationId: 'MAINTENANCE_STATUS', userId: 'user-1', propertyId: 'property-1',
  }, {
    authorizeProperty: authorizeViewer,
    resolveProvider: () => provider(async () => ({
      status: 'AVAILABLE', data: { oversized: 'x'.repeat(2_000) }, entityCount: 11, factCount: 11,
    })),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.entries[0].status, 'BUDGET_EXCEEDED');
  assert.equal(result.values['test.context@1.0.0'], undefined);
});

test('operation-scoped provider references must be declared by the Skill', () => {
  const invalid = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      operations: [{
        operationId: 'MAINTENANCE_STATUS', version: '1.0',
        requiredContextProviders: [{ id: 'undeclared.context', version: '1.0.0' }],
      }],
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('uses undeclared context provider undeclared.context@1.0.0')));
});
