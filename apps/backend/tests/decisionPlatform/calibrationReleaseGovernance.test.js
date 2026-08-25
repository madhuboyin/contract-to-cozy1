const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape test, not a DB integration test -- there is no
// test database for this area (see outcomeObservationGovernance.test.js,
// which established this style for the Decision Platform's Phase 10
// subsystem). Asserts calibrationActivation.service.ts and
// calibrationGovernanceReview.service.ts are structurally wired to the
// Phase 10B exit criteria the FRD requires, most importantly that
// activation can never bypass either the data-driven bar or full four-role
// approval.

const activationSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/calibrationActivation.service.ts'), 'utf8');
const governanceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/calibrationGovernanceReview.service.ts'), 'utf8');
const engineSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts'), 'utf8');
const threadServiceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionThreadService.ts'), 'utf8');
const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const { datasetFingerprintFor } = require('../../src/services/decisionPlatform/calibrationReleaseService.ts');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `could not find start marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end > start ? end : source.length);
}

test('activateCalibrationRelease checks governance readiness before writing the active-release pointer', () => {
  const fn = slice(activationSource, 'export async function activateCalibrationRelease(');
  const readinessIndex = fn.indexOf('loadCalibrationGovernanceReadiness');
  const upsertIndex = fn.indexOf('systemSetting.upsert');
  assert.ok(readinessIndex > 0 && upsertIndex > readinessIndex, 'must load governance readiness before writing the SystemSetting pointer');
  assert.match(fn, /assertCalibrationReleaseActivatable\(release, readiness\)/);
});

test('activateCalibrationRelease never references ENFORCE_HUMAN_POLICY_APPROVALS -- calibration activation is not subject to the internal-beta advisory-approval flag', () => {
  const fn = slice(activationSource, 'export async function activateCalibrationRelease(', 'export async function rollbackCalibrationRelease(');
  assert.doesNotMatch(fn, /ENFORCE_HUMAN_POLICY_APPROVALS|areHumanPolicyApprovalsEnforced/, 'activation must unconditionally require full role approval, never bypassed by the advisory-approvals flag');
});

test('activateCalibrationRelease supersedes any currently-ACTIVE release for the family before activating this one', () => {
  const fn = slice(activationSource, 'export async function activateCalibrationRelease(', 'export async function rollbackCalibrationRelease(');
  assert.match(fn, /status: 'ACTIVE' *\}[\s\S]*?data: \{ status: 'SUPERSEDED' \}/);
});

test('rollbackCalibrationRelease marks the release ROLLED_BACK and always resets the SystemSetting pointer, never leaving a dangling active pointer', () => {
  const fn = slice(activationSource, 'export async function rollbackCalibrationRelease(');
  assert.match(fn, /status: 'ROLLED_BACK'/);
  assert.match(fn, /systemSetting\.delete/);
});

test('resolveWeightsFromReleaseRow is the single source of truth activation reads through -- no other path reads candidateWeights directly', () => {
  const occurrences = (activationSource.match(/\.candidateWeights\b/g) || []).length;
  assert.equal(occurrences, 1, 'candidateWeights should be read in exactly one place: resolveWeightsFromReleaseRow');
});

test('recordCalibrationGovernanceReview rejects a review unless the release has actually cleared the data-driven READY_FOR_REVIEW bar', () => {
  const fn = slice(governanceSource, 'export async function recordCalibrationGovernanceReview(');
  const reviewableCheckIndex = fn.indexOf('REVIEWABLE_STATUSES.includes');
  const upsertIndex = fn.indexOf('calibrationGovernanceReview.upsert');
  assert.ok(reviewableCheckIndex > 0 && upsertIndex > reviewableCheckIndex, 'must check reviewability before writing a review');
  assert.match(governanceSource, /const REVIEWABLE_STATUSES: CalibrationReleaseStatus\[\] = \['READY_FOR_REVIEW'\]/, 'only READY_FOR_REVIEW releases may be reviewed -- PROPOSED (insufficient data) must never be reviewable');
});

test('the four required calibration governance roles are exactly Product, Domain, Privacy, and Trust per FRD §19.4', () => {
  assert.match(governanceSource, /CALIBRATION_RELEASE_REQUIRED_ROLES = \['PRODUCT', 'DOMAIN', 'PRIVACY', 'TRUST'\]/);
});

test('calibration dataset fingerprint is order independent but changes when reviewed row content changes', () => {
  const base = {
    propertyId: 'property-1', recommendationSnapshotId: 'snapshot-1', context: { condition: 'GOOD' },
    observation: { id: 'observation-1', verificationStatus: 'CORROBORATED', actionState: 'COMPLETED', costCents: 100_000, occurredAt: '2026-01-01T00:00:00.000Z' },
  };
  const second = { ...base, propertyId: 'property-2', recommendationSnapshotId: 'snapshot-2', observation: { ...base.observation, id: 'observation-2' } };
  assert.equal(datasetFingerprintFor([base, second], 'policy-v1'), datasetFingerprintFor([second, base], 'policy-v1'));
  assert.notEqual(datasetFingerprintFor([base], 'policy-v1'), datasetFingerprintFor([{ ...base, observation: { ...base.observation, costCents: 200_000 } }], 'policy-v1'));
});

test('evaluateHvacRepairReplace defaults to DEFAULT_HVAC_ENGINE_WEIGHTS -- a caller that omits the second argument gets pre-Phase-10B behavior exactly', () => {
  assert.match(engineSource, /weights: HvacEngineWeights = DEFAULT_HVAC_ENGINE_WEIGHTS/);
});

test('every decisionThreadService.ts call site resolves the currently-active weights before evaluating and persists calibrationReleaseId on the snapshot it creates', () => {
  const evaluateCallCount = (threadServiceSource.match(/getActiveHvacEngineWeights\(\)/g) || []).length;
  const snapshotFieldCount = (threadServiceSource.match(/calibrationReleaseId,/g) || []).length;
  assert.equal(evaluateCallCount, 3, 'expected all three HVAC recommendation-snapshot call sites to resolve active weights');
  assert.equal(snapshotFieldCount, 3, 'expected all three recommendationSnapshot.create blocks to persist calibrationReleaseId');
});

test('schema: PRIVACY is a valid RecommendationReviewRole and the TypeScript-side role list stays in sync', () => {
  const enumBlock = slice(schema, 'enum RecommendationReviewRole {', '}');
  assert.match(enumBlock, /\bPRIVACY\b/);
  const roleGateSource = readFileSync(resolve(__dirname, '../../src/productFramework/recommendationLaunchGate.ts'), 'utf8');
  assert.match(roleGateSource, /'PRIVACY',?\s*\]/, 'RECOMMENDATION_REVIEW_ROLES (TS) must include PRIVACY, matching the Prisma enum');
});

test('schema: CalibrationGovernanceReview cascade-deletes with its CalibrationRelease and is unique per (release, role)', () => {
  const model = slice(schema, 'model CalibrationGovernanceReview {', '}');
  assert.match(model, /calibrationRelease CalibrationRelease @relation\(fields: \[calibrationReleaseId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(model, /@@unique\(\[calibrationReleaseId, role\]\)/);
});

test('schema: RecommendationSnapshot\'s Phase 10B columns are additive and nullable, never breaking a pre-Phase-10B row', () => {
  const model = slice(schema, 'model RecommendationSnapshot {', '@@map("recommendation_snapshots")');
  assert.match(model, /score\s+Float\?/);
  assert.match(model, /engineInputSnapshot\s+Json\?/);
  assert.match(model, /calibrationReleaseId\s+String\?/);
});
