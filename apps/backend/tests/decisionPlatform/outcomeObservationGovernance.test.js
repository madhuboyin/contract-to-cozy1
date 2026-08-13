const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// This is a governance/source-shape test, not a DB integration test (there is
// no test database -- see docs/product/decision-platform/README.md and
// tests/decisionPlatform/decisionThreadServiceGovernance.test.js, which uses
// the same style). It asserts outcomeObservationService.ts is structurally
// wired to the Phase 10A exit criteria the FRD requires, most importantly
// that a conversation claim can never become verified automatically.

const source = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/outcomeObservationService.ts'), 'utf8');
const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

const { sourceTypeLabel } = require('../../src/services/decisionPlatform/outcomeObservationService.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

test('recordHomeownerReportedOutcome always writes a literal REPORTED verificationStatus, never derived from the message', () => {
  const fnStart = source.indexOf('export async function recordHomeownerReportedOutcome(');
  const fnEnd = source.indexOf('\n// FRD §19.2\'s first allowed source', fnStart);
  const fn = source.slice(fnStart, fnEnd > fnStart ? fnEnd : source.indexOf('\nexport async function recordCompletedMaintenanceOutcome', fnStart));
  assert.match(fn, /verificationStatus:\s*'REPORTED'/, 'homeowner-reported observations must hardcode REPORTED');
  assert.doesNotMatch(fn, /verificationStatus:\s*'VERIFIED'/, 'a homeowner report must never be written as VERIFIED');
});

test('recordCompletedMaintenanceOutcome only ever writes CORROBORATED, never VERIFIED, from a domain record alone', () => {
  const fnStart = source.indexOf('export async function recordCompletedMaintenanceOutcome(');
  const fnEnd = source.indexOf('\nexport interface OutcomeSummaryAttribution', fnStart);
  const fn = source.slice(fnStart, fnEnd);
  assert.match(fn, /verificationStatus:\s*'CORROBORATED'/);
  assert.doesNotMatch(fn, /verificationStatus:\s*'VERIFIED'/);
});

test('recordCompletedMaintenanceOutcome is idempotent on the source entity before creating a new observation', () => {
  const fnStart = source.indexOf('export async function recordCompletedMaintenanceOutcome(');
  const fnEnd = source.indexOf('\nexport interface OutcomeSummaryAttribution', fnStart);
  const fn = source.slice(fnStart, fnEnd);
  const existingCheckIndex = fn.indexOf('outcomeObservation.findFirst');
  const createIndex = fn.indexOf('outcomeObservation.create');
  assert.ok(existingCheckIndex > 0 && createIndex > existingCheckIndex, 'must check for an existing observation before creating a new one');
  assert.match(fn, /if \(existing\) return null;/);
});

test('disputeOutcomeObservation marks REJECTED and never deletes the row (FRD §21.5 unlink control)', () => {
  const fnStart = source.indexOf('export async function disputeOutcomeObservation(');
  const fn = source.slice(fnStart);
  assert.match(fn, /verificationStatus:\s*'REJECTED'/);
  assert.match(fn, /reviewStatus:\s*'DISPUTED'/);
  assert.doesNotMatch(fn, /outcomeObservation\.delete/, 'disputing must never hard-delete the observation');
});

test('a correction (re-report) supersedes the prior observation instead of mutating it in place', () => {
  const fnStart = source.indexOf('export async function recordHomeownerReportedOutcome(');
  const fn = source.slice(fnStart, source.indexOf('export async function recordCompletedMaintenanceOutcome('));
  assert.match(fn, /verificationStatus:\s*'SUPERSEDED'/);
  assert.match(fn, /supersedesId:\s*priorReport \? priorReport\.id : null/);
});

test('sourceTypeLabel is exhaustive over every declared OutcomeObservationSourceType', () => {
  assert.equal(sourceTypeLabel('HOMEOWNER_REPORTED'), 'You reported this');
  assert.equal(sourceTypeLabel('COMPLETED_MAINTENANCE_RECORD'), 'From a completed maintenance record');
});

test('OutcomeObservation and RecommendationAttribution cascade-delete with their Property/RecommendationSnapshot, matching every other Decision Platform table', () => {
  const observationModel = schema.slice(schema.indexOf('model OutcomeObservation {'), schema.indexOf('model RecommendationAttribution {'));
  assert.match(observationModel, /property\s+Property\s+@relation\(fields: \[propertyId\], references: \[id\], onDelete: Cascade\)/);

  const attributionModel = schema.slice(schema.indexOf('model RecommendationAttribution {'), schema.indexOf('// ============================================================================\n// KNOWLEDGE HUB'));
  assert.match(attributionModel, /recommendationSnapshot RecommendationSnapshot @relation\(fields: \[recommendationSnapshotId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(attributionModel, /outcomeObservation\s+OutcomeObservation\s+@relation\(fields: \[outcomeObservationId\], references: \[id\], onDelete: Cascade\)/);
});

test('the OUTCOME_SUMMARY presentation block accepts a full entry and never claims a REPORTED entry is comparable without normalization basis', () => {
  const block = {
    type: 'OUTCOME_SUMMARY', id: 'o1', title: 'Outcome', decisionThreadId: 'thread-1',
    entries: [{
      outcomeObservationId: 'obs-1', recommendationSnapshotId: 'snap-1', observedType: 'ACTION_COMPLETED',
      occurredAt: '2026-08-01T00:00:00.000Z', verificationStatus: 'REPORTED', sourceLabel: 'You reported this',
      relationshipType: 'ACTION_COMPLETED', attributionConfidence: null, reviewStatus: 'PENDING',
      comparable: false, observedCostLabel: '$6,200.00', predictedCostLabel: null, note: null,
    }],
    limitation: 'A different outcome or homeowner choice does not by itself prove the recommendation was incorrect.',
  };
  assert.equal(AskPresentationBlockSchema.safeParse(block).success, true);
});
