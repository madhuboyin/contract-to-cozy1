const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Background goal extraction with no home value on record is insufficient context, not a failure: no estimate is run, no decision thread is created,
// PLANNING_HOME_VALUE_REQUIRED is recorded on the child execution, and the event is marked PROCESSED so the queue never retries it.

const prismaModule = require('../../src/lib/prisma.ts');
const { SellHoldRentService } = require('../../src/services/sellHoldRent.service.ts');
const { homeValueRequired } = require('../../src/services/planningHomeValue.ts');
const { sellHoldRentDecisionFamilyAdapter } = require('../../src/services/decisionPlatform/domainSnapshotAdapters.ts');
const { processGoalCandidateAttachEvent } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');
const { AskCaptureAttribution } = require('@prisma/client');

const realPrisma = prismaModule.prisma;
const realOutcome = SellHoldRentService.prototype.estimateOutcome;
const realEstimate = SellHoldRentService.prototype.estimate;
const realCreateThread = sellHoldRentDecisionFamilyAdapter.createOrResumeThread;
let created;
let processed;
let estimates;
let threads;
let existing;

const payload = () => ({
  payloadVersion: 1, parentExecutionId: 'parent-1', index: 0, userId: 'u1', sessionId: 's1', propertyId: 'p1', contextVersion: null,
  candidate: { decisionDefinitionId: 'SELL_HOLD_RENT', timeframeLabel: 'next year', sourceSentence: 'I am thinking about selling next year.', extractionConfidence: 0.9, attribution: Object.values(AskCaptureAttribution)[0] },
});

test.beforeEach(() => {
  created = []; processed = []; estimates = []; threads = []; existing = null;
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'askExecution') return {
        findUnique: async () => existing,
        create: async ({ data }) => { const row = { id: 'child-1', ...data }; created.push(row); existing = row; return row; },
      };
      if (model === 'domainEvent') return { updateMany: async (args) => { processed.push(args); return { count: 1 }; } };
      return new Proxy({}, { get: () => async () => { throw new Error(`Unexpected prisma.${String(model)} access`); } });
    },
  });
  SellHoldRentService.prototype.estimateOutcome = async function () { estimates.push('outcome'); return homeValueRequired(); };
  SellHoldRentService.prototype.estimate = async function () { estimates.push('estimate'); throw new Error('must not run'); };
  sellHoldRentDecisionFamilyAdapter.createOrResumeThread = async () => { threads.push(1); throw new Error('must not create a thread'); };
});
test.after(() => {
  prismaModule.prisma = realPrisma;
  SellHoldRentService.prototype.estimateOutcome = realOutcome;
  SellHoldRentService.prototype.estimate = realEstimate;
  sellHoldRentDecisionFamilyAdapter.createOrResumeThread = realCreateThread;
});

test('a goal with no home value records the reason, skips the estimate and thread, and completes the job', async () => {
  const execution = await processGoalCandidateAttachEvent({ id: 'event-1', payload: payload() }, 1);
  assert.equal(execution.status, 'NOT_APPLICABLE');
  assert.equal(execution.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
  assert.equal(execution.operationId, 'SELL_HOLD_RENT_GOAL_CAPTURE');
  assert.deepEqual(estimates, ['outcome'], 'only the outcome check ran, never the analysis');
  assert.deepEqual(threads, [], 'no decision thread is created on invented data');
  assert.equal(processed.length, 1, 'the event is marked processed, so it is not retried');
  assert.equal(processed[0].data.status, 'PROCESSED');
  assert.match(execution.resultJson.blocks[0].body, /What if my home is worth/);
});

test('a replayed event converges on the same child row and still completes', async () => {
  await processGoalCandidateAttachEvent({ id: 'event-1', payload: payload() }, 1);
  const again = await processGoalCandidateAttachEvent({ id: 'event-1', payload: payload() }, 2);
  assert.equal(created.length, 1, 'no second child row');
  assert.equal(again.reasonCode, 'PLANNING_HOME_VALUE_REQUIRED');
  assert.equal(processed.length, 2);
});
