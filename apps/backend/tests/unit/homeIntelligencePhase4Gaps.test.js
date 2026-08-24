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
const homeOperationsController = read('../../src/modules/homeOperations/api/homeOperations.controller.ts');
const materialApprovalEvidenceService = read('../../src/services/homeOperationsMaterialApprovalEvidence.service.ts');
const saleReadinessReconciliation = read('../../src/services/saleReadinessWorkReconciliation.service.ts');
const propertySaleCaseService = read('../../src/services/propertySaleCase.service.ts');
const incidentReconciliation = read('../../src/services/incidents/incidentWorkReconciliation.service.ts');
const incidentService = read('../../src/services/incidents/incident.service.ts');
const weatherPreparationService = read('../../src/services/environment/weatherPreparation.service.ts');
const diyCompletionService = read('../../src/services/diyCompletion.service.ts');
const domainReopenDispatch = read('../../src/modules/homeOperations/infrastructure/domainReopenDispatch.ts');
const transitionWorkItemUsecase = read('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
const bookingReconciliation = read('../../src/services/bookingWorkReconciliation.service.ts');
const homeEventsService = read('../../src/services/homeEvents.service.ts');
const homeActionCompletionService = read('../../src/services/homeActionCompletion.service.ts');

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

// --- Second review round: findings 1, 2, 3, 5, 6 -----------------------

test('approveMaterialWorkHandler consults the completion evidence policy before verifying, and records an attributed outcome on VERIFIED', () => {
  const fnStart = homeOperationsController.indexOf('export async function approveMaterialWorkHandler(');
  const fnEnd = homeOperationsController.indexOf('\nexport async function batchTransitionWorkItemsHandler', fnStart);
  const fn = homeOperationsController.slice(fnStart, fnEnd);
  assert.match(fn, /assertMaterialApprovalEvidenceSatisfiesPolicy\(item, evidence,/);
  assert.match(fn, /recordOperationalWorkOutcome\(\{/);
  assert.match(fn, /resolveWorkItemRecommendationSnapshotId\(verified\.propertyId, verified\.id\)/);
  // The old unconditional SAFETY_EMERGENCY-only check must be gone, not
  // just supplemented -- REGULATED_COVERAGE must go through the same gate.
  assert.doesNotMatch(fn, /AUTHORITATIVE_EVIDENCE_REQUIRED/);
});

test('the material approval evidence policy enforces recordEvidence type, requiresDomainOwnedResolution, and policy/claim linkage from the real registry (not a duplicated copy)', () => {
  assert.match(materialApprovalEvidenceService, /import \{ evidencePolicyFor \} from '\.\/homeActionCompletion\.service'/);
  assert.match(materialApprovalEvidenceService, /policy\.recordEvidence/);
  assert.match(materialApprovalEvidenceService, /policy\.requiresDomainOwnedResolution/);
  assert.match(materialApprovalEvidenceService, /policy\.policyOrClaimLinkage/);
  assert.match(materialApprovalEvidenceService, /policy\.costOrObservedResult === 'REQUIRED'/);
  assert.match(materialApprovalEvidenceService, /documentIsVerifiableForPolicyOrClaim/);
  // requiresDomainOwnedResolution must reject anything but a verified
  // DOMAIN_COMPLETION_RECORD -- a DOCUMENT alone is not "domain-owned."
  const domainOwnedBlock = materialApprovalEvidenceService.slice(
    materialApprovalEvidenceService.indexOf('if (policy.requiresDomainOwnedResolution) {'),
  );
  assert.match(domainOwnedBlock, /evidence\.evidenceType !== 'DOMAIN_COMPLETION_RECORD'/);
});

test('sale-readiness decisions are reversible and source resolution verifies accepted work', () => {
  assert.match(saleReadinessReconciliation, /disposition = workItem\.state === 'CANDIDATE' \? 'NOT_RELEVANT' : 'CANCELLED'/);
  assert.match(saleReadinessReconciliation, /to:\s*'ACCEPTED'/);
  assert.match(saleReadinessReconciliation, /input\.action === 'REOPEN' \|\| input\.action === 'UNPURSUE'/);
  assert.match(saleReadinessReconciliation, /to:\s*'REOPENED'/);
  assert.match(saleReadinessReconciliation, /export async function reconcileSaleReadinessItemResolved/);
  assert.match(saleReadinessReconciliation, /to:\s*'VERIFIED'/);
  assert.match(saleReadinessReconciliation, /recordOperationalWorkOutcome\(\{/);

  assert.match(propertySaleCaseService, /reconcileSaleReadinessItemDecision, reconcileSaleReadinessItemResolved/);
  assert.match(propertySaleCaseService, /itemsToResolve\.map\(\(item\) => reconcileSaleReadinessItemResolved/);
  const setItemDecisionStart = propertySaleCaseService.indexOf('static async setItemDecision(');
  const setItemDecisionEnd = propertySaleCaseService.indexOf('\n  // Resolves & validates', setItemDecisionStart);
  const fn = propertySaleCaseService.slice(setItemDecisionStart, setItemDecisionEnd > setItemDecisionStart ? setItemDecisionEnd : undefined);
  // WAIVE and PURSUE each have their own branch/call; REOPEN and UNPURSUE
  // share one branch (and one call) per setItemDecision's own comment.
  const callCount = (fn.match(/reconcileSaleReadinessItemDecision\(/g) || []).length;
  assert.equal(callCount, 3, 'WAIVE, PURSUE, and the shared REOPEN/UNPURSUE branch must each call the reconciler');
});

test('incident work reconciliation closes on genuine resolution vs. no-longer-relevant statuses, and is wired into every status-mutation site the module has', () => {
  assert.match(incidentReconciliation, /GENUINE_RESOLUTION_STATUSES = new Set\(\['RESOLVED', 'MITIGATED'\]\)/);
  assert.match(incidentReconciliation, /NO_LONGER_RELEVANT_STATUSES = new Set\(\['SUPPRESSED', 'EXPIRED'\]\)/);
  assert.match(incidentReconciliation, /recordOperationalWorkOutcome\(\{/);

  assert.match(incidentService, /import \{ syncIncidentWorkItem \} from '\.\/incidentWorkReconciliation\.service'/);
  assert.match(incidentService, /await syncIncidentWorkItem\(id, actorUserId\);/);
  assert.match(incidentService, /await syncIncidentWorkItem\(oldIncident\.id/);
  assert.match(incidentService, /await syncIncidentWorkItem\(incidentId, userId\);/);
  assert.match(weatherPreparationService, /await syncIncidentWorkItem\(preparationId\);/);
  assert.match(diyCompletionService, /await syncIncidentWorkItem\(project\.incidentId, project\.userId\);/);
});

test('reopening a work item dispatches a best-effort domain-record reopen that never throws back into the transition itself', () => {
  assert.match(transitionWorkItemUsecase, /import \{ reopenLinkedDomainRecords \} from '\.\.\/infrastructure\/domainReopenDispatch'/);
  assert.match(transitionWorkItemUsecase, /await reopenLinkedDomainRecords\(input\.workItemId\);/);

  // MAINTENANCE_TASK/GUIDANCE/PROJECT get a real reopen; BOOKING/CLAIM
  // intentionally have nothing to call (neither domain has a reopen
  // primitive) -- every OperationalWorkExecutionType must still be listed
  // explicitly (exhaustiveness), not silently ignored via a default case.
  assert.match(domainReopenDispatch, /case 'MAINTENANCE_TASK':/);
  assert.match(domainReopenDispatch, /case 'GUIDANCE':/);
  assert.match(domainReopenDispatch, /case 'PROJECT':/);
  assert.match(domainReopenDispatch, /case 'BOOKING':\s*\n\s*case 'CLAIM':/);
  assert.match(domainReopenDispatch, /data:\s*\{ role: 'SUPPORTING' \}/);
  assert.match(domainReopenDispatch, /recordReconciliationFailure\(\{/);
  assert.match(domainReopenDispatch, /const exhaustiveCheck: never = executionType;/);
  // Bypasses the domain service layer with a direct Prisma write -- no call
  // to updateTaskStatus(...) (only mentioned, in prose, as the thing being
  // avoided).
  assert.doesNotMatch(domainReopenDispatch, /PropertyMaintenanceTaskService\.updateTaskStatus\(/, 'must bypass the domain service layer to avoid a circular Home Operations sync');
  assert.match(domainReopenDispatch, /prisma\.propertyMaintenanceTask\.updateMany\(/);
});

test('booking completion attempts recommendation attribution via the shared decision-family resolver instead of always passing null', () => {
  assert.match(bookingReconciliation, /import \{ resolveWorkItemDecisionFamilyRefs, resolveHomeActionDecisionLineage \} from '\.\/decisionPlatform\/homeActionDecisionLineage'/);
  assert.match(bookingReconciliation, /resolveBookingRecommendationSnapshotId\(tx, workItem\.propertyId, workItem\.id\)/);
  assert.doesNotMatch(bookingReconciliation, /recommendationSnapshotId:\s*null,\s*\n\s*\}, tx\);/);
});

test('recordOperationalWorkOutcome attaches attribution on an idempotent retry instead of returning early with none', () => {
  const fnStart = outcomeService.indexOf('export async function recordOperationalWorkOutcome(');
  const fnEnd = outcomeService.indexOf('\n// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-003/', fnStart);
  const fn = outcomeService.slice(fnStart, fnEnd);
  const existingBlock = fn.slice(fn.indexOf('if (existing) {'), fn.indexOf('const hasCost = input.costCents'));
  assert.match(existingBlock, /attachAttributions\(existing\.id, input\.recommendationSnapshotId/);
});

test('recordHomeEventOutcome is the first HOME_EVENT creation path, wired only into a positive (confirmed) verification', () => {
  const fnStart = outcomeService.indexOf('export async function recordHomeEventOutcome(');
  const fn = outcomeService.slice(fnStart);
  assert.match(fn, /if \(existing\) return existing;/);
  assert.match(fn, /sourceType:\s*'HOME_EVENT'/);

  assert.match(homeEventsService, /import \{ recordHomeEventOutcome \} from '\.\/decisionPlatform\/outcomeObservationService'/);
  const confirmStart = homeEventsService.indexOf('async confirmHomeEvent(');
  const confirmFn = homeEventsService.slice(confirmStart, confirmStart + 2500);
  assert.match(confirmFn, /if \(args\.status === 'HOMEOWNER_CONFIRMED'\) \{\s*\n\s*await recordHomeEventOutcome/);
});

test('completeAcceptedOperationalWorkItem collects the full HI-OUT-003 field set and transitions to FOLLOW_UP_DUE when flagged', () => {
  assert.match(homeActionCompletionService, /completedAt\?:\s*string \| null;/);
  assert.match(homeActionCompletionService, /fulfillmentMode\?:\s*'DIY' \| 'PROVIDER' \| null;/);
  assert.match(homeActionCompletionService, /providerName\?:\s*string \| null;/);
  assert.match(homeActionCompletionService, /notes\?:\s*string \| null;/);
  assert.match(homeActionCompletionService, /followUpNeeded\?:\s*boolean;/);
  assert.match(homeActionCompletionService, /photoDocumentIds\?:\s*string\[\];/);
  assert.match(homeActionCompletionService, /to:\s*'FOLLOW_UP_DUE'/);
  assert.match(homeActionCompletionService, /prisma\.document\.findMany/);
  assert.match(homeActionCompletionService, /recommendationSnapshotId:\s*input\.recommendationSnapshotId/);
});
