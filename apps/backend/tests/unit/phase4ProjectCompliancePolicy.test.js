const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateProjectComplianceContext } = require('../../src/services/projectCompliance/applicabilityPolicy.ts');
const { PROJECT_COMPLIANCE_FEATURE_SCOPES } = require('../../src/services/projectCompliance/context.ts');
const {
  classifyPermitApplicability,
  resolvePermitWorkTypes,
  resolveResponsibilityFactKeys,
} = require('../../src/services/projectCompliance/workScope.ts');

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

test('work-specific responsibility cannot be enabled by an unrelated owner-managed system', () => {
  const facts = {
    'responsibility.roof': 'ASSOCIATION',
    'responsibility.plumbing': 'OWNER',
  };
  const roofing = evaluateProjectComplianceContext(snapshot(facts), { serviceCategory: 'ROOFING' });
  const plumbing = evaluateProjectComplianceContext(snapshot(facts), { serviceCategory: 'PLUMBING' });
  assert.equal(roofing.providerBooking.status, 'NOT_APPLICABLE');
  assert.deepEqual(roofing.providerBooking.usedFactKeys, ['responsibility.roof']);
  assert.equal(plumbing.providerBooking.status, 'APPLICABLE');
  assert.deepEqual(plumbing.providerBooking.usedFactKeys, ['responsibility.plumbing']);
});

test('project and inventory scopes map to canonical responsibility facts', () => {
  assert.deepEqual(resolveResponsibilityFactKeys({ projectType: 'ROOF_REPLACEMENT' }), ['responsibility.roof']);
  assert.deepEqual(resolveResponsibilityFactKeys({ homeSystemsAffected: ['HVAC'] }), ['responsibility.hvac']);
  assert.deepEqual(
    resolveResponsibilityFactKeys({ projectType: 'BATHROOM_REMODEL' }),
    ['responsibility.plumbing', 'responsibility.sharedSystems'],
  );
});

test('permit applicability uses work type plus known jurisdiction and remains conservative', () => {
  const context = snapshot({ 'location.state': 'NJ', 'location.zipCode': '07030' });
  assert.equal(classifyPermitApplicability(['ELECTRICAL_PANEL']), 'REQUIRED');
  assert.equal(classifyPermitApplicability(['ROOF_REPLACEMENT']), 'LIKELY_REQUIRED');
  assert.equal(classifyPermitApplicability(['ROOF_REPAIR']), 'CONDITIONAL');
  assert.deepEqual(resolvePermitWorkTypes({ projectType: 'ELECTRICAL_PANEL' }), ['ELECTRICAL_PANEL']);
  assert.equal(
    evaluateProjectComplianceContext(context, { permitWorkTypes: ['ELECTRICAL_PANEL'] }).permitApplicability.status,
    'APPLICABLE',
  );
  assert.equal(
    evaluateProjectComplianceContext(context, { permitWorkTypes: ['ROOF_REPAIR'] }).permitApplicability.status,
    'UNKNOWN',
  );
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

test('mutations enforce context before persistence and dedupe active work', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const permit = read('../../src/controllers/permitTracker.controller.ts');
  const project = read('../../src/controllers/projectTracker.controller.ts');
  const booking = read('../../src/services/booking.service.ts');
  assert.ok(permit.indexOf('await assertProjectComplianceApplicable') < permit.indexOf('const permit = await permitTrackerService.createManualPermit'));
  assert.ok(project.indexOf('await assertProjectComplianceApplicable') < project.indexOf('const data = await svc.createProject'));
  assert.ok(booking.indexOf('await assertProjectComplianceApplicable') < booking.indexOf('const booking = await prisma.booking.create'));
  assert.match(read('../../src/services/projectTracker.service.ts'), /ACTIVE_PROJECT_DUPLICATE/);
  assert.match(read('../../src/services/quoteComparison.service.ts'), /OPEN_WORKSPACE_STATUSES/);
  assert.match(booking, /activeExecutionScopeKey/);
});
