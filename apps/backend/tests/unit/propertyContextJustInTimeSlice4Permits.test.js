const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('manual permit creation registers work-type-specific responsibility requirements', () => {
  const contract = getFeatureContextRequirement('PERMITS', 'CREATE_MANUAL_PERMIT');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  const byFact = new Map(contract.required.map((requirement) => [requirement.factKey, requirement]));
  assert.equal(byFact.get('responsibility.roof').operationInputWhen.operator, 'CONTAINS_ANY');
  assert.deepEqual(byFact.get('responsibility.roof').operationInputWhen.value, ['ROOF_REPLACEMENT', 'ROOF_REPAIR', 'SOLAR']);
  assert.deepEqual(byFact.get('responsibility.commonSafety').operationInputWhen.value, ['SWIMMING_POOL']);
  assert.deepEqual(byFact.get('responsibility.landscaping').operationInputWhen.value, ['GRADING_DRAINAGE']);
});

test('operation-input matching supports array intersection for multi-select permit work', () => {
  const evaluator = read('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
  assert.match(evaluator, /condition\.operator === 'IN'/);
  assert.match(evaluator, /Array\.isArray\(actual\)/);
  assert.match(evaluator, /actual\.some/);
});

test('Add Permit preserves the form and resumes after inline capture', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/permits/add/page.tsx');
  const form = read('../../../frontend/src/components/features/permits/AddPermitForm.tsx');
  assert.match(page, /featureKey="PERMITS"/);
  assert.match(page, /operationKey="CREATE_MANUAL_PERMIT"/);
  assert.match(page, /operationInput=\{operationInput\}/);
  assert.match(page, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(page, /if \(!contextReady\)/);
  assert.match(form, /forwardRef<HTMLFormElement/);
  assert.match(form, /onWorkTypesChange/);
  assert.doesNotMatch(page, /window\.location\.reload/);
});

test('permit execution enforces shared readiness before existing compliance and canonical creation', () => {
  const controller = read('../../src/controllers/permitTracker.controller.ts');
  const createStart = controller.indexOf('export async function createManualPermit');
  const shared = controller.indexOf('evaluateFeatureContext', createStart);
  const established = controller.indexOf('assertProjectComplianceApplicable', shared);
  const canonical = controller.indexOf('permitTrackerService.createManualPermit', established);
  assert.ok(createStart >= 0 && shared > createStart && established > shared && canonical > established);
  assert.match(controller, /PROPERTY_CONTEXT_INCOMPLETE/);
});
