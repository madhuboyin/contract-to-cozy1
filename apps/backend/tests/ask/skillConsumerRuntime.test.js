const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const {
  invokeReadSkillOperationForConsumer,
  SkillConsumerRuntimeError,
} = require('../../src/services/skills/skillConsumerRuntime.ts');
const { SKILL_DEFINITIONS, validateSkillDefinitions } = require('../../src/services/skills/skillRegistry.ts');

test('a real non-Ask consumer invokes an allowed canonical read through the Skill runtime', async () => {
  let executions = 0;
  const result = await invokeReadSkillOperationForConsumer({
    consumer: 'HOME_ACTIONS',
    operationId: 'PROPERTY_SUMMARY',
    role: 'VIEWER',
    execute: async () => { executions += 1; return { source: 'canonical-property-read' }; },
  });

  assert.deepEqual(result, { source: 'canonical-property-read' });
  assert.equal(executions, 1);
});

test('consumer policy is enforced before the canonical read runs', async () => {
  let executions = 0;
  await assert.rejects(
    invokeReadSkillOperationForConsumer({
      consumer: 'HOME_ACTIONS',
      operationId: 'INVENTORY_LOOKUP',
      role: 'VIEWER',
      execute: async () => { executions += 1; return {}; },
    }),
    (error) => error instanceof SkillConsumerRuntimeError && error.code === 'ASK_SKILL_POLICY_MISMATCH',
  );
  assert.equal(executions, 0);
});

test('consumer and domain kill switches fail closed before canonical execution', async () => {
  for (const controls of [
    readAskOperationalControls({ ASK_CONSUMER_HOME_ACTIONS_KILL_SWITCH: 'true' }),
    readAskOperationalControls({ ASK_DOMAIN_HOME_INTELLIGENCE_KILL_SWITCH: 'true' }),
  ]) {
    let executions = 0;
    await assert.rejects(
      invokeReadSkillOperationForConsumer({
        consumer: 'HOME_ACTIONS', operationId: 'PROPERTY_SUMMARY', role: 'VIEWER', controls,
        execute: async () => { executions += 1; return {}; },
      }),
      (error) => error instanceof SkillConsumerRuntimeError && error.code === 'ASK_SKILL_DISABLED',
    );
    assert.equal(executions, 0);
  }
});

test('runtime reads the manifest-declared Skill controls and validation rejects unsafe declarations', () => {
  const controlsSource = readFileSync(resolve(__dirname, '../../src/config/askOperationalControls.ts'), 'utf8');
  assert.match(controlsSource, /env\[skill\.featureFlag\]/);
  assert.match(controlsSource, /env\[skill\.killSwitch\]/);

  const malformed = {
    'property-record': {
      ...SKILL_DEFINITIONS['property-record'],
      featureFlag: 'arbitrary-flag',
      killSwitch: 'arbitrary-switch',
    },
  };
  const malformedIssues = validateSkillDefinitions(malformed);
  assert.ok(malformedIssues.some((issue) => issue.includes('invalid feature flag')));
  assert.ok(malformedIssues.some((issue) => issue.includes('invalid kill switch')));

  const duplicate = {
    maintenance: SKILL_DEFINITIONS.maintenance,
    'property-record': {
      ...SKILL_DEFINITIONS['property-record'],
      featureFlag: SKILL_DEFINITIONS.maintenance.featureFlag,
    },
  };
  assert.ok(validateSkillDefinitions(duplicate).some((issue) => issue.includes('already belongs to maintenance')));
});

test('live Property Dashboard and Unified Home paths use explicit non-Ask consumers', () => {
  const propertyController = readFileSync(resolve(__dirname, '../../src/controllers/property.controller.ts'), 'utf8');
  const homeActions = readFileSync(resolve(__dirname, '../../src/services/homeActions.service.ts'), 'utf8');
  assert.match(propertyController, /getPropertyRecordOverview\(id, userId, 'CONCIERGE_HOME'\)/);
  assert.match(homeActions, /consumer: 'HOME_ACTIONS'[\s\S]{0,120}operationId: 'PROPERTY_SUMMARY'/);
});
