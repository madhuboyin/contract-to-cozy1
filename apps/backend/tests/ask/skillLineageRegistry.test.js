const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { SKILL_DEFINITIONS, getSkillDefinition } = require('../../src/services/skills/skillRegistry.ts');
const {
  SKILL_LINEAGE_REGISTRY,
  buildSkillLineageRegistry,
  getSkillLineageMetadata,
  skillLineageKey,
  validateSkillLineageRegistry,
} = require('../../src/services/skills/skillLineageRegistry.ts');

function retiredMaintenance(overrides = {}) {
  return {
    id: 'maintenance',
    version: '0.9.0',
    domain: 'HOME_CARE',
    displayName: 'Maintenance',
    owner: 'Homeowner Product / Home Care',
    lifecycleStatus: 'RETIRED',
    operations: [{ id: 'MAINTENANCE_STATUS', version: '1.0' }],
    supersededByVersion: '1.0.0',
    ...overrides,
  };
}

test('current Skill versions are projected into immutable minimized lineage', () => {
  assert.deepEqual(validateSkillLineageRegistry(), []);
  assert.equal(Object.keys(SKILL_LINEAGE_REGISTRY).length, Object.keys(SKILL_DEFINITIONS).length);
  const maintenance = getSkillLineageMetadata('maintenance', '1.0.0');
  assert.deepEqual(maintenance, {
    id: 'maintenance', version: '1.0.0', domain: 'HOME_CARE', displayName: 'Maintenance',
    owner: 'Homeowner Product / Home Care', lifecycleStatus: 'DEVELOPMENT',
    operations: [
      { id: 'MAINTENANCE_STATUS', version: '1.0' },
      { id: 'MAINTENANCE_TASK_CREATE', version: '1.0' },
      { id: 'MAINTENANCE_TASK_COMPLETE', version: '1.0' },
      { id: 'MAINTENANCE_TASK_UPDATE', version: '1.0' },
      { id: 'HOME_DEADLINE_MONITOR', version: '1.0' },
    ],
    supersededByVersion: null,
  });
  assert.equal(Object.isFrozen(maintenance), true);
  assert.equal(Object.isFrozen(maintenance.operations), true);
  assert.equal('allowedAdapters' in maintenance, false);
  assert.equal('consumerPolicy' in maintenance, false);
});

test('a retired version remains exactly resolvable but never enters executable registry lookup', () => {
  const retired = retiredMaintenance();
  const registry = buildSkillLineageRegistry(SKILL_DEFINITIONS, [retired]);
  const resolved = registry[skillLineageKey(retired)];
  assert.equal(resolved.lifecycleStatus, 'RETIRED');
  assert.equal(resolved.supersededByVersion, '1.0.0');
  assert.equal(Object.isFrozen(resolved.operations[0]), true);
  assert.equal(getSkillDefinition('maintenance').version, '1.0.0');
  assert.equal(getSkillDefinition('maintenance@0.9.0'), undefined);
});

test('lineage validation rejects duplicate, executable, invalid, and orphaned historical metadata', () => {
  assert.ok(validateSkillLineageRegistry(SKILL_DEFINITIONS, [retiredMaintenance(), retiredMaintenance()])
    .some((issue) => issue.includes('duplicate Skill lineage version')));
  assert.ok(validateSkillLineageRegistry(SKILL_DEFINITIONS, [retiredMaintenance({ lifecycleStatus: 'ACTIVE' })])
    .some((issue) => issue.includes('must be deprecated or retired')));
  assert.ok(validateSkillLineageRegistry(SKILL_DEFINITIONS, [retiredMaintenance({ version: 'old' })])
    .some((issue) => issue.includes('invalid Skill semantic version')));
  assert.ok(validateSkillLineageRegistry(SKILL_DEFINITIONS, [retiredMaintenance({ supersededByVersion: '2.0.0' })])
    .some((issue) => issue.includes('superseding version 2.0.0 is not registered')));
  assert.ok(validateSkillLineageRegistry(SKILL_DEFINITIONS, [retiredMaintenance({ supersededByVersion: '0.9.0' })])
    .some((issue) => issue.includes('cannot supersede itself')));
});

test('saved Ask responses resolve exact lineage before any current operation-owner fallback', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const mapperStart = orchestrator.indexOf('function mapPersistedExecution(');
  const mapperEnd = orchestrator.indexOf('\nasync function withAskTimeout', mapperStart);
  const mapper = orchestrator.slice(mapperStart, mapperEnd);
  assert.match(mapper, /getSkillLineageMetadata\(execution\.skillId, execution\.skillVersion\)/);
  assert.match(mapper, /historicalSkill\?\.domain \?\? 'UNKNOWN'/);
  assert.ok(mapper.indexOf('historicalSkill') < mapper.indexOf(': currentSkill'));
});

test('startup validates lineage while execution binding remains current-registry-only', () => {
  const index = readFileSync(resolve(__dirname, '../../src/index.ts'), 'utf8');
  const binding = readFileSync(resolve(__dirname, '../../src/services/skills/skillExecutionBinding.ts'), 'utf8');
  assert.match(index, /validateSkillLineageRegistry\(\)/);
  assert.doesNotMatch(binding, /skillLineageRegistry|getSkillLineageMetadata/);
});
