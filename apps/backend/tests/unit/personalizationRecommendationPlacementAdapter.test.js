const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildMaintenanceTaskFromRecommendation,
  mapRecommendationToModule,
} = require('../../src/modules/personalization/adapters/recommendationPlacement.adapter.ts');

const stored = {
  id: 'rec-1',
  status: 'ACTIVE',
  score: 75,
  priorityBand: 'HIGH',
  confidence: 0.9,
  expiresAt: null,
  definition: { code: 'smoke_co_detector_battery_check', category: 'low_cost_prevention' },
  explanations: [{
    headline: 'Check detector batteries',
    reasonCodes: [{ params: { message: 'A battery check may be due.' } }],
  }],
};

test('maps one stored recommendation into the stable Maintenance placement contract', () => {
  const item = mapRecommendationToModule(stored, 'MAINTENANCE', true);
  assert.equal(item.title, 'Check detector batteries');
  assert.equal(item.summary, 'A battery check may be due.');
  assert.deepEqual(item.actions, [{ type: 'CONVERT_TO_TASK', label: 'Add to maintenance', enabled: true }]);
});

test('builds a deterministic maintenance action with a recommendation-scoped key', () => {
  const task = buildMaintenanceTaskFromRecommendation(stored);
  assert.equal(task.assetType, 'SMOKE_CO_DETECTOR');
  assert.equal(task.priority, 'HIGH');
  assert.equal(task.actionKey, 'personalization:rec-1:maintenance-task');
});

test('unknown definitions never leak into a module placement or action', () => {
  const unknown = { ...stored, definition: { code: 'unknown', category: 'unknown' } };
  assert.equal(mapRecommendationToModule(unknown, 'MAINTENANCE', true), null);
  assert.equal(buildMaintenanceTaskFromRecommendation(unknown), null);
});
