import { performance } from 'node:perf_hooks';
import { applyCoverageActionLifecyclePolicy } from './coverageLifecycle.service';
import {
  COVERAGE_LAUNCH_EVIDENCE_VERSION,
  COVERAGE_LAUNCH_GATE_VERSION,
  evaluateCoverageLaunchGate,
  type CoverageLaunchGateInput,
} from './coverageLaunchGate.service';
import { evaluateInsuranceMarketContext } from './insuranceMarketContext.service';
import { evaluateRecipientEligibility } from './insuranceHandoff.service';

export const COVERAGE_OPERATIONAL_DRILL_VERSION =
  'coverage-operational-drill-v1' as const;

function readyLaunchInput(): CoverageLaunchGateInput {
  return {
    capabilityPresent: true,
    releaseStage: 'ACTIVE',
    rolloutEnabled: true,
    realUserKillSwitchEnabled: true,
    incidentGatePassed: true,
    technicalEvidenceVersion: COVERAGE_LAUNCH_EVIDENCE_VERSION,
    rollbackDrillVersion: COVERAGE_LAUNCH_GATE_VERSION,
    humanApprovalEnforcementEnabled: true,
    governanceReviewSourceAvailable: true,
    missingGovernanceRoles: [],
    rejectedGovernanceRoles: [],
    uncontainedHighRiskGapIds: [],
  };
}

function coverageAction() {
  return {
    id: 'coverage-review:drill',
    propertyId: 'property-drill',
    lineageId: 'coverage-review:drill',
    source: { kind: 'COVERAGE', entityId: 'review-drill', version: '1' },
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review coverage',
      href: '/dashboard/properties/property-drill/tools/coverage-intelligence',
    },
    secondaryCtas: [],
  } as any;
}

function unrelatedAction() {
  return {
    ...coverageAction(),
    id: 'project:drill',
    source: { kind: 'PROJECT', entityId: 'project-drill', version: '1' },
  };
}

function marketCandidate(expiresAt: Date) {
  return {
    releaseId: 'release-drill',
    releaseVersion: 'drill-v1',
    releaseStatus: 'APPROVED',
    observationStart: new Date('2026-01-01T00:00:00.000Z'),
    observationEnd: new Date('2026-06-30T00:00:00.000Z'),
    retrievedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt,
    coverageBasis: {
      label: 'Drill HO-3 basis',
      policyForms: ['HO-3'],
      dwellingTypes: ['SINGLE_FAMILY'],
      limitations: ['Operational drill fixture only.'],
    },
    methodologySummary: 'Operational drill fixture.',
    source: {
      sourceKey: 'drill-source',
      name: 'Drill source',
      ownerName: 'Drill owner',
      sourceUrl: 'https://example.com/drill',
      rightsStatus: 'APPROVED',
      domainReviewStatus: 'APPROVED',
      isActive: true,
    },
    observation: {
      geographyType: 'STATE',
      geographyCode: 'TN',
      metricKey: 'ANNUAL_PREMIUM',
      value: 2000,
      currency: 'USD',
      sampleSize: 100,
      observationNotes: null,
    },
  };
}

function recipient() {
  return {
    id: 'recipient-drill',
    name: 'Drill recipient',
    configVersion: 'drill-v1',
    supportedJurisdictions: ['TN'],
    licensingReviewStatus: 'APPROVED',
    licensingDisclosure: 'Licensing disclosure.',
    operatingModelStatus: 'APPROVED',
    privacyReviewStatus: 'APPROVED',
    commercialDisclosure: 'Commercial disclosure.',
    compensationDisclosure: 'Compensation disclosure.',
    marketScopeDisclosure: 'Market scope disclosure.',
    rankingDisclosure: 'Ranking disclosure.',
    fulfillmentSlaHours: 24,
    quoteIngestionEnabled: true,
    isActive: true,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
  };
}

export function runCoverageOperationalDrill(options: {
  now?: Date;
  iterations?: number;
  maxElapsedMs?: number;
} = {}) {
  const now = options.now ?? new Date('2026-07-27T12:00:00.000Z');
  const iterations = Math.max(1, Math.min(options.iterations ?? 10_000, 50_000));
  const maxElapsedMs = options.maxElapsedMs ?? 5_000;
  const baselineInput = readyLaunchInput();
  const baseline = evaluateCoverageLaunchGate(baselineInput);

  const launchDisabled = evaluateCoverageLaunchGate({
    ...baselineInput,
    realUserKillSwitchEnabled: false,
  });
  const actionDisabled = applyCoverageActionLifecyclePolicy(
    [coverageAction(), unrelatedAction()],
    {
      rolloutEnabled: true,
      killSwitchEnabled: false,
      ruleSourceStatus: 'HEALTHY',
    },
  );
  const sourceUnavailable = evaluateInsuranceMarketContext({
    enabled: true,
    jurisdictionCode: 'TN',
    policyForm: 'HO-3',
    dwellingType: 'SINGLE_FAMILY',
    candidates: [{
      ...marketCandidate(new Date('2027-01-01T00:00:00.000Z')),
      source: {
        ...marketCandidate(new Date('2027-01-01T00:00:00.000Z')).source,
        rightsStatus: 'PENDING',
      },
    }],
    now,
  });
  const sourceStale = evaluateInsuranceMarketContext({
    enabled: true,
    jurisdictionCode: 'TN',
    policyForm: 'HO-3',
    dwellingType: 'SINGLE_FAMILY',
    candidates: [marketCandidate(new Date('2026-07-01T00:00:00.000Z'))],
    now,
  });
  const partnerUnavailable = evaluateRecipientEligibility(
    { ...recipient(), isActive: false },
    'TN',
    now,
  );
  const incidentBlocked = evaluateCoverageLaunchGate({
    ...baselineInput,
    incidentGatePassed: false,
  });
  const restored = evaluateCoverageLaunchGate({ ...baselineInput });

  const startedAt = performance.now();
  let evaluationFailures = 0;
  for (let index = 0; index < iterations; index += 1) {
    const gate = evaluateCoverageLaunchGate(
      index % 2 === 0
        ? baselineInput
        : { ...baselineInput, realUserKillSwitchEnabled: false },
    );
    const market = evaluateInsuranceMarketContext({
      enabled: index % 2 === 0,
      jurisdictionCode: 'TN',
      policyForm: 'HO-3',
      dwellingType: 'SINGLE_FAMILY',
      candidates: [],
      now,
    });
    if (
      (index % 2 === 0 && gate.state !== 'READY') ||
      (index % 2 !== 0 && !gate.blockers.includes('REAL_USER_KILL_SWITCH_ACTIVE')) ||
      (index % 2 === 0 && market.state !== 'SOURCE_UNAVAILABLE') ||
      (index % 2 !== 0 && market.state !== 'DISABLED')
    ) {
      evaluationFailures += 1;
    }
  }
  const elapsedMs = performance.now() - startedAt;

  const scenarios = [
    {
      code: 'REAL_USER_KILL_SWITCH',
      passed:
        launchDisabled.state === 'BLOCKED' &&
        launchDisabled.blockers.includes('REAL_USER_KILL_SWITCH_ACTIVE'),
    },
    {
      code: 'CONTEXTUAL_ACTION_SUPPRESSION',
      passed:
        actionDisabled.suppressedCount === 1 &&
        actionDisabled.actions.length === 1 &&
        actionDisabled.actions[0].id === 'project:drill',
    },
    {
      code: 'BENCHMARK_SOURCE_UNAVAILABLE',
      passed:
        sourceUnavailable.state === 'SOURCE_UNAVAILABLE' &&
        !('current' in sourceUnavailable),
    },
    {
      code: 'BENCHMARK_SOURCE_STALE',
      passed: sourceStale.state === 'STALE' && !('current' in sourceStale),
    },
    {
      code: 'PARTNER_UNAVAILABLE',
      passed:
        !partnerUnavailable.eligible &&
        partnerUnavailable.reasons.includes('RECIPIENT_INACTIVE'),
    },
    {
      code: 'INCIDENT_GATE',
      passed:
        incidentBlocked.state === 'BLOCKED' &&
        incidentBlocked.blockers.includes('INCIDENT_GATE_FAILED'),
    },
    {
      code: 'CONFIGURATION_RESTORATION',
      passed:
        baseline.state === 'READY' &&
        JSON.stringify(restored) === JSON.stringify(baseline),
    },
  ];
  const load = {
    iterations,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    maxElapsedMs,
    evaluationFailures,
    bounded: iterations <= 50_000,
    passed:
      evaluationFailures === 0 &&
      iterations <= 50_000 &&
      elapsedMs <= maxElapsedMs,
  };

  return {
    contractVersion: COVERAGE_OPERATIONAL_DRILL_VERSION,
    checkedAt: now.toISOString(),
    passed: scenarios.every(({ passed }) => passed) && load.passed,
    scenarios,
    load,
    evidence: {
      rollbackDrillVersion: COVERAGE_LAUNCH_GATE_VERSION,
      technicalEvidenceVersion: COVERAGE_LAUNCH_EVIDENCE_VERSION,
      containsPolicyOrContactData: false,
    },
  };
}
