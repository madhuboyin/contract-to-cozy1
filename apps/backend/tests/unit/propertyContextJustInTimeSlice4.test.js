const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('maintenance setup requires a recognized installed system through the relational owner', () => {
  const contract = getFeatureContextRequirement('MAINTENANCE', 'SET_UP_INSTALLED_SYSTEMS');
  assert.equal(contract.required[0].factKey, 'systems.installedItemTypes');
  assert.equal(contract.required[0].captureKey, 'INVENTORY_ITEM_SELECT_OR_CREATE');
  const capture = getCaptureDefinition('INVENTORY_ITEM_SELECT_OR_CREATE');
  assert.ok(capture.factKeys.includes('inventory.items'));
  assert.ok(capture.factKeys.includes('systems.installedItemTypes'));
  assert.equal(capture.canonicalOwner, 'InventoryItem');
});

test('maintenance setup progressively adopts installed-system and safety capture in place', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx');
  assert.match(page, /operationKey="SET_UP_INSTALLED_SYSTEMS"/);
  assert.match(page, /installedSystemContextReady && hasUnknownSafetyTemplates/);
  assert.match(page, /operationKey="GENERATE_SAFETY_TASKS"/);
  assert.match(page, /invalidateQueries\(\{ queryKey: \['maintenanceTemplates'/);
  assert.doesNotMatch(page, /window\.location\.reload/);
});

test('Plant Advisor enforces the shared feature policy immediately before outdoor mutations', () => {
  const service = read('../../src/services/plantCarePlanner.service.ts');
  const assertionStart = service.indexOf('private async assertOutdoorApplicable');
  const sharedEvaluation = service.indexOf('evaluateFeatureContext(propertyId, userId', assertionStart);
  const legacyDecision = service.indexOf('evaluatePlantAdvisorApplicability', sharedEvaluation);
  assert.ok(assertionStart >= 0 && sharedEvaluation > assertionStart && legacyDecision > sharedEvaluation);
  assert.match(service, /PLANT_ADVISOR_CONTEXT_REQUIRED/);
});

test('safety template execution enforces the shared safety contract and returns a terminal 422', () => {
  const service = read('../../src/services/PropertyMaintenanceTask.service.ts');
  const controller = read('../../src/controllers/propertyMaintenanceTask.controller.ts');
  assert.match(service, /operationKey: 'GENERATE_SAFETY_TASKS'/);
  assert.match(service, /if \(!evaluation\.canExecute\)/);
  assert.match(controller, /needs more property context/);
  assert.match(controller, /status\(422\)/);
});

test('personalized detector guidance can reopen and correct the safety profile inline', () => {
  const contract = getFeatureContextRequirement('PERSONALIZATION', 'REVIEW_SAFETY_DETECTOR_PROFILE');
  assert.equal(contract.adoption.executionDisposition, 'CAPTURE_ONLY');
  assert.equal(contract.required[0].captureKey, 'SAFETY_DETECTOR_PROFILE');
  assert.equal(contract.required[0].alwaysCapture, true);

  const page = read('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(page, /Confirm detector details/);
  assert.match(page, /operationKey="REVIEW_SAFETY_DETECTOR_PROFILE"/);
  assert.match(page, /await recompute\.mutateAsync\(\)/);
});

test('new property safety answers remain unknown until the homeowner answers them', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx');
  assert.match(page, /hasSmokeDetectors: null/);
  assert.match(page, /hasCoDetectors: null/);
  assert.match(page, /hasSmokeDetectors: formData\.hasSmokeDetectors \?\? undefined/);
  assert.match(page, /label: 'Not sure', value: null/);
});
