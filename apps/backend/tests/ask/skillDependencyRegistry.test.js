const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { SKILL_DEFINITIONS, validateSkillDefinitions } = require('../../src/services/skills/skillRegistry.ts');
const {
  SKILL_DEPENDENCY_CONTRACTS,
  SKILL_DEPENDENCY_ACTIVATIONS,
  resolveSkillDependencies,
  skillDependencyContractKey,
  validateSkillDependencyRegistry,
} = require('../../src/services/skills/skillDependencyRegistry.ts');
const {
  isSupportedSkillDependencyVersionSpec,
  selectSkillDependencyVersion,
} = require('../../src/services/skills/skillDependencyVersion.ts');

test('dependency version selection is deterministic for exact and supported compatible ranges', () => {
  assert.equal(selectSkillDependencyVersion('1.1', ['2.0', '1.2', '1.1']), '1.1');
  assert.equal(selectSkillDependencyVersion('^1.0', ['1.0', '1.9', '2.0', '1.4']), '1.9');
  assert.equal(selectSkillDependencyVersion('^0.2.1', ['0.2.1', '0.2.9', '0.3.0']), '0.2.9');
  assert.equal(selectSkillDependencyVersion('^0.0.3', ['0.0.3', '0.0.4']), '0.0.3');
  assert.equal(selectSkillDependencyVersion('^2.0', ['1.9']), null);
  assert.equal(isSupportedSkillDependencyVersionSpec('>=1.0'), false);
  assert.equal(isSupportedSkillDependencyVersionSpec('*'), false);
});

test('every registered Skill resolves one immutable startup dependency set', () => {
  assert.deepEqual(validateSkillDependencyRegistry(), []);
  for (const skill of Object.values(SKILL_DEFINITIONS)) {
    const resolution = SKILL_DEPENDENCY_ACTIVATIONS[skill.id];
    assert.equal(resolution.status, 'RESOLVED', skill.id);
    assert.equal(resolution.dependencies.length, skill.dependencies.length, skill.id);
    assert.equal(Object.isFrozen(resolution), true);
    assert.equal(Object.isFrozen(resolution.dependencies), true);
  }
  assert.equal(Object.isFrozen(SKILL_DEPENDENCY_ACTIVATIONS), true);
});

test('compatible ranges select the highest registered version without broadening contract identity', () => {
  const extra = { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'property-record-overview', version: '1.2', owner: 'Property Record Overview' };
  const contracts = {
    ...SKILL_DEPENDENCY_CONTRACTS,
    [skillDependencyContractKey(extra)]: extra,
  };
  const skill = {
    ...SKILL_DEFINITIONS['property-record'],
    dependencies: SKILL_DEFINITIONS['property-record'].dependencies.map((dependency) => dependency.id === 'property-record-overview'
      ? { ...dependency, version: '^1.0' }
      : dependency),
  };
  const resolution = resolveSkillDependencies(skill, contracts);
  const selected = resolution.dependencies.find((dependency) => dependency.id === 'property-record-overview');
  assert.equal(selected.requestedVersion, '^1.0');
  assert.equal(selected.resolvedVersion, '1.2');
  assert.equal(selected.owner, 'Property Record Overview');
});

test('missing optional dependencies degrade while missing required dependencies block activation', () => {
  const dependency = { type: 'PRESENTATION_CAPABILITY', id: 'future-view', version: '1.0', required: false };
  const optional = { ...SKILL_DEFINITIONS.maintenance, dependencies: [...SKILL_DEFINITIONS.maintenance.dependencies, dependency] };
  const degraded = resolveSkillDependencies(optional);
  assert.equal(degraded.status, 'DEGRADED');
  assert.deepEqual(degraded.missing, [dependency]);

  const required = { ...optional, dependencies: [...SKILL_DEFINITIONS.maintenance.dependencies, { ...dependency, required: true }] };
  assert.equal(resolveSkillDependencies(required).status, 'UNAVAILABLE');
});

test('startup validation rejects unsupported ranges, unresolved required contracts, and malformed catalog keys', () => {
  const invalid = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      dependencies: [{ type: 'CANONICAL_SERVICE_CAPABILITY', id: 'missing-service', version: '>=1.0', required: true }],
    },
  };
  const issues = validateSkillDependencyRegistry(invalid);
  assert.ok(issues.some((issue) => issue.includes('unsupported dependency version specification')));
  assert.ok(issues.some((issue) => issue.includes('unresolved required dependency')));

  const contract = { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'known', version: '1.0', owner: 'Owner' };
  assert.ok(validateSkillDependencyRegistry({}, { wrong: contract })
    .some((issue) => issue.includes('dependency contract key mismatch')));

  const duplicate = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      dependencies: [
        { type: 'OPERATION_CONTRACT', id: 'MAINTENANCE_STATUS', version: '1.0', required: true },
        { type: 'OPERATION_CONTRACT', id: 'MAINTENANCE_STATUS', version: '^1.0', required: true },
      ],
    },
  };
  assert.ok(validateSkillDependencyRegistry(duplicate).some((issue) => issue.includes('duplicate dependency identity')));
});

test('manifest validation accepts supported ranges but continues to reject incompatible dependencies', () => {
  const compatible = {
    ...SKILL_DEFINITIONS,
    refinance: {
      ...SKILL_DEFINITIONS.refinance,
      dependencies: SKILL_DEFINITIONS.refinance.dependencies.map((dependency) => dependency.type === 'OPERATION_CONTRACT'
        ? { ...dependency, version: '^1.0' }
        : dependency),
    },
  };
  assert.equal(validateSkillDefinitions(compatible).some((issue) => issue.includes('incompatible operation dependency')), false);

  const incompatible = {
    ...compatible,
    refinance: {
      ...compatible.refinance,
      dependencies: [{ type: 'OPERATION_CONTRACT', id: 'REFINANCE_ANALYSIS', version: '^2.0', required: true }],
    },
  };
  assert.ok(validateSkillDefinitions(incompatible).some((issue) => issue.includes('incompatible operation dependency')));
});

test('application startup validates deterministic dependency activation', () => {
  const index = readFileSync(resolve(__dirname, '../../src/index.ts'), 'utf8');
  assert.match(index, /validateSkillDependencyRegistry\(\)/);
});
