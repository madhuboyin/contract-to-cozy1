const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('HOA approval creation registers work-type-specific responsibility requirements', () => {
  const contract = getFeatureContextRequirement('HOA_COMPLIANCE', 'CREATE_APPROVAL_RECORD');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  const byFact = new Map(contract.required.map((requirement) => [requirement.factKey, requirement]));
  assert.deepEqual(byFact.get('responsibility.buildingExterior').operationInputWhen.value, [
    'EXTERIOR_PAINT', 'FENCE', 'ROOM_ADDITION', 'WINDOWS_DOORS', 'SHED_OUTBUILDING', 'SATELLITE_ANTENNA',
  ]);
  assert.deepEqual(byFact.get('responsibility.roof').operationInputWhen.value, ['ROOFING', 'SOLAR']);
  assert.deepEqual(byFact.get('responsibility.drivewayWalkways').operationInputWhen.value, ['DRIVEWAY']);
  assert.deepEqual(byFact.get('responsibility.commonSafety').operationInputWhen.value, ['POOL']);
});

test('HOA approval editor preserves inputs and resumes after inline capture', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/hoa/page.tsx');
  const list = read('../../../frontend/src/components/features/hoa/ApprovalRecordList.tsx');
  assert.match(page, /propertyId=\{propertyId\}/);
  assert.match(list, /featureKey="HOA_COMPLIANCE"/);
  assert.match(list, /operationKey="CREATE_APPROVAL_RECORD"/);
  assert.match(list, /operationInput=\{operationInput\}/);
  assert.match(list, /addFormRef\.current\?\.requestSubmit\(\)/);
  assert.match(list, /if \(!contextReady\)/);
  assert.doesNotMatch(list, /window\.location\.reload/);
});

test('HOA execution preserves association precedence then enforces shared and owner policies', () => {
  // The gate lives in hoaComplianceOperations (FRD v1.328), which the route and Ask both call; the controller must go through it.
  const controller = read('../../src/controllers/hoaCompliance.controller.ts');
  assert.match(controller, /createHoaApprovalRecordWithEffects/);
  assert.equal(controller.indexOf('hoaComplianceService.createApprovalRecord'), -1, 'the controller no longer creates a record around the gate');
  const operations = read('../../src/services/hoaComplianceOperations.ts');
  const createStart = operations.indexOf('export async function createHoaApprovalRecordWithEffects');
  const association = operations.indexOf("['hoaCompliance']", createStart);
  const shared = operations.indexOf('evaluateFeatureContext', association);
  const owner = operations.indexOf("['ownerProjectExecution']", shared);
  const canonical = operations.indexOf('hoaComplianceService.createApprovalRecord', owner);
  assert.ok(createStart >= 0 && association > createStart && shared > association && owner > shared && canonical > owner);
  assert.match(operations, /PROPERTY_CONTEXT_INCOMPLETE/);
});

test('HOA shared adoption retains the canonical association-backed approval writer', () => {
  const service = read('../../src/services/hoaCompliance.service.ts');
  const createStart = service.indexOf('async createApprovalRecord');
  const association = service.indexOf('prisma.hoaAssociation.findFirst', createStart);
  const canonical = service.indexOf('prisma.hoaApprovalRecord.create', association);
  assert.ok(createStart >= 0 && association > createStart && canonical > association);
  assert.match(service, /NO_ASSOCIATION/);
});
