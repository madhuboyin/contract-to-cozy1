const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildToolLifecycleFunnelResponse,
} = require('../../src/services/adminAnalytics/metricsService.ts');

test('admin tool lifecycle metrics expose unique-home conversion and abandonment', () => {
  const response = buildToolLifecycleFunnelResponse(
    {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-20T23:59:59.999Z'),
    },
    [{
      toolId: 'coverage-options',
      discoveredHomes: 10n,
      clickedHomes: 8n,
      startedHomes: 6n,
      outputHomes: 5n,
      completedHomes: 3n,
      abandonedHomes: 2n,
    }],
    [{ stage: 'TOOL_COMPLETED', uniqueHomes: 3n, totalEvents: 4n }],
  );

  assert.equal(response.tools[0].clickThroughRate, 0.8);
  assert.equal(response.tools[0].startRate, 0.75);
  assert.equal(response.tools[0].completionRate, 0.5);
  assert.equal(response.tools[0].abandonedHomes, 2);
  assert.deepEqual(response.stages[0], {
    stage: 'COMPLETED',
    uniqueHomes: 3,
    totalEvents: 4,
  });
});
