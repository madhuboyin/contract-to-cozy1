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
import './execution/createAskExecution';
export { createAskExecution } from './execution/createAskExecution';
import './execution/askClarification';
export { submitAskClarification, resolveAskExecutionProperty } from './execution/askClarification';
import { askFailureStatus, askFailureBlocks, maybeSynthesizeDeterministicResult, withAskTimeout } from './askHandlerSupport';
import './execution/askConfirm';
export { confirmAskExecution, editAskConfirmation, cancelAskExecution } from './execution/askConfirm';
import { assertSkillResultBlocksAllowed } from './askHandlerSupport';
import './execution/askCapture';
export { submitAskCapture, recordAskCaptureEvent, recordAskCaptureFailure } from './execution/askCapture';
import { enterAskPropertyTimezoneContext } from './askHandlerSupport';
import './execution/askFeedback';
export { requestAskCorrection, submitAskExecutionFeedback, submitHomeActionUsefulnessFeedback } from './execution/askFeedback';
import { discoverableAskOperationIds } from './askHandlerSupport';
import { INTERACTIVE_ASK_STATUSES, reclaimOrphanedRunningExecution } from './execution/askSessions';
import './execution/askSessions';
export { getAskSession, getRecentAskSessions, updateAskSessionForUser, getAskExecution, getAskPendingWork, continueAskExecution } from './execution/askSessions';
import './execution/askConcierge';
export { getConciergeHome } from './execution/askConcierge';
import { ensureAskServiceAccountEligibility } from './askHandlerSupport';
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








































































































function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
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










































































































