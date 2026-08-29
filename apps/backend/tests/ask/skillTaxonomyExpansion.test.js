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
  'repair-replace': ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE', 'HVAC_SPECIALIST_ENGAGE', 'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_ABANDON', 'HVAC_PREFERENCE_SAVE', 'HVAC_PREFERENCE_FORGET', 'HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK'],
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
  'property-record': ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP', 'HOME_CHANGE_SUMMARY'],
  household: ['HOUSEHOLD_INVITATION'],
  'buyer-closing': [
    'BUYER_PLAN_STATUS', 'BUYER_DEADLINES', 'BUYER_DOCUMENT_READINESS', 'BUYER_INSPECTION_REVIEW',
    'BUYER_TASK_COMPLETE', 'BUYER_TASK_CREATE', 'BUYER_TASK_UPDATE', 'BUYER_MOVE_STATUS',
    'BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_WALKTHROUGH_READINESS',
    'BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_CLOSING_DAY_READINESS', 'BUYER_CONTRACT_TIMELINE',
    'BUYER_NEGOTIATION_READINESS', 'BUYER_COST_READINESS', 'BUYER_FINDING_DISPOSITION', 'BUYER_LIFECYCLE_UPDATE',
  ],
  'incident-claim': ['INCIDENT_CLAIM_STATUS', 'CLAIM_FILE', 'CLAIM_TRANSITION', 'INCIDENT_CONTINUATION'],
  'home-operations': ['HOME_ACTIONS', 'OPERATIONAL_WORK_UPDATE', 'GUIDANCE_JOURNEY_CREATE'],
  'inspection-findings': ['INSPECTION_FINDINGS', 'INSPECTION_FINDING_UPDATE'],
  'document-promotion': ['DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_PROMOTION_CONFIRM'],
  'query-envelope': ['INTELLIGENCE_ENVELOPE_QUERY'],
});

const EXPANDED_SKILLS = Object.freeze([
  'capital-planning', 'coverage', 'household', 'ownership-cost', 'property-tax',
  'quote-comparison', 'renovation', 'savings', 'sell-hold-rent', 'seller-preparation',
  'buyer-closing', 'incident-claim', 'home-operations',
]);

test('all twenty representative Skills own the intended canonical operations', () => {
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
