const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  SKILL_DEFINITIONS,
  getSkillDefinition,
  getSkillForOperation,
  resolveEffectiveSkillOperationPolicy,
  validateSkillDefinitions,
} = require('../../src/services/skills/skillRegistry.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { AskExecutionResponseSchema } = require('../../src/productFramework/ask/ask.contract.ts');

test('the static Skill registry validates and groups the existing Maintenance operations', () => {
  assert.deepEqual(validateSkillDefinitions(), []);
  const maintenance = getSkillDefinition('maintenance');
  assert.equal(maintenance, SKILL_DEFINITIONS.maintenance);
  assert.deepEqual(
    maintenance.operations.map(({ operationId }) => operationId),
    [
      'MAINTENANCE_STATUS',
      'MAINTENANCE_TASK_CREATE',
      'MAINTENANCE_TASK_COMPLETE',
      'MAINTENANCE_TASK_UPDATE',
      'HOME_DEADLINE_MONITOR',
    ],
  );
  assert.equal(getSkillForOperation('MAINTENANCE_STATUS').id, 'maintenance');
  assert.equal(getSkillForOperation('REFINANCE_ANALYSIS').id, 'refinance');
});

test('effective policy is the restrictive intersection of Skill, consumer, and operation policy', () => {
  const readPolicy = resolveEffectiveSkillOperationPolicy('maintenance', 'MAINTENANCE_STATUS', 'ASK');
  assert.equal(readPolicy.authorizationFloor, 'VIEWER');
  assert.equal(readPolicy.adapterKey, 'maintenance.status');
  assert.ok(readPolicy.allowedResultBlocks.includes('GROUPED_LIST'));

  const writePolicy = resolveEffectiveSkillOperationPolicy('maintenance', 'MAINTENANCE_TASK_CREATE', 'ASK');
  assert.equal(writePolicy.authorizationFloor, 'CONTRIBUTOR');
  assert.equal(writePolicy.adapterKey, 'maintenance.create');
  assert.equal(resolveEffectiveSkillOperationPolicy('maintenance', 'MAINTENANCE_STATUS', 'HOME_ACTIONS'), null);
  assert.equal(resolveEffectiveSkillOperationPolicy('maintenance', 'REFINANCE_ANALYSIS', 'ASK'), null);
});

test('Skill validation rejects incompatible and over-broad manifests', () => {
  const invalid = {
    maintenance: {
      ...SKILL_DEFINITIONS.maintenance,
      version: 'one',
      operations: [{ operationId: 'MAINTENANCE_STATUS', version: '9.0' }],
      allowedAdapters: [],
      allowedResultBlocks: ['SUMMARY'],
      contextBudget: { ...SKILL_DEFINITIONS.maintenance.contextBudget, maxSerializedBytes: 999_999 },
      consumerPolicy: [{ consumer: 'ASK', operations: ['REFINANCE_ANALYSIS'] }],
    },
  };
  const issues = validateSkillDefinitions(invalid);
  assert.ok(issues.some((issue) => issue.includes('invalid Skill semantic version')));
  assert.ok(issues.some((issue) => issue.includes('incompatible operation version')));
  assert.ok(issues.some((issue) => issue.includes('undeclared adapter')));
  assert.ok(issues.some((issue) => issue.includes('undeclared result block')));
  assert.ok(issues.some((issue) => issue.includes('invalid context budget maxSerializedBytes')));
  assert.ok(issues.some((issue) => issue.includes('references undeclared operation REFINANCE_ANALYSIS')));
});

test('Skill feature and kill-switch controls are independent of operation controls', () => {
  const enabled = readAskOperationalControls({});
  assert.equal(enabled.skillEnabled('maintenance'), true);

  const featureDisabled = readAskOperationalControls({ ASK_SKILL_MAINTENANCE_ENABLED: 'false' });
  assert.equal(featureDisabled.skillEnabled('maintenance'), false);

  const killed = readAskOperationalControls({ ASK_SKILL_MAINTENANCE_KILL_SWITCH: 'true' });
  assert.equal(killed.skillEnabled('maintenance'), false);
  assert.equal(killed.operationEnabled('MAINTENANCE_STATUS'), true);
});

test('disabling a Skill prevents a pending confirmation before its mutation claim', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const confirmStart = orchestrator.indexOf('export async function confirmAskExecution(');
  const skillCheck = orchestrator.indexOf('skillRuntimeUnavailableReason(registeredOperationId, controls)', confirmStart);
  const claimRead = orchestrator.indexOf('const previous = await prisma.askConfirmationReceipt.findUnique', confirmStart);
  assert.ok(skillCheck > confirmStart, 'confirmation-time Skill control was not found');
  assert.ok(claimRead > skillCheck, 'Skill control must run before reading or creating the mutation claim');
  const confirmationPrefix = orchestrator.slice(confirmStart, claimRead);
  assert.match(confirmationPrefix, /status: unavailable\.status/);
  assert.match(confirmationPrefix, /confirmation: null/);
});

test('disabling a Skill prevents inline capture before any canonical write or capture receipt', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const captureStart = orchestrator.indexOf('export async function submitAskCapture(');
  const skillCheck = orchestrator.indexOf('skillRuntimeUnavailableReason(registeredOperationId, controls)', captureStart);
  const receiptRead = orchestrator.indexOf('const previousCapture = await prisma.askCaptureReceipt.findUnique', captureStart);
  const firstCanonicalCapture = orchestrator.indexOf('await captureFeatureContext(', captureStart);
  const firstMaintenanceWrite = orchestrator.indexOf('await PropertyMaintenanceTaskService.updateTask(', captureStart);
  assert.ok(skillCheck > captureStart, 'capture-time Skill control was not found');
  assert.ok(receiptRead > skillCheck, 'Skill control must run before capture receipt handling');
  assert.ok(firstCanonicalCapture > skillCheck, 'Skill control must run before Property Context writes');
  assert.ok(firstMaintenanceWrite > skillCheck, 'Skill control must run before Maintenance writes');
});

test('Skill execution telemetry uses bounded registry identity and includes every invocation result', () => {
  const metrics = readFileSync(resolve(__dirname, '../../src/lib/metrics.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(metrics, /name: 'ask_skill_executions_total'/);
  assert.match(metrics, /labelNames: \['skill', 'skill_version', 'operation', 'status'\]/);
  assert.match(metrics, /name: 'ask_skill_execution_duration_seconds'/);
  assert.match(metrics, /name: 'ask_skill_routing_decisions_total'/);
  const executeStart = orchestrator.indexOf('async function executeOperation(');
  const executeEnd = orchestrator.indexOf('\nfunction captureFallbackHref(', executeStart);
  const executeFunction = orchestrator.slice(executeStart, executeEnd);
  assert.match(executeFunction, /getSkillForOperation\(input\.operation\.operationId\)/);
  assert.match(executeFunction, /askSkillExecutionsTotal\.inc/);
  assert.match(executeFunction, /askSkillExecutionDurationSeconds\.observe/);
});

test('routing lineage records Skill and operation versions without a database schema change', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  assert.match(orchestrator, /eventType: 'CAPABILITY_RESOLVED'/);
  assert.match(orchestrator, /skillId: routingDecision\.requiresClarification \? null : selectedSkill\?\.id \?\? null/);
  assert.match(orchestrator, /skillVersion: routingDecision\.requiresClarification \? null : selectedSkill\?\.version \?\? null/);
  assert.match(orchestrator, /operationVersion: routingDecision\.requiresClarification \? null : operation\.version/);
});

test('Ask responses expose optional Skill identity without breaking historical responses', () => {
  const base = {
    schemaVersion: '1.0',
    executionId: 'execution-1',
    sessionId: 'session-1',
    question: 'What maintenance is pending?',
    status: 'ANSWERED',
    property: { id: 'property-1', label: 'Home' },
    operation: { id: 'MAINTENANCE_STATUS', version: '1.0', family: 'RECORD_QUERY' },
    contextVersion: null,
    blocks: [],
    captureRequests: [],
    clarification: null,
    confirmation: null,
    suggestions: [],
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
  assert.equal(AskExecutionResponseSchema.parse(base).skill, null);
  const parsed = AskExecutionResponseSchema.parse({
    ...base,
    skill: { id: 'maintenance', version: '1.0.0', domain: 'HOME_CARE' },
  });
  assert.equal(parsed.skill.id, 'maintenance');
});
