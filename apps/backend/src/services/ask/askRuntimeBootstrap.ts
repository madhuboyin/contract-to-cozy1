/**
 * Ask runtime bootstrap (Findings Implementation Plan, Phase 2).
 *
 * Capability and confirm handlers register themselves when their module is first loaded. That used to happen only as a side effect of
 * importing askOrchestrator.service.ts, so a caller that reached capabilityInvoke() without loading the facade found an empty handler map and
 * failed on a homeowner invocation. This module is the one explicit contract: ASK_HANDLER_MANIFEST lists every module that registers a
 * handler, loadAskHandlerManifest() loads them, and initializeAskRuntime() loads them and runs the two handler-registry validators once.
 *
 * Supported callers: the API server calls initializeAskRuntime() before it accepts traffic (index.ts); the orchestrator facade calls
 * loadAskHandlerManifest() so every existing importer keeps working; direct scripts call one of the two. The workers process does not invoke Ask
 * capabilities (tests/ask/askRuntimeBootstrap.test.js asserts that), so it does not bootstrap.
 *
 * Layering: handlers, lifecycle and support modules must NOT import this file (askImportGraphGuardrails.test.js enforces it). Loading is
 * lazy per entry and registers no connection: importing this module opens no database or Redis connection of its own.
 *
 * The manifest is a plain list on purpose: it is not a second descriptor registry. A parity test compares it with the registration-bearing
 * files on disk, so a new handler that is not listed fails a test instead of failing a homeowner request.
 */
import { validateCapabilityHandlerRegistry } from './capabilityHandlerRegistry';
import { validateConfirmCapabilityHandlerRegistry } from './confirmCapabilityHandlerRegistry';

export interface AskHandlerManifestEntry {
  /** The module path under services/ask, without extension. Must equal the literal in `load`. */
  id: string;
  load: () => unknown;
}

export const ASK_HANDLER_MANIFEST: readonly AskHandlerManifestEntry[] = [
  { id: 'handlers/statusBoard.handler', load: () => require('./handlers/statusBoard.handler') },
  { id: 'handlers/miscHandlers.handler', load: () => require('./handlers/miscHandlers.handler') },
  { id: 'handlers/captureConfirm.handler', load: () => require('./handlers/captureConfirm.handler') },
  { id: 'handlers/workflowConfirm.handler', load: () => require('./handlers/workflowConfirm.handler') },
  { id: 'handlers/recordConfirm.handler', load: () => require('./handlers/recordConfirm.handler') },
  { id: 'handlers/hvacConfirm.handler', load: () => require('./handlers/hvacConfirm.handler') },
  { id: 'handlers/buyerConfirm.handler', load: () => require('./handlers/buyerConfirm.handler') },
  { id: 'handlers/maintenanceConfirm.handler', load: () => require('./handlers/maintenanceConfirm.handler') },
  { id: 'handlers/radarConfirm.handler', load: () => require('./handlers/radarConfirm.handler') },
  { id: 'handlers/homeActions.handler', load: () => require('./handlers/homeActions.handler') },
  { id: 'handlers/propertySummary.handler', load: () => require('./handlers/propertySummary.handler') },
  { id: 'handlers/capitalPlanning.handler', load: () => require('./handlers/capitalPlanning.handler') },
  { id: 'handlers/capitalItemFunding.handler', load: () => require('./handlers/capitalItemFunding.handler') },
  { id: 'handlers/itemReplacementCost.handler', load: () => require('./handlers/itemReplacementCost.handler') },
  { id: 'handlers/inspection.handler', load: () => require('./handlers/inspection.handler') },
  { id: 'handlers/recallReview.handler', load: () => require('./handlers/recallReview.handler') },
  { id: 'handlers/documents.handler', load: () => require('./handlers/documents.handler') },
  { id: 'handlers/quotes.handler', load: () => require('./handlers/quotes.handler') },
  { id: 'handlers/refinance.handler', load: () => require('./handlers/refinance.handler') },
  { id: 'handlers/refinanceCommands.handler', load: () => require('./handlers/refinanceCommands.handler') },
  { id: 'handlers/homeRecordWrites.handler', load: () => require('./handlers/homeRecordWrites.handler') },
  { id: 'handlers/homeSettingsWrites.handler', load: () => require('./handlers/homeSettingsWrites.handler') },
  { id: 'handlers/maintenanceTemplates.handler', load: () => require('./handlers/maintenanceTemplates.handler') },
  { id: 'handlers/homeRecordAdds.handler', load: () => require('./handlers/homeRecordAdds.handler') },
  { id: 'handlers/homeToolRuns.handler', load: () => require('./handlers/homeToolRuns.handler') },
  { id: 'handlers/sellHoldRent.handler', load: () => require('./handlers/sellHoldRent.handler') },
  { id: 'handlers/inventory.handler', load: () => require('./handlers/inventory.handler') },
  { id: 'handlers/savingsOwnership.handler', load: () => require('./handlers/savingsOwnership.handler') },
  { id: 'handlers/coverage.handler', load: () => require('./handlers/coverage.handler') },
  { id: 'handlers/claims.handler', load: () => require('./handlers/claims.handler') },
  { id: 'handlers/homeEventRadar.handler', load: () => require('./handlers/homeEventRadar.handler') },
  { id: 'handlers/hvacDecision.handler', load: () => require('./handlers/hvacDecision.handler') },
  { id: 'handlers/buyerPlan.handler', load: () => require('./handlers/buyerPlan.handler') },
  { id: 'handlers/maintenance.handler', load: () => require('./handlers/maintenance.handler') },
  { id: 'handlers/hoaCompliance.handler', load: () => require('./handlers/hoaCompliance.handler') },
  { id: 'handlers/guidanceOverview.handler', load: () => require('./handlers/guidanceOverview.handler') },
  { id: 'handlers/guidanceStepAcknowledge.handler', load: () => require('./handlers/guidanceStepAcknowledge.handler') },
  { id: 'handlers/coverageAnalysisRun.handler', load: () => require('./handlers/coverageAnalysisRun.handler') },
  { id: 'handlers/inspectionReportReview.handler', load: () => require('./handlers/inspectionReportReview.handler') },
  { id: 'handlers/guidanceStepDeclare.handler', load: () => require('./handlers/guidanceStepDeclare.handler') },
  { id: 'handlers/inspectionFindingsCheck.handler', load: () => require('./handlers/inspectionFindingsCheck.handler') },
  { id: 'handlers/coverageRecordCheck.handler', load: () => require('./handlers/coverageRecordCheck.handler') },
  { id: 'handlers/coverageTermReview.handler', load: () => require('./handlers/coverageTermReview.handler') },
  { id: 'handlers/maintenanceEvidenceAttach.handler', load: () => require('./handlers/maintenanceEvidenceAttach.handler') },
  { id: 'handlers/propertyBrief.handler', load: () => require('./handlers/propertyBrief.handler') },
  { id: 'handlers/propertyBriefCommands.handler', load: () => require('./handlers/propertyBriefCommands.handler') },
  { id: 'handlers/homeTimeline.handler', load: () => require('./handlers/homeTimeline.handler') },
  { id: 'handlers/materialSpecs.handler', load: () => require('./handlers/materialSpecs.handler') },
  { id: 'handlers/seasonalHomeCare.handler', load: () => require('./handlers/seasonalHomeCare.handler') },
  { id: 'handlers/seasonalChecklistSetup.handler', load: () => require('./handlers/seasonalChecklistSetup.handler') },
  { id: 'handlers/homeBasics.handler', load: () => require('./handlers/homeBasics.handler') },
  { id: 'handlers/hiringGuide.handler', load: () => require('./handlers/hiringGuide.handler') },
  { id: 'handlers/applianceOracleBudget.handler', load: () => require('./handlers/applianceOracleBudget.handler') },
  { id: 'handlers/doNothingSimulator.handler', load: () => require('./handlers/doNothingSimulator.handler') },
  { id: 'handlers/warranties.handler', load: () => require('./handlers/warranties.handler') },
  { id: 'handlers/priceFinalization.handler', load: () => require('./handlers/priceFinalization.handler') },
  { id: 'handlers/negotiationShield.handler', load: () => require('./handlers/negotiationShield.handler') },
  { id: 'handlers/homeUpgradePlanner.handler', load: () => require('./handlers/homeUpgradePlanner.handler') },
  { id: 'handlers/diyProjectCenter.handler', load: () => require('./handlers/diyProjectCenter.handler') },
  { id: 'handlers/diyProjectGuide.handler', load: () => require('./handlers/diyProjectGuide.handler') },
  { id: 'handlers/diyStepUpdate.handler', load: () => require('./handlers/diyStepUpdate.handler') },
  { id: 'handlers/diyProjectCommands.handler', load: () => require('./handlers/diyProjectCommands.handler') },
  { id: 'handlers/diyCompletionRecover.handler', load: () => require('./handlers/diyCompletionRecover.handler') },
  { id: 'handlers/diyProjectStart.handler', load: () => require('./handlers/diyProjectStart.handler') },
  { id: 'handlers/projectTracker.handler', load: () => require('./handlers/projectTracker.handler') },
  { id: 'handlers/servicePriceRadar.handler', load: () => require('./handlers/servicePriceRadar.handler') },
  { id: 'handlers/aroundYourHome.handler', load: () => require('./handlers/aroundYourHome.handler') },
  { id: 'handlers/homeRiskReplay.handler', load: () => require('./handlers/homeRiskReplay.handler') },
  { id: 'handlers/homeHabitCoach.handler', load: () => require('./handlers/homeHabitCoach.handler') },
  { id: 'handlers/homeDigitalWill.handler', load: () => require('./handlers/homeDigitalWill.handler') },
  { id: 'handlers/homeDigitalWillCreate.handler', load: () => require('./handlers/homeDigitalWillCreate.handler') },
  { id: 'handlers/plantAdvisor.handler', load: () => require('./handlers/plantAdvisor.handler') },
  { id: 'handlers/plantRecommendations.handler', load: () => require('./handlers/plantRecommendations.handler') },
  { id: 'handlers/ownershipCostCommands.handler', load: () => require('./handlers/ownershipCostCommands.handler') },
  { id: 'handlers/reserveFundCommands.handler', load: () => require('./handlers/reserveFundCommands.handler') },
  { id: 'handlers/negotiationShieldStart.handler', load: () => require('./handlers/negotiationShieldStart.handler') },
  { id: 'handlers/negotiationShieldAnalyze.handler', load: () => require('./handlers/negotiationShieldAnalyze.handler') },
  { id: 'handlers/negotiationShieldEdit.handler', load: () => require('./handlers/negotiationShieldEdit.handler') },
  { id: 'handlers/negotiationShieldAttach.handler', load: () => require('./handlers/negotiationShieldAttach.handler') },
  { id: 'handlers/renovationCaseStart.handler', load: () => require('./handlers/renovationCaseStart.handler') },
  { id: 'handlers/homeRecordStateCommands.handler', load: () => require('./handlers/homeRecordStateCommands.handler') },
  { id: 'handlers/buyerContractCommands.handler', load: () => require('./handlers/buyerContractCommands.handler') },
  { id: 'handlers/buyerClosingDisclosureCommands.handler', load: () => require('./handlers/buyerClosingDisclosureCommands.handler') },
  { id: 'handlers/buyerLoanEstimateCommands.handler', load: () => require('./handlers/buyerLoanEstimateCommands.handler') },
  { id: 'handlers/buyerPlanSetupCommands.handler', load: () => require('./handlers/buyerPlanSetupCommands.handler') },
  { id: 'handlers/buyerLoanEstimates.handler', load: () => require('./handlers/buyerLoanEstimates.handler') },
  { id: 'handlers/buyerInsuranceCommands.handler', load: () => require('./handlers/buyerInsuranceCommands.handler') },
  { id: 'handlers/buyerInsurance.handler', load: () => require('./handlers/buyerInsurance.handler') },
  { id: 'handlers/buyerClosingItemCommands.handler', load: () => require('./handlers/buyerClosingItemCommands.handler') },
  { id: 'handlers/buyerWalkthroughCommands.handler', load: () => require('./handlers/buyerWalkthroughCommands.handler') },
  { id: 'handlers/diyCommands.handler', load: () => require('./handlers/diyCommands.handler') },
  { id: 'handlers/seasonalItemCommands.handler', load: () => require('./handlers/seasonalItemCommands.handler') },
  { id: 'handlers/homeWorkItemCommands.handler', load: () => require('./handlers/homeWorkItemCommands.handler') },
  { id: 'handlers/homeWorkItems.handler', load: () => require('./handlers/homeWorkItems.handler') },
  { id: 'handlers/workOverview.handler', load: () => require('./handlers/workOverview.handler') },
  { id: 'handlers/homeRecordExport.handler', load: () => require('./handlers/homeRecordExport.handler') },
  { id: 'handlers/homeRecordExportShare.handler', load: () => require('./handlers/homeRecordExportShare.handler') },
  { id: 'handlers/workRequestCommand.handler', load: () => require('./handlers/workRequestCommand.handler') },
  { id: 'handlers/savedArchiveCommand.handler', load: () => require('./handlers/savedArchiveCommand.handler') },
  { id: 'handlers/savedResults.handler', load: () => require('./handlers/savedResults.handler') },
  { id: 'handlers/notificationsOverview.handler', load: () => require('./handlers/notificationsOverview.handler') },
  { id: 'handlers/notificationCommand.handler', load: () => require('./handlers/notificationCommand.handler') },
  { id: 'handlers/notificationSettings.handler', load: () => require('./handlers/notificationSettings.handler') },
  { id: 'handlers/inspectionNegotiationPackage.handler', load: () => require('./handlers/inspectionNegotiationPackage.handler') },
  { id: 'handlers/inspectionFindingDecisionCommands.handler', load: () => require('./handlers/inspectionFindingDecisionCommands.handler') },
  { id: 'handlers/inspectionFindingDecisions.handler', load: () => require('./handlers/inspectionFindingDecisions.handler') },
  { id: 'handlers/inspectionReportCommands.handler', load: () => require('./handlers/inspectionReportCommands.handler') },
  { id: 'handlers/inspectionReports.handler', load: () => require('./handlers/inspectionReports.handler') },
  { id: 'handlers/sellerPrepCaseCommands.handler', load: () => require('./handlers/sellerPrepCaseCommands.handler') },
  { id: 'handlers/claimActivity.handler', load: () => require('./handlers/claimActivity.handler') },
  { id: 'handlers/doNothingScenarioCommands.handler', load: () => require('./handlers/doNothingScenarioCommands.handler') },
  { id: 'handlers/habitCoachPreferencesCommands.handler', load: () => require('./handlers/habitCoachPreferencesCommands.handler') },
  { id: 'handlers/financingProfileCommands.handler', load: () => require('./handlers/financingProfileCommands.handler') },
  { id: 'handlers/sellHoldRentCommands.handler', load: () => require('./handlers/sellHoldRentCommands.handler') },
  { id: 'handlers/homeBriefingShareCommands.handler', load: () => require('./handlers/homeBriefingShareCommands.handler') },
  { id: 'handlers/hoaComplianceCommands.handler', load: () => require('./handlers/hoaComplianceCommands.handler') },
  { id: 'handlers/homeBriefingCommands.handler', load: () => require('./handlers/homeBriefingCommands.handler') },
  { id: 'handlers/homeBriefing.handler', load: () => require('./handlers/homeBriefing.handler') },
  { id: 'handlers/neighborhoodInteractionCommands.handler', load: () => require('./handlers/neighborhoodInteractionCommands.handler') },
  { id: 'handlers/pastHazardOutcomeCommands.handler', load: () => require('./handlers/pastHazardOutcomeCommands.handler') },
  { id: 'handlers/renovationReadinessCommands.handler', load: () => require('./handlers/renovationReadinessCommands.handler') },
  { id: 'handlers/savingsBenefitCommands.handler', load: () => require('./handlers/savingsBenefitCommands.handler') },
  { id: 'handlers/propertyTaxAppealCommands.handler', load: () => require('./handlers/propertyTaxAppealCommands.handler') },
  { id: 'handlers/propertyTaxComparableCommands.handler', load: () => require('./handlers/propertyTaxComparableCommands.handler') },
  { id: 'handlers/statusBoardCommands.handler', load: () => require('./handlers/statusBoardCommands.handler') },
  { id: 'handlers/capitalTimelineCommands.handler', load: () => require('./handlers/capitalTimelineCommands.handler') },
  { id: 'handlers/coverageCommands.handler', load: () => require('./handlers/coverageCommands.handler') },
  { id: 'handlers/coverageReview.handler', load: () => require('./handlers/coverageReview.handler') },
  { id: 'handlers/riskMitigationPlan.handler', load: () => require('./handlers/riskMitigationPlan.handler') },
  { id: 'handlers/homeUpgradeCommands.handler', load: () => require('./handlers/homeUpgradeCommands.handler') },
  { id: 'handlers/permitTrackerCommands.handler', load: () => require('./handlers/permitTrackerCommands.handler') },
  { id: 'handlers/financing.handler', load: () => require('./handlers/financing.handler') },
  { id: 'handlers/permitTracker.handler', load: () => require('./handlers/permitTracker.handler') },
  { id: 'handlers/negotiationShieldBuyerCommands.handler', load: () => require('./handlers/negotiationShieldBuyerCommands.handler') },
  { id: 'handlers/priceFinalizationCommands.handler', load: () => require('./handlers/priceFinalizationCommands.handler') },
  { id: 'handlers/quoteComparisonCommands.handler', load: () => require('./handlers/quoteComparisonCommands.handler') },
  { id: 'handlers/environmentReport.handler', load: () => require('./handlers/environmentReport.handler') },
  { id: 'handlers/communityUpdates.handler', load: () => require('./handlers/communityUpdates.handler') },
  { id: 'handlers/householdAccess.handler', load: () => require('./handlers/householdAccess.handler') },
  { id: 'handlers/environmentReportCommands.handler', load: () => require('./handlers/environmentReportCommands.handler') },
  { id: 'execution/askCapture', load: () => require('./execution/askCapture') },
];

export class AskRuntimeBootstrapError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Ask runtime bootstrap failed: ${issues.join('; ')}`);
    this.name = 'AskRuntimeBootstrapError';
    this.issues = issues;
  }
}

const loadedManifests = new WeakSet<readonly AskHandlerManifestEntry[]>();

/** Loads every module in the manifest. Idempotent: modules are cached, and a manifest already loaded is not walked again. */
export function loadAskHandlerManifest(manifest: readonly AskHandlerManifestEntry[] = ASK_HANDLER_MANIFEST): void {
  if (loadedManifests.has(manifest)) return;
  for (const entry of manifest) entry.load();
  loadedManifests.add(manifest);
}

/** Pure check over the current registries: every operation adapter and every domain command's confirm adapter resolves, with no duplicate. */
export function validateAskRuntimeRegistration(): string[] {
  return [...validateCapabilityHandlerRegistry(), ...validateConfirmCapabilityHandlerRegistry()];
}

let initialized: { issues: readonly string[] } | null = null;

/**
 * Loads the handler manifest and validates the registries once. Throws AskRuntimeBootstrapError when anything is missing or duplicated, so a
 * gap fails during startup rather than on a homeowner invocation. Calling it again returns the first result without repeating the work.
 */
export function initializeAskRuntime(): { issues: readonly string[] } {
  if (initialized) return initialized;
  loadAskHandlerManifest();
  const issues = validateAskRuntimeRegistration();
  if (issues.length > 0) throw new AskRuntimeBootstrapError(issues);
  initialized = { issues };
  return initialized;
}
