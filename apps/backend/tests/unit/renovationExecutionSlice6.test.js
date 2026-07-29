const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  projectStatusForPermitInspection,
  projectStatusForComplianceCondition,
} = require('../../src/services/renovationExecution.service.ts');
const {
  CreateChangeOrderSchema,
  ReviewChangeOrderComplianceSchema,
} = require('../../src/validators/projectTracker.validators.ts');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '../../src/services/projectTracker.service.ts'),
  'utf8',
);
const executionSource = fs.readFileSync(
  path.join(__dirname, '../../src/services/renovationExecution.service.ts'),
  'utf8',
);

test('permit and HOA source states map deterministically into the Project timeline', () => {
  assert.equal(projectStatusForPermitInspection('NOT_SCHEDULED'), 'UPCOMING');
  assert.equal(projectStatusForPermitInspection('SCHEDULED'), 'IN_PROGRESS');
  assert.equal(projectStatusForPermitInspection('FAILED'), 'BLOCKED');
  assert.equal(projectStatusForPermitInspection('PARTIAL'), 'BLOCKED');
  assert.equal(projectStatusForPermitInspection('PASSED'), 'COMPLETE');

  assert.equal(projectStatusForComplianceCondition('OPEN', true), 'BLOCKED');
  assert.equal(projectStatusForComplianceCondition('OPEN', false), 'UPCOMING');
  assert.equal(projectStatusForComplianceCondition('EXPIRED', false), 'BLOCKED');
  assert.equal(projectStatusForComplianceCondition('SATISFIED', true), 'COMPLETE');
});

test('every change order carries a structured compliance impact assessment', () => {
  const missing = CreateChangeOrderSchema.safeParse({
    title: 'Move wall',
    description: 'Move the approved wall by twelve inches.',
    category: 'DESIGN_CHANGE',
    costDeltaCents: 120000,
    proposedByName: 'Builder',
  });
  assert.equal(missing.success, false);

  const scheduleOnlyAndStructural = CreateChangeOrderSchema.safeParse({
    title: 'Mixed change',
    description: 'Invalid contradictory assessment.',
    category: 'DESIGN_CHANGE',
    costDeltaCents: 0,
    proposedByName: 'Builder',
    complianceImpact: {
      scheduleOnly: true,
      structuralEffectsChanged: true,
      explanation: 'Both schedule-only and structural.',
    },
  });
  assert.equal(scheduleOnlyAndStructural.success, false);
});

test('completed compliance reviews require explicit dispositions and review notes', () => {
  assert.equal(ReviewChangeOrderComplianceSchema.safeParse({
    amendedPermitStatus: 'CONFIRMED',
    hoaReapprovalStatus: 'CONFIRMED',
    evidenceDocumentIds: ['document-1'],
    reviewNotes: 'Authority and association confirmations recorded.',
  }).success, true);
  assert.equal(ReviewChangeOrderComplianceSchema.safeParse({
    amendedPermitStatus: 'CONFIRMED',
    hoaReapprovalStatus: 'CONFIRMED',
    evidenceDocumentIds: [],
    reviewNotes: '',
  }).success, false);
});

test('Project mutations enforce source authority for projections and compliance issues', () => {
  assert.match(serviceSource, /EXECUTION_PROJECTION_READ_ONLY/);
  assert.match(serviceSource, /PERMIT_TRACKER_AUTHORITY_REQUIRED/);
  assert.match(serviceSource, /EXECUTION_ISSUE_SOURCE_AUTHORITY_REQUIRED/);
  assert.match(serviceSource, /CHANGE_ORDER_COMPLIANCE_RECHECK_REQUIRED/);
});

test('failed inspections remain idempotent blockers until the Permit source passes', () => {
  assert.match(executionSource, /projectId_sourceEntityType_sourceEntityId/);
  assert.match(executionSource, /inspection\\.status === 'FAILED' \\|\\| inspection\\.status === 'PARTIAL'/);
  assert.match(executionSource, /inspection\\.status === 'PASSED' \\|\\| inspection\\.status === 'CANCELLED'/);
  assert.match(executionSource, /status: 'RESOLVED'/);
  assert.match(executionSource, /idempotencyKey: `renovation-execution:/);
  assert.match(executionSource, /permit\.status === 'CORRECTION_REQUESTED'/);
  assert.match(executionSource, /sourceEntityType: 'PERMIT_CORRECTION'/);
  assert.match(executionSource, /reconciliationStatus: 'ERROR'/);
});
