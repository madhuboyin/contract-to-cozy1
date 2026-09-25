const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { buildAskOutcomeReport, loadAskOutcomeReport, normalizeAskQuestion, isUnmatchedOutcome } = require('../../src/services/ask/askOutcomeReport.ts');

const row = (status, message, extra = {}) => ({ status, message, operationId: 'OP', reasonCode: null, ...extra });

test('rates are shares of all questions; answered includes limited answers and confirmations', () => {
  const report = buildAskOutcomeReport([
    row('ANSWERED', 'a'), row('COMPLETED', 'b'), row('READY_WITH_LIMITATIONS', 'c'), row('NEEDS_CONFIRMATION', 'd'),
    row('NEEDS_CLARIFICATION', 'e'), row('NEEDS_ENTITY', 'f'),
    row('OUT_OF_SCOPE', 'g', { operationId: null }), row('FAILED_TERMINAL', 'h'),
  ]);
  assert.equal(report.total, 8);
  assert.equal(report.answeredRate, 0.5);
  assert.equal(report.clarificationRate, 0.25);
  assert.equal(report.unmatchedRate, 0.125);
  assert.deepEqual(report.byStatus.find((entry) => entry.status === 'OUT_OF_SCOPE'), { status: 'OUT_OF_SCOPE', count: 1, rate: 0.125 });
  assert.equal(buildAskOutcomeReport([]).answeredRate, 0);
});

test('unmatched means out of scope, or a clarification with no operation chosen; other clarifications are listed separately', () => {
  assert.equal(isUnmatchedOutcome(row('OUT_OF_SCOPE', 'x')), true);
  assert.equal(isUnmatchedOutcome(row('NEEDS_CLARIFICATION', 'x', { operationId: null })), true);
  assert.equal(isUnmatchedOutcome(row('NEEDS_CLARIFICATION', 'x')), false);
  const report = buildAskOutcomeReport([
    row('NEEDS_CLARIFICATION', 'Which one?', { reasonCode: 'AMBIGUOUS' }), row('NEEDS_CLARIFICATION', 'which one?'),
    row('NEEDS_CLARIFICATION', 'Plan my garden', { operationId: null }), row('OUT_OF_SCOPE', 'plan my garden', { operationId: null, reasonCode: 'NO_MATCH' }),
  ]);
  assert.deepEqual(report.topClarifications, [{ question: 'which one?', count: 2, reasonCodes: ['AMBIGUOUS'] }]);
  assert.deepEqual(report.topUnmatched, [{ question: 'plan my garden', count: 2, reasonCodes: ['NO_MATCH'] }]);
});

test('wordings are normalised and masked, ranked by count, and a wording asked once is never printed', () => {
  assert.equal(normalizeAskQuestion('  Email ME at Jo@Example.com about 123  Main St '), 'email me at <email> about # main st');
  const report = buildAskOutcomeReport([
    row('OUT_OF_SCOPE', 'Fix my 2019 car', { operationId: null }), row('OUT_OF_SCOPE', 'fix my 2021 car', { operationId: null }),
    row('OUT_OF_SCOPE', 'weather in Paris', { operationId: null }), row('OUT_OF_SCOPE', 'Weather in paris', { operationId: null }), row('OUT_OF_SCOPE', 'WEATHER IN PARIS', { operationId: null }),
    row('OUT_OF_SCOPE', 'my ssn is 123-45-6789', { operationId: null }),
  ]);
  assert.deepEqual(report.topUnmatched.map((entry) => [entry.question, entry.count]), [['weather in paris', 3], ['fix my # car', 2]]);
  assert.equal(report.suppressedSingletons, 1);
  assert.equal(JSON.stringify(report).includes('6789'), false);
  assert.equal(buildAskOutcomeReport([row('OUT_OF_SCOPE', 'once', { operationId: null })], { minCount: 1 }).topUnmatched.length, 1);
  assert.equal(buildAskOutcomeReport(Array.from({ length: 5 }, (_, i) => row('OUT_OF_SCOPE', `q${'x'.repeat(i)} same`, { operationId: null })), { minCount: 1, limit: 2 }).topUnmatched.length, 2);
});

test('the loader reads only top-level questions in the window', async () => {
  let args;
  const now = new Date('2026-09-25T00:00:00Z');
  const loaded = await loadAskOutcomeReport({ askExecution: { findMany: async (a) => { args = a; return [row('ANSWERED', 'a')]; } } }, { days: 7, now });
  assert.equal(args.where.parentExecutionId, null);
  assert.equal(args.where.createdAt.gte.toISOString(), '2026-09-18T00:00:00.000Z');
  assert.deepEqual(args.select, { status: true, reasonCode: true, operationId: true, message: true });
  assert.equal(loaded.report.total, 1);
});
