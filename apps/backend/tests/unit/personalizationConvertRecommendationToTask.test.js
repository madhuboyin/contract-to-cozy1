const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function loadUseCase({ recommendation = undefined, deduped = false } = {}) {
  const taskCalls = [];
  const feedbackCalls = [];
  const stored = recommendation === undefined ? {
    id: 'rec-1',
    definition: { code: 'hvac_filter_replacement_check_proof' },
    explanations: [{ headline: 'Check HVAC filter', reasonCodes: [] }],
  } : recommendation;

  installModule('../../src/services/PropertyMaintenanceTask.service.ts', {
    PropertyMaintenanceTaskService: {
      createFromActionCenter: async (...args) => {
        taskCalls.push(args);
        return { task: { id: 'task-1', title: args[2].title }, deduped };
      },
    },
  });
  installModule('../../src/modules/personalization/infrastructure/pilotRepository.ts', {
    loadActiveRecommendationForAction: async () => stored,
  });
  installModule('../../src/modules/personalization/application/recordRecommendationFeedback.usecase.ts', {
    recordRecommendationFeedback: async (params) => {
      feedbackCalls.push(params);
      return { status: 'RECORDED', suppressed: false };
    },
  });
  installModule('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts', {
    materializePilotRecommendationsForProperty: async () => ({ evaluated: 3, active: 1 }),
  });
  const path = require.resolve('../../src/modules/personalization/application/convertRecommendationToMaintenanceTask.usecase.ts');
  delete require.cache[path];
  return { ...require(path), taskCalls, feedbackCalls };
}

const params = {
  recommendationId: 'rec-1',
  propertyId: 'prop-1',
  userId: 'user-1',
  idempotencyKey: 'event-1',
};

test('converts through the existing task service and records explicit acceptance', async () => {
  const { convertRecommendationToMaintenanceTask, taskCalls, feedbackCalls } = loadUseCase();
  const result = await convertRecommendationToMaintenanceTask(params);
  assert.equal(result.status, 'CREATED');
  assert.equal(taskCalls[0][2].actionKey, 'personalization:rec-1:maintenance-task');
  assert.deepEqual(feedbackCalls[0], {
    recommendationId: 'rec-1', eventId: 'personalization-task-accepted:rec-1', type: 'ACCEPTED', explicit: true,
  });
});

test('returns EXISTING when the task service dedupes the conversion', async () => {
  const { convertRecommendationToMaintenanceTask } = loadUseCase({ deduped: true });
  assert.equal((await convertRecommendationToMaintenanceTask(params)).status, 'EXISTING');
});

test('rejects missing and unsupported recommendations without creating a task', async () => {
  const missing = loadUseCase({ recommendation: null });
  assert.equal((await missing.convertRecommendationToMaintenanceTask(params)).status, 'RECOMMENDATION_NOT_FOUND');
  assert.equal(missing.taskCalls.length, 0);

  const unsupported = loadUseCase({
    recommendation: { id: 'rec-2', definition: { code: 'unknown' }, explanations: [] },
  });
  assert.equal((await unsupported.convertRecommendationToMaintenanceTask(params)).status, 'ACTION_NOT_SUPPORTED');
  assert.equal(unsupported.taskCalls.length, 0);
});
