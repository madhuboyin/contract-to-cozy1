require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { capabilityRecommendationCandidates, removeSelectedCapabilityDuplicates, CAPABILITY_RECOMMENDATION_OUTCOME } = require('../../src/services/ask/suggestedActions/capabilityRecommendationCandidates.ts');

const capability = (over = {}) => ({ id: 'documents', label: 'Documents', description: 'Review records', expectedOutput: 'A list', href: '/documents', inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'DOCUMENT_LOOKUP', message: 'Show documents for this home' }, inlineBoundary: 'Read only', readiness: 'READY', readinessLabel: null, readinessReasons: [], releaseStage: 'ACTIVE', ...over });
const result = (capabilities) => ({ status: 'ANSWERED', blocks: [{ type: 'CAPABILITY_LIST', id: 'ask-next-actions', title: 'What comes next', capabilities }], suggestions: [] });

test('only conservative viewer-safe standard read capability launches become candidates', () => {
  const candidates = capabilityRecommendationCandidates(result([
    capability(),
    capability({ id: 'continuity', inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_DIGITAL_WILL', message: 'Show my continuity plan' } }),
    capability({ id: 'coverage', inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'COVERAGE_GAPS', message: 'Show coverage gaps' } }),
  ]), 'p1');
  assert.deepEqual(candidates.map((item) => item.operationId), ['DOCUMENT_LOOKUP']);
  assert.equal(candidates[0].outcomeKey, CAPABILITY_RECOMMENDATION_OUTCOME);
});

test('only a selected compact capability destination is removed from the richer capability block', () => {
  const base = result([capability(), capability({ id: 'inventory', label: 'Inventory', inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'INVENTORY_LOOKUP', message: 'Show inventory' } })]);
  const presented = removeSelectedCapabilityDuplicates({ ...base, suggestedNextActions: [{ operationId: 'DOCUMENT_LOOKUP', outcomeKey: CAPABILITY_RECOMMENDATION_OUTCOME, provenance: { source: 'CAPABILITY_RECOMMENDATION' } }] });
  assert.deepEqual(presented.blocks[0].capabilities.map((item) => item.id), ['inventory']);
});
