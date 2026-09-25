import { getCaptureDefinition, getCaptureDefinitionForFact } from '../../modules/propertyContext/catalog/captureRegistry';
import { PROPERTY_AREA_CAPTURE_FEATURE, PROPERTY_AREA_CAPTURE_OPERATION, PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../modules/propertyContext/catalog/featureRequirementRegistry';
import { getFactDefinition, PROPERTY_FACT_CATALOG } from '../../modules/propertyContext/catalog/factCatalog';
import { getContextCompleteness } from '../../modules/propertyContext/application/getContextCompleteness';
import { AskCaptureAttribution, AskExecution, AskExecutionStatus, BuyerFindingDisposition, BuyerPlanPriority, ClaimType as PrismaClaimType, HomeBuyerTaskStatus, HouseholdRole, MaintenanceTaskPriority, MaintenanceTaskStatus, NotificationCadence, Prisma, PropertyFactSourceType, RecurrenceFrequency, RefinanceRateMonitorProduct, RefinanceScenarioTerm, ServiceCategory, WarrantyCategory } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ASK_RESPONSE_SCHEMA_VERSION, AskExecutionResponseSchema, type AskCaptureRequest, type AskExecutionResponse, type AskPendingWorkItem, type AskPresentationBlock, type AskRecentSessionPage, type AskRecentSessionSummary, type AskSessionUpdateRequest, type ContinueAskExecution, type CreateAskExecutionRequest, type EditAskConfirmation, type RecordAskCaptureEvent, type RequestAskCorrection, type ResolveAskExecutionProperty, type SubmitAskCaptureRequest, type SubmitAskClarification, type SubmitAskConfirmation, type SubmitAskFeedback, type SubmitHomeActionUsefulnessFeedback } from '../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { ASK_SESSION_HISTORY_PAGE_SIZE, askHistoryAccessiblePropertyWhere, askSessionHistoryWhere, decodeAskSessionHistoryCursor, encodeAskSessionHistoryCursor } from './askSessionHistoryPagination';
import { askAnswerTrustTotal, askCorrectionsTotal, askExecutionDurationSeconds, askExecutionsTotal, askFeedbackTotal, askInlineCapturesTotal, askModelDurationSeconds, askRemoteGenerationCharactersTotal, askRemoteGenerationTotal, askResultSynthesisTotal, askRoutingDecisionsTotal, askSemanticAnswerValidationDurationSeconds, askSemanticAnswerValidationTotal, askSkillAdapterExecutionDurationSeconds, askSkillAdapterExecutionsTotal, askSkillAdapterResolutionDurationSeconds, askSkillCanonicalOperationDurationSeconds, askSkillExecutionDurationSeconds, askSkillExecutionsTotal, askSkillHandoffsTotal, askSkillPresentationDurationSeconds, askSkillRoutingDecisionsTotal, askSkillRoutingDurationSeconds } from '../../lib/metrics';
import { resolvePropertyAccess, type PropertyAccess } from '../propertyAccess.service';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';
import { CLOSING_HOME_LANES, HomeBuyerTaskService } from '../HomeBuyerTask.service';
import type { BuyerClosingHomeLaneKey } from '../../productFramework/buyerAcquisition.contract';
import { BuyerPurchaseLenderReadinessService } from '../buyerPurchaseLenderReadiness.service';
import { BuyerTitleEscrowService } from '../buyerTitleEscrow.service';
import { BuyerWalkthroughService } from '../buyerWalkthrough.service';
import { BuyerClosingDisclosureService } from '../buyerClosingDisclosure.service';
import { BuyerClosingDayService } from '../buyerClosingDay.service';
import { BuyerContractService } from '../buyerContract.service';
import { BuyerAcquisitionService } from '../buyerAcquisition.service';
import { composeSkillContext } from '../skills/context/skillContextComposer';
import { skillContextProviderKey } from '../skills/context/skillContextProviderRegistry';
import { loadCanonicalMaintenanceTaskSet, type MaintenanceTaskContext, type MaintenanceTaskContextTask } from '../skills/context/maintenanceTaskContext.provider';
import type { SeasonalChecklistContext } from '../skills/context/seasonalChecklistContext.provider';
import { buyerPlanContextProvider } from '../skills/context/buyerPlanContext.provider';
import { operatingModeForOwnershipState, PROPERTY_JOURNEY_CONTEXT_PROVIDER, type PropertyJourneyContext } from '../skills/context/propertyJourneyContext.contract';
import type { ComposedSkillContext } from '../skills/context/skillContext.contract';
import { MAINTENANCE_TASK_CONTEXT_PROVIDER, SEASONAL_CHECKLIST_CONTEXT_PROVIDER } from '../skills/maintenance/skill.manifest';
import { ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED, ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE, assertAskAccountRoleEligible, type AskAccountRole } from './askAccountEligibility';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy, isAskOperationDiscoverableForAudience, type AskAudienceApplicabilityDecision } from './askAudiencePolicy';
import { getCoverageReviewItems, type CoverageReviewGroup } from '../coverageGap.service';
import { getOrCreateCoverageComparison } from '../coverageComparison.service';
import { generateForecast, listForecast } from '../maintenancePrediction.service';
import { answerGroundedAsk } from '../groundedAsk.service';
import { buildCapabilityCatalog, canonicalCapabilityRegistry, matchCapabilityGoal, type CapabilityCatalogItem } from '../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../toolDiscoveryAvailability.service';
import { getCapabilityDiscoveryReadiness, getRelatedCapabilities } from '../capabilityRelated.service';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, isPropertyCompletenessRequest, resolveAskOperation, type AskOperationId, type AskOperationResolution, type AskOperationResult } from './askOperationRegistry';
import { capabilityInvoke, needsPropertyResult, operationalUnavailableResult, permissionRequiredResult, registerCapabilityHandler, skillRuntimeUnavailableReason, type CapabilityInvocationDependencies } from './capabilityHandlerRegistry';
import type { CapabilityInvocationEnvelope } from './capabilityInvocation.contract';
import { confirmCapabilityInvoke, registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from './confirmCapabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../modules/propertyContext/application/evaluateFeatureContext';
import { assertCoverageConflictFree } from '../coverageConflict.service';
import { captureFeatureContext, normalizeAnswers, PropertyContextCaptureValidationError, PropertyContextVersionConflictError } from '../../modules/propertyContext/application/captureFeatureContext';
import { capturePropertyFact } from '../../modules/propertyContext/application/capturePropertyFact';
import { capturePropertyFinancingFact, FINANCING_CAPTURE_FACT_KEY } from '../../modules/propertyContext/application/capturePropertyFinancingFact';
import { captureWarranty } from '../../modules/propertyContext/application/captureWarranty';
import { getPropertyContext, PropertyContextAccessDeniedError } from '../../modules/propertyContext/application/getPropertyContext';
import { buildUserAddedEventConfirmation, editCaptureEventCandidate, editCaptureFactCandidate, editCaptureWarrantyCandidate, EVENT_ADD_CAPTURE_KEY, eventAddCaptureRequest, runConversationalCaptureForTurn, USER_ADD_ORIGIN, warrantyAddCaptureRequest } from './conversationalUnderstanding/conversationalCapture';
import { buildAskNextActionsBlock, NEXT_ACTION_CONTEXT_PREFIX, NEXT_ACTION_FACT_QUESTIONS, NEXT_ACTION_MISSING_FACT_CAPTURE_KEY, nextActionContextOperation } from './askNextActions';
import { capabilityCardLaunch } from './askCapabilityCardLaunch';
import { HomeEventsService } from '../homeEvents.service';
import { APIError } from '../../middleware/error.middleware';
import { isWaterHeaterInventoryName } from '../repairReplaceEligibility';
import { visibleInventoryItemWhere } from '../riskAssetApplicability';
import { formatMajorApplianceType, inferMajorApplianceType, PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX } from '../majorAppliance.util';
import { getFinancialContextDecisions } from '../financialContext/context';
import { getProfile, upsertProfile } from '../financing.service';
import { RefinanceRadarService } from '../../refinanceRadar/refinanceRadar.service';
import { MortgageRateService } from '../../refinanceRadar/engine/mortgageRate.service';
import { getRefinanceAlertPreference } from '../../refinanceRadar/refinanceAlertPreference.service';
import { createOrUpdateRefinanceRateMonitor, listRefinanceRateMonitors, type RefinanceRateMonitorDTO } from '../../refinanceRadar/refinanceRateMonitor.service';
import { HouseholdService } from '../household.service';
import { HomeSavingsService } from '../homeSavings.service';
import { HiddenAssetService } from '../hiddenAssets.service';
import { savingsBenefitsUnifiedService } from '../savingsBenefitsUnified.service';
import { SellHoldRentService } from '../sellHoldRent.service';
import { PropertySaleCaseService, SALE_READINESS_MUST_ADDRESS_CLASSES, saleReadinessFigure } from '../propertySaleCase.service';
import { ownershipCostReadModelService, type OwnershipCostCurrentLens } from '../ownershipCosts/ownershipCostReadModel.service';
import { InventoryService, ROOM_REQUIRED_CATEGORIES } from '../inventory.service';
import { getPropertyRecordOverview } from '../propertyRecordOverview.service';
import { queryIntelligenceEnvelope } from '../intelligenceEnvelope';
import { radarQueryService } from '../../modules/homeEventRadar/services/radarQuery.service';
import { radarInteractionService } from '../../modules/homeEventRadar/services/radarInteraction.service';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../modules/homeEventRadar/domain/radarInteraction';
import { radarTaskIntegrationService } from '../../modules/homeEventRadar/services/radarTaskIntegration.service';
import { radarNotificationPreferenceService } from '../../modules/homeEventRadar/services/radarNotificationPreference.service';
import { RADAR_ACTION_CODES, type RadarActionTaskOperation } from '../../modules/homeEventRadar/domain/radarActionRegistry';
import { deriveRadarTaskDueDate, RadarTaskDueDateError } from '../../modules/homeEventRadar/domain/radarTaskDueDate';
import type { RadarNotificationPreferenceProjection } from '../../modules/homeEventRadar/domain/radarNotificationPreferences';
import { updateRadarNotificationPreferencesBodySchema } from '../../validators/homeEventRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../analytics';
import { getHomeActionFeed, type HomeActionEmptyStateReason } from '../homeActions.service';
import { AgentRuntimeAuthorizationError, AgentRuntimeCasConflictError, AgentRuntimeDisabledError, AgentRuntimeStateError, invokeAgentRuntime } from '../agents/agentRuntime.service';
import type { AgentRunStatusProjection, HvacSpecialistHomeActionOrigin } from '../agents/agentRuntime.contract';
import { buildBuyerPlanHomeActionsResult } from './askBuyerPlanPresentation';
import { guidanceJourneyService } from '../guidanceEngine/guidanceJourney.service';
import { hoaComplianceService } from '../hoaCompliance.service';
import { priceFinalizationService } from '../priceFinalization.service';
import { DoNothingSimulatorService, markDoNothingRunsStale } from '../doNothingSimulator.service';
import { applianceOracleService } from '../applianceOracle.service';
import { budgetForecasterService } from '../budgetForecaster.service';
import { getProtectionContextDecisions } from '../protection/context';
import { mapGuidanceJourney } from '../guidanceEngine/guidanceMapper';
import { getOrCreateQuoteComparisonWorkspace, getQuoteComparisonWorkspace, getWorkspaceComparability } from '../quoteComparison.service';
import { upsertNotificationPreference } from '../notificationPreference.service';
import { updateInsurancePolicy, updateWarranty } from '../home-management.service';
import { correctionDateString, correctionDisplay, correctionMoneyFromDollars, correctionMoneyToCents, correctionNormalized, correctionValueError, type CorrectionFieldSpec, type CorrectionOption } from './askCorrectionFields';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../coverageAnalysis.service';
import { markReplaceRepairStale, ReplaceRepairService } from '../replaceRepairAnalysis.service';
import { markRiskPremiumOptimizerStale } from '../riskPremiumOptimizer.service';
import { homeReserveFundService } from '../homeReserveFund.service';
import { BreakEvenService, type BreakEvenDTO } from '../breakEven.service';
import { getAroundYourHome } from '../../propertyIntelligence/aroundYourHome.service';
import { getPastHazardExposure } from '../../propertyIntelligence/pastHazardExposure.service';
import { humanDate, money, readableCode, titleCase } from './askFormatting';
import { AreaCaptureAnswerSchema, areaCaptureError, areaCapturePrompt, areaCaptureStateFrom, areaCaptureSubmitResult } from './handlers/propertySummary.handler';
import { AREA_CAPTURE_MESSAGES, areaCaptureFallbackHref, areaCaptureProgress, areaLabel, areaProgressBlock, asInputJson, askCaptureRequest, askContextFingerprint, AskViewState, audienceApplicabilityResult, audienceTelemetryFor, BUYER_FINDING_DISPOSITION_LABELS, capabilityResult, captureFallbackHref, durableFreeTextClarification, ensurePropertyAccess, exactEntityMatch, expireIfSkillBindingChanged, formatOutcomeCents, HOME_EVENT_CORRECTION_FIELDS, HOME_EVENT_LINK_FIELDS, HOME_EVENT_VISIBILITY_LABELS, HomeEventCorrectionField, HomeEventCorrectionInputSchema, homeEventCorrectionItemActions, HomeEventVisibilityInputSchema, HouseholdInvitationInputSchema, InspectionResolution, InspectionResolutionSchema, InventoryCreateInputSchema, InventoryItemCorrectionInputSchema, InvitableHouseholdRole, invitationRoleCopy, isCapitalTimelineAnalysisStale, isValidDateEditInput, journeyContextFrom, loadRadarMatchForWrite, MaintenanceCompletionWorkflowInput, MaintenanceCompletionWorkflowInputSchema, MaintenanceTaskUpdateInputSchema, MaintenanceTaskWorkflowInput, MaintenanceTaskWorkflowInputSchema, mapPersistedExecution, MAX_RESULT_ITEMS, outcomeSummaryBlock, parseCapitalTimelineHorizonRequest, preservedExecutionHistory, propertyLabel, propertySummary, QuoteWorkspaceCommandInputSchema, RadarFeedbackInputSchema, RadarTaskAnswerSchema, RadarTaskInputSchema, RadarTaskTargetSchema, readablePropertyValue, recordAskAnswerTrustMetrics, RoomCreateInputSchema, RoomRenameInputSchema, safeTimezone, terminalStatus, WarrantyCorrectionInputSchema } from './askHandlerSupport';
import { INSPECTION_RESOLUTION_DEFAULT, inspectionFindingVersion, inspectionResolutionEditableFields } from './handlers/inspection.handler';
import { quoteWorkspaceContextVersion } from './handlers/quotes.handler';
import { refinanceMonitorBlock, refinanceMonitorContextVersion } from './handlers/refinance.handler';
import { EVENT_ADD_MESSAGE, eventAddResult, evidenceAttachResult, homeEventContextVersion, homeEventCorrectionBlocker, homeEventCorrectionConfirmation, homeEventCorrectionValueError, homeEventFieldCurrent, homeEventFieldPatch, homeEventLinkOptions, homeEventsServiceForCapture, homeEventVisibilityBlocker, homeEventVisibilityConfirmation, householdInvitationResult, householdService, householdWorkflowVersion, ROOM_ADD_MESSAGE, ROOM_CORRECTION_FIELDS, ROOM_CREATE_CAPTURE_KEY, roomContextVersion, roomCorrectionNormalized, roomCorrectionValueError, roomCreateContextVersion, roomCreateResult, roomFieldCurrent, roomFieldDisplay, roomRenameConfirmation, roomRenameItemActions, roomTypeLabel, WARRANTY_ADD_MESSAGE, WARRANTY_CORRECTION_FIELDS, warrantyAddResult, warrantyContextVersion, warrantyCorrectionConfirmation, warrantyCorrectionItemActions, warrantyCorrectionValueError, warrantyFieldCurrent, warrantyFieldPatch } from './handlers/homeRecordWrites.handler';
import { SALE_READINESS_ITEM_STATUS_LABELS, saleCaseHref, sellerPrepItemContextVersion } from './handlers/sellHoldRent.handler';
import { INVENTORY_ADD_MESSAGE, INVENTORY_CORRECTION_FIELDS, INVENTORY_CORRECTION_NO_ROOM_VALUE, INVENTORY_CREATE_CAPTURE_KEY, INVENTORY_NO_ROOM_VALUE, INVENTORY_ROOM_LINK_FIELD, inventoryAddItemAction, inventoryCategoryLabel, inventoryCorrectionCombinedBlocker, inventoryCorrectionConfirmation, inventoryCorrectionItemActions, inventoryCreateBlocker, inventoryCreateContextVersion, inventoryCreateRooms, inventoryFieldCurrent, inventoryFieldDisplay, inventoryFieldNormalized, inventoryFieldPatch, inventoryFieldValueError, inventoryItemContextVersion, inventoryItemCreateResult, inventoryRoomLinkOptions, inventoryService } from './handlers/inventory.handler';
import { CLAIM_TYPE_PATTERNS, claimConflictDescription, claimFileResult, ClaimFileWorkflowInputSchema } from './handlers/claims.handler';
import { RADAR_FEEDBACK_OPTIONS, RADAR_FEEDBACK_REVIEW_BODY, RADAR_PREFERENCES_CAPTURE_KEY, RADAR_TASK_CAPTURE_KEY, RADAR_TASK_CONFIRM_ERRORS, RADAR_USER_STATE_LABEL, radarCaptureError, radarConfirmError, radarDateTimeLabel, radarEventHref, radarFeedbackConfirmation, radarPreferenceLabels, radarPreferencesBodyFromAnswer, radarPreferencesContextVersion, radarPreferencesFormResult, radarStateContextVersion, radarTaskContextVersion, radarTaskFormResult, radarWriteReceipt } from './handlers/homeEventRadar.handler';
import { HVAC_VERDICT_RANK, hvacDecisionStartContextVersion, hvacDecisionStartResult, hvacDecisionThreadVersionFingerprint } from './handlers/hvacDecision.handler';
import { executeOperation, reconcileAskExecutionSideEffects, refreshAskSourceExecution } from './execution/executeOperation';
import { buyerFindingConflictDescription, buyerPlanHref, buyerTaskConflictDescription, buyerTaskVersion } from './handlers/buyerPlan.handler';
import { extractMaintenanceCompletionInput, extractMaintenanceDueDate, loadAskViewState, maintenanceCompletionMatch, maintenanceConflictDescription, maintenanceMoney, maintenanceMonitorSubject, maintenanceResult, maintenanceTaskCompleteResult, maintenanceTaskCreateResult, maintenanceTaskUpdateResult, maintenanceTaskVersion, maintenanceUpdateAction, maintenanceUpdateSubject, maintenanceWorkflowVersion } from './handlers/maintenance.handler';
import { roomMapFacts } from './handlers/homeTimeline.handler';
import { HomeHabitCoachService } from '../homeHabitCoach/homeHabitCoachService';
import { evaluateHomeDigitalWillHandoffReadiness, HomeDigitalWillService } from '../homeDigitalWill.service';
import { PlantCarePlannerService } from '../plantCarePlanner.service';
import { listNegotiationShieldCasesForProperty } from '../negotiationShieldCaseList';
import { HomeDigitalTwinScenarioService } from '../homeDigitalTwinScenario.service';
import { diyService } from '../diy.service';
import { listProjects as listTrackedProjects } from '../projectTracker.service';
import { ServicePriceRadarService } from '../servicePriceRadar.service';
import type { NegotiationShieldCaseSummaryDTO } from '../negotiationShield.types';
import { isReviewedIntelligenceCoverageAvailable } from '../../middleware/intelligenceCoverage.middleware';
import { HomeCapitalTimelineService } from '../homeCapitalTimeline.service';
import { propertyTaxAppealReadinessService } from '../propertyTax/propertyTaxAppealReadiness.service';
import { listRenovationCases } from '../renovationCase.service';
import { getReadiness as getRenovationReadiness } from '../renovationReadiness.service';
import { PermitTrackerService } from '../permitTracker.service';
import { getAskDomainCommandByOperation } from './askDomainCommandRegistry';
import * as decisionThreadService from '../decisionPlatform/decisionThreadService';
import * as decisionPreferenceService from '../decisionPlatform/decisionPreferenceService';
import { assumptionsItemsForSnapshot, decisionProgressBlock, evidenceItemsForCanonicalFacts, recommendationChangeBlock, type HvacEvidenceSourceItem, whyNowBlock } from './decisionThreadPresentationBlocks';
import { sellHoldRentDecisionFamilyAdapter } from '../decisionPlatform/domainSnapshotAdapters';
import { HouseholdProfileNotEnabledError, PreferenceNotAuthorizedError } from '../decisionPlatform/decisionPreferenceService';
import * as outcomeObservationService from '../decisionPlatform/outcomeObservationService';
import { recordDocumentPromotionOutcome, sourceTypeLabel as outcomeSourceTypeLabel } from '../decisionPlatform/outcomeObservationService';
import { listPropertyChanges } from '../../propertyChanges/propertyChange.service';
import { buildChangeSummaryText, sourceTypeLabel } from '../decisionPlatform/homeChangeSummaryMapping';
import { buildPriorityListView } from '../decisionPlatform/priorityListPolicy';
import { getSuppressedHomeActionIds, recordHomeActionUsefulnessFeedback } from '../decisionPlatform/homeActionUsefulnessFeedback.service';
import { recordTypedFeedback } from '../feedback/typedFeedback.service';
import type { FeedbackReasonCode } from '../feedback/feedbackContract';
import type { ConciergeHomeView } from '../../productFramework/conciergeHome.contract';
import { propertyScopeForAskRouting, resolveAskRoutingCascade, type AskRoutingDecision } from './askRoutingCascade';
import { resolveAskFollowUpMessage } from './askFollowUpContext';
import { conciergeLandingSubjectKey, inventoryDecisionQuestion, selectConciergeLandingSpotlight, selectInventoryDecisionCandidate } from './askConciergePromptPolicy';
import { formatAskMaintenanceDescription, formatAskMaintenanceScope, formatAskMaintenanceTitle } from './askMaintenancePresentation';
import { suppressRepeatedAskSuggestions } from './askSuggestionPolicy';
import { enterAskExecutionContext, getAskPropertyTimezone } from './askExecutionContext';
import { synthesizeAskResult } from './askResultSynthesis.service';
import { getSkillDefinition, getSkillForOperation, resolveEffectiveSkillOperationPolicy } from '../skills/skillRegistry';
import { ASK_CAPABILITY_UNIQUE_OPERATION, ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import { resolveHierarchicalSkillRouting, type SkillRoutingOutcome } from '../skills/skillRouter';
import { getSkillAdapter } from '../skills/adapters/skillAdapterRegistry';
import { buildSkillExecutionBinding, validateSkillExecutionBinding } from '../skills/skillExecutionBinding';
import { buildSkillExecutionTelemetry, createSkillExecutionTimingTrace, type SkillExecutionTimingTrace } from '../skills/skillExecutionTelemetry';
import { resolveSkillHandoffSuggestion } from '../skills/skillHandoff';
import { getSkillLineageMetadata } from '../skills/skillLineageRegistry';
import { buildFocusedHomeActionGuidance, focusedHomeActionCategory, focusedHomeActionQuestion, focusedOperationForLaunchContext } from './askFocusedGuidance';
import { lifecyclePromptsFor } from './askLifecyclePromptPolicy';
import { applyAskAudiencePresentation } from './askAudiencePresentation';
import { resolveAskAudienceContext } from './askAudienceContext';
import { extractMaintenanceTaskTitle, isMeaningfulMaintenanceTaskTitle } from './askMaintenanceTaskInput';
import { buildSeasonalMaintenanceResult } from './askSeasonalMaintenance';
import { validateAskAnswerTrustPipeline, validateAskConfirmedCompletion } from './askAnswerTrustValidator';
import { requiredAskTargetEntity, resolveAskEntityState } from './askEntityResolution';
import { attachAskAuthoritativeSourceEvidence, includeAskContextSourceEvidence } from './askAnswerTrustPolicy';
import type { AskAuthoritativeSourceEvidence } from './askTrust.contract';
import { askOperationSemanticIndexVersion, normalizeAskMessage, retrieveAskOperationCandidates } from './askSemanticRouter';
import { isIncompleteInventoryRequest } from './askInventoryIntent';
import { resolveAskEnvelopeQueryScope } from './askEnvelopeQueryScope';
import { ClaimsService } from '../claims/claims.service';
import type { ClaimStatus, ClaimType } from '../../types/claims.types';
import { isValidTransition as isValidClaimTransition } from '../claims/claims.transitions';
import { acceptFindingAsWork, dismissFinding, resolveFinding } from '../inspectionHub.service';
import { applyWriteBacks } from '../inspectionWriteBack.service';
import { MaterialSpecService } from '../materialSpec.service';
import { computeBriefStaleness, listPropertyBriefs } from '../../propertyBrief/propertyBrief.service';
import { PROPERTY_BRIEF_TEMPLATES } from '../../propertyBrief/propertyBrief.contracts';
import { confirmPolicyFact } from '../insurancePolicyRecord.service';
import { listWorkItems } from '../../modules/homeOperations/application/listWorkItems.usecase';
import { transitionWorkItem } from '../../modules/homeOperations/application/transitionWorkItem.usecase';
import { assertUserWorkItemTransition } from '../../modules/homeOperations/domain/userGovernance';
import { snoozeWorkItem } from '../../modules/homeOperations/application/snoozeWorkItem.usecase';
import { completeAcceptedOperationalWorkItem } from '../homeActionCompletion.service';
import { resolveWorkItemRecommendationSnapshotId } from '../decisionPlatform/homeActionDecisionLineage';
import './handlers/statusBoard.handler';
export { HOME_EVENT_VISIBILITY_MESSAGE, InspectionResolutionSchema, isCapitalTimelineAnalysisStale, isValidDateEditInput, parseCapitalTimelineHorizonRequest, preservedExecutionHistory } from './askHandlerSupport';
import './handlers/homeActions.handler';
import './handlers/propertySummary.handler';
import './handlers/capitalPlanning.handler';
import './handlers/inspection.handler';
import './handlers/documents.handler';
import './handlers/quotes.handler';
import './handlers/refinance.handler';
import './handlers/homeRecordWrites.handler';
import './handlers/sellHoldRent.handler';
import './handlers/inventory.handler';
import './handlers/savingsOwnership.handler';
import './handlers/coverage.handler';
import './handlers/claims.handler';
import './handlers/homeEventRadar.handler';
import './handlers/hvacDecision.handler';
import './execution/executeOperation';
import './handlers/buyerPlan.handler';
import './handlers/maintenance.handler';
import './handlers/hoaCompliance.handler';
import './handlers/guidanceOverview.handler';
import './handlers/propertyBrief.handler';
import './handlers/homeTimeline.handler';
import './handlers/materialSpecs.handler';
import './handlers/applianceOracleBudget.handler';
import './handlers/doNothingSimulator.handler';
import './handlers/priceFinalization.handler';
import './handlers/negotiationShield.handler';
import './handlers/homeUpgradePlanner.handler';
import './handlers/diyProjectCenter.handler';
import './handlers/projectTracker.handler';
import './handlers/servicePriceRadar.handler';
import './handlers/aroundYourHome.handler';
import './handlers/homeRiskReplay.handler';
import './handlers/homeHabitCoach.handler';
import './handlers/homeDigitalWill.handler';
import './handlers/plantAdvisor.handler';
export { executeOperationCore, executeOperation, refreshAskExecutionAfterConflict, refreshAskSourceExecution, ASK_MUTATION_IMPACT_MAP, siblingOperationIdsForBuyerTaskMutation, selectSiblingRefreshTargets, capReconciledChildExecutions, reconcileAskExecutionSideEffects } from './execution/executeOperation';
export { oracleApplianceLabel, oracleLifespanItem, applianceFailureRiskFromView, maintenanceBudgetFromView } from './handlers/applianceOracleBudget.handler';
export { neighborhoodChangeFeedFromView } from './handlers/aroundYourHome.handler';
export { buyerTaskConflictDescription, buyerFindingConflictDescription, buyerPlanHref, buyerJourneyStageLabel, parseBuyerDeadlineLaneFilter, selectBuyerDeadlineMilestones, buildBuyerDeadlinesViewState, BUYER_TASK_ITEM_ACTIONS, buyerTaskItemActions, buyerDeadlineTaskRow, buyerTaskVersion, buyerClosingDayProgress } from './handlers/buyerPlan.handler';
export { capitalTimelineBlock, renovationReadinessProgress } from './handlers/capitalPlanning.handler';
export { claimConflictDescription, CLAIM_TYPE_PATTERNS, ClaimFileWorkflowInputSchema, claimFileResult, incidentContinuationFromRecords, CLAIM_TRANSITION_ACTIONS, claimItemActions } from './handlers/claims.handler';
export { coverageComparisonStrip } from './handlers/coverage.handler';
export { DIY_ACTIVE_STATUSES, diyProjectsFromView } from './handlers/diyProjectCenter.handler';
export { doNothingSimulationFromView } from './handlers/doNothingSimulator.handler';
export { guidanceJourneysFromView } from './handlers/guidanceOverview.handler';
export { hoaComplianceFromView } from './handlers/hoaCompliance.handler';
export { isAllPropertyAttentionRequest, buildAllPropertyHomeActionSection, formatUnavailableHomeActionProducers, homeActionShelfFacts } from './handlers/homeActions.handler';
export { digitalWillHandoffProgress, digitalWillFromView } from './handlers/homeDigitalWill.handler';
export { parseRadarFeedFilters, radarFeedFilterMessage, RADAR_STATE_MESSAGES, RADAR_MARK_DONE_MESSAGE, RADAR_FEEDBACK_MESSAGE, RADAR_TASK_MESSAGE, RADAR_PREFERENCES_MESSAGE, RADAR_USER_STATE_LABEL, RADAR_FEEDBACK_OPTIONS, radarEventHref, radarEventItemActions, radarStateTransition, radarStateContextVersion, homeEventRadarStateResult, radarFeedbackConfirmation, RADAR_FEEDBACK_REVIEW_BODY, radarConfirmError, radarWriteReceipt, RADAR_TASK_CAPTURE_KEY, RADAR_PREFERENCES_CAPTURE_KEY, radarZonedWallClockToUtc, radarDateTimeLabel, radarTaskContextVersion, radarCaptureError, radarTaskFormResult, RADAR_TASK_CONFIRM_ERRORS, radarPreferencesContextVersion, radarPreferencesBodyFromAnswer, radarPreferenceLabels, radarPreferencesFormResult, RadarFeedLifecycleFilter, RadarFeedFamilyFilter, RadarFeedFilterState, RadarStateRequest } from './handlers/homeEventRadar.handler';
export { HOME_HABITS_ASK_LIMIT, homeHabitsFromView } from './handlers/homeHabitCoach.handler';
export { householdService, householdWorkflowVersion, householdInvitationResult, homeEventCorrectionValueError, homeEventFieldCurrent, homeEventFieldPatch, homeEventLinkOptions, homeEventCorrectionBlocker, homeEventContextVersion, homeEventCorrectionConfirmation, homeEventVisibilityBlocker, homeEventVisibilityConfirmation, WARRANTY_CORRECTION_FIELDS, warrantyCorrectionValueError, warrantyFieldCurrent, warrantyFieldPatch, warrantyContextVersion, warrantyCorrectionItemActions, warrantyCorrectionConfirmation, warrantyAddResult, eventAddResult, evidenceAttachResult, roomTypeLabel, ROOM_CORRECTION_FIELDS, roomFieldCurrent, roomFieldDisplay, roomContextVersion, roomCorrectionValueError, roomCorrectionNormalized, roomRenameItemActions, roomRenameConfirmation, EVENT_ADD_MESSAGE, WARRANTY_ADD_MESSAGE, ROOM_ADD_MESSAGE, ROOM_CREATE_CAPTURE_KEY, roomCreateContextVersion, roomCreateResult, homeEventsServiceForCapture } from './handlers/homeRecordWrites.handler';
export { pastHazardExposureFromView } from './handlers/homeRiskReplay.handler';
export { HOME_TIMELINE_ASK_LIMIT, roomMapFacts, homeTimelineCategory, homeTimelinePlacement, homeTimelineFromView } from './handlers/homeTimeline.handler';
export { homeUpgradeComparison, homeUpgradeScenariosFromView } from './handlers/homeUpgradePlanner.handler';
export { hvacDecisionStartContextVersion, hvacDecisionThreadVersionFingerprint, HVAC_VERDICT_RANK, hvacDecisionStartResult, hvacSpecialistEngageResult, HvacSpecialistEngageDependencies } from './handlers/hvacDecision.handler';
export { INSPECTION_FINDING_ACTIONS, inspectionFindingItemActions, inspectionFindingActionAllowed, inspectionFindingItemActionsFor, INSPECTION_FINDING_BATCH_ACTIONS, INSPECTION_FINDING_DECK_PRESENTATION, inspectionFindingDeckFacts, inspectionHubHref, INSPECTION_RESOLUTION_DEFAULT, inspectionResolutionEditableFields, inspectionFindingVersion } from './handlers/inspection.handler';
export { inventoryService, inventoryCategoryLabel, INVENTORY_CORRECTION_NO_ROOM_VALUE, INVENTORY_CORRECTION_FIELDS, INVENTORY_ROOM_LINK_FIELD, inventoryFieldCurrent, inventoryFieldValueError, inventoryRoomLinkOptions, inventoryCorrectionCombinedBlocker, inventoryFieldNormalized, inventoryFieldPatch, inventoryFieldDisplay, inventoryItemContextVersion, inventoryCorrectionItemActions, inventoryCorrectionConfirmation, INVENTORY_ADD_MESSAGE, INVENTORY_CREATE_CAPTURE_KEY, INVENTORY_NO_ROOM_VALUE, inventoryAddItemAction, inventoryCreateRooms, inventoryCreateContextVersion, inventoryCreateBlocker, inventoryItemCreateResult } from './handlers/inventory.handler';
export { maintenanceMoney, maintenanceWorkflowVersion, extractMaintenanceDueDate, maintenanceTaskCreateResult, maintenanceTaskVersion, maintenanceConflictDescription, maintenanceCompletionMatch, extractMaintenanceCompletionInput, maintenanceTaskCompleteResult, maintenanceUpdateAction, maintenanceUpdateSubject, maintenanceTaskUpdateResult, maintenanceMonitorSubject, loadAskViewState, mergeMaintenanceViewContinuation, maintenanceOpenTimingGroups, maintenanceShelfFacts, resolveMaintenanceCollectionOffset, maintenanceResult } from './handlers/maintenance.handler';
export { materialSpecsFromView } from './handlers/materialSpecs.handler';
export { NEGOTIATION_SHIELD_ASK_LIMIT, negotiationShieldCasesFromView } from './handlers/negotiationShield.handler';
export { plantCareOutlookFromView } from './handlers/plantAdvisor.handler';
export { PRICE_FINALIZATION_ASK_LIMIT, priceFinalizationsFromView } from './handlers/priceFinalization.handler';
export { trackedProjectsFromView } from './handlers/projectTracker.handler';
export { propertyBriefsFromView } from './handlers/propertyBrief.handler';
export { propertyCompletenessProgress, areaCaptureRowActions, areaCaptureStateFrom, AreaCaptureAnswerSchema, areaCaptureError, areaCapturePrompt, areaCaptureSubmitResult } from './handlers/propertySummary.handler';
export { areaCaptureFallbackHref } from './askHandlerSupport';
export { quoteWorkspaceContextVersion, quoteComparisonWorkspaceHref, QUOTE_LOWEST_PRICE_BADGE, quoteReviewComparison } from './handlers/quotes.handler';
export { refinanceMonitorContextVersion, parseRefinanceScenarioEdit, refinanceMonitorBlock, breakEvenHorizonYears, breakEvenAnalysisFromDto, refinanceScenarioComparison } from './handlers/refinance.handler';
export { SALE_READINESS_ITEM_STATUS_LABELS, sellHoldRentComparison, sellerPrepShelfFacts, SELLER_PREP_ITEM_ACTIONS, sellerPrepItemActions, saleCaseHref, sellerPrepItemContextVersion } from './handlers/sellHoldRent.handler';
export { SERVICE_PRICE_RADAR_ASK_LIMIT, servicePriceChecksFromView } from './handlers/servicePriceRadar.handler';
export { STATUS_BOARD_ASK_LIMIT, statusBoardShelfFacts, statusBoardMeta, statusBoardFromView } from './handlers/statusBoard.handler';

const replaceRepairService = new ReplaceRepairService();
const materialSpecService = new MaterialSpecService();




function stableSkillRoutingReasonCode(outcome: SkillRoutingOutcome): string | null {
  if (outcome === 'UNSUPPORTED') return 'ASK_SKILL_UNSUPPORTED';
  if (outcome === 'AMBIGUOUS_SKILL' || outcome === 'AMBIGUOUS_OPERATION') return 'ASK_SKILL_AMBIGUOUS';
  return null;
}

const RefinanceProfileCaptureSchema = z.object({
  currentMortgageBalanceUsd: z.number().min(1_000).max(100_000_000),
  interestRatePct: z.number().positive().max(30),
  remainingTermYears: z.number().positive().max(50),
  monthlyPaymentUsd: z.number().positive().max(1_000_000).optional(),
}).strict();








const GuidanceJourneyCommandInputSchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']),
  scopeId: z.string().trim().min(1).max(160),
  issueType: z.string().trim().min(1).max(160),
  inventoryItemId: z.string().trim().min(1).max(160).nullable(),
  serviceKey: z.string().trim().min(1).max(160).nullable(),
  label: z.string().trim().min(1).max(240),
}).strict();

const HomeDeadlineMonitorInputSchema = z.object({
  sourceType: z.enum(['WARRANTY', 'INSURANCE_POLICY', 'MAINTENANCE']),
  sourceId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(3).max(160),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: z.number().int().min(1).max(90),
}).strict();

const HomeDeadlineExpirationCaptureSchema = z.object({
  policyId: z.string().trim().min(1).max(160),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const expiry = new Date(`${value.expiryDate}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== value.expiryDate || expiry <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: 'Enter a valid future expiration date.' });
  }
});

const HomeDeadlineTaskDueCaptureSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate || due <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid future due date.' });
  }
});

const HvacDecisionStartInputSchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(160),
}).strict();

const HvacDecisionScenarioInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  quoteAmountCents: z.number().int().positive(),
  vendorLabel: z.string().trim().min(1).max(160),
}).strict();

const HvacDecisionAbandonInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
}).strict();

// Ask Intelligence FRD Phase 10A (§19.2's homeowner-report source).
const HvacDecisionOutcomeReportInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  actionState: z.enum(['STARTED', 'COMPLETED']),
  costCents: z.number().int().nonnegative().nullable(),
  note: z.string().trim().max(500).nullable(),
}).strict();

const HvacDecisionOutcomeUnlinkInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  outcomeObservationId: z.string().trim().min(1).max(160),
}).strict();






function askFailureStatus(error: unknown): Extract<AskExecutionStatus, 'FAILED_RETRYABLE' | 'FAILED_TERMINAL'> {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  if (error instanceof z.ZodError || code === 'ASK_PERMISSION_REQUIRED' || code === 'ASK_PROPERTY_NOT_FOUND'
    || (error instanceof Error && /undeclared block type|invalid configuration|invariant/i.test(error.message))) return 'FAILED_TERMINAL';
  return 'FAILED_RETRYABLE';
}

// A typed ERROR_STATE block for an execution-phase failure, so the caller
// gets a durably persisted, renderable response instead of a bare thrown
// error the homeowner-visible conversation has no record of. Without a
// stored result, mapPersistedExecution falls back to blocks: [] and a
// later reload (or the failed attempt never being added to the frontend's
// conversation state at all, since the request itself failed) renders as
// an empty card with no way to retry.
function askFailureBlocks(error: unknown, retryable: boolean): AskPresentationBlock[] {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  const { title, body } = code === 'AI_TIMEOUT'
    ? { title: 'Ask timed out', body: 'Ask timed out while contacting its guidance provider. Record-based operations remain available.' }
    : code === 'AI_CIRCUIT_OPEN' || code === 'AI_UPSTREAM_ERROR' || code === 'AI_EMPTY_RESPONSE'
      ? { title: 'Guidance temporarily unavailable', body: 'Generated guidance is temporarily unavailable. Record-based Ask operations remain available.' }
      : { title: 'Ask could not complete this request', body: 'No changes were made. Your question is preserved below — you can try again.' };
  return [{ type: 'ERROR_STATE', id: 'execution-failed', title, body, retryable, actions: [] }];
}




async function guidanceJourneyContextVersion(propertyId: string, input: z.infer<typeof GuidanceJourneyCommandInputSchema>): Promise<string> {
  if (input.inventoryItemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId }, select: { id: true, updatedAt: true } });
    return askContextFingerprint(item ? [item.id, item.updatedAt.toISOString()] : ['missing', input.inventoryItemId]);
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, updatedAt: true } });
  return askContextFingerprint([property?.id ?? propertyId, property?.updatedAt?.toISOString() ?? 'missing', input.serviceKey]);
}







// Sets the property timezone that humanDate() implicitly reads for the
// remainder of this request, instead of always formatting in UTC.
async function enterAskPropertyTimezoneContext(propertyId: string | null | undefined): Promise<void> {
  const property = propertyId ? await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }) : null;
  enterAskExecutionContext({ propertyTimezone: property?.timezone });
}




















function homeDeadlineSourceVersion(source: { id: string; expiryDate: Date | null; updatedAt: Date }): string {
  return createHash('sha256').update(JSON.stringify({ id: source.id, expiryDate: source.expiryDate, updatedAt: source.updatedAt })).digest('hex');
}









export function saleReadinessItemConflictDescription(item: { title: string; status: string }): string {
  const statusLabel = SALE_READINESS_ITEM_STATUS_LABELS[item.status] ?? item.status.toLowerCase().replace(/_/g, ' ');
  return `"${item.title}" changed in another session before this could be confirmed -- it is now ${statusLabel}. Review its current state and try again.`;
}
















async function guidanceJourneyCreateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const inventory = await prisma.inventoryItem.findMany({ where: { propertyId }, select: { id: true, name: true }, take: 100 });
  const lower = message.toLowerCase();
  const item = inventory.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  let input: z.infer<typeof GuidanceJourneyCommandInputSchema> | null = null;
  if (item) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'ITEM', scopeId: item.id, issueType: /replace|end of life|aging/i.test(message) ? 'near_end_of_life' : /leak/i.test(message) ? 'leak' : 'maintenance_needed', inventoryItemId: item.id, serviceKey: null, label: item.name });
  else if (/warranty/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'warranty_purchase', issueType: /renew/i.test(message) ? 'warranty_renewal' : 'purchase_warranty', inventoryItemId: null, serviceKey: 'warranty_purchase', label: 'Home warranty' });
  else if (/insurance|coverage/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'insurance_purchase', issueType: /renew/i.test(message) ? 'policy_renewal' : /compare|quote/i.test(message) ? 'compare_rates' : 'purchase_insurance', inventoryItemId: null, serviceKey: 'insurance_purchase', label: 'Home insurance' });
  else if (/clean/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'cleaning_service', issueType: 'arrange_cleaning', inventoryItemId: null, serviceKey: 'cleaning_service', label: 'Cleaning service' });
  else if (/inspect/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'general_inspection', issueType: 'schedule_inspection', inventoryItemId: null, serviceKey: 'general_inspection', label: 'Home inspection' });
  if (!input) return {
    status: 'NEEDS_ENTITY', reasonCode: 'GUIDANCE_JOURNEY_SCOPE_REQUIRED',
    ...durableFreeTextClarification('GUIDANCE_JOURNEY_CREATE', 'What recorded item or approved home service should the guided plan cover?'),
    blocks: [{ type: 'SUMMARY', id: 'journey-scope', title: 'What should the guided plan cover?', body: 'Name a recorded appliance/system, warranty, insurance decision, inspection, or cleaning need. Ask will not start an ungrounded workflow.', tone: 'CAUTION', actions: [] }],
    suggestions: inventory.slice(0, 3).map((candidate) => `Start a guided plan for ${candidate.name}`),
  };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = await guidanceJourneyContextVersion(propertyId, input);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'GUIDANCE_JOURNEY_CONFIRMATION_REQUIRED', contextVersion, parameters: { guidanceJourney: input, guidanceJourneyContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'journey-review', title: 'Review this guided plan', body: 'No journey has been started yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `guidance-journey-${propertyId}-1`, version: 1, title: `Start a guided plan for ${input.label}?`, description: 'This creates a canonical, resumable guidance journey for the selected home.', fields: [{ label: 'Scope', value: input.label }, { label: 'Plan type', value: input.issueType.replace(/_/g, ' ') }], editableFields: [], confirmLabel: 'Start guided plan', consentText: 'I authorize creating this guided plan in the shared home record.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function homeDeadlineMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const leadDays = Math.min(90, Math.max(1, Number(message.match(/(\d{1,2})\s*days?\s*(?:before|ahead)/i)?.[1] ?? 30)));
  const warrantyFocus = /warrant/i.test(message);
  const insuranceFocus = /insurance|policy|coverage/i.test(message);
  const maintenanceFocus = /maintenance|task/i.test(message) && !warrantyFocus && !insuranceFocus;
  if (maintenanceFocus) {
    const openTasks = (await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: false }))
      .filter((task) => task.status !== MaintenanceTaskStatus.CANCELLED);
    const matchedTask = maintenanceCompletionMatch(maintenanceMonitorSubject(message), openTasks);
    const tasks = openTasks.filter((task) => task.nextDueDate);
    const selected = matchedTask?.nextDueDate ? matchedTask : null;
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
    if (matchedTask && !matchedTask.nextDueDate) {
      const contextVersion = await maintenanceWorkflowVersion(propertyId);
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_MONITOR_DUE_DATE_REQUIRED', contextVersion,
        parameters: { maintenanceWorkflowVersion: contextVersion },
        blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-date', title: `Add a due date for ${matchedTask.title}`, body: 'The task is recorded but cannot drive a real reminder until it has a future due date. Add it here and Ask will continue to reminder confirmation.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(matchedTask.id)}`, style: 'SECONDARY' }] }],
        captureRequests: [{ requirementId: `maintenance-monitor-date-${contextVersion.slice(0, 20)}`, captureKey: 'HOME_DEADLINE_MAINTENANCE_DUE_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Maintenance due date', question: `When is ${matchedTask.title} due?`, helpText: 'The date is saved to the canonical Maintenance task and reused by Home Actions and reminder workflows.', inputSchema: { type: 'GROUP', fields: [{ key: 'taskId', label: 'Task', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: matchedTask.title, value: matchedTask.id }] } }, { key: 'nextDueDate', label: 'Due date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } }] }, currentAnswer: { taskId: matchedTask.id }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected Maintenance task', confirmationText: null, expectedContextVersion: contextVersion }],
        suggestions: [],
      };
    }
    if (!selected) return {
      status: 'NEEDS_ENTITY', reasonCode: 'MAINTENANCE_MONITOR_TASK_REQUIRED',
      ...durableFreeTextClarification('HOME_DEADLINE_MONITOR', 'Which dated maintenance task should Ask monitor?'),
      blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'maintenance-monitor-options', title: 'Choose a dated maintenance task', description: tasks.length ? 'Use the exact task title in your next message. No notification preference has changed.' : 'No open maintenance task with a due date is recorded yet. Add or schedule the task first.', sections: [{ id: 'tasks', title: 'Dated maintenance tasks', count: tasks.length, items: tasks.slice(0, 20).map((task) => ({ id: task.id, title: task.title, description: `Due ${humanDate(task.nextDueDate)}`, meta: [task.priority], status: task.status, href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}` })) }], actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'PRIMARY' }] }],
      suggestions: tasks.slice(0, 3).map((task) => `Remind me when ${task.title} is due`),
    };
    const input = HomeDeadlineMonitorInputSchema.parse({ sourceType: 'MAINTENANCE', sourceId: selected.id, title: selected.title, dueDate: selected.nextDueDate!.toISOString().slice(0, 10), leadDays: 7 });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_MONITOR_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(selected),
      parameters: { homeDeadlineMonitor: input, maintenanceTaskVersion: maintenanceTaskVersion(selected), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
      blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-review', title: 'Review maintenance reminders', body: 'The existing dated task already drives in-app reminders. Confirming enables scoped email delivery; it does not create a duplicate task.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(selected.id)}`, style: 'SECONDARY' }] }],
      confirmation: { confirmationId: `maintenance-monitor-${selected.id}-1`, version: 1, title: `Enable reminders for ${selected.title}?`, description: 'The governed reminder worker checks dated maintenance tasks inside its seven-day horizon.', fields: [{ label: 'Task', value: selected.title }, { label: 'Due', value: humanDate(selected.nextDueDate) ?? input.dueDate }, { label: 'Delivery', value: 'In-app plus email' }, { label: 'Reminder window', value: 'Within 7 days of the due date' }], editableFields: [], confirmLabel: 'Enable reminders', consentText: 'I consent to receive maintenance deadline reminders by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
    };
  }
  const [warranty, policy, policiesMissingExpiry] = await Promise.all([
    warrantyFocus ? prisma.warranty.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findMany({ where: { propertyId, expiryDate: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, carrierName: true, coverageType: true, updatedAt: true } }) : [],
  ]);
  const source = warranty ?? policy;
  if (!source) {
    const contextVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'EXPIRATION_DATE_REQUIRED', contextVersion,
      parameters: { homeDeadlineCaptureVersion: contextVersion },
      blocks: [{ type: 'SUMMARY', id: 'deadline-source-missing', title: 'Add the expiration date first', body: policiesMissingExpiry.length
        ? 'The policy is recorded, but its expiration date is missing. Add it here and Ask will immediately continue to the reminder review.'
        : 'No future expiration or editable undated policy is recorded. Add the coverage record first, then return to activate a real reminder.', tone: 'CAUTION', actions: [{ id: 'open-coverage', label: 'Review coverage records', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'SECONDARY' }] }],
      captureRequests: policiesMissingExpiry.length ? [{
        requirementId: `home-deadline-expiry-${contextVersion.slice(0, 20)}`,
        captureKey: 'HOME_DEADLINE_EXPIRATION_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Policy expiration date', question: 'Which policy should be monitored, and when does it expire?',
        helpText: 'This date is saved to the canonical insurance policy, then reused by Coverage and reminder workflows.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'policyId', label: 'Policy', required: true, inputSchema: { type: 'SINGLE_SELECT', options: policiesMissingExpiry.map((candidate) => ({ label: `${candidate.carrierName}${candidate.coverageType ? ` — ${candidate.coverageType}` : ''}`, value: candidate.id })) } },
          { key: 'expiryDate', label: 'Expiration date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
        ] },
        currentAnswer: policiesMissingExpiry.length === 1 ? { policyId: policiesMissingExpiry[0].id } : {},
        allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected insurance policy', confirmationText: null,
        expectedContextVersion: contextVersion,
      }] : [], suggestions: [],
    };
  }
  try {
    await assertCoverageConflictFree(propertyId, prisma, warranty
      ? { warrantyId: warranty.id }
      : { insurancePolicyId: policy!.id });
  } catch (error) {
    const details = (error as { details?: { resolutionPath?: string } }).details;
    return {
      status: 'NEEDS_CONTEXT',
      reasonCode: 'COVERAGE_CONFLICT_REVIEW_REQUIRED',
      contextVersion: createHash('sha256').update(`coverage-conflict:${source.id}`).digest('hex'),
      parameters: {},
      blocks: [{
        type: 'SUMMARY', id: 'coverage-conflict', title: 'Resolve the coverage conflict first',
        body: 'Two records disagree, so Ask will not choose one for an expiration reminder. Review both sources and select the correct record.',
        tone: 'CAUTION',
        actions: [{ id: 'resolve-coverage-conflict', label: 'Resolve coverage conflict', href: details?.resolutionPath ?? '/dashboard/insurance', style: 'PRIMARY' }],
      }],
      captureRequests: [], suggestions: [],
    };
  }
  const expiry = source.expiryDate!;
  const due = new Date(expiry.getTime() - leadDays * 86_400_000);
  const sourceType = warranty ? 'WARRANTY' as const : 'INSURANCE_POLICY' as const;
  const provider = warranty ? warranty.providerName : policy!.carrierName;
  const input = HomeDeadlineMonitorInputSchema.parse({ sourceType, sourceId: source.id, title: `Review ${provider} ${warranty ? 'warranty' : 'insurance policy'} before expiration`, dueDate: due.toISOString().slice(0, 10), leadDays });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DEADLINE_MONITOR_CONFIRMATION_REQUIRED', parameters: { homeDeadlineMonitor: input, homeDeadlineSourceVersion: homeDeadlineSourceVersion(source), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'deadline-monitor-review', title: 'Review this expiration reminder', body: 'Ask will create a dated canonical Maintenance obligation so the existing governed reminder worker can notify you.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `home-deadline-${source.id}-1`, version: 1, title: `Monitor this ${warranty ? 'warranty' : 'policy'} expiration?`, description: 'This creates one deduplicated reminder task and enables expiration-deadline email preferences for this home. It does not change maintenance-task email preferences.', fields: [{ label: 'Provider', value: provider }, { label: 'Expires', value: expiry.toISOString().slice(0, 10) }, { label: 'Reminder date', value: input.dueDate }, { label: 'Channel', value: 'In-app plus email' }], editableFields: [], confirmLabel: 'Activate reminder', consentText: 'I consent to receive this expiration-deadline reminder by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}


















function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

async function replacementGuidanceResult(userId: string, propertyId: string, message: string, focusedInventoryItemId: string | null | undefined, executionId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const allItems = await prisma.inventoryItem.findMany({
    where: { propertyId }, orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }], take: 200,
    select: { id: true, name: true, category: true, assetType: true, brand: true, model: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true, updatedAt: true },
  });
  const query = message.toLowerCase().replace(/\b(?:when|should|i|we|repair|replace|replacement|versus|vs|my|our|the|is|it|time|good|to|do)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = /\b(?:hvac|furnace|air conditioner|heat pump)\b/i.test(message) ? ['hvac', 'furnace', 'air conditioner', 'heat pump']
    : /\b(?:refrigerator|fridge)\b/i.test(message) ? ['refrigerator', 'fridge']
      : /\bwater heater\b/i.test(message) ? ['water heater']
        : /\b(?:roof|roofing)\b/i.test(message) ? ['roof']
          : /\b(?:washer|washing machine)\b/i.test(message) ? ['washer', 'washing machine']
            : /\bdryer\b/i.test(message) ? ['dryer']
              : /\bdishwasher\b/i.test(message) ? ['dishwasher'] : query ? [query] : [];
  const itemText = (item: typeof allItems[number]) => [item.name, item.category, item.assetType, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
  const items = focusedInventoryItemId
    ? allItems.filter((item) => item.id === focusedInventoryItemId)
    : aliases.length ? allItems.filter((item) => aliases.some((alias) => itemText(item).includes(alias) || alias.includes(item.name.toLowerCase()))) : [];
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'repair-replace-no-item', title: 'Choose a recorded appliance or home system first',
        body: `I could not resolve this request to one canonical inventory item. Ask will not manufacture a repair/replace calculation without the item’s condition, lifecycle, cost, and repair history.${allItems.length ? ` This home has ${allItems.length} recorded item${allItems.length === 1 ? '' : 's'}.` : ''}`,
        tone: 'CAUTION',
        actions: [{ id: 'open-inventory', label: allItems.length ? 'Choose from inventory' : 'Add an inventory item', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: allItems.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REPAIR_REPLACE_ITEMS',
      ...durableFreeTextClarification('REPLACEMENT_GUIDANCE', 'Which recorded appliance or home system should Ask analyze?'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'repair-replace-selection', title: 'Which item should I analyze?',
        description: 'Use the item’s exact name, room, brand, or model. Ask will not combine separate systems into one verdict.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: [item.brand, item.model].filter(Boolean).join(' ') || null, status: item.condition, meta: [item.category.toLowerCase().replace(/_/g, ' ')],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?openItemId=${encodeURIComponent(item.id)}`,
        })) }], actions: [],
      }],
      suggestions: items.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }

  const item = items[0];
  if (item.category === 'HVAC') {
    return hvacDecisionStartResult(userId, propertyId, message, executionId, item.id);
  }
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = access.role === HouseholdRole.VIEWER ? [] : evaluation.requirements.slice(0, 1).map((requirement) => ({
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Record',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }));
  const analysis = await replaceRepairService.runItemAnalysis(propertyId, item.id, userId, undefined, evaluation.contextVersion);
  const verdict = analysis.verdict.toLowerCase().replace(/_/g, ' ');
  const rows = [
    { id: 'repair', values: { path: 'Estimated next repair', amount: analysis.estimatedNextRepairCostCents == null ? 'Not available' : money(analysis.estimatedNextRepairCostCents / 100), meaning: 'Modeled from category defaults, condition, and recorded repair history' } },
    { id: 'replace', values: { path: 'Estimated replacement', amount: analysis.estimatedReplacementCostCents == null ? 'Not available' : money(analysis.estimatedReplacementCostCents / 100), meaning: 'Planning estimate—not a contractor or retailer quote' } },
    { id: 'risk', values: { path: 'Annual repair risk', amount: analysis.expectedAnnualRepairRiskCents == null ? 'Not available' : money(analysis.expectedAnnualRepairRiskCents / 100), meaning: 'Probability-weighted planning exposure' } },
  ];
  return {
    status: captureRequests.length || analysis.confidence !== 'HIGH' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : analysis.confidence !== 'HIGH' ? 'REPAIR_REPLACE_CONFIDENCE_LIMITED' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'repair-replace-guidance', title: `${item.name}: ${verdict}`,
      body: `${analysis.summary ?? `The canonical model currently indicates ${verdict}.`} Confidence is ${analysis.confidence.toLowerCase()}.${analysis.breakEvenMonths == null ? '' : ` Modeled break-even is about ${analysis.breakEvenMonths} months.`}`,
      tone: ['REPLACE_NOW', 'REPLACE_SOON'].includes(analysis.verdict) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }, { type: 'TABLE', id: 'repair-replace-costs', title: 'Modeled decision inputs', description: 'Amounts are planning estimates from the canonical Repair vs Replace engine.', columns: [{ key: 'path', label: 'Measure' }, { key: 'amount', label: 'Amount' }, { key: 'meaning', label: 'How to interpret it' }], rows, actions: [] },
    { type: 'GROUPED_LIST', filters: [], id: 'repair-replace-trace', title: 'Why the model reached this result', description: 'Decision factors are bounded to the item and its recorded history.', sections: [{ id: 'factors', title: 'Decision factors', count: analysis.decisionTrace.length, items: analysis.decisionTrace.slice(0, 12).map((factor, index) => ({ id: `factor-${index}`, title: factor.label, description: factor.detail, meta: [factor.impact], status: null, href: null })) }], actions: [] },
    { type: 'EVIDENCE', id: 'repair-replace-evidence', title: 'Record and model freshness', items: [{ label: item.name, source: 'Living Home Record and Repair vs Replace engine', observedAt: analysis.computedAt }] },
    { type: 'BOUNDARY', id: 'repair-replace-boundary', title: 'Planning guidance—not a diagnosis or quote', body: 'A qualified technician should diagnose safety, performance, and repairability. Actual repair and replacement prices, efficiency gains, warranties, and code requirements may differ.', severity: 'INFO', suggestions: [] }],
    suggestions: ['How much should I reserve for this item?', 'Show my capital timeline'],
  };
}

// Ask Intelligence FRD Phase 8A — HVAC Decision Thread foundation. Distinct
// from replacementGuidanceResult above: these operate on the Decision
// Platform's durable DecisionThread/RecommendationSnapshot models via the
// registered HVAC engine (services/decisionPlatform/), not the generic
// ReplaceRepairService heuristic.


function scenarioComparisonBlock(
  id: string, title: string, decisionThreadId: string, scenarioId: string,
  baseline: { label: string; verdictCode: string; reasonCodes: string[]; limitationCodes: string[] },
  scenario: { label: string; verdictCode: string; reasonCodes: string[]; limitationCodes: string[]; assumptions: { label: string; value: string }[] },
): AskPresentationBlock {
  const baselineRank = HVAC_VERDICT_RANK[baseline.verdictCode] ?? 1;
  const scenarioRank = HVAC_VERDICT_RANK[scenario.verdictCode] ?? 1;
  const comparisonDirection = scenarioRank === baselineRank
    ? 'NO_CHANGE'
    : scenarioRank > baselineRank ? 'SCENARIO_FAVORS_REPLACE' : 'SCENARIO_FAVORS_REPAIR';
  return {
    type: 'SCENARIO_COMPARISON', id, title, decisionThreadId, scenarioId,
    baseline: { label: baseline.label, verdict: baseline.verdictCode, reasonCodes: baseline.reasonCodes, limitationCodes: baseline.limitationCodes },
    scenario: { label: scenario.label, verdict: scenario.verdictCode, reasonCodes: scenario.reasonCodes, limitationCodes: scenario.limitationCodes, assumptions: scenario.assumptions },
    comparisonDirection,
    actions: [],
  };
}



// Built from a specific snapshot's own recorded preferenceReferenceIds
// (FRD §14.1 lineage), NOT a fresh "what's active right now" read -- those
// can diverge (a different household member viewing later, or the
// preference changing before a recompute runs). See
// decisionPreferenceService.getPreferenceReferenceDetails.
async function preferenceReferenceBlocksForSnapshot(idPrefix: string, preferenceReferenceIds: string[]): Promise<AskPresentationBlock[]> {
  const details = await decisionPreferenceService.getPreferenceReferenceDetails(preferenceReferenceIds);
  return details.map((detail) => ({
    type: 'PREFERENCE_REFERENCE', id: `${idPrefix}-preference-${detail.definitionId.toLowerCase().replace(/_/g, '-')}`,
    title: detail.definitionId === 'OWNERSHIP_HORIZON' ? 'Using your confirmed plan' : 'Using your confirmed preference',
    preferenceKey: detail.definitionId, summary: detail.summary, visibility: detail.visibility,
    confirmedAt: detail.confirmedAt ? detail.confirmedAt.toISOString() : null,
    expiresAt: detail.expiresAt ? detail.expiresAt.toISOString() : null,
  }));
}



































export async function editInspectionFindingResolveConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  void userId;
  const existing = InspectionResolutionSchema.safeParse(parameters.inspectionResolution);
  if (parameters.inspectionFindingAction !== 'RESOLVE' || !existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const unknownField = Object.keys(input.edits).find((key) => !['method', 'notes', 'costCents'].includes(key));
  if (unknownField) throw Object.assign(new Error('Only the resolution method, notes and cost can be edited.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next: InspectionResolution = { ...existing.data };
  if (input.edits.method !== undefined) {
    const method = InspectionResolutionSchema.shape.method.safeParse(input.edits.method.trim());
    if (!method.success) throw Object.assign(new Error('Choose one of the listed resolution methods.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.method = method.data;
  }
  if (input.edits.notes !== undefined) {
    if (input.edits.notes.trim().length > 1000) throw Object.assign(new Error('Keep the notes to 1000 characters or fewer.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.notes = input.edits.notes.trim() || null;
  }
  if (input.edits.costCents !== undefined) {
    const text = input.edits.costCents.trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw Object.assign(new Error('Enter an amount in dollars, such as 850 or 850.50.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.costCents = Math.round(Number(text) * 100);
  }
  const resolution = InspectionResolutionSchema.parse(next);
  const findingId = typeof parameters.inspectionFindingId === 'string' ? parameters.inspectionFindingId : '';
  const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, propertyId: execution.propertyId! }, select: { id: true, homeSystem: true, severity: true, inspectorDescription: true } });
  if (!finding) throw Object.assign(new Error('This inspection finding is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = {
    confirmationId: `inspection-finding-${finding.id}-${nextVersion}`, version: nextVersion, title: 'Resolve this finding?', description: finding.inspectorDescription,
    fields: [{ label: 'System', value: finding.homeSystem }, { label: 'Severity', value: String(finding.severity).toLowerCase() }, { label: 'Action', value: 'resolve' }],
    editableFields: inspectionResolutionEditableFields(resolution), confirmLabel: 'Resolve finding',
    consentText: 'I reviewed this inspection finding and authorize updating its canonical disposition.', expiresAt: expiresAt.toISOString(),
  };
  const reviewBlock = { type: 'SUMMARY' as const, id: 'inspection-finding-review', title: 'Review resolve action', body: 'Resolving records how this finding was handled on the canonical inspection record.', tone: 'CAUTION' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, inspectionResolution: resolution, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}










function operationalWorkAction(message: string): 'ACCEPT' | 'DEFER' | 'SNOOZE' | 'COMPLETE' | null {
  if (/\bcomplete|done|finished\b/i.test(message)) return 'COMPLETE';
  if (/\bsnooze|hide reminders?\b/i.test(message)) return 'SNOOZE';
  if (/\bdefer|postpone|later\b/i.test(message)) return 'DEFER';
  if (/\baccept|take this on|track this\b/i.test(message)) return 'ACCEPT';
  return null;
}

export function operationalWorkCompletionObservedResult(
  message: string,
): 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null {
  return extractMaintenanceCompletionInput(message, undefined).outcomeHealth ?? null;
}

async function operationalWorkUpdateResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const items = await listWorkItems({ propertyId });
  const selected = exactEntityMatch(items, message, launchContext);
  const action = operationalWorkAction(message);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/home-actions`;
  if (!selected || !action) return { status: 'NEEDS_ENTITY', reasonCode: 'OPERATIONAL_WORK_TARGET_REQUIRED', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'operational-work-targets', title: 'Choose tracked work and an action', description: 'Use the exact title or work-item id and say accept, defer, snooze, or complete.', sections: [{ id: 'work', title: 'Tracked Operational Work', count: items.length, items: items.slice(0, 50).map((item) => ({ id: item.id, title: item.title, description: `${String(item.state).toLowerCase().replace(/_/g, ' ')} · ${String(item.safetyTier).toLowerCase().replace(/_/g, ' ')}`, meta: [], status: String(item.state), href })) }], actions: [{ id: 'open-work', label: 'Manage Home Actions', href, style: 'SECONDARY' }] }], suggestions: [] };
  const execution = selected.executions.find((candidate) => candidate.role === 'PRIMARY');
  if (action === 'COMPLETE' && (selected.state !== 'ACCEPTED' || execution?.executionType !== 'MAINTENANCE_TASK')) return { status: 'BLOCKED', reasonCode: 'OPERATIONAL_WORK_COMPLETION_REQUIRES_DOMAIN_WORKFLOW', blocks: [{ type: 'BOUNDARY', id: 'operational-work-completion-boundary', title: 'Complete this in its linked workflow', severity: 'INFO', body: 'Quick completion is available only for accepted maintenance-backed work. Project, guidance, booking, safety, and regulated work must record evidence and completion in the linked workflow.', suggestions: [] }, { type: 'SUMMARY', id: 'operational-work-manage', title: selected.title, body: `Current state: ${String(selected.state).toLowerCase().replace(/_/g, ' ')}. No change was made.`, tone: 'CAUTION', actions: [{ id: 'open-work', label: 'Manage action', href, style: 'PRIMARY' }] }], suggestions: [] };
  const observedResult = action === 'COMPLETE'
    ? operationalWorkCompletionObservedResult(message)
    : null;
  if (action === 'COMPLETE' && !observedResult) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCode: 'OPERATIONAL_WORK_COMPLETION_RESULT_REQUIRED',
      ...durableFreeTextClarification(
        'OPERATIONAL_WORK_UPDATE',
        `After completing ${selected.title}, was it working as expected, still needing attention, or failed again?`,
      ),
      blocks: [{
        type: 'SUMMARY',
        id: 'operational-work-completion-result',
        title: `Record the result for ${selected.title}`,
        body: 'Ask will not infer a successful result from the word “complete.” State what you observed, then review the confirmation before anything changes.',
        tone: 'CAUTION',
        actions: [{ id: 'open-work', label: 'Manage action instead', href, style: 'SECONDARY' }],
      }],
      suggestions: [
        `Complete ${selected.title}; it is working as expected`,
        `Complete ${selected.title}; it still needs attention`,
        `Complete ${selected.title}; it failed again`,
      ],
    };
  }
  const targetState = action === 'ACCEPT' ? 'ACCEPTED' : action === 'DEFER' ? 'DEFERRED' : null;
  if (targetState) {
    try { assertUserWorkItemTransition(selected, targetState); } catch (error) { return { status: 'BLOCKED', reasonCode: 'OPERATIONAL_WORK_TRANSITION_NOT_ALLOWED', blocks: [{ type: 'BOUNDARY', id: 'operational-work-governance', title: 'This change belongs to the linked workflow', severity: 'INFO', body: error instanceof Error ? error.message : 'The requested transition is not available.', suggestions: [] }], suggestions: [] }; }
  }
  const until = new Date(Date.now() + (/\bnext month\b/i.test(message) ? 30 : /\bweek\b/i.test(message) ? 7 : 14) * 86_400_000);
  const contextVersion = createHash('sha256').update(`${selected.id}:${selected.state}:${selected.updatedAt.toISOString()}:${selected.snoozedUntil?.toISOString() ?? ''}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const observedResultLabel = observedResult === 'CONFIRMED_HEALTHY'
    ? 'Working as expected'
    : observedResult === 'NEEDS_ATTENTION'
      ? 'Needs attention'
      : observedResult === 'FAILED'
        ? 'Failed again'
        : null;
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'OPERATIONAL_WORK_CONFIRMATION_REQUIRED', contextVersion, parameters: { operationalWorkItemId: selected.id, operationalWorkAction: action, operationalWorkUntil: ['DEFER', 'SNOOZE'].includes(action) ? until.toISOString() : null, operationalWorkObservedResult: observedResult, operationalWorkContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() }, blocks: [{ type: 'SUMMARY', id: 'operational-work-review', title: `Review ${action.toLowerCase()} action`, body: action === 'SNOOZE' ? `Reminders will be suppressed until ${humanDate(until)} without changing the work state or due date.` : action === 'DEFER' ? `The work will move to deferred until ${humanDate(until)}.` : action === 'COMPLETE' ? 'The linked canonical maintenance task and Operational Work outcome will be completed together using the observed result shown below.' : 'The proposed work will become accepted homeowner work.', tone: 'CAUTION', actions: [{ id: 'open-work', label: 'Manage action', href, style: 'SECONDARY' }] }], confirmation: { confirmationId: `operational-work-${selected.id}-1`, version: 1, title: `${action[0]}${action.slice(1).toLowerCase()} ${selected.title}?`, description: 'Ask will recheck the current work state before applying this governed command.', fields: [{ label: 'Work', value: selected.title }, { label: 'Current state', value: String(selected.state).toLowerCase().replace(/_/g, ' ') }, { label: 'Action', value: action.toLowerCase() }, ...(observedResultLabel ? [{ label: 'Observed result', value: observedResultLabel }] : [])], editableFields: [], confirmLabel: `${action[0]}${action.slice(1).toLowerCase()} work`, consentText: action === 'COMPLETE' ? 'I authorize this update to the shared Operational Work record and confirm the observed result shown above is accurate.' : 'I authorize this update to the shared Operational Work record.', expiresAt: expiresAt.toISOString() }, suggestions: [] };
}




// Ask Intelligence FRD Phase 9A ("What changed?", §16). Reads the existing
// PropertyChange ledger (FRD §16's HomeChangeView, see propertyChange.service.ts)
// rather than a new store -- this operation is a thin presentation layer over
// already-governed materiality/dedup/supersession, not a second change system.
const HOME_CHANGE_SUMMARY_WINDOW_DAYS = 30;
const HOME_CHANGE_SUMMARY_MAX_ITEMS = 10;
// Named explicitly in the empty-state response so "nothing changed" never
// reads as "the whole home was checked" -- FRD §16.4/§23.2: distinguish no
// material change from unavailable coverage.
const HOME_CHANGE_SUMMARY_COVERED_SOURCES = [
  'home events', 'property record updates', 'documents', 'insurance claims', 'projects',
  'maintenance records', 'Home Actions', 'HVAC repair/replace recommendations', 'saved decision preferences',
];

async function homeChangeSummaryResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const since = new Date(Date.now() - HOME_CHANGE_SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const changes = await listPropertyChanges({ propertyId, userId, since });
  const material = changes.filter((change) => change.materiality !== 'INFORMATIONAL').slice(0, HOME_CHANGE_SUMMARY_MAX_ITEMS);

  if (!material.length) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_CHANGE_SUMMARY_NONE',
      blocks: [{
        type: 'EMPTY_STATE', id: 'home-change-summary-empty', title: 'No material changes in the last 30 days',
        body: `This covers ${HOME_CHANGE_SUMMARY_COVERED_SOURCES.join(', ')}. It is not a confirmation that nothing at all happened at this property -- only that no material change was recorded in these sources.`,
        actions: [],
      }],
      suggestions: ['What should I do next?', 'Summarize my home record'],
    };
  }

  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const blocks: AskPresentationBlock[] = await Promise.all(material.map(async (change) => {
    let detailOverride: string | null = null;
    if (change.sourceType === 'DECISION_PREFERENCE_VALUE') {
      const [detail] = await decisionPreferenceService.getPreferenceReferenceDetails([change.sourceRevision]);
      detailOverride = detail?.summary ?? null;
    }
    return {
      type: 'CHANGE_SUMMARY', id: `home-change-${change.id}`,
      title: sourceTypeLabel(change.sourceType),
      source: sourceTypeLabel(change.sourceType),
      changeType: change.changeType,
      summary: buildChangeSummaryText({ sourceType: change.sourceType, changeType: change.changeType, detailOverride }),
      effectiveAt: change.occurredAt ? change.occurredAt.toISOString() : null,
      detectedAt: change.detectedAt.toISOString(),
      materiality: change.materiality,
      materialityReasonCodes: change.materialityReasonCodes,
      confidence: change.confidence,
      linkedAction: change.canonicalAction ? { label: 'View home action', href: homeHref } : null,
    };
  }));

  return {
    status: 'ANSWERED', reasonCode: 'HOME_CHANGE_SUMMARY_FOUND',
    blocks,
    suggestions: ['What should I do next?'],
  };
}























































































































function emergencyResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'IMMEDIATE_SAFETY',
    blocks: [{
      type: 'BOUNDARY', id: 'emergency-boundary', title: 'Treat this as an immediate safety issue', severity: 'EMERGENCY',
      body: 'Leave the affected area if you can do so safely. Call 911 or your local emergency service and the appropriate utility emergency line from a safe location. Do not operate switches, appliances, flames, or vehicles near a suspected gas leak.',
      suggestions: ['Follow instructions from emergency responders or the utility.', 'Do not wait for an app assessment when there may be immediate danger.'],
    }],
    suggestions: [],
  };
}

function outOfScopeResult(): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'NOT_HOMEOWNER_DOMAIN',
    blocks: [{
      type: 'BOUNDARY', id: 'out-of-scope-boundary', title: 'Ask is focused on your home', severity: 'INFO',
      body: 'I can help with home records, maintenance, coverage, costs, tools, decisions, projects, and major home moments. I cannot create unrelated programs or general-purpose coding content here.',
      suggestions: ['What maintenance is pending?', 'Which items are missing coverage?', 'Is there a tool to help with refinancing?'],
    }],
    suggestions: [],
  };
}

function unsafeRestrictedResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'ASK_SAFETY_BLOCKED',
    blocks: [{
      type: 'BOUNDARY', id: 'unsafe-restricted-boundary', title: 'I can’t help bypass safety, legal, or professional controls', severity: 'CAUTION',
      body: 'I can help you understand the safe, documented path, prepare questions and records, or find the appropriate Contract to Cozy tool. I cannot help evade permits or inspections, disable safety equipment, conceal material facts, access another user’s private records, or guarantee a regulated, coverage, structural, or professional determination.',
      suggestions: ['Review the safe permit, inspection, or policy-verification path.', 'Open only the records available for your selected home.', 'Consult the appropriate authority or qualified professional for a controlling determination.'],
    }],
    suggestions: ['What is required before my renovation can start?', 'Which home records should I verify?'],
  };
}

function routingClarificationResult(
  decision: AskRoutingDecision,
  reasonCode: 'ASK_ROUTING_AMBIGUOUS' | 'ASK_SKILL_AMBIGUOUS' = 'ASK_ROUTING_AMBIGUOUS',
): AskOperationResult {
  const candidates = decision.candidates.slice(0, 3);
  const languagePack = (operationId: AskOperationId) => (
    getAskOperationDefinition(operationId).semantic.languagePacks[decision.language]
  );
  const choices = candidates.map((candidate) => languagePack(candidate.operationId)?.supportedJobs[0]).filter(Boolean);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    status: 'NEEDS_CLARIFICATION',
    reasonCode,
    blocks: [{
      type: 'SUMMARY',
      id: 'routing-clarification',
      title: 'What would you like to focus on?',
      body: choices.length
        ? `I found more than one possible home-related request: ${choices.join(', ')}. Add one detail so I can use the right home record and calculation.`
        : 'Add one detail about the home record, decision, task, or tool you want to use.',
      tone: 'DEFAULT',
      actions: [],
    }],
    clarification: {
      version: 1,
      question: 'Which home request would you like Ask to handle?',
      options: candidates.map((candidate) => ({
        operationId: candidate.operationId,
        label: languagePack(candidate.operationId)?.supportedJobs[0]
          ?? getAskOperationDefinition(candidate.operationId).semantic.supportedJobs[0],
      })),
      allowFreeText: true,
      expiresAt,
    },
    parameters: {
      clarification: {
        version: 1,
        candidateOperationIds: candidates.map((candidate) => candidate.operationId),
        expiresAt,
      },
    },
    suggestions: choices.map((choice) => `Help me with ${choice}`).slice(0, 3),
  };
}


async function maybeSynthesizeDeterministicResult(operationId: AskOperationResolution['operationId'], result: AskOperationResult, enabled: boolean, trace?: SkillExecutionTimingTrace): Promise<AskOperationResult> {
  if (!enabled) return result;
  const startedAt = process.hrtime.bigint();
  if (trace) trace.modelUsage = 'NARRATIVE_SYNTHESIS';
  try {
    const synthesized = await synthesizeAskResult(operationId, result);
    askResultSynthesisTotal.inc({ outcome: synthesized === result ? 'ineligible' : 'success' });
    return synthesized;
  } catch {
    askResultSynthesisTotal.inc({ outcome: 'failure_fallback' });
    return result;
  } finally {
    if (trace) trace.modelLatencyMs = (trace.modelLatencyMs ?? 0) + Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }
}

function allowedResultBlocksForOperation(operationId: AskOperationId): AskPresentationBlock['type'][] {
  const operation = getAskOperationDefinition(operationId);
  const skill = getSkillForOperation(operationId);
  if (!skill) return operation.allowedBlockTypes;
  return resolveEffectiveSkillOperationPolicy(skill.id, operationId, 'ASK')?.allowedResultBlocks ?? [];
}

function assertSkillResultBlocksAllowed(operationId: AskOperationId, result: AskOperationResult, trace?: SkillExecutionTimingTrace): void {
  const skill = getSkillForOperation(operationId);
  const startedAt = process.hrtime.bigint();
  let status: string = result.status;
  try {
    const allowedResultBlocks = allowedResultBlocksForOperation(operationId);
    const disallowedBlock = result.blocks.find((block) => block.type !== 'BOUNDARY' && block.type !== 'ERROR_STATE' && !allowedResultBlocks.includes(block.type));
    if (disallowedBlock) {
      status = 'unsupported_block';
      throw new Error(`Ask adapter returned undeclared block type ${disallowedBlock.type}.`);
    }
  } finally {
    if (trace) trace.presentationLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (skill) {
      askSkillPresentationDurationSeconds.observe(
        { skill: skill.id, operation: operationId, status },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      );
    }
  }
}

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; launchContext?: { entityType?: string | null; entityId?: string | null } }, trace?: SkillExecutionTimingTrace): Promise<AskOperationResult> {
  // External review [P1] CTX-001: a launch entity (e.g. "Why is this
  // important?" clicked from an exact maintenance row) was previously
  // dropped entirely -- answerGroundedAsk only ever saw free message text
  // and selected facts from it across the WHOLE property, so two tasks
  // sharing a near-identical title ("Annual maintenance inspection" on two
  // different systems) were indistinguishable to it. Resolving the exact
  // task record here and folding its own identifying fields into both the
  // question text (so selectRelevantAskFacts's token-overlap scoring can
  // actually favor facts about that system/asset) and a dedicated evidence
  // line anchors the answer to the specific record without having to
  // change answerGroundedAsk's Gemini-backed claim-selection pipeline at
  // all. A missing/inaccessible task (deleted, wrong property) falls back
  // to the prior message-only behavior rather than failing the turn.
  let taskAnchor: { title: string; description: string | null; category: string | null; assetType: string | null; roomName: string | null; updatedAt: Date } | null = null;
  let taskAnchorMissing = false;
  if (input.propertyId && input.launchContext?.entityType === 'MAINTENANCE_TASK' && input.launchContext.entityId) {
    const task = await prisma.propertyMaintenanceTask.findFirst({
      where: { id: input.launchContext.entityId, propertyId: input.propertyId },
      select: { title: true, description: true, category: true, assetType: true, updatedAt: true, room: { select: { name: true } } },
    });
    // External review [P1] follow-up: folding only title/category/
    // assetType/room into the question left this task's OWN description
    // (task-specific rationale, homeowner or system-written) out of what
    // the guidance engine sees; and a missing/inaccessible task (deleted,
    // wrong property) used to fall back to an unscoped answer silently --
    // taskAnchorMissing now discloses that instead.
    if (task) taskAnchor = { title: task.title, description: task.description, category: task.category, assetType: task.assetType, roomName: task.room?.name ?? null, updatedAt: task.updatedAt };
    else taskAnchorMissing = true;
  }
  const groundedMessage = taskAnchor
    ? `${input.message} (Regarding the specific maintenance task "${taskAnchor.title}"${taskAnchor.category ? `, category ${taskAnchor.category}` : ''}${taskAnchor.assetType ? `, asset ${taskAnchor.assetType}` : ''}${taskAnchor.roomName ? `, in ${taskAnchor.roomName}` : ''}.${taskAnchor.description ? ` Task notes: ${taskAnchor.description.slice(0, 300)}` : ''})`
    : input.message;
  let answer: Awaited<ReturnType<typeof answerGroundedAsk>>;
  const modelStartedAt = process.hrtime.bigint();
  if (trace) {
    trace.modelUsage = 'OPERATION_GENERATION';
    trace.modelCharacters = groundedMessage.length;
  }
  let modelOutcome = 'failure';
  try {
    askRemoteGenerationCharactersTotal.inc({ direction: 'input' }, groundedMessage.length);
    answer = await answerGroundedAsk({
      userId: input.userId,
      sessionId: input.sessionId,
      message: groundedMessage,
      propertyId: input.propertyId ?? undefined,
      // External review [P1] follow-up (MAINT-008): folding the task's
      // description into groundedMessage only helps selectRelevantAskFacts
      // favor OTHER aggregation facts about the same system -- it never
      // makes the notes themselves usable by the answer. anchorFact routes
      // them through the same deterministic fact-candidate/Gemini-selection
      // pipeline as every other fact, so real task-specific rationale can
      // actually appear in the answer instead of only the unrelated
      // "Maintenance record (exact task)"/"task notes" evidence lines.
      ...(taskAnchor?.description ? {
        anchorFact: {
          key: 'maintenanceTask.notes',
          value: taskAnchor.description,
          source: 'USER_REPORTED',
          observedAt: taskAnchor.updatedAt.toISOString(),
          confidence: 0.75,
        },
      } : {}),
    });
    askRemoteGenerationCharactersTotal.inc({ direction: 'output' }, answer.text.length);
    askRemoteGenerationTotal.inc({ outcome: 'success' });
    modelOutcome = 'success';
  } catch (error) {
    askRemoteGenerationTotal.inc({ outcome: 'failure' });
    throw error;
  } finally {
    askModelDurationSeconds.observe(
      { stage: 'grounded_guidance', outcome: modelOutcome },
      Number(process.hrtime.bigint() - modelStartedAt) / 1_000_000_000,
    );
    if (trace) trace.modelLatencyMs = Number(process.hrtime.bigint() - modelStartedAt) / 1_000_000;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    // External review [P1]: a declared launch entity that no longer
    // resolves (task deleted, or access to it changed) used to fall back
    // to this same unscoped answer with no indication the specific task
    // it was meant to be about was missing -- disclosed explicitly rather
    // than silently presenting a property-wide answer as task-specific.
    body: taskAnchorMissing ? `The specific maintenance task this question was about is no longer available, so this answer is not scoped to it. ${answer.text}` : answer.text,
    tone: taskAnchorMissing || answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  // External review [P1] follow-up (MAINT-008): the notes now flow through
  // answerGroundedAsk as a real anchorFact candidate (see the call above),
  // so when the model actually cites them, answer.evidence already carries
  // a "maintenanceTask.notes" entry -- adding a second, always-present line
  // here would just duplicate it. The standalone fallback line below only
  // fires when the pipeline did NOT cite the notes (irrelevant to this
  // specific question, or no property context at all), so the homeowner can
  // still see and verify the actual task instruction that was available but
  // not used, distinguished from Gemini-cited facts (the items below it)
  // and from a missing/unresolved task (taskAnchorMissing's disclosure).
  const notesCitedInAnswer = answer.evidence.some((item) => item.factKey === 'maintenanceTask.notes');
  const evidenceItems = [
    // External review [P1] follow-up: this used to stamp the current
    // request time rather than the task's own recorded observation time.
    ...(taskAnchor ? [{ label: taskAnchor.title, source: 'Maintenance record (exact task)', observedAt: taskAnchor.updatedAt.toISOString() }] : []),
    ...(taskAnchor?.description && !notesCitedInAnswer ? [{
      label: taskAnchor.description.length > 200 ? `${taskAnchor.description.slice(0, 200)}…` : taskAnchor.description,
      source: 'Maintenance record (task notes, not used in this answer)',
      observedAt: taskAnchor.updatedAt.toISOString(),
    }] : []),
    ...answer.evidence.map((item) => ({
      label: item.factKey === 'maintenanceTask.notes' ? 'Maintenance record (task notes)' : item.label,
      source: item.factKey === 'maintenanceTask.notes' ? 'Cited in this answer' : item.source,
      observedAt: item.observedAt,
    })),
  ];
  if (evidenceItems.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: evidenceItems });
  }
  blocks.push({ type: 'BOUNDARY', id: 'grounded-professional-boundary', title: 'Educational guidance—not a controlling determination', body: answer.safetyBoundary, severity: 'INFO', suggestions: [] });
  // The remote fallback's own confidence was previously used only to set a
  // CAUTION tone, so a low-confidence, weakly-grounded answer was still
  // returned as an ordinary confident ANSWERED result. Matches the
  // low-confidence => READY_WITH_LIMITATIONS convention already used by
  // every other operation in this file (capital plan, repair/replace,
  // ownership costs, sell/hold/rent, refinance, etc.) rather than inventing
  // a separate contract just for this path.
  return {
    status: answer.confidence.label === 'LOW' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: answer.confidence.label === 'LOW' ? 'GROUNDED_GUIDANCE_LOW_CONFIDENCE' : undefined,
    blocks,
    suggestions: [answer.nextAction].filter(Boolean),
  };
}

// External review [P1]: Radar's own proactive continuation carries a real
// `radarMatchId` (radarNotificationDelivery.service.ts's own `parameters:
// { radarEventId, radarMatchId, ... }`), and the envelope producer's own
// `source.sourceRecordId` for a PropertyRadarMatch-sourced item IS that
// same match row's id (`intelligenceEnvelopeQuery.service.ts`'s
// `sourceRecordId: row.id` inside its `PropertyRadarMatch` reader) -- so
// this can scope precisely to the exact triggering match without the
// broader entityRef-on-Radar-producers gap (Phase 0 §4.6, tracked
// separately into Phase 7) ever coming into play.
type RadarEnvelopeQuerySuppliedInput = { radarMatchId?: string | null; radarEventId?: string | null };

async function intelligenceEnvelopeQueryResult(userId: string, propertyId: string, message: string, cursor?: string | null, suppliedInput?: RadarEnvelopeQuerySuppliedInput): Promise<AskOperationResult> {
  const scope = resolveAskEnvelopeQueryScope(propertyId, message);
  const page = await queryIntelligenceEnvelope({
    propertyId,
    principal: { kind: 'HOMEOWNER_SESSION', userId },
    ...scope,
    ...(cursor ? { cursor } : {}),
    limit: 20,
  });
  const radarMatchId = suppliedInput?.radarMatchId ?? null;
  const scopedToRadarMatch = radarMatchId
    ? page.items.filter((item) => item.source.sourceRecordId === radarMatchId)
    : [];
  // Fall back to the unfiltered page rather than an artificially empty
  // result when the originating match's own item didn't come back on this
  // page (aged out, deleted) -- a broader answer beats a false "nothing
  // found" for a signal the homeowner was just notified about.
  const items = scopedToRadarMatch.length ? scopedToRadarMatch : page.items;

  if (!items.length && !page.diagnostics.length) {
    return {
      status: 'ANSWERED',
      contextVersion: page.contextVersion,
      blocks: [{
        type: 'EMPTY_STATE',
        id: 'intelligence-envelope-empty',
        title: 'No registered intelligence yet',
        body: 'The registered Envelope producers have not created intelligence for this property yet.',
        actions: [],
      }],
      suggestions: ['Summarize my home record'],
    };
  }

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const existing = grouped.get(item.domain) ?? [];
    existing.push(item);
    grouped.set(item.domain, existing);
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'intelligence-envelope-summary',
    title: scopedToRadarMatch.length ? 'The event you were notified about' : 'Registered home intelligence',
    body: `${items.length} normalized intelligence item${items.length === 1 ? '' : 's'} from ${new Set(items.map((item) => item.source.sourceModel)).size} registered producer${new Set(items.map((item) => item.source.sourceModel)).size === 1 ? '' : 's'}${scopedToRadarMatch.length ? ' -- scoped to the specific monitored event that triggered this conversation.' : '.'}`,
    tone: page.diagnostics.length ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }];
  if (items.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [],
      id: 'intelligence-envelope-items',
      title: 'Derived intelligence by domain',
      description: 'This is a normalized read of registered Envelope producers, not every Home Action or ordinary domain record.',
      sections: [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([domain, sectionItems]) => ({
        id: `envelope-${domain.toLowerCase()}`,
        title: domain.replace(/_/g, ' ').toLowerCase(),
        count: sectionItems.length,
        items: sectionItems.map((item) => ({
          id: item.envelopeKey,
          title: `${item.type.replace(/_/g, ' ').toLowerCase()} · ${item.source.producer}`,
          description: item.qualifiedClaim?.verdict ?? `${item.source.sourceModel} · ${item.freshness.currentness.toLowerCase()}`,
          meta: [item.severity ?? 'UNSPECIFIED', item.createdAt.slice(0, 10)],
          status: item.freshness.currentness,
          href: null,
        })),
      })),
      actions: [],
    });
    const evidence = items.flatMap((item) => item.evidence).slice(0, 20);
    if (evidence.length) {
      blocks.push({
        type: 'EVIDENCE',
        id: 'intelligence-envelope-evidence',
        title: 'Producer evidence',
        items: evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })),
      });
    }
  }
  if (page.diagnostics.length) {
    blocks.push({
      type: 'BOUNDARY',
      id: 'intelligence-envelope-partial',
      title: 'Some registered intelligence was unavailable',
      body: page.diagnostics.map((diagnostic) => `${diagnostic.producerModel}: ${diagnostic.code}`).join('; '),
      severity: 'INFO',
      suggestions: ['Try the query again'],
    });
  }
  return {
    status: page.diagnostics.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: page.diagnostics.length ? 'INTELLIGENCE_ENVELOPE_PARTIAL' : undefined,
    contextVersion: page.contextVersion,
    blocks,
    suggestions: page.nextCursor ? ['Show more intelligence', 'Ask about a specific intelligence domain'] : [],
    parameters: page.nextCursor ? { nextCursor: page.nextCursor } : undefined,
  };
}



























async function confirmHomeEventRadarMarkDone(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to mark radar events done in Ask.', 'ASK_PERMISSION_REQUIRED');
  const matchId = typeof parameters.radarMatchId === 'string' ? parameters.radarMatchId : null;
  if (!matchId) throw radarConfirmError('The event selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const detail = await loadRadarMatchForWrite(execution.propertyId!, matchId, userId);
  if (!detail) throw radarConfirmError('This monitored event is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const current = String(detail.userState ?? 'new');
  const alreadyApplied = current === 'acted_on';
  if (!alreadyApplied) {
    if (parameters.radarStateContextVersion !== radarStateContextVersion(matchId, current)) {
      throw radarConfirmError('This event changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    await radarInteractionService.updateState(execution.propertyId!, matchId, userId, 'acted_on');
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId!, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
      metadataJson: { actionType: 'update_match_state', matchId, state: 'acted_on', surface: 'ASK' },
    });
  }
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-mark-done-${matchId}`, title: alreadyApplied ? 'Already marked done' : 'Marked done', status: 'COMPLETED',
    description: alreadyApplied ? 'Nothing was changed.' : 'Home Event Radar will recheck this home\'s radar risk to reflect it.',
    details: [{ label: 'Event', value: String(detail.title) }, { label: 'Previous state', value: alreadyApplied ? 'Already done' : RADAR_USER_STATE_LABEL[current] ?? current }],
    actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(execution.propertyId!, matchId), style: 'SECONDARY' }],
  }, alreadyApplied ? 'HOME_EVENT_RADAR_ALREADY_DONE' : 'HOME_EVENT_RADAR_MARKED_DONE', 'PROPERTY_RADAR_STATE');
}

async function confirmHomeEventRadarFeedback(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to send radar feedback in Ask.', 'ASK_PERMISSION_REQUIRED');
  const candidate = RadarFeedbackInputSchema.safeParse(parameters.radarFeedback);
  if (!candidate.success) throw radarConfirmError('The feedback to send is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const { matchId, feedbackType, comment } = candidate.data;
  if (!feedbackType) throw radarConfirmError('Choose a reason before sending feedback.', 'ASK_INVALID_CONFIRMATION_EDIT');
  const detail = await loadRadarMatchForWrite(execution.propertyId!, matchId, userId);
  if (!detail) throw radarConfirmError('This monitored event is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  await radarInteractionService.submitFeedback(execution.propertyId!, matchId, userId, feedbackType, comment || null);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId!, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
    metadataJson: { actionType: 'submit_match_feedback', matchId, feedbackType, hasComment: Boolean(comment), surface: 'ASK' },
  });
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-feedback-${matchId}`, title: 'Feedback sent', status: 'COMPLETED',
    description: 'Thanks. Home Event Radar recorded your feedback on this event.',
    details: [
      { label: 'Event', value: String(detail.title) },
      { label: 'Reason', value: RADAR_FEEDBACK_OPTIONS.find((option) => option.value === feedbackType)?.label ?? feedbackType },
      ...(comment ? [{ label: 'Comment', value: comment }] : []),
    ],
    actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(execution.propertyId!, matchId), style: 'SECONDARY' }],
  }, 'HOME_EVENT_RADAR_FEEDBACK_SENT', 'PROPERTY_RADAR_FEEDBACK');
}

registerConfirmCapabilityHandler('home-event-radar.mark-done', confirmHomeEventRadarMarkDone);
registerConfirmCapabilityHandler('home-event-radar.feedback', confirmHomeEventRadarFeedback);

export async function editHomeEventRadarFeedbackConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = RadarFeedbackInputSchema.safeParse(parameters.radarFeedback);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const unknownField = Object.keys(input.edits).find((key) => key !== 'feedbackType' && key !== 'comment');
  if (unknownField) throw Object.assign(new Error('Only the reason and comment can be edited.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next = { ...existing.data };
  if (input.edits.feedbackType !== undefined) {
    const type = RadarFeedbackInputSchema.shape.feedbackType.safeParse(input.edits.feedbackType);
    if (!type.success || type.data === null) throw Object.assign(new Error('Choose one of the listed reasons.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.feedbackType = type.data;
  }
  if (input.edits.comment !== undefined) {
    if (input.edits.comment.trim().length > RADAR_FEEDBACK_COMMENT_MAX_LENGTH) throw Object.assign(new Error(`Keep the comment to ${RADAR_FEEDBACK_COMMENT_MAX_LENGTH} characters or fewer.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.comment = input.edits.comment.trim() || null;
  }
  const updatedInput = RadarFeedbackInputSchema.parse(next);
  const detail = await loadRadarMatchForWrite(execution.propertyId!, updatedInput.matchId, userId);
  if (!detail) throw Object.assign(new Error('This monitored event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = radarFeedbackConfirmation(detail, updatedInput, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'radar-feedback-review', title: `Feedback on ${detail.title}`, body: RADAR_FEEDBACK_REVIEW_BODY, tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, radarFeedback: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}
















async function confirmHomeEventRadarTask(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to plan radar actions.', 'ASK_PERMISSION_REQUIRED');
  const candidate = RadarTaskInputSchema.safeParse(parameters.radarTask);
  if (!candidate.success) throw radarConfirmError('The task to add or link is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const { matchId, actionCode, operation, maintenanceTaskId, dueAt, assigneeUserId } = candidate.data;
  const propertyId = execution.propertyId!;
  let outcome: { link: Record<string, any>; deduped: boolean };
  try {
    outcome = await radarTaskIntegrationService.createOrLink(propertyId, matchId, actionCode, userId, { operation, maintenanceTaskId, dueAt, assigneeUserId });
  } catch (error) {
    const mapped = error instanceof APIError && error.code ? RADAR_TASK_CONFIRM_ERRORS[error.code] : undefined;
    if (mapped) throw radarConfirmError(`${(error as Error).message.replace(/\.$/, '')}. Review it and try again.`, mapped);
    throw error;
  }
  const task = outcome.link.task as { id: string; title: string; href: string; nextDueDate: string | null };
  // Same analytics the traditional POST .../task controller emits.
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
    metadataJson: { actionType: operation, matchId, actionCode, maintenanceTaskId: task.id, deduped: outcome.deduped, surface: 'ASK' },
  });
  const title = outcome.deduped ? 'Already planned' : ({ create_task: 'Task added', create_reminder: 'Reminder set', link_existing_task: 'Task linked' } as const)[operation];
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-task-${matchId}-${actionCode}`, title, status: 'COMPLETED',
    description: outcome.deduped
      ? 'This recommended action already had a maintenance task, so nothing new was added.'
      : 'It is on your maintenance list and linked to this Home Event Radar action.',
    details: [
      { label: 'Task', value: task.title },
      ...(task.nextDueDate ? [{ label: 'Due', value: radarDateTimeLabel(task.nextDueDate, getAskPropertyTimezone()) }] : []),
    ],
    actions: [{ id: 'open-task', label: 'Open task', href: task.href, style: 'PRIMARY' }, { id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }],
  }, outcome.deduped ? 'HOME_EVENT_RADAR_TASK_ALREADY_LINKED' : 'HOME_EVENT_RADAR_TASK_LINKED', 'PROPERTY_RADAR_TASK_LINK');
}

registerConfirmCapabilityHandler('home-event-radar.task', confirmHomeEventRadarTask);










async function confirmHomeEventRadarPreferences(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to change radar notification settings in Ask.', 'ASK_PERMISSION_REQUIRED');
  const body = updateRadarNotificationPreferencesBodySchema.safeParse(parameters.radarPreferences);
  if (!body.success) throw radarConfirmError('The settings to save are invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const propertyId = execution.propertyId!;
  const current = await radarNotificationPreferenceService.get(propertyId, userId);
  if (parameters.radarPreferencesContextVersion !== radarPreferencesContextVersion(current)) {
    throw radarConfirmError('Your notification settings changed while this was open. Review them and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const saved = await radarNotificationPreferenceService.update(propertyId, userId, body.data);
  // The traditional PUT /radar/preferences controller emits no analytics, so neither does this.
  return radarWriteReceipt(ctx, 'preferences', {
    type: 'WORKFLOW_PROGRESS', id: 'radar-preferences-saved', title: 'Notification settings saved', status: 'COMPLETED',
    description: 'Home Event Radar uses these for your notifications about this home. Other household members keep their own.',
    details: radarPreferenceLabels(body.data).map(({ label, value }) => ({ label, value })),
    actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: radarEventHref(propertyId), style: 'SECONDARY' }],
  }, 'HOME_EVENT_RADAR_PREFERENCES_SAVED', 'PROPERTY_RADAR_NOTIFICATION_PREFERENCE').then((result) => ({ ...result, artifactId: `${saved.propertyId}:${saved.userId}` }));
}

registerConfirmCapabilityHandler('home-event-radar.preferences', confirmHomeEventRadarPreferences);











// Ask Cozy Stage 3, Phase 1 (implementation plan §7; FRD §16-17). Registers
// this file's 67 existing per-operation handlers as thin shims against the
// capability registry (capabilityHandlerRegistry.ts), keyed by each
// operation's own declared adapterKey (ASK_OPERATION_DEFINITIONS -- the
// authoritative source for all 67, independent of the separate, optional
// SkillAdapterDefinition table). Handler bodies are unchanged; each shim
// only adapts CapabilityInvocationEnvelope (+ CapabilityInvocationDependencies
// for the two handlers that need composed context or a trace object, neither
// of which belongs in the homeowner-shaped envelope) onto the handler's own,
// pre-existing positional signature -- exactly what used to be one line of a
// switch statement here, now one registration call. Adding capability #68
// means adding one new entry to this block (or, for a handler whose body
// lives in its own file, calling registerCapabilityHandler directly from
// there) -- never a new branch in dispatchOperationAdapterResult below,
// which no longer branches on operationId at all.
registerCapabilityHandler('boundary.emergency', async () => emergencyResult());
registerCapabilityHandler('boundary.unsafe-restricted', async () => unsafeRestrictedResult());
registerCapabilityHandler('boundary.out-of-scope', async () => outOfScopeResult());
// External review [P1]: `envelope.suppliedInput` was declared on
// CapabilityInvocationEnvelope but never read anywhere in the normal
// propose-time dispatch path (confirmed by grep before wiring this) --
// only submitAskCapture's own capture-edit flow passed a supplied-input
// equivalent, and only by calling maintenanceTaskCompleteResult directly,
// bypassing this registration entirely. Reading it here is what lets a
// resolved Maintenance monitor-continuation (askFollowUpContext.ts's
// suppliedInput.taskId) reach this handler at all.
// ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/ACT-003: a fresh execution
// launched from an inline row action (not a same-session follow-up, which
// already reaches suppliedInput via askFollowUpContext.ts) carries its
// canonical target as launchContext.entityId/entityType, e.g. a
// "Complete"/"Reschedule" button on a maintenance card. Falling back to it
// here is what lets that button resolve the exact task instead of the
// generic message-text fuzzy match.
const launchMaintenanceTaskId = (envelope: CapabilityInvocationEnvelope): string | null =>
  envelope.launchContext?.entityType === 'MAINTENANCE_TASK' ? envelope.launchContext.entityId ?? null : null;
registerCapabilityHandler('maintenance.complete', async (envelope) => maintenanceTaskCompleteResult(envelope.userId, envelope.propertyId!, envelope.message, (envelope.suppliedInput as MaintenanceCompletionWorkflowInput | undefined) ?? (launchMaintenanceTaskId(envelope) ? { taskId: launchMaintenanceTaskId(envelope)! } : undefined), envelope.launchContext?.sourceExecutionId ?? null));
registerCapabilityHandler('maintenance.update', async (envelope) => maintenanceTaskUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, launchMaintenanceTaskId(envelope), envelope.launchContext?.sourceExecutionId ?? null));
registerCapabilityHandler('intelligence-envelope.query', async (envelope) => intelligenceEnvelopeQueryResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.continuationCursor, envelope.suppliedInput as RadarEnvelopeQuerySuppliedInput | undefined));
registerCapabilityHandler('home-operations.update', async (envelope) => operationalWorkUpdateResult(envelope.propertyId!, envelope.message, envelope.launchContext));
registerCapabilityHandler('inventory.replacement', async (envelope) => replacementGuidanceResult(
  envelope.userId,
  envelope.propertyId!,
  envelope.message,
  envelope.launchContext?.entityType === 'INVENTORY_ITEM' ? envelope.launchContext.entityId : null,
  envelope.executionId,
));














































// Phase 3 evidence-upload add slice (design approved 2026-09-22): a homeowner-initiated evidence attach, reached
// only from the declared "Attach evidence" control on a HomeEvent's inline detail. Unlike CAPTURE_EVIDENCE_CONFIRM's
// extraction path below (confirmCaptureEvidence's non-USER_ADD branch, which requires a freshly-confirmed sibling
// EVENT execution because extraction proposes an EVENT and its EVIDENCE together), this attaches to an EXISTING,
// already-confirmed event the homeowner chose from the timeline, so eventId is known up front and re-verified
// directly rather than resolved through a linked execution. The file itself was already uploaded out of band, via
// POST /api/documents/property/:propertyId/evidence-upload, by the time this runs -- documentId is all this needs.
// One-shot, like HOME_EVENT_VISIBILITY: propose builds the confirmation card directly, no separate form step,
// since the "form" (picking and uploading a file) already happened client-side before this call.
export const EVIDENCE_ATTACH_MESSAGE = 'Attach evidence to this home timeline entry.';
















registerCapabilityHandler('guidance.journey.create', async (envelope) => guidanceJourneyCreateResult(envelope.userId, envelope.propertyId!, envelope.message));
registerCapabilityHandler('home-deadline.monitor', async (envelope) => homeDeadlineMonitorResult(envelope.userId, envelope.propertyId!, envelope.message));
// Passthrough category (FRD §16): receives the whole envelope, plus the
// trace object groundedGuidanceResult needs but which the envelope itself
// deliberately never carries (Stage 2 §11 correction).
registerCapabilityHandler('grounded.guidance', async (envelope, deps) => groundedGuidanceResult(envelope, deps.trace));
registerCapabilityHandler('home-change.summary', async (envelope) => homeChangeSummaryResult(envelope.userId, envelope.propertyId!));

// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22).
// CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM are never reached through
// ordinary message routing -- a capture candidate is created directly in
// NEEDS_CONFIRMATION status by whatever produced it (Phase 3's extraction;
// a synthetic test harness in this phase), never proposed from a raw
// homeowner message. This handler exists only so Phase 1's capability
// registry has no coverage gap for these two operations; the real
// propose-time and confirm-time work is confirmAskExecution's job (the
// confirm-time registry, below).
function captureNotDirectlyRoutableResult(kind: 'fact' | 'event' | 'warranty' | 'evidence'): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{
      type: 'BOUNDARY', id: `capture-${kind}-confirm-not-routable`, title: 'This isn\'t something you can ask for directly', severity: 'INFO',
      body: `A ${kind} capture confirmation is created automatically when Ask recognizes something you mentioned in conversation -- it can't be started directly.`,
      suggestions: [],
    }],
    suggestions: [],
  };
}
registerCapabilityHandler('capture.fact.confirm', async () => captureNotDirectlyRoutableResult('fact'));
registerCapabilityHandler('capture.event.confirm', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'CAPTURE_EVENT_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === EVENT_ADD_MESSAGE;
  return declaredAddAction
    ? eventAddResult(envelope.userId, envelope.propertyId!, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('event');
});
registerCapabilityHandler('capture.warranty.confirm', async (envelope) => {
  const declaredAddAction = envelope.launchContext?.operationId === 'CAPTURE_WARRANTY_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === WARRANTY_ADD_MESSAGE;
  return declaredAddAction
    ? warrantyAddResult(envelope.userId, envelope.propertyId!, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('warranty');
});
// A document is attached as evidence to an EXISTING event only from the declared "Attach evidence" control (see
// evidenceAttachResult above), which requires the file to already be uploaded (documentId) and the exact target
// event pinned (entityId) -- never resolved by fuzzy message matching. Every other call (an ASK_REFRESH re-run,
// which never carries operationId; a bare message naming the operation) keeps the original not-directly-routable
// boundary, same guard shape as the warranty/event add actions above.
registerCapabilityHandler('capture.evidence.confirm', async (envelope) => {
  const declaredAttachAction = envelope.launchContext?.operationId === 'CAPTURE_EVIDENCE_CONFIRM'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === EVIDENCE_ATTACH_MESSAGE
    && envelope.launchContext.entityType === 'HOME_EVENT'
    && typeof envelope.launchContext.entityId === 'string'
    && typeof envelope.launchContext.documentId === 'string';
  return declaredAttachAction
    ? evidenceAttachResult(envelope.userId, envelope.propertyId!, envelope.launchContext!.entityId as string, envelope.launchContext!.documentId as string, envelope.launchContext?.sourceExecutionId ?? null)
    : captureNotDirectlyRoutableResult('evidence');
});











async function withAskTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('Ask execution exceeded its operational timeout.');
          error.name = 'AskExecutionTimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}


async function ensureAskServiceAccountEligibility(userId: string, knownRole?: AskAccountRole): Promise<void> {
  if (!readAskOperationalControls().accountRoleEligibilityEnabled) {
    const error = new Error(ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE);
    (error as Error & { code?: string }).code = ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED;
    throw error;
  }
  const role = knownRole ?? (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role;
  assertAskAccountRoleEligible(role);
}

async function discoverableAskOperationIds(input: {
  propertyId?: string | null;
  propertyAccess?: PropertyAccess | null;
  controls: ReturnType<typeof readAskOperationalControls>;
}): Promise<AskOperationId[]> {
  const operatingMode = input.propertyId && input.propertyAccess && input.controls.audienceDiscoveryEnabled
    ? operatingModeForOwnershipState((await prisma.propertyOnboarding.findUnique({
      where: { propertyId: input.propertyId }, select: { ownershipState: true },
    }))?.ownershipState)
    : 'UNKNOWN';
  const rank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  return Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY'))
    .filter((definition) => input.controls.operationEnabled(definition.operationId))
    .filter((definition) => {
      const skill = getSkillForOperation(definition.operationId);
      return !skill || (input.controls.skillEnabled(skill.id) && skillRuntimeUnavailableReason(definition.operationId, input.controls) == null);
    })
    .filter((definition) => !input.propertyAccess || !definition.propertyRoleFloor
      || rank[input.propertyAccess.role] >= rank[definition.propertyRoleFloor])
    .filter((definition) => {
      if (!input.propertyId || !input.propertyAccess || !input.controls.audienceDiscoveryEnabled) return true;
      return isAskOperationDiscoverableForAudience({
        operationId: definition.operationId, operationVersion: definition.version,
        accountRole: 'HOMEOWNER', householdRole: input.propertyAccess.role, operatingMode,
      });
    })
    .map((definition) => definition.operationId);
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest, accountRole?: AskAccountRole): Promise<AskExecutionResponse> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const controls = readAskOperationalControls();
  const safetyFirstDecision = resolveAskRoutingCascade(input.message, {
    localRoutingEnabled: false,
    embeddingRetrievalEnabled: false,
  });
  const executionPropertyId = propertyScopeForAskRouting(safetyFirstDecision, input.propertyId);
  const initialPropertyAccess = executionPropertyId
    ? await ensurePropertyAccess(userId, executionPropertyId)
    : null;
  const eligibleOperationIds = await discoverableAskOperationIds({
    propertyId: executionPropertyId, propertyAccess: initialPropertyAccess, controls,
  });
  await enterAskPropertyTimezoneContext(executionPropertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) {
    // Without this, a retry that reuses the same clientRequestId (the
    // client's own idempotency key for this question) just returns a
    // crash-orphaned RUNNING row verbatim, forever — an infinite spinner
    // with no path forward. Reclaim it first so the retry actually observes
    // a terminal, retryable state instead.
    const current = await reclaimOrphanedRunningExecution(duplicate);
    return mapPersistedExecution(
      current,
      await propertySummary(safetyFirstDecision.stage === 'SAFETY' ? null : current.propertyId),
    );
  }

  const expiresAt = new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000);
  const existingSession = await prisma.askSession.findUnique({ where: { id: input.sessionId } });
  if (existingSession && existingSession.userId !== userId) {
    const error = new Error('Ask session not found.');
    (error as Error & { code?: string }).code = 'ASK_SESSION_NOT_FOUND';
    throw error;
  }
  const session = existingSession
    ? await prisma.askSession.update({
      where: { id: existingSession.id },
      data: { propertyId: executionPropertyId ?? undefined, lastActiveAt: new Date(), expiresAt },
    })
    : await prisma.askSession.create({
      data: { id: input.sessionId, userId, propertyId: executionPropertyId ?? null, title: input.message.slice(0, 120), expiresAt },
    });
  const execution = await prisma.askExecution.create({
    data: {
      sessionId: session.id,
      userId,
      propertyId: executionPropertyId ?? null,
      clientRequestId: input.clientRequestId,
      message: input.message,
      launchContextJson: safetyFirstDecision.stage !== 'SAFETY' && input.launchContext
        ? asInputJson(input.launchContext)
        : undefined,
      // The row's true first persisted state: the request has been
      // accepted but routing hasn't run yet. Previously this was created
      // directly as 'ROUTING', so RECEIVED was declared in
      // AskExecutionStatus (and matches the schema column default) but
      // could never actually be observed as execution.status -- only as
      // this same-named AskExecutionEvent.eventType below.
      status: 'RECEIVED',
      expiresAt,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECEIVED', metadataJson: asInputJson({ surface: input.launchContext?.surface ?? 'unknown' }) } });

  // Bounded, durable follow-up resolution: reads the most recent typed
  // execution in this session (not raw chat history) and, only for a
  // recognized bare-continuation phrasing ("Now complete it.", "Only show
  // the urgent ones."), rewrites the effective message so the existing
  // deterministic routing/entity-matching regexes see enough context to
  // resolve correctly. The homeowner-visible/persisted question stays the
  // original input.message.
  const followUp = await resolveAskFollowUpMessage({ sessionId: session.id, propertyId: executionPropertyId, message: input.message, declaredSourceExecutionId: input.launchContext?.sourceExecutionId ?? null });
  const routingMessage = followUp.effectiveMessage;

  const skillRoutingStartedAt = process.hrtime.bigint();
  let routingDecision = safetyFirstDecision.stage === 'SAFETY'
    ? safetyFirstDecision
    : resolveAskRoutingCascade(routingMessage, {
      localRoutingEnabled: controls.localRoutingEnabled && controls.semanticRetrievalEnabled,
      localMinimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
      classifierEnabled: controls.constrainedClassifierEnabled,
      embeddingRetrievalEnabled: controls.embeddingRetrievalEnabled,
      eligibleOperationIds,
      propertyId: executionPropertyId,
      launchEntityId: input.launchContext?.entityId,
    });
  const launchCapabilityOperationId = input.launchContext?.capabilityId
    ? ASK_CAPABILITY_UNIQUE_OPERATION[input.launchContext.capabilityId]
    : undefined;
  const contextualOperationId = focusedOperationForLaunchContext(input.launchContext);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD ACT-001/ACT-003: a declared item
  // action (GroupedListItemActionSchema.operationId) names its own
  // registered operation explicitly -- the highest-priority source here,
  // since it is server-declared authoritative identity from a prior
  // response, not an inference from free text or a launch surface.
  // Validated against the operation registry before use; an unrecognized
  // or stale value is silently ignored rather than trusted, falling back
  // to the same NLU/entity-based resolution every other turn uses.
  const declaredItemActionOperationId = input.launchContext?.operationId && input.launchContext.operationId in ASK_OPERATION_DEFINITIONS
    ? input.launchContext.operationId as AskOperationId
    : null;
  const forcedOperationId = declaredItemActionOperationId ?? followUp.forcedOperationId ?? contextualOperationId ?? launchCapabilityOperationId ?? null;
  const skillRoutingDecision = resolveHierarchicalSkillRouting(routingMessage, routingDecision, {
    consumer: 'ASK',
    consumerEnabled: controls.consumerEnabled,
    domainEnabled: controls.domainEnabled,
    skillEnabled: controls.skillEnabled,
    operationEnabled: controls.operationEnabled,
    adapterEnabled: controls.adapterEnabled,
    contextProviderEnabled: controls.contextProviderEnabled,
    minimumConfidence: controls.localRoutingMinimumConfidence,
    ambiguityMargin: controls.routingAmbiguityMargin,
  });
  askSkillRoutingDecisionsTotal.inc({ outcome: skillRoutingDecision.outcome, path: skillRoutingDecision.path });
  const skillRoutingLatencyMs = Number(process.hrtime.bigint() - skillRoutingStartedAt) / 1_000_000;
  askSkillRoutingDurationSeconds.observe(
    { outcome: skillRoutingDecision.outcome, path: skillRoutingDecision.path },
    skillRoutingLatencyMs / 1_000,
  );
  const skillTelemetryTrace = createSkillExecutionTimingTrace(skillRoutingLatencyMs);
  skillTelemetryTrace.audience = audienceTelemetryFor({
    propertyAccess: initialPropertyAccess,
    audiencePolicyEnabled: controls.audiencePolicyEnabled,
  });
  if (!forcedOperationId && routingDecision.stage === 'REMOTE_FALLBACK' && skillRoutingDecision.outcome === 'RESOLVED' && skillRoutingDecision.selectedOperationId) {
    const selectedOperation = getAskOperationDefinition(skillRoutingDecision.selectedOperationId);
    const confidence = skillRoutingDecision.skillCandidates[0]?.confidence ?? selectedOperation.confidence;
    routingDecision = {
      language: routingDecision.language,
      operation: { ...selectedOperation, confidence },
      stage: 'LOCAL_CLASSIFIER',
      candidates: [{ operationId: selectedOperation.operationId, confidence }],
      requiresClarification: false,
      entityResolution: resolveAskEntityState({ message: routingMessage, operationId: selectedOperation.operationId, propertyId: executionPropertyId, launchEntityId: input.launchContext?.entityId, requiresProperty: selectedOperation.requiresProperty }),
    };
  } else if (!forcedOperationId && routingDecision.stage === 'REMOTE_FALLBACK'
    && (skillRoutingDecision.outcome === 'AMBIGUOUS_OPERATION' || skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL')) {
    const skillAmbiguityOperations = skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL'
      ? skillRoutingDecision.skillCandidates.flatMap((candidate) => {
        const candidateSkill = getSkillDefinition(candidate.skillId);
        return candidateSkill?.operations
          .filter((operationReference) => Boolean(resolveEffectiveSkillOperationPolicy(candidateSkill.id, operationReference.operationId, 'ASK')))
          .map((operationReference) => ({ operationId: operationReference.operationId, confidence: candidate.confidence })) ?? [];
      })
      : skillRoutingDecision.operationCandidates;
    routingDecision = {
      language: routingDecision.language,
      operation: routingDecision.operation,
      stage: 'CLARIFICATION',
      candidates: [...new Map(skillAmbiguityOperations.map((candidate) => [candidate.operationId, candidate])).values()].slice(0, 3),
      requiresClarification: true,
      entityResolution: null,
    };
  }
  // The local classifier already had the concatenated prior+current message
  // to work with; only step in when it still found nothing confident
  // (REMOTE_FALLBACK) — a DETERMINISTIC/LOCAL_CLASSIFIER/CLARIFICATION
  // outcome, or SAFETY, is always a stronger signal than this nudge.
  // The entry point that opened Ask (e.g. the warranties or insurance page)
  // may carry a capabilityId identifying what the homeowner almost
  // certainly means, even before they type anything operation-specific —
  // this was previously captured in launchContextJson and never read back.
  // Same conservative guard as the follow-up bias: only steps in when the
  // cascade found nothing confident on its own, and only when the
  // capability unambiguously names one operation.
  //
  // External review [P1]: this conservative gate was, until now, applied
  // uniformly to every source of forcedOperationId -- including
  // declaredItemActionOperationId, which the comment above it already
  // documents as "the highest-priority source here, since it is
  // server-declared authoritative identity from a prior response, not an
  // inference from free text or a launch surface." A declared item action
  // (e.g. "Why is this important?" pinned to GROUNDED_GUIDANCE) has no
  // ambiguity left to resolve -- the UI already named the exact operation
  // -- so gating it behind "the classifier found nothing confident" meant
  // a confidently-but-wrongly-routed message (e.g. "Why is 'Annual
  // maintenance inspection' important?" matching MAINTENANCE_STATUS's own
  // keyword pattern) silently overrode the declared control. Only the two
  // genuinely soft/contextual signals (contextualOperationId,
  // launchCapabilityOperationId) keep the narrow "nudge" gate; an explicit
  // declared control always forces, exactly as ACT-001/ACT-003 intend.
  const shouldForceOperation = Boolean(forcedOperationId)
    && routingDecision.stage !== 'SAFETY'
    && !routingDecision.requiresClarification
    && routingDecision.operation.operationId !== forcedOperationId
    && (Boolean(declaredItemActionOperationId) || Boolean(contextualOperationId) || routingDecision.stage === 'REMOTE_FALLBACK');
  const operation = shouldForceOperation
    ? { ...getAskOperationDefinition(forcedOperationId as AskOperationId), confidence: 1 }
    : routingDecision.operation;
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const routedEntityResolution = shouldForceOperation
    ? resolveAskEntityState({ message: routingMessage, operationId: operation.operationId, propertyId: executionPropertyId, launchEntityId: input.launchContext?.entityId, requiresProperty: operation.requiresProperty })
    : routingDecision.entityResolution;
  const selectedSkill = getSkillForOperation(operation.operationId);
  const selectedSkillBinding = selectedSkill && !routingDecision.requiresClarification
    ? buildSkillExecutionBinding({
      skill: selectedSkill,
      operationId: operation.operationId,
      consumer: 'ASK',
      routingPath: skillRoutingDecision.path,
      routingReasonCodes: skillRoutingDecision.skillCandidates
        .find((candidate) => candidate.skillId === selectedSkill.id)?.reasonCodes ?? [],
      semanticIndexVersion: skillRoutingDecision.semanticIndexVersion,
    })
    : null;
  const generationMode = routingDecision.requiresClarification
    ? 'deterministic'
    : operationDefinition.executionMode === 'REMOTE_GENERATION' ? 'remote' : 'deterministic';
  askRoutingDecisionsTotal.inc({ stage: routingDecision.stage.toLowerCase(), outcome: routingDecision.requiresClarification ? 'clarification' : operation.operationId.toLowerCase() });
  const normalizedRoutingMessage = normalizeAskMessage(routingMessage, routingDecision.language);
  await prisma.askExecutionEvent.create({
    data: {
      executionId: execution.id,
      eventType: 'CAPABILITY_RESOLVED',
      metadataJson: asInputJson({
        skillId: routingDecision.requiresClarification ? null : selectedSkill?.id ?? null,
        skillVersion: routingDecision.requiresClarification ? null : selectedSkill?.version ?? null,
        operationId: routingDecision.requiresClarification ? null : operation.operationId,
        operationVersion: routingDecision.requiresClarification ? null : operation.version,
        routingStage: routingDecision.stage,
        routingConfidence: operation.confidence,
        routingConfidenceBand: routingDecision.candidates.find((candidate) => candidate.operationId === operation.operationId)?.confidenceBand
          ?? (operation.confidence >= 0.9 ? 'HIGH' : operation.confidence >= 0.45 ? 'MEDIUM' : 'LOW'),
        entityResolutionOutcome: routedEntityResolution?.outcome ?? 'NOT_REQUIRED',
        entityConfidenceBand: routedEntityResolution?.confidenceBand ?? null,
        entityReasonCodes: routedEntityResolution?.reasonCodes ?? [],
        language: routingDecision.language,
        languageContractVersion: normalizedRoutingMessage.contractVersion,
        normalizedMessageHash: createHash('sha256').update(normalizedRoutingMessage.normalized).digest('hex').slice(0, 16),
        retrievalMode: routingDecision.stage === 'LOCAL_CLASSIFIER' || routingDecision.stage === 'CLARIFICATION' ? 'HYBRID_LOCAL' : 'DETERMINISTIC',
        retrievalPath: routingDecision.candidates[0]?.retrievalPath ?? 'DETERMINISTIC',
        routingCalibrationVersion: routingDecision.candidates[0]?.calibrationVersion ?? null,
        routingRawScore: routingDecision.candidates[0]?.rawConfidence ?? null,
        classifierMode: controls.constrainedClassifierEnabled ? 'CONSTRAINED_LOCAL' : 'DISABLED',
        operationSemanticVersion: routingDecision.requiresClarification ? null : operationDefinition.semantic.semanticVersion,
        operationSemanticIndexVersion: askOperationSemanticIndexVersion(routingDecision.language),
        candidateOperationIds: routingDecision.candidates.map((candidate) => candidate.operationId),
        candidateReasonCodes: routingDecision.candidates.flatMap((candidate) => candidate.reasonCodes ?? []),
        skillRoutingOutcome: skillRoutingDecision.outcome,
        skillRoutingReasonCode: stableSkillRoutingReasonCode(skillRoutingDecision.outcome),
        skillRoutingPath: skillRoutingDecision.path,
        semanticIndexVersion: skillRoutingDecision.semanticIndexVersion,
        skillCandidateIds: skillRoutingDecision.skillCandidates.map((candidate) => candidate.skillId),
      }),
    },
  });
  if (followUp.sourceExecutionId) {
    await prisma.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'FOLLOW_UP_RESOLVED', metadataJson: asInputJson({ sourceExecutionId: followUp.sourceExecutionId, forcedOperation: shouldForceOperation }) },
    });
  }
  const startedAt = Date.now();
  // A clarification-in-progress execution hasn't actually resolved to
  // `operation` yet — that's just the routing cascade's placeholder/best
  // guess among ambiguous candidates. Recording its family here would
  // mislabel a genuinely ambiguous turn as belonging to whatever family
  // the placeholder happens to carry (typically GENERAL_HOME_GUIDANCE),
  // undercounting true CLARIFICATION volume in analytics.
  const storedIntentFamily = routingDecision.requiresClarification ? 'CLARIFICATION' : operation.family;
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      skillId: selectedSkillBinding?.skill.id ?? null,
      skillVersion: selectedSkillBinding?.skill.version ?? null,
      skillDomain: selectedSkillBinding?.skill.domain ?? null,
      skillBindingJson: selectedSkillBinding ? asInputJson(selectedSkillBinding) : undefined,
      operationId: operation.operationId,
      operationVersion: operation.version,
      intentFamily: storedIntentFamily,
      intentConfidence: operation.confidence,
      status: 'RUNNING',
    },
  });
  // External review [P2]: an organically-typed filter refinement (no
  // declared chip -- e.g. typing "only show urgent tasks" after a
  // maintenance list) is resolved server-side via
  // resolveAskFollowUpMessage/followUp.sourceExecutionId, but the call
  // below only ever forwarded input.launchContext -- the CLIENT's own
  // launch context, which carries no sourceExecutionId for a typed
  // message. maintenance.status's handler only loads the stored viewState
  // when launchContext.sourceExecutionId is present, so every organic
  // refinement reset resultId/revision and lost local view state
  // (selection/expansion/pagination) even though the identical refinement
  // via a declared chip already worked (the client sets sourceExecutionId
  // itself for those). Prefer an already-declared sourceExecutionId when
  // present -- for a declared chip, resolveAskFollowUpMessage's pinned
  // lookup found the SAME row by that id, so the two never actually
  // disagree; this only fills the gap for organic follow-ups.
  const effectiveLaunchContext = safetyFirstDecision.stage === 'SAFETY'
    ? undefined
    : (followUp.sourceExecutionId && !input.launchContext?.sourceExecutionId)
      ? { ...(input.launchContext ?? { surface: 'ASK_FOLLOW_UP' }), sourceExecutionId: followUp.sourceExecutionId }
      : input.launchContext;
  try {
    const rawResult = await withAskTimeout(
      routingDecision.requiresClarification
        ? Promise.resolve(routingClarificationResult(
          routingDecision,
          skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL' || skillRoutingDecision.outcome === 'AMBIGUOUS_OPERATION'
            ? 'ASK_SKILL_AMBIGUOUS'
            : 'ASK_ROUTING_AMBIGUOUS',
        ))
        : executeOperation({ userId, sessionId: session.id, executionId: execution.id, message: routingMessage, propertyId: executionPropertyId, operation, launchContext: effectiveLaunchContext, continuationCursor: followUp.continuationCursor, suppliedInput: followUp.suppliedInput, deferSemanticValidation: true }, skillTelemetryTrace),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC' && !routingDecision.requiresClarification
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled, skillTelemetryTrace)
      : rawResult;
    const validation = routingDecision.requiresClarification
      ? null
      : validateAskAnswerTrustPipeline({ question: routingMessage, operationId: operation.operationId, result: presentedResult, propertyId: executionPropertyId, semanticEnabled: controls.semanticResponseValidatorEnabled, language: routingDecision.language });
    const result = validation?.result ?? presentedResult;
    if (validation) recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result, skillTelemetryTrace);
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        // RES-003/MAINT-003: only a bare filter refinement (not entity/
        // pagination/specialist/monitor continuations, which are legitimate
        // separate answers) is marked so the frontend can update the prior
        // card's surface instead of appending a duplicate list.
        // This is a brand-new execution row (execution.resultJson is null
        // at this point), so continuesExecutionId is a fresh assignment
        // from this turn's own follow-up resolution, not a preserved value
        // -- only originalResponse comes from the shared history policy.
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, continuesExecutionId: followUp.isFilterRefinement ? followUp.sourceExecutionId : null, originalResponse: preservedExecutionHistory(execution.resultJson, result.blocks).originalResponse }),
        completedAt,
      },
    });
    if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: operation.operationId, outcome: 'PROMPTED' }, result.captureRequests.length);
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ skillId: selectedSkill?.id ?? null, skillVersion: selectedSkill?.version ?? null, operationId: operation.operationId, operationVersion: operation.version, blockTypes: result.blocks.map((block) => block.type) }) } });
    if (validation) await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired, sourceCompletionState: validation.trust.checks.sourceIntegrity }) } });
    await prisma.askExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'SKILL_EXECUTION_TELEMETRY',
        metadataJson: asInputJson(buildSkillExecutionTelemetry({
          routing: skillRoutingDecision,
          binding: selectedSkillBinding,
          operationId: routingDecision.requiresClarification ? null : operation.operationId,
          operationVersion: routingDecision.requiresClarification ? null : operation.version,
          executionMode: routingDecision.requiresClarification ? 'CLARIFICATION' : operationDefinition.executionMode,
          effectiveRiskPolicy: routingDecision.requiresClarification ? null : selectedSkill?.riskPolicy ?? null,
          resultStatus: result.status,
          errorCode: null,
          totalLatencyMs: Date.now() - startedAt,
          trace: skillTelemetryTrace,
        })),
      },
    });
    askExecutionsTotal.inc({ operation: operation.operationId, status: result.status, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    const resolvedProperty = await propertySummary(executionPropertyId);
    // Ask Cozy Stage 3, Phase 3 (implementation plan §9's extraction-trigger
    // call site; FRD §10 Turn Processing Contract steps 7-8). Independent of
    // the routed answer above (FRD §10: "Steps 6 and 8 are independent --
    // routing succeeding or failing does not gate extraction"). Code review
    // finding (2026-09-13): this previously also skipped extraction whenever
    // routing needed clarification or the routed operation itself returned
    // NEEDS_CONFIRMATION -- an invented UX simplification, not something the
    // FRD asked for, and it silently discarded an independent home fact
    // stated in the same message as an ambiguous or confirmation-requiring
    // command (e.g. "Turn on the AC, and I replaced the roof last summer for
    // $14,500" would lose the roof fact entirely). childExecutions already
    // supports multiple simultaneous confirmation cards in one turn by
    // design (bounded to 3) -- there is no real stacking conflict to avoid.
    // The only remaining gate is executionPropertyId, since extraction needs
    // a property to write facts/events to.
    let childExecutionResponses: AskExecutionResponse[] = [];
    if (executionPropertyId) {
      try {
        const capturedChildren = await runConversationalCaptureForTurn({
          userId,
          sessionId: session.id,
          propertyId: executionPropertyId,
          parentExecutionId: execution.id,
          message: input.message,
          contextVersion: result.contextVersion ?? saved.contextVersion,
          skipDueToRoutedCapture: operationDefinition.safetyClass === 'MATERIAL_DECISION' && result.status === 'COMPLETED',
        });
        childExecutionResponses = capturedChildren.map((child) => mapPersistedExecution(child, resolvedProperty));
      } catch (error) {
        logger.warn({ error, executionId: execution.id }, "[ask-conversational-capture] failed to attach captured children to this turn's response");
      }
    }
    return mapPersistedExecution(saved, resolvedProperty, childExecutionResponses);
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const errorCode = caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED';
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode,
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: askFailureBlocks(caught, retryable),
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, askFailureBlocks(caught, retryable)),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: failureStatus, metadataJson: asInputJson({ skillId: selectedSkill?.id ?? null, skillVersion: selectedSkill?.version ?? null, operationId: operation.operationId, operationVersion: operation.version }) } });
    await prisma.askExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'SKILL_EXECUTION_TELEMETRY',
        metadataJson: asInputJson(buildSkillExecutionTelemetry({
          routing: skillRoutingDecision,
          binding: selectedSkillBinding,
          operationId: routingDecision.requiresClarification ? null : operation.operationId,
          operationVersion: routingDecision.requiresClarification ? null : operation.version,
          executionMode: routingDecision.requiresClarification ? 'CLARIFICATION' : operationDefinition.executionMode,
          effectiveRiskPolicy: routingDecision.requiresClarification ? null : selectedSkill?.riskPolicy ?? null,
          resultStatus: failureStatus,
          errorCode,
          totalLatencyMs: Date.now() - startedAt,
          trace: skillTelemetryTrace,
        })),
      },
    });
    askExecutionsTotal.inc({ operation: operation.operationId, status: failureStatus, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    return mapPersistedExecution(saved, await propertySummary(executionPropertyId));
  }
}

export async function submitAskClarification(userId: string, executionId: string, input: SubmitAskClarification): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const priorReceipt = parameters.clarificationReceipt;
  if (priorReceipt && typeof priorReceipt === 'object' && !Array.isArray(priorReceipt)
    && (priorReceipt as Record<string, unknown>).idempotencyKey === input.idempotencyKey) {
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const clarification = parameters.clarification;
  if (!['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'].includes(execution.status) || !clarification || typeof clarification !== 'object' || Array.isArray(clarification)) {
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  const savedClarification = clarification as Record<string, unknown>;
  const expiresAt = typeof savedClarification.expiresAt === 'string' ? new Date(savedClarification.expiresAt) : null;
  if (savedClarification.version !== input.clarificationVersion || !expiresAt || expiresAt <= new Date()) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED',
        reasonCode: 'ASK_CLARIFICATION_EXPIRED',
        completedAt: new Date(),
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{ type: 'SUMMARY', id: 'clarification-expired', title: 'This clarification expired', body: 'Ask the question again so the answer uses current home records and routing rules.', tone: 'CAUTION', actions: [] }],
          captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
          ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY' as const, id: 'clarification-expired', title: 'This clarification expired', body: 'No action was performed.', tone: 'CAUTION' as const, actions: [] }]),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CLARIFICATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  const candidateOperationIds = Array.isArray(savedClarification.candidateOperationIds)
    ? savedClarification.candidateOperationIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (input.operationId && !candidateOperationIds.includes(input.operationId)) {
    const error = new Error('The selected clarification option is invalid.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_INVALID_OPTION';
    throw error;
  }
  const controls = readAskOperationalControls();
  const clarifiedMessage = input.answer ? `${execution.message}\nClarification: ${input.answer}` : execution.message;
  const safetyOnlyDecision = resolveAskRoutingCascade(clarifiedMessage, { localRoutingEnabled: false, embeddingRetrievalEnabled: false });
  const clarifiedPropertyId = propertyScopeForAskRouting(safetyOnlyDecision, execution.propertyId);
  const clarifiedAccess = clarifiedPropertyId ? await ensurePropertyAccess(userId, clarifiedPropertyId) : null;
  const clarificationEligibleOperationIds = await discoverableAskOperationIds({
    propertyId: clarifiedPropertyId, propertyAccess: clarifiedAccess, controls,
  });
  const safetyDecision = safetyOnlyDecision.stage === 'SAFETY'
    ? safetyOnlyDecision
    : resolveAskRoutingCascade(clarifiedMessage, {
      localRoutingEnabled: controls.localRoutingEnabled && controls.semanticRetrievalEnabled,
      embeddingRetrievalEnabled: controls.embeddingRetrievalEnabled,
      localMinimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
      classifierEnabled: controls.constrainedClassifierEnabled,
      eligibleOperationIds: clarificationEligibleOperationIds,
      propertyId: clarifiedPropertyId,
    });
  if (input.operationId && !clarificationEligibleOperationIds.includes(input.operationId as AskOperationId)) {
    const error = new Error('That home workflow is no longer available for the selected home and household role. Choose another option or ask again.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_OPTION_UNAVAILABLE';
    throw error;
  }
  let operation: AskOperationResolution;
  if (safetyDecision.stage === 'SAFETY') {
    operation = safetyDecision.operation;
  } else if (input.operationId) {
    operation = { ...getAskOperationDefinition(input.operationId as AskOperationId), confidence: 1 };
  } else if (candidateOperationIds.length === 1) {
    operation = { ...getAskOperationDefinition(candidateOperationIds[0] as AskOperationId), confidence: 1 };
  } else {
    if (safetyDecision.requiresClarification) {
      const error = new Error('Add one more specific detail so Ask can choose the correct home workflow.');
      (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_UNRESOLVED';
      throw error;
    }
    operation = safetyDecision.operation;
  }
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const clarifiedSkill = getSkillForOperation(operation.operationId);
  const clarifiedSkillBinding = clarifiedSkill
    ? buildSkillExecutionBinding({
      skill: clarifiedSkill,
      operationId: operation.operationId,
      consumer: 'ASK',
      routingPath: 'CLARIFICATION',
      routingReasonCodes: ['HOMEOWNER_CLARIFIED'],
      semanticIndexVersion: null,
    })
    : null;
  const claimed = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: { in: ['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'] } },
    data: {
      skillId: clarifiedSkillBinding?.skill.id ?? null,
      skillVersion: clarifiedSkillBinding?.skill.version ?? null,
      skillDomain: clarifiedSkillBinding?.skill.domain ?? null,
      skillBindingJson: clarifiedSkillBinding ? asInputJson(clarifiedSkillBinding) : undefined,
      propertyId: clarifiedPropertyId,
      operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING',
      parametersJson: asInputJson({ ...parameters, clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion } }),
    },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.askExecution.findFirst({ where: { id: execution.id, userId } });
    if (latest) return mapPersistedExecution(latest, await propertySummary(latest.propertyId));
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  try {
    const rawResult = await withAskTimeout(
      executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: clarifiedMessage, propertyId: clarifiedPropertyId, operation, deferSemanticValidation: true }),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC'
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const validation = validateAskAnswerTrustPipeline({
      question: clarifiedMessage,
      operationId: operation.operationId,
      result: presentedResult,
      propertyId: clarifiedPropertyId,
      semanticEnabled: controls.semanticResponseValidatorEnabled,
      recoveryAttempted: true,
      operationConfirmedByUser: Boolean(input.operationId),
    });
    const result = validation.result;
    recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result);
    const nextParameters = {
      ...(result.parameters ?? {}),
      clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion },
    };
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: asInputJson(nextParameters),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CLARIFICATION_SUBMITTED', metadataJson: asInputJson({ operationId: operation.operationId }) } });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired }) } });
    return mapPersistedExecution(saved, await propertySummary(clarifiedPropertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const failureBlocks = askFailureBlocks(caught, retryable);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED',
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: failureBlocks,
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, failureBlocks),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: failureStatus, metadataJson: asInputJson({ stage: 'CLARIFICATION_RESUME' }) } });
    return mapPersistedExecution(saved, await propertySummary(clarifiedPropertyId));
  }
}

// A NEEDS_PROPERTY execution already resolved a registered operation before
// discovering it requires a property; the only missing input is which home.
// This resumes the SAME execution once a property is supplied, instead of
// forcing the homeowner to restate the question as a brand-new execution.
export async function resolveAskExecutionProperty(userId: string, executionId: string, input: ResolveAskExecutionProperty): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  if (execution.status !== 'NEEDS_PROPERTY' || !execution.operationId) {
    const error = new Error('This request no longer needs a home selection.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_SELECTION_NOT_ACTIVE';
    throw error;
  }
  await ensurePropertyAccess(userId, input.propertyId);
  await enterAskPropertyTimezoneContext(input.propertyId);
  const operationDefinition = getAskOperationDefinition(execution.operationId as AskOperationId);
  const operation: AskOperationResolution = { ...operationDefinition, confidence: execution.intentConfidence ?? 1 };
  const claimed = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: 'NEEDS_PROPERTY' },
    data: { propertyId: input.propertyId, status: 'RUNNING' },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.askExecution.findFirst({ where: { id: execution.id, userId } });
    if (latest) return mapPersistedExecution(latest, await propertySummary(latest.propertyId));
    const error = new Error('This request no longer needs a home selection.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_SELECTION_NOT_ACTIVE';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { propertyId: input.propertyId, lastActiveAt: new Date() } });
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'PROPERTY_SELECTED', metadataJson: asInputJson({ propertyId: input.propertyId }) } });
  const controls = readAskOperationalControls();
  try {
    const rawResult = await withAskTimeout(
      executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: input.propertyId, operation, deferSemanticValidation: true }),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC'
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const validation = validateAskAnswerTrustPipeline({ question: execution.message, operationId: operation.operationId, result: presentedResult, propertyId: input.propertyId, semanticEnabled: controls.semanticResponseValidatorEnabled });
    const result = validation.result;
    recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, stage: 'PROPERTY_RESUME' }) } });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const failureBlocks = askFailureBlocks(caught, retryable);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED',
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: failureBlocks,
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, failureBlocks),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: failureStatus, metadataJson: asInputJson({ stage: 'PROPERTY_RESUME' }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  }
}

// Capture missing context through canonical validation and receipts, then
// refresh the recommendation from the updated property record.
async function submitNextActionMissingFactCapture(
  userId: string,
  execution: NonNullable<Awaited<ReturnType<typeof prisma.askExecution.findFirst>>>,
  input: SubmitAskCaptureRequest,
): Promise<AskExecutionResponse> {
  const propertyId = execution.propertyId!;
  const registryCapture = input.captureKey.startsWith(NEXT_ACTION_CONTEXT_PREFIX);
  if (!registryCapture && execution.contextVersion !== input.expectedContextVersion) {
    const error = new Error('This property record changed since this prompt was shown. Ask again to see the current state.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { schemaVersion?: unknown; blocks?: unknown[]; captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }>; confirmation?: unknown; clarification?: unknown; suggestions?: unknown[]; skillHandoff?: unknown }
    : {};
  const captureIdempotencyKey = 'ask-next:' + createHash('sha256').update(JSON.stringify([execution.id, input.captureKey, input.idempotencyKey])).digest('hex');
  const previous = registryCapture ? await prisma.propertyContextCaptureReceipt.findUnique({
    where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey: captureIdempotencyKey } },
  }) : null;
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active && !previous) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const answer = input.answer as { factKey?: unknown; value?: unknown };
  const factKey = registryCapture ? input.captureKey.slice(NEXT_ACTION_CONTEXT_PREFIX.length) : typeof answer.factKey === 'string' ? answer.factKey : null;
  if (!factKey || (!registryCapture && !(factKey in NEXT_ACTION_FACT_QUESTIONS))) {
    const error = new Error('This fact is no longer eligible for this quick capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'SUBMITTED' });
  let capture: { contextVersion: string };
  const definition = factKey ? getCaptureDefinitionForFact(factKey) : undefined;
  if (definition && definition.sensitivity !== 'STANDARD' && !input.sensitiveDataConfirmed) {
    throw Object.assign(new Error('Confirm that you want to save this sensitive home information.'), { code: 'ASK_CAPTURE_CONFIRMATION_REQUIRED' });
  }
  try {
    if (registryCapture) {
      if (!definition) throw new Error('No registered capture exists for this fact.');
      const result = await captureFeatureContext(propertyId, userId, {
        featureKey: 'ASK_NEXT_ACTION', operationKey: nextActionContextOperation(factKey),
        captureKey: definition.captureKey, requirementId: input.requirementId,
        expectedContextVersion: input.expectedContextVersion,
        idempotencyKey: captureIdempotencyKey, answer: input.answer,
      });
      if (!result || typeof result !== 'object' || Array.isArray(result) || !('contextVersion' in result) || typeof result.contextVersion !== 'string') {
        throw new Error('Canonical capture returned an invalid receipt.');
      }
      capture = { contextVersion: result.contextVersion };
      if (!active && previous) return mapPersistedExecution(execution, await propertySummary(propertyId));
    } else capture = await capturePropertyFact(propertyId, userId, factKey, {
      value: answer.value,
      sourceType: 'USER_REPORTED',
      attribution: 'FIRSTHAND',
      captureChannel: 'ASK_NEXT_ACTION',
      captureExecutionId: execution.id,
    });
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  // A refresh failure must not resurrect stale readiness after a durable save.
  let refreshedBlocks = (stored.blocks ?? []).filter((block) => !(block && typeof block === 'object' && (block as { id?: unknown }).id === 'ask-next-actions'));
  let refreshedCaptureRequests = (stored.captureRequests ?? []).filter((request) => request.requirementId !== input.requirementId);
  try {
    if (execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS) {
      const recent = await prisma.askExecution.findMany({
        where: { sessionId: execution.sessionId, userId, id: { not: execution.id }, status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { operationId: true },
      });
      const recentCompletedCapabilityIds = new Set(
        recent
          .map((item) => (item.operationId ? ASK_OPERATION_CAPABILITY[item.operationId as AskOperationId] : undefined))
          .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
      );
      const launchContextRaw = execution.launchContextJson && typeof execution.launchContextJson === 'object' && !Array.isArray(execution.launchContextJson)
        ? execution.launchContextJson as { actionId?: unknown; journeyId?: unknown; entityType?: unknown; entityId?: unknown }
        : null;
      const nextActions = await buildAskNextActionsBlock({
        propertyId,
        userId,
        operationId: execution.operationId as AskOperationId,
        message: execution.message,
        recentCompletedCapabilityIds,
        launchContext: launchContextRaw ? {
          actionId: typeof launchContextRaw.actionId === 'string' ? launchContextRaw.actionId : null,
          journeyId: typeof launchContextRaw.journeyId === 'string' ? launchContextRaw.journeyId : null,
          entityType: typeof launchContextRaw.entityType === 'string' ? launchContextRaw.entityType : null,
          entityId: typeof launchContextRaw.entityId === 'string' ? launchContextRaw.entityId : null,
        } : null,
        contextVersion: capture.contextVersion,
      });
      refreshedBlocks = (stored.blocks ?? []).filter((block) => !(block && typeof block === 'object' && (block as { type?: unknown; id?: unknown }).type === 'CAPABILITY_LIST' && (block as { type?: unknown; id?: unknown }).id === 'ask-next-actions'));
      if (nextActions.block) refreshedBlocks.push(nextActions.block);
      // nextActions.captureRequests is at most one (buildAskNextActionsBlock's
      // own bound) -- refreshedCaptureRequests is otherwise already empty at
      // this point (the one requirement this function handles is always
      // filtered above), so this never risks exceeding the shared 3-item cap.
      refreshedCaptureRequests = [...refreshedCaptureRequests, ...nextActions.captureRequests.filter((request) => !(answer.value === null && request.requirementId === input.requirementId))];
    }
  } catch (error) {
    logger.warn({ error, executionId: execution.id }, '[submitNextActionMissingFactCapture] next-actions recompute failed; removed stale recommendations');
  }
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      contextVersion: capture.contextVersion,
      resultJson: asInputJson({
        schemaVersion: stored.schemaVersion ?? ASK_RESPONSE_SCHEMA_VERSION,
        blocks: refreshedBlocks,
        // The fulfilled requirement is removed rather than kept around
        // answered -- this captureRequest is a one-shot prompt, not a
        // form the homeowner can revisit, matching allowNotSure's own
        // "dismiss, don't re-ask" framing on the frontend.
        captureRequests: refreshedCaptureRequests,
        confirmation: stored.confirmation ?? null,
        clarification: stored.clarification ?? null,
        suggestions: stored.suggestions ?? [],
        skillHandoff: stored.skillHandoff ?? null,
        ...preservedExecutionHistory(execution.resultJson, refreshedBlocks as AskPresentationBlock[]),
      }),
    },
  });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureKey: input.captureKey, factKey, canonicalOwner: 'PropertyContext' }) },
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
  return mapPersistedExecution(saved, await propertySummary(propertyId));
}

export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await ensurePropertyAccess(userId, execution.propertyId);
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  // External review, 2026-09-13 (FRD §27's "tell me about X" requirement --
  // see askNextActions.ts's own header comment on NEXT_ACTION_FACT_QUESTIONS).
  // Handled entirely separately from the operationId-keyed dispatch below:
  // this captureRequest is attached to an execution's next-actions block,
  // for a DIFFERENT, not-yet-run capability than whatever operation was
  // actually routed this turn -- none of the "recompute THIS SAME operation
  // with newly-captured context" machinery every branch below performs
  // applies here (the routed answer already given stays exactly as given).
  // Bypasses that dispatch's own operationId allowlist entirely, since a
  // next-actions prompt can attach to ANY routed operation's turn, not just
  // the capture-capable subset that allowlist exists for.
  if (input.captureKey === NEXT_ACTION_MISSING_FACT_CAPTURE_KEY || input.captureKey.startsWith(NEXT_ACTION_CONTEXT_PREFIX)) {
    return submitNextActionMissingFactCapture(userId, execution, input);
  }
  const registeredOperationId = execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS
    ? execution.operationId as AskOperationId
    : null;
  if (registeredOperationId) {
    const controls = readAskOperationalControls();
    const unavailableReason = skillRuntimeUnavailableReason(registeredOperationId, controls);
    if (unavailableReason) {
      const unavailable = operationalUnavailableResult(unavailableReason);
      const saved = await prisma.askExecution.update({
        where: { id: execution.id },
        data: {
          status: unavailable.status,
          reasonCode: unavailable.reasonCode,
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: unavailable.blocks,
            captureRequests: [],
            confirmation: null,
            clarification: null,
            suggestions: unavailable.suggestions,
            ...preservedExecutionHistory(execution.resultJson, unavailable.blocks),
          }),
          completedAt: new Date(),
        },
      });
      const skill = getSkillForOperation(registeredOperationId);
      await prisma.askExecutionEvent.create({
        data: { executionId, eventType: unavailableReason, metadataJson: asInputJson({ skillId: skill?.id ?? null, stage: 'CAPTURE_SUBMISSION' }) },
      });
      return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
    }
  }
  const answerHash = createHash('sha256').update(JSON.stringify({ captureKey: input.captureKey, answer: input.answer, sensitiveDataConfirmed: input.sensitiveDataConfirmed ?? false })).digest('hex');
  const previousCapture = await prisma.askCaptureReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
  });
  if (previousCapture) {
    if (previousCapture.answerHash !== answerHash) {
      const error = new Error('The idempotency key was already used for a different inline answer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    // Code review finding (2026-09-13, [P1]): capture-edit operations
    // (CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM/CAPTURE_WARRANTY_CONFIRM)
    // are never routable via resolveAskOperation -- they are only ever
    // created programmatically by conversationalCapture.ts, never proposed
    // from a raw homeowner message. Replaying through resolveAskOperation +
    // executeOperation below would reroute the candidate's own
    // sourceSentence (stored as execution.message, e.g. "My home was built
    // in 1998.") through the full deterministic/semantic router as if it
    // were a brand-new incoming Ask message, silently overwriting the
    // already-persisted, correctly-edited confirmation card with an
    // unrelated result. This branch exists purely for idempotent replay of
    // an already-successful submission -- the execution row already
    // reflects that success, so return it directly instead of re-executing
    // anything.
    // The Home Event Radar forms (FRD v1.41) are the same: their canned message is only honored with its declared
    // launchContext, which a replay does not have, so re-executing would replace the review card with a boundary.
    if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM' || execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES') {
      askInlineCapturesTotal.inc({ operation: execution.operationId, outcome: 'RESUMED' });
      return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
    }
    const operation = resolveAskOperation(execution.message);
    const replayed = await executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation });
    const resumed = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: replayed.status,
        reasonCode: replayed.reasonCode,
        contextVersion: replayed.contextVersion ?? previousCapture.contextVersion,
        parametersJson: replayed.parameters ? asInputJson(replayed.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: replayed.blocks, captureRequests: replayed.captureRequests ?? [], confirmation: replayed.confirmation ?? null, clarification: replayed.clarification ?? null, suggestions: replayed.suggestions, skillHandoff: replayed.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, replayed.blocks) }),
        completedAt: terminalStatus(replayed.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'CAPTURE_RESUME_RETRIED', metadataJson: asInputJson({ captureKey: input.captureKey, resumedStatus: replayed.status }) } });
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
    if (replayed.captureRequests?.some((request) => request.captureKey === input.captureKey)) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
    if (replayed.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, replayed.captureRequests.length);
    return mapPersistedExecution(resumed, await propertySummary(execution.propertyId));
  }
  if (!['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'HOUSEHOLD_INVITATION', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'ROOM_CREATE', 'INVENTORY_ITEM_CREATE', 'HOME_EVENT_RADAR_TASK', 'HOME_EVENT_RADAR_PREFERENCES', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'CLAIM_FILE', 'HOME_DEADLINE_MONITOR', 'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'COVERAGE_GAPS', 'CAPTURE_FACT_CONFIRM', 'CAPTURE_EVENT_CONFIRM', 'CAPTURE_WARRANTY_CONFIRM'].includes(execution.operationId ?? '')) {
    const error = new Error('This execution does not have an active inline capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'SUBMITTED' });

  let captureId: string;
  let capturedContextVersion: string;
  let result: AskOperationResult;
  let canonicalOwner: string;
  if (execution.operationId === 'CAPITAL_RESERVE_PLAN' || execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS') {
    const tax = execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS';
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const capitalTimeline = !tax && parameters.phase5CaptureFeature === 'CAPITAL_TIMELINE';
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: tax ? 'TAX_APPEAL' : capitalTimeline ? 'CAPITAL_TIMELINE' : 'RESERVE_FUND',
      operationKey: tax ? 'RUN_ANALYSIS' : capitalTimeline ? 'RUN_TIMELINE' : 'RECALCULATE',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'SAVINGS_OPPORTUNITIES') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_SAVINGS',
      operationKey: 'RUN_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'OWNERSHIP_COSTS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'OWNERSHIP_COSTS',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'INVENTORY_LOOKUP') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'PROPERTY_SUMMARY') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'PROPERTY_RECORD_SUMMARY',
      operationKey: 'VIEW_SUMMARY',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'HOME_ACTIONS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_ACTIONS',
      operationKey: 'VIEW_FEED',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'COVERAGE_GAPS') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    if (typeof parameters.inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this coverage capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'COVERAGE_INTELLIGENCE',
      operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: parameters.inventoryItemId,
        responsibilityScope: parameters.responsibilityScope,
        hasDisclosedEstimate: parameters.hasDisclosedEstimate,
      },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'SELL_HOLD_RENT_ANALYSIS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'SELL_HOLD_RENT',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'MAINTENANCE_TASK_COMPLETE') {
    if (input.captureKey !== 'MAINTENANCE_COMPLETION_INPUTS') {
      const error = new Error('This maintenance completion capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceCompletionWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Select an open task and enter a valid actual cost and outcome.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await maintenanceTaskCompleteResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'MAINTENANCE_TASK_CREATE') {
    if (input.captureKey !== 'MAINTENANCE_TASK_INPUTS') {
      const error = new Error('This maintenance task capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a task name and valid priority, schedule, recurrence, and estimate.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await maintenanceTaskCreateResult(
      userId,
      execution.propertyId,
      execution.message,
      candidate.data,
      typeof parameters.sourceExecutionId === 'string' ? parameters.sourceExecutionId : null,
    );
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'ROOM_CREATE') {
    if (input.captureKey !== ROOM_CREATE_CAPTURE_KEY) {
      const error = new Error('This room capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add a room.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = roomCreateContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This form is out of date. Start again from the Add a room button.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RoomCreateInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Choose a room type and enter a name of up to 80 characters; a floor level, if given, must be a whole number from -5 to 50.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await roomCreateResult(userId, execution.propertyId, candidate.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'InventoryRoom';
  } else if (execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES') {
    const isTask = execution.operationId === 'HOME_EVENT_RADAR_TASK';
    if (input.captureKey !== (isTask ? RADAR_TASK_CAPTURE_KEY : RADAR_PREFERENCES_CAPTURE_KEY)) {
      throw radarCaptureError('This Home Event Radar form is no longer active.', 'ASK_CAPTURE_NOT_ACTIVE');
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      throw radarCaptureError(isTask ? 'A contributor or owner is required to plan radar actions.' : 'A contributor or owner is required to change radar notification settings in Ask.', 'ASK_PERMISSION_REQUIRED');
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const sourceExecutionId = typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null;
    if (isTask) {
      const target = RadarTaskTargetSchema.safeParse(storedParameters.radarTaskTarget);
      if (!target.success) throw radarCaptureError('This Home Event Radar form is no longer active.', 'ASK_CAPTURE_NOT_ACTIVE');
      const currentVersion = radarTaskContextVersion(target.data);
      if (currentVersion !== input.expectedContextVersion) throw radarCaptureError('This form is out of date. Start again from "Plan this action".', 'ASK_CONTEXT_VERSION_CONFLICT');
      const answer = RadarTaskAnswerSchema.safeParse(input.answer);
      if (!answer.success) throw radarCaptureError('Choose what to do; a due date must be a date and a due time a 24-hour HH:mm time.');
      result = await radarTaskFormResult(userId, execution.propertyId, target.data, answer.data, sourceExecutionId);
      capturedContextVersion = currentVersion;
      canonicalOwner = 'PropertyRadarTaskLink';
    } else {
      const currentVersion = radarPreferencesContextVersion(await radarNotificationPreferenceService.get(execution.propertyId, userId));
      if (currentVersion !== input.expectedContextVersion) throw radarCaptureError('Your notification settings changed while this form was open. Start again from "Notification settings".', 'ASK_CONTEXT_VERSION_CONFLICT');
      result = await radarPreferencesFormResult(userId, execution.propertyId, radarPreferencesBodyFromAnswer(input.answer), sourceExecutionId);
      capturedContextVersion = currentVersion;
      canonicalOwner = 'PropertyRadarNotificationPreference';
    }
    captureId = input.idempotencyKey;
  } else if (execution.operationId === 'INVENTORY_ITEM_CREATE') {
    if (input.captureKey !== INVENTORY_CREATE_CAPTURE_KEY) {
      const error = new Error('This inventory capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add an inventory item.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await inventoryCreateContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('The rooms in this home changed while the form was open. Start again from the Add an item button.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = InventoryCreateInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a name of up to 120 characters and choose a category and a room (or "No room"); brand and model, if given, are up to 80 characters.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await inventoryItemCreateResult(userId, execution.propertyId, candidate.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE') {
    const state = areaCaptureStateFrom(execution.parametersJson);
    if (!state) {
      const error = new Error('This home-detail capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    result = await areaCaptureSubmitResult(userId, execution.propertyId, state.scope, new Set(state.skipFactKeys), state.sourceExecutionId, {
      requirementId: input.requirementId, captureKey: input.captureKey, answer: input.answer,
      expectedContextVersion: input.expectedContextVersion, sensitiveDataConfirmed: input.sensitiveDataConfirmed === true,
    });
    captureId = input.idempotencyKey;
    capturedContextVersion = input.expectedContextVersion;
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'CLAIM_FILE') {
    // P03 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
    // resumes claimFileResult with the structured answer from CLAIM_FILE_INPUTS
    // instead of re-parsing the original message. No live "workflow version"
    // exists to check for drift here (unlike Maintenance's task list) --
    // nothing about the property invalidates a not-yet-created draft claim --
    // so expectedContextVersion is just the same requirementId the capture
    // request was issued with; the generic `active` check above already
    // confirms it matches.
    if (input.captureKey !== 'CLAIM_FILE_INPUTS') {
      const error = new Error('This claim capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to file a claim.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const candidate = ClaimFileWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Choose an incident type and describe what happened.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await claimFileResult(execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = input.expectedContextVersion;
    canonicalOwner = 'Claim';
  } else if (execution.operationId === 'HOUSEHOLD_INVITATION') {
    if (input.captureKey !== 'HOUSEHOLD_INVITATION_INPUTS') {
      const error = new Error('This household invitation capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role !== HouseholdRole.OWNER) {
      const error = new Error('Only a household owner can prepare an invitation.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await householdWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Household access changed while this invitation was open. Review the current household and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = HouseholdInvitationInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a valid email address and choose Contributor or Viewer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await householdInvitationResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'HouseholdInviteWorkflow';
  } else if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM') {
    // Ask Cozy Stage 3, Phase 3 edit-before-confirm (FRD §22's own line:
    // "candidate payload is editable via the existing captureRequests/
    // suppliedInput mechanism before the confirm call, not a separate edit
    // endpoint"). Never writes to any domain model -- only rebuilds this
    // execution's own pending NEEDS_CONFIRMATION card with the edited
    // value(s); an actual confirm is still required afterward.
    const editCaptureKey = execution.operationId === 'CAPTURE_FACT_CONFIRM'
      ? 'CAPTURE_FACT_EDIT'
      : execution.operationId === 'CAPTURE_EVENT_CONFIRM'
        ? 'CAPTURE_EVENT_EDIT'
        : 'CAPTURE_WARRANTY_EDIT';
    // A user-added event resubmits its own form (CAPTURE_EVENT_ADD); every other pending entry edits through its
    // per-category edit key.
    const isEventAdd = execution.operationId === 'CAPTURE_EVENT_CONFIRM' && input.captureKey === EVENT_ADD_CAPTURE_KEY;
    if (!isEventAdd && input.captureKey !== editCaptureKey) {
      const error = new Error('This pending entry can no longer be edited.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const storedContextVersion = execution.contextVersion ?? 'unversioned';
    if (storedContextVersion !== input.expectedContextVersion) {
      const error = new Error('This pending entry changed since the form was opened. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    if (isEventAdd) {
      const built = buildUserAddedEventConfirmation(execution.parametersJson, storedContextVersion, input.answer, new Date());
      if ('error' in built) {
        const error = new Error(built.error);
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      result = built.result;
      captureId = input.idempotencyKey;
      capturedContextVersion = storedContextVersion;
      canonicalOwner = 'AskCaptureCandidateEdit';
    } else {
    const edited = execution.operationId === 'CAPTURE_FACT_CONFIRM'
      ? editCaptureFactCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date())
      : execution.operationId === 'CAPTURE_EVENT_CONFIRM'
        ? editCaptureEventCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date())
        : editCaptureWarrantyCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date());
    if (!edited) {
      const error = new Error('Enter a valid value for this field.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = edited;
    captureId = input.idempotencyKey;
    capturedContextVersion = storedContextVersion;
    canonicalOwner = 'AskCaptureCandidateEdit';
    }
  } else if (execution.operationId === 'HOME_DEADLINE_MONITOR') {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to update reminder dates.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    if (input.captureKey === 'HOME_DEADLINE_MAINTENANCE_DUE_DATE') {
      const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed task and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineTaskDueCaptureSchema.safeParse(input.answer);
      const task = candidate.success ? await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId, status: { not: MaintenanceTaskStatus.CANCELLED } } }) : null;
      if (!candidate.success || !task) {
        const error = new Error('Choose an open maintenance task and enter a valid future due date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      const updated = await PropertyMaintenanceTaskService.updateTask(userId, task.id, { nextDueDate: candidate.data.nextDueDate });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = maintenanceTaskVersion(updated);
      canonicalOwner = 'PropertyMaintenanceTask';
    } else if (input.captureKey === 'HOME_DEADLINE_EXPIRATION_DATE') {
      const policiesMissingExpiry = await prisma.insurancePolicy.findMany({
        where: { propertyId: execution.propertyId, expiryDate: null },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, carrierName: true, coverageType: true, updatedAt: true },
      });
      const currentVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Coverage records changed while this form was open. Review the refreshed choices and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineExpirationCaptureSchema.safeParse(input.answer);
      if (!candidate.success || !policiesMissingExpiry.some((policy) => policy.id === candidate.data?.policyId)) {
        const error = new Error('Choose an undated policy and enter a valid future expiration date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      await assertCoverageConflictFree(execution.propertyId, prisma, {
        insurancePolicyId: candidate.data.policyId,
      });
      const property = await prisma.property.findUnique({ where: { id: execution.propertyId }, select: { homeownerProfileId: true } });
      if (!property) {
        const error = new Error('The selected home is no longer available.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
        throw error;
      }
      await updateInsurancePolicy(candidate.data.policyId, property.homeownerProfileId, {
        expiryDate: new Date(`${candidate.data.expiryDate}T00:00:00.000Z`),
      });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = result.contextVersion ?? createHash('sha256').update(`${candidate.data.policyId}:${candidate.data.expiryDate}`).digest('hex');
      canonicalOwner = 'InsurancePolicy';
    } else {
      const error = new Error('This deadline capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
  } else if (execution.operationId === 'REPLACEMENT_GUIDANCE') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else {
    if (input.captureKey !== 'FINANCING_PROFILE_REFINANCE_INPUTS') {
      const error = new Error('This financing capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    if (input.sensitiveDataConfirmed !== true) {
      const error = new Error('Confirm the mortgage details before saving them to the Financing Profile.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_CONFIRMATION_REQUIRED';
      throw error;
    }
    const [currentContext, profile] = await Promise.all([
      getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR'),
      getProfile(execution.propertyId),
    ]);
    if (currentContext.contextVersion !== input.expectedContextVersion) {
      const error = new Error('The financing profile changed while this answer was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RefinanceProfileCaptureSchema.safeParse({
      currentMortgageBalanceUsd: input.answer.currentMortgageBalanceUsd ?? (profile?.currentMortgageBalanceCents == null ? undefined : profile.currentMortgageBalanceCents / 100),
      interestRatePct: input.answer.interestRatePct ?? (profile?.interestRateBps == null ? undefined : profile.interestRateBps / 100),
      remainingTermYears: input.answer.remainingTermYears ?? (profile?.remainingTermMonths == null ? undefined : profile.remainingTermMonths / 12),
      monthlyPaymentUsd: input.answer.monthlyPaymentUsd ?? (profile?.monthlyPaymentCents == null ? undefined : profile.monthlyPaymentCents / 100),
    });
    if (!candidate.success) {
      const error = new Error('Enter a valid balance, current rate, and remaining term.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    // Claim the idempotency receipt BEFORE the write, not after: previously
    // this branch called upsertProfile unconditionally and only recorded a
    // receipt afterward (a no-op upsert), so two concurrent submissions
    // (double-click, two tabs) could both pass the version check above and
    // both write, racing to a silent last-write-wins outcome. The unique
    // (executionId, idempotencyKey) create below is the same
    // claim-before-mutate compare-and-swap already used for command
    // confirmations (AskConfirmationReceipt) elsewhere in this file.
    let alreadyCaptured = false;
    try {
      await prisma.askCaptureReceipt.create({
        data: { executionId: execution.id, idempotencyKey: input.idempotencyKey, captureKey: input.captureKey, canonicalOwner: 'PropertyFinancingProfile', answerHash },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await prisma.askCaptureReceipt.findUnique({
        where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      });
      if (!existing || existing.answerHash !== answerHash) {
        const conflict = new Error('The idempotency key was already used for a different inline answer.');
        (conflict as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      // A concurrent request already claimed this exact answer and wrote
      // it (or is about to); skip the duplicate write and fall through to
      // recomputing the result from the now-current profile.
      alreadyCaptured = true;
    }
    if (!alreadyCaptured) {
      await upsertProfile(execution.propertyId, {
        currentMortgageBalanceCents: Math.round(candidate.data.currentMortgageBalanceUsd * 100),
        mortgageBalanceAsOfDate: input.answer.currentMortgageBalanceUsd === undefined ? undefined : new Date().toISOString(),
        interestRateBps: Math.round(candidate.data.interestRatePct * 100),
        remainingTermMonths: Math.max(1, Math.round(candidate.data.remainingTermYears * 12)),
        monthlyPaymentCents: candidate.data.monthlyPaymentUsd === undefined ? undefined : Math.round(candidate.data.monthlyPaymentUsd * 100),
      });
    }
    const nextContext = await getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR');
    captureId = input.idempotencyKey;
    capturedContextVersion = nextContext.contextVersion;
    if (!alreadyCaptured) {
      await prisma.askCaptureReceipt.update({
        where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
        data: { contextVersion: capturedContextVersion },
      });
    }
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyFinancingProfile';
  }
  // Code review finding (2026-09-13, [P1]): this used to be an unconditional
  // update keyed only on `id` -- if a concurrent request changed this
  // execution's status between the read at the top of this function and
  // this write (most concretely: confirmAskExecution claiming it into
  // RUNNING, or completing it, while this same request was still off
  // computing an edited result), this write would silently clobber that
  // newer state back to whatever `result.status` says (typically
  // NEEDS_CONFIRMATION again, with this attempt's own now-stale
  // parameters) -- resurrecting an already-confirmed-and-executed capture
  // into a fresh "pending confirmation" state with mismatched data. Guarded
  // exactly like the analogous races already fixed elsewhere in this file
  // (confirmAskExecution's own conflict-release and claim transitions): a
  // compare-and-swap against `execution.status` as read at the top of this
  // function, not an unconditional update. If the guard doesn't match,
  // something else already moved this execution past the status this
  // request expected -- fail closed rather than overwrite it.
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.askExecution.updateMany({
      where: { id: execution.id, status: execution.status },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion ?? capturedContextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    if (updated.count !== 1) {
      const error = new Error('This changed while your edit was being saved -- it may already be confirming or completed. Ask again to review the current state.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    await tx.askCaptureReceipt.upsert({
      where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      create: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner,
        answerHash,
        contextVersion: result.contextVersion ?? capturedContextVersion,
      },
      update: { contextVersion: result.contextVersion ?? capturedContextVersion },
    });
    await tx.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId, captureKey: input.captureKey, canonicalOwner, resumedStatus: result.status }) },
    });
    return tx.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
  if (result.captureRequests?.some((request) => request.captureKey === input.captureKey)) {
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
  }
  if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, result.captureRequests.length);
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function recordAskCaptureEvent(userId: string, executionId: string, input: RecordAskCaptureEvent): Promise<void> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, operationId: true, resultJson: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) return;
  await prisma.askExecutionEvent.create({
    data: { executionId, eventType: `CAPTURE_${input.event}`, metadataJson: asInputJson({ requirementId: input.requirementId, captureKey: input.captureKey }) },
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: input.event });
}

export async function recordAskCaptureFailure(executionId: string, outcome: 'CONFLICT' | 'PERMISSION_DENIED' | 'RESUME_FAILED'): Promise<void> {
  const execution = await prisma.askExecution.findUnique({ where: { id: executionId }, select: { operationId: true } });
  if (execution) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome });
}


// Ask Cozy Stage 3, Phase 2 (implementation plan section 8, item "New this
// revision (Section 4.9)"; FRD section 17). Replaces confirmAskExecution's former
// ~960-line domain-branching write-dispatch if/else chain with a
// confirm-time capability registry, mirroring Phase 1's propose-time
// migration exactly -- one thin registration per confirmation-required
// operation, handler bodies unchanged (moved verbatim, not rewritten),
// keyed by each command's own declared adapterKey
// (ASK_DOMAIN_COMMAND_REGISTRY, the authoritative source for all 25
// confirmation-required operations). confirmAskExecution's own claim/
// lease/authorization/completion lifecycle (FRD section 22) is untouched --
// only the per-operation write dispatch inside its try block moved.
async function confirmClaimFile(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const title = parameters.claimTitle;
    const type = parameters.claimType;
    const description = parameters.claimDescription;
    const sourceType = parameters.claimSourceType;
    if (typeof title !== 'string' || !title.trim() || typeof type !== 'string' || !CLAIM_TYPE_PATTERNS.some(([, candidate]) => candidate === type) && type !== 'OTHER') {
      const error = new Error('The draft claim details are no longer valid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const claim = await ClaimsService.createClaim(execution.propertyId, userId, {
      title: title.trim(), type: type as ClaimType,
      description: typeof description === 'string' ? description : null,
      sourceType: typeof sourceType === 'string' ? sourceType as 'INSURANCE' | 'HOME_WARRANTY' | 'MANUFACTURER_WARRANTY' | 'OUT_OF_POCKET' | 'UNKNOWN' : 'UNKNOWN',
      generateChecklist: true,
    });
    artifactType = 'CLAIM'; artifactId = claim.id;
    result = { status: 'COMPLETED', reasonCode: 'CLAIM_DRAFT_CREATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `claim-created-${claim.id}`, title: 'Draft claim created', status: 'COMPLETED', description: 'The canonical draft claim, checklist, timeline event, and linked Operational Work were created. Nothing was submitted to an insurer or warranty provider.', details: [{ label: 'Claim', value: claim.title }, { label: 'Status', value: String(claim.status).toLowerCase() }], actions: [{ id: 'open-claim', label: 'Open claim', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/claims/${claim.id}`, style: 'PRIMARY' }] }], suggestions: ['What should I gather for this claim?'] };
    // P05 fix: previously never called any reconciliation mechanism -- a
    // durable receipt existed, but the incidents/claims list the homeowner
    // may have been viewing (INCIDENT_CONTINUATION) had no read-retry path
    // back to its current state beyond re-asking from scratch.
    const claimFileRefresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (claimFileRefresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `claim-list-refresh-failed-${claim.id}`, title: 'Saved; list could not refresh',
        body: 'This draft claim was created. The list you were viewing could not refresh automatically -- ask "Show my recorded claims" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show my recorded claims'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: claimFileRefresh.refreshedExecutions };
}
async function confirmClaimTransition(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const claimId = parameters.claimId;
    const nextStatus = parameters.claimToStatus;
    if (typeof claimId !== 'string' || typeof nextStatus !== 'string') throw Object.assign(new Error('The claim transition is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId: execution.propertyId }, select: { id: true, title: true, status: true, updatedAt: true } });
    if (!claim) throw Object.assign(new Error('The selected claim is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${claim.id}:${claim.status}:${claim.updatedAt.toISOString()}`).digest('hex');
    if (parameters.claimContextVersion !== currentVersion && claim.status !== nextStatus) throw Object.assign(new Error(claimConflictDescription(claim)), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let updated: { status: string; title: string };
    try {
      updated = claim.status === nextStatus ? await ClaimsService.getClaim(execution.propertyId, claim.id) : await ClaimsService.updateClaim(execution.propertyId, claim.id, userId, { status: nextStatus as ClaimStatus });
    } catch (error) {
      // The same checklist gate the traditional Claims page reports (ClaimQuickActions): name what blocks submitting.
      const blocked = error as { code?: string; details?: { blocking?: Array<{ title: string; missingDocs?: number }> } };
      if (blocked?.code !== 'CLAIM_SUBMIT_BLOCKED') throw error;
      const items = (blocked.details?.blocking ?? []).slice(0, 3).map((item) => item.missingDocs ? `${item.title} (missing ${item.missingDocs} document${item.missingDocs === 1 ? '' : 's'})` : `${item.title} (not done)`);
      throw Object.assign(new Error(`This claim cannot be submitted yet. Finish its checklist first${items.length ? `: ${items.join('; ')}` : ''}. Nothing was changed.`), { code: 'CLAIM_SUBMIT_BLOCKED' });
    }
    artifactType = 'CLAIM'; artifactId = claim.id;
    result = { status: 'COMPLETED', reasonCode: 'CLAIM_STATUS_UPDATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `claim-updated-${claim.id}`, title: 'Claim status updated', status: 'COMPLETED', description: 'The canonical claim lifecycle and linked Operational Work/outcome reconciliation were updated through the Claims service.', details: [{ label: 'Claim', value: updated.title }, { label: 'Status', value: String(updated.status).toLowerCase().replace(/_/g, ' ') }], actions: [{ id: 'open-claim', label: 'Open claim', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/claims/${claim.id}`, style: 'PRIMARY' }] }], suggestions: ['Show my open claims'] };
    // P05 fix: see confirmClaimFile's identical fix above -- same missing
    // reconciliation mechanism, same INCIDENT_CONTINUATION sibling.
    const claimTransitionRefresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (claimTransitionRefresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `claim-list-refresh-failed-${claim.id}`, title: 'Saved; list could not refresh',
        body: 'This claim status change was saved. The list you were viewing could not refresh automatically -- ask "Show my open claims" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show my open claims'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: claimTransitionRefresh.refreshedExecutions };
}
// IW-PRES-015 (FRD v1.75): applies a deck batch. Each finding is re-read and re-checked exactly as the single confirm
// does (a change made while the confirmation was open leaves that finding untouched; an already-applied change counts
// as done). The writes are not one transaction, so the receipt says what happened to each finding.
async function confirmInspectionFindingBatch(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const entries = (Array.isArray(parameters.inspectionFindingBatch) ? parameters.inspectionFindingBatch : []) as Array<Record<string, unknown>>;
  const valid = entries.filter((entry) => typeof entry.findingId === 'string' && typeof entry.reportId === 'string' && (entry.action === 'ACCEPT' || entry.action === 'DISMISS'));
  if (!valid.length || valid.length !== entries.length) throw Object.assign(new Error('The inspection finding decisions are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const outcomes: Array<{ id: string; title: string; outcome: 'APPLIED' | 'ALREADY' | 'CHANGED' | 'GONE' | 'FAILED'; action: 'ACCEPT' | 'DISMISS' }> = [];
  for (const entry of valid) {
    const findingId = entry.findingId as string;
    const reportId = entry.reportId as string;
    const action = entry.action as 'ACCEPT' | 'DISMISS';
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, reportId, propertyId: execution.propertyId }, select: { id: true, homeSystem: true, inspectorDescription: true, status: true, workDisposition: true, updatedAt: true } });
    if (!finding) { outcomes.push({ id: findingId, title: 'A finding', outcome: 'GONE', action }); continue; }
    const title = `${finding.homeSystem}: ${finding.inspectorDescription}`;
    const alreadyApplied = (action === 'ACCEPT' && finding.workDisposition === 'ACCEPTED') || (action === 'DISMISS' && finding.status === 'DISMISSED');
    if (alreadyApplied) { outcomes.push({ id: finding.id, title, outcome: 'ALREADY', action }); continue; }
    if (entry.contextVersion !== inspectionFindingVersion(finding)) { outcomes.push({ id: finding.id, title, outcome: 'CHANGED', action }); continue; }
    try {
      if (action === 'ACCEPT') await acceptFindingAsWork(finding.id, reportId, execution.propertyId, userId);
      else await dismissFinding(finding.id, reportId, execution.propertyId, 'Dismissed through Ask after homeowner confirmation.', userId);
      outcomes.push({ id: finding.id, title, outcome: 'APPLIED', action });
    } catch (error) {
      logger.warn({ error, findingId: finding.id }, '[ask-inspection-batch] finding update failed');
      outcomes.push({ id: finding.id, title, outcome: 'FAILED', action });
    }
  }
  const done = outcomes.filter((entry) => entry.outcome === 'APPLIED' || entry.outcome === 'ALREADY');
  if (!done.length) throw Object.assign(new Error(outcomes.some((entry) => entry.outcome === 'FAILED') ? 'None of these findings could be updated. Nothing was changed.' : 'These findings changed while the confirmation was open. Nothing was changed. Review them and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const doneLabel = (entry: typeof outcomes[number]) => entry.outcome === 'ALREADY' ? 'Already done' : entry.action === 'ACCEPT' ? 'Accepted as work' : 'Dismissed';
  const notDone = outcomes.filter((entry) => entry.outcome !== 'APPLIED' && entry.outcome !== 'ALREADY');
  const notDoneReason = { CHANGED: 'changed while the confirmation was open', GONE: 'no longer exists', FAILED: 'could not be saved', APPLIED: '', ALREADY: '' } as const;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INSPECTION_FINDING_BATCH_UPDATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'inspection-finding-batch-updated', title: `${done.length} inspection finding${done.length === 1 ? '' : 's'} updated`, status: 'COMPLETED',
      description: 'Accepted findings are routed through canonical Operational Work. Dismissed findings are closed without work.',
      details: [...done.map((entry) => ({ label: entry.title.slice(0, 120), value: doneLabel(entry) })), ...notDone.map((entry) => ({ label: entry.title.slice(0, 120), value: 'Not changed' }))].slice(0, 12),
      actions: [],
    }, ...(notDone.length ? [{
      type: 'LIMITATION' as const, id: 'inspection-finding-batch-not-changed', title: `${notDone.length} finding${notDone.length === 1 ? ' was' : 's were'} not changed`, severity: 'CAUTION' as const,
      body: notDone.map((entry) => `${entry.title} ${notDoneReason[entry.outcome]}.`).slice(0, 10).join(' '),
    }] : [])],
    suggestions: ['Show remaining inspection findings'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'inspection-finding-batch-refresh-failed', title: 'Saved; list could not refresh', severity: 'CAUTION', body: 'These updates were saved. The findings list you were viewing could not refresh automatically -- ask "Show remaining inspection findings" to see its current state.' });
  }
  return { result, artifactType: 'INSPECTION_FINDING', artifactId: done[0].id, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmInspectionFindingUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  if (Array.isArray(ctx.parameters.inspectionFindingBatch)) return confirmInspectionFindingBatch(ctx);
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const findingId = parameters.inspectionFindingId;
    const reportId = parameters.inspectionReportId;
    const action = parameters.inspectionFindingAction;
    if (typeof findingId !== 'string' || typeof reportId !== 'string' || !['ACCEPT', 'DISMISS', 'RESOLVE'].includes(String(action))) throw Object.assign(new Error('The inspection finding action is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, reportId, propertyId: execution.propertyId }, select: { id: true, homeSystem: true, status: true, workDisposition: true, updatedAt: true } });
    if (!finding) throw Object.assign(new Error('The selected inspection finding is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${finding.id}:${finding.status}:${finding.workDisposition}:${finding.updatedAt.toISOString()}`).digest('hex');
    const alreadyApplied = (action === 'ACCEPT' && finding.workDisposition === 'ACCEPTED') || (action === 'DISMISS' && finding.status === 'DISMISSED') || (action === 'RESOLVE' && finding.status === 'RESOLVED');
    if (parameters.inspectionFindingContextVersion !== currentVersion && !alreadyApplied) throw Object.assign(new Error('This inspection finding changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    if (!alreadyApplied) {
      if (action === 'ACCEPT') await acceptFindingAsWork(finding.id, reportId, execution.propertyId, userId);
      else if (action === 'DISMISS') await dismissFinding(finding.id, reportId, execution.propertyId, 'Dismissed through Ask after homeowner confirmation.', userId);
      else {
        // Older proposals (before FRD v1.43) carry no resolution; they get the traditional dialog's default method.
        const resolution = InspectionResolutionSchema.safeParse(parameters.inspectionResolution ?? INSPECTION_RESOLUTION_DEFAULT);
        if (!resolution.success) throw Object.assign(new Error('The resolution details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
        await resolveFinding(finding.id, execution.propertyId, {
          resolutionMethod: resolution.data.method,
          ...(resolution.data.notes ? { resolutionNotes: resolution.data.notes } : {}),
          ...(resolution.data.costCents !== null ? { resolutionCostCents: resolution.data.costCents } : {}),
        });
      }
    }
    artifactType = 'INSPECTION_FINDING'; artifactId = finding.id;
    const findingReasonCode = action === 'ACCEPT' ? 'INSPECTION_FINDING_ACCEPTED' : action === 'DISMISS' ? 'INSPECTION_FINDING_DISMISSED' : 'INSPECTION_FINDING_RESOLVED';
    result = { status: 'COMPLETED', reasonCode: findingReasonCode, blocks: [{ type: 'WORKFLOW_PROGRESS', id: `inspection-finding-updated-${finding.id}`, title: 'Inspection finding updated', status: 'COMPLETED', description: action === 'ACCEPT' ? 'The finding is now routed through canonical Operational Work and its appropriate execution workflow.' : 'The canonical finding and any linked work reconciliation were updated.', details: [{ label: 'System', value: finding.homeSystem }, { label: 'Action', value: String(action).toLowerCase() }], actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/inspection`, style: 'PRIMARY' }] }], suggestions: ['Show remaining inspection findings'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's INSPECTION_FINDING_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `inspection-finding-refresh-failed-${finding.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'This update was saved to the canonical inspection record. The findings list you were viewing could not refresh automatically -- ask "Show remaining inspection findings" to see its current state.',
        suggestions: ['Show remaining inspection findings'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

// Ask Cozy Stage 3, Phase 7 write-path slice (implementation plan §13; FRD
// §31). Unlike INSPECTION_FINDING_UPDATE's three actions, none of which are
// each other's exact inverse, PropertySaleCaseService.setItemDecision is
// fully idempotent and unconditional (re-applying the same action is a safe
// no-op re-write, confirmed by reading its implementation before relying on
// this) -- so this handler does NOT need an "alreadyApplied" staleness
// bypass the way confirmInspectionFindingUpdate does; the contextVersion
// check below always applies, which is actually MORE important here since
// there is no idempotent-no-op safety net protecting a stale confirm from
// silently overwriting a decision (and its reason) made by someone else in
// the meantime.
async function confirmSellerPrepItemDecision(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const itemId = parameters.saleReadinessItemId;
  const action = parameters.saleReadinessItemAction;
  const reason = typeof parameters.saleReadinessItemReason === 'string' ? parameters.saleReadinessItemReason : undefined;
  if (typeof itemId !== 'string' || !['WAIVE', 'PURSUE', 'REOPEN', 'UNPURSUE'].includes(String(action))) {
    throw Object.assign(new Error('The seller-prep item decision is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const item = await prisma.saleReadinessItem.findFirst({
    where: { id: itemId, saleCase: { propertyId: execution.propertyId } },
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  if (!item) throw Object.assign(new Error('The selected checklist item is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const currentVersion = sellerPrepItemContextVersion(item);
  if (parameters.saleReadinessItemContextVersion !== currentVersion) {
    throw Object.assign(new Error(saleReadinessItemConflictDescription(item)), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  await PropertySaleCaseService.setItemDecision(userId, execution.propertyId, item.id, action as 'WAIVE' | 'PURSUE' | 'REOPEN' | 'UNPURSUE', reason);
  const result: AskOperationResult = {
    status: 'COMPLETED',
    reasonCode: `SELLER_PREP_ITEM_${action}`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS',
      id: `seller-prep-item-updated-${item.id}`,
      title: 'Seller-prep checklist item updated',
      status: 'COMPLETED',
      description: 'The shared seller-prep checklist was updated.',
      details: [{ label: 'Item', value: item.title }, { label: 'Decision', value: String(action).toLowerCase() }],
      actions: [{ id: 'open-seller-prep', label: 'Open sale readiness checklist', href: saleCaseHref(execution.propertyId, item.id), style: 'PRIMARY' }],
    }],
    suggestions: ['Check my sale readiness'],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's SELLER_PREP_ITEM_DECISION entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `seller-prep-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This decision was saved to the shared seller-prep checklist. The checklist you were viewing could not refresh automatically -- ask "Check my sale readiness" to see its current state.',
      suggestions: ['Check my sale readiness'],
    });
  }
  return { result, artifactType: 'SALE_READINESS_ITEM', artifactId: item.id, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmDocumentPromotionConfirm(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const kind = parameters.documentPromotionKind;
    const candidateId = parameters.documentPromotionId;
    const parentId = parameters.documentPromotionParentId;
    const decision = parameters.documentPromotionDecision;
    if (typeof candidateId !== 'string' || typeof parentId !== 'string' || !['CONFIRM', 'REJECT'].includes(String(decision))) throw Object.assign(new Error('The document-promotion decision is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    if (kind === 'MATERIAL_EXTRACTION_REVIEW') {
      const review = await prisma.materialExtractionReview.findFirst({ where: { id: candidateId, materialSpecId: parentId, propertyId: execution.propertyId }, select: { id: true, status: true, candidateFields: true, updatedAt: true } });
      if (!review) throw Object.assign(new Error('The selected material extraction review is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${review.id}:${review.updatedAt.toISOString()}`).digest('hex');
      if (review.status === 'NEEDS_REVIEW' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This document candidate changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (review.status === 'NEEDS_REVIEW') await materialSpecService.reviewExtraction(execution.propertyId, parentId, review.id, userId, { status: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', reviewedFields: decision === 'CONFIRM' ? review.candidateFields as Record<string, unknown> : undefined, reviewNotes: `${decision === 'CONFIRM' ? 'Confirmed' : 'Rejected'} through Ask after explicit homeowner review.` });
      if (decision === 'CONFIRM') await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'MATERIAL_SPEC', promotedEntityId: parentId, userId });
      artifactType = 'MATERIAL_EXTRACTION_REVIEW'; artifactId = review.id;
    } else if (kind === 'INSURANCE_POLICY_FACT') {
      const fact = await prisma.insurancePolicyFact.findFirst({ where: { id: candidateId, policyTerm: { propertyId: execution.propertyId, insurancePolicyId: parentId } }, include: { policyTerm: { include: { insurancePolicy: { select: { homeownerProfileId: true } } } } } });
      if (!fact) throw Object.assign(new Error('The selected policy fact is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${fact.id}:${fact.updatedAt.toISOString()}`).digest('hex');
      if (fact.confirmationStatus === 'PENDING' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This policy fact changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (fact.confirmationStatus === 'PENDING') await confirmPolicyFact({ policyId: parentId, factId: fact.id, homeownerProfileId: fact.policyTerm.insurancePolicy.homeownerProfileId, userId, confirmationStatus: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED' });
      if (decision === 'CONFIRM') await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'INSURANCE_POLICY_FACT', promotedEntityId: fact.id, userId });
      artifactType = 'INSURANCE_POLICY_FACT'; artifactId = fact.id;
    } else if (kind === 'INSPECTION_REPORT' && decision === 'CONFIRM') {
      const report = await prisma.inspectionReport.findFirst({ where: { id: candidateId, propertyId: execution.propertyId }, select: { id: true, status: true, updatedAt: true } });
      if (!report) throw Object.assign(new Error('The selected inspection report is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${report.id}:${report.updatedAt.toISOString()}`).digest('hex');
      if (report.status === 'REVIEW_PENDING' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This inspection report changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (report.status === 'REVIEW_PENDING') await applyWriteBacks(report.id, execution.propertyId, userId);
      await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'INSPECTION_REPORT', promotedEntityId: report.id, userId });
      artifactType = 'INSPECTION_REPORT'; artifactId = report.id;
    } else throw Object.assign(new Error('This document-promotion action must be reviewed again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    result = { status: 'COMPLETED', reasonCode: decision === 'CONFIRM' ? 'DOCUMENT_PROMOTION_CONFIRMED' : 'DOCUMENT_PROMOTION_REJECTED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `document-promotion-${candidateId}`, title: decision === 'CONFIRM' ? 'Document-derived record promoted' : 'Document candidate rejected', status: 'COMPLETED', description: decision === 'CONFIRM' ? 'The canonical domain adapter applied the reviewed values and recorded a promotion outcome.' : 'The source evidence remains available, but its candidate values were not promoted.', details: [{ label: 'Candidate id', value: candidateId }, { label: 'Decision', value: String(decision).toLowerCase() }], actions: [{ id: 'open-documents', label: 'Open Documents', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/documents`, style: 'PRIMARY' }] }], suggestions: ['Show remaining document reviews'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's DOCUMENT_PROMOTION_CONFIRM entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `document-promotion-refresh-failed-${candidateId}`, title: 'Saved; list could not refresh',
        body: 'This decision was saved to the canonical record. The document review list you were viewing could not refresh automatically -- ask "Show remaining document reviews" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show remaining document reviews'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmOperationalWorkUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const workItemId = parameters.operationalWorkItemId;
    const action = parameters.operationalWorkAction;
    if (typeof workItemId !== 'string' || !['ACCEPT', 'DEFER', 'SNOOZE', 'COMPLETE'].includes(String(action))) throw Object.assign(new Error('The Operational Work command is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const observedResult = parameters.operationalWorkObservedResult;
    if (action === 'COMPLETE' && !['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'].includes(String(observedResult))) throw Object.assign(new Error('The Operational Work completion result is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const item = await prisma.operationalWorkItem.findFirst({ where: { id: workItemId, propertyId: execution.propertyId }, include: { executions: true } });
    if (!item) throw Object.assign(new Error('The selected Operational Work item is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${item.id}:${item.state}:${item.updatedAt.toISOString()}:${item.snoozedUntil?.toISOString() ?? ''}`).digest('hex');
    const alreadyApplied = action === 'ACCEPT' ? item.state === 'ACCEPTED' : action === 'DEFER' ? item.state === 'DEFERRED' : action === 'SNOOZE' ? item.snoozedUntil?.toISOString() === parameters.operationalWorkUntil : ['VERIFIED', 'CLOSED'].includes(item.state);
    if (parameters.operationalWorkContextVersion !== currentVersion && !alreadyApplied) throw Object.assign(new Error('This work item changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    if (!alreadyApplied) {
      if (action === 'ACCEPT' || action === 'DEFER') {
        const target = action === 'ACCEPT' ? 'ACCEPTED' : 'DEFERRED'; assertUserWorkItemTransition(item, target);
        await transitionWorkItem({ workItemId: item.id, to: target, actorType: 'USER', actorUserId: userId, idempotencyKey: `ask:${execution.id}:operational-work:${action.toLowerCase()}`, timestampValue: action === 'DEFER' && typeof parameters.operationalWorkUntil === 'string' ? new Date(parameters.operationalWorkUntil) : undefined });
      } else if (action === 'SNOOZE') {
        if (typeof parameters.operationalWorkUntil !== 'string') throw Object.assign(new Error('The snooze date is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
        await snoozeWorkItem({ workItemId: item.id, snoozedUntil: new Date(parameters.operationalWorkUntil), actorUserId: userId, idempotencyKey: `ask:${execution.id}:operational-work:snooze` });
      } else await completeAcceptedOperationalWorkItem({
        workItemId: item.id,
        propertyId: execution.propertyId,
        userId,
        safetyTier: item.safetyTier,
        decisionLineage: null,
        recommendationSnapshotId: await resolveWorkItemRecommendationSnapshotId(execution.propertyId, item.id),
        observedResult: observedResult as 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED',
        completedAt: new Date().toISOString(),
      });
    }
    artifactType = 'OPERATIONAL_WORK_ITEM'; artifactId = item.id;
    const workReasonCode = action === 'ACCEPT' ? 'OPERATIONAL_WORK_ACCEPTED' : action === 'DEFER' ? 'OPERATIONAL_WORK_DEFERRED' : action === 'SNOOZE' ? 'OPERATIONAL_WORK_SNOOZED' : 'OPERATIONAL_WORK_COMPLETED';
    result = { status: 'COMPLETED', reasonCode: workReasonCode, blocks: [{ type: 'WORKFLOW_PROGRESS', id: `operational-work-updated-${item.id}`, title: 'Operational Work updated', status: 'COMPLETED', description: action === 'COMPLETE' ? 'The authoritative maintenance execution, Operational Work lifecycle, evidence, and outcome were reconciled.' : 'The governed Operational Work command was applied to the canonical shared item.', details: [{ label: 'Work', value: item.title }, { label: 'Action', value: String(action).toLowerCase() }], actions: [{ id: 'open-work', label: 'Open Home Actions', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/home-actions`, style: 'PRIMARY' }] }], suggestions: ['What needs my attention next?'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's OPERATIONAL_WORK_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `operational-work-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'This update was saved to the canonical Operational Work item. The list you were viewing could not refresh automatically -- ask "What needs my attention next?" to see its current state.',
        suggestions: ['What needs my attention next?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}











async function confirmMaintenanceTaskComplete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.maintenanceTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The maintenance task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: taskId, propertyId: execution.propertyId } });
    if (!task) {
      const error = new Error('The selected maintenance task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const completionIdempotencyKey = `ask:${execution.id}:maintenance-completion`;
    const completionMetadata = task.completionMetadata && typeof task.completionMetadata === 'object' && !Array.isArray(task.completionMetadata)
      ? task.completionMetadata as Record<string, unknown>
      : {};
    const completedByThisExecution = task.status === MaintenanceTaskStatus.COMPLETED
      && completionMetadata.completionIdempotencyKey === completionIdempotencyKey;
    if (!completedByThisExecution && (task.status === MaintenanceTaskStatus.COMPLETED
      || task.status === MaintenanceTaskStatus.CANCELLED
      || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(task))) {
      const error = new Error(maintenanceConflictDescription(task));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const actualCostUsd = parameters.maintenanceActualCostUsd;
    const outcomeHealth = parameters.maintenanceOutcomeHealth;
    if (actualCostUsd !== null && actualCostUsd !== undefined && (typeof actualCostUsd !== 'number' || actualCostUsd < 0 || actualCostUsd > 10_000_000)) {
      const error = new Error('The actual maintenance cost is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const projectOutcomeRequired = Boolean(task.actionKey?.match(/^project:[^:]+:follow-up$/));
    if (projectOutcomeRequired && !['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'].includes(String(outcomeHealth))) {
      const error = new Error('Select the project follow-up outcome before completing this task.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const updated = completedByThisExecution
      ? task
      : await PropertyMaintenanceTaskService.updateTaskStatus(
        userId,
        task.id,
        MaintenanceTaskStatus.COMPLETED,
        typeof actualCostUsd === 'number' ? actualCostUsd : undefined,
        projectOutcomeRequired ? outcomeHealth as 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' : undefined,
        completionIdempotencyKey,
      );
    const taskHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_COMPLETED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-completed-${updated.id}`, title: 'Maintenance task completed', status: 'COMPLETED',
        description: updated.isRecurring && updated.frequency
          ? 'This occurrence is complete and the recurring task’s next due date has been recalculated.'
          : 'Completion is recorded in this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: updated.title },
          { label: 'Completed', value: humanDate(updated.lastCompletedDate) ?? 'Recorded now' },
          { label: 'Actual cost', value: updated.actualCost == null ? 'Not recorded' : maintenanceMoney(updated.actualCost) ?? 'Not recorded' },
          ...(updated.isRecurring ? [{ label: 'Next due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }] : []),
          ...(projectOutcomeRequired ? [{ label: 'Project outcome', value: String(outcomeHealth).toLowerCase().replace(/_/g, ' ') }] : []),
        ],
        actions: [{ id: 'open-task', label: 'Open completed task', href: taskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Show maintenance completed this year'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK_COMPLETION';
    artifactId = updated.id;
    const refresh = await refreshAskSourceExecution(userId, execution.id, parameters);
    // CONF-005: a refresh failure must never look like the mutation itself
    // failed or invite a repeat -- the completion above already succeeded
    // and is not touched. Disclose the stale list honestly with a concrete,
    // non-repeating way to see current state, exactly the required
    // "Saved; list could not refresh" shape.
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `maintenance-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This completion was saved to the canonical Maintenance record. The pending list you were viewing could not refresh automatically -- ask "What maintenance is pending?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What maintenance is pending?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmBuyerTaskComplete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.buyerTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The Buyer Plan task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId } } });
    if (!task) {
      const error = new Error('The selected Buyer Plan task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const completionIdempotencyKey = `ask:${execution.id}:buyer-task-completion`;
    const completionEvidence = task.completionEvidenceJson && typeof task.completionEvidenceJson === 'object' && !Array.isArray(task.completionEvidenceJson)
      ? task.completionEvidenceJson as Record<string, unknown>
      : {};
    const completedByThisExecution = task.status === 'COMPLETED' && completionEvidence.completionIdempotencyKey === completionIdempotencyKey;
    if (!completedByThisExecution && (task.status === 'COMPLETED'
      || task.status === 'CANCELLED'
      || task.status === 'NOT_NEEDED'
      || parameters.buyerTaskVersion !== buyerTaskVersion(task))) {
      const error = new Error(buyerTaskConflictDescription(task));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const updated = completedByThisExecution
      ? task
      : await HomeBuyerTaskService.updateTask(userId, execution.propertyId, task.id, {
        status: 'COMPLETED',
        completionEvidenceJson: { proofType: 'USER_ATTESTATION', confirmedByUserId: userId, confirmedAt: new Date().toISOString(), completionIdempotencyKey },
      });
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_COMPLETED', contextVersion: buyerTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-completed-${updated.id}`, title: 'Buyer Plan task completed', status: 'COMPLETED',
        description: 'Completion is recorded in this purchase’s canonical Buyer Plan and closing readiness is updated.',
        details: [
          { label: 'Task', value: updated.title },
          { label: 'Completion method', value: 'User attestation' },
        ],
        actions: [{ id: 'open-task', label: 'Open completed task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?', 'What is due before closing?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = updated.id;
    // B03 fix: previously called no reconciliation mechanism at all -- not
    // even the single-target one BUYER_TASK_UPDATE had before B04.
    // Completing a task changes the same BUYER_PLAN_STATUS/BUYER_DEADLINES
    // membership/counts a reschedule does, so it shares B04's exact
    // mechanism (reconcileAskExecutionSideEffects), not a new one.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This completion was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmBuyerTaskCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const title = parameters.buyerTaskTitle;
    if (typeof title !== 'string' || !title.trim()) {
      const error = new Error('The closing checklist item title is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const dueAt = typeof parameters.buyerTaskDueAt === 'string' ? parameters.buyerTaskDueAt : null;
    const actionKey = `ask:${execution.id}:buyer-task-create`;
    let created = await prisma.homeBuyerTask.findFirst({ where: { actionKey, checklist: { propertyId: execution.propertyId } } });
    if (!created) {
      try {
        created = await HomeBuyerTaskService.createTask(userId, execution.propertyId, {
          title, actionKey, dueAt, phase: 'CLOSING_PREP', priority: 'PLAN',
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        created = await prisma.homeBuyerTask.findFirst({ where: { actionKey, checklist: { propertyId: execution.propertyId } } });
        if (!created) throw error;
      }
    }
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(created.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_CREATED', contextVersion: buyerTaskVersion(created),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-created-${created.id}`, title: 'Closing checklist item added', status: 'COMPLETED',
        description: 'The task is recorded in this purchase’s canonical Buyer Plan.',
        details: [
          { label: 'Task', value: created.title },
          { label: 'Due', value: created.dueAt ? humanDate(created.dueAt) ?? 'Not scheduled' : 'Not scheduled' },
        ],
        actions: [{ id: 'open-task', label: 'Open new task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = created.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_TASK_CREATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-create-refresh-failed-${created.id}`, title: 'Saved; list could not refresh',
        body: 'This task was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmBuyerTaskUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to update Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.buyerTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The Buyer Plan task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId } } });
    if (!task || parameters.buyerTaskVersion !== buyerTaskVersion(task)) {
      const error = new Error(task ? buyerTaskConflictDescription(task) : 'The selected Buyer Plan task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const buyerAction = parameters.buyerTaskAction;
    const dueAt = typeof parameters.buyerTaskDueAt === 'string' ? parameters.buyerTaskDueAt : undefined;
    const assigneeUserId = parameters.buyerTaskAssigneeUserId === null ? null : typeof parameters.buyerTaskAssigneeUserId === 'string' ? parameters.buyerTaskAssigneeUserId : undefined;
    const updated = await HomeBuyerTaskService.updateTask(userId, execution.propertyId, task.id, {
      ...(buyerAction === 'RESCHEDULE' && dueAt ? { dueAt } : {}),
      ...(buyerAction === 'ASSIGN' || buyerAction === 'UNASSIGN' ? { assignedToUserId: assigneeUserId } : {}),
    });
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_UPDATED', contextVersion: buyerTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-updated-${updated.id}`, title: 'Buyer Plan task updated', status: 'COMPLETED',
        description: 'The change is recorded in this purchase’s canonical Buyer Plan.',
        details: [
          { label: 'Task', value: updated.title },
          ...(dueAt ? [{ label: 'New due date', value: dueAt }] : []),
        ],
        actions: [{ id: 'open-task', label: 'Open updated task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = updated.id;
    // B04 fix: previously never reconciled any other visible Buyer result
    // (e.g. BUYER_DEADLINES, which the rescheduled/reassigned task may
    // appear in) after this write succeeded -- confirmed by direct read that
    // this handler never populated refreshedExecutions at all. Reconciles
    // both the explicit sourceExecutionId (the one list this row-action was
    // launched from) AND the server-owned sibling-impact map (every OTHER
    // still-visible Buyer result this operation may have affected) via
    // reconcileAskExecutionSideEffects, not just the single-target mechanism
    // Maintenance's own reference implementation used alone.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmBuyerFindingDisposition(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to classify Buyer Plan findings.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const findingId = parameters.buyerFindingId;
    const disposition = parameters.buyerFindingDisposition;
    if (typeof findingId !== 'string' || typeof disposition !== 'string') {
      const error = new Error('The finding selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, propertyId: execution.propertyId } });
    if (!finding) {
      const error = new Error('The selected finding is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const expectedFindingVersion = parameters.buyerFindingVersion;
    const currentFindingVersion = finding.buyerDispositionAt ? finding.buyerDispositionAt.toISOString() : null;
    if (expectedFindingVersion !== currentFindingVersion) {
      const error = new Error(buyerFindingConflictDescription(finding));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const dispositionResult = await BuyerAcquisitionService.dispositionFinding(userId, execution.propertyId, finding.id, {
      disposition: disposition as Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>,
    });
    const dispositionLabel = BUYER_FINDING_DISPOSITION_LABELS[disposition] ?? disposition;
    const inspectionHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/inspection-hub`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_FINDING_DISPOSITIONED', contextVersion: dispositionResult.finding.buyerDispositionAt?.toISOString() ?? null,
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-finding-dispositioned-${finding.id}`, title: 'Finding classified', status: 'COMPLETED',
        description: `This finding is now classified as ${dispositionLabel}.`,
        details: [
          { label: 'Finding', value: [finding.homeSystem, finding.subsystem].filter(Boolean).join(' ') },
          { label: 'Disposition', value: dispositionLabel },
        ],
        actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub', href: inspectionHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['Which inspection findings still need a decision?', 'What should I do next for this purchase?'],
    };
    artifactType = 'INSPECTION_FINDING';
    artifactId = finding.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_FINDING_DISPOSITION entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-finding-disposition-refresh-failed-${finding.id}`, title: 'Saved; list could not refresh',
        body: 'This classification was saved to the canonical record. The findings list you were viewing could not refresh automatically -- ask "Which inspection findings still need a decision?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Which inspection findings still need a decision?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmBuyerLifecycleUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const lifecycleAction = parameters.buyerLifecycleAction;
    const buyerPlanHrefValue = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan`;
    if (lifecycleAction === 'PAUSE' || lifecycleAction === 'RESUME') {
      if (access.role !== HouseholdRole.OWNER) {
        const error = new Error(`Only the property owner can ${lifecycleAction === 'RESUME' ? 'resume' : 'pause'} this purchase.`);
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const updatedPlan = lifecycleAction === 'RESUME'
        ? await BuyerAcquisitionService.resumeJourney(userId, execution.propertyId, { confirmed: true })
        : await BuyerAcquisitionService.pauseJourney(userId, execution.propertyId, { confirmed: true });
      result = {
        status: 'COMPLETED', reasonCode: lifecycleAction === 'RESUME' ? 'BUYER_JOURNEY_RESUMED' : 'BUYER_JOURNEY_PAUSED', contextVersion: updatedPlan.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: `buyer-lifecycle-${lifecycleAction.toLowerCase()}`, title: lifecycleAction === 'RESUME' ? 'Purchase resumed' : 'Purchase paused', status: 'COMPLETED',
          description: lifecycleAction === 'RESUME' ? 'Deadline reminders and active tasks are reactivated.' : 'Deadline reminders are stopped. Recorded work, documents, findings, and evidence are preserved.',
          details: [],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = updatedPlan.id;
    } else if (lifecycleAction === 'CANCEL') {
      if (access.role !== HouseholdRole.OWNER) {
        const error = new Error('Only the property owner can cancel this purchase.');
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const cancelReason = parameters.buyerCancelReason;
      if (typeof cancelReason !== 'string' || cancelReason.trim().length < 5) {
        const error = new Error('A cancellation reason of at least 5 characters is required.');
        (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
        throw error;
      }
      const cancelled = await BuyerAcquisitionService.cancelJourney(userId, execution.propertyId, { confirmed: true, reason: cancelReason });
      result = {
        status: 'COMPLETED', reasonCode: 'BUYER_JOURNEY_CANCELLED', contextVersion: cancelled.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: 'buyer-lifecycle-cancelled', title: 'Purchase cancelled', status: 'COMPLETED',
          description: 'Reminders are stopped and open work is archived. Completed work, documents, findings, and evidence are preserved.',
          details: [{ label: 'Reason', value: cancelReason }],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = cancelled.id;
    } else if (lifecycleAction === 'RESCHEDULE_CLOSING' || lifecycleAction === 'RESCHEDULE_MOVE_IN') {
      if (access.role === HouseholdRole.VIEWER) {
        const error = new Error('A contributor or owner is required to change this purchase’s recorded dates.');
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const newDate = parameters.buyerLifecycleDate;
      if (typeof newDate !== 'string') {
        const error = new Error('The new date is invalid.');
        (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
        throw error;
      }
      const updatedChecklist = await BuyerAcquisitionService.updateLifecycle(
        userId,
        execution.propertyId,
        lifecycleAction === 'RESCHEDULE_MOVE_IN' ? { moveInDate: newDate } : { targetCloseDate: newDate },
      );
      result = {
        status: 'COMPLETED', reasonCode: 'BUYER_LIFECYCLE_DATE_UPDATED', contextVersion: updatedChecklist.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: 'buyer-lifecycle-date-updated', title: lifecycleAction === 'RESCHEDULE_MOVE_IN' ? 'Move-in date updated' : 'Target closing date updated', status: 'COMPLETED',
          description: 'Unedited task due dates were recalculated from the new date.',
          details: [{ label: 'New date', value: newDate }],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = updatedChecklist.id;
    } else {
      const error = new Error('This lifecycle action is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_LIFECYCLE_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-lifecycle-refresh-failed-${artifactId}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmMaintenanceTaskCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const expectedMaintenanceVersion = parameters.maintenanceWorkflowVersion;
    const currentMaintenanceVersion = await maintenanceWorkflowVersion(execution.propertyId);
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse({
      title: parameters.maintenanceTitle,
      description: parameters.maintenanceDescription ?? undefined,
      priority: parameters.maintenancePriority,
      nextDueDate: parameters.maintenanceNextDueDate ?? undefined,
      estimatedCostUsd: parameters.maintenanceEstimatedCostUsd ?? undefined,
      isRecurring: parameters.maintenanceIsRecurring,
      frequency: parameters.maintenanceFrequency ?? undefined,
    });
    if (!candidate.success || expectedMaintenanceVersion !== currentMaintenanceVersion) {
      const error = new Error(expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'Maintenance tasks changed while this confirmation was open. Review the current record and try again.'
        : 'The maintenance task details are invalid.');
      (error as Error & { code?: string }).code = expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'ASK_CONTEXT_VERSION_CONFLICT'
        : 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const actionKey = `ask:${execution.id}:maintenance-task`;
    let task = await prisma.propertyMaintenanceTask.findUnique({
      where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
    });
    if (!task) {
      try {
        task = await PropertyMaintenanceTaskService.createUserTask(userId, execution.propertyId, {
          title: candidate.data.title,
          description: candidate.data.description,
          priority: candidate.data.priority,
          estimatedCost: candidate.data.estimatedCostUsd,
          isRecurring: candidate.data.isRecurring,
          frequency: candidate.data.isRecurring ? candidate.data.frequency : undefined,
          nextDueDate: candidate.data.nextDueDate,
          actionKey,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        task = await prisma.propertyMaintenanceTask.findUnique({
          where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
        });
        if (!task) throw error;
      }
    }
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_CREATED', contextVersion: await maintenanceWorkflowVersion(execution.propertyId),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-task-${task.id}`, title: 'Maintenance task created', status: 'COMPLETED',
        description: 'The task is now part of this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: task.title },
          { label: 'Status', value: 'Pending' },
          { label: 'Priority', value: task.priority.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) },
          { label: 'Due', value: task.nextDueDate ? humanDate(task.nextDueDate) ?? task.nextDueDate.toISOString() : 'Not scheduled' },
          { label: 'Recurrence', value: task.isRecurring && task.frequency ? task.frequency.toLowerCase().replace(/_/g, ' ') : 'One-time' },
        ],
        actions: [],
      }, {
        type: 'OUTPUT_ARTIFACTS', id: `maintenance-output-${task.id}`, title: 'Created record',
        items: [{
          artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: task.id, relationship: 'CREATED',
          label: task.title, status: task.status, createdAt: task.createdAt.toISOString(),
          navigation: { label: 'Open task in Maintenance', href: maintenanceHref },
        }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Create another maintenance task'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK';
    artifactId = task.id;
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: 'maintenance-create-refresh-limitation', title: 'Task saved; list could not refresh',
      body: 'The maintenance task was created successfully, but the earlier Ask Cozy list could not be refreshed. Refresh that result or ask for pending maintenance again.',
      severity: 'CAUTION', suggestions: ['What maintenance is still pending?'],
    });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmMaintenanceTaskUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = MaintenanceTaskUpdateInputSchema.safeParse(parameters.maintenanceUpdate);
    if (!candidate.success) {
      const error = new Error('The maintenance update is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const current = await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId } });
    if (!current) {
      const error = new Error('This task is no longer available. It may have been deleted.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const isFieldPatchAction = candidate.data.action !== 'ASSIGN' && candidate.data.action !== 'UNASSIGN'
      && candidate.data.action !== 'ARCHIVE' && candidate.data.action !== 'REOPEN';
    // External review [P2] follow-up: a recovery retry of THIS SAME
    // execution (its confirmation receipt reclaimed after a crash between
    // the write below committing and the receipt being marked COMPLETED)
    // re-runs this whole handler with the ORIGINAL, pre-update
    // maintenanceTaskVersion -- current now reflects that already-applied
    // write, so the version check below would otherwise misreport the
    // execution's own prior success as "changed in another session."
    // Recognizing this execution's own idempotency key on the row (set by
    // updateTask below on the write that already succeeded) short-circuits
    // both the version check and the write itself, mirroring
    // confirmMaintenanceTaskComplete's completedByThisExecution.
    const updateIdempotencyKey = `ask:${execution.id}:maintenance-update`;
    const appliedByThisExecution = isFieldPatchAction && current.lastUpdateIdempotencyKey === updateIdempotencyKey;
    if (!appliedByThisExecution && parameters.maintenanceTaskVersion !== maintenanceTaskVersion(current)) {
      const error = new Error(maintenanceConflictDescription(current));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    if (candidate.data.action === 'ASSIGN' || candidate.data.action === 'UNASSIGN') {
      await householdService.assignTask(execution.propertyId, current.id, 'MAINTENANCE', candidate.data.assigneeUserId ?? null, userId);
    } else if (candidate.data.action === 'ARCHIVE') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.CANCELLED);
    } else if (candidate.data.action === 'REOPEN') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.PENDING);
    } else if (!appliedByThisExecution) {
      try {
        // External review [P1] follow-up: passing current.updatedAt through
        // as expectedUpdatedAt pins updateTask's own compare-and-swap to the
        // version this handler already validated at the check above, instead
        // of letting updateTask re-derive its own baseline from a fresh
        // getTask() call. Without this, a write landing between the check
        // above and updateTask's internal read was silently adopted as
        // updateTask's own baseline and succeeded against it -- overwriting
        // a version nobody actually reviewed instead of tripping the CAS.
        await PropertyMaintenanceTaskService.updateTask(userId, current.id, {
          ...(candidate.data.priority ? { priority: candidate.data.priority } : {}),
          ...(candidate.data.nextDueDate !== undefined ? { nextDueDate: candidate.data.nextDueDate } : {}),
          ...(candidate.data.title ? { title: candidate.data.title } : {}),
        }, { expectedUpdatedAt: current.updatedAt, idempotencyKey: updateIdempotencyKey });
      } catch (raceError) {
        // The version check above rejects a change that already committed
        // BEFORE this handler ran; updateTask's own compare-and-swap, now
        // pinned to the same current.updatedAt via expectedUpdatedAt, catches
        // one that lands in the gap between that check and this write.
        // Re-fetching current state gives the same rich conflict description
        // rather than a raw "concurrent update" error.
        if (raceError instanceof Error && (raceError as Error & { code?: string }).code === 'CONCURRENT_TASK_UPDATE') {
          const raceCurrent = await prisma.propertyMaintenanceTask.findFirst({ where: { id: current.id, propertyId: execution.propertyId } });
          const error = new Error(raceCurrent ? maintenanceConflictDescription(raceCurrent) : 'This task is no longer available. It may have been deleted.');
          (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
          throw error;
        }
        throw raceError;
      }
    }
    const updated = await prisma.propertyMaintenanceTask.findUniqueOrThrow({ where: { id: current.id }, include: { assignedTo: { select: { email: true } } } });
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_UPDATED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `maintenance-update-${updated.id}`, title: 'Maintenance task updated', status: candidate.data.action === 'ARCHIVE' ? 'CANCELLED' : 'COMPLETED', description: 'The canonical Maintenance record and its downstream work state were updated.', details: [{ label: 'Task', value: updated.title }, { label: 'Action', value: candidate.data.action.toLowerCase() }, { label: 'Status', value: updated.status.toLowerCase().replace(/_/g, ' ') }, { label: 'Due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }, { label: 'Assignee', value: updated.assignedTo?.email ?? 'Unassigned' }], actions: [{ id: 'open-task', label: 'Open task', href: maintenanceHref, style: 'PRIMARY' }] }],
      confirmation: null, suggestions: candidate.data.action === 'ARCHIVE' ? [`Reopen ${updated.title}`] : ['What maintenance is pending?'],
    };
    artifactType = command.artifactType;
    artifactId = updated.id;
    const refresh = await refreshAskSourceExecution(userId, execution.id, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `maintenance-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Maintenance record. The list you were viewing could not refresh automatically -- ask "What maintenance is pending?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What maintenance is pending?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmGuidanceJourneyCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = GuidanceJourneyCommandInputSchema.safeParse(parameters.guidanceJourney);
    if (!candidate.success) {
      const error = new Error('The guided plan settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.guidanceJourneyContextVersion !== await guidanceJourneyContextVersion(execution.propertyId, candidate.data)) {
      const error = new Error('The guided-plan scope changed while confirmation was open. Review the current home record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const journey = await guidanceJourneyService.createUserInitiatedJourney(execution.propertyId, {
      scopeCategory: candidate.data.scopeCategory,
      scopeId: candidate.data.scopeId,
      issueType: candidate.data.issueType,
      inventoryItemId: candidate.data.inventoryItemId,
      serviceKey: candidate.data.serviceKey,
      customIssueLabel: candidate.data.label,
      sourceAskExecutionId: execution.id,
    }, userId);
    const href = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}`;
    result = { status: 'COMPLETED', reasonCode: 'GUIDANCE_JOURNEY_CREATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `guidance-journey-${journey.id}`, title: 'Guided plan started', status: 'COMPLETED', description: 'The resumable guidance journey is now linked to this home.', details: [{ label: 'Scope', value: candidate.data.label }, { label: 'Plan', value: candidate.data.issueType.replace(/_/g, ' ') }], actions: [{ id: 'open-journey', label: 'Open guided plan', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [] };
    artifactType = command.artifactType;
    artifactId = journey.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all. No sibling declared in ASK_MUTATION_IMPACT_MAP (no "list my
    // guidance journeys" read exists) -- this still gets the explicit
    // sourceExecutionId refresh for free.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `guidance-journey-refresh-failed-${journey.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The guided plan was started successfully. A result you were viewing could not refresh automatically -- open the guided plan directly to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmQuoteComparisonCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = QuoteWorkspaceCommandInputSchema.safeParse(parameters.quoteWorkspace);
    if (!candidate.success) {
      const error = new Error('The comparison workspace settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.quoteWorkspaceContextVersion !== await quoteWorkspaceContextVersion(execution.propertyId)) {
      const error = new Error('Quote workspaces changed while confirmation was open. Review the current comparison and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const created = await getOrCreateQuoteComparisonWorkspace(execution.propertyId, userId, candidate.data);
    const href = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/quote-comparison?workspaceId=${encodeURIComponent(created.workspace.id)}`;
    const workspaceLabel = created.workspace.scopeSummary?.trim()
      || `${String(created.workspace.serviceCategory ?? candidate.data.serviceCategory).toLowerCase().replace(/_/g, ' ')} quote comparison`;
    result = {
      status: 'COMPLETED', reasonCode: created.reused ? 'QUOTE_COMPARISON_REUSED' : 'QUOTE_COMPARISON_CREATED',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `quote-workspace-${created.workspace.id}`, title: created.reused ? 'Existing comparison workspace opened' : 'Quote comparison workspace created', status: 'COMPLETED',
        description: 'No provider or quote was selected. Add comparable proposals in the governed workspace.',
        details: [{ label: 'Service', value: candidate.data.serviceCategory.toLowerCase().replace(/_/g, ' ') }, { label: 'Status', value: created.workspace.status.toLowerCase() }],
        actions: [],
      }, {
        type: 'OUTPUT_ARTIFACTS', id: `quote-workspace-output-${created.workspace.id}`, title: 'Workspace record',
        items: [{
          artifactType: 'QUOTE_COMPARISON_WORKSPACE', artifactId: created.workspace.id,
          relationship: created.reused ? 'REUSED' : 'CREATED', label: workspaceLabel,
          status: created.workspace.status, createdAt: created.workspace.createdAt.toISOString(),
          navigation: { label: 'Open comparison', href },
        }],
      }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = created.workspace.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's QUOTE_COMPARISON_CREATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `quote-comparison-create-refresh-failed-${created.workspace.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The comparison workspace was saved. A result you were viewing could not refresh automatically -- open the workspace directly to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacDecisionStart(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionStartInputSchema.safeParse(parameters.hvacDecisionStart);
    if (!candidate.success) {
      const error = new Error('The decision thread settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionStartContextVersion(execution.propertyId, candidate.data.inventoryItemId)) {
      const error = new Error('The HVAC system record changed while confirmation was open. Review the current record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const startSelection = await decisionThreadService.selectHvacDecisionThread(execution.propertyId, candidate.data.inventoryItemId);
    if (startSelection.kind !== 'NONE') {
      const error = new Error('A decision thread already exists for this HVAC system.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const { thread: createdThread, snapshot: createdSnapshot } = await decisionThreadService.createHvacDecisionThread({
      propertyId: execution.propertyId, userId, inventoryItemId: candidate.data.inventoryItemId, askExecutionId: execution.id,
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_START_CREATED',
      blocks: [
        decisionProgressBlock('hvac-decision-created', 'Decision thread started', createdThread, createdSnapshot, []),
        whyNowBlock('hvac-decision-why-now', createdSnapshot, []),
        ...await preferenceReferenceBlocksForSnapshot('hvac-decision-created', createdSnapshot.preferenceReferenceIds),
      ],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = createdThread.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_START entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `hvac-decision-start-refresh-failed-${createdThread.id}`, title: 'Saved; list could not refresh',
        body: 'The decision thread was started successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Should I repair or replace my HVAC?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacDecisionScenario(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionScenarioInputSchema.safeParse(parameters.hvacDecisionScenario);
    if (!candidate.success) {
      const error = new Error('The scenario settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const scenarioThread = await prisma.decisionThread.findFirst({ where: { id: candidate.data.decisionThreadId, propertyId: execution.propertyId }, include: { currentRecommendationSnapshot: true } });
    if (!scenarioThread) {
      const error = new Error('Decision thread not found.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const { scenario, scenarioSnapshot } = await decisionThreadService.createHvacScenario(scenarioThread.id, userId, {
      quoteAmountCents: candidate.data.quoteAmountCents, vendorLabel: candidate.data.vendorLabel, askExecutionId: execution.id,
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_SCENARIO_CREATED',
      blocks: [
        scenarioComparisonBlock(
          'hvac-scenario-comparison', `Scenario: ${candidate.data.vendorLabel}`, scenarioThread.id, scenario.id,
          { label: 'Current recommendation', verdictCode: scenarioThread.currentRecommendationSnapshot?.verdictCode ?? 'UNKNOWN', reasonCodes: scenarioThread.currentRecommendationSnapshot?.reasonCodes ?? [], limitationCodes: scenarioThread.currentRecommendationSnapshot?.limitationCodes ?? [] },
          { label: scenario.label, verdictCode: scenarioSnapshot.verdictCode, reasonCodes: scenarioSnapshot.reasonCodes, limitationCodes: scenarioSnapshot.limitationCodes, assumptions: [{ label: 'Quote amount', value: `$${(candidate.data.quoteAmountCents / 100).toFixed(2)}` }, { label: 'Vendor', value: candidate.data.vendorLabel }] },
        ),
        ...await preferenceReferenceBlocksForSnapshot('hvac-scenario', scenarioSnapshot.preferenceReferenceIds),
      ],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = scenario.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_SCENARIO entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `hvac-decision-scenario-refresh-failed-${scenario.id}`, title: 'Saved; list could not refresh',
        body: 'The scenario was saved successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Should I repair or replace my HVAC?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacDecisionAbandon(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionAbandonInputSchema.safeParse(parameters.hvacDecisionAbandon);
    if (!candidate.success) {
      const error = new Error('The abandon request is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const abandonedThread = await decisionThreadService.abandonDecisionThread(candidate.data.decisionThreadId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_ABANDONED',
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `hvac-decision-abandoned-${abandonedThread.id}`, title: 'Decision abandoned', status: 'COMPLETED', description: 'The decision thread is no longer active. You can start a new one at any time.', details: [{ label: 'Thread', value: abandonedThread.title }], actions: [] }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = abandonedThread.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_ABANDON entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-decision-abandon-refresh-failed-${abandonedThread.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The decision was abandoned successfully. A result you were viewing could not refresh automatically -- ask about this HVAC system again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacDecisionOutcomeReport(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionOutcomeReportInputSchema.safeParse(parameters.hvacDecisionOutcomeReport);
    if (!candidate.success) {
      const error = new Error('The outcome details are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const { observation } = await outcomeObservationService.recordHomeownerReportedOutcome({
      propertyId: execution.propertyId, userId, decisionThreadId: candidate.data.decisionThreadId,
      actionState: candidate.data.actionState, costCents: candidate.data.costCents, occurredOn: null, note: candidate.data.note,
    });
    const reportedRows = await outcomeObservationService.getOutcomeSummaryForThread(candidate.data.decisionThreadId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_OUTCOME_RECORDED',
      blocks: [outcomeSummaryBlock('hvac-outcome-recorded', candidate.data.decisionThreadId, reportedRows)],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = observation.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_OUTCOME_REPORT entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-outcome-report-refresh-failed-${observation.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The outcome was recorded successfully. A result you were viewing could not refresh automatically -- ask about this decision again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacDecisionOutcomeUnlink(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionOutcomeUnlinkInputSchema.safeParse(parameters.hvacDecisionOutcomeUnlink);
    if (!candidate.success) {
      const error = new Error('The outcome selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const disputed = await outcomeObservationService.disputeOutcomeObservation(candidate.data.outcomeObservationId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_OUTCOME_DISPUTED',
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `hvac-outcome-disputed-${disputed.id}`, title: 'Outcome disputed', status: 'COMPLETED', description: 'The reported outcome is now marked as disputed. It was not deleted.', details: [], actions: [] }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = disputed.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_OUTCOME_UNLINK entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-outcome-unlink-refresh-failed-${disputed.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The outcome was disputed successfully. A result you were viewing could not refresh automatically -- ask about this decision again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacPreferenceSave(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = parameters.hvacPreferenceSave as {
      ownership: decisionPreferenceService.ParsedOwnershipHorizon | null;
      approach: decisionPreferenceService.ParsedRepairReplaceApproach | null;
    } | undefined;
    if (!candidate || (!candidate.ownership && !candidate.approach)) {
      const error = new Error('The preference details are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const savedIds: string[] = [];
    const savedBlocks: AskPresentationBlock[] = [];
    const affectedThreadIds = new Set<string>();
    try {
      if (candidate.ownership) {
        const saved = await decisionPreferenceService.saveOwnershipHorizonPreference(execution.propertyId, userId, candidate.ownership);
        savedIds.push(saved.preferenceValueId);
        saved.affectedThreadIds.forEach((id) => affectedThreadIds.add(id));
        savedBlocks.push({
          type: 'PREFERENCE_REFERENCE', id: 'hvac-preference-saved-ownership-horizon', title: 'Ownership horizon saved',
          preferenceKey: 'OWNERSHIP_HORIZON', summary: `Saved: plan to sell in about ${candidate.ownership.horizonMonths} months.`,
          visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: new Date().toISOString(), expiresAt: null,
        });
      }
      if (candidate.approach) {
        const saved = await decisionPreferenceService.saveRepairReplaceApproachPreference(execution.propertyId, userId, candidate.approach);
        savedIds.push(saved.preferenceValueId);
        saved.affectedThreadIds.forEach((id) => affectedThreadIds.add(id));
        savedBlocks.push({
          type: 'PREFERENCE_REFERENCE', id: 'hvac-preference-saved-approach', title: 'Approach saved',
          preferenceKey: 'REPAIR_REPLACE_APPROACH', summary: `Saved: ${candidate.approach.approach.replace(/_/g, ' ').toLowerCase()}.`,
          visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: new Date().toISOString(), expiresAt: null,
        });
      }
    } catch (caught) {
      if (caught instanceof HouseholdProfileNotEnabledError) {
        const error = new Error('The optional household profile is not enabled for this property yet, so this plan cannot be saved as a household preference. Enable the household profile first, then try again.');
        (error as Error & { code?: string }).code = 'ASK_HOUSEHOLD_PROFILE_REQUIRED';
        throw error;
      }
      throw caught;
    }
    // D03 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
    // saving a preference now marks every thread it could apply to stale,
    // the same way confirmHvacPreferenceForget already does on revoke --
    // closing the save/forget asymmetry the audit found.
    if (affectedThreadIds.size) {
      await decisionThreadService.markThreadsStaleByIds([...affectedThreadIds], 'PREFERENCE_SAVED');
    }
    savedBlocks.push({
      type: 'WORKFLOW_PROGRESS', id: 'hvac-preference-saved-refresh', title: 'Refresh scheduled', status: 'COMPLETED',
      description: affectedThreadIds.size ? 'Affected decisions will be recalculated the next time you open them.' : 'No active decision currently uses this preference.',
      details: [], actions: [],
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_PREFERENCE_SAVED',
      blocks: savedBlocks, confirmation: null, suggestions: ['Should I repair or replace my HVAC?'],
    };
    artifactType = command.artifactType;
    artifactId = savedIds[0] ?? '';
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_PREFERENCE_SAVE entry. This
    // is in addition to, not instead of, the markThreadsStaleByIds call
    // above (that marks the canonical DecisionThread stale; this refreshes
    // an already-rendered Ask conversation card in the same session).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: 'hvac-preference-save-refresh-failed', severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The preference was saved successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        suggestions: ['Should I repair or replace my HVAC?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHvacPreferenceForget(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = parameters.hvacPreferenceForget as { preferenceValueId: string } | undefined;
    if (!candidate?.preferenceValueId) {
      const error = new Error('The preference to forget is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    let affectedThreadIds: string[];
    try {
      ({ affectedThreadIds } = await decisionPreferenceService.revokeHvacPreference(candidate.preferenceValueId, userId));
    } catch (caught) {
      if (caught instanceof PreferenceNotAuthorizedError) {
        const error = new Error(caught.message);
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      throw caught;
    }
    await decisionThreadService.markThreadsStaleByIds(affectedThreadIds, 'PREFERENCE_REVOKED');
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_PREFERENCE_FORGOTTEN',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `hvac-preference-forgotten-${candidate.preferenceValueId}`, title: 'Preference forgotten', status: 'COMPLETED',
        description: affectedThreadIds.length ? 'Affected decisions will be recalculated the next time you open them.' : 'No active decision used this preference.',
        details: [], actions: [],
      }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = candidate.preferenceValueId;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_PREFERENCE_FORGET entry
    // (same markThreadsStaleByIds-plus-refresh reasoning as
    // confirmHvacPreferenceSave above).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-preference-forget-refresh-failed-${candidate.preferenceValueId}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The preference was forgotten successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        suggestions: ['Should I repair or replace my HVAC?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHomeDeadlineMonitor(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HomeDeadlineMonitorInputSchema.safeParse(parameters.homeDeadlineMonitor);
    if (!candidate.success) {
      const error = new Error('The expiration reminder settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    let task;
    if (candidate.data.sourceType === 'MAINTENANCE') {
      task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } });
      if (!task || task.status === MaintenanceTaskStatus.CANCELLED || !task.nextDueDate || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(task)) {
        const error = new Error('This maintenance task changed while confirmation was open. Review the current task and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
    } else {
      // Unlike the MAINTENANCE branch above, this previously reused
      // candidate.data.dueDate/title from prep time with no recheck at all
      // -- editing or deleting the warranty/policy during the confirmation
      // window would silently create a reminder pinned to a stale
      // expiration date. Re-fetch the actual source record and require it
      // to match the version captured at prep time before proceeding.
      const currentSource = candidate.data.sourceType === 'WARRANTY'
        ? await prisma.warranty.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } })
        : await prisma.insurancePolicy.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } });
      await assertCoverageConflictFree(execution.propertyId, prisma, candidate.data.sourceType === 'WARRANTY'
        ? { warrantyId: candidate.data.sourceId }
        : { insurancePolicyId: candidate.data.sourceId });
      if (!currentSource || !currentSource.expiryDate || parameters.homeDeadlineSourceVersion !== homeDeadlineSourceVersion(currentSource as { id: string; expiryDate: Date | null; updatedAt: Date })) {
        const error = new Error(`This ${candidate.data.sourceType === 'WARRANTY' ? 'warranty' : 'insurance policy'} changed while confirmation was open. Review the current record and try again.`);
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const actionKey = `ask-deadline:${candidate.data.sourceType}:${candidate.data.sourceId}`;
      task = await prisma.propertyMaintenanceTask.findUnique({ where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } } });
      if (!task) {
        try {
          task = await PropertyMaintenanceTaskService.createUserTask(userId, execution.propertyId, { title: candidate.data.title, priority: MaintenanceTaskPriority.HIGH, nextDueDate: candidate.data.dueDate, actionKey });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
          task = await prisma.propertyMaintenanceTask.findUnique({ where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } } });
          if (!task) throw error;
        }
      } else if (task.nextDueDate?.toISOString().slice(0, 10) !== candidate.data.dueDate || task.status === MaintenanceTaskStatus.CANCELLED) {
        task = await PropertyMaintenanceTaskService.updateTask(userId, task.id, { nextDueDate: candidate.data.dueDate, status: MaintenanceTaskStatus.PENDING, priority: MaintenanceTaskPriority.HIGH });
      }
    }
    // Notification categories are property-wide switches (userId + property +
    // category + channel), not scoped to the single task/policy just
    // confirmed. Enabling both MAINTENANCE and MATERIAL_DEADLINE regardless
    // of which reminder was actually confirmed silently turns on emails for
    // an unrelated category the consent copy never disclosed. Enable only
    // the category the confirmed reminder belongs to.
    const deadlineCategory: 'MAINTENANCE' | 'MATERIAL_DEADLINE' = candidate.data.sourceType === 'MAINTENANCE' ? 'MAINTENANCE' : 'MATERIAL_DEADLINE';
    const property = await prisma.property.findUnique({ where: { id: execution.propertyId }, select: { timezone: true } });
    await upsertNotificationPreference(userId, { propertyId: execution.propertyId!, category: deadlineCategory, channel: 'EMAIL', enabled: true, cadence: 'IMMEDIATE', timezone: property?.timezone ?? 'UTC' });
    const href = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    const maintenanceSource = candidate.data.sourceType === 'MAINTENANCE';
    result = { status: 'COMPLETED', reasonCode: maintenanceSource ? 'MAINTENANCE_MONITOR_ACTIVE' : 'HOME_DEADLINE_MONITOR_ACTIVE', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-deadline-${task.id}`, title: maintenanceSource ? 'Maintenance reminders are active' : 'Expiration reminder is active', status: 'COMPLETED', description: maintenanceSource ? 'The existing canonical task now has governed in-app and email delivery preferences; no duplicate task was created.' : 'A canonical dated obligation now drives governed in-app and email reminders.', details: [{ label: 'Reminder', value: task.title }, { label: 'Due', value: candidate.data.dueDate }, { label: maintenanceSource ? 'Reminder window' : 'Lead time', value: maintenanceSource ? 'Within 7 days of due date' : `${candidate.data.leadDays} days` }, { label: 'Channel', value: 'In-app plus email' }], actions: [{ id: 'manage-reminder', label: 'Manage reminder', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [`Reschedule ${task.title}`, `Archive ${task.title}`] };
    artifactType = command.artifactType;
    artifactId = task.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HOME_DEADLINE_MONITOR entry
    // (the non-maintenance branch above creates/updates a real
    // PropertyMaintenanceTask, so MAINTENANCE_STATUS is a genuine sibling).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `home-deadline-monitor-refresh-failed-${task.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The reminder was saved successfully. A result you were viewing could not refresh automatically -- ask "What maintenance is still pending?" to see its current state.',
        suggestions: ['What maintenance is still pending?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmHouseholdInvitation(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role !== HouseholdRole.OWNER) {
      const error = new Error('Only a household owner can send this invitation.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const inviteEmail = parameters.inviteEmail;
    const inviteRole = parameters.inviteRole;
    const expectedHouseholdVersion = parameters.householdContextVersion;
    const currentHouseholdVersion = await householdWorkflowVersion(execution.propertyId);
    const candidate = HouseholdInvitationInputSchema.safeParse({ email: inviteEmail, role: inviteRole });
    if (!candidate.success || expectedHouseholdVersion !== currentHouseholdVersion) {
      const error = new Error(expectedHouseholdVersion !== currentHouseholdVersion
        ? 'Household access changed while this confirmation was open. Review the current household and try again.'
        : 'The household invitation settings are invalid.');
      (error as Error & { code?: string }).code = expectedHouseholdVersion !== currentHouseholdVersion
        ? 'ASK_CONTEXT_VERSION_CONFLICT'
        : 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const invite = await householdService.sendInvite(
      execution.propertyId,
      userId,
      candidate.data,
      { sourceAskExecutionId: execution.id },
    );
    const householdHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/household`;
    result = {
      status: 'COMPLETED', reasonCode: 'HOUSEHOLD_INVITATION_PENDING',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `household-invite-${invite.id}`, title: 'Household invitation is pending', status: 'PENDING',
        description: 'The invitation record is ready. Access is not active until the recipient accepts it.',
        details: [
          { label: 'Recipient', value: invite.inviteeEmail },
          { label: 'Role', value: invitationRoleCopy(invite.role as InvitableHouseholdRole) },
          { label: 'Expires', value: humanDate(invite.expiresAt) ?? invite.expiresAt.toISOString() },
          { label: 'Access status', value: 'Pending acceptance' },
        ],
        actions: [{ id: 'manage-invitation', label: 'Manage invitation', href: householdHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['Who currently has access to this home?'],
    };
    artifactType = 'HOUSEHOLD_INVITE';
    artifactId = invite.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all. No sibling declared in ASK_MUTATION_IMPACT_MAP (no "list
    // household members" read exists) -- this still gets the explicit
    // sourceExecutionId refresh for free.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `household-invitation-refresh-failed-${invite.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The invitation was saved successfully. A result you were viewing could not refresh automatically -- ask "Who currently has access to this home?" to see its current state.',
        suggestions: ['Who currently has access to this home?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
async function confirmRefinanceRateMonitor(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const thresholdPct = parameters.thresholdPct;
    const product = parameters.product;
    if (typeof thresholdPct !== 'number' || (product !== 'FIXED_30_YEAR' && product !== 'FIXED_15_YEAR')) {
      const error = new Error('The monitor settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.refinanceMonitorContextVersion !== await refinanceMonitorContextVersion(userId, execution.propertyId)) {
      const error = new Error('Mortgage-rate data or notification settings changed while confirmation was open. Review the current settings and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const monitor = await createOrUpdateRefinanceRateMonitor({
      userId, propertyId: execution.propertyId, thresholdPct,
      product: product as RefinanceRateMonitorProduct,
      cadence: NotificationCadence.IMMEDIATE,
      quietStart: typeof parameters.quietStart === 'string' ? parameters.quietStart : null,
      quietEnd: typeof parameters.quietEnd === 'string' ? parameters.quietEnd : null,
      timezone: typeof parameters.timezone === 'string' ? parameters.timezone : 'UTC',
    });
    result = {
      status: 'COMPLETED', reasonCode: 'RATE_MONITOR_ACTIVE',
      blocks: [refinanceMonitorBlock(monitor, 'Mortgage-rate monitor started')],
      confirmation: null, suggestions: ['Is refinancing worth reviewing now?'],
    };
    artifactType = 'REFINANCE_RATE_MONITOR';
    artifactId = monitor.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's REFINANCE_RATE_MONITOR entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `refinance-monitor-refresh-failed-${monitor.id}`, title: 'Saved; list could not refresh',
        body: 'This monitor was saved. A refinance result you were viewing could not refresh automatically -- ask "Is refinancing worth reviewing now?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Is refinancing worth reviewing now?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('incident-claim.file', confirmClaimFile);
registerConfirmCapabilityHandler('incident-claim.transition', confirmClaimTransition);
registerConfirmCapabilityHandler('inspection-findings.update', confirmInspectionFindingUpdate);
registerConfirmCapabilityHandler('seller-prep.item-decision', confirmSellerPrepItemDecision);

async function confirmInventoryItemCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = InventoryItemCorrectionInputSchema.safeParse(parameters.inventoryCorrection);
  if (!candidate.success) throw Object.assign(new Error('The inventory correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { itemId, field, value } = candidate.data;
  const invalid = await inventoryFieldValueError(execution.propertyId!, field, value);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter the corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const normalized = inventoryFieldNormalized(field, value);
  const dynamicOptions = field === INVENTORY_ROOM_LINK_FIELD ? await inventoryRoomLinkOptions(execution.propertyId!) : undefined;
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, propertyId: execution.propertyId } });
  if (!item) throw Object.assign(new Error('This inventory item is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // A recovery retry of this same execution (receipt reclaimed after the
  // write below committed) sees the already-corrected value: treat it as
  // applied rather than misreporting the execution's own success as a
  // concurrent change. updateItem is a plain overwrite, so this is also the
  // only replay guard the write needs.
  const previous = inventoryFieldCurrent(item, field);
  const alreadyApplied = previous === (field === INVENTORY_ROOM_LINK_FIELD ? (normalized === INVENTORY_CORRECTION_NO_ROOM_VALUE ? null : normalized) : normalized);
  if (!alreadyApplied && parameters.inventoryCorrectionContextVersion !== inventoryItemContextVersion(item)) {
    throw Object.assign(new Error('This inventory item changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  if (!alreadyApplied) {
    const combinedBlocker = inventoryCorrectionCombinedBlocker(item, field, normalized);
    if (combinedBlocker) throw Object.assign(new Error(combinedBlocker), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    await inventoryService.updateItem(execution.propertyId!, item.id, inventoryFieldPatch(field, normalized));
    // The traditional item PATCH controller (not the service) marks these five analyses stale; repeat them so an
    // Ask correction has the same downstream effect (a changed date, cost or condition alters replace-or-repair,
    // coverage and risk analyses).
    await markCoverageAnalysisStale(execution.propertyId!);
    await markItemCoverageAnalysesStale(execution.propertyId!, item.id);
    await markReplaceRepairStale(execution.propertyId!, item.id);
    await markRiskPremiumOptimizerStale(execution.propertyId!);
    await markDoNothingRunsStale(execution.propertyId!);
  }
  const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  const meta = INVENTORY_CORRECTION_FIELDS[field];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INVENTORY_ITEM_CORRECTED', contextVersion: inventoryItemContextVersion(updated),
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inventory-corrected-${item.id}`, title: 'Inventory record updated', status: 'COMPLETED',
      description: 'The canonical inventory record was updated and dependent analyses were marked for refresh.',
      details: [{ label: 'Item', value: item.name }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : inventoryFieldDisplay(field, previous, dynamicOptions) }, { label: 'New value', value: inventoryFieldDisplay(field, normalized, dynamicOptions) }],
      actions: [{ id: 'open-inventory', label: 'Open home inventory', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/inventory?tab=items`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home inventory'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `inventory-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This correction was saved to the canonical inventory record. The result you were viewing could not refresh automatically -- ask "Show my home inventory" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ITEM', artifactId: item.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('inventory.item-correct', confirmInventoryItemCorrect);

async function confirmHomeEventCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomeEventCorrectionInputSchema.safeParse(parameters.homeEventCorrection);
  if (!candidate.success) throw Object.assign(new Error('The timeline correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { eventId, field, value } = candidate.data;
  const invalid = await homeEventCorrectionValueError(execution.propertyId!, field, value);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter the corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const normalized = correctionNormalized(HOME_EVENT_CORRECTION_FIELDS[field], value);
  // updateHomeEvent has no idempotency of its own and supersedes every time:
  // a lease-reclaim retry must find this execution's own replacement first.
  const correctionKey = `ask-correction:${execution.id}`;
  const finish = async (replacement: { id: string; title: string }): Promise<ConfirmCapabilityResult> => {
    const result = captureEventResult(execution.propertyId!, replacement, true);
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `home-event-refresh-failed-${replacement.id}`, title: 'Saved; view could not refresh',
        body: 'This correction was saved to your home timeline. The result you were viewing could not refresh automatically -- ask "Show my home timeline" to see its current state.',
        severity: 'CAUTION',
      });
    }
    return { result, artifactType: 'HOME_EVENT', artifactId: replacement.id, refreshedExecutions: refresh.refreshedExecutions };
  };
  const findWinner = () => prisma.homeEvent.findFirst({ where: { propertyId: execution.propertyId, idempotencyKey: correctionKey } });
  const already = await findWinner();
  if (already) return finish(already);
  const current = await prisma.homeEvent.findFirst({
    where: { id: eventId, propertyId: execution.propertyId, isCurrent: true, deletedAt: null },
    select: { id: true, title: true, revision: true, visibility: true, createdById: true, datePrecision: true, type: true, roomId: true, inventoryItemId: true },
  });
  if (!current || (current.visibility === 'PRIVATE' && current.createdById !== userId)) {
    throw Object.assign(new Error('This timeline event is no longer available. It may have been corrected or removed.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  if (parameters.homeEventCorrectionContextVersion !== homeEventContextVersion(current)) {
    throw Object.assign(new Error('This timeline event changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  const blocker = homeEventCorrectionBlocker(current, field);
  if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const patch = homeEventFieldPatch(field, normalized);
  try {
    const replacement = await homeEventsServiceForCapture.updateHomeEvent(
      execution.propertyId!, current.id,
      { ...patch, correctionReason: 'Corrected through Ask after homeowner confirmation.' },
      userId, { idempotencyKey: correctionKey },
    );
    return finish(replacement);
  } catch (error) {
    // Same two race recoveries as confirmCaptureEvent: the winner's whole
    // supersede+create transaction commits atomically, so re-reading by this
    // execution's key finds it.
    if ((error instanceof APIError && error.code === 'HOME_EVENT_NOT_FOUND') || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      const winner = await findWinner();
      if (winner) return finish(winner);
      if (error instanceof APIError) throw Object.assign(new Error('The event to correct is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    throw error;
  }
}
registerConfirmCapabilityHandler('home-event.correct', confirmHomeEventCorrect);

async function confirmHomeEventVisibility(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomeEventVisibilityInputSchema.safeParse(parameters.homeEventVisibility);
  if (!candidate.success || candidate.data.value === null) throw Object.assign(new Error('The visibility to save is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { eventId, value: proposed } = candidate.data;
  const current = await prisma.homeEvent.findFirst({
    where: { id: eventId, propertyId: execution.propertyId, isCurrent: true, deletedAt: null },
    select: { id: true, title: true, revision: true, visibility: true, createdById: true },
  });
  if (!current || (current.visibility === 'PRIVATE' && current.createdById !== userId)) {
    throw Object.assign(new Error('This timeline event is no longer available. It may have been corrected or removed.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  const alreadyApplied = current.visibility === proposed;
  if (!alreadyApplied) {
    const blocker = homeEventVisibilityBlocker(userId, current.createdById, current.visibility, proposed);
    if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_PERMISSION_REQUIRED' });
    if (parameters.homeEventVisibilityContextVersion !== homeEventContextVersion(current)) {
      throw Object.assign(new Error('This timeline event changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    await homeEventsServiceForCapture.setVisibility({ propertyId: execution.propertyId!, eventId: current.id, visibility: proposed });
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'HOME_EVENT_VISIBILITY_CHANGED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-event-visibility-${current.id}`, title: alreadyApplied ? 'Visibility already set' : 'Visibility changed', status: 'COMPLETED',
      description: 'The canonical timeline event was updated in place.',
      details: [{ label: 'Event', value: current.title }, { label: 'Previous visibility', value: alreadyApplied ? 'Already set' : HOME_EVENT_VISIBILITY_LABELS[current.visibility] ?? current.visibility }, { label: 'New visibility', value: HOME_EVENT_VISIBILITY_LABELS[proposed] ?? proposed }],
      actions: [{ id: 'open-timeline', label: 'Open home timeline', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/timeline`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home timeline'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `home-event-visibility-refresh-failed-${current.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This visibility change was saved to the canonical timeline event. The result you were viewing could not refresh automatically -- ask "Show my home timeline" to see its current state.',
    });
  }
  return { result, artifactType: 'HOME_EVENT', artifactId: current.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-event.visibility', confirmHomeEventVisibility);

async function confirmWarrantyCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = WarrantyCorrectionInputSchema.safeParse(parameters.warrantyCorrection);
  if (!candidate.success) throw Object.assign(new Error('The warranty correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { warrantyId, field, value } = candidate.data;
  const warranty = await prisma.warranty.findFirst({
    where: { id: warrantyId, propertyId: execution.propertyId },
    include: { homeownerProfile: { select: { id: true, userId: true } } },
  });
  if (!warranty) throw Object.assign(new Error('This warranty is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // Ownership is re-verified at execution time: updateWarranty is scoped to
  // the owning homeownerProfile, and Ask must not widen that.
  if (warranty.homeownerProfile.userId !== userId) {
    throw Object.assign(new Error('Only the household member who added this warranty can change it.'), { code: 'ASK_PERMISSION_REQUIRED' });
  }
  const invalid = warrantyCorrectionValueError(field, value, warranty);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter a corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next = correctionNormalized(WARRANTY_CORRECTION_FIELDS[field], value);
  const previous = warrantyFieldCurrent(warranty, field);
  // A recovery retry of this same execution sees the already-corrected value.
  const alreadyApplied = previous === next;
  if (!alreadyApplied && parameters.warrantyCorrectionContextVersion !== warrantyContextVersion(warranty)) {
    throw Object.assign(new Error('This warranty changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  // Narrowed patch: never the request body, only the one confirmed field.
  if (!alreadyApplied) await updateWarranty(warranty.id, warranty.homeownerProfile.id, warrantyFieldPatch(field, next));
  const updated = await prisma.warranty.findUniqueOrThrow({ where: { id: warranty.id } });
  const meta = WARRANTY_CORRECTION_FIELDS[field];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'WARRANTY_CORRECTED', contextVersion: warrantyContextVersion(updated),
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `warranty-corrected-${warranty.id}`, title: 'Warranty updated', status: 'COMPLETED',
      description: 'The warranty record was updated and dependent coverage analysis was marked for refresh.',
      details: [{ label: 'Warranty', value: updated.providerName }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : correctionDisplay(meta, previous) }, { label: 'New value', value: correctionDisplay(meta, next) }],
      actions: [{ id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'PRIMARY' }],
    }],
    suggestions: ['Show my warranties'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `warranty-refresh-failed-${warranty.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This correction was saved to the warranty record. The result you were viewing could not refresh automatically -- ask "Show my warranties" to see its current state.',
    });
  }
  return { result, artifactType: 'WARRANTY', artifactId: warranty.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('warranty.correct', confirmWarrantyCorrect);

async function confirmRoomRename(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = RoomRenameInputSchema.safeParse(parameters.roomRename);
  if (!candidate.success) throw Object.assign(new Error('The room correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { roomId, field, value } = candidate.data;
  const meta = ROOM_CORRECTION_FIELDS[field];
  const room = await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId: execution.propertyId } });
  if (!room) throw Object.assign(new Error('This room is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const proposed = typeof value === 'string' ? roomCorrectionNormalized(field, value) : '';
  const previous = roomFieldCurrent(room, field);
  // A recovery retry of this same execution sees the already-applied value.
  const alreadyApplied = proposed.length > 0 && previous === proposed;
  if (!alreadyApplied) {
    const invalid = await roomCorrectionValueError(execution.propertyId!, room.id, field, value);
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    if (parameters.roomRenameContextVersion !== roomContextVersion(room)) {
      throw Object.assign(new Error('This room changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    // Narrowed to the one field being corrected.
    const patch = field === 'floorLevel' ? { floorLevel: Number(proposed) } : field === 'type' ? { type: proposed } : { name: proposed };
    try {
      await inventoryService.updateRoom(execution.propertyId!, room.id, patch);
    } catch (error) {
      if (error instanceof APIError && error.code === 'ROOM_ALREADY_EXISTS') throw Object.assign(new Error('Another room in this home already has that name.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      throw error;
    }
    // The traditional PATCH controller (not the service) marks these stale;
    // repeat them so an Ask correction has the same downstream effect.
    await markCoverageAnalysisStale(execution.propertyId!);
    await markRiskPremiumOptimizerStale(execution.propertyId!);
    await markDoNothingRunsStale(execution.propertyId!);
  }
  const renamed = field === 'name';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: renamed ? 'ROOM_RENAMED' : 'ROOM_CORRECTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `room-${renamed ? 'renamed' : 'corrected'}-${room.id}`, title: renamed ? 'Room renamed' : 'Room updated', status: 'COMPLETED',
      description: 'The canonical room record was updated and dependent coverage analysis was marked for refresh.',
      details: renamed
        ? [{ label: 'Previous name', value: alreadyApplied ? 'Already renamed' : room.name }, { label: 'New name', value: proposed }]
        : [{ label: 'Room', value: room.name }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : roomFieldDisplay(field, previous) }, { label: 'New value', value: roomFieldDisplay(field, proposed) }],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/rooms`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my rooms'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `room-refresh-failed-${room.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: `This ${renamed ? 'rename' : 'correction'} was saved to the canonical room record. The result you were viewing could not refresh automatically -- ask "Show my rooms" to see its current state.`,
    });
  }
  return { result, artifactType: 'INVENTORY_ROOM', artifactId: room.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('room.rename', confirmRoomRename);






async function confirmRoomCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = RoomCreateInputSchema.safeParse(parameters.roomCreate);
  if (!candidate.success) throw Object.assign(new Error('The room to add is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { type, name, floorLevel } = candidate.data;
  const propertyId = execution.propertyId!;
  const existing = await prisma.inventoryRoom.findFirst({ where: { propertyId, name }, select: { id: true, createdAt: true } });
  let roomId: string;
  let alreadyAdded = false;
  if (existing) {
    // createRoom has no idempotency key: a same-named room created since this execution began is this execution's own
    // earlier write (a lease-reclaim retry), not a clash with something else.
    if (existing.createdAt.getTime() < execution.createdAt.getTime()) {
      throw Object.assign(new Error(`A room named "${name}" already exists in this home.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    }
    roomId = existing.id;
    alreadyAdded = true;
  } else {
    try {
      const created = await inventoryService.createRoom(propertyId, { type, name, floorLevel });
      roomId = created.id;
    } catch (error) {
      if (error instanceof APIError && error.code === 'ROOM_ALREADY_EXISTS') throw Object.assign(new Error(`A room named "${name}" already exists in this home.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      throw error;
    }
    // The traditional POST controller (not the service) marks these stale; repeat them for the same downstream effect.
    await markCoverageAnalysisStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'ROOM_CREATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `room-created-${roomId}`, title: alreadyAdded ? 'Room already added' : 'Room added', status: 'COMPLETED',
      description: 'The room is now part of your home record and dependent coverage analysis was marked for refresh.',
      details: [{ label: 'Room name', value: name }, { label: 'Type', value: roomTypeLabel(type) }, ...(floorLevel !== null ? [{ label: 'Floor level', value: String(floorLevel) }] : [])],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/rooms`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my rooms'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `room-refresh-failed-${roomId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This room was added to the canonical record. The result you were viewing could not refresh automatically -- ask "Show my rooms" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ROOM', artifactId: roomId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('room.create', confirmRoomCreate);









async function confirmInventoryItemCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = InventoryCreateInputSchema.safeParse(parameters.inventoryCreate);
  if (!candidate.success) throw Object.assign(new Error('The item to add is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId!;
  const refuse = (message: string) => Object.assign(new Error(message), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  // createItem has no idempotency key: a same-named, same-category item created since this execution began is this
  // execution's own earlier write (a lease-reclaim retry). Checked first so the writer's own duplicate-appliance rule
  // cannot misreport that retry as a clash.
  const earlier = await prisma.inventoryItem.findFirst({
    where: { propertyId, name: input.name, category: input.category, createdAt: { gte: execution.createdAt } },
    select: { id: true },
  });
  let itemId: string;
  let alreadyAdded = false;
  if (earlier) {
    itemId = earlier.id;
    alreadyAdded = true;
  } else {
    const rooms = await inventoryCreateRooms(propertyId);
    const blocker = await inventoryCreateBlocker(propertyId, input, rooms);
    if (blocker) throw refuse(`${blocker.title}. ${blocker.body}`);
    try {
      const created = await inventoryService.createItem(propertyId, {
        name: input.name, category: input.category,
        roomId: input.roomId === INVENTORY_NO_ROOM_VALUE ? null : input.roomId,
        brand: input.brand, model: input.model,
      }, userId);
      itemId = created.id;
    } catch (error) {
      if (error instanceof APIError && error.statusCode < 500) throw refuse(error.message);
      throw error;
    }
    // The traditional POST controller (not the service) marks these stale; repeat them for the same downstream effect.
    await markCoverageAnalysisStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INVENTORY_ITEM_CREATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inventory-created-${itemId}`, title: alreadyAdded ? 'Item already added' : 'Item added', status: 'COMPLETED',
      description: 'The item is now part of your home record and dependent coverage analysis was marked for refresh. Ask can correct its dates, condition, costs and notes from the inventory list.',
      details: [{ label: 'Item name', value: input.name }, { label: 'Category', value: inventoryCategoryLabel(input.category) }, ...(input.brand ? [{ label: 'Brand', value: input.brand }] : []), ...(input.model ? [{ label: 'Model', value: input.model }] : [])],
      actions: [{ id: 'open-inventory', label: 'Open home inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home inventory'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `inventory-refresh-failed-${itemId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This item was added to the canonical record. The result you were viewing could not refresh automatically -- ask "Show my inventory" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ITEM', artifactId: itemId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('inventory.create', confirmInventoryItemCreate);

const areaScopeForMessage = (message: string): PropertyAreaCaptureScope | null =>
  PROPERTY_AREA_CAPTURE_SCOPES.find((scope) => AREA_CAPTURE_MESSAGES[scope] === message) ?? null;










registerCapabilityHandler('property-context.area-capture', async (envelope) => {
  const launch = envelope.launchContext;
  const scope = areaScopeForMessage(envelope.message);
  const entityMatches = !launch?.entityType || launch.entityType !== 'PROPERTY_CONTEXT_AREA' || launch.entityId === scope;
  const declaredStart = launch?.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE' && launch.surface !== 'ASK_REFRESH' && scope !== null && entityMatches;
  const notRoutable = (): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_AREA_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{ type: 'SUMMARY', id: 'area-capture-not-routable', title: 'Use "Fill in missing details" on the home record', body: 'Missing home details are filled in from the completeness list in your home summary. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
    suggestions: ['How complete is my home record?'],
  });
  if (declaredStart && scope) {
    const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
    if (access.role === HouseholdRole.VIEWER) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{ type: 'SUMMARY', id: 'area-capture-permission', title: 'A contributor or owner can add home details', body: 'Your role can view the home record but not change it. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-property-record', label: 'Open property record', href: areaCaptureFallbackHref(envelope.propertyId!, scope), style: 'SECONDARY' }] }],
        suggestions: [],
      };
    }
    // "Continue" from a receipt carries that workflow's skips; a start from any other result begins with none.
    let skip = new Set<string>();
    const sourceId = launch.sourceExecutionId ?? null;
    if (sourceId) {
      const source = await prisma.askExecution.findFirst({ where: { id: sourceId, userId: envelope.userId, propertyId: envelope.propertyId!, operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE' }, select: { parametersJson: true } });
      const inherited = source ? areaCaptureStateFrom(source.parametersJson) : null;
      if (inherited && inherited.scope === scope) skip = new Set(inherited.skipFactKeys);
    }
    return areaCapturePrompt(envelope.userId, envelope.propertyId!, scope, skip, sourceId);
  }
  // A refresh of this execution re-asks with ITS OWN stored skips (never reset, never client-supplied); anything else is not routable.
  if (launch?.surface === 'ASK_REFRESH') {
    const own = await prisma.askExecution.findFirst({ where: { id: envelope.executionId, userId: envelope.userId }, select: { parametersJson: true } });
    const state = own ? areaCaptureStateFrom(own.parametersJson) : null;
    if (state) return areaCapturePrompt(envelope.userId, envelope.propertyId!, state.scope, new Set(state.skipFactKeys), state.sourceExecutionId);
  }
  return notRoutable();
});

async function confirmPropertyAreaCapture(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = AreaCaptureAnswerSchema.safeParse(parameters.areaCapture);
  const state = areaCaptureStateFrom(parameters);
  if (!candidate.success || !state) throw areaCaptureError('ASK_CONFIRMATION_NOT_ACTIVE', 'The answer to save is invalid.');
  const propertyId = execution.propertyId;
  const stored = candidate.data;
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
  const confirmationVersion = typeof parameters.confirmationVersion === 'number' ? parameters.confirmationVersion : 1;
  // One write per execution + question + review version: a retry after a lost response returns the stored capture.
  const idempotencyKey = `ask-area-${createHash('sha256').update(`${execution.id}:${stored.requirementId}:${confirmationVersion}`).digest('hex').slice(0, 40)}`;
  const earlier = await prisma.propertyContextCaptureReceipt.findUnique({ where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey } }, select: { id: true, result: true } });
  const alreadyApplied = Boolean(earlier?.result);
  let updatedFactKeys: string[];
  try {
    const capture = await captureFeatureContext(propertyId, userId, {
      requirementId: stored.requirementId, captureKey: stored.captureKey,
      featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION,
      operationInput: { scope: stored.scope, skipFactKeys: state.skipFactKeys },
      expectedContextVersion: stored.expectedContextVersion, idempotencyKey, answer: stored.answer,
    }) as { updatedFactKeys?: string[] };
    updatedFactKeys = Array.isArray(capture.updatedFactKeys) ? capture.updatedFactKeys : [];
  } catch (error) {
    if (error instanceof PropertyContextVersionConflictError || (error instanceof Error && /no longer active/i.test(error.message))) {
      throw areaCaptureError('ASK_CONTEXT_VERSION_CONFLICT', 'The home record changed while you were reviewing. Start again from the area.');
    }
    if (error instanceof PropertyContextCaptureValidationError) throw areaCaptureError('ASK_INVALID_CONFIRMATION_EDIT', error.message);
    if (error instanceof PropertyContextAccessDeniedError) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
    throw error;
  }
  const writtenAreas = [...new Set(updatedFactKeys.map((key) => areaLabel(getFactDefinition(key).scope)))];
  const skip = new Set(state.skipFactKeys);
  const progress = await areaCaptureProgress(userId, propertyId, state.scope, skip);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'AREA_CAPTURE_SAVED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `area-capture-saved-${stored.requirementId}`, title: alreadyApplied ? 'Already saved' : 'Details saved', status: 'COMPLETED',
      description: alreadyApplied ? 'This answer was already saved by this conversation; nothing was written again.' : 'The answer is now part of your home record.',
      details: [...stored.rows, { label: 'Areas updated', value: (writtenAreas.length ? writtenAreas : stored.areas).join(', ') }],
      actions: [{ id: 'open-property-record', label: 'Open property record', href: areaCaptureFallbackHref(propertyId, state.scope), style: 'SECONDARY' }],
    },
    areaProgressBlock(propertyId, state.scope, progress, progress.askable.length === 0, true)],
    suggestions: ['How complete is my home record?'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `area-capture-refresh-failed-${stored.requirementId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This answer was saved to the home record. The summary you were viewing could not refresh automatically -- ask "How complete is my home record?" to see the current state.',
    });
  }
  return { result, artifactType: 'PROPERTY_CONTEXT', artifactId: stored.requirementId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('property-context.area-capture', confirmPropertyAreaCapture);
registerConfirmCapabilityHandler('document-promotion.confirm', confirmDocumentPromotionConfirm);
registerConfirmCapabilityHandler('home-operations.update', confirmOperationalWorkUpdate);
registerConfirmCapabilityHandler('maintenance.complete', confirmMaintenanceTaskComplete);
registerConfirmCapabilityHandler('buyer.task.complete', confirmBuyerTaskComplete);
registerConfirmCapabilityHandler('buyer.task.create', confirmBuyerTaskCreate);
registerConfirmCapabilityHandler('buyer.task.update', confirmBuyerTaskUpdate);
registerConfirmCapabilityHandler('buyer.finding.disposition', confirmBuyerFindingDisposition);
registerConfirmCapabilityHandler('buyer.lifecycle.update', confirmBuyerLifecycleUpdate);
registerConfirmCapabilityHandler('maintenance.create', confirmMaintenanceTaskCreate);
registerConfirmCapabilityHandler('maintenance.update', confirmMaintenanceTaskUpdate);
registerConfirmCapabilityHandler('guidance.journey.create', confirmGuidanceJourneyCreate);
registerConfirmCapabilityHandler('quote-comparison.create', confirmQuoteComparisonCreate);
registerConfirmCapabilityHandler('decision-platform.hvac.start', confirmHvacDecisionStart);
registerConfirmCapabilityHandler('decision-platform.hvac.scenario', confirmHvacDecisionScenario);
registerConfirmCapabilityHandler('decision-platform.hvac.abandon', confirmHvacDecisionAbandon);
registerConfirmCapabilityHandler('decision-platform.hvac.outcome.report', confirmHvacDecisionOutcomeReport);
registerConfirmCapabilityHandler('decision-platform.hvac.outcome.unlink', confirmHvacDecisionOutcomeUnlink);
registerConfirmCapabilityHandler('decision-platform.hvac.preference.save', confirmHvacPreferenceSave);
registerConfirmCapabilityHandler('decision-platform.hvac.preference.forget', confirmHvacPreferenceForget);
registerConfirmCapabilityHandler('home-deadline.monitor', confirmHomeDeadlineMonitor);
registerConfirmCapabilityHandler('household.invitation', confirmHouseholdInvitation);
registerConfirmCapabilityHandler('refinance.monitor', confirmRefinanceRateMonitor);


async function confirmCaptureFact(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const factKey = parameters.factKey;
  if (typeof factKey !== 'string' || !factKey.trim()) {
    throw Object.assign(new Error('The fact to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const sourceType: PropertyFactSourceType = typeof parameters.sourceType === 'string'
    ? parameters.sourceType as PropertyFactSourceType
    : 'USER_REPORTED';
  const attribution: AskCaptureAttribution | null = typeof parameters.attribution === 'string'
    ? parameters.attribution as AskCaptureAttribution
    : null;
  const captureChannel = typeof parameters.captureChannel === 'string' ? parameters.captureChannel : 'ASK_CHAT';
  const extractionConfidence = typeof parameters.extractionConfidence === 'number' ? parameters.extractionConfidence : null;
  const confidence = typeof parameters.confidence === 'number' ? parameters.confidence : null;

  // Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §19's "not every
  // scalar fact goes through capturePropertyFact" finding). factKey ===
  // FINANCING_CAPTURE_FACT_KEY is the one case this pass gives its own
  // writer to -- capturePropertyFact's own !definition.writable gate would
  // otherwise reject it outright, and the target model isn't
  // PropertyFactEvidence in the first place.
  let capture: Awaited<ReturnType<typeof capturePropertyFact>>;
  try {
    if (factKey === FINANCING_CAPTURE_FACT_KEY) {
      if (typeof parameters.value !== 'number') {
        throw Object.assign(new Error('The mortgage rate to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      }
      capture = await capturePropertyFinancingFact(execution.propertyId, userId, {
        value: parameters.value,
        sourceType,
        confidence,
        attribution,
        captureChannel,
        extractionConfidence,
        captureExecutionId: execution.id,
      });
    } else {
      capture = await capturePropertyFact(execution.propertyId, userId, factKey, {
        value: parameters.value,
        sourceType,
        confidence,
        attribution,
        captureChannel,
        extractionConfidence,
        captureExecutionId: execution.id,
      });
    }
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  const evidenceId = capture.evidenceIds[0] ?? '';
  const propertyRecordHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/edit`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'FACT_CAPTURED',
    blocks: [{
      type: 'SUMMARY', id: `fact-captured-${evidenceId}`, title: 'Recorded to your property record', tone: 'POSITIVE',
      body: `"${factKey}" is now saved to your Living Home Record.`,
      actions: [{ id: 'open-property-record', label: 'Open property record', href: propertyRecordHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_FACT_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `capture-fact-refresh-failed-${evidenceId}`, title: 'Saved; list could not refresh',
      body: 'This fact was saved to your Living Home Record. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      severity: 'CAUTION',
    });
  }
  return { result, artifactType: command.artifactType, artifactId: evidenceId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('capture.fact.confirm', confirmCaptureFact);

// IW-FRESH-003 fix: confirmCaptureEvent previously called no reconciliation
// mechanism at all on any of its five return paths (idempotent replay, two
// concurrent-write-race recoveries, the normal correction write, and the
// normal create) -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_EVENT_CONFIRM
// entry. Extracted once so every path reconciles identically instead of
// duplicating the same three lines five times.
async function captureEventConfirmResult(
  execution: ConfirmCapabilityContext['execution'],
  userId: string,
  parameters: Record<string, unknown>,
  event: { id: string; title: string },
  corrected: boolean,
  artifactType: string,
): Promise<ConfirmCapabilityResult> {
  const result = captureEventResult(execution.propertyId, event, corrected);
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `capture-event-refresh-failed-${event.id}`, title: 'Saved; list could not refresh',
      body: 'This event was saved to your home timeline. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      severity: 'CAUTION',
    });
  }
  return { result, artifactType, artifactId: event.id, refreshedExecutions: refresh.refreshedExecutions };
}

function captureEventResult(propertyId: string, event: { id: string; title: string }, corrected: boolean): AskOperationResult {
  const timelineHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/timeline`;
  return {
    status: 'COMPLETED', reasonCode: corrected ? 'EVENT_CORRECTED' : 'EVENT_CAPTURED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `event-${corrected ? 'corrected' : 'captured'}-${event.id}`, title: corrected ? 'Home timeline event corrected' : 'Added to your home timeline', status: 'COMPLETED',
      description: corrected
        ? 'A new revision replaces the prior entry on your home\'s canonical timeline; the original is preserved as history.'
        : 'This event is now part of your home\'s canonical timeline.',
      details: [{ label: 'Event', value: event.title }],
      actions: [{ id: 'open-timeline', label: 'Open timeline', href: timelineHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
}

async function confirmCaptureEvent(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;

  // Ask Cozy Stage 3, Phase 2 (implementation plan §8/§4.1; FRD §20).
  // Correction is built on HomeEvent's existing supersedesEventId/isCurrent
  // revision chain (HomeEventsService.updateHomeEvent, already proven by the
  // homeowner-facing timeline correction UI) -- never on correctionModes,
  // which §4.1 confirmed is entirely unconsumed metadata. A homeowner
  // follow-up that corrects something Ask already captured supplies
  // correctingEventId (how that resolution happens -- matching the
  // conversational reference to the right prior HomeEvent -- is Phase 3's
  // extraction job, not this phase's).
  const correctingEventId = typeof parameters.correctingEventId === 'string' ? parameters.correctingEventId : null;
  if (correctingEventId) {
    // updateHomeEvent has no idempotency check of its own (unlike
    // createHomeEvent) -- it unconditionally supersedes and creates a
    // replacement every time it's called, so a lease-reclaim retry of this
    // same execution would otherwise chain a second, spurious correction on
    // top of the first. Guard it the same way capturePropertyFact guards
    // its own write: check for this execution's own prior replacement
    // before ever calling the writer.
    const correctionIdempotencyKey = `ask-correction:${execution.id}`;
    const alreadyCorrected = await prisma.homeEvent.findFirst({
      where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
    });
    if (alreadyCorrected) {
      return captureEventConfirmResult(execution, userId, parameters, alreadyCorrected, true, command.artifactType);
    }
    let replacement: Awaited<ReturnType<typeof homeEventsServiceForCapture.updateHomeEvent>>;
    try {
      replacement = await homeEventsServiceForCapture.updateHomeEvent(
        execution.propertyId,
        correctingEventId,
        {
          ...parameters,
          correctionReason: typeof parameters.correctionReason === 'string' && parameters.correctionReason.trim()
            ? parameters.correctionReason
            : 'Corrected through Ask after homeowner confirmation.',
        },
        userId,
        { idempotencyKey: correctionIdempotencyKey },
      );
    } catch (error) {
      if (error instanceof APIError && error.code === 'HOME_EVENT_NOT_FOUND') {
        // Code review finding (2026-09-12): a second, tighter race than the
        // P2002 one below -- if a concurrent winning attempt's WHOLE
        // transaction (supersede existing.isCurrent -> false AND create the
        // replacement) commits strictly BETWEEN this call's own
        // `alreadyCorrected` pre-check and updateHomeEvent's OWN internal
        // `existing` lookup (findFirst({... isCurrent: true ...})), this
        // attempt's lookup sees the original event ALREADY superseded and
        // throws HOME_EVENT_NOT_FOUND -- never reaching the P2002 case below
        // at all, since it never gets far enough to attempt its own create.
        // Because the winner's supersede and its replacement-create happen
        // in the SAME transaction, "the original is already superseded" and
        // "the winning replacement already exists" become true atomically
        // together -- so re-reading by correctionIdempotencyKey here is
        // guaranteed to find the winner whenever this exact race occurs.
        // Re-check before rejecting, exactly like the P2002 recovery below,
        // rather than reporting a spurious "no longer available" for a
        // correction that actually already succeeded.
        const winner = await prisma.homeEvent.findFirst({
          where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
        });
        if (winner) {
          return captureEventConfirmResult(execution, userId, parameters, winner, true, command.artifactType);
        }
        throw Object.assign(new Error('The event to correct is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      }
      // Code review finding (2026-09-12): the pre-check above (`alreadyCorrected`)
      // is not itself atomic with the write below it -- two overlapping
      // attempts for this same execution.id (e.g. a lease-reclaim retry
      // racing the still-running original, per confirmAskExecution's own
      // "Timeout / stale lease" reclaim pattern, which does not verify the
      // original actually crashed) can both pass it and then both reach
      // updateHomeEvent's create, which shares this one correctionIdempotencyKey.
      // Whichever commits second hits @@unique([propertyId, idempotencyKey])
      // as a P2002 here. Recover exactly like capturePropertyFact/
      // capturePropertyFinancingFact's own outer-catch pattern: re-read the
      // winner's already-committed row and return it, rather than letting a
      // raw P2002 propagate up to confirmAskExecution's shared catch block,
      // which would otherwise mark this (losing) attempt's execution EXPIRED
      // -- even after the winner already completed successfully.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await prisma.homeEvent.findFirst({
          where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
        });
        if (winner) {
          return captureEventConfirmResult(execution, userId, parameters, winner, true, command.artifactType);
        }
      }
      throw error;
    }
    return captureEventConfirmResult(execution, userId, parameters, replacement, true, command.artifactType);
  }

  const type = parameters.type;
  const title = parameters.title;
  const occurredAt = parameters.occurredAt;
  if (typeof type !== 'string' || typeof title !== 'string' || !title.trim() || typeof occurredAt !== 'string') {
    throw Object.assign(new Error('The home event to record is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const created = await homeEventsServiceForCapture.createHomeEvent({
    propertyId: execution.propertyId,
    userId,
    body: {
      ...parameters,
      type,
      title,
      occurredAt,
      idempotencyKey: execution.id,
    },
  });
  return captureEventConfirmResult(execution, userId, parameters, created, false, command.artifactType);
}
registerConfirmCapabilityHandler('capture.event.confirm', confirmCaptureEvent);

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). Delegates the write to captureWarranty.ts, an idempotent create
// keyed on this execution's own id (Warranty.sourceExecutionId), mirroring
// confirmCaptureFact/confirmCaptureEvent's own delegation shape exactly.
async function confirmCaptureWarranty(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const providerName = parameters.providerName;
  const category = parameters.category;
  const startDate = parameters.startDate;
  const expiryDate = parameters.expiryDate;
  if (
    typeof providerName !== 'string' || !providerName.trim()
    || typeof category !== 'string'
    || typeof startDate !== 'string'
    || typeof expiryDate !== 'string'
  ) {
    throw Object.assign(new Error('The warranty to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  let warranty: Awaited<ReturnType<typeof captureWarranty>>;
  try {
    warranty = await captureWarranty(execution.propertyId, userId, {
      providerName,
      category: category as WarrantyCategory,
      policyNumber: typeof parameters.policyNumber === 'string' ? parameters.policyNumber : null,
      coverageDetails: typeof parameters.coverageDetails === 'string' ? parameters.coverageDetails : null,
      cost: typeof parameters.cost === 'number' ? parameters.cost : null,
      startDate,
      expiryDate,
      sourceExecutionId: execution.id,
    });
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  const propertyRecordHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/edit`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'WARRANTY_CAPTURED',
    blocks: [{
      type: 'SUMMARY', id: `warranty-captured-${warranty.id}`, title: 'Recorded to your property record', tone: 'POSITIVE',
      body: `Your ${providerName} warranty is now saved to your Living Home Record.`,
      actions: [{ id: 'open-property-record', label: 'Open property record', href: propertyRecordHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_WARRANTY_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `capture-warranty-refresh-failed-${warranty.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This warranty was saved to your Living Home Record. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      suggestions: [],
    });
  }
  return { result, artifactType: command.artifactType, artifactId: warranty.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('capture.warranty.confirm', confirmCaptureWarranty);

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution). Delegates the actual write to
// HomeEventsService.attachDocument -- the same real, already-authorized,
// already-idempotent (upsert on the [eventId, evidenceKey] unique
// constraint) mechanism the traditional UI's own document-attach flow uses,
// not a new writer. Unlike confirmCaptureWarranty, this cannot simply
// create its own record standalone: HomeEventEvidence.eventId is a
// required, non-nullable column, so this candidate's real domain write can
// only happen once its paired EVENT sibling's HomeEvent already exists.
// That sibling's linkedExecutionId was set by persistCandidates
// (conversationalCapture.ts) at creation time; this handler reads it
// SYNCHRONOUSLY here rather than through captureLinkReconciliation.ts's
// async ASK_CAPTURE_LINK_RECONCILE path (which exists for exactly the
// opposite case -- HomeEvent.warrantyId, a nullable column that CAN be
// filled in later regardless of confirmation order). A deliberate,
// disclosed scope limitation: confirming EVIDENCE before its sibling EVENT
// is confirmed fails with a clear, recoverable message rather than
// deferring the write -- see persistCandidates's own comment on this.
async function confirmCaptureEvidence(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const documentId = parameters.documentId;
  if (typeof documentId !== 'string' || !documentId.trim()) {
    throw Object.assign(new Error('The document to attach is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  // Phase 3 evidence-upload add slice: a homeowner-initiated attach (evidenceAttachResult, above) already knows and
  // re-verified its target event at propose time, so it has no extraction sibling to wait on -- eventId comes
  // straight from this execution's own stored parameters, not a linked execution's receipt.
  let eventId: string;
  if (parameters.captureOrigin === USER_ADD_ORIGIN) {
    if (typeof parameters.eventId !== 'string' || !parameters.eventId.trim()) {
      throw Object.assign(new Error('The timeline event to attach evidence to is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    }
    eventId = parameters.eventId;
  } else {
    if (!execution.linkedExecutionId) {
      throw Object.assign(new Error('Cozy could not find the home timeline event this evidence belongs to. Attach the document from the property record instead.'), { code: 'EVIDENCE_SIBLING_EVENT_MISSING' });
    }
    const sibling = await prisma.askConfirmationReceipt.findUnique({
      where: { executionId: execution.linkedExecutionId },
      select: { status: true, artifactType: true, artifactId: true },
    });
    if (sibling?.status !== 'COMPLETED' || sibling.artifactType !== 'HOME_EVENT' || !sibling.artifactId) {
      throw Object.assign(new Error('Confirm the related home timeline event first, then attach this document.'), { code: 'EVIDENCE_SIBLING_EVENT_NOT_CONFIRMED' });
    }
    eventId = sibling.artifactId;
  }
  let link: Awaited<ReturnType<typeof homeEventsServiceForCapture.attachDocument>>;
  try {
    link = await homeEventsServiceForCapture.attachDocument({
      propertyId: execution.propertyId,
      eventId,
      documentId,
      userId,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw Object.assign(new Error(error.message), { code: error.code ?? 'ASK_CONFIRMATION_NOT_ACTIVE' });
    }
    throw error;
  }
  const homeTimelineHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/timeline`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'EVIDENCE_ATTACHED',
    blocks: [{
      type: 'SUMMARY', id: `evidence-attached-${link.id}`, title: 'Attached to your home timeline', tone: 'POSITIVE',
      body: `${link.document?.name ?? 'The document'} is now attached as evidence on your home timeline.`,
      actions: [],
    }, {
      type: 'RELATED_RECORDS', id: `evidence-related-records-${link.id}`, title: 'Related records',
      relationships: [{
        relationshipType: 'DOCUMENT_EVIDENCE_FOR_HOME_EVENT',
        source: { recordType: 'DOCUMENT', recordId: link.documentId, label: link.document?.name ?? 'Attached document' },
        target: { recordType: 'HOME_EVENT', recordId: link.eventId, label: link.event.title },
        navigation: { label: 'Open home timeline', href: homeTimelineHref },
      }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_EVIDENCE_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `capture-evidence-refresh-failed-${link.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This evidence was attached to your home timeline. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      suggestions: [],
    });
  }
  return { result, artifactType: command.artifactType, artifactId: link.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('capture.evidence.confirm', confirmCaptureEvidence);

export async function confirmAskExecution(userId: string, executionId: string, input: SubmitAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const registeredOperationId = execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS
    ? execution.operationId as AskOperationId
    : null;
  const controls = readAskOperationalControls();
  const skill = registeredOperationId ? getSkillForOperation(registeredOperationId) : undefined;
  const skillUnavailableReason = registeredOperationId ? skillRuntimeUnavailableReason(registeredOperationId, controls) : null;
  if (skillUnavailableReason && execution.status !== 'COMPLETED') {
    const unavailable = operationalUnavailableResult(skillUnavailableReason);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: unavailable.status,
        reasonCode: unavailable.reasonCode,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: unavailable.blocks,
          captureRequests: [],
          confirmation: null,
          clarification: null,
          suggestions: unavailable.suggestions,
          ...preservedExecutionHistory(execution.resultJson, unavailable.blocks),
        }),
        completedAt: new Date(),
      },
    });
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: skillUnavailableReason, metadataJson: asInputJson({ skillId: skill?.id ?? null }) },
    });
    return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  }
  const validatedBinding = execution.skillBindingJson
    ? validateSkillExecutionBinding(execution.skillBindingJson)
    : null;
  const pinnedBinding = validatedBinding?.valid ? validatedBinding.binding : null;
  const inputHash = createHash('sha256').update(JSON.stringify({
    confirmationVersion: input.confirmationVersion,
    consentConfirmed: input.consentConfirmed,
    skillBinding: execution.skillBindingJson,
    operationId: execution.operationId,
    operationVersion: execution.operationVersion,
    propertyId: execution.propertyId,
    contextVersion: execution.contextVersion,
    actionParameters: execution.parametersJson,
  })).digest('hex');
  const previous = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
  if (previous) {
    if (previous.inputHash !== inputHash) {
      const error = new Error('Another confirmation already claimed this execution.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    if (previous.status === 'COMPLETED') {
      // B04 design: a retried confirm after a lost response used to return
      // bare, with no childExecutions -- meaning a client that never saw the
      // original success response also never received the reconciled
      // sibling refreshes, even though the mutation itself (protected by
      // this same idempotency receipt) genuinely already succeeded. This
      // must never replay the mutation -- it only reruns the safe,
      // read-only reconciliation step and redelivers its result inline.
      const replayParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
        ? execution.parametersJson as Record<string, unknown>
        : {};
      const { refreshedExecutions } = await reconcileAskExecutionSideEffects(userId, execution, replayParameters);
      return mapPersistedExecution(execution, await propertySummary(execution.propertyId), refreshedExecutions);
    }
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  const recoveringClaim = previous?.status === 'CLAIMED' && execution.status === 'RUNNING';
  if (!command || (execution.status !== 'NEEDS_CONFIRMATION' && !recoveringClaim)) {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  if (skill && registeredOperationId && !recoveringClaim) {
    const audienceContext = await composeSkillContext({
      skill,
      operationId: registeredOperationId,
      userId,
      propertyId: execution.propertyId,
    }, { providerEnabled: controls.contextProviderEnabled });
    const policy = getAskAudiencePolicy(registeredOperationId, getAskOperationDefinition(registeredOperationId).version);
    const decision = policy ? evaluateAskAudienceApplicability({
      policy,
      accountRole: 'HOMEOWNER',
      householdRole: access.role,
      operatingMode: controls.audiencePolicyEnabled
        ? journeyContextFrom(audienceContext)?.operatingMode ?? 'UNKNOWN'
        : 'UNKNOWN',
      purpose: 'EXECUTION',
    }) : null;
    if (!decision?.allowed) {
      const inapplicable = decision
        ? audienceApplicabilityResult(
          decision,
          controls.audiencePolicyEnabled ? execution.propertyId : null,
          access.role,
        )
        : operationalUnavailableResult('ASK_SKILL_POLICY_MISMATCH');
      const saved = await prisma.askExecution.update({
        where: { id: execution.id },
        data: {
          status: inapplicable.status,
          reasonCode: inapplicable.reasonCode,
          parametersJson: inapplicable.parameters ? asInputJson(inapplicable.parameters) : execution.parametersJson ?? undefined,
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: inapplicable.blocks,
            captureRequests: [], confirmation: null, clarification: null,
            suggestions: inapplicable.suggestions,
            ...preservedExecutionHistory(execution.resultJson, inapplicable.blocks),
          }),
          completedAt: terminalStatus(inapplicable.status) ? new Date() : null,
        },
      });
      await prisma.askExecutionEvent.create({
        data: {
          executionId,
          eventType: inapplicable.reasonCode ?? 'ASK_AUDIENCE_INAPPLICABLE',
          metadataJson: asInputJson({
            stage: 'CONFIRMATION_RECHECK',
            audiencePolicyVersion: decision?.policyVersion ?? null,
            audienceApplicabilityOutcome: decision?.outcome ?? null,
            operatingMode: decision?.operatingMode ?? null,
          }),
        },
      });
      return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
    }
  }
  const roleRank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  if (roleRank[access.role] < roleRank[command.roleFloor]) {
    const error = new Error(`${command.roleFloor.toLowerCase()} access is required for this command.`);
    (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const expectedVersion = parameters.confirmationVersion;
  const expiresAt = typeof parameters.confirmationExpiresAt === 'string' ? new Date(parameters.confirmationExpiresAt) : null;
  // Once a command has been durably claimed, confirmation expiry must not
  // incorrectly assert that no action occurred. Recovery replays only the
  // already-confirmed input through domain idempotency controls.
  if ((!expiresAt || expiresAt <= new Date()) && !recoveringClaim) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED', reasonCode: 'ASK_CONFIRMATION_EXPIRED', completedAt: new Date(),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-expired', title: 'Confirmation expired', status: 'EXPIRED', description: 'No action was performed. Ask again to review current home records and settings.', details: [], actions: [] }], captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'], ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-expired', title: 'Confirmation expired', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]) }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CONFIRMATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  if (expectedVersion !== input.confirmationVersion) {
    const error = new Error('This confirmation version is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  if (previous) {
    const recovered = await prisma.askConfirmationReceipt.updateMany({
      where: { executionId, status: 'CLAIMED', leaseExpiresAt: { lte: new Date() } },
      data: {
        idempotencyKey: input.idempotencyKey,
        inputHash,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (recovered.count !== 1) {
      const error = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw error;
    }
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONFIRMATION_RECOVERY_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
    });
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        // External review finding: expectedVersion above was compared
        // against `execution`, a snapshot read at the very top of this
        // function -- a concurrent edit (editAskConfirmation) could commit
        // a version bump between that read and this claim without ever
        // being detected, since the claim itself only checked `status`.
        // The claim would then succeed and the domain write would run
        // against the STALE, already-edited-away `parameters` captured
        // earlier -- confirming input the homeowner never actually
        // reviewed (CONF-003). Re-checking the version here, atomically
        // with the claim, closes that window: a concurrent edit now makes
        // this claim fail exactly like an already-inactive confirmation.
        const claimed = await tx.askExecution.updateMany({
          where: { id: execution.id, userId, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
          data: { status: 'RUNNING', reasonCode: 'ASK_CONFIRMATION_CLAIMED', completedAt: null },
        });
        if (claimed.count !== 1) {
          const error = new Error('This confirmation is no longer active.');
          (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
          throw error;
        }
        await tx.askConfirmationReceipt.create({
          data: {
            executionId,
            idempotencyKey: input.idempotencyKey,
            confirmationVersion: input.confirmationVersion,
            skillId: pinnedBinding?.skill.id ?? null,
            skillVersion: pinnedBinding?.skill.version ?? null,
            operationId: execution.operationId,
            operationVersion: execution.operationVersion,
            effectivePolicyVersion: pinnedBinding?.effectivePolicyVersion ?? null,
            contextVersion: execution.contextVersion,
            propertyId: execution.propertyId,
            inputHash,
            status: 'CLAIMED',
            leaseExpiresAt: new Date(Date.now() + 60_000),
          },
        });
        await tx.askExecutionEvent.create({
          data: { executionId, eventType: 'CONFIRMATION_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
      if (!winner || winner.inputHash !== inputHash) {
        const conflict = new Error('Another confirmation already claimed this execution.');
        (conflict as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      if (winner.status === 'COMPLETED') {
        const completed = await prisma.askExecution.findFirstOrThrow({ where: { id: executionId, userId } });
        return mapPersistedExecution(completed, await propertySummary(execution.propertyId));
      }
      const inProgress = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (inProgress as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw inProgress;
    }
  }
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD MAINT-005/A12: populated only when a
  // confirm handler explicitly refreshed another still-visible execution
  // this mutation affected (see ConfirmCapabilityResult.refreshedExecutions).
  let refreshedExecutions: AskExecutionResponse[] = [];
  try {
  {
    const confirmed = await confirmCapabilityInvoke(execution.operationId as AskOperationId, {
      execution: execution as typeof execution & { propertyId: string },
      userId, parameters, access, command,
    });
    result = confirmed.result; artifactType = confirmed.artifactType; artifactId = confirmed.artifactId;
    refreshedExecutions = confirmed.refreshedExecutions ?? [];
  }
  } catch (error) {
    // The claim above (RUNNING + CLAIMED receipt) already committed before
    // this per-operation validation ran. Without this, any freshness/
    // validation failure here (e.g. ASK_CONTEXT_VERSION_CONFLICT) left the
    // execution stuck at RUNNING forever: expirePendingInteraction() is a
    // no-op for RUNNING, cancelAskExecution() never acts on a command that
    // may already be running, and a retry after the lease expires just re-reads
    // the same stale parametersJson and fails identically, indefinitely.
    // Release the claim and land on the same "ask again" terminal state
    // already used for confirmation expiry, so the homeowner has an actual
    // way forward instead of a permanently wedged execution.
    const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    const description = error instanceof Error && error.message
      ? error.message
      : 'This could not be completed because the underlying record changed. No action was performed.';
    // Code review finding (2026-09-12): this used to be an unconditional
    // tx.askExecution.update(...) -- if a CONCURRENT confirm attempt for
    // this same execution.id (a lease-reclaim retry, per the "Timeout /
    // stale lease" pattern above, which does not verify the original
    // actually crashed before reclaiming) already committed successfully
    // between this attempt's own claim and this catch block running, that
    // unconditional update would clobber the winner's terminal COMPLETED
    // state back to EXPIRED. Guarded to only touch the execution while it is
    // still RUNNING -- exactly what the claim transaction above set it to,
    // and the only state a losing/conflicting attempt should ever be
    // allowed to overwrite. If the guard doesn't match, a concurrent winner
    // already moved this execution past RUNNING; re-read and return its
    // actual current state instead of fabricating an EXPIRED one.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.askExecution.updateMany({
        where: { id: execution.id, status: 'RUNNING' },
        data: {
          status: 'EXPIRED', reasonCode: errorCode ?? 'ASK_CONFIRMATION_CONFLICT', completedAt: new Date(),
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-conflict', title: 'This changed before it could be confirmed', status: 'EXPIRED', description, details: [], actions: [] }],
            captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
            // External review's specific example: the conflict handling
            // correctly blocks the stale write, but was replacing resultJson
            // wholesale, discarding the original response and continuation
            // identity the homeowner had already been looking at.
            ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-conflict', title: 'This changed before it could be confirmed', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]),
          }),
        },
      });
      if (updated.count !== 1) return;
      await tx.askConfirmationReceipt.updateMany({
        where: { executionId, status: 'CLAIMED' },
        data: { status: 'FAILED', lastErrorCode: errorCode ?? 'ASK_CONFIRMATION_CONFLICT' },
      });
      await tx.askExecutionEvent.create({
        data: { executionId, eventType: 'CONFIRMATION_CONFLICT_RELEASED', metadataJson: asInputJson({ errorCode: errorCode ?? null }) },
      });
    });
    const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
    return mapPersistedExecution(current, await propertySummary(execution.propertyId));
  }
  let saved: typeof execution;
  const confirmedOperationId = execution.operationId as AskOperationId;
  const confirmedValidation = validateAskConfirmedCompletion({
    question: execution.message,
    operationId: confirmedOperationId,
    propertyId: execution.propertyId,
    householdRole: access.role,
    result,
  });
  result = confirmedValidation.result;
  recordAskAnswerTrustMetrics(confirmedOperationId, confirmedValidation);
  assertSkillResultBlocksAllowed(confirmedOperationId, result);
  try {
    saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.askExecution.update({
        where: { id: execution.id },
        data: { status: result.status, reasonCode: result.reasonCode, contextVersion: result.contextVersion, parametersJson: result.parameters ? asInputJson(result.parameters) : undefined, resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }), completedAt: new Date() },
      });
      await tx.askConfirmationReceipt.update({
        where: { executionId },
        data: { status: 'COMPLETED', artifactType, artifactId, completedAt: new Date(), lastErrorCode: null },
      });
      // Code review finding (2026-09-12): captureLinkReconciliation.ts's
      // ASK_CAPTURE_LINK_RECONCILE worker consumer existed with no
      // production emitter anywhere -- a linked pair's completion could
      // never actually trigger reconciliation through confirmation, only
      // through a test calling reconcileCaptureLink(executionId) directly.
      // Emit it here, generically, for ANY confirmation-required operation
      // that completes with a linkedExecutionId set (not capture-specific),
      // so the mechanism is actually reachable once a producer sets that
      // field. Idempotency-keyed per execution so a retried completion
      // (the P2002 recovery path below) never queues a duplicate; the
      // consumer itself is also idempotent (guarded by warrantyId: null).
      if (execution.linkedExecutionId) {
        const reconcileIdempotencyKey = `ask-capture-link-reconcile:${execution.id}`;
        await tx.domainEvent.upsert({
          where: { idempotencyKey: reconcileIdempotencyKey },
          create: {
            type: 'ASK_CAPTURE_LINK_RECONCILE',
            status: 'PENDING',
            propertyId: execution.propertyId,
            userId,
            idempotencyKey: reconcileIdempotencyKey,
            payload: { executionId: execution.id },
          },
          update: {},
        });
      }
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'CONFIRMED', metadataJson: asInputJson({ artifactType, artifactId }) } });
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...confirmedValidation.trust, semantic: null, repaired: confirmedValidation.repaired, stage: 'CONFIRMATION_COMPLETION' }) } });
      return updated;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const duplicate = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
    if (!duplicate || duplicate.idempotencyKey !== input.idempotencyKey || duplicate.inputHash !== inputHash) throw error;
    const completed = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
    if (!completed) throw error;
    saved = completed;
  }
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId), refreshedExecutions);
}


export async function editAskConfirmation(userId: string, executionId: string, input: EditAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  if (!command || execution.status !== 'NEEDS_CONFIRMATION') {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const roleRank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  if (roleRank[access.role] < roleRank[command.roleFloor]) {
    const error = new Error(`${command.roleFloor.toLowerCase()} access is required for this command.`);
    (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  if (parameters.confirmationVersion !== input.confirmationVersion) {
    const error = new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  // B04 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
  // dispatch is a lookup table (EDIT_CONFIRMATION_HANDLERS, defined below),
  // not an if/else operationId chain -- matches the platform-wide
  // registerCapabilityHandler/registerConfirmCapabilityHandler dispatch
  // convention, and keeps confirmCapabilityHandlerRegistry.test.js's "no
  // operationId branching for write dispatch" governance test (Test G)
  // honest for the edit path too, not just confirmAskExecution's own
  // dispatch (its byte-range scan happens to include this whole function).
  const editHandler = EDIT_CONFIRMATION_HANDLERS[execution.operationId as AskOperationId];
  if (!editHandler) {
    const error = new Error('Editing is not available for this action yet.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  return editHandler(execution, parameters, input, userId);
}

async function editMaintenanceTaskUpdateConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existingUpdate = MaintenanceTaskUpdateInputSchema.safeParse(parameters.maintenanceUpdate);
  if (!existingUpdate.success || existingUpdate.data.action !== 'RESCHEDULE') {
    const error = new Error('Editing is only available for a reschedule proposal.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const nextDueDateEdit = input.edits.nextDueDate;
  if (!isValidDateEditInput(nextDueDateEdit)) {
    const error = new Error('Enter a valid date.');
    (error as Error & { code?: string }).code = 'ASK_INVALID_CONFIRMATION_EDIT';
    throw error;
  }
  const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: existingUpdate.data.taskId, propertyId: execution.propertyId! } });
  if (!task) {
    const error = new Error('The selected maintenance task is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const updatedInput = MaintenanceTaskUpdateInputSchema.parse({ ...existingUpdate.data, nextDueDate: nextDueDateEdit });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const taskHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId!)}&taskId=${encodeURIComponent(task.id)}`;
  const newConfirmation = {
    confirmationId: `maintenance-update-${task.id}-${nextVersion}`, version: nextVersion, title: `Reschedule ${task.title}?`,
    description: 'This command writes through the canonical Maintenance service and preserves downstream reconciliation.',
    fields: [
      { label: 'Task', value: task.title }, { label: 'Action', value: 'reschedule' },
      { label: 'Current due date', value: humanDate(task.nextDueDate) ?? 'Not scheduled' },
      ...(task.isRecurring && task.frequency ? [{ label: 'Recurrence', value: `Repeats ${task.frequency.toLowerCase().replace(/_/g, ' ')}; only this next due date changes` }] : []),
    ],
    editableFields: [{ key: 'nextDueDate', label: 'New due date', type: 'DATE' as const, value: nextDueDateEdit }],
    confirmLabel: 'Confirm reschedule', consentText: 'I authorize this reschedule of the shared Maintenance record.', expiresAt: expiresAt.toISOString(),
  };
  // External review finding: this was an unconditional update-by-id. Two
  // concurrent edits (a double-click, two tabs) could both read version N,
  // both compute nextVersion N+1, and both write -- the loser's response
  // would then claim "saved as version N+1" while the winner's edit is what
  // actually persisted. Guard the write itself on the version still
  // matching (same JSON-path pattern already used elsewhere in this
  // codebase, e.g. adminWorkerJobs.service.ts's metadataJson filter), so a
  // losing concurrent edit fails loudly instead of silently.
  //
  // External review finding (2nd pass): guarding on version alone was
  // still not enough. confirmAskExecution's claim transaction moves status
  // to RUNNING without touching parametersJson.confirmationVersion at all
  // -- so once a confirm has claimed this execution, this edit's version
  // guard would still match (the version genuinely hasn't changed) and
  // silently overwrite parametersJson/resultJson out from under a
  // confirmation that is actively executing or has already completed.
  // Guarding on status too closes that: any status transition away from
  // NEEDS_CONFIRMATION (claimed, completed, expired) now makes this write
  // match nothing, exactly like an already-superseded version does.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, maintenanceUpdate: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'SUMMARY', id: 'maintenance-update-review', title: 'Review this reschedule', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: taskHref, style: 'SECONDARY' }] }],
        captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'maintenance-update-review', title: 'Review this reschedule', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }]),
      }),
    },
  });
  if (editWrite.count !== 1) {
    const error = new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

// B04 fix: BUYER_TASK_UPDATE's own reschedule-edit path, mirroring
// MAINTENANCE_TASK_UPDATE's edit handling above exactly (same shared-caller
// checks, same version-and-status-guarded optimistic write, same
// CONFIRMATION_EDITED event) but against Buyer's own flat parameter shape
// (parameters.buyerTaskAction/buyerTaskId/buyerTaskDueAt, not a single
// nested maintenanceUpdate object) and its own canonical model
// (prisma.homeBuyerTask, not propertyMaintenanceTask). Only RESCHEDULE is
// editable, same restriction Maintenance's own edit path has.
async function editBuyerTaskUpdateConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  if (parameters.buyerTaskAction !== 'RESCHEDULE') {
    const error = new Error('Editing is only available for a reschedule proposal.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const taskId = parameters.buyerTaskId;
  if (typeof taskId !== 'string') {
    const error = new Error('The Buyer Plan task selection is invalid.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const dueAtEdit = input.edits.dueAt;
  if (!isValidDateEditInput(dueAtEdit)) {
    const error = new Error('Enter a valid date.');
    (error as Error & { code?: string }).code = 'ASK_INVALID_CONFIRMATION_EDIT';
    throw error;
  }
  const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId! } } });
  if (!task) {
    const error = new Error('The selected Buyer Plan task is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const taskHref = `${buyerPlanHref(execution.propertyId!)}?${new URLSearchParams({ taskId: task.id }).toString()}`;
  const newConfirmation = {
    confirmationId: `buyer-task-update-${task.id}-${nextVersion}`, version: nextVersion, title: `Reschedule ${task.title}?`,
    description: 'This command writes through the canonical Buyer Plan and preserves closing readiness.',
    fields: [
      { label: 'Task', value: task.title }, { label: 'Action', value: 'reschedule' },
      { label: 'Current due date', value: task.dueAt ? (humanDate(task.dueAt) ?? 'Not scheduled') : 'Not scheduled' },
    ],
    editableFields: [{ key: 'dueAt', label: 'New due date', type: 'DATE' as const, value: dueAtEdit }],
    confirmLabel: 'Confirm reschedule', consentText: 'I authorize this reschedule of the shared Buyer Plan.', expiresAt: expiresAt.toISOString(),
  };
  // Same optimistic status-and-version-guarded write as Maintenance's own
  // edit path above -- see its comment for why both are required, not just
  // the version.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, buyerTaskDueAt: dueAtEdit, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'SUMMARY', id: 'buyer-task-update-review', title: 'Review this reschedule', body: 'No shared Buyer Plan record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: taskHref, style: 'SECONDARY' }] }],
        captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'buyer-task-update-review', title: 'Review this reschedule', body: 'No shared Buyer Plan record has changed yet.', tone: 'DEFAULT', actions: [] }]),
      }),
    },
  });
  if (editWrite.count !== 1) {
    const error = new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function editInventoryItemCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = InventoryItemCorrectionInputSchema.safeParse(parameters.inventoryCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const invalidEdit = await inventoryFieldValueError(execution.propertyId!, existing.data.field, input.edits.value);
  if (invalidEdit) throw Object.assign(new Error(invalidEdit), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const valueEdit = inventoryFieldNormalized(existing.data.field, input.edits.value);
  const item = await prisma.inventoryItem.findFirst({ where: { id: existing.data.itemId, propertyId: execution.propertyId! } });
  if (!item) throw Object.assign(new Error('The selected inventory item is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const combinedBlocker = inventoryCorrectionCombinedBlocker(item, existing.data.field, valueEdit);
  if (combinedBlocker) throw Object.assign(new Error(combinedBlocker), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const updatedInput = InventoryItemCorrectionInputSchema.parse({ ...existing.data, value: valueEdit });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const dynamicOptions = existing.data.field === INVENTORY_ROOM_LINK_FIELD ? await inventoryRoomLinkOptions(execution.propertyId!) : undefined;
  const newConfirmation = inventoryCorrectionConfirmation(item, existing.data.field, inventoryFieldCurrent(item, existing.data.field), valueEdit, nextVersion, expiresAt, dynamicOptions);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'inventory-correct-review', title: `Review this ${INVENTORY_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No shared-home record has changed yet. Enter the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  // Same version-AND-status guarded optimistic write as the maintenance edit
  // path: a claimed/completed/expired execution matches nothing.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, inventoryCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function editHomeEventCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = HomeEventCorrectionInputSchema.safeParse(parameters.homeEventCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const invalidEdit = await homeEventCorrectionValueError(execution.propertyId!, existing.data.field, input.edits.value);
  if (invalidEdit) throw Object.assign(new Error(invalidEdit), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const event = await prisma.homeEvent.findFirst({ where: { id: existing.data.eventId, propertyId: execution.propertyId!, isCurrent: true, deletedAt: null }, select: { id: true, title: true, occurredAt: true, summary: true, amount: true, type: true, importance: true, roomId: true, inventoryItemId: true } });
  if (!event) throw Object.assign(new Error('The selected timeline event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const cleaned = correctionNormalized(HOME_EVENT_CORRECTION_FIELDS[existing.data.field], input.edits.value);
  const updatedInput = HomeEventCorrectionInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const current = homeEventFieldCurrent(event, existing.data.field);
  const dynamicOptions = HOME_EVENT_LINK_FIELDS.has(existing.data.field) ? await homeEventLinkOptions(execution.propertyId!, existing.data.field as 'roomId' | 'inventoryItemId') : undefined;
  const newConfirmation = homeEventCorrectionConfirmation(event, existing.data.field, current, cleaned, nextVersion, expiresAt, dynamicOptions);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'home-event-correct-review', title: `Review this ${HOME_EVENT_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No shared-home record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, homeEventCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function editHomeEventVisibilityConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = HomeEventVisibilityInputSchema.safeParse(parameters.homeEventVisibility);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const event = await prisma.homeEvent.findFirst({ where: { id: existing.data.eventId, propertyId: execution.propertyId!, isCurrent: true, deletedAt: null }, select: { id: true, title: true, visibility: true, createdById: true } });
  if (!event) throw Object.assign(new Error('The selected timeline event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const proposed = HomeEventVisibilityInputSchema.shape.value.safeParse(input.edits.value);
  if (!proposed.success || proposed.data === null) throw Object.assign(new Error('Choose Private, Household, or Resale pack.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const blocker = homeEventVisibilityBlocker(userId, event.createdById, event.visibility, proposed.data);
  if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_PERMISSION_REQUIRED' });
  const updatedInput = HomeEventVisibilityInputSchema.parse({ ...existing.data, value: proposed.data });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = homeEventVisibilityConfirmation(event, event.visibility, proposed.data, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'home-event-visibility-review', title: `Review who can see ${event.title}`, body: 'No shared-home record has changed yet. Choose the visibility, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, homeEventVisibility: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function editWarrantyCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = WarrantyCorrectionInputSchema.safeParse(parameters.warrantyCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const warranty = await prisma.warranty.findFirst({
    where: { id: existing.data.warrantyId, propertyId: execution.propertyId! },
    select: { id: true, providerName: true, startDate: true, expiryDate: true, category: true, policyNumber: true, cost: true, coverageDetails: true, homeownerProfile: { select: { userId: true } } },
  });
  if (!warranty) throw Object.assign(new Error('The selected warranty is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  if (warranty.homeownerProfile.userId !== userId) throw Object.assign(new Error('Only the household member who added this warranty can change it.'), { code: 'ASK_PERMISSION_REQUIRED' });
  const invalid = warrantyCorrectionValueError(existing.data.field, input.edits.value, warranty);
  if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const cleaned = correctionNormalized(WARRANTY_CORRECTION_FIELDS[existing.data.field], input.edits.value);
  const updatedInput = WarrantyCorrectionInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const current = warrantyFieldCurrent(warranty, existing.data.field);
  const newConfirmation = warrantyCorrectionConfirmation(warranty, existing.data.field, current, cleaned, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'warranty-correct-review', title: `Review this ${WARRANTY_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No warranty record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, warrantyCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function editRoomRenameConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = RoomRenameInputSchema.safeParse(parameters.roomRename);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const { field } = existing.data;
  const meta = ROOM_CORRECTION_FIELDS[field];
  const room = await prisma.inventoryRoom.findFirst({ where: { id: existing.data.roomId, propertyId: execution.propertyId! }, select: { id: true, name: true, type: true, floorLevel: true } });
  if (!room) throw Object.assign(new Error('The selected room is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const invalid = await roomCorrectionValueError(execution.propertyId!, room.id, field, input.edits.value);
  if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const cleaned = roomCorrectionNormalized(field, input.edits.value);
  const updatedInput = RoomRenameInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = roomRenameConfirmation(room, field, roomFieldCurrent(room, field), cleaned, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'room-rename-review', title: field === 'name' ? `Review renaming ${room.name}` : `Review the ${meta.label} of ${room.name}`, body: `No shared-home record has changed yet. ${field === 'name' ? 'Enter the new name' : 'Choose the corrected value'}, then confirm.`, tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, roomRename: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

const EDIT_CONFIRMATION_HANDLERS: Partial<Record<AskOperationId, (
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
) => Promise<AskExecutionResponse>>> = {
  MAINTENANCE_TASK_UPDATE: editMaintenanceTaskUpdateConfirmation,
  INVENTORY_ITEM_CORRECT: editInventoryItemCorrectConfirmation,
  HOME_EVENT_CORRECT: editHomeEventCorrectConfirmation,
  HOME_EVENT_VISIBILITY: editHomeEventVisibilityConfirmation,
  HOME_EVENT_RADAR_FEEDBACK: editHomeEventRadarFeedbackConfirmation,
  INSPECTION_FINDING_UPDATE: editInspectionFindingResolveConfirmation,
  WARRANTY_CORRECT: editWarrantyCorrectConfirmation,
  ROOM_RENAME: editRoomRenameConfirmation,
  BUYER_TASK_UPDATE: editBuyerTaskUpdateConfirmation,
};

export async function cancelAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  if (execution.status !== 'NEEDS_CONFIRMATION') {
    if (!INTERACTIVE_ASK_STATUSES.includes(execution.status)) return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
    const cancelled = await prisma.askExecution.updateMany({
      where: { id: execution.id, userId, status: execution.status },
      data: {
        status: 'CANCELLED', reasonCode: 'USER_DISMISSED_PENDING_REQUEST',
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{
            type: 'SUMMARY', id: 'pending-request-dismissed', title: 'Pending request dismissed',
            body: 'No action was performed. You can ask the question again whenever you are ready.', tone: 'DEFAULT', actions: [],
          }],
          captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask a new question'],
          ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'pending-request-dismissed', title: 'Pending request dismissed', body: 'No action was performed.', tone: 'DEFAULT', actions: [] }]),
        }),
        completedAt: new Date(),
      },
    });
    if (cancelled.count !== 1) {
      const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
      return mapPersistedExecution(current, await propertySummary(current.propertyId));
    }
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED', metadataJson: asInputJson({ reason: 'USER_DISMISSED_PENDING_REQUEST', previousStatus: execution.status }) } });
    const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
    return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  }
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  if (!command || !command.supportsCancelBeforeExecution) {
    const error = new Error('This execution does not have an active cancellable command.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'confirmation-cancelled',
    title: command.cancellation.title,
    body: command.cancellation.body,
    tone: 'DEFAULT', actions: [],
  }];
  const cancelled = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: 'NEEDS_CONFIRMATION' },
    data: {
      status: 'CANCELLED', reasonCode: 'USER_CANCELLED',
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks,
        captureRequests: [],
        confirmation: null,
        clarification: null,
        suggestions: [command.cancellation.suggestion],
        ...preservedExecutionHistory(execution.resultJson, blocks),
      }),
      completedAt: new Date(),
    },
  });
  if (cancelled.count !== 1) {
    const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
    return mapPersistedExecution(current, await propertySummary(current.propertyId));
  }
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED' } });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function getAskSession(userId: string, sessionId: string): Promise<AskExecutionResponse[]> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return [];
  const executions = await prisma.askExecution.findMany({ where: { sessionId, userId }, orderBy: { createdAt: 'asc' } });
  const propertyIds = [...new Set(executions.map((execution) => execution.propertyId).filter((value): value is string => Boolean(value)))];
  // Row ownership (userId) proves this is the homeowner's own conversation,
  // not that they still hold current access to every property it touches.
  // A revoked household member must lose visibility into that property's
  // stored answers immediately (FRD ASK-25.2), so each referenced property
  // is rechecked here rather than trusting the historical snapshot; any
  // execution for a property the user can no longer reach is dropped
  // rather than failing the whole session read.
  const accessEntries = await Promise.all(propertyIds.map(async (propertyId) => [propertyId, Boolean(await resolvePropertyAccess(userId, propertyId))] as const));
  const accessiblePropertyIds = new Set(accessEntries.filter(([, accessible]) => accessible).map(([propertyId]) => propertyId));
  const visibleExecutions = executions.filter((execution) => !execution.propertyId || accessiblePropertyIds.has(execution.propertyId));
  const properties = await prisma.property.findMany({ where: { id: { in: [...accessiblePropertyIds] } }, select: { id: true, name: true, address: true, city: true, state: true } });
  const labels = new Map(properties.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]));
  return visibleExecutions.map((execution) => mapPersistedExecution(execution, execution.propertyId ? labels.get(execution.propertyId) ?? null : null));
}

export async function getRecentAskSessions(userId: string, propertyId: string | null, cursorValue?: string, searchQuery?: string, view: 'RECENT' | 'ARCHIVED' = 'RECENT'): Promise<AskRecentSessionPage> {
  if (propertyId) await ensurePropertyAccess(userId, propertyId);
  const accessibleProperties = propertyId ? null : await prisma.property.findMany({
    where: askHistoryAccessiblePropertyWhere(userId),
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  const cursor = cursorValue ? decodeAskSessionHistoryCursor(cursorValue) : null;
  if (cursorValue && !cursor) throw Object.assign(new Error('Invalid conversation history cursor.'), { code: 'ASK_INVALID_CURSOR' });
  const now = new Date();
  const bounds = { userId, now, retentionDays: readAskOperationalControls().rawConversationRetentionDays, searchQuery };
  const scope = propertyId ? { propertyId } : { accessiblePropertyIds: accessibleProperties!.map((property) => property.id) };
  const whereFor = (list: 'RECENT' | 'PINNED' | 'ARCHIVED', pageCursor: typeof cursor) => askSessionHistoryWhere({ ...bounds, ...scope, cursor: pageCursor, list } as Parameters<typeof askSessionHistoryWhere>[0]);
  const select = {
    id: true,
    propertyId: true,
    title: true,
    lastActiveAt: true,
    titleSetByUserAt: true,
    pinnedAt: true,
    archivedAt: true,
    _count: { select: { executions: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } },
    executions: {
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: 1,
      select: { id: true, message: true, status: true },
    },
  } satisfies Prisma.AskSessionSelect;
  const sessions = await prisma.askSession.findMany({
    where: whereFor(view === 'ARCHIVED' ? 'ARCHIVED' : 'RECENT', cursor),
    orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
    take: ASK_SESSION_HISTORY_PAGE_SIZE + 1,
    select,
  });
  // IW-HIST-003: pinned conversations form their own stable group, sent once with the first page of the recent list.
  const includePinned = view === 'RECENT' && !cursor && !searchQuery;
  const pinnedSessions = includePinned ? await prisma.askSession.findMany({
    where: whereFor('PINNED', null),
    orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
    take: ASK_SESSION_HISTORY_PAGE_SIZE,
    select,
  }) : [];
  const selectedProperty = propertyId ? await propertySummary(propertyId) : null;
  if (propertyId && !selectedProperty) return { items: [], nextCursor: null, ...(includePinned ? { pinned: [] } : {}) };
  const labels = new Map<string, { id: string; label: string }>(
    propertyId && selectedProperty ? [[propertyId, selectedProperty]]
      : accessibleProperties!.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]),
  );
  const summarize = (rows: typeof sessions): AskRecentSessionSummary[] => rows.flatMap((session) => {
    const latest = session.executions[0];
    const property = session.propertyId ? labels.get(session.propertyId) : null;
    if (!latest || !property) return [];
    const title = (session.title?.trim() || latest.message.trim()).slice(0, 120);
    return [{
      sessionId: session.id,
      title,
      property,
      latestStatus: latest.status,
      latestExecutionId: latest.id,
      executionCount: session._count.executions,
      lastActiveAt: session.lastActiveAt.toISOString(),
      pinned: Boolean(session.pinnedAt),
      archived: Boolean(session.archivedAt),
      titleSetByUser: Boolean(session.titleSetByUserAt),
    }];
  });
  const page = sessions.slice(0, ASK_SESSION_HISTORY_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: summarize(page),
    nextCursor: sessions.length > ASK_SESSION_HISTORY_PAGE_SIZE && last
      ? encodeAskSessionHistoryCursor({ lastActiveAt: last.lastActiveAt, id: last.id }) : null,
    ...(includePinned ? { pinned: summarize(pinnedSessions) } : {}),
  };
}

// IW-HIST-009..011 (session lifecycle controls): rename, pin/unpin and archive/restore one of the homeowner's own
// conversations. The session must belong to the user, still be retained, and (for a property-scoped session) its home
// must still be accessible -- a conversation whose home access was revoked is reported as not found rather than
// letting its title be edited or confirmed to exist (IW-HIST-006). None of these touches retention (expiresAt),
// lastActiveAt, executions or any home record. Archiving also unpins, so a restored conversation returns to the
// ordinary recent list.
export async function updateAskSessionForUser(userId: string, sessionId: string, change: AskSessionUpdateRequest): Promise<{ sessionId: string; title: string | null; pinned: boolean; archived: boolean; titleSetByUser: boolean }> {
  const notFound = () => Object.assign(new Error('Ask session not found.'), { code: 'ASK_SESSION_NOT_FOUND' });
  const now = new Date();
  const session = await prisma.askSession.findFirst({
    where: { id: sessionId, userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, propertyId: true },
  });
  if (!session) throw notFound();
  if (session.propertyId && !(await resolvePropertyAccess(userId, session.propertyId))) throw notFound();
  const data: Prisma.AskSessionUpdateInput = 'title' in change
    ? { title: change.title, titleSetByUserAt: now }
    : 'pinned' in change
      ? { pinnedAt: change.pinned ? now : null }
      : change.archived ? { archivedAt: now, pinnedAt: null } : { archivedAt: null };
  const updated = await prisma.askSession.update({
    where: { id: session.id },
    data,
    select: { id: true, title: true, pinnedAt: true, archivedAt: true, titleSetByUserAt: true },
  });
  return { sessionId: updated.id, title: updated.title, pinned: Boolean(updated.pinnedAt), archived: Boolean(updated.archivedAt), titleSetByUser: Boolean(updated.titleSetByUserAt) };
}

export async function getAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
}

const INTERACTIVE_ASK_STATUSES: AskExecutionStatus[] = ['NEEDS_PROPERTY', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION'];
const CONTINUABLE_ASK_STATUSES: AskExecutionStatus[] = [...INTERACTIVE_ASK_STATUSES, 'RUNNING'];

function pendingKind(status: AskExecutionStatus): AskPendingWorkItem['pendingKind'] {
  if (status === 'RUNNING') return 'COMMAND_RECOVERY';
  if (status === 'NEEDS_PROPERTY') return 'PROPERTY_SELECTION';
  if (status === 'NEEDS_ENTITY') return 'ENTITY_SELECTION';
  if (status === 'NEEDS_CONTEXT') return 'CONTEXT_CAPTURE';
  if (status === 'NEEDS_CONFIRMATION') return 'CONFIRMATION';
  return 'CLARIFICATION';
}

function pendingActionLabel(status: AskExecutionStatus): string {
  if (status === 'RUNNING') return 'Check action status';
  if (status === 'NEEDS_PROPERTY') return 'Select a home';
  if (status === 'NEEDS_ENTITY') return 'Choose a record';
  if (status === 'NEEDS_CONTEXT') return 'Add the missing detail';
  if (status === 'NEEDS_CONFIRMATION') return 'Review and confirm';
  return 'Answer one question';
}

function pendingInteractionExpiresAt(execution: { resultJson: Prisma.JsonValue | null }): Date | null {
  if (!execution.resultJson || typeof execution.resultJson !== 'object' || Array.isArray(execution.resultJson)) return null;
  const result = execution.resultJson as { clarification?: unknown; confirmation?: unknown };
  const interaction = result.clarification && typeof result.clarification === 'object' && !Array.isArray(result.clarification)
    ? result.clarification as Record<string, unknown>
    : result.confirmation && typeof result.confirmation === 'object' && !Array.isArray(result.confirmation)
      ? result.confirmation as Record<string, unknown>
      : null;
  const value = interaction?.expiresAt;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// A restart/crash/OOM between "status: RUNNING" (set immediately before the
// operation runs) and the follow-up write that records its outcome leaves
// the row physically stuck at RUNNING forever: no in-process catch block
// ever runs again to move it forward. Confirmed-command executions always
// create an AskConfirmationReceipt before flipping to RUNNING and already
// have a correct lease-based recovery path (confirmAskExecution's
// recoveringClaim) — this only reclaims RUNNING rows with no confirmation
// receipt at all, i.e. a plain read/analysis operation, once enough time
// has passed that it could not still be legitimately executing.
const ASK_RUNNING_RECLAIM_GRACE_MS = 30_000;

async function reclaimOrphanedRunningExecution(execution: AskExecution): Promise<AskExecution> {
  if (execution.status !== 'RUNNING') return execution;
  const controls = readAskOperationalControls();
  const orphanThresholdMs = controls.executionTimeoutMs + ASK_RUNNING_RECLAIM_GRACE_MS;
  if (Date.now() - execution.updatedAt.getTime() < orphanThresholdMs) return execution;
  const activeClaim = await prisma.askConfirmationReceipt.findFirst({ where: { executionId: execution.id }, select: { id: true } });
  if (activeClaim) return execution;
  const updated = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId: execution.userId, status: 'RUNNING' },
    data: {
      status: 'FAILED_RETRYABLE', reasonCode: 'ASK_EXECUTION_INTERRUPTED', completedAt: null,
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'ERROR_STATE', id: 'execution-interrupted', title: 'This got interrupted', body: 'The system restarted while this was running. No action was performed — try asking again.', retryable: true, actions: [] }],
        captureRequests: [], clarification: null, confirmation: null, suggestions: ['Ask this question again'],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'ERROR_STATE', id: 'execution-interrupted', title: 'This got interrupted', body: 'No action was performed.', retryable: true, actions: [] }]),
      }),
    },
  });
  if (updated.count === 1) {
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECLAIMED_ORPHANED_RUNNING', metadataJson: asInputJson({ reason: 'RUNNING_TIMEOUT_EXCEEDED' }) } });
  }
  return prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

async function expirePendingInteraction(execution: AskExecution): Promise<AskExecution> {
  if (execution.status === 'RUNNING') return reclaimOrphanedRunningExecution(execution);
  const interactionExpiresAt = pendingInteractionExpiresAt(execution);
  if (!interactionExpiresAt || interactionExpiresAt > new Date()) return execution;
  const updated = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId: execution.userId, status: execution.status },
    data: {
      status: 'EXPIRED', reasonCode: 'ASK_EXECUTION_EXPIRED', completedAt: new Date(),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'pending-work-expired', title: 'This pending request expired', status: 'EXPIRED', description: 'No action was performed. Ask the question again to use current home records and settings.', details: [], actions: [] }],
        captureRequests: [], clarification: null, confirmation: null, suggestions: ['Ask this question again'],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'pending-work-expired', title: 'This pending request expired', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]),
      }),
    },
  });
  if (updated.count === 1) {
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'PENDING_INTERACTION_EXPIRED' }) } });
  }
  return prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

export async function getAskPendingWork(userId: string, propertyId: string | null): Promise<AskPendingWorkItem[]> {
  if (propertyId) await ensurePropertyAccess(userId, propertyId);
  // A RUNNING row with no confirmation receipt at all is a plain
  // read/analysis operation; it's only worth sweeping here once it's old
  // enough that it can no longer be a normal, currently-executing request
  // (matching reclaimOrphanedRunningExecution's own threshold) — otherwise
  // every question in flight on any tab/device would flicker into "pending
  // work" for the second or two it takes to answer.
  const orphanRunningCutoff = new Date(Date.now() - (readAskOperationalControls().executionTimeoutMs + ASK_RUNNING_RECLAIM_GRACE_MS));
  const rows = await prisma.askExecution.findMany({
    where: {
      userId,
      propertyId,
      AND: [
        { OR: [
          { status: { in: INTERACTIVE_ASK_STATUSES } },
          { status: 'RUNNING', confirmations: { some: { status: 'CLAIMED' } } },
          { status: 'RUNNING', confirmations: { none: {} }, updatedAt: { lte: orphanRunningCutoff } },
        ] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const property = await propertySummary(propertyId);
  const items: AskPendingWorkItem[] = [];
  for (const row of rows) {
    const current = await expirePendingInteraction(row);
    if (!CONTINUABLE_ASK_STATUSES.includes(current.status)) continue;
    items.push({
      pendingKind: pendingKind(current.status),
      actionLabel: pendingActionLabel(current.status),
      execution: mapPersistedExecution(current, property),
    });
    if (items.length === 3) break;
  }
  return items;
}

export async function continueAskExecution(userId: string, executionId: string, input: ContinueAskExecution): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const current = CONTINUABLE_ASK_STATUSES.includes(execution.status) ? await expirePendingInteraction(execution) : execution;
  if (CONTINUABLE_ASK_STATUSES.includes(current.status)) {
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONTINUATION_OPENED', metadataJson: asInputJson({ surface: input.surface, status: current.status }) },
    });
    await prisma.askSession.update({ where: { id: current.sessionId }, data: { lastActiveAt: new Date() } });
  }
  return mapPersistedExecution(current, await propertySummary(current.propertyId));
}

export async function requestAskCorrection(userId: string, executionId: string, input: RequestAskCorrection): Promise<{ executionId: string; href: string }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const correctionAccess = execution.propertyId ? await ensurePropertyAccess(userId, execution.propertyId) : null;
  if (input.kind === 'INTENT' || input.kind === 'ENTITY') {
    const controls = readAskOperationalControls();
    const correctionEligibleOperationIds = await discoverableAskOperationIds({
      propertyId: execution.propertyId, propertyAccess: correctionAccess, controls,
    });
    const answerValidationRecovery = execution.reasonCode?.startsWith('ASK_ANSWER_RELEVANCE_') ?? false;
    const semanticCandidates = retrieveAskOperationCandidates(execution.message, {
      eligibleOperationIds: correctionEligibleOperationIds,
      topK: 5,
      embeddingEnabled: controls.embeddingRetrievalEnabled,
      minimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
    }).filter((candidate) => input.kind === 'ENTITY'
      ? candidate.operationId === execution.operationId
      : answerValidationRecovery || candidate.operationId !== execution.operationId);
    const fallbackIds: AskOperationId[] = input.kind === 'ENTITY' && execution.operationId
      ? [execution.operationId as AskOperationId]
      : ['PROPERTY_SUMMARY', 'MAINTENANCE_STATUS', 'INVENTORY_LOOKUP', 'HOME_ACTIONS'];
    const candidateOperationIds = [...new Set([
      ...(answerValidationRecovery && execution.operationId ? [execution.operationId as AskOperationId] : []),
      ...semanticCandidates.map((candidate) => candidate.operationId),
      ...fallbackIds,
    ])].filter((operationId) => operationId in ASK_OPERATION_DEFINITIONS && correctionEligibleOperationIds.includes(operationId)).slice(0, 3);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const clarification = {
      version: 1,
      question: input.kind === 'ENTITY'
        ? 'Which home item or record did you mean?'
        : 'What did you want Ask Cozy to help with?',
      options: input.kind === 'ENTITY' ? [] : candidateOperationIds.map((operationId) => ({
        operationId,
        label: getAskOperationDefinition(operationId).semantic.supportedJobs[0],
      })),
      allowFreeText: true,
      expiresAt,
    };
    const correction = await prisma.askExecution.create({
      data: {
        sessionId: execution.sessionId,
        userId,
        propertyId: execution.propertyId,
        clientRequestId: `correction-${execution.id}-${Date.now()}`,
        message: execution.message,
        intentFamily: 'CLARIFICATION',
        status: 'NEEDS_CLARIFICATION',
        reasonCode: input.kind === 'ENTITY' ? 'ASK_ENTITY_CORRECTION_REQUESTED' : 'ASK_INTENT_CORRECTION_REQUESTED',
        parametersJson: asInputJson({
          clarification: { version: 1, candidateOperationIds, expiresAt },
          correctionOfExecutionId: execution.id,
          correctionReason: input.kind,
        }),
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{ type: 'SUMMARY', id: 'ask-correction', title: 'Let’s correct that', body: input.kind === 'ENTITY' ? 'Tell me which item or record you meant. I’ll keep the selected home and check access again.' : 'Choose the home job you meant. I’ll keep this conversation and re-run the correct canonical workflow.', tone: 'DEFAULT', actions: [] }],
          captureRequests: [], confirmation: null, clarification, suggestions: [], skillHandoff: null,
          // A genuinely new, separate execution row (its own correction
          // turn) -- stamps its own fresh original snapshot rather than
          // inheriting anything from the execution it corrects.
          ...preservedExecutionHistory(null, [{ type: 'SUMMARY' as const, id: 'ask-correction', title: 'Let’s correct that', body: 'Correction requested.', tone: 'DEFAULT' as const, actions: [] }]),
        }),
        expiresAt: execution.expiresAt ?? new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CORRECTION_REQUESTED', metadataJson: asInputJson({ kind: input.kind, correctionExecutionId: correction.id }) } });
    await prisma.askExecutionEvent.create({ data: { executionId: correction.id, eventType: 'CORRECTION_STARTED', metadataJson: asInputJson({ kind: input.kind, correctionOfExecutionId: execution.id, candidateOperationIds }) } });
    askCorrectionsTotal.inc({ kind: input.kind, outcome: 'started' });
    return { executionId: correction.id, href: `/dashboard/ask?sessionId=${encodeURIComponent(execution.sessionId)}&executionId=${encodeURIComponent(correction.id)}` };
  }
  const href = input.kind === 'RETRY_RESPONSE'
    ? `/dashboard/ask?retryExecutionId=${encodeURIComponent(execution.id)}`
    : captureFallbackHref(execution.operationId, execution.propertyId) ?? '/dashboard/ask';
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CORRECTION_REQUESTED', metadataJson: asInputJson({ kind: input.kind }) } });
  askCorrectionsTotal.inc({ kind: input.kind, outcome: 'redirected' });
  return { executionId, href };
}

export async function submitAskExecutionFeedback(userId: string, executionId: string, input: SubmitAskFeedback): Promise<{ id: string; rating: 'UP' | 'DOWN' }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, propertyId: true, skillId: true, skillVersion: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const page = `ask:execution:${execution.id}`;
  const saved = await recordTypedFeedback({
    userId,
    propertyId: execution.propertyId,
    page,
    rating: input.rating.toLowerCase(),
    comment: input.comment ?? null,
    targetType: 'ASK_EXECUTION',
    targetId: execution.id,
    surface: 'COZY',
    reasonCodes: [...new Set<FeedbackReasonCode>([input.rating === 'UP' ? 'USEFUL' : 'NOT_USEFUL', ...(input.reasonCodes ?? [])])],
    capabilityId: execution.skillId ?? 'ask',
    capabilityVersion: execution.skillVersion ?? ASK_RESPONSE_SCHEMA_VERSION,
  });
  askFeedbackTotal.inc({ rating: input.rating.toLowerCase() });
  return { id: saved.id, rating: input.rating };
}

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable —
// per-PRIORITY_LIST-item rating, distinct from submitAskExecutionFeedback's
// whole-execution UP/DOWN. Ownership is verified the same way
// submitAskExecutionFeedback does (the execution belongs to this user);
// homeActionsResult() already ran ensurePropertyAccess before this execution
// could have surfaced any PRIORITY_LIST item for its property.
export async function submitHomeActionUsefulnessFeedback(
  userId: string,
  executionId: string,
  homeActionId: string,
  input: SubmitHomeActionUsefulnessFeedback,
): Promise<{ id: string; rating: 'USEFUL' | 'NOT_USEFUL' }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, propertyId: true, skillId: true, skillVersion: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  return recordHomeActionUsefulnessFeedback({
    userId, propertyId: execution.propertyId, homeActionId, rating: input.rating, comment: input.comment ?? null,
    reasonCodes: input.reasonCodes,
    capabilityId: execution.skillId ?? 'home-actions',
    capabilityVersion: execution.skillVersion ?? 'canonical-feed-v1',
  });
}

type ConciergeCapabilityGroupDefinition = Omit<ConciergeHomeView['capabilityGroups'][number], 'capabilityIds'> & {
  outcomeCategory: CapabilityCatalogItem['outcomeCategory'];
};

const CONCIERGE_CAPABILITY_GROUPS: readonly ConciergeCapabilityGroupDefinition[] = [
  {
    id: 'UNDERSTAND', label: 'Understand your home', outcomeCategory: 'UNDERSTAND_HOME',
    description: 'Turn home records into a clear, useful picture.',
    prompts: [
      { id: 'understand-summary', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of my home record.' },
      { id: 'understand-completeness', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'How complete is my home record?' },
    ],
  },
  {
    id: 'MAINTAIN', label: 'Maintain and prevent', outcomeCategory: 'MAINTAIN_PREVENT',
    description: 'Stay ahead of maintenance and prevent avoidable problems.',
    prompts: [
      { id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?' },
      { id: 'maintain-create', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'Create a maintenance task for changing my HVAC filter.' },
    ],
  },
  {
    id: 'PROTECT', label: 'Protect your home', outcomeCategory: 'PROTECT_MONITOR',
    description: 'Find coverage gaps, risks, and important changes.',
    prompts: [
      { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?' },
      { id: 'protect-changes', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'What changed recently for this home?' },
    ],
  },
  {
    id: 'SAVE', label: 'Reduce costs', outcomeCategory: 'SAVE_OPTIMIZE',
    description: 'Understand spending and uncover relevant savings.',
    prompts: [
      { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?' },
      { id: 'save-costs', categoryId: 'SAVE', categoryLabel: 'Save', question: 'What are my biggest ownership costs?' },
    ],
  },
  {
    id: 'DECIDE', label: 'Compare and decide', outcomeCategory: 'DECIDE_COMPARE',
    description: 'Compare options with the relevant home context.',
    prompts: [
      { id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.' },
      { id: 'decide-quotes', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare contractor quotes.' },
    ],
  },
  {
    id: 'PLAN_MONITOR', label: 'Plan and monitor', outcomeCategory: 'PLAN_BUDGET',
    description: 'Build plans and keep watch on important deadlines.',
    prompts: [
      { id: 'plan-reserve', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Create a capital reserve plan for future replacements.' },
      { id: 'plan-deadlines', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Monitor my important home deadlines.' },
    ],
  },
] as const;

// Ask Intelligence FRD §18.4, Phase 9B "Concierge Home" deliverable. A
// read-only composition of three already-governed sources -- never a
// fourth ranking/change/decision system of its own (mirrors PRIORITY_LIST's
// "no second feed" discipline from §17.1). Each section fails independently
// and reports its own honest state rather than one section's outage taking
// down the whole panel or silently reading as "all clear".
export async function getConciergeHome(userId: string, propertyId: string, accountRole?: AskAccountRole): Promise<ConciergeHomeView> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const conciergeAccess = await ensurePropertyAccess(userId, propertyId);
  const controls = readAskOperationalControls();
  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const askHref = `/dashboard/ask?propertyId=${encodeURIComponent(propertyId)}`;
  const capabilityGroups: ConciergeHomeView['capabilityGroups'] = (() => {
    try {
      const capabilityCatalog = buildCapabilityCatalog({
        registry: canonicalCapabilityRegistry,
        availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
        userId,
        propertyId,
        includeWorkflowContext: false,
      });
      return CONCIERGE_CAPABILITY_GROUPS.flatMap((group) => {
        const capabilityIds = capabilityCatalog.capabilities
          .filter((capability) => capability.outcomeCategory === group.outcomeCategory)
          .map((capability) => capability.id);
        return capabilityIds.length ? [{
          id: group.id,
          label: group.label,
          description: group.description,
          capabilityIds,
          prompts: [...group.prompts],
        }] : [];
      });
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home capability discovery failed closed');
      return [];
    }
  })();

  const priorityListPromise = (async (): Promise<ConciergeHomeView['priorityList']> => {
    try {
      const feed = await getHomeActionFeed(propertyId, userId);
      const suppressedHomeActionIds = await getSuppressedHomeActionIds({
        userId, propertyId, homeActionIds: feed.actions.map((action) => action.id),
      }).catch(() => new Set<string>());
      const view = buildPriorityListView(feed, 'CONCIERGE_HOME', { suppressedHomeActionIds });
      const sourceActions = new Map(feed.actions.map((action) => [action.id, action]));
      return {
        state: view.items.length ? 'AVAILABLE' : 'NO_ACTION',
        rankingPolicyVersion: view.rankingPolicyVersion,
        generatedAt: view.generatedAt,
        items: view.items.map((item) => {
          const sourceAction = sourceActions.get(item.homeActionId);
          const category = sourceAction ? focusedHomeActionCategory(sourceAction) : { categoryId: 'MAINTAIN' as const, categoryLabel: 'Maintain' as const };
          return {
            homeActionId: item.homeActionId,
            title: item.title,
            askQuestion: sourceAction ? focusedHomeActionQuestion(sourceAction) : `What should I do next for “${item.title}”?`,
            askCategoryId: category.categoryId,
            askCategoryLabel: category.categoryLabel,
            subject: sourceAction?.presentation?.subject ?? null,
            consumerPriority: item.consumerPriority,
            comparativeReasonCodes: item.comparativeReasonCodes,
            confidenceLabel: item.confidenceLabel,
            deadlineAt: item.deadlineAt,
            cta: item.cta ? { label: item.cta.label, href: item.cta.href } : null,
            watchState: item.watchState,
            suppressed: item.suppressed,
            completed: item.completed,
            unavailable: item.unavailable,
            stale: item.stale,
          };
        }),
        truncated: view.truncated,
        href: homeHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home priority list section failed closed');
      return { state: 'UNAVAILABLE', rankingPolicyVersion: null, generatedAt: null, items: [], truncated: false, href: homeHref };
    }
  })();

  const changesPromise = (async (): Promise<ConciergeHomeView['changes']> => {
    try {
      const since = new Date(Date.now() - HOME_CHANGE_SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const changes = await listPropertyChanges({ propertyId, userId, since });
      const seenSummaries = new Set<string>();
      const material = changes.filter((change) => {
        if (change.materiality === 'INFORMATIONAL') return false;
        const summaryKey = `${change.sourceType}:${change.changeType}`;
        if (seenSummaries.has(summaryKey)) return false;
        seenSummaries.add(summaryKey);
        return true;
      }).slice(0, 3);
      return {
        state: material.length ? 'AVAILABLE' : 'NO_CHANGE',
        windowDays: HOME_CHANGE_SUMMARY_WINDOW_DAYS,
        items: material.map((change) => ({
          id: change.id,
          source: sourceTypeLabel(change.sourceType),
          summary: buildChangeSummaryText({ sourceType: change.sourceType, changeType: change.changeType }),
          materiality: change.materiality,
          detectedAt: change.detectedAt.toISOString(),
          effectiveAt: change.occurredAt ? change.occurredAt.toISOString() : null,
        })),
        href: askHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home changed-recently section failed closed');
      return { state: 'UNAVAILABLE', windowDays: HOME_CHANGE_SUMMARY_WINDOW_DAYS, items: [], href: askHref };
    }
  })();

  const decisionsPromise = (async (): Promise<ConciergeHomeView['decisions']> => {
    try {
      const threads = await decisionThreadService.listActiveDecisionThreadsForProperty(propertyId);
      const supportedThreads = threads.filter((thread) => thread.decisionDefinitionId === 'HVAC_REPAIR_REPLACE');
      return {
        state: supportedThreads.length ? 'AVAILABLE' : 'NO_DECISIONS',
        items: supportedThreads.map((thread) => ({
          decisionThreadId: thread.id,
          title: thread.title,
          lifecycleStatus: thread.lifecycleStatus,
          contextStatus: thread.contextStatus,
          verdict: thread.currentRecommendationSnapshot?.verdictCode ?? null,
          confidenceLabel: (thread.currentRecommendationSnapshot?.confidenceBreakdown as { label?: 'HIGH' | 'MEDIUM' | 'LOW' } | null)?.label ?? null,
          subject: thread.primaryEntityType?.replace(/[^a-z]/gi, '').toUpperCase() === 'INVENTORYITEM' && thread.primaryEntityId
            ? { kind: 'INVENTORY_ITEM' as const, id: thread.primaryEntityId, label: thread.title.slice(0, 180) }
            : null,
          updatedAt: thread.updatedAt.toISOString(),
        })),
        href: askHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home decisions-in-progress section failed closed');
      return { state: 'UNAVAILABLE', items: [], href: askHref };
    }
  })();

  const inventoryDecisionCandidatePromise = (async () => {
    try {
      const select = { id: true, name: true, condition: true, expectedExpiryDate: true, updatedAt: true } as const;
      const [conditionItems, lifecycleItems] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { propertyId, condition: { in: ['FAIR', 'POOR'] } },
          select,
          orderBy: [{ condition: 'desc' }, { updatedAt: 'desc' }],
          take: 25,
        }),
        prisma.inventoryItem.findMany({
          where: { propertyId, expectedExpiryDate: { lte: new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000) } },
          select,
          orderBy: [{ expectedExpiryDate: 'asc' }, { updatedAt: 'desc' }],
          take: 25,
        }),
      ]);
      return selectInventoryDecisionCandidate([
        ...new Map([...conditionItems, ...lifecycleItems].map((item) => [item.id, item])).values(),
      ]);
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home inventory-aware prompt selection failed closed');
      return null;
    }
  })();

  const journeyContextPromise = (async (): Promise<ConciergeHomeView['journeyContext']> => {
    try {
      const skill = getSkillDefinition('property-record');
      if (!skill) throw new Error('Property Record Skill is not registered.');
      const composed = await composeSkillContext({
        skill,
        operationId: 'PROPERTY_SUMMARY',
        userId,
        propertyId,
      }, { providerEnabled: controls.contextProviderEnabled });
      const entry = composed.entries.find((candidate) => candidate.key === skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER));
      const context = journeyContextFrom(composed);
      if (entry?.status === 'UNKNOWN' || (entry?.status === 'AVAILABLE' && !context)) {
        return {
          state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
          propertyOrigin: null, contextVersion: null, capturedAt: null,
        };
      }
      if (!context || entry?.status !== 'AVAILABLE') {
        return {
          state: 'UNAVAILABLE', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
          propertyOrigin: null, contextVersion: null, capturedAt: null,
        };
      }
      return {
        state: 'AVAILABLE',
        ownershipState: context.ownershipState,
        operatingMode: context.operatingMode,
        entryPath: context.entryPath,
        propertyOrigin: context.propertyOrigin,
        contextVersion: context.contextVersion,
        capturedAt: context.capturedAt,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home journey context failed closed');
      return {
        state: 'UNAVAILABLE', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
        propertyOrigin: null, contextVersion: null, capturedAt: null,
      };
    }
  })();

  const [priorityList, changes, decisions, inventoryDecisionCandidate, journeyContext] = await Promise.all([
    priorityListPromise,
    changesPromise,
    decisionsPromise,
    inventoryDecisionCandidatePromise,
    journeyContextPromise,
  ]);
  const audienceDiscoveryActive = controls.audienceDiscoveryEnabled && controls.audiencePolicyEnabled;
  const discoveryOperatingMode = audienceDiscoveryActive && journeyContext.state === 'AVAILABLE'
    ? journeyContext.operatingMode
    : 'UNKNOWN';
  const promptOperationId = (prompt: ConciergeHomeView['featuredPrompts'][number] | ConciergeHomeView['capabilityGroups'][number]['prompts'][number]): AskOperationId => {
    const contextualOperation: AskOperationId | null = prompt.context?.entityType === 'DECISION_THREAD'
      ? 'HVAC_DECISION_CONTINUE'
      : prompt.context?.entityType === 'INVENTORY_ITEM'
        ? 'REPLACEMENT_GUIDANCE'
        : prompt.context?.entityType === 'HOME_ACTION'
          ? 'HOME_ACTIONS'
        : null;
    return contextualOperation ?? resolveAskOperation(prompt.question).operationId;
  };
  const operationIsDiscoverable = (operationId: AskOperationId): boolean => {
    if (!controls.operationEnabled(operationId)) return false;
    if (skillRuntimeUnavailableReason(operationId, controls)) return false;
    const policy = getAskAudiencePolicy(operationId, getAskOperationDefinition(operationId).version);
    if (!policy) return true;
    return evaluateAskAudienceApplicability({
      policy,
      accountRole: 'HOMEOWNER',
      householdRole: conciergeAccess.role,
      operatingMode: discoveryOperatingMode,
      purpose: 'DISCOVERY',
    }).discoverable;
  };
  const promptIsDiscoverable = (prompt: ConciergeHomeView['featuredPrompts'][number] | ConciergeHomeView['capabilityGroups'][number]['prompts'][number]): boolean => (
    operationIsDiscoverable(promptOperationId(prompt))
  );
  const audienceCapabilityGroups: ConciergeHomeView['capabilityGroups'] = capabilityGroups
    .map((group) => ({ ...group, prompts: group.prompts.filter(promptIsDiscoverable) }))
    .filter((group) => group.prompts.length > 0);
  const eligiblePriorityItems = priorityList.items
    .filter((item) => !item.suppressed && !item.completed && !item.unavailable && !item.stale && item.consumerPriority !== 'NO_ACTION');
  const topPriority = eligiblePriorityItems[0];
  const topDecision = decisions.state === 'AVAILABLE' ? decisions.items[0] : undefined;
  const landingSpotlight = selectConciergeLandingSpotlight({ attention: topPriority, decision: topDecision });
  const spotlightSubject = landingSpotlight?.kind === 'ATTENTION'
    ? eligiblePriorityItems.find((item) => item.homeActionId === landingSpotlight.entityId)?.subject
    : landingSpotlight?.kind === 'DECISION'
      ? decisions.items.find((item) => item.decisionThreadId === landingSpotlight.entityId)?.subject
      : null;
  const reservedSubjectKeys = new Set<string>();
  const spotlightSubjectKey = conciergeLandingSubjectKey(spotlightSubject);
  if (spotlightSubjectKey) reservedSubjectKeys.add(spotlightSubjectKey);
  const featuredPrompts: ConciergeHomeView['featuredPrompts'] = [];
  const representedOperations = new Set<AskOperationId>();
  const representedSubjectKeys = new Set<string>();
  const addPrompt = (prompt: ConciergeHomeView['featuredPrompts'][number], boundOperationId?: AskOperationId): boolean => {
    const operationId = boundOperationId ?? promptOperationId(prompt);
    const subjectKey = conciergeLandingSubjectKey(prompt.subject);
    if (!operationIsDiscoverable(operationId)
      || representedOperations.has(operationId)
      || featuredPrompts.length >= 4
      || (subjectKey !== null && (reservedSubjectKeys.has(subjectKey) || representedSubjectKeys.has(subjectKey)))
      || featuredPrompts.some((existing) => existing.question.toLowerCase() === prompt.question.toLowerCase())) return false;
    featuredPrompts.push(prompt);
    representedOperations.add(operationId);
    if (subjectKey) representedSubjectKeys.add(subjectKey);
    return true;
  };
  if (topDecision && !(landingSpotlight?.kind === 'DECISION' && landingSpotlight.entityId === topDecision.decisionThreadId)) {
    addPrompt({
      id: `decision-${topDecision.decisionThreadId}`,
      categoryId: 'DECIDE',
      categoryLabel: 'Decide',
      question: `Help me continue this decision: ${topDecision.title}`,
      subject: topDecision.subject ?? undefined,
      context: { entityType: 'DECISION_THREAD', entityId: topDecision.decisionThreadId },
      source: 'PERSONALIZED',
    });
  }
  if (topPriority && !(landingSpotlight?.kind === 'ATTENTION' && landingSpotlight.entityId === topPriority.homeActionId)) {
    addPrompt({
      id: `attention-${topPriority.homeActionId}`,
      categoryId: topPriority.askCategoryId,
      categoryLabel: topPriority.askCategoryLabel,
      question: topPriority.askQuestion,
      subject: topPriority.subject ?? undefined,
      context: { entityType: 'HOME_ACTION', entityId: topPriority.homeActionId, actionId: topPriority.homeActionId, capabilityId: 'home-operations' },
      source: 'PERSONALIZED',
    });
  }
  if (inventoryDecisionCandidate && !featuredPrompts.some((prompt) => prompt.categoryId === 'DECIDE')) {
    addPrompt({
      id: `inventory-decision-${inventoryDecisionCandidate.id}`,
      categoryId: 'DECIDE',
      categoryLabel: 'Decide',
      question: inventoryDecisionQuestion(inventoryDecisionCandidate.name),
      subject: { kind: 'INVENTORY_ITEM', id: inventoryDecisionCandidate.id, label: inventoryDecisionCandidate.name.slice(0, 180) },
      context: { entityType: 'INVENTORY_ITEM', entityId: inventoryDecisionCandidate.id, capabilityId: 'replace-repair' },
      source: 'PERSONALIZED',
    });
  }
  const representedCategories = new Set(featuredPrompts.map((prompt) => prompt.categoryId));
  const lifecyclePrompts = lifecyclePromptsFor(
    audienceDiscoveryActive && journeyContext.state === 'AVAILABLE' ? journeyContext.ownershipState : null,
  );
  for (const prompt of lifecyclePrompts) {
    if (representedCategories.has(prompt.categoryId)) continue;
    const added = addPrompt({
      id: prompt.id,
      categoryId: prompt.categoryId,
      categoryLabel: prompt.categoryLabel,
      question: prompt.question,
      source: 'PERSONALIZED',
    }, prompt.operationId);
    if (added) representedCategories.add(prompt.categoryId);
  }
  for (const group of audienceCapabilityGroups) {
    if (representedCategories.has(group.id) || !group.prompts[0]) continue;
    if (addPrompt({ ...group.prompts[0], source: 'DISCOVERY' })) representedCategories.add(group.id);
  }
  for (const group of audienceCapabilityGroups) {
    for (const prompt of group.prompts) addPrompt({ ...prompt, source: 'DISCOVERY' });
  }

  return {
    propertyId,
    generatedAt: new Date().toISOString(),
    journeyContext,
    priorityList,
    changes,
    decisions,
    landingSpotlight,
    capabilityGroups: audienceCapabilityGroups,
    featuredPrompts,
    suggestedQuestions: featuredPrompts.map((prompt) => prompt.question),
  };
}
