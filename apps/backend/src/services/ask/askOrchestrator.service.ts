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
import { homeDeadlineMonitorResult, captureNotDirectlyRoutableResult } from './handlers/miscHandlers.handler';
import './handlers/miscHandlers.handler';
export { operationalWorkCompletionObservedResult } from './handlers/miscHandlers.handler';
import { HOME_CHANGE_SUMMARY_WINDOW_DAYS, RadarEnvelopeQuerySuppliedInput } from './askHandlerSupport';
import './handlers/captureConfirm.handler';
import { editInspectionFindingResolveConfirmation } from './handlers/workflowConfirm.handler';
import './handlers/workflowConfirm.handler';
export { saleReadinessItemConflictDescription, editInspectionFindingResolveConfirmation } from './handlers/workflowConfirm.handler';
import { GuidanceJourneyCommandInputSchema, HomeDeadlineMonitorInputSchema, guidanceJourneyContextVersion, homeDeadlineSourceVersion } from './askHandlerSupport';
import { editInventoryItemCorrectConfirmation, editHomeEventCorrectConfirmation, editHomeEventVisibilityConfirmation, editWarrantyCorrectConfirmation, editRoomRenameConfirmation } from './handlers/recordConfirm.handler';
import './handlers/recordConfirm.handler';
import { captureEventResult } from './askHandlerSupport';
import './handlers/hvacConfirm.handler';
import { editBuyerTaskUpdateConfirmation } from './handlers/buyerConfirm.handler';
import './handlers/buyerConfirm.handler';
import { editMaintenanceTaskUpdateConfirmation } from './handlers/maintenanceConfirm.handler';
import './handlers/maintenanceConfirm.handler';
import { editHomeEventRadarFeedbackConfirmation } from './handlers/radarConfirm.handler';
import './handlers/radarConfirm.handler';
export { editHomeEventRadarFeedbackConfirmation } from './handlers/radarConfirm.handler';
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











// Sets the property timezone that humanDate() implicitly reads for the
// remainder of this request, instead of always formatting in UTC.
async function enterAskPropertyTimezoneContext(propertyId: string | null | undefined): Promise<void> {
  const property = propertyId ? await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }) : null;
  enterAskExecutionContext({ propertyTimezone: property?.timezone });
}
































































function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
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
