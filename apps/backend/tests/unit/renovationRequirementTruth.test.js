'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  DetermineRenovationRequirementSchema,
  UpsertRenovationAuthorityProfileSchema,
} = require('../../src/validators/renovationRequirement.validators.ts');

const authoritativeDetermination = {
  applicability: 'APPLICABLE',
  determination: 'APPLIES',
  truthLayer: 'AUTHORITY_CONFIRMED',
  exactNextAction: 'Prepare the building permit application.',
  isBlocking: true,
  confirmedByName: 'Permit technician',
  confirmedByOrg: 'City Building Department',
  sourceType: 'AUTHORITY_WEBSITE',
  sourceUrl: 'https://example.gov/permits',
  sourceObservedAt: '2026-07-29T12:00:00.000Z',
};

test('advisor and homeowner-reported layers cannot establish a requirement', () => {
  for (const truthLayer of ['ADVISORY', 'REPORTED', 'DOCUMENTED']) {
    const result = DetermineRenovationRequirementSchema.safeParse({
      ...authoritativeDetermination,
      truthLayer,
    });
    assert.equal(result.success, false, `${truthLayer} must not establish APPLIES`);
  }
});

test('authority or professional evidence can establish a sourced determination', () => {
  for (const truthLayer of ['SOURCE_OBSERVED', 'AUTHORITY_CONFIRMED', 'PROFESSIONAL_CONFIRMED']) {
    const result = DetermineRenovationRequirementSchema.safeParse({
      ...authoritativeDetermination,
      truthLayer,
    });
    assert.equal(result.success, true, `${truthLayer} should be accepted with source and confirmer`);
  }
});

test('unknown requirements require an exact action, owner, and due date', () => {
  const missingOwner = DetermineRenovationRequirementSchema.safeParse({
    applicability: 'UNKNOWN',
    determination: 'UNDETERMINED',
    truthLayer: 'ADVISORY',
    exactNextAction: 'Call the zoning counter.',
    isBlocking: true,
    sourceType: 'UNKNOWN',
  });
  assert.equal(missingOwner.success, false);

  const actionable = DetermineRenovationRequirementSchema.safeParse({
    applicability: 'UNKNOWN',
    determination: 'UNDETERMINED',
    truthLayer: 'ADVISORY',
    exactNextAction: 'Call the zoning counter.',
    ownerUserId: 'user-1',
    dueAt: '2026-08-05T12:00:00.000Z',
    isBlocking: true,
    sourceType: 'UNKNOWN',
  });
  assert.equal(actionable.success, true);
});

test('confirmed authority profiles require a named authority, confirmer, and non-advisory source', () => {
  assert.equal(UpsertRenovationAuthorityProfileSchema.safeParse({
    confirmed: true,
    authorityName: 'City Building Department',
    confirmedByOrg: 'City Building Department',
    sourceType: 'AUTHORITY_WEBSITE',
    authorityWebsite: 'https://example.gov/building',
  }).success, true);
  assert.equal(UpsertRenovationAuthorityProfileSchema.safeParse({
    confirmed: true,
    authorityName: 'City Building Department',
    confirmedByOrg: 'City Building Department',
    sourceType: 'ADVISOR_RULE',
    sourceReference: 'Static rule',
  }).success, false);
});

test('candidate generation covers every family and scope changes invalidate prior truth', () => {
  const requirements = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationRequirement.service.ts'),
    'utf8',
  );
  const cases = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationCase.service.ts'),
    'utf8',
  );
  const advisorController = fs.readFileSync(
    path.join(__dirname, '../../src/homeRenovationAdvisor/homeRenovationAdvisor.controller.ts'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/renovations/[caseId]/requirements/page.tsx'),
    'utf8',
  );

  for (const family of [
    'PERMIT', 'ZONING', 'HOA', 'PROFESSIONAL', 'CONTRACTOR', 'INSURANCE',
    'LENDER', 'UTILITY', 'SAFETY', 'HAZARD', 'OVERLAY', 'OTHER',
  ]) {
    assert.match(requirements, new RegExp(`${family}:\\s*\\{`));
  }
  assert.match(requirements, /Advisor rules generate a research candidate only/);
  assert.match(requirements, /RENOVATION_ADVISOR_SCOPE_MISMATCH/);
  assert.match(requirements, /resolvedPropertyAccess|resolvePropertyAccess/);
  assert.match(cases, /recordStatus:\s*'STALE_SCOPE'/);
  assert.match(cases, /eventType:\s*'INVALIDATED_BY_SCOPE'/);
  assert.match(advisorController, /advisoryOnly:\s*true/);
  assert.match(ui, /Advisor results are research candidates/);
  assert.match(ui, /Record sourced determination/);
  assert.match(ui, /Confirm jurisdiction profile/);
});
