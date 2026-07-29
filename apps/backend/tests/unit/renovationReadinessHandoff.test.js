'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  EvaluateRenovationReadinessSchema,
  GovernRenovationReadinessOverrideSchema,
  HandoffRenovationProjectSchema,
  UpdateRenovationReadinessItemSchema,
} = require('../../src/validators/renovationReadiness.validators.ts');

test('readiness evaluation requires an explicit execution mode', () => {
  assert.equal(EvaluateRenovationReadinessSchema.parse({}).fulfillmentMode, 'PROVIDER');
  assert.equal(EvaluateRenovationReadinessSchema.safeParse({ fulfillmentMode: 'DIY' }).success, true);
});

test('governed overrides require meaningful reason and explicit risk acknowledgment', () => {
  assert.equal(GovernRenovationReadinessOverrideSchema.safeParse({
    action: 'ACKNOWLEDGE',
    reason: 'Proceed anyway.',
    riskAcknowledged: true,
  }).success, false);
  assert.equal(GovernRenovationReadinessOverrideSchema.safeParse({
    action: 'ACKNOWLEDGE',
    reason: 'The owner accepts the documented scheduling risk for this open item.',
    riskAcknowledged: true,
  }).success, true);
  assert.equal(GovernRenovationReadinessOverrideSchema.safeParse({
    action: 'ACKNOWLEDGE',
    reason: 'The owner accepts the documented scheduling risk for this open item.',
    riskAcknowledged: false,
  }).success, false);
});

test('manual readiness completion requires property-document evidence', () => {
  assert.equal(UpdateRenovationReadinessItemSchema.safeParse({
    status: 'SATISFIED',
    satisfactionNotes: 'Completed.',
  }).success, false);
  assert.equal(UpdateRenovationReadinessItemSchema.safeParse({
    status: 'SATISFIED',
    satisfactionNotes: 'Verified against the signed contract.',
    evidenceDocumentId: 'document-1',
  }).success, true);
});

test('provider handoff requires a contractor and historical intake requires context', () => {
  const base = {
    projectType: 'KITCHEN_REMODEL',
    fulfillmentMode: 'PROVIDER',
    startDate: '2026-08-15',
    idempotencyKey: 'handoff-1',
  };
  assert.equal(HandoffRenovationProjectSchema.safeParse(base).success, false);
  assert.equal(HandoffRenovationProjectSchema.safeParse({
    ...base,
    contractorName: 'Example Construction',
  }).success, true);
  assert.equal(HandoffRenovationProjectSchema.safeParse({
    ...base,
    contractorName: 'Example Construction',
    intakeMode: 'ALREADY_STARTED',
  }).success, false);
  assert.equal(HandoffRenovationProjectSchema.safeParse({
    ...base,
    contractorName: 'Example Construction',
    intakeMode: 'ALREADY_STARTED',
    historicalReason: 'Work began before the renovation case was created in the product.',
  }).success, true);
});

test('readiness and handoff preserve source authority, scope identity, audit, and Home Action activation', () => {
  const readiness = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationReadiness.service.ts'),
    'utf8',
  );
  const cases = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationCase.service.ts'),
    'utf8',
  );
  const projects = fs.readFileSync(
    path.join(__dirname, '../../src/services/projectTracker.service.ts'),
    'utf8',
  );
  const schema = fs.readFileSync(
    path.join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/renovations/[caseId]/readiness/page.tsx'),
    'utf8',
  );

  for (const state of [
    'NOT_EVALUATED',
    'NOT_READY',
    'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS',
    'READY',
  ]) {
    assert.match(readiness, new RegExp(`'${state}'`));
  }
  assert.match(readiness, /does not establish legal compliance/);
  assert.match(readiness, /RENOVATION_READINESS_OVERRIDE_PROHIBITED/);
  assert.match(readiness, /sourceChanged/);
  assert.match(readiness, /staleReason/);
  assert.match(readiness, /relatedPermit\.status/);
  assert.match(readiness, /relatedHoaApproval\.decisionStatus/);
  assert.match(readiness, /renovationScopeSnapshot/);
  assert.match(readiness, /inheritedConditions/);
  assert.match(readiness, /evidenceRequirements/);
  assert.match(readiness, /resolveAndUpsertWorkItem/);
  assert.match(readiness, /to:\s*'IN_PROJECT'/);
  assert.match(cases, /RENOVATION_CASE_READINESS_REQUIRED/);
  assert.match(cases, /changedSourceCount/);
  assert.match(cases, /sourceProjectionChanged/);
  assert.match(cases, /RENOVATION_CASE_PROJECT_HANDOFF_REQUIRED/);
  assert.match(projects, /currentScopeVersionId:\s*projectData\.renovationScopeVersionId/);
  assert.match(schema, /renovationCaseId\s+String\?\s+@unique/);
  assert.match(schema, /PROJECT_HANDOFF_STARTED/);
  assert.match(ui, /See exactly what blocks execution/);
  assert.match(ui, /does not establish legal compliance/);
  assert.match(ui, /Already started/);
  assert.match(ui, /Historical record/);
});
