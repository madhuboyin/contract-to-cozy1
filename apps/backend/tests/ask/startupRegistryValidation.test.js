const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// index.ts refuses to boot when a registry validator reports an issue, so a mistake here is a production crash loop (RECALL_REVIEW,
// 2026-09-29; HOME_HABIT_UPDATE, caught 2026-10-05 before deploy). No other test boots the app, so run the checks that have bitten.
require('../../src/services/ask/askOrchestrator.service.ts');
const { validateSkillOperationGovernanceCoverage } = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { validateIntelligenceRegistries } = require('../../src/services/intelligence');

test('every Ask operation with a role floor has an owning skill or is a documented skill-less operation', () => {
  assert.deepEqual(validateSkillOperationGovernanceCoverage({ skillCoversOperation: (operationId) => Boolean(getSkillForOperation(operationId)) }), []);
});

test('the Home Intelligence registries validate', () => {
  assert.deepEqual(validateIntelligenceRegistries(), []);
});
