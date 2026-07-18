const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('context capture is allowlisted, access checked, and writes owner plus evidence atomically', () => {
  const capture = read('../../src/modules/propertyContext/application/capturePropertyFact.ts');
  assert.match(capture, /isContextCaptureSupported/);
  assert.match(capture, /resolvePropertyAccess/);
  assert.match(capture, /ROLE_RANK\[access\.role\] < ROLE_RANK\.CONTRIBUTOR/);
  assert.match(capture, /prisma\.\$transaction/);
  assert.match(capture, /writeCanonicalFact/);
  assert.match(capture, /propertyFactEvidence\.updateMany/);
  assert.match(capture, /propertyFactEvidence\.create/);
});

test('capture and evidence routes require authentication', () => {
  const routes = read('../../src/routes/property.routes.ts');
  assert.match(routes, /router\.patch\('\/:id\/context\/:factKey', authenticate, patchPropertyContextFact\)/);
  assert.match(routes, /router\.get\('\/:id\/context\/:factKey\/evidence', authenticate, getPropertyContextFactEvidence\)/);
});

test('property create and update capture canonical classification, exterior, and responsibility', () => {
  const validators = read('../../src/utils/validators.ts');
  const service = read('../../src/services/property.service.ts');
  assert.match(validators, /responsibilities: z\.array\(PropertyResponsibilityInputSchema\)/);
  assert.doesNotMatch(validators, /occupantsCount:/);
  assert.match(service, /propertyResponsibility\.upsert/);
  assert.match(service, /propertyFactEvidence\.create/);
  assert.match(service, /exteriorProfile/);
  assert.doesNotMatch(service, /occupantsCount:/);
});

test('property forms expose canonical fields and working correction anchors', () => {
  const create = read('../../../frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx');
  const edit = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx');
  for (const source of [create, edit]) {
    assert.match(source, /dwellingType/);
    assert.match(source, /ownershipForm/);
    assert.match(source, /propertyUse/);
    assert.match(source, /occupancyStatus/);
    assert.match(source, /responsibilit/);
    assert.match(source, /exteriorProfile|hasPrivateOutdoorSpace/);
    assert.doesNotMatch(source, /occupantsCount/);
  }
  for (const anchor of ['address', 'property-type', 'structure', 'systems', 'safety', 'occupancy', 'exterior', 'responsibility']) {
    assert.match(edit, new RegExp(`id=["']${anchor}["']`), anchor);
  }
});

test('feature panels own capture while aggregate status remains noninteractive', () => {
  const status = read('../../../frontend/src/components/property-context/PropertyContextStatusNotice.tsx');
  const panel = read('../../../frontend/src/components/property-context/PropertyContextCapturePanel.tsx');
  const client = read('../../../frontend/src/lib/api/client.ts');
  assert.doesNotMatch(status, /captureFeatureContext|<button|<input/);
  assert.match(status, /correctionPaths/);
  assert.match(panel, /requirement\.capture\.inputSchema/);
  assert.doesNotMatch(`${status}\n${panel}`, /window\.location\.reload/);
  assert.match(client, /context\/captures/);
  assert.doesNotMatch(client, /capturePropertyContextFact|getPropertyContextCaptureDefinition/);
});

test('household size is captured only through the consented optional profile', () => {
  const seed = read('../../prisma/seed.ts');
  const answer = read('../../src/modules/personalization/application/recordProfileAnswer.usecase.ts');
  const profileUi = read('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(seed, /HOUSEHOLD_SIZE/);
  assert.match(seed, /answerSchema: \{ type: 'integer', min: 1, max: 25 \}/);
  assert.match(answer, /CONSENT_REQUIRED/);
  assert.match(answer, /householdSizeAnswerSchema/);
  assert.match(profileUi, /answerSchema\.type === 'integer'/);
});

test('Property Context observability uses bounded privacy-safe labels', () => {
  const metrics = read('../../src/lib/metrics.ts');
  const reader = read('../../src/modules/propertyContext/application/getPropertyContext.ts');
  assert.match(metrics, /property_context_reads_total/);
  assert.match(metrics, /property_context_read_duration_seconds/);
  assert.match(metrics, /property_context_fact_states_total/);
  assert.match(metrics, /property_context_captures_total/);
  assert.match(reader, /propertyContextReadsTotal/);
  assert.doesNotMatch(metrics, /propertyId|userId/);
});

test('item request boundaries accept canonical inventory ownership only', () => {
  const quoteApi = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi.ts');
  const booking = read('../../../frontend/src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx');
  assert.match(quoteApi, /inventoryItemId\?: string \| null/);
  assert.match(booking, /\.\.\.\(inventoryItemId && \{ inventoryItemId \}\)/);
  assert.doesNotMatch(`${quoteApi}\n${booking}`, /homeAsset|HOME_ASSET/);
});
