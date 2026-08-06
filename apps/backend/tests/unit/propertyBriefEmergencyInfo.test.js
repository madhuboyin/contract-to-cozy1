const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

// Slice 7's "fold Home Digital Will's authored content into a Property
// Brief template": the same emergency contacts + isEmergency-flagged
// entries emergencyPacket.service.ts's PDF already surfaces, now available
// as a real, governed, shareable Property Brief section — but ONLY for
// HOMEOWNER_REFERENCE (self) and HOUSEHOLD_TRUSTED_CONTACT (the one
// purpose this fold-in actually targets). Every buyer/agent/contractor/
// insurer purpose must never see it.

const {
  PROPERTY_BRIEF_SECTIONS,
  PROPERTY_BRIEF_TEMPLATES,
  createPropertyBriefSchema,
} = require('../../src/propertyBrief/propertyBrief.contracts.ts');

test('EMERGENCY_INFO is a registered section', () => {
  assert.ok(PROPERTY_BRIEF_SECTIONS.includes('EMERGENCY_INFO'));
});

test('HOUSEHOLD_TRUSTED_CONTACT defaults EMERGENCY_INFO on and treats it as sensitive', () => {
  const template = PROPERTY_BRIEF_TEMPLATES.HOUSEHOLD_TRUSTED_CONTACT;
  assert.ok(template.defaultSections.includes('EMERGENCY_INFO'));
  assert.ok(template.allowedSections.includes('EMERGENCY_INFO'));
  assert.ok(template.sensitiveSections.includes('EMERGENCY_INFO'));
});

test('HOMEOWNER_REFERENCE allows EMERGENCY_INFO (opt-in, not defaulted) and treats it as sensitive', () => {
  const template = PROPERTY_BRIEF_TEMPLATES.HOMEOWNER_REFERENCE;
  assert.ok(template.allowedSections.includes('EMERGENCY_INFO'));
  assert.ok(!template.defaultSections.includes('EMERGENCY_INFO'));
  assert.ok(template.sensitiveSections.includes('EMERGENCY_INFO'));
});

for (const purpose of ['CONTRACTOR_SERVICE_PROFESSIONAL', 'INSURER_CLAIM_SUPPORT', 'PROSPECTIVE_BUYER', 'LISTING_AGENT']) {
  test(`${purpose} never allows EMERGENCY_INFO — not a buyer/agent/contractor/insurer's business`, () => {
    const template = PROPERTY_BRIEF_TEMPLATES[purpose];
    assert.equal(template.allowedSections.includes('EMERGENCY_INFO'), false);
  });
}

test('a brief can be created for HOUSEHOLD_TRUSTED_CONTACT with EMERGENCY_INFO selected, with acknowledgement', () => {
  const result = createPropertyBriefSchema.safeParse({
    purpose: 'HOUSEHOLD_TRUSTED_CONTACT',
    selectedSections: ['PROPERTY_FACTS', 'EMERGENCY_INFO'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  });
  assert.equal(result.success, true);
});

test('EMERGENCY_INFO requires the sensitive-section acknowledgement, same as claims/insurance/documents', () => {
  const result = createPropertyBriefSchema.safeParse({
    purpose: 'HOUSEHOLD_TRUSTED_CONTACT',
    selectedSections: ['PROPERTY_FACTS', 'EMERGENCY_INFO'],
    documentIds: [],
    acknowledgeSensitiveSections: false,
  });
  assert.equal(result.success, false);
});

test('a LISTING_AGENT brief cannot select EMERGENCY_INFO even with acknowledgement — it is not in that purpose\'s allowedSections', () => {
  const result = createPropertyBriefSchema.safeParse({
    purpose: 'LISTING_AGENT',
    selectedSections: ['PROPERTY_FACTS', 'EMERGENCY_INFO'],
    documentIds: [],
    acknowledgeSensitiveSections: true,
  });
  assert.equal(result.success, false);
});

test('assembleSections pulls real Digital Will trusted contacts and isEmergency-flagged entries, not a fabricated summary', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const sectionIndex = service.indexOf("input.selectedSections.includes('EMERGENCY_INFO')");
  assert.ok(sectionIndex > 0);
  const block = service.slice(sectionIndex, service.indexOf('return sections;', sectionIndex));
  assert.match(block, /prisma\.homeDigitalWill\.findUnique/);
  assert.match(block, /isEmergency: true/);
  assert.match(block, /trustedContacts:/);
  assert.match(block, /sensitive: true/);
});
