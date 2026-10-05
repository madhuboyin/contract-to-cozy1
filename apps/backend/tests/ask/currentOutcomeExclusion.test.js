const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Owner decision D-O11: the answer just produced by a VERIFIED launch is not offered again. The only source is the SUGGESTED_ACTION_SELECTED
// event written server-side after the offered-action ledger verified the selection; nothing is inferred from the operation or the message.

const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { loadCurrentOutcomeKeyHashes } = require('../../src/services/ask/suggestedActions/suggestedNextActionHistory.ts');
const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { seasonalHomeCareStarters } = require('../../src/services/ask/suggestedActions/starterCandidates.ts');
const { prisma } = require('../../src/lib/prisma.ts');

const NOW = new Date('2026-10-05T12:00:00.000Z');
const clock = { now: () => NOW };
const starters = seasonalHomeCareStarters('prop-1');
const hashOf = (starter) => suggestedNextActionSemanticKeyHash({
  operationId: starter.operationId, interactionType: starter.interactionType, propertyId: 'prop-1', entityType: null, entityId: null, outcomeKey: starter.outcomeKey,
});

const producers = [{ id: 'starter.seasonal-home-care', source: 'CAPABILITY_RECOMMENDATION', essential: true, nominate: () => starters }];
const run = (currentHashes) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'ANSWERED', blocks: [], suggestions: [] }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'SEASONAL_HOME_CARE', message: 'Anything else' },
  {
    producers, clock,
    loadOperationAvailability: async () => new Map([['SEASONAL_HOME_CARE', null]]),
    loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
    loadCurrentOutcomeKeyHashes: async () => currentHashes,
  },
);
const outcomesOf = (run_) => run_.result.suggestedNextActions.map((a) => a.outcomeKey).sort();

test('with no verified launch (an ordinary typed question) nothing is excluded: both starters are offered', async () => {
  assert.deepEqual(outcomesOf(await run(new Set())), ['PREPARE_NEXT_SEASON', 'REVIEW_THIS_SEASON']);
});

test('a verified launch of REVIEW_THIS_SEASON excludes exactly that outcome, with the CURRENT_OUTCOME reason, and keeps the other starter', async () => {
  const { result, report } = await run(new Set([hashOf(starters[0])]));
  assert.deepEqual(outcomesOf({ result }), ['PREPARE_NEXT_SEASON']);
  assert.deepEqual(report.diagnostics.rejections, { 'HISTORY:CURRENT_OUTCOME': 1 });
});

test('the loader reads only THIS execution\'s verified selection event, returns its hash, and fails to an empty set', async () => {
  const original = prisma.askExecutionEvent.findMany;
  const seen = [];
  try {
    prisma.askExecutionEvent.findMany = async (args) => { seen.push(args); return [{ metadataJson: { semanticKeyHash: 'abc' } }, ]; };
    assert.deepEqual([...await loadCurrentOutcomeKeyHashes('exec-9')], ['abc']);
    assert.deepEqual(seen[0].where, { eventType: 'SUGGESTED_ACTION_SELECTED', executionId: 'exec-9' }, 'no session-wide history, no other event type');
    prisma.askExecutionEvent.findMany = async () => [];
    assert.equal((await loadCurrentOutcomeKeyHashes('exec-typed')).size, 0, 'a typed question has no selection event');
    prisma.askExecutionEvent.findMany = async () => { throw new Error('db down'); };
    assert.equal((await loadCurrentOutcomeKeyHashes('exec-9')).size, 0);
  } finally { prisma.askExecutionEvent.findMany = original; }
});

test('the selection event is written only on the ledger-VERIFIED path, before the operation runs (so a client launch field can never populate the set)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  const block = source.slice(source.indexOf("if (suggestionResolution?.kind === 'VERIFIED') {\n    try {"));
  assert.ok(/eventType: 'SUGGESTED_ACTION_SELECTED'/.test(block.slice(0, 400)), 'event written inside the VERIFIED branch');
  assert.equal((source.match(/eventType: 'SUGGESTED_ACTION_SELECTED'/g) ?? []).length, 1, 'no other writer');
});
