const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { listDiscoverableSkills } = require('../../src/services/skills/skillCatalog.ts');
const { composeSkillContext } = require('../../src/services/skills/context/skillContextComposer.ts');
const { deriveSkillHealth, deriveSkillHealthForDefinition } = require('../../src/services/skills/skillHealth.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');
const { SKILL_DEFINITIONS } = require('../../src/services/skills/skillRegistry.ts');

test('registered Skills derive healthy state from enabled operation, adapter, and provider dependencies', () => {
  const controls = readAskOperationalControls({});
  for (const skillId of Object.keys(SKILL_DEFINITIONS)) {
    const health = deriveSkillHealth(skillId, 'ASK', controls);
    assert.equal(health.status, 'HEALTHY', skillId);
    assert.ok(health.operations.length > 0, skillId);
    assert.ok(health.operations.every((operation) => operation.status === 'HEALTHY'), skillId);
    assert.equal(Object.isFrozen(health), true);
  }
});

test('required provider failure degrades a multi-operation Skill and removes only the affected operation', () => {
  const controls = readAskOperationalControls({ ASK_CONTEXT_PROVIDER_MAINTENANCE_TASK_CONTEXT_KILL_SWITCH: 'true' });
  const health = deriveSkillHealth('maintenance', 'ASK', controls);
  assert.equal(health.status, 'DEGRADED');
  assert.ok(health.reasonCodes.includes('REQUIRED_CONTEXT_PROVIDER_UNAVAILABLE'));
  assert.equal(health.operations.find((operation) => operation.operationId === 'MAINTENANCE_STATUS').status, 'UNAVAILABLE');
  assert.equal(health.operations.find((operation) => operation.operationId === 'MAINTENANCE_TASK_CREATE').status, 'HEALTHY');

  const catalog = listDiscoverableSkills('ASK', controls).find((skill) => skill.id === 'maintenance');
  assert.equal(catalog.health, 'DEGRADED');
  assert.ok(!catalog.operations.some((operation) => operation.id === 'MAINTENANCE_STATUS'));
  assert.ok(catalog.operations.some((operation) => operation.id === 'MAINTENANCE_TASK_CREATE'));
});

test('adapter failure degrades or removes only operations that depend on that adapter', () => {
  const oneDisabled = readAskOperationalControls({ ASK_ADAPTER_PROPERTY_SUMMARY_KILL_SWITCH: 'true' });
  const degraded = deriveSkillHealth('property-record', 'ASK', oneDisabled);
  assert.equal(degraded.status, 'DEGRADED');
  assert.equal(degraded.operations.find((operation) => operation.operationId === 'PROPERTY_SUMMARY').status, 'UNAVAILABLE');
  assert.equal(degraded.operations.find((operation) => operation.operationId === 'INVENTORY_LOOKUP').status, 'HEALTHY');

  const allDisabled = readAskOperationalControls({
    ASK_ADAPTER_PROPERTY_SUMMARY_KILL_SWITCH: 'true',
    ASK_ADAPTER_INVENTORY_LOOKUP_KILL_SWITCH: 'true',
  });
  assert.equal(deriveSkillHealth('property-record', 'ASK', allDisabled).status, 'UNAVAILABLE');
  assert.equal(listDiscoverableSkills('ASK', allDisabled).some((skill) => skill.id === 'property-record'), false);
});

test('disabled, retired, and consumer-ineligible states remain distinct', () => {
  const disabled = deriveSkillHealth('refinance', 'ASK', readAskOperationalControls({ ASK_SKILL_REFINANCE_ENABLED: 'false' }));
  assert.equal(disabled.status, 'DISABLED');
  assert.deepEqual(disabled.reasonCodes, ['SKILL_DISABLED']);

  const consumerUnavailable = deriveSkillHealth('refinance', 'PROACTIVE', readAskOperationalControls({}));
  assert.equal(consumerUnavailable.status, 'UNAVAILABLE');
  assert.deepEqual(consumerUnavailable.reasonCodes, ['CONSUMER_NOT_ALLOWED']);

  const retired = deriveSkillHealthForDefinition({ ...SKILL_DEFINITIONS.refinance, lifecycleStatus: 'RETIRED' }, 'ASK');
  assert.equal(retired.status, 'UNAVAILABLE');
  assert.deepEqual(retired.reasonCodes, ['SKILL_RETIRED']);
});

test('optional provider failure produces degraded behavior without removing the operation', () => {
  const optionalRef = { id: 'optional.fixture', version: '1.0.0' };
  const fixture = {
    ...SKILL_DEFINITIONS['property-record'],
    operations: [{
      operationId: 'PROPERTY_SUMMARY', version: '1.0', optionalContextProviders: [optionalRef],
    }],
    optionalContextProviders: [optionalRef],
    consumerPolicy: [{ consumer: 'ASK', operations: ['PROPERTY_SUMMARY'] }],
  };
  const health = deriveSkillHealthForDefinition(fixture, 'ASK');
  assert.equal(health.status, 'DEGRADED');
  assert.equal(health.operations[0].status, 'DEGRADED');
  assert.deepEqual(health.reasonCodes, ['OPTIONAL_CONTEXT_PROVIDER_UNAVAILABLE']);
});

test('routing filters operation, adapter, and provider failures before selection', () => {
  const inventoryMessage = 'Show my appliance inventory';
  const inventoryControls = readAskOperationalControls({ ASK_ADAPTER_INVENTORY_LOOKUP_KILL_SWITCH: 'true' });
  const inventory = resolveHierarchicalSkillRouting(inventoryMessage, resolveAskRoutingCascade(inventoryMessage), {
    consumer: 'ASK',
    skillEnabled: inventoryControls.skillEnabled,
    operationEnabled: inventoryControls.operationEnabled,
    adapterEnabled: inventoryControls.adapterEnabled,
    contextProviderEnabled: inventoryControls.contextProviderEnabled,
  });
  assert.equal(inventory.outcome, 'UNAVAILABLE');

  const maintenanceMessage = 'What maintenance is overdue?';
  const maintenanceControls = readAskOperationalControls({ ASK_CONTEXT_PROVIDER_MAINTENANCE_TASK_CONTEXT_ENABLED: 'false' });
  const maintenance = resolveHierarchicalSkillRouting(maintenanceMessage, resolveAskRoutingCascade(maintenanceMessage), {
    consumer: 'ASK',
    skillEnabled: maintenanceControls.skillEnabled,
    operationEnabled: maintenanceControls.operationEnabled,
    adapterEnabled: maintenanceControls.adapterEnabled,
    contextProviderEnabled: maintenanceControls.contextProviderEnabled,
  });
  assert.equal(maintenance.outcome, 'UNAVAILABLE');
});

test('composer rejects a disabled provider before authorization or provider access', async () => {
  let authorizationCalls = 0;
  let providerCalls = 0;
  const result = await composeSkillContext({
    skill: SKILL_DEFINITIONS.maintenance,
    operationId: 'MAINTENANCE_STATUS',
    userId: 'user-1',
    propertyId: 'property-1',
  }, {
    providerEnabled: () => false,
    authorizeProperty: async () => {
      authorizationCalls += 1;
      return { propertyId: 'property-1', role: 'VIEWER' };
    },
    resolveProvider: () => ({
      id: 'maintenance.task-context', version: '1.0.0', canonicalOwner: 'Fixture', description: 'Fixture',
      minimumRole: 'VIEWER', sensitivity: 'STANDARD', defaultTimeoutMs: 100, maxSerializedBytes: 100,
      supportedOperations: ['MAINTENANCE_STATUS'],
      load: async () => { providerCalls += 1; return { status: 'AVAILABLE', data: {} }; },
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.entries[0].status, 'UNAVAILABLE');
  assert.equal(authorizationCalls, 0);
  assert.equal(providerCalls, 0);
});

test('Ask passes provider controls into composition and health controls into routing', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(orchestrator, /composeSkillContext\([\s\S]*providerEnabled: controls\.contextProviderEnabled/);
  assert.match(orchestrator, /resolveHierarchicalSkillRouting\([\s\S]*contextProviderEnabled: controls\.contextProviderEnabled/);
});
