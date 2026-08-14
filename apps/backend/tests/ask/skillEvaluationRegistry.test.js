const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const {
  SKILL_EVALUATION_PACKAGES,
  validateSkillEvaluationPackages,
} = require('../../src/services/skills/skillEvaluationRegistry.ts');
const { resolveEffectiveSkillOperationPolicy, SKILL_DEFINITIONS } = require('../../src/services/skills/skillRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

test('every registered Skill resolves a complete immutable evaluation package', () => {
  assert.deepEqual(validateSkillEvaluationPackages(), []);
  assert.equal(Object.keys(SKILL_EVALUATION_PACKAGES).length, Object.keys(SKILL_DEFINITIONS).length);
  for (const skill of Object.values(SKILL_DEFINITIONS)) {
    const suite = SKILL_EVALUATION_PACKAGES[skill.evaluationSuite];
    assert.ok(suite, skill.id);
    assert.equal(suite.skillId, skill.id);
    assert.equal(suite.skillVersion, skill.version);
    assert.equal(Object.isFrozen(suite), true);
    assert.equal(Object.isFrozen(suite.routingCases), true);
    assert.equal(Object.isFrozen(suite.routingCases[0]), true);
    assert.deepEqual(new Set(suite.routingCases.map(({ mode }) => mode)), new Set(['EXACT', 'PARAPHRASED', 'COLLOQUIAL', 'MISSPELLED']));
    assert.deepEqual(new Set(suite.contextCases.map(({ state }) => state)), new Set(['KNOWN', 'MISSING', 'STALE', 'CONFLICTING', 'UNAUTHORIZED', 'UNAVAILABLE']));
    assert.deepEqual(new Set(suite.operationCases.map(({ operationId }) => operationId)), new Set(skill.operations.map(({ operationId }) => operationId)));
    assert.deepEqual(new Set(suite.resolutionAmbiguityCases.map(({ kind }) => kind)), new Set(['ENTITY', 'PROPERTY', 'DECISION_THREAD']));
    assert.ok(suite.exclusionCases.length);
    assert.ok(suite.expectedStatuses.length);
    assert.deepEqual(new Set(suite.expectedBlockTypes), new Set(skill.allowedResultBlocks));
    assert.deepEqual(suite.expectedCanonicalCalls, suite.expectedAdapters);
    assert.deepEqual(suite.prohibitedCanonicalCalls, suite.prohibitedAdapters);
    assert.ok(suite.continuationCase.message);
  }
});

test('registered routing and model-disabled fixtures resolve without model assistance', () => {
  for (const suite of Object.values(SKILL_EVALUATION_PACKAGES)) {
    for (const fixture of [...suite.routingCases, { mode: 'MODEL_DISABLED', ...suite.modelDisabledCase }]) {
      const operationDecision = resolveAskRoutingCascade(fixture.message, { localRoutingEnabled: true });
      const decision = resolveHierarchicalSkillRouting(fixture.message, operationDecision);
      assert.notEqual(operationDecision.stage, 'REMOTE_FALLBACK', `${suite.skillId}: ${fixture.message}`);
      assert.equal(decision.outcome, 'RESOLVED', `${suite.skillId}: ${fixture.message}`);
      assert.equal(decision.selectedSkill.id, suite.skillId, fixture.message);
      assert.equal(decision.selectedOperationId, fixture.expectedOperationId, fixture.message);
    }
  }
});

test('policy and adapter fixtures stay aligned with machine-authoritative manifests', () => {
  for (const suite of Object.values(SKILL_EVALUATION_PACKAGES)) {
    for (const fixture of suite.policyCases) {
      assert.equal(Boolean(resolveEffectiveSkillOperationPolicy(suite.skillId, fixture.operationId, fixture.consumer)), fixture.allowed);
    }
    for (const fixture of suite.operationCases) {
      const policy = resolveEffectiveSkillOperationPolicy(suite.skillId, fixture.operationId, 'ASK');
      assert.ok(policy);
      assert.equal(policy.adapterKey, fixture.expectedAdapter.id);
    }
  }
});

test('validation rejects missing, stale, incomplete, and unbounded evaluation packages', () => {
  const maintenance = SKILL_EVALUATION_PACKAGES['skill-maintenance-golden'];
  const withoutMaintenance = { ...SKILL_EVALUATION_PACKAGES };
  delete withoutMaintenance['skill-maintenance-golden'];
  assert.ok(validateSkillEvaluationPackages(SKILL_DEFINITIONS, withoutMaintenance).some((issue) => issue.includes('missing evaluation package')));

  const invalid = {
    ...SKILL_EVALUATION_PACKAGES,
    'skill-maintenance-golden': {
      ...maintenance,
      skillVersion: '9.0.0',
      contextCases: maintenance.contextCases.filter(({ state }) => state !== 'UNAUTHORIZED'),
      resolutionAmbiguityCases: maintenance.resolutionAmbiguityCases.filter(({ kind }) => kind !== 'PROPERTY'),
      exclusionCases: [],
      expectedAdapters: [],
      handoffCase: { ...maintenance.handoffCase, suggestedNextSkillId: 'missing-skill' },
      performanceCase: { ...maintenance.performanceCase, maxSkillCandidates: 100 },
    },
  };
  const issues = validateSkillEvaluationPackages(SKILL_DEFINITIONS, invalid);
  assert.ok(issues.some((issue) => issue.includes('identity mismatch')));
  assert.ok(issues.some((issue) => issue.includes('missing unauthorized context case')));
  assert.ok(issues.some((issue) => issue.includes('missing property ambiguity case')));
  assert.ok(issues.some((issue) => issue.includes('incomplete ambiguity, negative, exclusion')));
  assert.ok(issues.some((issue) => issue.includes('expected adapter coverage differs')));
  assert.ok(issues.some((issue) => issue.includes('handoff target missing-skill')));
  assert.ok(issues.some((issue) => issue.includes('unbounded performance fixture')));
});

test('application startup includes Skill evaluation package validation', () => {
  const startup = readFileSync(resolve(__dirname, '../../src/index.ts'), 'utf8');
  assert.match(startup, /import \{ validateSkillEvaluationPackages \}/);
  assert.match(startup, /\.\.\.validateSkillEvaluationPackages\(\)/);
});
