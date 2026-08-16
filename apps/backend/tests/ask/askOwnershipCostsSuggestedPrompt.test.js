const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { matchesOwnershipCostsAnswerContract } = require('../../src/services/ask/askOwnershipCostsIntent.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTIONS = [
  'What are my biggest ownership costs?',
  'What are the ownership costs for this home after purchase?',
];

function ownershipCostsResult(status = 'READY_WITH_LIMITATIONS') {
  return {
    status,
    blocks: [{
      type: 'SUMMARY', id: 'ownership-costs-summary',
      title: 'Property taxes are the largest recorded category at about $500 per month',
      body: '$12,000 per year is included in the operating expense lens.',
      tone: 'CAUTION',
      actions: [{
        id: 'open-ownership-costs', label: 'Review Ownership Costs',
        href: '/dashboard/properties/property-1/ownership-costs?view=current&lens=OPERATING_EXPENSE',
        style: 'PRIMARY',
      }],
    }, {
      type: 'TABLE', id: 'ownership-cost-categories', title: 'Cost by category',
      description: 'Recorded categories ordered by annual amount.',
      columns: [{ key: 'category', label: 'Category' }, { key: 'annual', label: 'Annual' }],
      rows: [{ id: 'PROPERTY_TAX', values: { category: 'Property taxes', annual: '$6,000' } }],
      actions: [],
    }, {
      type: 'BOUNDARY', id: 'ownership-cost-lens-boundary', title: 'Operating expense lens',
      body: 'Operating expense excludes mortgage principal and capital projects.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

test('first-party ownership-cost prompts route directly', () => {
  for (const question of QUESTIONS) {
    const routing = resolveAskRoutingCascade(question);
    assert.equal(routing.operation.operationId, 'OWNERSHIP_COSTS');
    assert.equal(routing.requiresClarification, false);
  }
});

test('canonical ownership-cost outcomes pass initial and clarified trust', () => {
  for (const status of ['ANSWERED', 'READY_WITH_LIMITATIONS']) {
    const result = ownershipCostsResult(status);
    assert.equal(matchesOwnershipCostsAnswerContract(result), true);
    for (const question of QUESTIONS) {
      const validation = validateAskAnswerTrustPipeline({
        question,
        operationId: 'OWNERSHIP_COSTS', propertyId: 'property-1', semanticEnabled: true,
        recoveryAttempted: true, operationConfirmedByUser: true,
        result: attachAskAuthoritativeSourceEvidence(
          result,
          [completedAskAuthoritativeSourceEvidence('OWNERSHIP_COSTS')],
        ),
      });
      assert.equal(validation.semantic.outcome, 'PASS');
      assert.equal(validation.result.status, status);
    }
  }
});

test('audience explanation remains visible instead of becoming a blank card', () => {
  const validation = validateAskAnswerTrustPipeline({
    question: QUESTIONS[0], operationId: 'OWNERSHIP_COSTS', propertyId: 'property-1', semanticEnabled: true,
    result: {
      status: 'NEEDS_CONTEXT', reasonCode: 'ASK_AUDIENCE_CONTEXT_REQUIRED', suggestions: ['Summarize my home record'],
      parameters: { audiencePresentation: { householdRole: 'OWNER' } },
      blocks: [{
        type: 'BOUNDARY', id: 'ask-audience-applicability', title: 'A little home context is needed',
        body: 'Confirm the home journey before continuing.', severity: 'INFO', suggestions: [],
        actions: [{
          id: 'review-home-journey', label: 'Confirm home journey',
          href: '/dashboard/properties/property-1/onboarding#home-journey', style: 'SECONDARY',
        }],
      }],
    },
  });
  assert.equal(validation.result.blocks.length, 1);
  assert.equal(validation.result.blocks[0].id, 'ask-audience-applicability');
  assert.equal(validation.result.blocks[0].actions.length, 1);
});

test('ownership-cost contract rejects unrelated operation blocks', () => {
  assert.equal(matchesOwnershipCostsAnswerContract({
    status: 'ANSWERED', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'savings-summary', title: 'Savings', body: 'Opportunities.', tone: 'DEFAULT', actions: [] }],
  }), false);
});
