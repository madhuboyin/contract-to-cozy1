const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register/transpile-only');

// Live review finding 4 (Guided Journey, 2026-10-16): confirming "Skip this step" refreshed the earlier "Continue this
// guided journey." turn through /confirm childExecutions. Creation skips the semantic relevance check for a declared item
// action; the refresh did not, so the answered journey card was overwritten by "I need one detail to verify this answer".

const { launchDeclaredOperation, refreshPresentationIsCompatible, refreshWouldDowngradeAnswer } = require('../../src/services/ask/execution/executeOperation.ts');

test('a stored launch that declared the execution\'s operation is recognised', () => {
  assert.equal(launchDeclaredOperation({ operationId: 'GUIDANCE_JOURNEY_CONTINUE', launchContextJson: { operationId: 'GUIDANCE_JOURNEY_CONTINUE', entityId: 'j1' } }), true);
});

test('free-text turns, other declared operations and missing context are not treated as declared', () => {
  assert.equal(launchDeclaredOperation({ operationId: 'GUIDANCE_JOURNEY_CONTINUE', launchContextJson: { surface: 'ASK_FOLLOW_UP' } }), false);
  assert.equal(launchDeclaredOperation({ operationId: 'GUIDANCE_JOURNEY_CONTINUE', launchContextJson: { operationId: 'HOME_ACTIONS' } }), false);
  assert.equal(launchDeclaredOperation({ operationId: 'GUIDANCE_JOURNEY_CONTINUE', launchContextJson: null }), false);
  assert.equal(launchDeclaredOperation({ operationId: null, launchContextJson: { operationId: null } }), false);
});

test('a refresh never turns an answered turn into a relevance clarification', () => {
  const clarification = { status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ANSWER_RELEVANCE_UNCERTAIN_CLARIFICATION_REQUIRED' };
  assert.equal(refreshWouldDowngradeAnswer('ANSWERED', clarification), true);
  assert.equal(refreshWouldDowngradeAnswer('ANSWERED', { status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ANSWER_RELEVANCE_MISMATCH_CLARIFICATION_REQUIRED' }), true);
});

test('genuine refresh outcomes are still written', () => {
  assert.equal(refreshWouldDowngradeAnswer('ANSWERED', { status: 'ANSWERED', reasonCode: null }), false);
  assert.equal(refreshWouldDowngradeAnswer('ANSWERED', { status: 'NEEDS_CONTEXT', reasonCode: 'ASK_CONTEXT_REQUIRED' }), false);
  assert.equal(refreshWouldDowngradeAnswer('ANSWERED', { status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ENTITY_AMBIGUOUS' }), false);
  assert.equal(refreshWouldDowngradeAnswer('NEEDS_CLARIFICATION', { status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ANSWER_RELEVANCE_UNCERTAIN_CLARIFICATION_REQUIRED' }), false);
});

test('a refresh accepts compatible presentations and rejects malformed blocks before persistence', () => {
  const summary = { type: 'SUMMARY', id: 'summary', title: 'Answer', body: 'Still valid.', tone: 'DEFAULT', actions: [] };
  const history = { originalResponse: { blocks: [summary], observedAt: '2026-10-17T00:00:00.000Z' }, continuesExecutionId: null };
  assert.equal(refreshPresentationIsCompatible({ blocks: [summary] }, history), true);
  assert.equal(refreshPresentationIsCompatible({ blocks: [{ type: 'GROUPED_LIST', id: 'bad', title: 'Bad', sections: [{ id: 'too-many', title: 'Rows', count: 101, items: Array.from({ length: 101 }, (_, id) => ({ id: String(id), title: String(id), meta: [] })) }], filters: [], actions: [] }] }, history), false);
});

test('refreshAskExecutionAfterConflict applies both rules', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  const body = source.slice(source.indexOf('export async function refreshAskExecutionAfterConflict'), source.indexOf('export async function refreshAskSourceExecution'));
  assert.match(body, /deferSemanticValidation: launchDeclaredOperation\(execution\)/);
  assert.match(body, /if \(refreshWouldDowngradeAnswer\(execution\.status, result\)\)/);
  assert.match(body, /if \(!refreshPresentationIsCompatible\(result, history\)\)/);
  assert.ok(body.indexOf('refreshWouldDowngradeAnswer') < body.indexOf('prisma.askExecution.updateMany'), 'the guard must run before the row is overwritten');
  assert.ok(body.indexOf('refreshPresentationIsCompatible') < body.indexOf('prisma.askExecution.updateMany'), 'presentation validation must run before the row is overwritten');
});
