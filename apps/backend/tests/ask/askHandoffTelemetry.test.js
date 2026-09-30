const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { askSkillHandoffsTotal } = require('../../src/lib/metrics.ts');
const { CreateAskExecutionRequestSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const {
  classifyLaunchedOutcome, readStoredHandoff, recordHandoffOutcome, resolveHandoffAttribution,
} = require('../../src/services/ask/execution/askHandoffTelemetry.ts');

// Handoff audit scope 3, step 4 (FRD v1.168): OPENED / COMPLETED / MISROUTED telemetry.

const storedHandoff = { suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status' };
const withFindFirst = async (impl, fn) => {
  const original = prisma.askExecution.findFirst;
  prisma.askExecution.findFirst = impl;
  try { return await fn(); } finally { prisma.askExecution.findFirst = original; }
};

test('attribution is derived from the source execution\'s own stored handoff, scoped to the requesting user', async () => {
  let where;
  const attribution = await withFindFirst(async (args) => {
    where = args.where;
    return { id: 'src-1', operationId: 'HOME_ACTIONS', resultJson: { skillHandoff: storedHandoff } };
  }, () => resolveHandoffAttribution('user-1', 'src-1'));
  assert.deepEqual(where, { id: 'src-1', userId: 'user-1' });
  assert.equal(attribution.sourceExecutionId, 'src-1');
  assert.equal(attribution.targetSkill, 'maintenance');
  assert.equal(attribution.targetOperationId, 'MAINTENANCE_STATUS');
  assert.equal(typeof attribution.sourceSkill, 'string');
});

test('a forged, foreign, handoff-less or inconsistent source yields no attribution (so nothing is counted)', async () => {
  const attribute = (row) => withFindFirst(async () => row, () => resolveHandoffAttribution('user-1', 'x'));
  assert.equal(await attribute(null), null, 'not found / owned by someone else');
  assert.equal(await attribute({ id: 's', operationId: 'HOME_ACTIONS', resultJson: { blocks: [] } }), null, 'no stored handoff');
  assert.equal(await attribute({ id: 's', operationId: 'HOME_ACTIONS', resultJson: { skillHandoff: null } }), null);
  assert.equal(await attribute({ id: 's', operationId: null, resultJson: { skillHandoff: storedHandoff } }), null, 'no source operation');
  // Stored skill/goal pair that is not a registered transition for that source operation.
  assert.equal(await attribute({ id: 's', operationId: 'HOME_ACTIONS', resultJson: { skillHandoff: { suggestedNextSkillId: 'coverage', suggestedGoal: 'review-coverage-gaps' } } }), null);
  assert.equal(await attribute({ id: 's', operationId: 'HOME_ACTIONS', resultJson: { skillHandoff: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'made-up' } } }), null);
});

test('readStoredHandoff only trusts a well-formed stored shape', () => {
  assert.deepEqual(readStoredHandoff({ skillHandoff: { ...storedHandoff, extra: 1 } }), storedHandoff);
  for (const bad of [null, undefined, 'x', [], {}, { skillHandoff: 'x' }, { skillHandoff: { suggestedNextSkillId: 1, suggestedGoal: 'g' } }]) assert.equal(readStoredHandoff(bad), null);
});

test('completion is classified only for completed-type statuses, and a different route is MISROUTED', () => {
  const attribution = { sourceExecutionId: 's', sourceSkill: 'home-operations', targetSkill: 'maintenance', targetOperationId: 'MAINTENANCE_STATUS' };
  for (const status of ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS']) assert.equal(classifyLaunchedOutcome(attribution, 'MAINTENANCE_STATUS', status), 'COMPLETED', status);
  for (const status of ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS']) assert.equal(classifyLaunchedOutcome(attribution, 'COVERAGE_GAPS', status), 'MISROUTED', status);
  // Pending / blocked / failed first passes are not classified either way.
  for (const status of ['NEEDS_CLARIFICATION', 'NEEDS_CONFIRMATION', 'NEEDS_ENTITY', 'BLOCKED', 'UNAVAILABLE', 'NOT_APPLICABLE', 'FAILED']) {
    assert.equal(classifyLaunchedOutcome(attribution, 'MAINTENANCE_STATUS', status), null, status);
  }
});

test('outcomes are recorded on the existing counter with only the three bounded labels', async () => {
  const attribution = { sourceExecutionId: 'high-cardinality-id', sourceSkill: 'home-operations', targetSkill: 'maintenance', targetOperationId: 'MAINTENANCE_STATUS' };
  const read = async (outcome) => {
    const metric = await askSkillHandoffsTotal.get();
    return metric.values.find((entry) => entry.labels.outcome === outcome && entry.labels.source_skill === 'home-operations' && entry.labels.target_skill === 'maintenance')?.value ?? 0;
  };
  const before = { OPENED: await read('OPENED'), COMPLETED: await read('COMPLETED'), MISROUTED: await read('MISROUTED') };
  recordHandoffOutcome('OPENED', attribution);
  recordHandoffOutcome('COMPLETED', attribution);
  recordHandoffOutcome('MISROUTED', attribution);
  recordHandoffOutcome('OPENED', attribution);
  assert.equal(await read('OPENED'), before.OPENED + 2);
  assert.equal(await read('COMPLETED'), before.COMPLETED + 1);
  assert.equal(await read('MISROUTED'), before.MISROUTED + 1);
  const metric = await askSkillHandoffsTotal.get();
  for (const entry of metric.values) assert.deepEqual(Object.keys(entry.labels).sort(), ['outcome', 'source_skill', 'target_skill']);
  assert.ok(!metric.values.some((entry) => JSON.stringify(entry.labels).includes('high-cardinality-id')), 'execution ids must never be labels');
});

test('the request contract accepts handoffFromExecutionId and keeps it distinct from sourceExecutionId', () => {
  const parsed = CreateAskExecutionRequestSchema.parse({
    clientRequestId: 'c1', sessionId: 's1', message: 'Understand maintenance status',
    launchContext: { surface: 'ASK_PAGE', handoffFromExecutionId: 'exec-9' },
  });
  assert.equal(parsed.launchContext.handoffFromExecutionId, 'exec-9');
  assert.equal(parsed.launchContext.sourceExecutionId, undefined);
  assert.equal(CreateAskExecutionRequestSchema.safeParse({ clientRequestId: 'c', sessionId: 's', message: 'm', launchContext: { surface: 'x', handoffFromExecutionId: 'x'.repeat(161) } }).success, false);
});

test('creation wiring: OPENED only for a new execution, completion classified after the routed result, telemetry never throws into the answer', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  const duplicateReturn = source.indexOf('if (duplicate) {');
  const opened = source.indexOf("recordHandoffOutcome('OPENED'");
  const completion = source.indexOf('classifyLaunchedOutcome(handoffAttribution');
  assert.ok(duplicateReturn > -1 && opened > duplicateReturn, 'OPENED must come after the duplicate-request early return so a replay cannot double-count');
  assert.ok(completion > opened, 'completion is classified after the operation has run');
  assert.match(source, /resolveHandoffAttribution\(userId, input\.launchContext\.handoffFromExecutionId\)/);
  assert.match(source, /Telemetry must never fail the answer/);
  assert.match(source, /eventType: 'SKILL_HANDOFF_OPENED'/);
});
