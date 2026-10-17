const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { hvacDecisionThreadAmbiguousResult } = require('../../src/services/ask/handlers/hvacDecision.handler.ts');

test('HVAC outcome ambiguity declares its complete candidate collection for every outcome operation', () => {
  const candidates = Array.from({ length: 3 }, (_, index) => ({ id: `thread-${index}`, title: `HVAC decision ${index}`, lifecycleStatus: 'ACTIVE' }));
  for (const operationId of ['HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK']) {
    const result = hvacDecisionThreadAmbiguousResult(operationId, candidates);
    const list = result.blocks.find((block) => block.id === 'hvac-decision-thread-candidates');
    assert.deepEqual(list.collection, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false }, operationId);
    assert.deepEqual(list.sections[0].items.map((item) => item.id), candidates.map((candidate) => candidate.id), operationId);
  }
});
