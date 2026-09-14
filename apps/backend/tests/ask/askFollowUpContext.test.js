const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let mockRow = null;
let lastWhere = null;
const prismaMock = {
  askExecution: {
    findFirst: async (args) => {
      lastWhere = args.where;
      if (!mockRow) return null;
      // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-003/ACT-001: a pinned lookup
      // (a declared filter chip naming its exact source execution) queries
      // by id instead of the recency window -- only the unpinned,
      // "most recent in session" path needs the lookback bound. A pinned
      // id that does not match anything must behave like a real DB query
      // that found no row (null), not silently return the mock's row
      // regardless of id -- this is what lets the "stale pin fails closed"
      // test actually exercise a miss.
      if (args.where.id) {
        if (args.where.id !== mockRow.id) return null;
      } else {
        // Sanity-check the caller is actually scoping the lookback, not
        // reaching across the whole session unbounded.
        assert.ok(args.where.createdAt.gte instanceof Date);
      }
      assert.equal(args.where.sessionId, mockRow.sessionId);
      return mockRow;
    },
  },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

function priorRow(overrides) {
  return {
    id: 'prior-execution-1',
    sessionId: 'session-1',
    operationId: 'MAINTENANCE_STATUS',
    message: 'What maintenance is overdue?',
    resultJson: { blocks: [] },
    parametersJson: {},
    launchContextJson: null,
    ...overrides,
  };
}

// External review [P1]: a proactive continuation card (any producer) is
// marked this way by createAskNotificationContinuation.ts's own
// launchContextJson.surface, regardless of which monitor created it.
function monitorNotificationLaunchContext(triggerKey) {
  return { surface: 'MONITOR_NOTIFICATION', entityType: 'MONITOR_SIGNAL', actionId: triggerKey, returnTo: '/dashboard' };
}

test('no prior execution leaves the message unchanged', async () => {
  mockRow = null;
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.');
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.sourceExecutionId, null);
});

test('Envelope pagination reuses the prior server-side cursor without exposing it in chat text', async () => {
  mockRow = priorRow({
    operationId: 'INTELLIGENCE_ENVELOPE_QUERY',
    message: 'What do you know about my roof?',
    parametersJson: { nextCursor: 'opaque-cursor' },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Show more intelligence' });
  assert.equal(result.forcedOperationId, 'INTELLIGENCE_ENVELOPE_QUERY');
  assert.equal(result.continuationCursor, 'opaque-cursor');
  assert.equal(result.effectiveMessage.includes('opaque-cursor'), false);
});

test('a Specialist fact reply is forced back to the shared Specialist operation', async () => {
  mockRow = priorRow({
    operationId: 'HVAC_SPECIALIST_ENGAGE',
    message: 'Help me decide on the flagged furnace action',
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'It is in good condition' });
  assert.equal(result.forcedOperationId, 'HVAC_SPECIALIST_ENGAGE');
  assert.match(result.effectiveMessage, /Homeowner follow-up: It is in good condition/);
});

test('a non-continuation message is never rewritten even with a fresh prior execution', async () => {
  mockRow = priorRow();
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Is refinancing worth it right now?' });
  assert.equal(result.effectiveMessage, 'Is refinancing worth it right now?');
  assert.equal(result.sourceExecutionId, null);
});

test('entity continuation substitutes the pronoun with the single prior task title', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_TASK_COMPLETE',
    message: 'Complete the gutter cleaning task',
    resultJson: {
      blocks: [{
        type: 'WORKFLOW_PROGRESS',
        id: 'maintenance-complete-select',
        details: [{ label: 'Task', value: 'Clean the gutters' }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.match(result.effectiveMessage, /Clean the gutters/);
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
});

test('entity continuation resolves against a singular GROUPED_LIST item too', async () => {
  mockRow = priorRow({
    resultJson: {
      blocks: [{
        type: 'GROUPED_LIST',
        id: 'maintenance-list',
        sections: [{ id: 'overdue', title: 'Overdue', count: 1, items: [{ id: 'task-1', title: 'Service the water heater' }] }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Mark that task done.' });
  assert.match(result.effectiveMessage, /Service the water heater/);
});

test('entity continuation refuses to guess when the prior turn named more than one item', async () => {
  mockRow = priorRow({
    resultJson: {
      blocks: [{
        type: 'GROUPED_LIST',
        id: 'maintenance-list',
        sections: [{ id: 'overdue', title: 'Overdue', count: 2, items: [
          { id: 'task-1', title: 'Service the water heater' },
          { id: 'task-2', title: 'Clean the gutters' },
        ] }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.', 'ambiguous prior context must not be guessed through');
  assert.equal(result.sourceExecutionId, null);
});

test('filter continuation combines the prior question with the refinement and forces the same operation', async () => {
  mockRow = priorRow({ operationId: 'MAINTENANCE_STATUS', message: 'What maintenance is due soon?' });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Only show the urgent ones.' });
  assert.match(result.effectiveMessage, /What maintenance is due soon\?/);
  assert.match(result.effectiveMessage, /Only show the urgent ones\./);
  assert.equal(result.forcedOperationId, 'MAINTENANCE_STATUS');
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
});

test('filter continuation does not force a non-continuable (command/analysis) operation', async () => {
  mockRow = priorRow({ operationId: 'REFINANCE_ANALYSIS', message: 'Is refinancing worth it now?' });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Only show the urgent ones.' });
  assert.equal(result.forcedOperationId, null, 'refinance analysis is a scenario-bound analysis, not a bare filter refinement target');
});

// External review finding (round 9, findings 1 & 2 combined): a declared
// filter chip must resolve against the EXACT execution it was rendered on,
// not "the most recent execution in this session" -- after an intervening
// turn, that heuristic could silently target the wrong prior result.
test('a declared source execution id resolves against that exact row, and does not concatenate its message (it is self-sufficient)', async () => {
  mockRow = priorRow({ id: 'the-exact-card', operationId: 'MAINTENANCE_STATUS', message: 'Show HVAC maintenance due this month' });
  const result = await resolveAskFollowUpMessage({
    sessionId: 'session-1', propertyId: 'property-1', message: 'Only show urgent tasks',
    declaredSourceExecutionId: 'the-exact-card',
  });
  assert.equal(result.sourceExecutionId, 'the-exact-card');
  assert.equal(result.isFilterRefinement, true);
  assert.equal(result.effectiveMessage, 'Only show urgent tasks', 'a declared chip is self-sufficient -- concatenation is for organic typed follow-ups only');
});

test('a declared source execution id that does not resolve fails closed (no continuation), rather than silently falling back to "most recent in session"', async () => {
  // Simulates the exact bug this exists to prevent: the homeowner is
  // looking at an OLDER maintenance card (mockRow), but the chip click
  // names a DIFFERENT execution id (e.g. stale client state, or the wrong
  // session) that this lookup cannot find.
  mockRow = priorRow({ id: 'some-other-recent-execution', operationId: 'MAINTENANCE_STATUS', message: 'Show plumbing maintenance' });
  const result = await resolveAskFollowUpMessage({
    sessionId: 'session-1', propertyId: 'property-1', message: 'Only show urgent tasks',
    declaredSourceExecutionId: 'a-stale-or-wrong-execution-id',
  });
  assert.equal(result.sourceExecutionId, null);
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.isFilterRefinement, false);
  assert.equal(result.effectiveMessage, 'Only show urgent tasks', 'falls back to the unmodified message, never silently borrows the unrelated recent execution\'s context');
});

test('an operationId-less prior execution (boundary/grounded) is not treated as reusable context', async () => {
  mockRow = priorRow({ operationId: null });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.');
});

test('a property-less turn queries for propertyId IS NULL, not an unscoped lookup across every property in the session', async () => {
  mockRow = priorRow();
  await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: null, message: 'Now complete it.' });
  // Prisma treats `undefined` as "omit this filter" (matches any property)
  // and `null` as "match rows where propertyId IS NULL". Before the current
  // turn's property is resolved, only property-less prior turns may be
  // reused -- an execution scoped to a *different* property in the same
  // session must never leak in as follow-up context.
  assert.equal(lastWhere.propertyId, null);
  assert.notEqual(lastWhere.propertyId, undefined);

  mockRow = priorRow();
  await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: undefined, message: 'Now complete it.' });
  assert.equal(lastWhere.propertyId, null);
});

test('entity continuation substitutes only the matched pronoun occurrence, not an earlier lookalike substring', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_TASK_COMPLETE',
    message: 'Complete the gutter cleaning task',
    resultJson: {
      blocks: [{
        type: 'WORKFLOW_PROGRESS',
        id: 'maintenance-complete-select',
        details: [{ label: 'Task', value: 'Clean the gutters' }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({
    sessionId: 'session-1',
    propertyId: 'property-1',
    message: "I know it's overdue, mark it complete",
  });
  // A naive String.replace(pronounSpan, ...) would rewrite the "it" inside
  // "it's" (the first occurrence in the string) instead of the "it" the
  // regex actually matched in "mark it complete", garbling the sentence.
  assert.equal(result.effectiveMessage, "I know it's overdue, mark Clean the gutters complete");
});

// External review [P1]: Radar's own suggested follow-ups ("What should I do
// about this?", "How urgent is this?") matched none of the four prior
// patterns above and used to short-circuit before this function's DB read
// even ran -- these tests cover the new fifth pattern that carries a Radar
// proactive continuation's structured signal (radarMatchId/radarEventId)
// forward as suppliedInput.
test('a Radar-suggested vague follow-up carries the triggering match/event forward as suppliedInput', async () => {
  mockRow = priorRow({
    operationId: 'INTELLIGENCE_ENVELOPE_QUERY',
    message: 'A monitored event ("Severe Thunderstorm Warning") may affect this property. What changed, why does it matter, and what should I do next?',
    parametersJson: { radarEventId: 'radar-event-1', radarMatchId: 'radar-match-1', radarNotificationDecisionId: 'decision-1', impact: 'high', severity: 'severe' },
    launchContextJson: monitorNotificationLaunchContext('home-event-radar:decision-1'),
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'What should I do about this?' });
  assert.equal(result.forcedOperationId, 'INTELLIGENCE_ENVELOPE_QUERY');
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
  assert.deepEqual(result.suppliedInput, { radarMatchId: 'radar-match-1', radarEventId: 'radar-event-1' });
  assert.match(result.effectiveMessage, /Severe Thunderstorm Warning/);
  assert.match(result.effectiveMessage, /What should I do about this\?/);
});

test('"How urgent is this?" is also recognized as the same Radar vague-follow-up pattern', async () => {
  mockRow = priorRow({
    operationId: 'INTELLIGENCE_ENVELOPE_QUERY',
    parametersJson: { radarEventId: 'radar-event-1', radarMatchId: 'radar-match-1' },
    launchContextJson: monitorNotificationLaunchContext('home-event-radar:decision-1'),
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'How urgent is this?' });
  assert.equal(result.forcedOperationId, 'INTELLIGENCE_ENVELOPE_QUERY');
  assert.deepEqual(result.suppliedInput, { radarMatchId: 'radar-match-1', radarEventId: 'radar-event-1' });
});

test('a vague follow-up is NOT treated as a Radar continuation when the prior turn was not a proactive monitor card', async () => {
  mockRow = priorRow({
    operationId: 'INTELLIGENCE_ENVELOPE_QUERY',
    parametersJson: { radarEventId: 'radar-event-1', radarMatchId: 'radar-match-1' },
    launchContextJson: null,
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'What should I do about this?' });
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.suppliedInput, null);
  assert.equal(result.effectiveMessage, 'What should I do about this?');
});

test('a vague follow-up is NOT treated as a Radar continuation when the monitor card is a different producer\'s (e.g. Maintenance)', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_STATUS',
    parametersJson: { taskId: 'task-1' },
    launchContextJson: monitorNotificationLaunchContext('maintenance-task-1'),
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'What should I do about this?' });
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.suppliedInput, null);
});

// External review [P1]: a proactive Maintenance continuation card has no
// extractable task TITLE in its resultJson (generic "What changed"/"Why it
// matters" labels, never label: 'Task') -- "Now complete it" always fell
// through to the fallback for it. These tests cover the id-based
// (suppliedInput.taskId) resolution added alongside the title-based path.
test('Maintenance\'s "Now complete it" resolves via suppliedInput.taskId against a proactive monitor card, even with no extractable task title', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_STATUS',
    message: 'A monitored maintenance deadline may need your attention. What changed, why does it matter, and what should I do next?',
    resultJson: {
      blocks: [{
        type: 'WORKFLOW_PROGRESS',
        id: 'monitor-trigger-details',
        details: [
          { label: 'What changed', value: 'Gutter cleaning is due in 3 days' },
          { label: 'Why it matters', value: 'The recorded maintenance obligation has entered its reminder window' },
        ],
      }],
    },
    parametersJson: { taskId: 'task-42', dueAt: '2026-09-20T00:00:00.000Z', daysUntilDue: 3, actionKey: null },
    launchContextJson: monitorNotificationLaunchContext('maintenance-task-42'),
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.forcedOperationId, 'MAINTENANCE_TASK_COMPLETE');
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
  assert.deepEqual(result.suppliedInput, { taskId: 'task-42' });
  assert.equal(result.effectiveMessage, 'Now complete it.');
});

test('a non-complete verb ("update it") against the same Maintenance monitor card is left unresolved, not silently mapped', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_STATUS',
    resultJson: { blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'monitor-trigger-details', details: [{ label: 'What changed', value: 'x' }] }] },
    parametersJson: { taskId: 'task-42' },
    launchContextJson: monitorNotificationLaunchContext('maintenance-task-42'),
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Update it.' });
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.suppliedInput, null);
  assert.equal(result.effectiveMessage, 'Update it.');
});

test('"Now complete it" against a non-monitor MAINTENANCE_STATUS turn with no extractable title still falls back exactly as before', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_STATUS',
    resultJson: { blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'x', details: [{ label: 'Something else', value: 'x' }] }] },
    parametersJson: { taskId: 'task-42' },
    launchContextJson: null,
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.suppliedInput, null);
  assert.equal(result.effectiveMessage, 'Now complete it.');
});
