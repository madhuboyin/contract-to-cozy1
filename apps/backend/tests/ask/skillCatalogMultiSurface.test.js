const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { listDiscoverableSkills } = require('../../src/services/skills/skillCatalog.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');
const {
  SKILL_DEFINITIONS,
  getSkillForOperation,
  resolveEffectiveSkillOperationPolicy,
  validateSkillDefinitions,
} = require('../../src/services/skills/skillRegistry.ts');

function catalogSkill(consumer, skillId, controls = {}) {
  return listDiscoverableSkills(consumer, controls).find((skill) => skill.id === skillId);
}

test('the full representative taxonomy is registered and validates without semantic conflicts', () => {
  assert.equal(Object.keys(SKILL_DEFINITIONS).length, 20);
  assert.deepEqual(validateSkillDefinitions(), []);
  assert.equal(getSkillForOperation('PROPERTY_SUMMARY').id, 'property-record');
  assert.equal(getSkillForOperation('INVENTORY_LOOKUP').id, 'property-record');
});

test('Property Record deterministic operations resolve through generic Skill ownership', () => {
  for (const [message, operationId] of [
    ['What do you know about my home?', 'PROPERTY_SUMMARY'],
    ['Show my appliance inventory', 'INVENTORY_LOOKUP'],
  ]) {
    const result = resolveHierarchicalSkillRouting(message, resolveAskRoutingCascade(message));
    assert.equal(result.outcome, 'RESOLVED', message);
    assert.equal(result.path, 'OPERATION_OWNERSHIP', message);
    assert.equal(result.selectedSkill.id, 'property-record', message);
    assert.equal(result.selectedOperationId, operationId, message);
  }
});

test('consumer-specific discovery returns only explicitly permitted operations', () => {
  const ask = catalogSkill('ASK', 'property-record');
  const concierge = catalogSkill('CONCIERGE_HOME', 'property-record');
  const homeActions = catalogSkill('HOME_ACTIONS', 'property-record');
  const proactive = catalogSkill('PROACTIVE', 'property-record');

  assert.deepEqual(ask.operations.map(({ id }) => id), ['HOME_CHANGE_SUMMARY', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY']);
  assert.deepEqual(concierge.operations.map(({ id }) => id), ['HOME_CHANGE_SUMMARY', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY']);
  assert.deepEqual(homeActions.operations.map(({ id }) => id), ['PROPERTY_SUMMARY']);
  assert.equal(proactive, undefined);
  assert.equal(resolveEffectiveSkillOperationPolicy('property-record', 'INVENTORY_LOOKUP', 'HOME_ACTIONS'), null);
});

test('deterministic operation routing enforces the selected operation consumer allowlist', () => {
  const inventoryMessage = 'Show my appliance inventory';
  const inventoryDecision = resolveAskRoutingCascade(inventoryMessage);
  const denied = resolveHierarchicalSkillRouting(inventoryMessage, inventoryDecision, { consumer: 'HOME_ACTIONS' });
  assert.equal(denied.outcome, 'UNAVAILABLE');
  assert.equal(denied.selectedSkill, null);
  assert.equal(denied.selectedOperationId, 'INVENTORY_LOOKUP');

  const summaryMessage = 'What do you know about my home?';
  const allowed = resolveHierarchicalSkillRouting(summaryMessage, resolveAskRoutingCascade(summaryMessage), { consumer: 'HOME_ACTIONS' });
  assert.equal(allowed.outcome, 'RESOLVED');
  assert.equal(allowed.selectedSkill.id, 'property-record');
  assert.equal(allowed.selectedOperationId, 'PROPERTY_SUMMARY');
});

test('catalog projection applies Skill and operation controls independently', () => {
  const killed = readAskOperationalControls({ ASK_SKILL_PROPERTY_RECORD_KILL_SWITCH: 'true' });
  assert.equal(catalogSkill('ASK', 'property-record', killed), undefined);

  const inventoryDisabled = readAskOperationalControls({ ASK_OPERATION_INVENTORY_LOOKUP_ENABLED: 'false' });
  assert.deepEqual(
    catalogSkill('ASK', 'property-record', inventoryDisabled).operations.map(({ id }) => id),
    ['HOME_CHANGE_SUMMARY', 'PROPERTY_SUMMARY'],
  );

  const homeActionsSummaryDisabled = readAskOperationalControls({ ASK_OPERATION_PROPERTY_SUMMARY_ENABLED: 'false' });
  assert.equal(catalogSkill('HOME_ACTIONS', 'property-record', homeActionsSummaryDisabled), undefined);
});

test('Skill discovery remains separate from Capability Registry destinations and internal adapter policy', () => {
  const projected = catalogSkill('CONCIERGE_HOME', 'property-record');
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /href|route|capabilityId|adapter|contextProvider|killSwitch|featureFlag/);
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.operations), true);
});

test('adding Property Record required no capability-specific router or orchestrator branch', () => {
  const router = readFileSync(resolve(__dirname, '../../src/services/skills/skillRouter.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.doesNotMatch(router, /propertyRecord|PROPERTY_RECORD/);
  assert.doesNotMatch(orchestrator, /skills\/propertyRecord|case 'PROPERTY_RECORD/);
});

test('runtime validation rejects unknown, duplicate, empty, and repeated consumer policies', () => {
  const propertyRecord = SKILL_DEFINITIONS['property-record'];
  const invalid = {
    'property-record': {
      ...propertyRecord,
      consumerPolicy: [
        { consumer: 'UNREGISTERED_SURFACE', operations: ['PROPERTY_SUMMARY'] },
        { consumer: 'ASK', operations: [] },
        { consumer: 'ASK', operations: ['PROPERTY_SUMMARY', 'PROPERTY_SUMMARY'] },
      ],
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('unknown consumer UNREGISTERED_SURFACE')));
  assert.ok(issues.some((issue) => issue.includes('duplicate consumer policy ASK')));
  assert.ok(issues.some((issue) => issue.includes('consumer ASK has no operations')));
  assert.ok(issues.some((issue) => issue.includes('consumer ASK duplicates operation PROPERTY_SUMMARY')));
});
