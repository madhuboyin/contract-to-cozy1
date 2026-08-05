const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PROPERTY_BRIEF_TEMPLATES,
} = require('../../src/propertyBrief/propertyBrief.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

// Slice 10 (buyer handoff / ownership transition) of
// HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md.
// Scoped to reusing the Property Brief foundation (already immutable
// snapshots + item-level evidence + Slice 7's recipient/acceptance/expiry/
// revoke layer) rather than building a new handoff system: extends what a
// PROSPECTIVE_BUYER brief can include with successor-value records
// (warranties, as-built material specs, verified permits) it previously
// had no access to at all.

test('warranties, as-built material specs, and verified permits are assembled as successor-value sections, not seller-private ones', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');

  const warrantiesBlock = service.slice(
    service.indexOf("selectedSections.includes('WARRANTIES')"),
    service.indexOf("selectedSections.includes('MATERIAL_SPECS')"),
  );
  assert.match(warrantiesBlock, /prisma\.warranty\.findMany/);
  assert.match(warrantiesBlock, /sensitive: false/);
  // Financial fields stay excluded, same pattern as CLAIMS/INSURANCE above.
  assert.match(warrantiesBlock, /excludedFields: \['cost', 'policy number'\]/);

  const materialSpecsBlock = service.slice(
    service.indexOf("selectedSections.includes('MATERIAL_SPECS')"),
    service.indexOf("selectedSections.includes('PERMITS')"),
  );
  assert.match(materialSpecsBlock, /prisma\.materialSpec\.findMany/);
  // Only finalized, still-active specs — not PROPOSED/APPROVED/SUBSTITUTED
  // ones a buyer has no use for.
  assert.match(materialSpecsBlock, /lifecycleStatus: 'AS_BUILT'/);
  assert.match(materialSpecsBlock, /isActive: true/);
  assert.match(materialSpecsBlock, /sensitive: false/);
  // Reorder/care/leftover-location info is genuine successor value and
  // stays in, unlike claims/insurance's financial-identifier redaction.
  assert.match(materialSpecsBlock, /quantityRemaining: spec\.quantityRemaining/);
  assert.match(materialSpecsBlock, /remainingStorageLocation: spec\.remainingStorageLocation/);

  const permitsBlock = service.slice(service.indexOf("selectedSections.includes('PERMITS')"));
  assert.match(permitsBlock, /prisma\.propertyPermitRecord\.findMany/);
  assert.match(permitsBlock, /isVerified: true/);
  assert.match(permitsBlock, /sensitive: false/);
  assert.match(permitsBlock, /excludedFields: \['estimated cost', 'final cost'\]/);
});

test('PROSPECTIVE_BUYER template gains the new sections as default-selected but still excludes claims/insurance entirely', () => {
  const template = PROPERTY_BRIEF_TEMPLATES.PROSPECTIVE_BUYER;
  assert.deepEqual(
    [...template.defaultSections].sort(),
    ['MATERIAL_SPECS', 'OPEN_UNKNOWNS', 'PERMITS', 'PROPERTY_FACTS', 'VERIFIED_HISTORY', 'WARRANTIES'].sort(),
  );
  assert.equal(template.allowedSections.includes('CLAIMS'), false);
  assert.equal(template.allowedSections.includes('INSURANCE'), false);
});

test('recipient identity, acceptance, expiry, and revoke (built generically in an earlier pass) apply to buyer shares too — share creation never branches on brief purpose', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const shareFn = service.slice(
    service.indexOf('export async function createPropertyBriefShare'),
    service.indexOf('export async function', service.indexOf('export async function createPropertyBriefShare') + 1),
  );
  assert.doesNotMatch(shareFn, /purpose ===/);
  assert.doesNotMatch(shareFn, /PROSPECTIVE_BUYER/);
  assert.match(shareFn, /recipientEmail/);
  assert.match(shareFn, /invitationStatus/);
});
