const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateProjectComplianceContext } = require('../../src/services/projectCompliance/applicabilityPolicy.ts');
const { PROJECT_COMPLIANCE_FEATURE_SCOPES } = require('../../src/services/projectCompliance/context.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'test-version',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('renovation and local pricing require dwelling, jurisdiction, and size context', () => {
  const incomplete = evaluateProjectComplianceContext(snapshot({
    'core.dwellingType': 'SINGLE_FAMILY_DETACHED',
    'location.state': 'NJ',
  }));
  assert.equal(incomplete.renovationAdvisor.status, 'UNKNOWN');
  assert.equal(incomplete.localPriceBenchmarking.status, 'UNKNOWN');
  assert.ok(incomplete.renovationAdvisor.correctionPaths.includes('/dashboard/properties/property-1/edit#address'));

  const complete = evaluateProjectComplianceContext(snapshot({
    'core.dwellingType': 'SINGLE_FAMILY_DETACHED',
    'core.propertySizeSqFt': 1900,
    'location.state': 'NJ',
    'location.zipCode': '07030',
  }));
  assert.equal(complete.renovationAdvisor.status, 'APPLICABLE');
  assert.equal(complete.localPriceBenchmarking.status, 'APPLICABLE');
});

test('HOA existence enables compliance tracking but never implies association work responsibility', () => {
  const unknownResponsibility = evaluateProjectComplianceContext(snapshot({
    'compliance.hoaAssociation': { id: 'hoa-1' },
  }));
  assert.equal(unknownResponsibility.hoaCompliance.status, 'APPLICABLE');
  assert.equal(unknownResponsibility.ownerProjectExecution.status, 'UNKNOWN');
  assert.equal(unknownResponsibility.providerBooking.status, 'UNKNOWN');

  const ownerInterior = evaluateProjectComplianceContext(snapshot({
    'compliance.hoaAssociation': { id: 'hoa-1' },
    'responsibility.roof': 'ASSOCIATION',
    'responsibility.plumbing': 'OWNER',
  }));
  assert.equal(ownerInterior.ownerProjectExecution.status, 'APPLICABLE');
});

test('project, quote, price, negotiation, and booking states are explicit collections', () => {
  const decisions = evaluateProjectComplianceContext(snapshot({
    'projects.activeProjects': [],
    'projects.materialSpecs': [],
    'projects.openQuoteWorkspaces': [],
    'projects.openPriceFinalizations': [],
    'projects.openNegotiations': [],
    'projects.activeBookings': [],
  }));
  assert.equal(decisions.projectTracking.status, 'APPLICABLE');
  assert.equal(decisions.materialSpecifications.status, 'APPLICABLE');
  assert.equal(decisions.quoteComparison.status, 'APPLICABLE');
  assert.equal(decisions.priceFinalization.status, 'APPLICABLE');
  assert.equal(decisions.negotiationShield.status, 'APPLICABLE');
  assert.equal(decisions.bookingDeduplication.status, 'APPLICABLE');
});

test('Phase 4 manifests are bounded and exclude optional household context', () => {
  for (const [feature, scopes] of Object.entries(PROJECT_COMPLIANCE_FEATURE_SCOPES)) {
    assert.ok(scopes.length > 0, feature);
    assert.equal(scopes.includes('OPTIONAL_HOUSEHOLD'), false, feature);
    assert.equal(scopes.includes('PRODUCT_CONTEXT'), false, feature);
  }
  assert.ok(PROJECT_COMPLIANCE_FEATURE_SCOPES.HOA_COMPLIANCE.includes('RESPONSIBILITY'));
  assert.ok(PROJECT_COMPLIANCE_FEATURE_SCOPES.PROVIDER_BOOKING.includes('PROJECTS'));
});

test('Phase 4 entry points consume the shared context boundary and quote UI explains it', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  for (const file of [
    '../../src/homeRenovationAdvisor/homeRenovationAdvisor.controller.ts',
    '../../src/controllers/permitTracker.controller.ts',
    '../../src/controllers/hoaCompliance.controller.ts',
    '../../src/controllers/projectTracker.controller.ts',
    '../../src/controllers/materialSpec.controller.ts',
    '../../src/controllers/servicePriceRadar.controller.ts',
    '../../src/controllers/priceFinalization.controller.ts',
    '../../src/controllers/negotiationShield.controller.ts',
    '../../src/controllers/provider.controller.ts',
    '../../src/controllers/booking.controller.ts',
  ]) {
    assert.match(read(file), /getProjectComplianceEnvelope/, file);
  }
  assert.match(
    read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx'),
    /PropertyContextNotice/,
  );
});
