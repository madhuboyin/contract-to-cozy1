/**
 * Phase 0 Bullet 3 (FR-ONT-8, §6.2, §17.1, §18 Phase 0, §19 Artifact #3):
 * Recognizer & Vocabulary Retirement Manifest.
 *
 * Inventories every existing recognizer, keyword table, synonym list, alias map,
 * and regex matcher in `src/services/ask` and records its canonical replacement
 * target and retirement phase:
 *   - RETIRE_PHASE_2A: Read-path fast-path / data-point / semantic-router /
 *     handler-local regexes and synonym tables retired when Phase 2A structured
 *     read understanding & query planner become authoritative.
 *   - RETIRE_PHASE_2B: Follow-up / composition / conversational capture /
 *     command extraction regexes retired when Phase 2B multi-step composition &
 *     stateful turn-continuity graph become authoritative.
 *   - RETAIN_BOUNDARY_GUARDRAIL: Safety, privacy, trust, and out-of-scope
 *     boundary pre-filters retained permanently as deterministic guardrails
 *     under §6.2 ("What remains deterministic").
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { FAST_PATH_RULE_MANIFEST } from '../../fastPath/ruleManifest.generated';
import type { SemanticDomainId } from './semanticOntologyBaseline';

export const ASK_RECOGNIZER_RETIREMENT_MANIFEST_VERSION = 'phase0-recognizer-retirement-1.1.0' as const;

export type RecognizerRetirementDisposition =
  | 'RETIRE_PHASE_2A'
  | 'RETIRE_PHASE_2B'
  | 'RETAIN_BOUNDARY_GUARDRAIL';

export type RecognizerCategory =
  | 'FAST_PATH_REGEX_RULE_BANK'
  | 'ROUTING_CASCADE_GUARDS'
  | 'SEMANTIC_ROUTER_VOCABULARY'
  | 'PROMPT_MINIMIZER_EQUIVALENTS'
  | 'ENTITY_ALIAS_MAP'
  | 'DATA_POINT_LEXICAL_CUES'
  | 'FOLLOW_UP_CONTEXT_PATTERNS'
  | 'COMPOSITION_AND_ALSO_ANSWER'
  | 'PROVISIONAL_READ_REGEXES'
  | 'CAPTURE_PREFILTER_REGEXES'
  | 'HANDLER_LOCAL_INTENT_REGEXES'
  | 'SUPPORT_COMMAND_AND_NORMALIZATION_REGEXES'
  | 'OPERATION_REGISTRY_EXAMPLE_PATTERNS'
  | 'BOUNDARY_AND_TRUST_GUARDRAILS';

export interface RecognizerInventoryEntry {
  readonly recognizerId: string;
  readonly category: RecognizerCategory;
  readonly sourceFile: string;
  readonly coveredSourceFiles: readonly string[];
  readonly exportedSymbols: readonly string[];
  readonly liveItemCount: number;
  readonly affectedDomains: readonly SemanticDomainId[];
  readonly disposition: RecognizerRetirementDisposition;
  readonly canonicalReplacementTarget: string;
  readonly knownFailureModes: readonly string[];
}

export interface DiscoveredAskRecognizerSource {
  readonly relativeFilePath: string;
  readonly regexCount: number;
  readonly vocabularyDeclarationCount: number;
  readonly totalSignals: number;
}

const HANDLER_RECOGNIZER_SOURCE_FILES: readonly string[] = Object.freeze([
  'src/services/ask/askInventoryIntent.ts',
  'src/services/ask/handlers/applianceOracleBudget.handler.ts',
  'src/services/ask/handlers/aroundYourHome.handler.ts',
  'src/services/ask/handlers/buyerClosingDisclosureCommands.handler.ts',
  'src/services/ask/handlers/buyerClosingItemCommands.handler.ts',
  'src/services/ask/handlers/buyerContractCommands.handler.ts',
  'src/services/ask/handlers/buyerInsuranceCommands.handler.ts',
  'src/services/ask/handlers/buyerLoanEstimateCommands.handler.ts',
  'src/services/ask/handlers/buyerPlan.handler.ts',
  'src/services/ask/handlers/buyerPlanSetupCommands.handler.ts',
  'src/services/ask/handlers/buyerWalkthroughCommands.handler.ts',
  'src/services/ask/handlers/capitalItemFunding.handler.ts',
  'src/services/ask/handlers/capitalPlanning.handler.ts',
  'src/services/ask/handlers/capitalTimelineCommands.handler.ts',
  'src/services/ask/handlers/claimActivity.handler.ts',
  'src/services/ask/handlers/claims.handler.ts',
  'src/services/ask/handlers/communityUpdates.handler.ts',
  'src/services/ask/handlers/coverage.handler.ts',
  'src/services/ask/handlers/coverageAnalysisRun.handler.ts',
  'src/services/ask/handlers/coverageReview.handler.ts',
  'src/services/ask/handlers/coverageTermReview.handler.ts',
  'src/services/ask/handlers/dataPointRead.handler.ts',
  'src/services/ask/handlers/diyCompletionRecover.handler.ts',
  'src/services/ask/handlers/diyProjectCenter.handler.ts',
  'src/services/ask/handlers/diyProjectCommands.handler.ts',
  'src/services/ask/handlers/diyProjectStart.handler.ts',
  'src/services/ask/handlers/doNothingSimulator.handler.ts',
  'src/services/ask/handlers/documents.handler.ts',
  'src/services/ask/handlers/environmentReport.handler.ts',
  'src/services/ask/handlers/environmentReportCommands.handler.ts',
  'src/services/ask/handlers/financing.handler.ts',
  'src/services/ask/handlers/financingProfileCommands.handler.ts',
  'src/services/ask/handlers/guidanceOverview.handler.ts',
  'src/services/ask/handlers/guidanceStepDeclare.handler.ts',
  'src/services/ask/handlers/hoaCompliance.handler.ts',
  'src/services/ask/handlers/hoaComplianceCommands.handler.ts',
  'src/services/ask/handlers/homeActions.handler.ts',
  'src/services/ask/handlers/homeBriefing.handler.ts',
  'src/services/ask/handlers/homeDigitalWill.handler.ts',
  'src/services/ask/handlers/homeDigitalWillCreate.handler.ts',
  'src/services/ask/handlers/homeEventRadar.handler.ts',
  'src/services/ask/handlers/homeHabitCoach.handler.ts',
  'src/services/ask/handlers/homeRecordAdds.handler.ts',
  'src/services/ask/handlers/homeRecordExport.handler.ts',
  'src/services/ask/handlers/homeRecordExportShare.handler.ts',
  'src/services/ask/handlers/homeRecordStateCommands.handler.ts',
  'src/services/ask/handlers/homeRecordWrites.handler.ts',
  'src/services/ask/handlers/homeRiskReplay.handler.ts',
  'src/services/ask/handlers/homeTimeline.handler.ts',
  'src/services/ask/handlers/homeToolRuns.handler.ts',
  'src/services/ask/handlers/homeUpgradeCommands.handler.ts',
  'src/services/ask/handlers/homeUpgradePlanner.handler.ts',
  'src/services/ask/handlers/homeWorkItemCommands.handler.ts',
  'src/services/ask/handlers/homeWorkItems.handler.ts',
  'src/services/ask/handlers/hvacConfirm.handler.ts',
  'src/services/ask/handlers/hvacDecision.handler.ts',
  'src/services/ask/handlers/inspection.handler.ts',
  'src/services/ask/handlers/inspectionFindingDecisions.handler.ts',
  'src/services/ask/handlers/inspectionReportReview.handler.ts',
  'src/services/ask/handlers/insurancePolicyCommands.handler.ts',
  'src/services/ask/handlers/inventory.handler.ts',
  'src/services/ask/handlers/itemReplacementCost.handler.ts',
  'src/services/ask/handlers/itemReserveAllocation.handler.ts',
  'src/services/ask/handlers/maintenance.handler.ts',
  'src/services/ask/handlers/maintenanceConfirm.handler.ts',
  'src/services/ask/handlers/maintenanceEvidenceAttach.handler.ts',
  'src/services/ask/handlers/maintenanceTemplates.handler.ts',
  'src/services/ask/handlers/materialSpecs.handler.ts',
  'src/services/ask/handlers/miscHandlers.handler.ts',
  'src/services/ask/handlers/negotiationShield.handler.ts',
  'src/services/ask/handlers/negotiationShieldAnalyze.handler.ts',
  'src/services/ask/handlers/negotiationShieldAttach.handler.ts',
  'src/services/ask/handlers/negotiationShieldBuyerCommands.handler.ts',
  'src/services/ask/handlers/negotiationShieldEdit.handler.ts',
  'src/services/ask/handlers/negotiationShieldStart.handler.ts',
  'src/services/ask/handlers/notificationCommand.handler.ts',
  'src/services/ask/handlers/notificationSettings.handler.ts',
  'src/services/ask/handlers/notificationsOverview.handler.ts',
  'src/services/ask/handlers/ownershipCostCommands.handler.ts',
  'src/services/ask/handlers/permitTracker.handler.ts',
  'src/services/ask/handlers/permitTrackerExtraCommands.handler.ts',
  'src/services/ask/handlers/plantAdvisor.handler.ts',
  'src/services/ask/handlers/plantRecommendations.handler.ts',
  'src/services/ask/handlers/priceFinalization.handler.ts',
  'src/services/ask/handlers/priceFinalizationCommands.handler.ts',
  'src/services/ask/handlers/projectTracker.handler.ts',
  'src/services/ask/handlers/propertyBrief.handler.ts',
  'src/services/ask/handlers/propertyBriefCommands.handler.ts',
  'src/services/ask/handlers/propertySummary.handler.ts',
  'src/services/ask/handlers/propertyTaxEvidenceCommands.handler.ts',
  'src/services/ask/handlers/quoteComparisonCommands.handler.ts',
  'src/services/ask/handlers/quotes.handler.ts',
  'src/services/ask/handlers/radarConfirm.handler.ts',
  'src/services/ask/handlers/recallReview.handler.ts',
  'src/services/ask/handlers/recordConfirm.handler.ts',
  'src/services/ask/handlers/refinance.handler.ts',
  'src/services/ask/handlers/refinanceCommands.handler.ts',
  'src/services/ask/handlers/renovationAuthorityWrites.handler.ts',
  'src/services/ask/handlers/renovationExploreCommands.handler.ts',
  'src/services/ask/handlers/renovationReadinessCommands.handler.ts',
  'src/services/ask/handlers/reserveFundCommands.handler.ts',
  'src/services/ask/handlers/roomDetailCommands.handler.ts',
  'src/services/ask/handlers/savedResults.handler.ts',
  'src/services/ask/handlers/savingsOwnership.handler.ts',
  'src/services/ask/handlers/savingsRecurringSetup.handler.ts',
  'src/services/ask/handlers/seasonalChecklistSetup.handler.ts',
  'src/services/ask/handlers/seasonalHomeCare.handler.ts',
  'src/services/ask/handlers/seasonalItemCommands.handler.ts',
  'src/services/ask/handlers/sellHoldRent.handler.ts',
  'src/services/ask/handlers/sellHoldRentCommands.handler.ts',
  'src/services/ask/handlers/sellerPrepCaseCommands.handler.ts',
  'src/services/ask/handlers/sellerPrepTransition.ts',
  'src/services/ask/handlers/servicePriceRadar.handler.ts',
  'src/services/ask/handlers/statusBoard.handler.ts',
  'src/services/ask/handlers/statusBoardCommands.handler.ts',
  'src/services/ask/handlers/warranties.handler.ts',
  'src/services/ask/handlers/warrantyRemoval.handler.ts',
  'src/services/ask/handlers/workOverview.handler.ts',
  'src/services/ask/handlers/workflowConfirm.handler.ts',
]);

const SUPPORT_COMMAND_RECOGNIZER_SOURCE_FILES: readonly string[] = Object.freeze([
  'src/services/ask/support/activationContextCapture.ts',
  'src/services/ask/support/answerGateBypass.ts',
  'src/services/ask/support/answerGuards.ts',
  'src/services/ask/support/breakEvenWhatIf.ts',
  'src/services/ask/support/buyerClosingDisclosureCommand.ts',
  'src/services/ask/support/buyerClosingItemCommand.ts',
  'src/services/ask/support/buyerContractCommand.ts',
  'src/services/ask/support/buyerInsuranceCommand.ts',
  'src/services/ask/support/buyerLoanEstimateCommand.ts',
  'src/services/ask/support/buyerPlanSetupCommand.ts',
  'src/services/ask/support/buyerProfessionalCloseCommand.ts',
  'src/services/ask/support/buyerWalkthroughCommand.ts',
  'src/services/ask/support/canonicalAnswerBlocks.ts',
  'src/services/ask/support/capabilityDiscovery.ts',
  'src/services/ask/support/capitalBundle.ts',
  'src/services/ask/support/capitalTimelineCommand.ts',
  'src/services/ask/support/capture.ts',
  'src/services/ask/support/claimActivityCommand.ts',
  'src/services/ask/support/clarificationLabels.ts',
  'src/services/ask/support/collectionOrdering.ts',
  'src/services/ask/support/commandInputs.ts',
  'src/services/ask/support/commonMisspellings.ts',
  'src/services/ask/support/communityUpdates.ts',
  'src/services/ask/support/coverageAnalysisRun.ts',
  'src/services/ask/support/coverageCommand.ts',
  'src/services/ask/support/didYouMean.ts',
  'src/services/ask/support/diyTemplateBrowseFilter.ts',
  'src/services/ask/support/doNothingScenarioCommand.ts',
  'src/services/ask/support/domainHelpers.ts',
  'src/services/ask/support/environmentReportCommand.ts',
  'src/services/ask/support/executionState.ts',
  'src/services/ask/support/expenseCommand.ts',
  'src/services/ask/support/financingProfileCommand.ts',
  'src/services/ask/support/financingRead.ts',
  'src/services/ask/support/financingScenarioCommand.ts',
  'src/services/ask/support/generalGuidanceCard.ts',
  'src/services/ask/support/habitCoachPreferencesCommand.ts',
  'src/services/ask/support/hoaAssociationEditor.ts',
  'src/services/ask/support/hoaComplianceCommand.ts',
  'src/services/ask/support/homeBasicsGuide.ts',
  'src/services/ask/support/homeBriefingCommand.ts',
  'src/services/ask/support/homeEventAddEditor.ts',
  'src/services/ask/support/homeEventCorrection.ts',
  'src/services/ask/support/homeRecordExport.ts',
  'src/services/ask/support/homeRecordStateCommand.ts',
  'src/services/ask/support/homeToolRunConstants.ts',
  'src/services/ask/support/homeUpgradeCommand.ts',
  'src/services/ask/support/homeWorkItemCommand.ts',
  'src/services/ask/support/inspectionFindingDecisionCommand.ts',
  'src/services/ask/support/inspectionOwnerOnly.ts',
  'src/services/ask/support/inspectionReportCommand.ts',
  'src/services/ask/support/insurancePolicyCommand.ts',
  'src/services/ask/support/inventoryRoomGrouping.ts',
  'src/services/ask/support/itemFundingWording.ts',
  'src/services/ask/support/maintenanceImportance.ts',
  'src/services/ask/support/maintenanceTemplateConstants.ts',
  'src/services/ask/support/materialSpecEditor.ts',
  'src/services/ask/support/materialSpecSearch.ts',
  'src/services/ask/support/materialSpecStateCommand.ts',
  'src/services/ask/support/moneyAmount.ts',
  'src/services/ask/support/negotiationShieldAttach.ts',
  'src/services/ask/support/negotiationShieldBuyer.ts',
  'src/services/ask/support/negotiationShieldStart.ts',
  'src/services/ask/support/neighborhoodInteractionCommand.ts',
  'src/services/ask/support/notificationConversation.ts',
  'src/services/ask/support/ownershipCostConstants.ts',
  'src/services/ask/support/pastHazardOutcomeCommand.ts',
  'src/services/ask/support/permitTrackerCommand.ts',
  'src/services/ask/support/permitTrackerExtra.ts',
  'src/services/ask/support/permitTrackerRead.ts',
  'src/services/ask/support/priceFinalizationCommand.ts',
  'src/services/ask/support/profileRoof.ts',
  'src/services/ask/support/projectTrackerConstants.ts',
  'src/services/ask/support/projectTrackerInputs.ts',
  'src/services/ask/support/propertyBriefConstants.ts',
  'src/services/ask/support/propertyTaxActionCommand.ts',
  'src/services/ask/support/propertyTaxAppealCommand.ts',
  'src/services/ask/support/propertyTaxComparableCommand.ts',
  'src/services/ask/support/propertyTaxDocumentFactsCommand.ts',
  'src/services/ask/support/propertyTaxEvidenceCommand.ts',
  'src/services/ask/support/quoteComparisonCommand.ts',
  'src/services/ask/support/receiptFollowUps.ts',
  'src/services/ask/support/refinanceCommand.ts',
  'src/services/ask/support/renovationAuthorityWrites.ts',
  'src/services/ask/support/renovationCaseOverview.ts',
  'src/services/ask/support/renovationCaseStart.ts',
  'src/services/ask/support/renovationExploreCommand.ts',
  'src/services/ask/support/renovationReadinessCommand.ts',
  'src/services/ask/support/reserveFundConstants.ts',
  'src/services/ask/support/reserveFundMessage.ts',
  'src/services/ask/support/riskMitigationPlan.ts',
  'src/services/ask/support/roomDetailCommand.ts',
  'src/services/ask/support/routingNormalization.ts',
  'src/services/ask/support/routingVocabulary.generated.ts',
  'src/services/ask/support/savingsBenefitCommand.ts',
  'src/services/ask/support/savingsRecurringSetup.ts',
  'src/services/ask/support/seasonalHomeCare.ts',
  'src/services/ask/support/seasonalItemCommand.ts',
  'src/services/ask/support/sellHoldRentCommand.ts',
  'src/services/ask/support/sellHoldRentWhatIf.ts',
  'src/services/ask/support/sellerPrepCaseCommand.ts',
  'src/services/ask/support/servicePriceLinkOptions.ts',
  'src/services/ask/support/statusBoardCommand.ts',
  'src/services/ask/support/targetDate.ts',
  'src/services/ask/support/warrantyEditor.ts',
  'src/services/ask/support/wholeWord.ts',
  'src/services/ask/support/workSavedCommands.ts',
]);

const CORE_RUNTIME_AND_BOUNDARY_RECOGNIZER_FILES: readonly string[] = Object.freeze([
  'src/controllers/ask.controller.ts',
  'src/productFramework/ask/ask.contract.ts',
  'src/productFramework/ask/askTargetSelection.contract.ts',
  'src/services/ask/answerContract/operationAnswerContract.ts',
  'src/services/ask/askAnswerTrustPolicy.ts',
  'src/services/ask/askAnswerTrustValidator.ts',
  'src/services/ask/askAudiencePolicy.ts',
  'src/services/ask/askAudiencePresentation.ts',
  'src/services/ask/askBuyerPlanPresentation.ts',
  'src/services/ask/askCapabilityBindings.ts',
  'src/services/ask/askCapabilityCardLaunch.ts',
  'src/services/ask/askCapabilityLifecycle.ts',
  'src/services/ask/askConciergePromptPolicy.ts',
  'src/services/ask/askCorrectionFields.ts',
  'src/services/ask/askDiscoveryTopics.ts',
  'src/services/ask/askDomainCommandRegistry.ts',
  'src/services/ask/askEnvelopeQueryScope.ts',
  'src/services/ask/askExplorerRegistry.ts',
  'src/services/ask/askFocusedGuidance.ts',
  'src/services/ask/askFormatting.ts',
  'src/services/ask/askGeneralGuidanceCatalog.ts',
  'src/services/ask/askIntake.contract.ts',
  'src/services/ask/askIntake.service.ts',
  'src/services/ask/askInteractionCoverageMatrix.ts',
  'src/services/ask/askMaintenancePresentation.ts',
  'src/services/ask/askMaintenanceTaskInput.ts',
  'src/services/ask/askNextActions.ts',
  'src/services/ask/askNotification.contract.ts',
  'src/services/ask/askNotificationSettings.service.ts',
  'src/services/ask/askOperationRegistry.ts',
  'src/services/ask/askOutcomeReport.ts',
  'src/services/ask/askPendingExpiryReconciliation.ts',
  'src/services/ask/askRecordCollections.service.ts',
  'src/services/ask/askRecordDetail.service.ts',
  'src/services/ask/askRecordDetailSections.ts',
  'src/services/ask/askRecordDetailSupport.ts',
  'src/services/ask/askRecordExportReview.service.ts',
  'src/services/ask/askRecordExportSelection.ts',
  'src/services/ask/askRecordIndex.service.ts',
  'src/services/ask/askRemoteFallbackTypedClaims.ts',
  'src/services/ask/askResultSynthesis.service.ts',
  'src/services/ask/askRoutingCalibrationEvidence.ts',
  'src/services/ask/askSaved.service.ts',
  'src/services/ask/askSearch.contract.ts',
  'src/services/ask/askSearch.service.ts',
  'src/services/ask/askSeasonalMaintenance.ts',
  'src/services/ask/askSemanticAnswerValidator.ts',
  'src/services/ask/askSessionHistoryPagination.ts',
  'src/services/ask/askSuggestionPolicy.ts',
  'src/services/ask/askTrust.contract.ts',
  'src/services/ask/askTrustCertificationCorpus.ts',
  'src/services/ask/askTurnStageContract.ts',
  'src/services/ask/askWork.service.ts',
  'src/services/ask/capabilityHandlerRegistry.ts',
  'src/services/ask/decisionThreadPresentationBlocks.ts',
  'src/services/ask/execution/askCapture.ts',
  'src/services/ask/execution/askClarification.ts',
  'src/services/ask/execution/askConcierge.ts',
  'src/services/ask/execution/askConfirm.ts',
  'src/services/ask/execution/askFeedback.ts',
  'src/services/ask/execution/askHandoffTelemetry.ts',
  'src/services/ask/execution/askSessions.ts',
  'src/services/ask/execution/createAskExecution.ts',
  'src/services/ask/execution/executeOperation.ts',
  'src/services/ask/governance/askArtifactTypeRegistry.ts',
  'src/services/ask/governance/askNotificationContinuationRegistry.ts',
  'src/services/ask/governance/askPerformanceBudgets.ts',
  'src/services/ask/governance/askRecordSectionRegistry.ts',
  'src/services/ask/governance/askRouteRetirementRegistry.ts',
  'src/services/ask/governance/askWorkProviderRegistry.ts',
  'src/services/ask/healthFactorChecklist.ts',
  'src/services/ask/healthGapCapture.ts',
  'src/services/ask/modelRouting/requestPlan.ts',
  'src/services/ask/modelRouting/understandingProvider.ts',
  'src/services/ask/operationalWorkSnooze.ts',
  'src/services/ask/presentation/adoptionLedger.ts',
  'src/services/ask/presentation/evaluatePresentationQuality.ts',
  'src/services/ask/presentation/presentationQuality.contract.ts',
  'src/services/ask/recordEditor/recordEditor.contract.ts',
  'src/services/ask/recovery/recoveryOutcomes.ts',
  'src/services/ask/saved/savedReaderSupport.ts',
  'src/services/ask/saved/savedTypeReaders.ts',
  'src/services/ask/search/askSearchProviders.ts',
  'src/services/ask/suggestedActions/actionableProfileRegistry.ts',
  'src/services/ask/suggestedActions/capabilityRecommendationCandidates.ts',
  'src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts',
  'src/services/ask/suggestedActions/operationSpecificContinuationCoverage.ts',
  'src/services/ask/suggestedActions/profileAudienceAdapter.ts',
  'src/services/ask/suggestedActions/skillHandoffCandidates.ts',
  'src/services/ask/suggestedActions/suggestedActionDomainAffinity.ts',
  'src/services/ask/suggestedActions/suggestedNextActionCandidate.ts',
  'src/services/ask/suggestedActions/suggestedNextActionEligibility.ts',
  'src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts',
  'src/services/ask/suggestedActions/suggestedNextActionHistory.ts',
  'src/services/ask/suggestedActions/suggestedNextActionRegistry.ts',
  'src/services/ask/work/askWorkResolve.ts',
  'src/services/ask/work/askWorkRowSupport.ts',
  'src/services/ask/work/claims.reader.ts',
  'src/services/ask/work/decisionThreads.reader.ts',
  'src/services/ask/work/diyProjects.reader.ts',
  'src/services/ask/work/guidanceJourneys.reader.ts',
  'src/services/ask/work/incidents.reader.ts',
  'src/services/ask/work/monitors.reader.ts',
  'src/services/ask/work/operationalWorkItems.reader.ts',
  'src/services/ask/work/pendingExecutions.reader.ts',
  'src/services/ask/work/projects.reader.ts',
  'src/services/ask/work/queuedJobs.reader.ts',
  'src/services/ask/work/renovationCases.reader.ts',
  'src/services/ask/work/repairs.reader.ts',
  'src/services/ask/work/scheduledFollowUps.reader.ts',
]);

export const ASK_RECOGNIZER_RETIREMENT_MANIFEST: readonly RecognizerInventoryEntry[] = Object.freeze([
  {
    recognizerId: 'recognizer.fast_path.rule_manifest',
    category: 'FAST_PATH_REGEX_RULE_BANK',
    sourceFile: 'src/services/ask/fastPath/ruleManifest.generated.ts',
    coveredSourceFiles: [
      'src/services/ask/fastPath/ruleManifest.generated.ts',
    ],
    exportedSymbols: ['FAST_PATH_RULE_MANIFEST', 'FastPathRuleEntry'],
    liveItemCount: FAST_PATH_RULE_MANIFEST.length,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.buyer_journey',
      'domain.seller_preparation',
      'domain.account_household_preferences',
      'domain.safety_boundary',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'CanonicalSemanticUnderstander + SemanticQueryPlanner (FR-UND-1, FR-QUERY-1); safety boundary rules move to BoundaryGuardrailFilter (§6.2).',
    knownFailureModes: [
      'Rule ordering and priority shadows cross-domain intents (e.g. warranty vs insurance vs maintenance).',
      '150 compiled regex rules require manual regex edits for each new paraphrase.',
    ],
  },
  {
    recognizerId: 'recognizer.routing_cascade.guards_and_fast_matchers',
    category: 'ROUTING_CASCADE_GUARDS',
    sourceFile: 'src/services/ask/askRoutingCascade.ts',
    coveredSourceFiles: [
      'src/services/ask/askCapitalPlanIntent.ts',
      'src/services/ask/askCoverageIntent.ts',
      'src/services/ask/askHomeActionsIntent.ts',
      'src/services/ask/askHomeChangeIntent.ts',
      'src/services/ask/askHomeUpgradeIntent.ts',
      'src/services/ask/askLanguageRegistry.ts',
      'src/services/ask/askMaintenanceIntent.ts',
      'src/services/ask/askOperationSemanticPackages.ts',
      'src/services/ask/askOwnershipCostsIntent.ts',
      'src/services/ask/askPropertySummaryIntent.ts',
      'src/services/ask/askQuoteReviewIntent.ts',
      'src/services/ask/askRefinanceScenarioIntent.ts',
      'src/services/ask/askRoutingCascade.ts',
      'src/services/ask/askSavingsIntent.ts',
      'src/services/ask/askSellerPrepIntent.ts',
      'src/services/ask/askStatusBoardIntent.ts',
      'src/services/ask/askWorkSavedIntent.ts',
      'src/services/ask/fastPath/fastPathCertificates.ts',
    ],
    exportedSymbols: [
      'resolveFastPathOperation',
      'resolveIntentRecognizerOperation',
      'resolveSemanticOperation',
    ],
    liveItemCount: 66,
    affectedDomains: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.maintenance',
      'domain.documents_records',
      'domain.safety_boundary',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'CanonicalSemanticUnderstander (single semantic understanding pipeline replacing 4-stage cascade).',
    knownFailureModes: [
      'Multi-stage routing cascade (fastPath -> intentRecognizer -> semanticRouter -> LLM fallback) uses incompatible domain vocabularies across stages.',
    ],
  },
  {
    recognizerId: 'recognizer.semantic_router.synonyms_and_signals',
    category: 'SEMANTIC_ROUTER_VOCABULARY',
    sourceFile: 'src/services/ask/askSemanticRouter.ts',
    coveredSourceFiles: [
      'src/services/ask/askSemanticEmbedding.ts',
      'src/services/ask/askSemanticResponseProjection.ts',
      'src/services/ask/askSemanticRouter.ts',
    ],
    exportedSymbols: [
      'SYNONYM_GROUPS',
      'ATTRIBUTE_TOKENS',
      'ITEM_SYNONYMS',
      'CONVERSATIONAL_FILLER',
      'EXPLICIT_OPERATION_SIGNALS',
    ],
    liveItemCount: 29,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'Authoritative Cross-Domain Ontology Registry (FR-ONT-1..4) + CanonicalSemanticUnderstander.',
    knownFailureModes: [
      'Lexical token overlap between WARRANTY_LOOKUP, COVERAGE_GAPS, and INVENTORY_LOOKUP causes domain confusion when paraphrases omit exact cue words.',
    ],
  },
  {
    recognizerId: 'recognizer.prompt_minimization.domain_equivalents',
    category: 'PROMPT_MINIMIZER_EQUIVALENTS',
    sourceFile: 'src/services/ask/askPromptMinimization.ts',
    coveredSourceFiles: [
      'src/services/ask/askPromptMinimization.ts',
      'src/services/ask/privacy/knownNames.ts',
      'src/services/ask/privacy/promptMinimizer.ts',
    ],
    exportedSymbols: ['DOMAIN_EQUIVALENTS', 'minimizeAskPrompt'],
    liveItemCount: 55,
    affectedDomains: [
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.inventory',
      'domain.maintenance',
      'domain.ownership_costs_finance',
      'domain.documents_records',
    ],
    disposition: 'RETAIN_BOUNDARY_GUARDRAIL',
    canonicalReplacementTarget: 'PII/privacy minimization retained as deterministic guardrail (§6.2); DOMAIN_EQUIVALENTS governed by Phase 1 domain separation (FR-ONT-5).',
    knownFailureModes: [
      'Previously collapsed warranty, insurance, policy, coverage, and claim into one equivalence bucket (§17.1 item 1; remediated in Phase 1).',
    ],
  },
  {
    recognizerId: 'recognizer.entity_aliases.inventory_item_aliases',
    category: 'ENTITY_ALIAS_MAP',
    sourceFile: 'src/services/ask/support/inventoryItemAliases.ts',
    coveredSourceFiles: [
      'src/services/ask/askEntityResolution.ts',
      'src/services/ask/support/inventoryItemAliases.ts',
    ],
    exportedSymbols: ['INVENTORY_ITEM_ALIASES', 'expandInventoryItemAliases'],
    liveItemCount: 21,
    affectedDomains: ['domain.inventory', 'domain.warranties_coverage', 'domain.maintenance'],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'Ontology Entity & Field Registry canonical aliases + SemanticEntityResolver.',
    knownFailureModes: [
      'Duplicated across askSemanticRouter ITEM_SYNONYMS, dataPointQueryPlan cues, and inventory.handler local regexes.',
    ],
  },
  {
    recognizerId: 'recognizer.data_point.query_plan_and_shapes',
    category: 'DATA_POINT_LEXICAL_CUES',
    sourceFile: 'src/services/ask/dataPoint/dataPointQueryPlan.ts',
    coveredSourceFiles: [
      'src/services/ask/dataPoint/dataPointCatalogue.ts',
      'src/services/ask/dataPoint/dataPointLaunchHints.ts',
      'src/services/ask/dataPoint/dataPointQueryPlan.ts',
      'src/services/ask/dataPoint/dataPointQueryRunner.ts',
      'src/services/ask/dataPoint/dataPointReader.ts',
      'src/services/ask/dataPoint/dataPointShapes789.ts',
      'src/services/ask/dataPoint/queryShapeRegistries.ts',
    ],
    exportedSymbols: [
      'planDataPointQuery',
      'planShape789Query',
      'DATA_POINT_DEFINITIONS',
      'QUERY_SHAPE_REGISTRIES',
    ],
    liveItemCount: 228,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.buyer_journey',
      'domain.seller_preparation',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'Canonical SemanticQueryPlanner (FR-QUERY-1..8) over the 9 canonical query shapes.',
    knownFailureModes: [
      'Shape 7/8/9 regex matchers require exact surface phrasing ("without a warranty", "missing a serial number") and miss conversational paraphrases.',
      'Field cues in dataPointCatalogue require lexical cue overlap rather than semantic slot binding.',
    ],
  },
  {
    recognizerId: 'recognizer.follow_up.context_patterns',
    category: 'FOLLOW_UP_CONTEXT_PATTERNS',
    sourceFile: 'src/services/ask/askFollowUpContext.ts',
    coveredSourceFiles: [
      'src/services/ask/askFollowUpContext.ts',
    ],
    exportedSymbols: ['resolveAskFollowUpContext', 'FOLLOW_UP_PATTERNS'],
    liveItemCount: 53,
    affectedDomains: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.maintenance',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.buyer_journey',
      'domain.seller_preparation',
    ],
    disposition: 'RETIRE_PHASE_2B',
    canonicalReplacementTarget: 'Stateful Turn-Continuity & Discourse Referent Graph (FR-DISC-1..4, Phase 2B).',
    knownFailureModes: [
      'Pronoun and ellipsis resolution ("what about the other one?", "is it covered?") relies on 35+ brittle surface regexes.',
    ],
  },
  {
    recognizerId: 'recognizer.composition.decompose_and_also_answer',
    category: 'COMPOSITION_AND_ALSO_ANSWER',
    sourceFile: 'src/services/ask/support/alsoAnswer.ts',
    coveredSourceFiles: [
      'src/services/ask/composition/authorizationView.ts',
      'src/services/ask/composition/compositeResult.ts',
      'src/services/ask/composition/decompose.ts',
      'src/services/ask/composition/quantities.ts',
      'src/services/ask/composition/resumeClarification.ts',
      'src/services/ask/composition/runComposedTurn.ts',
      'src/services/ask/composition/slotContext.ts',
      'src/services/ask/composition/slots.ts',
      'src/services/ask/composition/sourceAuthorization.ts',
      'src/services/ask/support/alsoAnswer.ts',
    ],
    exportedSymbols: ['resolveAlsoAnswer', 'decomposeCompositeTurn', 'extractCompositionSlots'],
    liveItemCount: 72,
    affectedDomains: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.maintenance',
      'domain.insurance_policies',
      'domain.claims',
      'domain.ownership_costs_finance',
    ],
    disposition: 'RETIRE_PHASE_2B',
    canonicalReplacementTarget: 'Cross-Domain Multi-Intent & Join Planner (FR-COMP-1..4, Phase 2B).',
    knownFailureModes: [
      'Pairwise conjunction splitters and hardcoded alsoAnswer pairs only cover pre-authored 2-operation combinations.',
    ],
  },
  {
    recognizerId: 'recognizer.provisional_read.fallback_matchers',
    category: 'PROVISIONAL_READ_REGEXES',
    sourceFile: 'src/services/ask/support/provisionalRead.ts',
    coveredSourceFiles: [
      'src/services/ask/support/provisionalRead.ts',
    ],
    exportedSymbols: ['resolveProvisionalRead'],
    liveItemCount: 150,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.maintenance',
      'domain.documents_records',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'CanonicalSemanticUnderstander + SemanticQueryPlanner (Phase 2A).',
    knownFailureModes: [
      '46 fallback regexes duplicate data-point and handler-level recognizers with slightly different negation/filter semantics.',
    ],
  },
  {
    recognizerId: 'recognizer.conversational_capture.extraction_prefilter',
    category: 'CAPTURE_PREFILTER_REGEXES',
    sourceFile: 'src/services/ask/conversationalUnderstanding/extractionPreFilter.ts',
    coveredSourceFiles: [
      'src/services/ask/conversationalUnderstanding/conversationalCapture.ts',
      'src/services/ask/conversationalUnderstanding/extractionPreFilter.ts',
    ],
    exportedSymbols: ['passesExtractionPreFilter', 'extractConversationalCandidates'],
    liveItemCount: 29,
    affectedDomains: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.maintenance',
      'domain.timeline_home_events',
      'domain.property_profile',
    ],
    disposition: 'RETIRE_PHASE_2B',
    canonicalReplacementTarget: 'Unified Turn Understanding + Governed Mutation/Capture Proposal Planner (Phase 2B).',
    knownFailureModes: [
      'Declarative facts embedded inside questions can be dropped or misclassified before semantic understanding.',
    ],
  },
  {
    recognizerId: 'recognizer.handlers.domain_local_intent_matchers',
    category: 'HANDLER_LOCAL_INTENT_REGEXES',
    sourceFile: 'src/services/ask/handlers/warranties.handler.ts',
    coveredSourceFiles: HANDLER_RECOGNIZER_SOURCE_FILES,
    exportedSymbols: [
      'matchesInventoryLookupIntent',
      'warrantiesHandler',
      'inventoryHandler',
      'maintenanceHandler',
      'coverageHandler',
      'claimsHandler',
      'documentsHandler',
      'buyerPlanHandler',
      'sellHoldRentHandler',
      'capitalPlanningHandler',
      'refinanceHandler',
      'savingsOwnershipHandler',
    ],
    liveItemCount: 1368,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.buyer_journey',
      'domain.seller_preparation',
      'domain.account_household_preferences',
    ],
    disposition: 'RETIRE_PHASE_2A',
    canonicalReplacementTarget: 'Structured SemanticQueryPlan + typed operation arguments passed from CanonicalSemanticUnderstander (FR-QUERY-1, Phase 2A).',
    knownFailureModes: [
      'Handlers re-parse raw user message text with local regexes (e.g. /without\\s+warrant/i) that can contradict the router or dataPointQueryPlan.',
    ],
  },
  {
    recognizerId: 'recognizer.support.command_and_routing_normalizers',
    category: 'SUPPORT_COMMAND_AND_NORMALIZATION_REGEXES',
    sourceFile: 'src/services/ask/support/routingNormalization.ts',
    coveredSourceFiles: SUPPORT_COMMAND_RECOGNIZER_SOURCE_FILES,
    exportedSymbols: [
      'normalizeRoutingMessage',
      'ROUTING_VOCABULARY',
      'COMMON_MISSPELLINGS',
      'parseCommandInputs',
    ],
    liveItemCount: 885,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.buyer_journey',
      'domain.seller_preparation',
      'domain.account_household_preferences',
    ],
    disposition: 'RETIRE_PHASE_2B',
    canonicalReplacementTarget: 'CanonicalSemanticUnderstander slot extraction + Ontology vocabulary normalization (Phase 2A/2B).',
    knownFailureModes: [
      '73 support command parsers and routing normalizers maintain independent regex extractors for dates, amounts, rooms, and command flags.',
    ],
  },
  {
    recognizerId: 'recognizer.core_runtime.operation_and_trust_guardrails',
    category: 'BOUNDARY_AND_TRUST_GUARDRAILS',
    sourceFile: 'src/services/ask/askOperationRegistry.ts',
    coveredSourceFiles: CORE_RUNTIME_AND_BOUNDARY_RECOGNIZER_FILES,
    exportedSymbols: [
      'ASK_OPERATION_DEFINITIONS',
      'validateAskAnswerTrust',
      'evaluateAnswerTrustPolicy',
      'ASK_ROUTE_RETIREMENT_REGISTRY',
    ],
    liveItemCount: 1049,
    affectedDomains: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.buyer_journey',
      'domain.seller_preparation',
      'domain.account_household_preferences',
      'domain.safety_boundary',
    ],
    disposition: 'RETAIN_BOUNDARY_GUARDRAIL',
    canonicalReplacementTarget: 'Operation registry metadata & deterministic answer-trust/safety guardrails retained under §6.2; inline routing/formatting regexes migrate to Phase 2A/2B semantic contracts.',
    knownFailureModes: [
      'Operation-registry regex patterns and presentation/trust validators mix boundary enforcement with lexical surface heuristics.',
    ],
  },
  {
    recognizerId: 'recognizer.recovery.in_domain_not_understood_areas',
    category: 'HANDLER_LOCAL_INTENT_REGEXES',
    sourceFile: 'src/services/ask/recovery/inDomainNotUnderstood.ts',
    coveredSourceFiles: ['src/services/ask/recovery/inDomainNotUnderstood.ts'],
    exportedSymbols: ['assessInDomainNotUnderstood', 'inDomainNotUnderstoodResult'],
    liveItemCount: 2,
    affectedDomains: [
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.buyer_journey',
      'domain.seller_preparation',
      'domain.account_household_preferences',
    ],
    disposition: 'RETIRE_PHASE_2B',
    canonicalReplacementTarget: 'Area labels and offered example questions generated from the Capability Registry representative examples (FR-ONT-4); subject evidence already comes from the generated shared lexicon (FR-ONT-6).',
    knownFailureModes: [
      'Candidate example prompts are hand-listed per area; a test proves each still parses to a validated plan, but new capabilities are not offered until added here.',
    ],
  },
] as const);

function isStringLiteralArrayNode(node: ts.Node): boolean {
  if (!ts.isArrayLiteralExpression(node) || node.elements.length < 2) {
    return false;
  }
  return node.elements.every(
    (el) => ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el),
  );
}

function isVocabularyObjectLiteralNode(node: ts.Node): boolean {
  if (!ts.isObjectLiteralExpression(node) || node.properties.length < 2) {
    return false;
  }
  return node.properties.every(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      (isStringLiteralArrayNode(prop.initializer) ||
        ts.isStringLiteral(prop.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(prop.initializer) ||
        ts.isNumericLiteral(prop.initializer)),
  );
}

function unwrapFreezeOrCast(node: ts.Expression): ts.Expression {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'freeze' &&
    node.arguments.length === 1
  ) {
    return unwrapFreezeOrCast(node.arguments[0]);
  }
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
    return unwrapFreezeOrCast(node.expression);
  }
  return node;
}

/**
 * TypeScript AST-based recognizer and vocabulary scanner (FR-ONT-8).
 * Detects regex literals, `new RegExp(...)`, string-matching predicates
 * (`.includes`/`.startsWith`/`.endsWith`/`.match`/`.matchAll`/`.search`/`.test`),
 * string `switch` dispatchers, lowercase/uppercase string-literal arrays, `Set`s,
 * and vocabulary lookup object literals.
 */
export function scanTypeScriptRecognizerSignals(
  sourceText: string,
  filePath = 'source.ts',
): {
  regexCount: number;
  vocabularyDeclarationCount: number;
  totalSignals: number;
} {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  let regexCount = 0;
  let vocabularyDeclarationCount = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isRegularExpressionLiteral(node)) {
      regexCount += 1;
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'RegExp'
    ) {
      regexCount += 1;
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (
        method === 'includes' ||
        method === 'startsWith' ||
        method === 'endsWith' ||
        method === 'match' ||
        method === 'matchAll' ||
        method === 'search' ||
        method === 'test'
      ) {
        if (
          node.arguments.length > 0 &&
          (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        ) {
          vocabularyDeclarationCount += 1;
        } else if (method === 'test' || method === 'match' || method === 'matchAll') {
          vocabularyDeclarationCount += 1;
        } else if (method === 'includes' && ts.isArrayLiteralExpression(node.expression.expression)) {
          vocabularyDeclarationCount += 1;
        }
      }
    } else if (ts.isSwitchStatement(node)) {
      const hasStringCases = node.caseBlock.clauses.some(
        (clause) =>
          ts.isCaseClause(clause) &&
          (ts.isStringLiteral(clause.expression) || ts.isNoSubstitutionTemplateLiteral(clause.expression)),
      );
      if (hasStringCases) {
        vocabularyDeclarationCount += 1;
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrapFreezeOrCast(node.initializer);
      if (isStringLiteralArrayNode(init) || isVocabularyObjectLiteralNode(init)) {
        vocabularyDeclarationCount += 1;
      } else if (
        ts.isNewExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === 'Set' &&
        init.arguments &&
        init.arguments.length > 0 &&
        isStringLiteralArrayNode(unwrapFreezeOrCast(init.arguments[0]))
      ) {
        vocabularyDeclarationCount += 1;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    regexCount,
    vocabularyDeclarationCount,
    totalSignals: regexCount + vocabularyDeclarationCount,
  };
}

function resolveDefaultBackendRoot(): string {
  return path.resolve(__dirname, '../../../../..');
}

export function discoverLiveAskRecognizerSources(
  backendRoot: string = resolveDefaultBackendRoot(),
): readonly DiscoveredAskRecognizerSource[] {
  const relativeFiles: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'semantic' || entry.name === 'graphify-out') continue;
        walk(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        relativeFiles.push(path.relative(backendRoot, fullPath).replace(/\\/g, '/'));
      }
    }
  };

  walk(path.join(backendRoot, 'src/services/ask'));
  walk(path.join(backendRoot, 'src/productFramework/ask'));
  for (const extraRel of [
    'src/controllers/ask.controller.ts',
    'src/controllers/askIntake.controller.ts',
    'src/routes/ask.routes.ts',
  ]) {
    if (fs.existsSync(path.join(backendRoot, extraRel))) {
      relativeFiles.push(extraRel);
    }
  }
  relativeFiles.sort();

  const discovered: DiscoveredAskRecognizerSource[] = [];
  for (const relativeFilePath of relativeFiles) {
    const fullPath = path.join(backendRoot, relativeFilePath);
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const counts = scanTypeScriptRecognizerSignals(sourceText, relativeFilePath);
    if (counts.totalSignals > 0) {
      discovered.push({
        relativeFilePath,
        regexCount: counts.regexCount,
        vocabularyDeclarationCount: counts.vocabularyDeclarationCount,
        totalSignals: counts.totalSignals,
      });
    }
  }

  return Object.freeze(discovered);
}

/**
 * FR-ONT-8: families whose legacy recognizer has been DELETED, not merely demoted. Each records the successor, the parity
 * evidence that justified deletion, and the source tokens that must never reappear (a mechanical guard against a competing
 * claim path returning). `validateRetiredRecognizerFamilies` fails if any forbidden token is found in `src/`.
 */
export interface RetiredRecognizerFamily {
  readonly familyId: string;
  readonly retiredOn: string;
  readonly formerSources: readonly string[];
  readonly successor: string;
  readonly parityEvidence: string;
  readonly forbiddenTokens: readonly string[];
}

export const ASK_RETIRED_RECOGNIZER_FAMILIES: readonly RetiredRecognizerFamily[] = Object.freeze([
  {
    familyId: 'recognizer.retired.inventory_item_warranty_relation_shape9',
    retiredOn: '2026-11-16',
    formerSources: [
      'src/services/ask/dataPoint/dataPointShapes789.ts (Shape 9: NO_WARRANTY / HAS_WARRANTY planner, where-clause, runner, renderer)',
      'src/services/ask/semantic/legacyGrammarAgreement.ts (warrantyShapeGrammarAgreement)',
    ],
    successor: 'deterministicSemanticParser + cross-domain executor, job query.inventory_item.warranty_relation, relation relation.inventory_item.warranty (canonical adapter readTransitionalWarrantyLinks)',
    parityEvidence: 'Over 13,446 generated phrasings (14 leads x 8 nouns x 20 warranty phrases x 3 politeness x 2 punctuation, plus 10 fixed rows), every prompt the legacy recognizer would have executed (792 with grammar agreement) is also parsed by the typed grammar; 0 legacy-only answers. All 792 reach the semantic entry (CROSS_DOMAIN_PLAN_MATCH) identically before and after deletion. The 2,016 legacy-only matches were already refused by the agreement gate (DISAGREE).',
    forbiddenTokens: ['NO_WARRANTY\'', 'HAS_WARRANTY\'', 'warrantyShapeGrammarAgreement'],
  },
  {
    familyId: 'recognizer.retired.inventory_item_field_absence_shape8',
    retiredOn: '2026-11-16',
    formerSources: [
      'src/services/ask/dataPoint/dataPointShapes789.ts (Shape 8 absence: ABSENCE planner, absenceTarget alias matcher, where-clause, renderer)',
    ],
    successor: 'deterministicSemanticParser/cross-domain grammar rule + executor job query.inventory_item.field_absence over the registered absence fields (INVENTORY_ABSENCE_FIELD_POINT_IDS), vocabulary in the generated cross-domain lexicon (reviewed against ABSENCE_REQUIREMENT_REGISTRY aliases)',
    parityEvidence: 'Over 17,220 generated phrasings (4 leads x 5 nouns x 7 negations x 41 registry aliases/words x 3 tails), the legacy recognizer answered 14,880; the typed grammar answers 13,800 of them with the same field (0 field mismatches). The 1,080 it does not answer are all three value-question wordings ("did we install", "did i install", "cost when i bought") that only mean something as a value read; there are 0 legacy-only natural wordings. The grammar additionally answers 2,160 the legacy planner refused. Known differences: item columns are read through the visible-item filter (hidden items are no longer counted) and whitespace-only text counts as not recorded.',
    forbiddenTokens: ['shape: \'ABSENCE\'', 'absenceTarget'],
  },
]);

export interface ValidateRecognizerRetirementOptions {
  readonly backendRoot?: string;
  readonly extraDiscoveredFiles?: readonly string[];
}

export function validateRecognizerRetirementManifest(
  options: ValidateRecognizerRetirementOptions = {},
): string[] {
  const issues: string[] = [];
  const backendRoot = options.backendRoot ?? resolveDefaultBackendRoot();
  const seenIds = new Set<string>();
  const fileToEntryId = new Map<string, string>();

  for (const entry of ASK_RECOGNIZER_RETIREMENT_MANIFEST) {
    if (seenIds.has(entry.recognizerId)) {
      issues.push(`Duplicate recognizerId '${entry.recognizerId}' in ASK_RECOGNIZER_RETIREMENT_MANIFEST.`);
    }
    seenIds.add(entry.recognizerId);

    if (entry.sourceFile.includes('*')) {
      issues.push(`Recognizer '${entry.recognizerId}' uses wildcard sourceFile '${entry.sourceFile}'.`);
    }
    if (entry.coveredSourceFiles.length === 0) {
      issues.push(`Recognizer '${entry.recognizerId}' has no coveredSourceFiles.`);
    }
    if (!entry.coveredSourceFiles.includes(entry.sourceFile)) {
      issues.push(
        `Recognizer '${entry.recognizerId}' primary sourceFile '${entry.sourceFile}' must be included in coveredSourceFiles.`,
      );
    }

    let computedSignalSum = 0;
    for (const relFile of entry.coveredSourceFiles) {
      if (relFile.includes('*')) {
        issues.push(`Recognizer '${entry.recognizerId}' coveredSourceFile '${relFile}' contains a wildcard.`);
        continue;
      }
      const existingOwner = fileToEntryId.get(relFile);
      if (existingOwner && existingOwner !== entry.recognizerId) {
        issues.push(
          `Recognizer file '${relFile}' is claimed by both '${existingOwner}' and '${entry.recognizerId}'.`,
        );
      }
      fileToEntryId.set(relFile, entry.recognizerId);

      const fullPath = path.join(backendRoot, relFile);
      if (!fs.existsSync(fullPath)) {
        issues.push(`Recognizer '${entry.recognizerId}' coveredSourceFile '${relFile}' does not exist on disk.`);
        continue;
      }
      const stats = scanTypeScriptRecognizerSignals(fs.readFileSync(fullPath, 'utf8'), relFile);
      if (stats.totalSignals <= 0 && entry.recognizerId !== 'recognizer.fast_path.rule_manifest') {
        issues.push(
          `Recognizer '${entry.recognizerId}' coveredSourceFile '${relFile}' contains 0 live regex or vocabulary signals.`,
        );
      }
      computedSignalSum += stats.totalSignals;
    }

    if (entry.liveItemCount <= 0) {
      issues.push(`Recognizer '${entry.recognizerId}' has non-positive liveItemCount=${entry.liveItemCount}.`);
    }
    if (entry.recognizerId === 'recognizer.fast_path.rule_manifest') {
      if (entry.liveItemCount !== FAST_PATH_RULE_MANIFEST.length) {
        issues.push(
          `FAST_PATH_RULE_MANIFEST liveItemCount (${entry.liveItemCount}) drifted from actual rule count (${FAST_PATH_RULE_MANIFEST.length}).`,
        );
      }
    } else if (computedSignalSum > 0 && entry.liveItemCount !== computedSignalSum) {
      issues.push(
        `Recognizer '${entry.recognizerId}' liveItemCount (${entry.liveItemCount}) drifted from live repository signal count (${computedSignalSum}).`,
      );
    }

    if (!entry.canonicalReplacementTarget.trim()) {
      issues.push(`Recognizer '${entry.recognizerId}' is missing canonicalReplacementTarget.`);
    }
    if (entry.affectedDomains.length === 0) {
      issues.push(`Recognizer '${entry.recognizerId}' has no affectedDomains.`);
    }
  }

  const discoveredSources = discoverLiveAskRecognizerSources(backendRoot);
  const discoveredFileSet = new Set(discoveredSources.map((s) => s.relativeFilePath));
  for (const extra of options.extraDiscoveredFiles ?? []) {
    discoveredFileSet.add(extra);
  }

  for (const discoveredFile of discoveredFileSet) {
    if (!fileToEntryId.has(discoveredFile)) {
      issues.push(
        `Uninventoried Ask recognizer/vocabulary file '${discoveredFile}' discovered in repository but missing from ASK_RECOGNIZER_RETIREMENT_MANIFEST.`,
      );
    }
  }

  return issues;
}

/** Mechanical proof that a retired family stays retired: none of its forbidden tokens may appear in repository source. */
export function validateRetiredRecognizerFamilies(options: { readonly backendRoot?: string } = {}): string[] {
  const issues: string[] = [];
  const backendRoot = options.backendRoot ?? resolveDefaultBackendRoot();
  const srcRoot = path.join(backendRoot, 'src');
  const stack = [srcRoot];
  const files: string[] = [];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('graphify-out')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.ts') && !full.endsWith('recognizerRetirementManifest.ts')) files.push(full);
    }
  }
  for (const family of ASK_RETIRED_RECOGNIZER_FAMILIES) {
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const token of family.forbiddenTokens) {
        if (text.includes(token)) issues.push(`Retired recognizer ${family.familyId}: forbidden token ${token} reappeared in ${path.relative(backendRoot, file)}.`);
      }
    }
  }
  return issues;
}
