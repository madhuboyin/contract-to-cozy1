const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// C2C Intelligence & Agentic Evolution Phase 3 / PR 12b (architecture §8 task 2,
// §22; plan §8). Locks in the acceptance criteria for routing an Ask "help me
// decide" question about a delivered HVAC Home Action to the Phase 2 Specialist
// Agent runtime -- without creating a second ranking path.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { getSkillAdapterForOperation } = require('../../src/services/skills/adapters/skillAdapterRegistry.ts');
const { HVAC_REPAIR_REPLACE_AGENT_DEFINITION } = require('../../src/services/agents/definitions/hvacRepairReplaceAgent.definition.ts');
const { hvacSpecialistEngageResult } = require('../../src/services/ask/askOrchestrator.service.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message).operation.operationId;
}

test('engagement with a delivered HVAC action routes to HVAC_SPECIALIST_ENGAGE', () => {
  for (const message of [
    'Help me decide on the flagged furnace repair-or-replace action',
    'Walk me through the HVAC decision from my home actions',
    'Talk me through the flagged heat pump repair-or-replace recommendation from my home actions',
    'Why are you recommending replacement?',
  ]) {
    assert.equal(routeOf(message), 'HVAC_SPECIALIST_ENGAGE', message);
  }
});

test('Ask executes the delivered action through one shared runtime identity and restores its canonical thread on retry', async () => {
  const runtimeCalls = [];
  let persisted = null;
  const projection = {
    runId: 'run-1', agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0',
    phase: 'RECOMMENDATION_READY', decisionThreadId: 'thread-1', currentRecommendationSnapshotId: 'snapshot-1',
    verdict: 'REPLACE', confidenceLabel: 'HIGH', outstanding: [], explanation: [], abstentionReason: null,
    paused: false, casVersion: null, expectedOperation: null,
  };
  const action = {
    id: 'action-1', lineageId: 'repair-replace:analysis-1', recommendedAction: 'Review the furnace decision', signal: 'HVAC review',
    presentation: { headline: 'Furnace repair or replace' },
    source: { entityId: 'analysis-1', version: '7' },
    decisionLineage: { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'inventory-1' },
  };
  const dependencies = {
    authorize: async () => ({ role: 'CONTRIBUTOR' }),
    loadHomeActionFeed: async () => ({ actions: [action] }),
    invokeRuntime: async (input) => {
      runtimeCalls.push(input);
      if (input.operation === 'GET_STATUS') {
        return { mutated: false, status: persisted ?? { ...projection, runId: null, phase: 'WORKING', decisionThreadId: null, currentRecommendationSnapshotId: null, verdict: null, confidenceLabel: null } };
      }
      persisted = projection;
      return { mutated: true, status: projection };
    },
  };

  const first = await hvacSpecialistEngageResult('user-1', 'property-1', 'Why are you recommending replacement?', 'ask-execution-1', undefined, dependencies);
  const second = await hvacSpecialistEngageResult('user-1', 'property-1', 'Why are you recommending replacement?', 'ask-execution-1', undefined, dependencies);

  assert.equal(first.parameters.decisionThreadId, 'thread-1');
  assert.equal(second.parameters.decisionThreadId, 'thread-1');
  assert.deepEqual(runtimeCalls.map((call) => call.operation), ['GET_STATUS', 'START_OR_RESUME', 'GET_STATUS']);
  assert.equal(runtimeCalls[0].homeActionOrigin.homeActionId, 'action-1');
  assert.equal(runtimeCalls[0].homeActionOrigin.lineageId, action.lineageId);
  assert.equal(runtimeCalls[0].homeActionOrigin.engagementNonce, runtimeCalls[1].homeActionOrigin.engagementNonce);
  assert.equal(runtimeCalls[1].askExecutionId, 'ask-execution-1');
});

test('a bare forward-looking HVAC repair-or-replace question still routes to HVAC_DECISION_START', () => {
  assert.equal(routeOf('Should I repair or replace my furnace?'), 'HVAC_DECISION_START');
  assert.equal(routeOf('Should I repair or replace my heat pump?'), 'HVAC_DECISION_START');
});

test('existing HVAC decision-thread continuation routing is unchanged', () => {
  assert.equal(routeOf('Continue my furnace repair-or-replace decision'), 'HVAC_DECISION_CONTINUE');
});

test('HVAC_SPECIALIST_ENGAGE is a deterministic, governed operation on the repair-replace skill', () => {
  const def = ASK_OPERATION_DEFINITIONS.HVAC_SPECIALIST_ENGAGE;
  assert.equal(def.executionMode, 'DETERMINISTIC');
  assert.equal(def.safetyClass, 'MATERIAL_DECISION');
  assert.equal(def.adapterKey, 'decision-platform.hvac.specialist-engage');
  assert.equal(getSkillForOperation('HVAC_SPECIALIST_ENGAGE').id, 'repair-replace');
  assert.equal(getSkillAdapterForOperation('HVAC_SPECIALIST_ENGAGE').id, 'decision-platform.hvac.specialist-engage');
  const policy = getAskAudiencePolicy('HVAC_SPECIALIST_ENGAGE', def.version);
  assert.ok(policy, 'audience policy is registered');
});

test('the Specialist engage adapter drives the agent runtime and never a second ranking / promotion path', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const start = source.indexOf('export async function hvacSpecialistEngageResult');
  assert.ok(start >= 0, 'hvacSpecialistEngageResult exists');
  const body = source.slice(start, source.indexOf('\nasync function dispatchOperationAdapterResult(', start));
  assert.ok(body.includes('dependencies.invokeRuntime'), 'delegates to the injected Phase 2 agent runtime boundary');
  for (const forbidden of [
    'homeActionSourcePromotion',
    'priorityListPolicy',
    'unifiedPriorityRanking',
    'compoundRuleRegistry',
    'envelopeCoverage',
    'CoverageAudit',
  ]) {
    assert.equal(body.includes(forbidden), false, `must not reach ${forbidden}`);
  }
  // It resolves exactly one already-ranked action; it does not re-sort the feed.
  assert.equal(/\.sort\(/.test(body), false, 'does not sort the feed');
});

test('no immutable AgentDefinition version bump: Ask reuses the existing HOME_ACTION_ENGAGEMENT trigger', () => {
  assert.equal(HVAC_REPAIR_REPLACE_AGENT_DEFINITION.version, '1.0.0');
  assert.deepEqual([...HVAC_REPAIR_REPLACE_AGENT_DEFINITION.acceptedTriggers], ['HOME_ACTION_ENGAGEMENT']);
});
