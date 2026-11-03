require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');

const RANK = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const floorOf = (operationId) => ASK_OPERATION_DEFINITIONS[operationId].propertyRoleFloor;

/**
 * Recipes whose destination needs a higher property role than the source operation. The shared availability gate correctly hides them from
 * lower roles, so each is SUPPLEMENTAL: the source must keep at least one recipe usable at its own minimum role (checked below). A new
 * higher-floor edge fails this test until it is reviewed and listed here with a reason.
 */
const REVIEWED_SUPPLEMENTAL_HIGHER_FLOOR_EDGES = {
  'SERVICE_PRICE_CHECK_RUN>SERVICE_PRICE_CHECKS': 'a contributor can run a price check; reviewing the owner-only history is an owner follow-up',
  'QUOTE_COMPARISON_CREATE>SERVICE_PRICE_CHECKS': 'owner-only price history follows creating a comparison',
  'QUOTE_COMPARISON_REVIEW>SERVICE_PRICE_CHECKS': 'owner-only; the viewer baseline is HOME_ACTIONS',
  'QUOTE_COMPARISON_REVIEW>PRICE_FINALIZATIONS_LIST': 'owner-only; the viewer baseline is HOME_ACTIONS',
  'QUOTE_COMPARISON_COMMAND>SERVICE_PRICE_CHECKS': 'owner-only price history follows a comparison command',
  'PRICE_FINALIZATION_COMMAND>PRICE_FINALIZATIONS_LIST': 'owner-only finalized-price list follows a finalization command',
  'DO_NOTHING_SCENARIO_COMMAND>DO_NOTHING_SIMULATION': 'owner-only simulation follows a contributor scenario command',
  'DO_NOTHING_SIMULATION_RUN>DO_NOTHING_SIMULATION': 'owner-only simulation review follows a run',
  'HIRING_GUIDE>SERVICE_PRICE_CHECKS': 'owner-only; the viewer-floor quote comparison recipe is the baseline',
};

const edges = () => Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES).flatMap(([source, recipes]) => recipes
  .filter((recipe) => RANK[floorOf(recipe.operationId)] > RANK[floorOf(source)]).map((recipe) => `${source}>${recipe.operationId}`));

test('every higher-role continuation edge is a reviewed supplemental edge', () => {
  assert.deepEqual([...new Set(edges())].sort(), Object.keys(REVIEWED_SUPPLEMENTAL_HIGHER_FLOOR_EDGES).sort());
});

test('every source operation keeps at least one continuation usable at its own minimum role', () => {
  const lost = Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES)
    .filter(([source, recipes]) => !recipes.some((recipe) => RANK[floorOf(recipe.operationId)] <= RANK[floorOf(source)]))
    .map(([source]) => `${source} (${floorOf(source)})`);
  assert.deepEqual(lost, []);
});
