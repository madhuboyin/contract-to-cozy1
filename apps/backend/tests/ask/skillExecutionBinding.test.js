const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  SKILL_EXECUTION_BINDING_SCHEMA_VERSION,
  buildSkillExecutionBinding,
  validateSkillExecutionBinding,
} = require('../../src/services/skills/skillExecutionBinding.ts');
const { SKILL_DEFINITIONS } = require('../../src/services/skills/skillRegistry.ts');

function maintenanceBinding() {
  return buildSkillExecutionBinding({
    skill: SKILL_DEFINITIONS.maintenance,
    operationId: 'MAINTENANCE_STATUS',
    consumer: 'ASK',
    routingPath: 'SKILL_INDEX',
    routingReasonCodes: ['ALIAS_MATCH', 'GOAL_MATCH', 'ALIAS_MATCH'],
    semanticIndexVersion: 'skill-index@1.0.0',
  });
}

test('execution binding pins every executable contract before context composition', () => {
  const binding = maintenanceBinding();
  assert.equal(binding.schemaVersion, SKILL_EXECUTION_BINDING_SCHEMA_VERSION);
  assert.deepEqual(binding.skill, { id: 'maintenance', version: '1.0.0', domain: 'HOME_CARE' });
  assert.deepEqual(binding.operation, { id: 'MAINTENANCE_STATUS', version: '1.0' });
  assert.deepEqual(binding.adapter, { id: 'maintenance.status', version: '1.0' });
  assert.deepEqual(binding.contextProviders, [
    { id: 'maintenance.task-context', version: '1.0.0', required: true },
    { id: 'property.identity-context', version: '1.0.0', required: true },
    { id: 'property.journey-context', version: '1.0.0', required: false },
  ]);
  assert.equal(binding.dependencyActivation.status, 'RESOLVED');
  assert.deepEqual(binding.dependencyActivation.dependencies, [
    {
      type: 'CONTEXT_PROVIDER', id: 'maintenance.task-context', requestedVersion: '1.0.0', resolvedVersion: '1.0.0', required: true, owner: 'PropertyMaintenanceTaskService',
    },
    {
      type: 'CONTEXT_PROVIDER', id: 'property.identity-context', requestedVersion: '1.0.0', resolvedVersion: '1.0.0', required: true, owner: 'Living Home Record / Property',
    },
    {
      type: 'CONTEXT_PROVIDER', id: 'property.journey-context', requestedVersion: '1.0.0', resolvedVersion: '1.0.0', required: false, owner: 'PropertyOnboarding / Entry Context',
    },
  ]);
  assert.deepEqual(binding.dependencyActivation.missing, []);
  assert.deepEqual(binding.routing.reasonCodes, ['ALIAS_MATCH', 'GOAL_MATCH']);
  assert.match(binding.effectivePolicyVersion, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(binding), true);
  assert.equal(Object.isFrozen(binding.contextProviders), true);
});

test('an unchanged immutable binding remains executable', () => {
  const validation = validateSkillExecutionBinding(maintenanceBinding());
  assert.equal(validation.valid, true);
});

test('Skill and operation version drift fail closed', () => {
  const binding = maintenanceBinding();
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, skill: { ...binding.skill, version: '2.0.0' } }),
    { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' },
  );
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, operation: { ...binding.operation, version: '2.0' } }),
    { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' },
  );
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, adapter: { id: 'property.summary', version: '1.0' } }),
    { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' },
  );
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, contextProviders: [] }),
    { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' },
  );
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, dependencyActivation: { ...binding.dependencyActivation, dependencies: [] } }),
    { valid: false, reasonCode: 'ASK_SKILL_DEPENDENCY_UNAVAILABLE' },
  );
});

test('effective policy drift has a distinct fail-closed reason', () => {
  const binding = maintenanceBinding();
  assert.deepEqual(
    validateSkillExecutionBinding({ ...binding, effectivePolicyVersion: '0'.repeat(64) }),
    { valid: false, reasonCode: 'ASK_SKILL_POLICY_MISMATCH' },
  );
});

test('Ask persists and rechecks bindings without a migration script', () => {
  const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(schema, /model AskExecution[\s\S]*skillId\s+String\?[\s\S]*skillBindingJson\s+Json\?/);
  assert.match(schema, /model AskConfirmationReceipt[\s\S]*effectivePolicyVersion\s+String\?[\s\S]*contextVersion\s+String\?/);
  assert.match(orchestrator, /const selectedSkillBinding = [\s\S]*buildSkillExecutionBinding/);
  assert.match(orchestrator, /skillBindingJson: selectedSkillBinding \? asInputJson\(selectedSkillBinding\)/);
  assert.match(orchestrator, /async function expireIfSkillBindingChanged/);
  assert.match(orchestrator, /if \(!execution\.skillId \|\| terminalStatus\(execution\.status\)\) return null/);
  assert.match(orchestrator, /actionParameters: execution\.parametersJson/);
  assert.match(orchestrator, /effectivePolicyVersion: pinnedBinding\?\.effectivePolicyVersion/);
});
