const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Slice 0 inventory locks entry points, ownership gaps, and API decisions', () => {
  const inventory = read('../../../../docs/property-context/PROPERTY_CONTEXT_JIT_SLICE_0_INVENTORY.md');
  assert.match(inventory, /79 times across 38 frontend files/);
  assert.match(inventory, /systems\.hasCooling/);
  assert.match(inventory, /financial\.financingProfile/);
  assert.match(inventory, /POST \/api\/properties\/:propertyId\/context\/captures/);
  assert.match(inventory, /Slice 0 passes its implementation gate/);
});

test('writable scalar coverage and feature requirements are backend-owned and registry-validated', () => {
  const facts = read('../../src/modules/propertyContext/catalog/factCatalog.ts');
  const captures = read('../../src/modules/propertyContext/catalog/captureRegistry.ts');
  const features = read('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
  for (const factKey of ['systems.hasCooling', 'financial.financingProfile', 'financial.currentMortgage']) {
    assert.match(facts, new RegExp(`key: '${factKey.replace('.', '\\.')}[^\n]+writable: false`));
  }
  assert.match(captures, /validateCaptureRegistry/);
  assert.match(captures, /no canonical scalar command/);
  assert.match(captures, /canonical owner drift/);
  assert.match(features, /PLANT_ADVISOR/);
  assert.match(features, /REQUIRED_APPLICABILITY/);
  assert.match(features, /ENHANCEMENT_ACCURACY/);
  assert.match(features, /validateFeatureRequirementRegistry/);
});

test('evaluation and capture contracts enforce explicit property, version, idempotency, and canonical evidence', () => {
  const evaluator = read('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
  const capture = read('../../src/modules/propertyContext/application/captureFeatureContext.ts');
  const routes = read('../../src/routes/property.routes.ts');
  const schema = read('../../prisma/schema.prisma');
  assert.match(evaluator, /propertyId/);
  assert.match(evaluator, /READY_WITH_LIMITATIONS/);
  assert.match(evaluator, /NEEDS_REQUIRED_CONTEXT/);
  assert.match(capture, /expectedContextVersion/);
  assert.match(capture, /idempotencyKey/);
  assert.match(capture, /writeCanonicalFact/);
  assert.match(capture, /propertyFactEvidence\.create/);
  assert.match(routes, /context\/feature-requirements\/evaluate/);
  assert.match(routes, /context\/captures/);
  assert.match(schema, /model PropertyContextCaptureReceipt/);
  assert.match(schema, /@@unique\(\[propertyId, userId, idempotencyKey\]\)/);
});

test('shared frontend panel uses returned schemas and re-evaluates without a page reload', () => {
  const panel = read('../../../frontend/src/components/property-context/PropertyContextCapturePanel.tsx');
  const hook = read('../../../frontend/src/components/property-context/useFeatureContextCapture.ts');
  const notice = read('../../../frontend/src/components/property-context/PropertyContextNotice.tsx');
  const plantAdvisor = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/plant-advisor/WeatherAwarePlantCare.tsx');
  assert.match(panel, /schema\.type === 'BOOLEAN'/);
  assert.match(panel, /schema\.type === 'SINGLE_SELECT'/);
  assert.match(panel, /schema\.type === 'MULTI_SELECT'/);
  assert.match(panel, /schema\.type === 'INTEGER'/);
  assert.match(panel, /schema\.type === 'SHORT_TEXT'/);
  assert.match(hook, /captureFeatureContext/);
  assert.match(hook, /setEvaluation\(response\.data\.evaluation\)/);
  assert.match(hook, /onReady/);
  assert.match(plantAdvisor, /PropertyContextCapturePanel/);
  assert.match(plantAdvisor, /GENERATE_OUTDOOR_RECOMMENDATIONS/);
  assert.doesNotMatch(`${panel}\n${hook}\n${notice}`, /window\.location\.reload/);
});
