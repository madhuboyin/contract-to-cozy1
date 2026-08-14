const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { getSkillAdapterForOperation } = require('../../src/services/skills/adapters/skillAdapterRegistry.ts');
const { SKILL_EVALUATION_PACKAGES } = require('../../src/services/skills/skillEvaluationRegistry.ts');
const { SKILL_DEFINITIONS, getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');

const TAXONOMY = Object.freeze({
  maintenance: ['MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'MAINTENANCE_TASK_UPDATE', 'HOME_DEADLINE_MONITOR'],
  'repair-replace': ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE', 'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_ABANDON', 'HVAC_PREFERENCE_SAVE', 'HVAC_PREFERENCE_FORGET', 'HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK'],
  'capital-planning': ['CAPITAL_RESERVE_PLAN'],
  coverage: ['COVERAGE_GAPS'],
  refinance: ['REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR'],
  'ownership-cost': ['OWNERSHIP_COSTS'],
  savings: ['SAVINGS_OPPORTUNITIES'],
  'property-tax': ['PROPERTY_TAX_APPEAL_READINESS'],
  'seller-preparation': ['MAJOR_EVENT_ENTRY'],
  'sell-hold-rent': ['SELL_HOLD_RENT_ANALYSIS'],
  renovation: ['RENOVATION_PERMIT_READINESS'],
  'quote-comparison': ['QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW'],
  'property-record': ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  household: ['HOUSEHOLD_INVITATION'],
});

const EXPANDED_SKILLS = Object.freeze([
  'capital-planning', 'coverage', 'household', 'ownership-cost', 'property-tax',
  'quote-comparison', 'renovation', 'savings', 'sell-hold-rent', 'seller-preparation',
]);

test('all fourteen representative Skills own the intended canonical operations', () => {
  assert.deepEqual(new Set(Object.keys(SKILL_DEFINITIONS)), new Set(Object.keys(TAXONOMY)));
  for (const [skillId, operations] of Object.entries(TAXONOMY)) {
    const skill = SKILL_DEFINITIONS[skillId];
    assert.deepEqual(new Set(skill.operations.map(({ operationId }) => operationId)), new Set(operations), skillId);
    assert.ok(SKILL_EVALUATION_PACKAGES[skill.evaluationSuite], `${skillId} evaluation package`);
    for (const operationId of operations) {
      const adapter = getSkillAdapterForOperation(operationId);
      assert.equal(getSkillForOperation(operationId).id, skillId, operationId);
      assert.ok(adapter, `${operationId} adapter`);
      assert.ok(skill.allowedAdapters.some((reference) => reference.id === adapter.id && reference.version === adapter.version));
    }
  }
});

test('taxonomy expansion remains declarative and adds no per-Skill core routing branches', () => {
  const router = readFileSync(resolve(__dirname, '../../src/services/skills/skillRouter.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  for (const skillId of EXPANDED_SKILLS) {
    const constant = skillId.toUpperCase().replace(/-/g, '_');
    assert.doesNotMatch(router, new RegExp(constant));
    assert.doesNotMatch(orchestrator, new RegExp(`skills/${skillId}|case '${constant}'`));
  }
});

test('external connector permissions remain empty until a governed connector runtime exists', () => {
  for (const skill of Object.values(SKILL_DEFINITIONS)) assert.deepEqual(skill.allowedExternalConnectors, [], skill.id);
});
