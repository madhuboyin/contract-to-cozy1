const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateProjectComplianceContext } = require('../../src/services/projectCompliance/applicabilityPolicy.ts');
const { PROJECT_COMPLIANCE_FEATURE_SCOPES } = require('../../src/services/projectCompliance/context.ts');
const { reconcileProjectComplianceOutputs } = require('../../src/services/projectCompliance/reconciliation.ts');
const {
  classifyExecutionAppropriateness,
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

test('stale and conflicted jurisdiction facts remain non-actionable', () => {
  const conflictedDwelling = createPropertyFact('core.dwellingType', 'CONDO', undefined, NOW);
  conflictedDwelling.state = 'CONFLICTED';
  const staleState = createPropertyFact('location.state', 'NJ', undefined, NOW);
  staleState.state = 'STALE';
  const context = {
    ...snapshot({ 'location.zipCode': '07030' }),
    facts: {
      'core.dwellingType': conflictedDwelling,
      'location.state': staleState,
      'location.zipCode': createPropertyFact('location.zipCode', '07030', undefined, NOW),
    },
  };

  const decisions = evaluateProjectComplianceContext(context);
  assert.equal(decisions.renovationAdvisor.status, 'UNKNOWN');
  assert.deepEqual(decisions.renovationAdvisor.conflictedFactKeys, ['core.dwellingType']);
  assert.equal(decisions.permitTracking.status, 'UNKNOWN');
  assert.ok(decisions.permitTracking.missingFactKeys.includes('location.state'));
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

test('unmapped physical work remains unknown while known non-property services can proceed', () => {
  const custom = evaluateProjectComplianceContext(snapshot({}), { projectType: 'CUSTOM' });
  assert.equal(custom.ownerProjectExecution.status, 'UNKNOWN');
  assert.ok(custom.ownerProjectExecution.reasonCodes.includes('WORK_SCOPE_RESPONSIBILITY_MAPPING_UNKNOWN'));

  const hoaOther = evaluateProjectComplianceContext(snapshot({}), { hoaWorkTypes: ['OTHER'] });
  assert.equal(hoaOther.ownerProjectExecution.status, 'UNKNOWN');

  const cleaning = evaluateProjectComplianceContext(snapshot({}), { serviceCategory: 'CLEANING' });
  assert.equal(cleaning.ownerProjectExecution.status, 'APPLICABLE');
});

test('Phase 4 responsibility behavior holds across owner and association archetypes', () => {
  const cases = [
    { dwelling: 'SINGLE_FAMILY_DETACHED', party: 'OWNER', expected: 'APPLICABLE' },
    { dwelling: 'CONDO', party: 'ASSOCIATION', expected: 'NOT_APPLICABLE' },
    { dwelling: 'TOWNHOME', party: 'SHARED', expected: 'APPLICABLE' },
    { dwelling: 'CONDO', party: 'UNKNOWN', expected: 'UNKNOWN' },
  ];
  for (const entry of cases) {
    const decisions = evaluateProjectComplianceContext(snapshot({
      'core.dwellingType': entry.dwelling,
      'responsibility.roof': entry.party,
    }), { serviceCategory: 'ROOFING' });
    assert.equal(decisions.providerBooking.status, entry.expected, entry.dwelling);
  }
});

test('open Phase 4 outputs reconcile when responsibility changes', () => {
  const ownerContext = snapshot({
    'responsibility.roof': 'OWNER',
    'projects.activeProjects': [{ id: 'project-1' }],
    'projects.openQuoteWorkspaces': [{ id: 'quote-1' }],
  });
  const ownerDecisions = evaluateProjectComplianceContext(ownerContext, { serviceCategory: 'ROOFING' });
  assert.equal(reconcileProjectComplianceOutputs(ownerContext, ownerDecisions).status, 'CURRENT');

  const associationContext = snapshot({
    'responsibility.roof': 'ASSOCIATION',
    'projects.activeProjects': [{ id: 'project-1' }],
    'projects.openQuoteWorkspaces': [{ id: 'quote-1' }],
  });
  const associationDecisions = evaluateProjectComplianceContext(
    associationContext,
    { serviceCategory: 'ROOFING' },
  );
  const reconciliation = reconcileProjectComplianceOutputs(associationContext, associationDecisions);
  assert.equal(reconciliation.status, 'REVIEW_REQUIRED');
  assert.equal(reconciliation.requiresReview, true);
  assert.equal(reconciliation.affectedOutputs.length, 2);
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

test('contractor and DIY guidance is explicit and conservative by work scope', () => {
  assert.equal(
    classifyExecutionAppropriateness({ serviceCategory: 'ELECTRICAL' }),
    'LICENSED_PROFESSIONAL_REQUIRED',
  );
  assert.equal(
    classifyExecutionAppropriateness({ projectType: 'PAINTING_INTERIOR' }),
    'DIY_ELIGIBLE',
  );

  const regulated = evaluateProjectComplianceContext(snapshot({}), { serviceCategory: 'ELECTRICAL' });
  assert.equal(regulated.professionalReview.status, 'APPLICABLE');
  assert.equal(regulated.diyExecution.status, 'NOT_APPLICABLE');

  const lowRisk = evaluateProjectComplianceContext(snapshot({}), { projectType: 'PAINTING_INTERIOR' });
  assert.equal(lowRisk.professionalReview.status, 'NOT_APPLICABLE');
  assert.equal(lowRisk.diyExecution.status, 'APPLICABLE');

  const unscoped = evaluateProjectComplianceContext(snapshot({}));
  assert.equal(unscoped.diyExecution.status, 'UNKNOWN');
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

  for (const [file, persistenceCall] of [
    ['../../src/controllers/servicePriceRadar.controller.ts', 'service.createCheck'],
    ['../../src/controllers/quoteComparison.controller.ts', 'getOrCreateQuoteComparisonWorkspace'],
    ['../../src/controllers/priceFinalization.controller.ts', 'priceFinalizationService.createDraft'],
    ['../../src/controllers/negotiationShield.controller.ts', 'service.createCase'],
    ['../../src/controllers/materialSpec.controller.ts', 'service.createSpec'],
    ['../../src/controllers/hoaCompliance.controller.ts', 'hoaComplianceService.createApprovalRecord'],
  ]) {
    const source = read(file);
    const persistenceIndex = source.lastIndexOf(persistenceCall);
    const contextIndex = source.lastIndexOf('await assertProjectCompliance', persistenceIndex);
    assert.ok(
      persistenceIndex > 0 &&
      contextIndex >= 0 &&
      contextIndex < persistenceIndex,
      file,
    );
  }
  assert.match(read('../../src/services/priceFinalization.service.ts'), /withSerializableDedupe/);
});
