const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const {
  SKILL_DEFINITIONS,
  getSkillForOperation,
  resolveEffectiveSkillOperationPolicy,
  validateSkillDefinitions,
} = require('../../src/services/skills/skillRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

const repairReplaceOperations = [
  'REPLACEMENT_GUIDANCE',
  'HVAC_DECISION_START',
  'HVAC_DECISION_CONTINUE',
  'HVAC_DECISION_SCENARIO',
  'HVAC_DECISION_ABANDON',
  'HVAC_PREFERENCE_SAVE',
  'HVAC_PREFERENCE_FORGET',
  'HVAC_DECISION_OUTCOME_REPORT',
  'HVAC_DECISION_OUTCOME_VIEW',
  'HVAC_DECISION_OUTCOME_UNLINK',
];

test('SP4 registers Repair or Replace and Refinance as valid immutable Skills', () => {
  assert.deepEqual(validateSkillDefinitions(), []);
  assert.deepEqual(SKILL_DEFINITIONS['repair-replace'].operations.map(({ operationId }) => operationId), repairReplaceOperations);
  assert.deepEqual(SKILL_DEFINITIONS.refinance.operations.map(({ operationId }) => operationId), [
    'REFINANCE_ANALYSIS',
    'REFINANCE_RATE_MONITOR',
  ]);
  for (const operationId of repairReplaceOperations) assert.equal(getSkillForOperation(operationId).id, 'repair-replace');
  assert.equal(getSkillForOperation('REFINANCE_ANALYSIS').id, 'refinance');
  assert.equal(getSkillForOperation('REFINANCE_RATE_MONITOR').id, 'refinance');
});

test('deterministic routing binds decision and finance operations to their owning Skills', () => {
  const fixtures = [
    ['Should I repair or replace my furnace?', 'HVAC_DECISION_START', 'repair-replace'],
    ['Should I repair or replace my refrigerator?', 'REPLACEMENT_GUIDANCE', 'repair-replace'],
    ['Should I refinance now?', 'REFINANCE_ANALYSIS', 'refinance'],
    ['Alert me when mortgage rates drop below 5 percent', 'REFINANCE_RATE_MONITOR', 'refinance'],
  ];
  for (const [message, operationId, skillId] of fixtures) {
    const operationDecision = resolveAskRoutingCascade(message);
    const result = resolveHierarchicalSkillRouting(message, operationDecision);
    assert.equal(result.outcome, 'RESOLVED', message);
    assert.equal(result.path, 'OPERATION_OWNERSHIP', message);
    assert.equal(result.selectedOperationId, operationId, message);
    assert.equal(result.selectedSkill.id, skillId, message);
  }
});

test('effective policy retains Viewer reads and Contributor material writes', () => {
  assert.equal(resolveEffectiveSkillOperationPolicy('repair-replace', 'HVAC_DECISION_CONTINUE', 'ASK').authorizationFloor, 'VIEWER');
  assert.equal(resolveEffectiveSkillOperationPolicy('repair-replace', 'HVAC_DECISION_START', 'ASK').authorizationFloor, 'CONTRIBUTOR');
  assert.equal(resolveEffectiveSkillOperationPolicy('repair-replace', 'HVAC_DECISION_SCENARIO', 'ASK').authorizationFloor, 'CONTRIBUTOR');
  assert.equal(resolveEffectiveSkillOperationPolicy('refinance', 'REFINANCE_ANALYSIS', 'ASK').authorizationFloor, 'VIEWER');
  assert.equal(resolveEffectiveSkillOperationPolicy('refinance', 'REFINANCE_RATE_MONITOR', 'ASK').authorizationFloor, 'CONTRIBUTOR');
  assert.equal(resolveEffectiveSkillOperationPolicy('refinance', 'REFINANCE_ANALYSIS', 'PROACTIVE'), null);
});

test('each SP4 Skill can be disabled independently without disabling its operations or peers', () => {
  const repairDisabled = readAskOperationalControls({ ASK_SKILL_REPAIR_REPLACE_KILL_SWITCH: 'true' });
  assert.equal(repairDisabled.skillEnabled('repair-replace'), false);
  assert.equal(repairDisabled.skillEnabled('refinance'), true);
  assert.equal(repairDisabled.operationEnabled('HVAC_DECISION_START'), true);

  const refinanceDisabled = readAskOperationalControls({ ASK_SKILL_REFINANCE_ENABLED: 'false' });
  assert.equal(refinanceDisabled.skillEnabled('refinance'), false);
  assert.equal(refinanceDisabled.skillEnabled('repair-replace'), true);
  assert.equal(refinanceDisabled.operationEnabled('REFINANCE_ANALYSIS'), true);
});

test('SP4 manifests preserve canonical service and Decision Platform boundaries', () => {
  const repairManifest = SKILL_DEFINITIONS['repair-replace'];
  const refinanceManifest = SKILL_DEFINITIONS.refinance;
  assert.ok(repairManifest.dependencies.some((dependency) => dependency.id === 'decision-platform-hvac-repair-replace'));
  assert.ok(repairManifest.dependencies.some((dependency) => dependency.id === 'inventory-repair-replace-analysis'));
  assert.ok(refinanceManifest.dependencies.some((dependency) => dependency.id === 'refinance-radar-analysis'));
  assert.ok(refinanceManifest.dependencies.some((dependency) => dependency.id === 'refinance-rate-monitor'));

  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(orchestrator, /replaceRepairService\.runItemAnalysis/);
  assert.match(orchestrator, /decisionThreadService\.createHvacDecisionThread/);
  assert.match(orchestrator, /decisionThreadService\.createHvacScenario/);
  assert.match(orchestrator, /refinanceRadarService\.evaluateProperty/);
  assert.match(orchestrator, /createOrUpdateRefinanceRateMonitor/);
});

test('machine validation rejects executable peer-Skill and incompatible operation dependencies', () => {
  const invalid = {
    ...SKILL_DEFINITIONS,
    refinance: {
      ...SKILL_DEFINITIONS.refinance,
      dependencies: [
        { type: 'OPERATION_CONTRACT', id: 'REFINANCE_ANALYSIS', version: '9.0', required: true },
        { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'repair-replace', version: '1.0.0', required: true },
      ],
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('incompatible operation dependency REFINANCE_ANALYSIS@9.0')));
  assert.ok(issues.some((issue) => issue.includes('executable Skill dependency repair-replace is prohibited')));
});
