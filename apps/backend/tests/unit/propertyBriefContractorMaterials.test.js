const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  PROPERTY_BRIEF_PURPOSES,
  PROPERTY_BRIEF_TEMPLATES,
  createPropertyBriefSchema,
} = require('../../src/propertyBrief/propertyBrief.contracts.ts');

// Last item of this session's 9-item list: "governed Material Specs handoff
// packages", flagged as now-unblocked since Slice 7's share/access-log/
// revoke foundation exists. The real gap: CONTRACTOR_SERVICE_PROFESSIONAL
// already existed as a purpose, but its section set predated
// WARRANTIES/MATERIAL_SPECS/PERMITS being added to the taxonomy (Slice 10),
// so a homeowner had no governed way to hand a new contractor the actual
// installed materials list. Reuses PROSPECTIVE_BUYER/LISTING_AGENT's exact
// section assembly — no new purpose value, no service-layer change.

test('CONTRACTOR_SERVICE_PROFESSIONAL now allows the same material-handoff sections as PROSPECTIVE_BUYER/LISTING_AGENT', () => {
  assert.ok(PROPERTY_BRIEF_PURPOSES.includes('CONTRACTOR_SERVICE_PROFESSIONAL'));
  const template = PROPERTY_BRIEF_TEMPLATES.CONTRACTOR_SERVICE_PROFESSIONAL;
  assert.ok(template);
  for (const section of ['WARRANTIES', 'MATERIAL_SPECS', 'PERMITS']) {
    assert.ok(template.allowedSections.includes(section), `expected ${section} to be allowed`);
    assert.ok(template.defaultSections.includes(section), `expected ${section} to default-on`);
  }
  // Still no claims/insurance/private financial history for a contractor —
  // only DOCUMENTS is gated as sensitive, same posture as before this change.
  assert.equal(template.allowedSections.includes('CLAIMS'), false);
  assert.equal(template.allowedSections.includes('INSURANCE'), false);
  assert.deepEqual(template.sensitiveSections, ['DOCUMENTS']);
});

test('a brief can actually be created for a contractor with material-spec sections selected', () => {
  const result = createPropertyBriefSchema.safeParse({
    purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL',
    selectedSections: ['PROPERTY_FACTS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    documentIds: [],
    acknowledgeSensitiveSections: false,
  });
  assert.equal(result.success, true);

  const rejected = createPropertyBriefSchema.safeParse({
    purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL',
    selectedSections: ['PROPERTY_FACTS', 'CLAIMS'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  });
  assert.equal(rejected.success, false);
});
