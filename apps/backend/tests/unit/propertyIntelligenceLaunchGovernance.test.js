const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  containsUnsupportedImpactLanguage,
  DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS,
  evaluateFamilyLaunchAuthorization,
  evaluateSourceFamilyLaunchGate,
  observationWithinReviewedCoverage,
} = require('../../src/propertyIntelligence/launchGovernance.ts');
const {
  intelligenceFamilyGovernanceSchema,
  intelligenceSourceControlSchema,
} = require('../../src/propertyIntelligence/propertyIntelligence.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const passingMetrics = {
  sourceCount: 1,
  activationFailures: 0,
  currentCoveragePercent: 100,
  freshnessBreaches: 0,
  operationalResponseBreaches: 0,
  briefingResponses: 10,
  usefulnessRate: 0.8,
  actionEligibleItems: 4,
  actionFollowThroughRate: 0.5,
  localFeedbackCount: 10,
  falsePositiveRate: 0.1,
  falseAllClearCount: 0,
  unsupportedImpactLanguageCount: 0,
  duplicateActionCount: 0,
  duplicateChangeCount: 0,
  duplicateEventCount: 0,
  duplicateNotificationCount: 0,
};

const reviewedPolicy = {
  stage: 'GENERAL',
  safetyApproved: true,
  privacyApproved: true,
  hazardLanguageApproved: true,
  thresholds: DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS,
};

test('pilot geography fails closed to exact QA-reviewed coverage or reviewed national coverage', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  const reviewedNewYork = {
    geographyType: 'STATE',
    geographyKey: 'NY',
    qaReviewedAt: new Date('2026-07-29T12:00:00Z'),
    status: 'ACTIVE',
    validFrom: null,
    validThrough: null,
  };
  assert.equal(observationWithinReviewedCoverage(
    { geographyType: 'STATE', geographyKey: 'ny' },
    [reviewedNewYork],
    now,
  ), true);
  assert.equal(observationWithinReviewedCoverage(
    { geographyType: 'STATE', geographyKey: 'NJ' },
    [reviewedNewYork],
    now,
  ), false);
  assert.equal(observationWithinReviewedCoverage(
    { geographyType: 'STATE', geographyKey: 'NY' },
    [{ ...reviewedNewYork, qaReviewedAt: null }],
    now,
  ), false);
  assert.equal(observationWithinReviewedCoverage(
    { geographyType: 'ZIP', geographyKey: '10003' },
    [{ ...reviewedNewYork, geographyType: 'NATIONAL', geographyKey: 'US' }],
    now,
  ), true);
});

test('pilot can collect evidence while limited and general launch require usefulness samples', () => {
  assert.equal(evaluateFamilyLaunchAuthorization({
    ...reviewedPolicy,
    stage: 'DRAFT',
  }).authorized, false);
  assert.equal(evaluateFamilyLaunchAuthorization({
    ...reviewedPolicy,
    stage: 'PILOT',
  }).authorized, true);

  const pilot = evaluateSourceFamilyLaunchGate({
    policy: { ...reviewedPolicy, stage: 'PILOT' },
    metrics: {
      ...passingMetrics,
      briefingResponses: 0,
      usefulnessRate: null,
      actionEligibleItems: 0,
      actionFollowThroughRate: null,
    },
  });
  assert.equal(pilot.pass, true);

  const general = evaluateSourceFamilyLaunchGate({
    policy: reviewedPolicy,
    metrics: { ...passingMetrics, briefingResponses: 0, usefulnessRate: null },
  });
  assert.equal(general.pass, false);
  assert.ok(general.issueCodes.includes('USEFULNESS_SAMPLE_INSUFFICIENT'));
});

test('launch gate blocks trust, SLO, language, false-all-clear, duplicate, and response failures', () => {
  const result = evaluateSourceFamilyLaunchGate({
    policy: { ...reviewedPolicy, privacyApproved: false },
    metrics: {
      ...passingMetrics,
      currentCoveragePercent: 50,
      freshnessBreaches: 1,
      operationalResponseBreaches: 1,
      falseAllClearCount: 1,
      unsupportedImpactLanguageCount: 1,
      duplicateNotificationCount: 1,
    },
  });
  assert.equal(result.pass, false);
  for (const issue of [
    'PRIVACY_REVIEW_REQUIRED',
    'COVERAGE_SLO_BREACH',
    'FRESHNESS_SLO_BREACH',
    'OPERATIONAL_RESPONSE_SLO_BREACH',
    'FALSE_ALL_CLEAR_DETECTED',
    'UNSUPPORTED_IMPACT_LANGUAGE_DETECTED',
    'DUPLICATE_CANONICAL_OUTPUT_DETECTED',
  ]) {
    assert.ok(result.issueCodes.includes(issue), issue);
  }
  assert.equal(result.retirementEligible, false);
});

test('unsupported impact scanner catches causal, value, insurance, and all-clear claims', () => {
  assert.equal(containsUnsupportedImpactLanguage(
    'This project will increase property value.',
  ), true);
  assert.equal(containsUnsupportedImpactLanguage(
    'The storm damaged this home.',
  ), true);
  assert.equal(containsUnsupportedImpactLanguage(
    'This geographic match does not confirm an effect on the home.',
  ), false);
});

test('governance and source-control inputs require reviewed thresholds, reasons, and rollback target', () => {
  assert.equal(intelligenceFamilyGovernanceSchema.safeParse({
    environment: 'production',
    stage: 'PILOT',
    safetyApproved: true,
    privacyApproved: true,
    hazardLanguageApproved: true,
    reviewNote: 'Approved for the reviewed county pilot.',
    thresholds: DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS,
  }).success, true);
  assert.equal(intelligenceSourceControlSchema.safeParse({
    action: 'KILL_SWITCH',
    reason: 'Provider returned unsupported impact language.',
  }).success, true);
  assert.equal(intelligenceSourceControlSchema.safeParse({
    action: 'ROLLBACK',
    reason: 'Contain the latest provider release.',
  }).success, false);
});

test('runtime report measures canonical outcomes and operator controls are audited containment', () => {
  const service = readBackend('src/propertyIntelligence/governance.service.ts');
  const ingestion = readBackend('src/propertyIntelligence/propertyIntelligence.service.ts');
  const routes = readBackend('src/propertyIntelligence/propertyIntelligence.routes.ts');

  assert.match(ingestion, /observationWithinReviewedCoverage/);
  assert.match(ingestion, /RECORDS_REJECTED_BY_GOVERNANCE/);
  assert.match(ingestion, /evaluateFamilyLaunchAuthorization/);
  assert.match(ingestion, /authorizedSourceFamilies/);
  assert.match(service, /homeBriefingItem\.findMany/);
  assert.match(service, /propertyLocalObservationState\.findMany/);
  assert.match(service, /NO_MATERIAL_CHANGES_WITH_DEGRADED_COVERAGE/);
  assert.match(service, /duplicateActionCount/);
  assert.match(service, /duplicateChangeCount/);
  assert.match(service, /duplicateEventCount/);
  assert.match(service, /duplicateNotificationCount/);
  assert.match(service, /PROPERTY_INTELLIGENCE_SOURCE_\$\{input\.action\}/);
  assert.match(service, /INTELLIGENCE_FAMILY_GATE_FAILED/);
  assert.match(service, /recordAdminAction/);
  assert.doesNotMatch(service, /deleteMany|DELETE FROM/);
  assert.match(routes, /property-intelligence\/governance/);
  assert.match(routes, /sources\/:sourceKey\/control/);
  assert.match(routes, /requireCapability\('INTEGRATION_MANAGE'\)/);
});

test('launch is family-based and legacy retirement remains gated', () => {
  const service = readBackend('src/propertyIntelligence/governance.service.ts');
  const docs = readRepository(
    'docs/functional/PROPERTY_INTELLIGENCE_LAUNCH_GOVERNANCE.md',
  );
  assert.match(service, /Object\.values\(IntelligenceSourceFamily\)/);
  assert.match(service, /retirementBoundary/);
  assert.doesNotMatch(service, /routeCompleteness|routeCount/);
  assert.match(docs, /source family/i);
  assert.match(docs, /Legacy retirement gate/);
});
