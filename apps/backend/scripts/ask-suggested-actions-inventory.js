#!/usr/bin/env node
// Prints the Suggested Next Actions inventory straight from the executable registries, so audits and docs never rely on hand-maintained
// totals. Run from apps/backend:  node scripts/ask-suggested-actions-inventory.js   (add --json for machine-readable output)
require('ts-node/register/transpile-only');

const { ASK_OPERATION_DEFINITIONS } = require('../src/services/ask/askOperationRegistry.ts');
const registry = require('../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { buildOperationSpecificContinuationCoverage } = require('../src/services/ask/suggestedActions/operationSpecificContinuationCoverage.ts');

const RANK = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const READ_FAMILIES = new Set(['RECORD_QUERY', 'STATUS_SUMMARY', 'DECISION_ANALYSIS', 'WORKFLOW_GUIDANCE']);
const floor = (operationId) => ASK_OPERATION_DEFINITIONS[operationId].propertyRoleFloor;

const outcomes = Object.entries(registry.SUGGESTED_ACTION_OUTCOMES).flatMap(([operationId, keys]) => keys.map((outcomeKey) => ({ operationId, outcomeKey })));
const readOutcomes = outcomes.filter(({ operationId }) => READ_FAMILIES.has(ASK_OPERATION_DEFINITIONS[operationId]?.family));
const recipes = Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES);
const higherFloorEdges = recipes.flatMap(([source, list]) => list.filter((r) => RANK[floor(r.operationId)] > RANK[floor(source)]).map((r) => `${source}>${r.operationId}`));
const coverage = buildOperationSpecificContinuationCoverage().reduce((acc, entry) => ({ ...acc, [entry.coverageClass]: (acc[entry.coverageClass] ?? 0) + 1 }), {});

const report = {
  operations: Object.keys(ASK_OPERATION_DEFINITIONS).length,
  registeredOutcomes: outcomes.length,
  repeatableOutcomes: registry.REPEATABLE_OUTCOMES.size,
  propertyWideOutcomes: registry.PROPERTY_WIDE_OUTCOMES.size,
  promptHistoryExemptOutcomes: registry.PROMPT_HISTORY_EXEMPT_OUTCOMES.size,
  readOrientedOutcomes: readOutcomes.length,
  readOrientedNonRepeatable: readOutcomes.filter(({ operationId, outcomeKey }) => !registry.isRepeatableOutcome(operationId, outcomeKey)).length,
  recipeSourceOperations: recipes.length,
  recipes: recipes.reduce((sum, [, list]) => sum + list.length, 0),
  coverageClasses: coverage,
  higherRoleFloorRecipeEdges: higherFloorEdges.length,
};

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else for (const [key, value] of Object.entries(report)) console.log(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
