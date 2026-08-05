const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PROPERTY_BRIEF_PURPOSES,
  PROPERTY_BRIEF_TEMPLATES,
  createPropertyBriefSchema,
} = require('../../src/propertyBrief/propertyBrief.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Slice 8's "add agent/listing package composition" — reuses Slice 7/10's
// common handoff infrastructure (create brief -> select purpose/sections ->
// share with recipient/expiry/revoke) instead of building a parallel
// system, per the plan's own executive-decision framing.

test('LISTING_AGENT is a registered purpose with the same successor-value section set as PROSPECTIVE_BUYER', () => {
  assert.ok(PROPERTY_BRIEF_PURPOSES.includes('LISTING_AGENT'));
  const template = PROPERTY_BRIEF_TEMPLATES.LISTING_AGENT;
  assert.ok(template, 'expected a LISTING_AGENT template to be registered');
  assert.deepEqual(
    template.defaultSections,
    ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
  );
  // Claims/insurance stay off allowedSections entirely — an agent working
  // the listing has no business need for the seller's private claim or
  // policy history, same posture as the buyer purpose.
  assert.equal(template.allowedSections.includes('CLAIMS'), false);
  assert.equal(template.allowedSections.includes('INSURANCE'), false);
  assert.deepEqual(template.sensitiveSections, ['DOCUMENTS']);
});

test('a brief can actually be created with the LISTING_AGENT purpose using its own allowed sections', () => {
  const result = createPropertyBriefSchema.safeParse({
    purpose: 'LISTING_AGENT',
    selectedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    documentIds: [],
    acknowledgeSensitiveSections: false,
  });
  assert.equal(result.success, true);

  // Claims is not allowed for this purpose, even with acknowledgement.
  const rejected = createPropertyBriefSchema.safeParse({
    purpose: 'LISTING_AGENT',
    selectedSections: ['PROPERTY_FACTS', 'CLAIMS'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  });
  assert.equal(rejected.success, false);
});

test('creating and sharing a brief never branches on purpose — LISTING_AGENT rides the same generic path as every other purpose', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  // The only purpose-aware lookups are through PROPERTY_BRIEF_TEMPLATES
  // (assembleSections/purposeLabel) — no purpose-specific branch (switch,
  // if (purpose === ...)) exists anywhere in the service.
  assert.doesNotMatch(service, /purpose\s*===\s*['"]LISTING_AGENT['"]/);
  assert.doesNotMatch(service, /purpose\s*===\s*['"]PROSPECTIVE_BUYER['"]/);
});

test('Sale Case links out to compose a real agent/listing package instead of leaving it undiscoverable', () => {
  const saleCaseClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/SaleCaseClient.tsx',
  );
  assert.match(saleCaseClient, /\/property-brief\?purpose=LISTING_AGENT/);
  assert.match(saleCaseClient, /Compose agent package/);

  const propertyBriefApi = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/propertyBriefApi.ts',
  );
  assert.match(propertyBriefApi, /'LISTING_AGENT'/);

  // PropertyBriefClient already deep-links via ?purpose= (built for
  // PROSPECTIVE_BUYER/HOUSEHOLD_TRUSTED_CONTACT in earlier slices) — confirm
  // that generic mechanism is what LISTING_AGENT rides, not a new one.
  const propertyBriefClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  assert.match(propertyBriefClient, /searchParams\.get\('purpose'\)/);
  assert.doesNotMatch(propertyBriefClient, /LISTING_AGENT/);
});
