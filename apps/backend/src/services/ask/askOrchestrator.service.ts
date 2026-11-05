// Ask orchestrator facade. The orchestrator used to be one 20,000-line file; its code now lives in:
//   handlers/*.handler.ts      one file per capability family (reads, propose and confirm flows); each registers itself
//   execution/*.ts             the execution lifecycle: dispatch, create, capture, clarification, confirm, sessions, feedback, concierge
//   askHandlerSupport.ts       helpers shared by the handlers and the lifecycle
//   askFormatting.ts           small display formatters
// This file imports them (so the handlers register before anything is dispatched) and re-exports every name the
// orchestrator used to export, so existing imports keep working. See
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md. Do not add logic here.
import { loadAskHandlerManifest } from './askRuntimeBootstrap';
// Registers every capability and confirm handler (askRuntimeBootstrap.ts is the explicit manifest; this keeps every existing importer working).
loadAskHandlerManifest();
export { EVIDENCE_ATTACH_MESSAGE, EVIDENCE_ATTACH_MESSAGES } from './handlers/miscHandlers.handler';
import './execution/createAskExecution';
export { createAskExecution } from './execution/createAskExecution';
import './execution/askRetry';
export { retryAskExecution } from './execution/askRetry';
import './execution/askClarification';
export { submitAskClarification, resolveAskExecutionProperty } from './execution/askClarification';
import './execution/askConfirm';
export { confirmAskExecution, editAskConfirmation, cancelAskExecution } from './execution/askConfirm';
import './execution/askCapture';
export { submitAskCapture, recordAskCaptureEvent, recordAskCaptureFailure } from './execution/askCapture';
import './execution/askHandoffTelemetry';
export { resolveHandoffAttribution, recordHandoffOutcome, classifyLaunchedOutcome } from './execution/askHandoffTelemetry';
import './execution/askFeedback';
export { requestAskCorrection, submitAskExecutionFeedback, submitHomeActionUsefulnessFeedback } from './execution/askFeedback';
import './execution/askSessions';
export { getAskSession, getRecentAskSessions, updateAskSessionForUser, getAskExecution, getAskPendingWork, continueAskExecution } from './execution/askSessions';
import './execution/askConcierge';
export { getConciergeHome } from './execution/askConcierge';
export { operationalWorkCompletionObservedResult } from './handlers/miscHandlers.handler';
export { saleReadinessItemConflictDescription, editInspectionFindingResolveConfirmation, editRecallMatchResolveConfirmation } from './handlers/workflowConfirm.handler';
export { editHomeEventRadarFeedbackConfirmation } from './handlers/radarConfirm.handler';
export { HOME_EVENT_VISIBILITY_MESSAGE, InspectionResolutionSchema, isCapitalTimelineAnalysisStale, isValidDateEditInput, parseCapitalTimelineHorizonRequest, preservedExecutionHistory } from './askHandlerSupport';
import './handlers/inventoryAskActions';
import './execution/executeOperation';
import './handlers/propertyTaxEvidenceCommands.handler';
import './handlers/propertyTaxDocumentFactsCommands.handler';
export { executeOperationCore, executeOperation, refreshAskExecutionAfterConflict, refreshAskSourceExecution, ASK_MUTATION_IMPACT_MAP, siblingOperationIdsForBuyerTaskMutation, selectSiblingRefreshTargets, capReconciledChildExecutions, reconcileAskExecutionSideEffects } from './execution/executeOperation';
export { oracleApplianceLabel, oracleLifespanItem, applianceFailureRiskFromView, maintenanceBudgetFromView } from './handlers/applianceOracleBudget.handler';
export { neighborhoodChangeFeedFromView } from './handlers/aroundYourHome.handler';
export { buyerTaskConflictDescription, buyerFindingConflictDescription, buyerJourneyStageLabel, parseBuyerDeadlineLaneFilter, selectBuyerDeadlineMilestones, buildBuyerDeadlinesViewState, BUYER_TASK_ITEM_ACTIONS, buyerTaskItemActions, buyerDeadlineTaskRow, buyerTaskVersion, buyerClosingDayProgress } from './handlers/buyerPlan.handler';
export { capitalTimelineBlock, renovationReadinessProgress } from './handlers/capitalPlanning.handler';
export { claimConflictDescription, CLAIM_TYPE_PATTERNS, ClaimFileWorkflowInputSchema, claimFileResult, CLAIM_TRANSITION_ACTIONS, claimItemActions } from './handlers/claims.handler';
export { coverageComparisonStrip } from './handlers/coverage.handler';
export { DIY_ACTIVE_STATUSES, diyProjectsFromView } from './handlers/diyProjectCenter.handler';
export { diyProjectGuideResult } from './handlers/diyProjectGuide.handler';
export { doNothingSimulationFromView } from './handlers/doNothingSimulator.handler';
export { environmentReportFromView } from './handlers/environmentReport.handler';
export { guidanceJourneysFromView, guidanceJourneyContinuation, guidanceGuardTargetForStep, guidanceStepContextVersion, guidanceJourneyDismissContextVersion, GUIDANCE_STEP_SKIP_MESSAGE, GUIDANCE_JOURNEY_DISMISS_MESSAGE } from './handlers/guidanceOverview.handler';
export { hoaComplianceFromView } from './handlers/hoaCompliance.handler';
export { isAllPropertyAttentionRequest, buildAllPropertyHomeActionSection, formatUnavailableHomeActionProducers, homeActionShelfFacts, loadOptionalBuyerPlanContext } from './handlers/homeActions.handler';
export { digitalWillHandoffProgress, digitalWillFromView } from './handlers/homeDigitalWill.handler';
export { parseRadarFeedFilters, radarFeedFilterMessage, RADAR_STATE_MESSAGES, RADAR_MARK_DONE_MESSAGE, RADAR_FEEDBACK_MESSAGE, RADAR_TASK_MESSAGE, RADAR_PREFERENCES_MESSAGE, RADAR_USER_STATE_LABEL, RADAR_FEEDBACK_OPTIONS, radarEventItemActions, radarStateTransition, radarStateContextVersion, homeEventRadarStateResult, radarFeedbackConfirmation, RADAR_FEEDBACK_REVIEW_BODY, radarConfirmError, radarWriteReceipt, RADAR_TASK_CAPTURE_KEY, RADAR_PREFERENCES_CAPTURE_KEY, radarZonedWallClockToUtc, radarDateTimeLabel, radarTaskContextVersion, radarCaptureError, radarTaskFormResult, RADAR_TASK_CONFIRM_ERRORS, radarPreferencesContextVersion, radarPreferencesBodyFromAnswer, radarPreferenceLabels, radarPreferencesFormResult, RadarFeedLifecycleFilter, RadarFeedFamilyFilter, RadarFeedFilterState, RadarStateRequest } from './handlers/homeEventRadar.handler';
export { HOME_HABITS_ASK_LIMIT, homeHabitsFromView } from './handlers/homeHabitCoach.handler';
export { householdService, householdWorkflowVersion, householdInvitationResult, homeEventCorrectionValueError, homeEventFieldCurrent, homeEventFieldPatch, homeEventLinkOptions, homeEventCorrectionBlocker, homeEventContextVersion, homeEventCorrectionConfirmation, homeEventVisibilityBlocker, homeEventVisibilityConfirmation, warrantyContextVersion, warrantyEditItemActions, homeEventUpdateResult, homeEventUpdateConfirmation, warrantyUpdateResult, warrantyUpdateConfirmation, warrantyAddResult, eventAddResult, evidenceAttachResult, roomTypeLabel, ROOM_CORRECTION_FIELDS, roomFieldCurrent, roomFieldDisplay, roomContextVersion, roomCorrectionValueError, roomCorrectionNormalized, roomRenameItemActions, roomRenameConfirmation, EVENT_ADD_MESSAGE, WARRANTY_ADD_MESSAGE, ROOM_ADD_MESSAGE, ROOM_CREATE_CAPTURE_KEY, roomCreateContextVersion, roomCreateResult, homeEventsServiceForCapture } from './handlers/homeRecordWrites.handler';
export { pastHazardExposureFromView } from './handlers/homeRiskReplay.handler';
export { roomMapFacts } from './support/roomMap';
export { HOME_TIMELINE_ASK_LIMIT, homeTimelineCategory, homeTimelinePlacement, homeTimelineFromView } from './handlers/homeTimeline.handler';
export { homeUpgradeComparison, homeUpgradeScenariosFromView } from './handlers/homeUpgradePlanner.handler';
export { hvacDecisionStartContextVersion, hvacDecisionThreadVersionFingerprint, HVAC_VERDICT_RANK, hvacDecisionStartResult, hvacSpecialistEngageResult, HvacSpecialistEngageDependencies } from './handlers/hvacDecision.handler';
export { INSPECTION_FINDING_ACTIONS, inspectionFindingItemActions, inspectionFindingActionAllowed, inspectionFindingItemActionsFor, INSPECTION_FINDING_BATCH_ACTIONS, INSPECTION_FINDING_DECK_PRESENTATION, inspectionFindingDeckFacts, INSPECTION_RESOLUTION_DEFAULT, inspectionResolutionEditableFields, inspectionFindingVersion } from './handlers/inspection.handler';
export { RECALL_MATCH_ACTIONS, recallMatchItemActions, recallMatchActionAllowed, recallMatchItemActionsFor, RECALL_RESOLUTION_DEFAULT, recallResolutionEditableFields, recallMatchVersion } from './handlers/recallReview.handler';
export { inventoryService, inventoryCategoryLabel, INVENTORY_CORRECTION_NO_ROOM_VALUE, INVENTORY_CORRECTION_FIELDS, INVENTORY_ROOM_LINK_FIELD, inventoryFieldCurrent, inventoryFieldValueError, inventoryRoomLinkOptions, inventoryCorrectionCombinedBlocker, inventoryFieldNormalized, inventoryFieldPatch, inventoryFieldDisplay, inventoryItemContextVersion, inventoryCorrectionItemActions, inventoryCorrectionConfirmation, INVENTORY_EDIT_MESSAGE, INVENTORY_ADD_MESSAGE, INVENTORY_CREATE_CAPTURE_KEY, INVENTORY_COMPLETE_DETAILS_CAPTURE_KEY, INVENTORY_NO_ROOM_VALUE, inventoryAddItemAction, inventoryCreateRooms, inventoryCreateContextVersion, inventoryCreateBlocker, inventoryItemCreateResult, inventoryCompleteDetailsResult, inventoryEditResult } from './handlers/inventory.handler';
export { maintenanceMoney, maintenanceWorkflowVersion, extractMaintenanceDueDate, maintenanceTaskCreateResult, maintenanceTaskVersion, maintenanceConflictDescription, maintenanceCompletionMatch, extractMaintenanceCompletionInput, maintenanceTaskCompleteResult, maintenanceUpdateAction, maintenanceUpdateSubject, maintenanceTaskUpdateResult, maintenanceMonitorSubject, loadAskViewState, mergeMaintenanceViewContinuation, maintenanceOpenTimingGroups, maintenanceShelfFacts, resolveMaintenanceCollectionOffset, maintenanceResult } from './handlers/maintenance.handler';
export { materialSpecsFromView } from './handlers/materialSpecs.handler';
export { NEGOTIATION_SHIELD_ASK_LIMIT, negotiationShieldCasesFromView } from './handlers/negotiationShield.handler';
export { plantCareOutlookFromView } from './handlers/plantAdvisor.handler';
export { PRICE_FINALIZATION_ASK_LIMIT, priceFinalizationsFromView } from './handlers/priceFinalization.handler';
export { projectDetailFromView, trackedProjectsFromView } from './handlers/projectTracker.handler';
export { propertyBriefsFromView } from './handlers/propertyBrief.handler';
export { propertyCompletenessProgress, areaCaptureRowActions, areaCaptureStateFrom, AreaCaptureAnswerSchema, areaCaptureError, areaCapturePrompt, areaCaptureSubmitResult } from './handlers/propertySummary.handler';
export { quoteWorkspaceContextVersion, QUOTE_LOWEST_PRICE_BADGE, quoteReviewComparison } from './handlers/quotes.handler';
export { refinanceMonitorContextVersion, parseRefinanceScenarioEdit, refinanceMonitorBlock, breakEvenHorizonYears, breakEvenAnalysisFromDto, refinanceScenarioComparison } from './handlers/refinance.handler';
export { SALE_READINESS_ITEM_STATUS_LABELS, sellHoldRentComparison, sellerPrepShelfFacts, SELLER_PREP_ITEM_ACTIONS, sellerPrepItemActions, sellerPrepItemContextVersion } from './handlers/sellHoldRent.handler';
export { SERVICE_PRICE_RADAR_ASK_LIMIT, servicePriceChecksFromView, servicePriceCheckDetailFromView } from './handlers/servicePriceRadar.handler';
export { STATUS_BOARD_ASK_LIMIT, statusBoardShelfFacts, statusBoardMeta, statusBoardFromView } from './handlers/statusBoard.handler';
