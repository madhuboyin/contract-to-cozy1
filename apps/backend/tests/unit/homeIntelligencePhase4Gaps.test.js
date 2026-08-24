const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape tests for the Home Intelligence Functional
// Completeness FRD Phase 4 gap fix: claims previously had zero touchpoint
// with Operational Work Items or Outcome Observations, and
// PROJECT_RECORD/BOOKING_RECORD/CLAIM_RECORD/INSPECTION_FINDING/
// DOCUMENT_PROMOTION/COVERAGE_DECISION/HOME_EVENT had no OutcomeObservation
// creation path at all despite being declared in the schema. Same style as
// tests/decisionPlatform/outcomeObservationGovernance.test.js and
// tests/unit/propertyContextJustInTimeSlice4Claims.test.js — no test
// database exists, so these assert structural wiring, not runtime behavior.

const read = (relative) => readFileSync(resolve(__dirname, relative), 'utf8');

const schema = read('../../prisma/schema.prisma');
const outcomeService = read('../../src/services/decisionPlatform/outcomeObservationService.ts');
const claimReconciliation = read('../../src/services/claimWorkReconciliation.service.ts');
const claimsService = read('../../src/services/claims/claims.service.ts');
const extractionService = read('../../src/services/homeRecordsExtraction.service.ts');
const coverageComparisonService = read('../../src/services/coverageComparison.service.ts');

test('schema declares the new claim work-item enum values', () => {
  const obligationEnum = schema.slice(schema.indexOf('enum OperationalObligationType {'), schema.indexOf('enum OperationalWorkSourceType {'));
  assert.match(obligationEnum, /CLAIM_RESOLUTION/);

  const sourceEnum = schema.slice(schema.indexOf('enum OperationalWorkSourceType {'), schema.indexOf('enum OperationalWorkSourceRole {'));
  assert.match(sourceEnum, /\bCLAIM\b/);

  const executionEnum = schema.slice(schema.indexOf('enum OperationalWorkExecutionType {'), schema.indexOf('enum OperationalWorkExecutionRole {'));
  assert.match(executionEnum, /\bCLAIM\b/);
});

test('reconcileClaimCreated proposes a CLAIM_RESOLUTION work item and immediately accepts a fresh CANDIDATE', () => {
  const fnStart = claimReconciliation.indexOf('export async function reconcileClaimCreated(');
  const fnEnd = claimReconciliation.indexOf('\nasync function walkToReportedComplete', fnStart);
  const fn = claimReconciliation.slice(fnStart, fnEnd);
  assert.match(fn, /obligationType:\s*'CLAIM_RESOLUTION'/);
  assert.match(fn, /sourceType:\s*'CLAIM'/);
  assert.match(fn, /if \(workItem\.state === 'CANDIDATE'\)/);
  assert.match(fn, /to:\s*'ACCEPTED'/);
  assert.match(fn, /executionType:\s*'CLAIM'/);
});

test('reconcileClaimStatusChanged verifies the work item and records a CLAIM_RECORD outcome on APPROVED/DENIED', () => {
  const fnStart = claimReconciliation.indexOf('export async function reconcileClaimStatusChanged(');
  const fn = claimReconciliation.slice(fnStart);
  assert.match(fn, /input\.toStatus === 'APPROVED' \|\| input\.toStatus === 'DENIED'/);
  assert.match(fn, /to:\s*'VERIFIED'/);
  assert.match(fn, /recordClaimOutcome\(/);
});

test('reconcileClaimStatusChanged closes an abandoned claim (no decision) with disposition CANCELLED, not NOT_RELEVANT/DISMISSED', () => {
  const fnStart = claimReconciliation.indexOf('export async function reconcileClaimStatusChanged(');
  const fn = claimReconciliation.slice(fnStart);
  assert.match(fn, /disposition:\s*'CANCELLED'/);
  assert.doesNotMatch(fn, /disposition:\s*'NOT_RELEVANT'/);
  assert.doesNotMatch(fn, /disposition:\s*'DISMISSED'/);
});

test('claims.service.ts wires claim creation and every real status transition into Home Operations reconciliation', () => {
  assert.match(claimsService, /import \{ reconcileClaimCreated, reconcileClaimStatusChanged \} from '\.\.\/claimWorkReconciliation\.service'/);

  const createStart = claimsService.indexOf('static async createClaim(');
  const createEnd = claimsService.indexOf('\n  static async updateClaim(', createStart);
  assert.match(claimsService.slice(createStart, createEnd), /reconcileClaimCreated\(/);

  const updateStart = claimsService.indexOf('static async updateClaim(');
  const updateEnd = claimsService.indexOf('\n    async function validateCanSubmitClaim(', updateStart);
  const updateSlice = claimsService.slice(updateStart, updateEnd > updateStart ? updateEnd : undefined);
  assert.match(updateSlice, /if \(requestedStatus !== 'DRAFT'\) \{/);
  assert.match(updateSlice, /reconcileClaimStatusChanged\(/);
});

test('recordClaimOutcome is idempotent on the claim and never writes VERIFIED (the work item transition, not the outcome row, owns that state)', () => {
  const fnStart = outcomeService.indexOf('export async function recordClaimOutcome(');
  const fnEnd = outcomeService.indexOf('\n// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-005)', fnStart);
  const fn = outcomeService.slice(fnStart, fnEnd);
  const existingCheckIndex = fn.indexOf('outcomeObservation.findFirst');
  const createIndex = fn.indexOf('outcomeObservation.create');
  assert.ok(existingCheckIndex > 0 && createIndex > existingCheckIndex, 'must check for an existing observation before creating a new one');
  assert.match(fn, /if \(existing\) return existing;/);
  assert.match(fn, /sourceType:\s*'CLAIM_RECORD'/);
  assert.doesNotMatch(fn, /verificationStatus:\s*'VERIFIED'/);
});

test('recordDocumentPromotionOutcome is idempotent and carries no attribution', () => {
  const fnStart = outcomeService.indexOf('export async function recordDocumentPromotionOutcome(');
  const fnEnd = outcomeService.indexOf('\n// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-005/', fnStart);
  const fn = outcomeService.slice(fnStart, fnEnd);
  assert.match(fn, /if \(existing\) return existing;/);
  assert.match(fn, /sourceType:\s*'DOCUMENT_PROMOTION'/);
  assert.doesNotMatch(fn, /attachAttributions/);
});

test('recordCoverageDecisionOutcome only attaches a SELECTED_OPTION attribution when a recommendationSnapshotId is supplied', () => {
  const fnStart = outcomeService.indexOf('export async function recordCoverageDecisionOutcome(');
  const fn = outcomeService.slice(fnStart);
  assert.match(fn, /if \(existing\) return existing;/);
  assert.match(fn, /sourceType:\s*'COVERAGE_DECISION'/);
  assert.match(fn, /if \(input\.recommendationSnapshotId\) \{/);
  assert.match(fn, /\['SELECTED_OPTION'\]/);
});

test('promoteWarranty and promoteExpense record a DOCUMENT_PROMOTION outcome; promoteInsurancePolicy deliberately does not (its staged term is still unverified)', () => {
  const warrantyStart = extractionService.indexOf('async promoteWarranty(');
  const warrantyEnd = extractionService.indexOf('\n  async promoteExpense(', warrantyStart);
  assert.match(extractionService.slice(warrantyStart, warrantyEnd), /recordDocumentPromotionOutcome\(\{[\s\S]*?promotedEntityType:\s*'WARRANTY'/);

  const expenseStart = extractionService.indexOf('async promoteExpense(');
  const expenseEnd = extractionService.indexOf('\n  async promoteInsurancePolicy(', expenseStart);
  assert.match(extractionService.slice(expenseStart, expenseEnd), /recordDocumentPromotionOutcome\(\{[\s\S]*?promotedEntityType:\s*'EXPENSE'/);

  const insuranceStart = extractionService.indexOf('async promoteInsurancePolicy(');
  const insuranceEnd = extractionService.indexOf('\n\n', extractionService.indexOf('return staged;', insuranceStart));
  const insuranceFn = extractionService.slice(insuranceStart, insuranceEnd > insuranceStart ? insuranceEnd : extractionService.length);
  assert.doesNotMatch(insuranceFn, /recordDocumentPromotionOutcome/);
});

test('recordCoverageDecision records a COVERAGE_DECISION outcome inside its own transaction', () => {
  const fnStart = coverageComparisonService.indexOf('export async function recordCoverageDecision(');
  const fn = coverageComparisonService.slice(fnStart);
  assert.match(fn, /recordCoverageDecisionOutcome\(\{/);
  assert.match(fn, /coverageDecisionId:\s*recorded\.id/);
});
