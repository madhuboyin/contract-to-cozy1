const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const {
  REGISTERED_SKILL_ADAPTER_REFS,
  SKILL_ADAPTER_DEFINITIONS,
  getSkillAdapter,
  getSkillAdapterForOperation,
  validateSkillAdapterDefinitions,
} = require('../../src/services/skills/adapters/skillAdapterRegistry.ts');
const { SKILL_DEFINITIONS, validateSkillDefinitions } = require('../../src/services/skills/skillRegistry.ts');

test('every represented Skill operation resolves to one registered immutable adapter', () => {
  assert.deepEqual(validateSkillAdapterDefinitions(), []);
  assert.deepEqual(validateSkillDefinitions(), []);
  assert.equal(Object.keys(SKILL_ADAPTER_DEFINITIONS).length, 30);
  for (const skill of Object.values(SKILL_DEFINITIONS)) {
    for (const operation of skill.operations) {
      const reference = skill.allowedAdapters.find((candidate) => candidate.id === getSkillAdapterForOperation(operation.operationId).id);
      assert.ok(reference, `${skill.id}:${operation.operationId} has no allowed adapter reference`);
      const adapter = getSkillAdapter(reference.id, reference.version);
      assert.ok(adapter, `${reference.id}@${reference.version} is not registered`);
      assert.ok(adapter.allowedOperations.includes(operation.operationId));
      assert.ok(adapter.canonicalOwner);
      assert.ok(adapter.inputContract);
      assert.equal(adapter.outputContract, 'ask.operation-result@1.0');
      assert.equal(Object.isFrozen(adapter), true);
      assert.ok(REGISTERED_SKILL_ADAPTER_REFS.has(`${adapter.id}@${adapter.version}`));
    }
  }
});

test('mutation adapters declare confirmation receipt idempotency while reads remain retry-safe', () => {
  const create = getSkillAdapter('maintenance.create', '1.0');
  assert.equal(create.effect, 'MUTATION_PREPARATION');
  assert.equal(create.retrySafety, 'CLAIM_GUARDED');
  assert.equal(create.idempotencyPolicy, 'CONFIRMATION_RECEIPT');

  const summary = getSkillAdapter('property.summary', '1.0');
  assert.equal(summary.effect, 'READ');
  assert.equal(summary.retrySafety, 'SAFE');
  assert.equal(summary.idempotencyPolicy, 'NOT_APPLICABLE');
});

test('adapter controls support independent feature and kill-switch behavior', () => {
  assert.equal(readAskOperationalControls({}).adapterEnabled('maintenance.status'), true);
  assert.equal(readAskOperationalControls({ ASK_ADAPTER_MAINTENANCE_STATUS_ENABLED: 'false' }).adapterEnabled('maintenance.status'), false);
  assert.equal(readAskOperationalControls({ ASK_ADAPTER_MAINTENANCE_STATUS_KILL_SWITCH: 'true' }).adapterEnabled('maintenance.status'), false);
  assert.equal(readAskOperationalControls({ ASK_ADAPTER_MAINTENANCE_STATUS_KILL_SWITCH: 'true' }).adapterEnabled('refinance.analysis'), true);
});

test('Skill validation rejects unregistered adapter versions even when the adapter ID matches', () => {
  const invalid = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      allowedAdapters: SKILL_DEFINITIONS.maintenance.allowedAdapters.map((adapter) =>
        adapter.id === 'maintenance.status' ? { ...adapter, version: '9.0' } : adapter),
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('unknown adapter maintenance.status@9.0')));
});

test('Skill validation rejects duplicate and unused adapter permissions', () => {
  const invalid = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      allowedAdapters: [
        ...SKILL_DEFINITIONS.maintenance.allowedAdapters,
        SKILL_DEFINITIONS.maintenance.allowedAdapters[0],
        { id: 'refinance.analysis', version: '1.0' },
      ],
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('duplicate allowed adapter maintenance.status@1.0')));
  assert.ok(issues.some((issue) => issue.includes('adapter refinance.analysis is not used by a declared operation')));
});

test('adapter registry validation rejects mismatched ownership, duplicate operations, and unsafe idempotency', () => {
  const base = getSkillAdapter('property.summary', '1.0');
  const invalid = {
    'wrong-key': {
      ...base,
      id: 'inventory.lookup',
      version: 'bad',
      allowedOperations: ['PROPERTY_SUMMARY'],
      effect: 'MUTATION_PREPARATION',
      idempotencyPolicy: 'NOT_APPLICABLE',
    },
    'duplicate@1.0': {
      ...base,
      id: 'duplicate',
      allowedOperations: ['PROPERTY_SUMMARY'],
    },
  };
  const issues = validateSkillAdapterDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('adapter key mismatch')));
  assert.ok(issues.some((issue) => issue.includes('invalid adapter identity or version')));
  assert.ok(issues.some((issue) => issue.includes('operation PROPERTY_SUMMARY declares adapter property.summary')));
  assert.ok(issues.some((issue) => issue.includes('operation PROPERTY_SUMMARY already mapped')));
  assert.ok(issues.some((issue) => issue.includes('mutation adapter lacks confirmation receipt policy')));
});

test('runtime checks adapter availability before context composition or dispatch and rechecks pending writes', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const runtimeCheck = orchestrator.indexOf('function skillRuntimeUnavailableReason(');
  const adapterCheck = orchestrator.indexOf("return 'ASK_SKILL_DEPENDENCY_UNAVAILABLE'", runtimeCheck);
  const coreStart = orchestrator.indexOf('async function executeOperationCore(');
  const coreRuntimeCheck = orchestrator.indexOf('skillRuntimeUnavailableReason(input.operation.operationId, controls)', coreStart);
  const compose = orchestrator.indexOf('composedContext = await composeSkillContext', coreStart);
  const dispatch = orchestrator.indexOf('dispatchOperationAdapter(input, composedContext, trace)', coreStart);
  assert.ok(adapterCheck > runtimeCheck);
  assert.ok(coreRuntimeCheck > coreStart && coreRuntimeCheck < compose);
  assert.ok(compose < dispatch);

  const captureStart = orchestrator.indexOf('export async function submitAskCapture(');
  const confirmationStart = orchestrator.indexOf('export async function confirmAskExecution(');
  assert.ok(orchestrator.indexOf('skillRuntimeUnavailableReason(registeredOperationId, controls)', captureStart) > captureStart);
  assert.ok(orchestrator.indexOf('skillRuntimeUnavailableReason(registeredOperationId, controls)', confirmationStart) > confirmationStart);
});

test('adapter telemetry distinguishes registered adapter time from Skill and context-provider time', () => {
  const metrics = readFileSync(resolve(__dirname, '../../src/lib/metrics.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(metrics, /name: 'ask_skill_adapter_executions_total'/);
  assert.match(metrics, /name: 'ask_skill_adapter_execution_duration_seconds'/);
  assert.match(metrics, /labelNames: \['adapter', 'adapter_version', 'operation', 'status'\]/);
  assert.match(orchestrator, /askSkillAdapterExecutionsTotal\.inc/);
  assert.match(orchestrator, /askSkillAdapterExecutionDurationSeconds\.observe/);
});
