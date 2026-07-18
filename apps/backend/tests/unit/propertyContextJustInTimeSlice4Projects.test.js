const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('project creation registers project-type-specific responsibility requirements', () => {
  const contract = getFeatureContextRequirement('PROJECTS', 'CREATE_PROJECT');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  const byFact = new Map(contract.required.map((requirement) => [requirement.factKey, requirement]));
  assert.deepEqual(byFact.get('responsibility.roof').operationInputWhen.value, ['ROOF_REPLACEMENT', 'SOLAR_INSTALLATION']);
  assert.deepEqual(byFact.get('responsibility.hvac').operationInputWhen.value, ['HVAC_REPLACEMENT', 'HVAC_REPAIR']);
  assert.equal(byFact.get('responsibility.deckPatioBalcony').operationInputWhen.value, 'DECK_PATIO');
  assert.equal(byFact.get('responsibility.landscaping').operationInputWhen.value, 'LANDSCAPING_MAJOR');
});

test('operation input participates in evaluation identity and capture re-evaluation', () => {
  const evaluator = read('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
  const capture = read('../../src/modules/propertyContext/application/captureFeatureContext.ts');
  const hook = read('../../../frontend/src/components/property-context/useFeatureContextCapture.ts');
  const client = read('../../../frontend/src/lib/api/client.ts');
  assert.match(evaluator, /operationInputMatches/);
  assert.match(evaluator, /inputForRequirementId\(operationInput\)/);
  assert.match(capture, /operationInput: z\.record/);
  assert.match(capture, /operationInput: input\.operationInput/);
  assert.match(hook, /operationInputIdentity/);
  assert.match(hook, /operationInput,/);
  assert.match(client, /operationInput\?: Record<string, unknown>/);
});

test('New Project preserves its form and automatically resumes after context capture', () => {
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/projects/new/page.tsx');
  assert.match(page, /featureKey="PROJECTS"/);
  assert.match(page, /operationKey="CREATE_PROJECT"/);
  assert.match(page, /operationInput=\{operationInput\}/);
  assert.match(page, /resumeRequested/);
  assert.match(page, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(page, /if \(!contextReady\)/);
  assert.doesNotMatch(page, /window\.location\.reload/);
});

test('project execution enforces shared readiness before the existing compliance policy', () => {
  const controller = read('../../src/controllers/projectTracker.controller.ts');
  const createStart = controller.indexOf('export async function createProject');
  const shared = controller.indexOf('evaluateFeatureContext', createStart);
  const established = controller.indexOf('assertProjectComplianceApplicable', shared);
  const canonical = controller.indexOf('svc.createProject', established);
  assert.ok(createStart >= 0 && shared > createStart && established > shared && canonical > established);
  assert.match(controller, /PROPERTY_CONTEXT_INCOMPLETE/);
});
