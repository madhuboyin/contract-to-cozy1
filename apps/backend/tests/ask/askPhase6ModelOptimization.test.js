const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const {
  ASK_PROMPT_MINIMIZATION_LIMITS,
  minimizeAskQuestion,
  selectRelevantAskFacts,
} = require('../../src/services/ask/askPromptMinimization.ts');
const { buildAskResultSynthesisPayload } = require('../../src/services/ask/askResultSynthesis.service.ts');

test('routing cascade preserves safety precedence and deterministic high-confidence matches', () => {
  assert.equal(resolveAskRoutingCascade('I smell gas by the furnace').stage, 'SAFETY');
  assert.equal(resolveAskRoutingCascade('Create a Python never ending loop').stage, 'SAFETY');
  assert.equal(resolveAskRoutingCascade('How can I bypass a building permit?').stage, 'SAFETY');
  const maintenance = resolveAskRoutingCascade('List my pending maintenance tasks');
  assert.equal(maintenance.stage, 'DETERMINISTIC');
  assert.equal(maintenance.operation.operationId, 'MAINTENANCE_STATUS');
});

test('local classifier resolves an unmatched homeowner paraphrase before remote generation', () => {
  const result = resolveAskRoutingCascade('Give me a rundown of household work remaining and finished');
  assert.equal(result.stage, 'LOCAL_CLASSIFIER');
  assert.equal(result.operation.operationId, 'MAINTENANCE_STATUS');
  assert.ok(result.operation.confidence >= 0.42);
});

test('local routing can be rolled back independently to remote fallback', () => {
  const result = resolveAskRoutingCascade('Give me a rundown of household work remaining and finished', { localRoutingEnabled: false });
  assert.equal(result.stage, 'REMOTE_FALLBACK');
  assert.equal(result.operation.operationId, 'GROUNDED_GUIDANCE');
});

test('close local candidates clarify instead of silently selecting an operation', () => {
  const result = resolveAskRoutingCascade('What home record items need attention and coverage', {
    localMinimumConfidence: 0.28,
    ambiguityMargin: 0.1,
  });
  assert.equal(result.stage, 'CLARIFICATION');
  assert.equal(result.requiresClarification, true);
  assert.deepEqual(result.candidates.slice(0, 2).map((candidate) => candidate.operationId), ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP']);
});

test('prompt minimization redacts direct identifiers and enforces the question budget', () => {
  const minimized = minimizeAskQuestion(`Email owner@example.com or call 212-555-1212. See https://example.com/private. ${'roof '.repeat(200)}`);
  assert.doesNotMatch(minimized, /owner@example\.com|212-555-1212|https:\/\//);
  assert.match(minimized, /\[email redacted\]|\[phone redacted\]|\[link redacted\]/);
  assert.ok(minimized.length <= ASK_PROMPT_MINIMIZATION_LIMITS.maxQuestionCharacters);
});

test('prompt context includes only relevant bounded facts and never sends the complete record by default', () => {
  const facts = [
    { key: 'financing.interestRatePct', state: 'KNOWN', value: 6.5 },
    { key: 'financing.remainingTermYears', state: 'KNOWN', value: 22 },
    { key: 'household.memberEmail', state: 'KNOWN', value: 'private@example.com' },
    { key: 'inventory.refrigerator.purchaseDate', state: 'UNKNOWN' },
  ];
  const selected = selectRelevantAskFacts('Would refinancing my mortgage interest rate help?', facts);
  assert.deepEqual(selected.map((fact) => fact.key), ['financing.interestRatePct', 'financing.remainingTermYears']);
  assert.equal(JSON.stringify(selected).includes('private@example.com'), false);
});

test('result-only synthesis payload excludes actions, routes, identifiers, and unsafe block families', () => {
  const payload = buildAskResultSynthesisPayload('MAINTENANCE_STATUS', [{
    type: 'SUMMARY', id: 'private-block-id', title: 'Maintenance status', body: 'Two tasks are pending for owner@example.com.', tone: 'DEFAULT',
    actions: [{ id: 'open-private', label: 'Open tasks', href: '/dashboard/properties/private-id/tasks', style: 'PRIMARY' }],
  }]);
  assert.ok(payload);
  assert.match(payload, /Two tasks are pending/);
  assert.doesNotMatch(payload, /owner@example\.com|private-block-id|open-private|dashboard\/properties|"actions"\s*:|"href"\s*:/);
  assert.equal(buildAskResultSynthesisPayload('OUT_OF_SCOPE_BOUNDARY', [{
    type: 'BOUNDARY', id: 'boundary', title: 'Boundary', body: 'No.', severity: 'INFO', suggestions: [],
  }]), null);
});
