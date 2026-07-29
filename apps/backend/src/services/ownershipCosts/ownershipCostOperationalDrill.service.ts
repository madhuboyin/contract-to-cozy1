import { performance } from 'node:perf_hooks';
import {
  OWNERSHIP_COST_DEFINITION_VERSION,
} from './ownershipCost.contract';
import {
  OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
  OWNERSHIP_COST_METHOD_VERSION,
} from './ownershipCostAdapters';
import {
  OWNERSHIP_COST_ACCESSIBILITY_EVIDENCE_VERSION,
  OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION,
  OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
  OWNERSHIP_COST_RESPONSIVE_EVIDENCE_VERSION,
  evaluateOwnershipCostLaunchGate,
  type OwnershipCostLaunchGateInput,
} from './ownershipCostLaunchGate.service';
import {
  EXPECTED_OWNERSHIP_COST_ADAPTERS,
  evaluateOwnershipCostOperationalAnomalies,
  replayOwnershipCostArtifact,
} from './ownershipCostOperations.service';
import { OWNERSHIP_COST_REPRESENTATIVE_FIXTURES } from './ownershipCostOperationalFixtures';
import { buildOwnershipCostSnapshotDraft } from './ownershipCostSnapshot';

function readyLaunchInput(): OwnershipCostLaunchGateInput {
  return {
    capabilityPresent: true,
    releaseStage: 'ACTIVE',
    rolloutEnabled: true,
    incidentGatePassed: true,
    realUserLaunchEnabled: true,
    technicalEvidenceVersion: OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION,
    operationalDrillVersion: OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
    accessibilityEvidenceVersion:
      OWNERSHIP_COST_ACCESSIBILITY_EVIDENCE_VERSION,
    responsiveEvidenceVersion:
      OWNERSHIP_COST_RESPONSIVE_EVIDENCE_VERSION,
    operationsReviewEvidenceId: 'operational-drill-fixture',
    accessibilityApproved: true,
    responsiveApproved: true,
    contentSafetyApproved: true,
    commercialIntegrityApproved: true,
    humanApprovalEnforcementEnabled: true,
    governanceReviewSourceAvailable: true,
    missingGovernanceRoles: [],
    rejectedGovernanceRoles: [],
    uncontainedHighRiskGapIds: [],
  };
}

export function runOwnershipCostOperationalDrill(options: {
  iterations?: number;
  maxElapsedMs?: number;
} = {}) {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const fixtureResults = OWNERSHIP_COST_REPRESENTATIVE_FIXTURES.map(
    (fixture) => {
      const snapshot = buildOwnershipCostSnapshotDraft(
        fixture.observations,
        now,
      );
      const replay = replayOwnershipCostArtifact({
        propertyId: fixture.key,
        snapshotId: `snapshot:${fixture.key}`,
        definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
        methodVersion: snapshot.methodVersion,
        categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
        inputFingerprint: snapshot.inputFingerprint,
        basePeriodEnd: new Date(snapshot.basePeriodEnd),
        coverageStatus: snapshot.coverageStatus,
        applicableCategories: snapshot.applicableCategories,
        missingCategories: snapshot.missingCategories,
        totalsByLens: snapshot.totalsByLens,
        observations: [...fixture.observations],
      });
      return {
        key: fixture.key,
        expectedCoverageStatus: fixture.expectedCoverageStatus,
        actualCoverageStatus: snapshot.coverageStatus,
        replayed: replay.reproduced,
        passed:
          snapshot.coverageStatus === fixture.expectedCoverageStatus
          && replay.reproduced,
      };
    },
  );

  const propertyId = 'operations-drill-property';
  const adapterRuns = EXPECTED_OWNERSHIP_COST_ADAPTERS.map((adapterKey) => ({
    propertyId,
    adapterKey,
    adapterVersion: 'ownership-cost-adapters-v1',
    status: adapterKey === 'insurance'
      ? 'FAILED' as const
      : 'SUCCEEDED' as const,
    sourceCount: 1,
    observationCount: 1,
    startedAt: now,
    completedAt: now,
  })).filter((run) => run.adapterKey !== 'reserve');
  const anomalies = evaluateOwnershipCostOperationalAnomalies({
    adapterRuns,
    snapshots: [{
      id: 'snapshot:drill',
      propertyId,
      methodVersion: 'retired-method',
      categoryDefinitionVersion:
        OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
      inputFingerprint: 'a'.repeat(64),
      coverageStatus: 'PARTIAL',
      missingCategories: ['RESERVE_CONTRIBUTION'],
      computedAt: new Date('2026-07-25T00:00:00.000Z'),
    }],
    changes: [{
      id: 'change:drill',
      propertyId,
      category: 'INSURANCE',
      amountDeltaCents: 200_000,
      evidenceJson: { priorAnnualCents: 100_000 },
      createdAt: now,
    }],
    now,
  });

  const launchReady = evaluateOwnershipCostLaunchGate(readyLaunchInput());
  const launchDisabled = evaluateOwnershipCostLaunchGate({
    ...readyLaunchInput(),
    realUserLaunchEnabled: false,
  });
  const approvalMissing = evaluateOwnershipCostLaunchGate({
    ...readyLaunchInput(),
    contentSafetyApproved: false,
  });
  const expectedAnomalies = [
    'ADAPTER_FAILURE',
    'CATEGORY_JUMP',
    'DEFINITION_MISMATCH',
    'MISSING_CANONICAL_ADAPTER',
    'STALE_SNAPSHOT',
  ];
  const actualAnomalies = [...new Set(anomalies.map((item) => item.type))]
    .sort();

  const iterations = Math.max(1, Math.min(options.iterations ?? 10_000, 50_000));
  const maxElapsedMs = options.maxElapsedMs ?? 5_000;
  const startedAt = performance.now();
  let deterministicFailures = 0;
  const fixture = OWNERSHIP_COST_REPRESENTATIVE_FIXTURES[0];
  for (let index = 0; index < iterations; index += 1) {
    const snapshot = buildOwnershipCostSnapshotDraft(
      fixture.observations,
      now,
    );
    if (
      snapshot.methodVersion !== OWNERSHIP_COST_METHOD_VERSION
      || snapshot.inputFingerprint.length !== 64
    ) {
      deterministicFailures += 1;
    }
  }
  const elapsedMs = performance.now() - startedAt;
  const scenarios = [
    {
      code: 'REPRESENTATIVE_FIXTURES_REPLAY',
      passed: fixtureResults.every((result) => result.passed),
    },
    {
      code: 'ANOMALY_CONTROLS',
      passed: JSON.stringify(actualAnomalies)
        === JSON.stringify(expectedAnomalies),
    },
    {
      code: 'LAUNCH_FAIL_CLOSED',
      passed:
        launchReady.state === 'READY'
        && launchDisabled.blockers.includes('REAL_USER_LAUNCH_DISABLED')
        && approvalMissing.blockers.includes(
          'CONTENT_SAFETY_APPROVAL_MISSING',
        ),
    },
    {
      code: 'DETERMINISTIC_PERFORMANCE',
      passed:
        deterministicFailures === 0
        && elapsedMs <= maxElapsedMs,
    },
  ];
  return {
    contractVersion: OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
    passed: scenarios.every((scenario) => scenario.passed),
    generatedAt: new Date().toISOString(),
    scenarios,
    fixtures: fixtureResults,
    anomalyTypes: actualAnomalies,
    performance: {
      iterations,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      maxElapsedMs,
      deterministicFailures,
    },
  };
}
