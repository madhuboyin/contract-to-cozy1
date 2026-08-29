const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  AGENT_DEFINITION_REGISTRY,
  getAgentDefinition,
} = require('../../src/services/agents/agentDefinitionRegistry.ts');
const {
  AGENT_DEFINITION_DIGEST_BASELINE,
} = require('../../src/services/agents/agentDefinitionDigestBaseline.ts');
const {
  digestAgentDefinition,
  validateAgentDefinitionRegistry,
  validateReferencedAgentDefinitionVersions,
} = require('../../src/services/agents/agentRegistryValidation.ts');

const active = getAgentDefinition('hvac-repair-replace-specialist');

function registryWith(definition, activeVersion = definition.version) {
  return {
    [definition.agentId]: {
      activeVersion,
      versions: { [definition.version]: definition },
    },
  };
}

function validateDefinition(definition, dependencies = {}) {
  const key = `${definition.agentId}@${definition.version}`;
  return validateAgentDefinitionRegistry(registryWith(definition), {
    digestBaseline: { [key]: digestAgentDefinition(definition) },
    ...dependencies,
  });
}

test('the code-owned HVAC definition is immutable, DEV-only, and matches its digest baseline', () => {
  assert.ok(active);
  assert.equal(active.version, '1.0.0');
  assert.equal(active.releaseState, 'DEV');
  assert.equal(active.supportedDomains.includes('HVAC'), false);
  assert.equal(active.supportedDomains.includes('ASSET_LIFECYCLE'), true);
  assert.equal(Object.isFrozen(AGENT_DEFINITION_REGISTRY), true);
  assert.equal(Object.isFrozen(active), true);
  assert.equal(Object.isFrozen(active.allowedSkills), true);
  assert.equal(Object.isFrozen(active.allowedSkills[0].operations), true);
  assert.equal(digestAgentDefinition(active), AGENT_DEFINITION_DIGEST_BASELINE['hvac-repair-replace-specialist@1.0.0']);
  assert.deepEqual(validateAgentDefinitionRegistry(), []);
});

test('active version and immutable digest parity fail closed', () => {
  const missingActive = registryWith(active, '9.0.0');
  assert.ok(validateAgentDefinitionRegistry(missingActive).some((issue) => issue.includes('activeVersion 9.0.0 is not registered')));

  const changed = { ...active, responsibility: `${active.responsibility} Changed in place.` };
  assert.ok(validateAgentDefinitionRegistry(registryWith(changed)).some((issue) => issue.includes('canonical digest changed under an immutable version')));
});

test('missing Skill, operation, context, trigger, output, and evaluation references are rejected', () => {
  const missingSkill = { ...active, allowedSkills: [{ id: 'missing-skill', version: '1.0.0', operations: ['HVAC_DECISION_START'] }] };
  assert.ok(validateDefinition(missingSkill).some((issue) => issue.includes('missing Skill missing-skill@1.0.0')));

  const missingOperation = { ...active, allowedSkills: [{ ...active.allowedSkills[0], operations: ['PROPERTY_SUMMARY'] }] };
  assert.ok(validateDefinition(missingOperation).some((issue) => issue.includes('missing or incompatible operation PROPERTY_SUMMARY')));

  const missingContext = { ...active, requiredContext: ['NOT_A_SCOPE'] };
  assert.ok(validateDefinition(missingContext).some((issue) => issue.includes('unknown Property Context scope NOT_A_SCOPE')));

  assert.ok(validateDefinition(active, { triggerHandlers: {} }).some((issue) => issue.includes('missing trigger handler')));
  assert.ok(validateDefinition(active, { outputContracts: {} }).some((issue) => issue.includes('missing output contract')));
  assert.ok(validateDefinition(active, { evaluationSuites: {} }).some((issue) => issue.includes('missing evaluation suite')));
});

test('a pending evaluation contract cannot cross the DEV release boundary', () => {
  // PR 10 made the HOME_ACTION_ENGAGEMENT trigger handler AVAILABLE, so the
  // evaluation suite (gated by IPD-005) is now the only PENDING dependency
  // holding the definition at DEV.
  const promoted = { ...active, releaseState: 'EVAL_APPROVED' };
  const issues = validateDefinition(promoted);
  assert.ok(issues.some((issue) => issue.includes('evaluation suite') && issue.includes('permits only DEV')));

  const pendingTrigger = { ...active, releaseState: 'EVAL_APPROVED' };
  assert.ok(validateDefinition(pendingTrigger, {
    triggerHandlers: { 'agent.hvac.home-action-engagement@1.0.0': 'PENDING' },
  }).some((issue) => issue.includes('trigger handler') && issue.includes('permits only DEV')));
});

test('budget and autonomy ceilings are enforced', () => {
  const excessiveBudget = { ...active, budgets: { ...active.budgets, maxLoopIterations: 26 } };
  assert.ok(validateDefinition(excessiveBudget).some((issue) => issue.includes('invalid budget maxLoopIterations')));

  const weakSafety = { ...active, safetyLevel: 'RECOMMEND' };
  assert.ok(validateDefinition(weakSafety).some((issue) => issue.includes('autonomy level 2 requires DRAFT safety level')));
});

test('deployment readiness retains every referenced definition version', () => {
  assert.deepEqual(validateReferencedAgentDefinitionVersions([{
    agentId: active.agentId,
    version: active.version,
    source: 'PAUSED_STATE',
    sourceId: 'state-1',
  }]), []);
  assert.ok(validateReferencedAgentDefinitionVersions([{
    agentId: active.agentId,
    version: '0.9.0',
    source: 'NONTERMINAL_RUN',
    sourceId: 'run-1',
  }]).some((issue) => issue.includes('pinned definition hvac-repair-replace-specialist@0.9.0 is not registered')));
});

test('Prisma schema does not persist AgentDefinition', () => {
  const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /^model\s+AgentDefinition\s*\{/m);
});
