'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canTransitionRenovationCase,
  diffRenovationScope,
} = require('../../src/services/renovationCase/lifecyclePolicy.ts');
const {
  CreateRenovationCaseSchema,
  CreateRenovationCaseLinkSchema,
} = require('../../src/validators/renovationCase.validators.ts');

const baseScope = {
  summary: 'Replace kitchen finishes',
  workItems: [{ key: 'cabinets', action: 'replace' }],
  spacesAffected: ['KITCHEN'],
  systemsAffected: [],
  intendedUse: 'Residential kitchen',
  dimensions: { widthFeet: 12, lengthFeet: 14 },
  structuralEffects: false,
  exteriorEffects: false,
  drawingDocumentIds: [],
  specificationDocumentIds: [],
  estimatedCostCents: 2500000,
  contractCostCents: null,
  approvalStatus: 'DRAFT',
};

test('case lifecycle allows governed forward movement, pause, and explicit resume', () => {
  assert.equal(canTransitionRenovationCase('IDEA', 'FEASIBILITY'), true);
  assert.equal(canTransitionRenovationCase('IDEA', 'IN_EXECUTION'), false);
  assert.equal(canTransitionRenovationCase('REQUIREMENTS_RESEARCH', 'ON_HOLD'), true);
  assert.equal(
    canTransitionRenovationCase('ON_HOLD', 'REQUIREMENTS_RESEARCH', 'REQUIREMENTS_RESEARCH'),
    true,
  );
  assert.equal(canTransitionRenovationCase('ON_HOLD', 'READY_TO_START', 'REQUIREMENTS_RESEARCH'), false);
  assert.equal(canTransitionRenovationCase('VERIFIED_COMPLETE', 'IN_EXECUTION'), false);
});

test('scope changes invalidate only the downstream decisions they can affect', () => {
  const costOnly = diffRenovationScope(baseScope, {
    ...baseScope,
    estimatedCostCents: 2750000,
  });
  assert.deepEqual(costOnly.changedFields, ['estimatedCostCents']);
  assert.deepEqual(costOnly.invalidates, ['COST']);

  const structural = diffRenovationScope(baseScope, {
    ...baseScope,
    structuralEffects: true,
  });
  assert.deepEqual(
    structural.invalidates,
    ['HOA', 'PERMIT', 'REQUIREMENTS', 'SAFETY'],
  );
  assert.equal(structural.requiresRecheck, true);

  const unchanged = diffRenovationScope(baseScope, { ...baseScope });
  assert.deepEqual(unchanged.changedFields, []);
  assert.equal(unchanged.requiresRecheck, false);

  const reorderedObjectKeys = diffRenovationScope(baseScope, {
    ...baseScope,
    dimensions: { lengthFeet: 14, widthFeet: 12 },
  });
  assert.deepEqual(reorderedObjectKeys.changedFields, []);
});

test('case creation establishes a bounded initial scope contract', () => {
  const parsed = CreateRenovationCaseSchema.parse({
    name: 'Kitchen renovation',
    caseType: 'REMODEL',
    spacesAffected: ['KITCHEN'],
    idempotencyKey: 'accepted-option-123',
  });
  assert.equal(parsed.governanceTier, 'LOW_CONSEQUENCE');
  assert.equal(parsed.responsibilityContext, 'UNKNOWN');
  assert.deepEqual(parsed.systemsAffected, []);
});

test('contributor links accept only the typed lineage vocabulary', () => {
  assert.equal(CreateRenovationCaseLinkSchema.safeParse({
    linkType: 'PERMIT',
    targetId: 'permit-1',
  }).success, true);
  assert.equal(CreateRenovationCaseLinkSchema.safeParse({
    linkType: 'ARBITRARY_ENTITY',
    targetId: 'other-1',
  }).success, false);
});

test('service and routes enforce property scope, household mutation roles, and audit events', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationCase.service.ts'),
    'utf8',
  );
  const routes = fs.readFileSync(
    path.join(__dirname, '../../src/routes/renovationCase.routes.ts'),
    'utf8',
  );
  const schema = fs.readFileSync(
    path.join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );

  assert.match(service, /resolvedPropertyId !== propertyId/);
  assert.match(service, /scopeVersionId,\s*renovationCaseId/);
  assert.match(service, /RENOVATION_LINK_PROPERTY_MISMATCH/);
  assert.match(service, /RENOVATION_LINK_SCOPE_MISMATCH/);
  assert.match(service, /resolvePropertyAccess\(data\.userId, propertyId\)/);
  assert.match(routes, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(routes, /requireHouseholdRole\('OWNER'\)/);
  assert.match(schema, /@@unique\(\[propertyId, idempotencyKey\]\)/);
  assert.match(schema, /@@unique\(\[linkType, targetId\]\)/);
  assert.match(schema, /model RenovationCaseEvent/);
});
