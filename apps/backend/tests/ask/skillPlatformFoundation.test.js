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
  assert.equal(getSkillForOperation('REFINANCE_ANALYSIS'), undefined);
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
  const skillCheck = orchestrator.indexOf("? 'ASK_SKILL_DISABLED' as const", confirmStart);
  const claimRead = orchestrator.indexOf('const previous = await prisma.askConfirmationReceipt.findUnique', confirmStart);
  assert.ok(skillCheck > confirmStart, 'confirmation-time Skill control was not found');
  assert.ok(claimRead > skillCheck, 'Skill control must run before reading or creating the mutation claim');
  const confirmationPrefix = orchestrator.slice(confirmStart, claimRead);
  assert.match(confirmationPrefix, /status: unavailable\.status/);
  assert.match(confirmationPrefix, /confirmation: null/);
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
