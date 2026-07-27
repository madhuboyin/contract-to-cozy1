const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  COVERAGE_COMPLETION_FUNNEL,
  COVERAGE_LAUNCH_EVIDENCE_VERSION,
  COVERAGE_LAUNCH_GATE_VERSION,
  evaluateCoverageLaunchGate,
} = require('../../src/services/coverageLaunchGate.service');

function readyInput(overrides = {}) {
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
    ...overrides,
  };
}

test('launch gate passes only when technical, operational, and human gates all pass', () => {
  const result = evaluateCoverageLaunchGate(readyInput());
  assert.equal(result.state, 'READY');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.completionFunnel, COVERAGE_COMPLETION_FUNNEL);
});

test('internal beta configuration cannot be mistaken for real-user approval', () => {
  const result = evaluateCoverageLaunchGate(readyInput({
    releaseStage: 'BETA',
    realUserKillSwitchEnabled: false,
    technicalEvidenceVersion: null,
    rollbackDrillVersion: null,
    humanApprovalEnforcementEnabled: false,
    missingGovernanceRoles: ['PRODUCT', 'DOMAIN', 'TRUST', 'LEGAL_COMPLIANCE'],
  }));
  assert.equal(result.state, 'BLOCKED');
  assert.deepEqual(result.blockers, [
    'RELEASE_STAGE_NOT_ACTIVE',
    'REAL_USER_KILL_SWITCH_ACTIVE',
    'TECHNICAL_EVIDENCE_MISSING',
    'ROLLBACK_DRILL_MISSING',
    'HUMAN_APPROVAL_ENFORCEMENT_DISABLED',
  ]);
});

test('wrong evidence versions, incidents, rejected reviews, and open high-risk gaps block launch', () => {
  const result = evaluateCoverageLaunchGate(readyInput({
    incidentGatePassed: false,
    technicalEvidenceVersion: 'old-acceptance',
    rollbackDrillVersion: 'old-drill',
    missingGovernanceRoles: ['LEGAL_COMPLIANCE'],
    rejectedGovernanceRoles: ['TRUST'],
    uncontainedHighRiskGapIds: ['COV-999'],
  }));
  assert.equal(result.state, 'BLOCKED');
  assert.deepEqual(result.blockers, [
    'INCIDENT_GATE_FAILED',
    'TECHNICAL_EVIDENCE_VERSION_MISMATCH',
    'ROLLBACK_DRILL_VERSION_MISMATCH',
    'GOVERNANCE_APPROVAL_REJECTED',
    'GOVERNANCE_APPROVAL_MISSING',
    'UNCONTAINED_HIGH_RISK_GAP',
  ]);
  assert.deepEqual(result.openHighRiskGapIds, ['COV-999']);
});

test('the canonical completion funnel has one ordered decision path', () => {
  assert.deepEqual(COVERAGE_COMPLETION_FUNNEL, [
    'ELIGIBLE',
    'SHOWN',
    'OPENED',
    'POLICY_FACTS_READY',
    'REVIEW_PRODUCED',
    'QUESTION_RESOLVED',
    'CHOICE_COMPARED',
    'DECISION_RECORDED',
    'ACTION_COMPLETED',
    'OUTCOME_OBSERVED',
  ]);
  assert.equal(new Set(COVERAGE_COMPLETION_FUNNEL).size, COVERAGE_COMPLETION_FUNNEL.length);
});

test('launch endpoint is protected and environment defaults are fail-closed', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/insuranceQuote.routes.ts'),
    'utf8',
  );
  const env = fs.readFileSync(
    path.resolve(__dirname, '../../.env.example'),
    'utf8',
  );
  assert.match(routes, /admin\/coverage-operations\/launch-gate/);
  assert.match(routes, /requireMfa/);
  assert.match(routes, /requireCapability\('RELEASE_GATE_VIEW'\)/);
  assert.match(env, /COVERAGE_REAL_USER_LAUNCH_ENABLED=false/);
  assert.match(env, /COVERAGE_LAUNCH_EVIDENCE_VERSION=\n/);
  assert.match(env, /COVERAGE_ROLLBACK_DRILL_VERSION=\n/);
});

test('regression contract keeps unsafe coverage claims and dead actions retired', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const source = (relativePath) =>
    fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const corpus = [
    source('apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx'),
    source('apps/frontend/src/components/ai/RiskPremiumOptimizerPanel.tsx'),
    source('apps/frontend/src/components/coverage/InsuranceMarketContextPanel.tsx'),
    source('apps/frontend/src/components/coverage/CoverageComparisonPanel.tsx'),
  ].join('\n');
  for (const forbidden of [
    'href="#"',
    '10–15%',
    'fully covered',
    'You are overpaying',
    'best price',
    'Estimated savings range',
  ]) {
    assert.equal(corpus.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(corpus, /not a personal insurance quote or carrier offer/);
  assert.match(corpus, /premium eligibility or change must be confirmed by the carrier/);
});
