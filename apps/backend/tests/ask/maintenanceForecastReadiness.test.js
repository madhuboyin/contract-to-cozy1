require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { operationSpecificContinuationCandidates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { operationSpecificContinuationProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { forecastSetupRecoveryCandidates } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const records = { hasPendingMaintenance: true, hasOpenInspectionFindings: true, hasUnresolvedRecallMatches: true };
const targets = (candidates) => candidates.map((candidate) => candidate.operationId);

test('every source that recommends the maintenance forecast stops doing so when no verified system can be forecast', () => {
  const sources = Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES)
    .filter(([, recipes]) => recipes.some((recipe) => recipe.operationId === 'MAINTENANCE_FORECAST')).map(([source]) => source);
  assert.ok(sources.length >= 5, `expected several forecast sources, got ${sources.join(',')}`);
  for (const source of sources) {
    assert.ok(targets(operationSpecificContinuationCandidates(source, PROPERTY, { ...records, hasForecastableSystem: true })).includes('MAINTENANCE_FORECAST'), `${source}: kept when forecastable`);
    assert.ok(!targets(operationSpecificContinuationCandidates(source, PROPERTY, { ...records, hasForecastableSystem: false })).includes('MAINTENANCE_FORECAST'), `${source}: dropped when not forecastable`);
    assert.ok(targets(operationSpecificContinuationCandidates(source, PROPERTY, records)).includes('MAINTENANCE_FORECAST'), `${source}: unknown readiness keeps the recipe`);
  }
});

test('forecast readiness does not apply HOME_ACTIONS record gating to other sources', () => {
  // MAINTENANCE_TASK_COMPLETE links back to MAINTENANCE_STATUS as intentional navigation even with no other pending tasks.
  const empty = { hasPendingMaintenance: false, hasOpenInspectionFindings: false, hasUnresolvedRecallMatches: false, hasForecastableSystem: false };
  assert.ok(targets(operationSpecificContinuationCandidates('MAINTENANCE_TASK_COMPLETE', PROPERTY, empty)).includes('MAINTENANCE_STATUS'));
  assert.ok(!targets(operationSpecificContinuationCandidates('HOME_ACTIONS', PROPERTY, empty)).includes('MAINTENANCE_STATUS'), 'HOME_ACTIONS gating is unchanged');
});

test('the producer loads only forecast readiness for non-HOME_ACTIONS sources, and fails open when the read fails', async () => {
  const calls = [];
  const nominate = (loadState) => operationSpecificContinuationProducer.nominate({ sourceOperationId: 'MAINTENANCE_STATUS', propertyId: PROPERTY, loadOperationSpecificContinuationState: loadState });
  const gated = await nominate(async (propertyId, needs) => { calls.push([propertyId, needs]); return { ...records, hasForecastableSystem: false }; });
  assert.deepEqual(calls, [[PROPERTY, { records: false, forecast: true }]]);
  assert.ok(!targets(gated).includes('MAINTENANCE_FORECAST'));
  assert.ok(targets(gated).includes('HOME_ACTIONS'));

  const failedOpen = await nominate(async () => { throw new Error('db down'); });
  assert.ok(targets(failedOpen).includes('MAINTENANCE_FORECAST'), 'readiness is an optimisation; a failed read keeps the recipe');

  const none = await operationSpecificContinuationProducer.nominate({ sourceOperationId: 'DOCUMENT_LOOKUP', propertyId: PROPERTY, loadOperationSpecificContinuationState: async () => { throw new Error('must not load'); } });
  assert.ok(none.length > 0, 'sources with no forecast recipe never load state');
});

test('the no-verified-systems result offers a schema-valid recovery chip to the property inventory', () => {
  const [candidate] = forecastSetupRecoveryCandidates(PROPERTY);
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(candidate).success, true);
  assert.equal(`${candidate.operationId}:${candidate.outcomeKey}`, 'INVENTORY_LOOKUP:REVIEW_HOME_INVENTORY');
  assert.equal(candidate.traits.recovery, true);
  assert.equal(candidate.traits.promotional, false);
  assert.equal(candidate.entityContext.entityId, null);
});
