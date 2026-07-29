'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  evaluateRequirementCompletionCheck,
} = require('../../src/services/projectCompliance/completionPolicy.ts');
const {
  CreateProjectSchema,
  UpdateProjectSchema,
} = require('../../src/validators/projectTracker.validators.ts');

function evaluate(applicability, requiredSatisfied = false) {
  return evaluateRequirementCompletionCheck({
    key: 'permit_closeout',
    label: 'Required permit officially finaled',
    applicability,
    basis: applicability === 'UNKNOWN' ? null : 'Authority record P-100',
    requiredSatisfied,
    requiredBlockers: ['Record authority-backed finalization.'],
  });
}

test('unknown requirement applicability is not evaluated and never passes', () => {
  const result = evaluate('UNKNOWN');
  assert.equal(result.status, 'NOT_EVALUATED');
  assert.equal(result.passed, false);
  assert.match(result.blockers[0], /record whether/i);
});

test('required applicability only passes when authoritative evidence is satisfied', () => {
  const unresolved = evaluate('REQUIRED', false);
  assert.equal(unresolved.status, 'FAILED');
  assert.equal(unresolved.passed, false);

  const resolved = evaluate('REQUIRED', true);
  assert.equal(resolved.status, 'PASSED');
  assert.equal(resolved.passed, true);
});

test('explicit non-applicability and acknowledged waiver have distinct results', () => {
  assert.deepEqual(
    [evaluate('NOT_REQUIRED_CONFIRMED').status, evaluate('NOT_APPLICABLE').status],
    ['NOT_APPLICABLE', 'NOT_APPLICABLE'],
  );
  assert.equal(evaluate('WAIVED_WITH_ACKNOWLEDGMENT').status, 'WAIVED');
});

test('project applicability decisions require a source or rationale', () => {
  const create = CreateProjectSchema.safeParse({
    name: 'Kitchen project',
    projectType: 'KITCHEN_REMODEL',
    contractorName: 'Example Contractor',
    contractAmountCents: 100000,
    startDate: '2026-07-29',
    permitApplicability: 'REQUIRED',
  });
  assert.equal(create.success, false);

  const update = UpdateProjectSchema.safeParse({
    hoaApplicability: 'NOT_APPLICABLE',
    hoaApplicabilityBasis: 'No association governs this property.',
  });
  assert.equal(update.success, true);
});

test('completion and milestone links enforce project and property scope', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/projectTracker.service.ts'),
    'utf8',
  );

  assert.match(service, /sourceEntityType:\s*'PROJECT'/);
  assert.match(service, /sourceEntityId:\s*projectId/);
  assert.match(service, /permitRecord:\s*\{[\s\S]*sourceEntityId:\s*projectId/);
  assert.match(service, /id:\s*data\.dependsOnMilestoneId,\s*projectId,\s*propertyId/);
  assert.match(service, /permit\.status === 'FINALED'/);
  assert.match(service, /permit\.finaledDate != null/);
  assert.match(service, /permit\.source === 'OPEN_DATA_API' \|\| permit\.isVerified/);
  assert.match(service, /approval\.decisionTruthLayer === 'SOURCE_OBSERVED'/);
  assert.match(service, /approval\.decisionTruthLayer === 'ASSOCIATION_CONFIRMED'/);
  assert.doesNotMatch(service, /unpassed\.length === 0/);
});
