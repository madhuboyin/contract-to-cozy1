const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { AskExecutionResponseSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SKILL_DEFINITIONS } = require('../../src/services/skills/skillRegistry.ts');
const {
  SKILL_HANDOFF_DEFINITIONS,
  resolveSkillHandoffSuggestion,
  validateSkillHandoffDefinitions,
} = require('../../src/services/skills/skillHandoff.ts');

const answered = (overrides = {}) => ({
  status: 'ANSWERED',
  blocks: [],
  suggestions: [],
  ...overrides,
});

test('registered Skill handoffs validate against source ownership, target goals, and Ask policy', () => {
  assert.deepEqual(validateSkillHandoffDefinitions(), []);
  const handoff = SKILL_HANDOFF_DEFINITIONS[0];
  assert.deepEqual(validateSkillHandoffDefinitions([{ ...handoff, targetSkillId: 'missing' }]), [
    'PROPERTY_SUMMARY:missing:understand-maintenance-status: target Skill is not registered',
  ]);
  assert.ok(validateSkillHandoffDefinitions([{ ...handoff, suggestedGoal: 'invented-goal' }])
    .some((issue) => issue.includes('target goal is not registered')));
  assert.ok(validateSkillHandoffDefinitions([{ ...handoff, targetOperationId: 'REFINANCE_ANALYSIS' }])
    .some((issue) => issue.includes('target operation is not owned by target Skill')));
  assert.ok(validateSkillHandoffDefinitions([{ ...handoff, targetSkillId: 'property-record', targetOperationId: 'INVENTORY_LOOKUP', suggestedGoal: 'find-recorded-home-item' }])
    .some((issue) => issue.includes('same-Skill handoff is not allowed')));
});

test('Ask returns a typed suggestion but never invokes the target Skill', () => {
  const suggestion = resolveSkillHandoffSuggestion({
    sourceOperationId: 'PROPERTY_SUMMARY',
    result: answered(),
  });
  assert.deepEqual(suggestion, {
    suggestedNextSkillId: 'maintenance',
    suggestedGoal: 'understand-maintenance-status',
    reasonCodes: ['HOME_RECORD_REVIEWED'],
    contextReferenceIds: [],
    continuity: {
      propertyId: null, sourceEntityType: null, sourceEntityId: null, sourceHomeActionId: null,
      decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null, returnDestination: null,
    },
  });
  assert.equal(Object.isFrozen(suggestion), true);

  const source = readFileSync(resolve(__dirname, '../../src/services/skills/skillHandoff.ts'), 'utf8');
  assert.doesNotMatch(source, /executeOperationCore|executeSkill|\.execute\(|getSkillAdapter/);
});

test('handoff suggestions are removed when the target or its operation is unavailable', () => {
  const base = { sourceOperationId: 'PROPERTY_SUMMARY', result: answered() };
  assert.equal(resolveSkillHandoffSuggestion({
    ...base,
    controls: { skillEnabled: (skillId) => skillId !== 'maintenance' },
  }), null);
  assert.equal(resolveSkillHandoffSuggestion({
    ...base,
    controls: { operationEnabled: (operationId) => operationId !== 'MAINTENANCE_STATUS' },
  }), null);
  assert.equal(resolveSkillHandoffSuggestion({ ...base, consumer: 'HOME_ACTIONS' }), null);
});

test('pending capture, clarification, and ineligible outcomes cannot leak a handoff', () => {
  const base = { sourceOperationId: 'PROPERTY_SUMMARY' };
  assert.equal(resolveSkillHandoffSuggestion({ ...base, result: answered({ status: 'FAILED_RETRYABLE' }) }), null);
  assert.equal(resolveSkillHandoffSuggestion({ ...base, result: answered({ captureRequests: [{}] }) }), null);
  assert.equal(resolveSkillHandoffSuggestion({ ...base, result: answered({ clarification: {} }) }), null);
  assert.equal(resolveSkillHandoffSuggestion({ ...base, result: answered({ suppressSkillHandoff: true }) }), null);
  assert.equal(resolveSkillHandoffSuggestion({ sourceOperationId: 'MAINTENANCE_STATUS', result: answered() }), null);
});

test('declared context references must be present before a handoff is exposed', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/skills/skillHandoff.ts'), 'utf8');
  assert.match(source, /availableContextReferenceIds/);
  assert.match(source, /contextReferenceIds\.some\(\(reference\) => !availableReferences\.has\(reference\)\)/);
});

test('Ask response handoff contract is additive and bounded', () => {
  const base = {
    schemaVersion: '1.0', executionId: 'execution-1', sessionId: 'session-1', question: 'Summarize my home',
    status: 'ANSWERED', property: null, operation: { id: 'PROPERTY_SUMMARY', version: '1.0', family: 'STATUS_SUMMARY' },
    contextVersion: null, blocks: [], captureRequests: [], clarification: null, confirmation: null, suggestions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  assert.equal(AskExecutionResponseSchema.parse(base).skillHandoff, null);
  const parsed = AskExecutionResponseSchema.parse({
    ...base,
    skillHandoff: {
      suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status',
      reasonCodes: ['HOME_RECORD_REVIEWED'], contextReferenceIds: [],
    },
  });
  assert.equal(parsed.skillHandoff.suggestedNextSkillId, 'maintenance');
  assert.equal(parsed.skillHandoff.continuity.propertyId, null);
  assert.equal(AskExecutionResponseSchema.safeParse({
    ...base,
    skillHandoff: {
      suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status',
      reasonCodes: ['raw homeowner content'], contextReferenceIds: [],
    },
  }).success, false);
});

test('orchestration persists handoffs and startup validation is fail-fast', () => {
  const orchestrator = readAskOrchestratorSources();
  const index = readFileSync(resolve(__dirname, '../../src/index.ts'), 'utf8');
  const metrics = readFileSync(resolve(__dirname, '../../src/lib/metrics.ts'), 'utf8');
  assert.match(orchestrator, /resolveSkillHandoffSuggestion/);
  assert.match(orchestrator, /skillHandoff: result\.skillHandoff \?\? null/);
  assert.match(index, /validateSkillHandoffDefinitions\(\)/);
  assert.match(metrics, /name: 'ask_skill_handoffs_total'/);
  assert.match(metrics, /labelNames: \['source_skill', 'target_skill', 'outcome'\]/);
  assert.equal(SKILL_DEFINITIONS.maintenance.supportedGoals.includes('understand-maintenance-status'), true);
});

test('inspection-finding handoff only fires when work was actually created (accept), not for dismiss/resolve', () => {
  const completed = (reasonCode, parameters) => ({ status: 'COMPLETED', reasonCode, blocks: [], suggestions: [], ...(parameters ? { parameters } : {}) });
  const go = (result, parameters) => resolveSkillHandoffSuggestion({ sourceOperationId: 'INSPECTION_FINDING_UPDATE', result, parameters });
  assert.equal(go(completed('INSPECTION_FINDING_ACCEPTED'))?.suggestedGoal, 'review-home-actions-feed');
  assert.equal(go(completed('INSPECTION_FINDING_DISMISSED')), null);
  assert.equal(go(completed('INSPECTION_FINDING_RESOLVED')), null);
  assert.equal(go(completed('INSPECTION_FINDING_BATCH_UPDATED'), { inspectionFindingBatch: [{ action: 'DISMISS' }] }), null);
  assert.equal(go(completed('INSPECTION_FINDING_BATCH_UPDATED'), { inspectionFindingBatch: [{ action: 'DISMISS' }, { action: 'ACCEPT' }] })?.suggestedGoal, 'review-home-actions-feed');
});

test('confirmed writes resolve their handoff -- COMPLETED-only definitions are unreachable otherwise', () => {
  const root = resolve(__dirname, '../../src/services/ask/execution');
  const confirm = readFileSync(resolve(root, 'askConfirm.ts'), 'utf8');
  const execute = readFileSync(resolve(root, 'executeOperation.ts'), 'utf8');
  // Both paths go through the one shared resolver; only it may call resolveSkillHandoffSuggestion.
  assert.match(confirm, /resolveAskSkillHandoff\(\{ operationId: confirmedOperationId/);
  assert.match(execute, /export function resolveAskSkillHandoff/);
  assert.equal((execute.match(/resolveSkillHandoffSuggestion\(/g) ?? []).length, 1);
  // Resolved before the confirmed result is validated and persisted, so it is stored on the execution.
  assert.ok(confirm.indexOf('resolveAskSkillHandoff(') < confirm.indexOf('validateAskConfirmedCompletion({'));
  // Every COMPLETED-only definition must be one the confirm path can actually emit.
  const completedOnly = SKILL_HANDOFF_DEFINITIONS.filter((d) => d.eligibleStatuses.every((status) => status === 'COMPLETED')).map((d) => d.sourceOperationId);
  assert.deepEqual(completedOnly.sort(), ['BUYER_LIFECYCLE_UPDATE', 'CLAIM_FILE', 'CLAIM_TRANSITION', 'DOCUMENT_PROMOTION_CONFIRM', 'INSPECTION_FINDING_UPDATE']);
});

test('document-promotion and buyer-lifecycle handoffs decline outcomes their reason code does not describe', () => {
  const go = (sourceOperationId, reasonCode) => resolveSkillHandoffSuggestion({ sourceOperationId, result: { status: 'COMPLETED', reasonCode, blocks: [], suggestions: [] } });
  assert.equal(go('DOCUMENT_PROMOTION_CONFIRM', 'DOCUMENT_PROMOTION_CONFIRMED')?.suggestedGoal, 'summarize-property-record');
  assert.equal(go('DOCUMENT_PROMOTION_CONFIRM', 'DOCUMENT_PROMOTION_REJECTED'), null);
  for (const code of ['BUYER_JOURNEY_RESUMED', 'BUYER_LIFECYCLE_DATE_UPDATED']) assert.ok(go('BUYER_LIFECYCLE_UPDATE', code), code);
  for (const code of ['BUYER_JOURNEY_PAUSED', 'BUYER_JOURNEY_CANCELLED']) assert.equal(go('BUYER_LIFECYCLE_UPDATE', code), null, code);
});
