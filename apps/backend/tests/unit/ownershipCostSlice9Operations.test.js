const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION,
  OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
  OWNERSHIP_COST_VALUE_FUNNEL,
  evaluateOwnershipCostLaunchGate,
} = require(
  '../../src/services/ownershipCosts/ownershipCostLaunchGate.service.ts',
);
const {
  EXPECTED_OWNERSHIP_COST_ADAPTERS,
  buildOwnershipCostOperationsDashboard,
  evaluateOwnershipCostOperationalAnomalies,
  replayOwnershipCostArtifact,
} = require(
  '../../src/services/ownershipCosts/ownershipCostOperations.service.ts',
);
const {
  OWNERSHIP_COST_REPRESENTATIVE_FIXTURES,
} = require(
  '../../src/services/ownershipCosts/ownershipCostOperationalFixtures.ts',
);
const {
  runOwnershipCostOperationalDrill,
} = require(
  '../../src/services/ownershipCosts/ownershipCostOperationalDrill.service.ts',
);
const {
  buildOwnershipCostSnapshotDraft,
} = require(
  '../../src/services/ownershipCosts/ownershipCostSnapshot.ts',
);
const {
  OWNERSHIP_COST_DEFINITION_VERSION,
} = require(
  '../../src/services/ownershipCosts/ownershipCost.contract.ts',
);

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relative) =>
  fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const now = new Date('2026-07-28T12:00:00.000Z');

function readyLaunch(overrides = {}) {
  return {
    capabilityPresent: true,
    releaseStage: 'ACTIVE',
    rolloutEnabled: true,
    incidentGatePassed: true,
    realUserLaunchEnabled: true,
    technicalEvidenceVersion: OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION,
    operationalDrillVersion: OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
    accessibilityApproved: true,
    responsiveApproved: true,
    contentSafetyApproved: true,
    commercialIntegrityApproved: true,
    humanApprovalEnforcementEnabled: true,
    governanceReviewSourceAvailable: true,
    missingGovernanceRoles: [],
    rejectedGovernanceRoles: [],
    uncontainedHighRiskGapIds: [],
    ...overrides,
  };
}

test('representative property fixtures retain credible, partial, and estimate-only truth states', () => {
  assert.deepEqual(
    OWNERSHIP_COST_REPRESENTATIVE_FIXTURES.map((fixture) => fixture.key),
    [
      'financed-detached-credible',
      'condo-partial',
      'paid-off-estimate-only',
    ],
  );
  for (const fixture of OWNERSHIP_COST_REPRESENTATIVE_FIXTURES) {
    const snapshot = buildOwnershipCostSnapshotDraft(
      fixture.observations,
      now,
    );
    assert.equal(
      snapshot.coverageStatus,
      fixture.expectedCoverageStatus,
      fixture.key,
    );
  }
});

test('fingerprint replay reproduces retained material calculations without mutation', () => {
  const fixture = OWNERSHIP_COST_REPRESENTATIVE_FIXTURES[0];
  const snapshot = buildOwnershipCostSnapshotDraft(fixture.observations, now);
  const replay = replayOwnershipCostArtifact({
    propertyId: fixture.key,
    snapshotId: 'snapshot-1',
    definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
    methodVersion: snapshot.methodVersion,
    categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
    inputFingerprint: snapshot.inputFingerprint,
    basePeriodEnd: new Date(snapshot.basePeriodEnd),
    coverageStatus: snapshot.coverageStatus,
    applicableCategories: snapshot.applicableCategories,
    missingCategories: snapshot.missingCategories,
    totalsByLens: snapshot.totalsByLens,
    observations: fixture.observations,
  });
  assert.equal(replay.reproduced, true);
  assert.equal(replay.mutationPerformed, false);
  assert.deepEqual(replay.differences, []);

  const drifted = replayOwnershipCostArtifact({
    propertyId: fixture.key,
    snapshotId: 'snapshot-1',
    definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
    methodVersion: snapshot.methodVersion,
    categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
    inputFingerprint: 'f'.repeat(64),
    basePeriodEnd: new Date(snapshot.basePeriodEnd),
    coverageStatus: snapshot.coverageStatus,
    applicableCategories: snapshot.applicableCategories,
    missingCategories: snapshot.missingCategories,
    totalsByLens: snapshot.totalsByLens,
    observations: fixture.observations,
  });
  assert.equal(drifted.reproduced, false);
  assert.deepEqual(drifted.differences, ['INPUT_FINGERPRINT']);
});

test('operations dashboard detects missing adapters, failures, stale truth, version drift, and category jumps', () => {
  const propertyId = 'property-1';
  const adapterRuns = EXPECTED_OWNERSHIP_COST_ADAPTERS
    .filter((key) => key !== 'reserve')
    .map((adapterKey) => ({
      propertyId,
      adapterKey,
      adapterVersion: 'ownership-cost-adapters-v1',
      status: adapterKey === 'insurance' ? 'FAILED' : 'SUCCEEDED',
      sourceCount: 1,
      observationCount: 1,
      startedAt: now,
      completedAt: now,
    }));
  const snapshots = [{
    id: 'snapshot-1',
    propertyId,
    methodVersion: 'old-method',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    inputFingerprint: 'a'.repeat(64),
    coverageStatus: 'PARTIAL',
    missingCategories: ['RESERVE_CONTRIBUTION'],
    computedAt: new Date('2026-07-25T00:00:00.000Z'),
  }];
  const changes = [{
    id: 'change-1',
    propertyId,
    category: 'INSURANCE',
    amountDeltaCents: 200_000,
    evidenceJson: { priorAnnualCents: 100_000 },
    createdAt: now,
  }];
  const anomalies = evaluateOwnershipCostOperationalAnomalies({
    adapterRuns,
    snapshots,
    changes,
    now,
  });
  assert.deepEqual(
    [...new Set(anomalies.map((item) => item.type))].sort(),
    [
      'ADAPTER_FAILURE',
      'CATEGORY_JUMP',
      'DEFINITION_MISMATCH',
      'MISSING_CANONICAL_ADAPTER',
      'STALE_SNAPSHOT',
    ],
  );

  const dashboard = buildOwnershipCostOperationsDashboard({
    adapterRuns,
    snapshots,
    changes,
    decisions: [{
      decisionType: 'CATEGORY_ACTION',
      status: 'RECORDED',
      payloadJson: { lifecycleState: 'SAVED' },
      recordedAt: now,
    }, {
      decisionType: 'CATEGORY_ACTION',
      status: 'REVISED',
      payloadJson: { lifecycleState: 'RESOLVED' },
      recordedAt: now,
    }],
    windowStart: new Date('2026-07-01T00:00:00.000Z'),
    now,
  });
  assert.equal(dashboard.actionFunnel.engaged, 1);
  assert.equal(dashboard.actionFunnel.resolvedOutcomes, 1);
  assert.match(dashboard.actionFunnel.rule, /separately/i);
  assert.equal(dashboard.calculations.persistedAdapterFailures, 1);
});

test('real-user launch is fail-closed on technical, operational, accessibility, safety, and commercial gates', () => {
  const ready = evaluateOwnershipCostLaunchGate(readyLaunch());
  assert.equal(ready.state, 'READY');
  assert.deepEqual(ready.valueFunnel, OWNERSHIP_COST_VALUE_FUNNEL);

  const blocked = evaluateOwnershipCostLaunchGate(readyLaunch({
    realUserLaunchEnabled: false,
    technicalEvidenceVersion: null,
    operationalDrillVersion: null,
    accessibilityApproved: false,
    responsiveApproved: false,
    contentSafetyApproved: false,
    commercialIntegrityApproved: false,
    uncontainedHighRiskGapIds: ['OCI-999'],
  }));
  assert.equal(blocked.state, 'BLOCKED');
  for (const blocker of [
    'REAL_USER_LAUNCH_DISABLED',
    'TECHNICAL_EVIDENCE_MISSING',
    'OPERATIONAL_DRILL_MISSING',
    'ACCESSIBILITY_GATE_FAILED',
    'RESPONSIVE_GATE_FAILED',
    'CONTENT_SAFETY_APPROVAL_MISSING',
    'COMMERCIAL_INTEGRITY_APPROVAL_MISSING',
    'UNCONTAINED_HIGH_RISK_GAP',
  ]) assert.ok(blocked.blockers.includes(blocker), blocker);
});

test('operations endpoints and environment controls are protected and fail closed', () => {
  const routes = read(
    'apps/backend/src/routes/ownershipCostOperations.routes.ts',
  );
  const env = read('apps/backend/.env.example');
  const metrics = read('apps/backend/src/lib/metrics.ts');
  for (const endpoint of [
    'admin/ownership-costs/operations',
    'admin/ownership-costs/replay',
    'admin/ownership-costs/launch-gate',
  ]) assert.match(routes, new RegExp(endpoint));
  assert.match(routes, /requireMfa/);
  assert.ok(routes.includes("requireCapability('ANALYTICS_VIEW')"));
  assert.ok(routes.includes("requireCapability('AUDIT_VIEW')"));
  assert.ok(routes.includes("requireCapability('RELEASE_GATE_VIEW')"));
  assert.match(env, /OWNERSHIP_COST_REAL_USER_LAUNCH_ENABLED=false/);
  assert.match(env, /OWNERSHIP_COST_CONTENT_SAFETY_APPROVED=false/);
  assert.match(env, /OWNERSHIP_COST_COMMERCIAL_INTEGRITY_APPROVED=false/);
  assert.match(metrics, /ownership_cost_calculations_total/);
  assert.match(metrics, /ownership_cost_replay_total/);
  assert.match(metrics, /ownership_cost_anomalies/);
});

test('operational drill and runbook cover replay, containment, and approval evidence', () => {
  const report = runOwnershipCostOperationalDrill({
    iterations: 100,
    maxElapsedMs: 5000,
  });
  assert.equal(report.passed, true);
  const runbook = read(
    'docs/operations/OWNERSHIP_COST_INTELLIGENCE_OPERATIONS_AND_GOVERNANCE.md',
  );
  assert.match(runbook, /last-known-good/i);
  assert.match(runbook, /mutationPerformed: false/);
  assert.match(runbook, /Engagement .* is not a resolved outcome/i);
  assert.match(runbook, /content\/safety and commercial-integrity/i);
});
