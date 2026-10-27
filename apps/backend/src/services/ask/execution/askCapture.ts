// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { recordAskCapabilityLifecycle } from '../askCapabilityLifecycle';
import { readStoredSuggestedNextActions } from '../suggestedActions/suggestedNextAction.contract';
import { getCaptureDefinitionForFact } from '../../../modules/propertyContext/catalog/captureRegistry';
import { PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import { HouseholdRole, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { loadEventAddOptions } from '../support/homeEventAddEditor';
import { homeEventContextVersion, warrantyContextVersion } from '../suggestedActions/domainVersions';
import { logger } from '../../../lib/logger';
import { areaScopeForOutcome, loadAreaCaptureAllowlist } from '../suggestedActions/profileAreaAllowlist';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPresentationBlock, type RecordAskCaptureEvent, type SubmitAskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { askInlineCapturesTotal } from '../../../lib/metrics';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { ASK_OPERATION_DEFINITIONS, resolveAskOperation, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';
import { operationalUnavailableResult, registerCapabilityHandler, skillRuntimeUnavailableReason } from '../capabilityHandlerRegistry';
import { assertCoverageConflictFree } from '../../coverageConflict.service';
import { captureFeatureContext } from '../../../modules/propertyContext/application/captureFeatureContext';
import { capturePropertyFact } from '../../../modules/propertyContext/application/capturePropertyFact';
import { PropertyContextAccessDeniedError } from '../../../modules/propertyContext/application/getPropertyContext';
import { buildUserAddedEventConfirmation, editCaptureEventCandidate, editCaptureFactCandidate, editCaptureWarrantyCandidate, EVENT_ADD_CAPTURE_KEY } from '../conversationalUnderstanding/conversationalCapture';
import { buildAskNextActionsBlock, NEXT_ACTION_CONTEXT_PREFIX, NEXT_ACTION_FACT_QUESTIONS, NEXT_ACTION_MISSING_FACT_CAPTURE_KEY, nextActionContextOperation } from '../askNextActions';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { getProfile, upsertProfile } from '../../financing.service';
import { radarNotificationPreferenceService } from '../../../modules/homeEventRadar/services/radarNotificationPreference.service';
import { updateInsurancePolicy } from '../../home-management.service';
import { areaCapturePrompt, areaCaptureStateFrom, areaCaptureSubmitResult } from '../handlers/propertySummary.handler';
import { AREA_CAPTURE_MESSAGES, asInputJson, ensurePropertyAccess, enterAskPropertyTimezoneContext, expireIfSkillBindingChanged, HouseholdInvitationInputSchema, InventoryCreateInputSchema, MaintenanceCompletionWorkflowInputSchema, MaintenanceTaskWorkflowInputSchema, mapPersistedExecution, preservedExecutionHistory, propertySummary, RadarTaskAnswerSchema, RadarTaskTargetSchema, RoomCreateInputSchema, terminalStatus } from '../askHandlerSupport';
import { householdInvitationResult, householdWorkflowVersion, ROOM_CREATE_CAPTURE_KEY, roomCreateContextVersion, roomCreateResult, WARRANTY_UPDATE_CAPTURE_KEY, warrantyUpdateResult, HOME_EVENT_UPDATE_CAPTURE_KEY, homeEventUpdateResult } from '../handlers/homeRecordWrites.handler';
import { INVENTORY_COMPLETE_DETAILS_CAPTURE_KEY, INVENTORY_CREATE_CAPTURE_KEY, inventoryCompleteDetailsResult, inventoryCreateContextVersion, inventoryEditResult, inventoryItemContextVersion, inventoryItemCreateResult } from '../handlers/inventory.handler';
import { claimFileResult, ClaimFileWorkflowInputSchema } from '../handlers/claims.handler';
import { RADAR_PREFERENCES_CAPTURE_KEY, RADAR_TASK_CAPTURE_KEY, radarCaptureError, radarPreferencesBodyFromAnswer, radarPreferencesContextVersion, radarPreferencesFormResult, radarTaskContextVersion, radarTaskFormResult } from '../handlers/homeEventRadar.handler';
import { executeOperation } from '../execution/executeOperation';
import { homeJourneyContextVersion, homeJourneyResult, purchaseDateContextVersion, purchaseDateResult } from '../handlers/homeSettingsWrites.handler';
import { HOME_JOURNEY_CAPTURE_KEY, PURCHASE_DATE_CAPTURE_KEY } from '../support/homeSettingsConstants';
import { HOME_PLANT_CAPTURE_KEY, MATERIAL_SPEC_CAPTURE_KEY } from '../support/homeRecordAddConstants';
import { HomePlantAddInputSchema, MaterialSpecAddInputSchema, OwnershipCostDecisionInputSchema, OwnershipCostScenarioInputSchema, OwnershipCostScenarioRenameInputSchema, ProjectTrackerCreateInputSchema, ReserveFundContributionInputSchema } from '../support/commandInputs';
import { RoomPlantRecommendationInputSchema } from '../support/commandInputs';
import { homePlantAddResult, homePlantContextVersion, MATERIAL_SPEC_UPDATE_CAPTURE_KEY, materialSpecAddResult, materialSpecContextVersion, materialSpecUpdateResult } from '../handlers/homeRecordAdds.handler';
import { negotiationShieldStartContextVersion, negotiationShieldStartResult } from '../handlers/negotiationShieldStart.handler';
import { GUIDANCE_STEP_DECLARE_CAPTURE_KEY, GUIDANCE_STEP_DECLARE_MESSAGE, GuidanceStepDeclareAnswerSchema } from '../support/guidanceStepDeclare';
import { guidanceStepDeclareResult } from '../handlers/guidanceStepDeclare.handler';
import { MAINTENANCE_EVIDENCE_CAPTURE_KEY, MAINTENANCE_LINK_CAPTURE_KEY, MaintenanceEvidenceAnswerSchema, MaintenanceLinkAnswerSchema } from '../support/maintenanceEvidenceAttach';
import { evidenceContextVersion, maintenanceEvidenceAttachResult, maintenanceTaskLinkResult } from '../handlers/maintenanceEvidenceAttach.handler';
import { isNegotiationEditScenario, isNegotiationStartScenario, NEGOTIATION_EDIT_SCENARIO_SPECS, NEGOTIATION_SHIELD_START_CAPTURE_KEY, NEGOTIATION_START_SCENARIO_SPECS, parseNegotiationStartAnswer } from '../support/negotiationShieldStart';
import { negotiationShieldEditContextVersion, negotiationShieldEditResult } from '../handlers/negotiationShieldEdit.handler';
import { HOME_DIGITAL_WILL_EDITOR_CAPTURE_KEY, HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY, HomeDigitalWillContactInputSchema, HomeDigitalWillEntryInputSchema, HomeDigitalWillMetadataInputSchema, HomeDigitalWillSectionInputSchema, homeDigitalWillEditorResult, homeDigitalWillMetadataResult, homeDigitalWillPlanVersion, type HomeDigitalWillEditorKind } from '../handlers/homeDigitalWillCreate.handler';
import { NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY, parseNegotiationEditAnswer } from '../support/negotiationShieldEdit';
import { getNegotiationShieldEditableInputForProperty } from '../../negotiationShieldCaseList';
import { negotiationShieldAttachOffer, negotiationShieldAttachResult } from '../handlers/negotiationShieldAttach.handler';
import { quoteCommandResult } from '../handlers/quoteComparisonCommands.handler';
import { parseQuoteFormAnswer, quoteFormKindFromCaptureKey } from '../support/quoteComparisonCommand';
import { priceCommandResult } from '../handlers/priceFinalizationCommands.handler';
import { buyerNegotiationResult } from '../handlers/negotiationShieldBuyerCommands.handler';
import { permitCommandResult } from '../handlers/permitTrackerCommands.handler';
import { upgradeCommandResult } from '../handlers/homeUpgradeCommands.handler';
import { coverageCommandResult } from '../handlers/coverageCommands.handler';
import { capitalCommandResult } from '../handlers/capitalTimelineCommands.handler';
import { CAPITAL_ADJUST_CAPTURE_KEY, parseCapitalAdjustAnswer } from '../support/capitalTimelineCommand';
import { STATUS_BOARD_CORRECT_CAPTURE_KEY, parseStatusBoardCorrectAnswer } from '../support/statusBoardCommand';
import { statusBoardCommandResult } from '../handlers/statusBoardCommands.handler';
import { appealFormKindFromCaptureKey, parseAppealFormAnswer } from '../support/propertyTaxAppealCommand';
import { appealCommandResult } from '../handlers/propertyTaxAppealCommands.handler';
import { SAVINGS_OUTCOME_CAPTURE_KEY, SAVINGS_OUTCOME_INVALID_MESSAGES, parseSavingsOutcomeAnswer, parseSavingsRowId } from '../support/savingsBenefitCommand';
import { SAVINGS_RECURRING_PLAN_CAPTURE_KEY, isSavingsRecurringCategory, parseSavingsPlanAnswer } from '../support/savingsRecurringSetup';
import { recurringSetupResult } from '../handlers/savingsRecurringSetup.handler';
import { savingsCommandResult } from '../handlers/savingsBenefitCommands.handler';
import { parseReadinessFormAnswer, readinessFormKindFromCaptureKey } from '../support/renovationReadinessCommand';
import { readinessCommandResult } from '../handlers/renovationReadinessCommands.handler';
import { PAST_HAZARD_CAPTURE_KEY, PAST_HAZARD_INVALID_MESSAGES, parsePastHazardOutcomeAnswer } from '../support/pastHazardOutcomeCommand';
import { pastHazardCommandResult } from '../handlers/pastHazardOutcomeCommands.handler';
import { BRIEFING_PREFERENCES_CAPTURE_KEY, parseBriefingPreferencesAnswer } from '../support/homeBriefingCommand';
import { briefingCommandResult } from '../handlers/homeBriefingCommands.handler';
import { CLAIM_NOTE_CAPTURE_KEY, parseClaimNoteAnswer } from '../support/claimActivityCommand';
import { claimActivityResult } from '../handlers/claimActivity.handler';
import { doNothingFormKindFromCaptureKey, parseDoNothingScenarioAnswer } from '../support/doNothingScenarioCommand';
import { doNothingScenarioResult } from '../handlers/doNothingScenarioCommands.handler';
import { parseSaleCaseAnswer, saleCaseFormKindFromCaptureKey } from '../support/sellerPrepCaseCommand';
import { saleCaseCommandResult } from '../handlers/sellerPrepCaseCommands.handler';
import { negotiationPackageResult } from '../handlers/inspectionNegotiationPackage.handler';
import { workItemCommandResult } from '../handlers/homeWorkItemCommands.handler';
import { seasonalItemResult } from '../handlers/seasonalItemCommands.handler';
import { walkthroughCommandResult } from '../handlers/buyerWalkthroughCommands.handler';
import { closingItemResult } from '../handlers/buyerClosingItemCommands.handler';
import { insuranceCommandResult } from '../handlers/buyerInsuranceCommands.handler';
import { contractCommandResult } from '../handlers/buyerContractCommands.handler';
import { comparableCommandResult } from '../handlers/propertyTaxComparableCommands.handler';
import { COMPARABLE_CAPTURE_KEY, parseComparableAnswer } from '../support/propertyTaxComparableCommand';
import { EVIDENCE_CAPTURE_KEY, EVIDENCE_MESSAGES, parseEvidenceAnswer, type EvidenceKind } from '../support/propertyTaxEvidenceCommand';
import { evidenceCommandResult } from '../handlers/propertyTaxEvidenceCommands.handler';
import { DOCUMENT_FACTS_CAPTURE_KEY, parseDocumentFactsAnswer } from '../support/propertyTaxDocumentFactsCommand';
import { documentFactsResult } from '../handlers/propertyTaxDocumentFactsCommands.handler';
import { cdCommandResult } from '../handlers/buyerClosingDisclosureCommands.handler';
import { leCommandResult } from '../handlers/buyerLoanEstimateCommands.handler';
import { parseRefinanceCommandAnswer, refinanceFormKindFromCaptureKey, refinanceCommandResult } from '../handlers/refinanceCommands.handler';
import { setupCommandResult } from '../handlers/buyerPlanSetupCommands.handler';
import { parseSetupAnswer, setupKindFromCaptureKey } from '../support/buyerPlanSetupCommand';
import { leFormKindFromCaptureKey, parseLeAnswer } from '../support/buyerLoanEstimateCommand';
import { cdFormKindFromCaptureKey, parseCdAnswer } from '../support/buyerClosingDisclosureCommand';
import { homeRecordStateResult } from '../handlers/homeRecordStateCommands.handler';
import { homeRecordFormKindFromCaptureKey, parseHomeRecordAnswer } from '../support/homeRecordStateCommand';
import { contractFormKindFromCaptureKey, parseContractAnswer } from '../support/buyerContractCommand';
import { insuranceFormKindFromCaptureKey, parseInsuranceAnswer } from '../support/buyerInsuranceCommand';
import { closingItemKindFromCaptureKey, parseClosingItemAnswer } from '../support/buyerClosingItemCommand';
import { parseWalkthroughAnswer, walkthroughFormKindFromCaptureKey } from '../support/buyerWalkthroughCommand';
import { diyProjectNoteResult, diySkillProfileResult } from '../handlers/diyCommands.handler';
import { DIY_NOTE_CAPTURE_KEY, DIY_PROFILE_CAPTURE_KEY, parseDiyNoteAnswer, parseDiySkillProfileAnswer } from '../support/diyCommand';
import { SEASONAL_SNOOZE_CAPTURE_KEY, parseSeasonalSnoozeAnswer } from '../support/seasonalItemCommand';
import { parseWorkItemAnswer, WORK_ITEM_FORM_ERRORS, workItemFormKindFromCaptureKey } from '../support/homeWorkItemCommand';
import { NEGOTIATION_PACKAGE_CAPTURE_KEY } from '../support/inspectionReportCommand';
import { HABIT_COACH_PREFERENCES_CAPTURE_KEY, parseHabitCoachPreferencesAnswer } from '../support/habitCoachPreferencesCommand';
import { habitCoachPreferencesResult } from '../handlers/habitCoachPreferencesCommands.handler';
import { FINANCING_PROFILE_CAPTURE_KEY, parseFinancingProfileAnswer } from '../support/financingProfileCommand';
import { financingProfileCommandResult } from '../handlers/financingProfileCommands.handler';
import { SELL_HOLD_RENT_ASSUMPTIONS_CAPTURE_KEY } from '../support/sellHoldRentCommand';
import { sellHoldRentCommandResult } from '../handlers/sellHoldRentCommands.handler';
import { BRIEFING_SHARE_CAPTURE_KEY, parseBriefingShareAnswer } from '../support/homeBriefingCommand';
import { briefingShareResult } from '../handlers/homeBriefingShareCommands.handler';
import { hoaFormKindFromCaptureKey, parseHoaFormAnswer } from '../support/hoaComplianceCommand';
import { hoaAssociationEditorFormValues, validateHoaAssociationEditorAnswer } from '../support/hoaAssociationEditor';
import { hoaCommandResult } from '../handlers/hoaComplianceCommands.handler';
import { COVERAGE_DECISION_CAPTURE_KEY, parseCoverageDecisionAnswer, type CoverageCommandKind } from '../support/coverageCommand';
import { COVERAGE_QUOTE_CAPTURE_KEY, parseCoverageQuoteAnswer } from '../support/coverageQuoteCommand';
import { parseUpgradeFormAnswer, upgradeFormKindFromCaptureKey, type UpgradeCommandKind } from '../support/homeUpgradeCommand';
import { parsePermitFormAnswer, permitFormKindFromCaptureKey, type PermitCommandKind } from '../support/permitTrackerCommand';
import { buyerNegotiationKindFromCaptureKey, parseBuyerNegotiationAnswer } from '../support/negotiationShieldBuyer';
import { parsePriceFormAnswer, priceFormKindForCommand, priceFormKindFromCaptureKey, type PriceCommandKind } from '../support/priceFinalizationCommand';
import { NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY, parseNegotiationAttachAnswer } from '../support/negotiationShieldAttach';
import { renovationCaseStartContextVersion, renovationCaseStartResult } from '../handlers/renovationCaseStart.handler';
import { parseRenovationCaseStartAnswer, RENOVATION_CASE_START_CAPTURE_KEY } from '../support/renovationCaseStart';
import { plantRecommendationContextVersion, roomPlantRecommendationResult } from '../handlers/plantRecommendations.handler';
import { PLANT_RECOMMENDATIONS_CAPTURE_KEY } from '../support/plantRecommendationConstants';
import { doNothingRunContextVersion, doNothingRunResult, priceCheckVersion, servicePriceCheckResult } from '../handlers/homeToolRuns.handler';
import { DO_NOTHING_RUN_CAPTURE_KEY, SERVICE_PRICE_CHECK_CAPTURE_KEY } from '../support/homeToolRunConstants';
import { DoNothingRunInputSchema, ServicePriceCheckInputSchema } from '../support/commandInputs';
import { HomeJourneyInputSchema, PurchaseDateAnswerSchema } from '../support/commandInputs';
import { maintenanceTaskCompleteResult, maintenanceTaskCreateResult, maintenanceTaskVersion, maintenanceWorkflowVersion } from '../handlers/maintenance.handler';
import { getSkillForOperation } from '../../skills/skillRegistry';
import { ASK_OPERATION_CAPABILITY } from '../../intelligence/capabilitySkillGuidanceBridge.registry';
import { homeDeadlineMonitorResult } from '../handlers/miscHandlers.handler';
import { ownershipCostCommandResult } from '../handlers/ownershipCostCommands.handler';
import { OWNERSHIP_COST_ACTION_IDS, OWNERSHIP_COST_DECISION_CAPTURE_KEY, OWNERSHIP_COST_SCENARIO_CAPTURE_KEY } from '../support/ownershipCostConstants';
import { reserveFundCommandResult } from '../handlers/reserveFundCommands.handler';
import { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_ALLOCATION_CAPTURE_KEY, RESERVE_FUND_BALANCE_CAPTURE_KEY, RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY } from '../support/reserveFundConstants';
import { propertyBriefCommandResult, PropertyBriefPrepareInputSchema, PropertyBriefShareInputSchema } from '../handlers/propertyBriefCommands.handler';
import { PROPERTY_BRIEF_ACTION_IDS, PROPERTY_BRIEF_PREPARE_CAPTURE_KEY, PROPERTY_BRIEF_SHARE_CAPTURE_KEY } from '../support/propertyBriefConstants';
import { projectTrackerCreateContextVersion, projectTrackerCreateResult } from '../handlers/projectTracker.handler';
import { PROJECT_TRACKER_CREATE_CAPTURE_KEY } from '../support/projectTrackerConstants';
import { ENVIRONMENT_HVAC_FILTER_CAPTURE_KEY, ENVIRONMENT_HVAC_FILTER_INVALID_MESSAGES, parseEnvironmentHvacFilterAnswer } from '../support/environmentReportCommand';
import { environmentReportCommandResult } from '../handlers/environmentReportCommands.handler';

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
        suggestedNextActions: readStoredSuggestedNextActions(execution.resultJson),
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

// Capability discovery lifecycle (IW-SHELL-021): a continuation that finishes with delivered output counts for the discovery-launched turn it continues.
// Idempotent and fire-and-forget; the recorder reads the persisted status, so a continuation that is still pending emits nothing.
export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const response = await submitAskCaptureCore(userId, executionId, input);
  void recordAskCapabilityLifecycle(executionId, 'RESULT');
  return response;
}

async function submitAskCaptureCore(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
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
            suggestions: [],
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
    if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM' || execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES' || execution.operationId === 'OWNERSHIP_COST_COMMAND' || execution.operationId === 'RESERVE_FUND_COMMAND' || execution.operationId === 'QUOTE_COMPARISON_COMMAND' || execution.operationId === 'PROPERTY_BRIEF_COMMAND' || execution.operationId === 'PROJECT_TRACKER_CREATE') {
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
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: replayed.blocks, captureRequests: replayed.captureRequests ?? [], confirmation: replayed.confirmation ?? null, clarification: replayed.clarification ?? null, suggestions: replayed.suggestions, suggestedNextActionsGoverned: replayed.suggestedNextActionsGoverned === true, suggestedNextActions: replayed.suggestedNextActions ?? [], skillHandoff: replayed.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, replayed.blocks) }),
        completedAt: terminalStatus(replayed.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'CAPTURE_RESUME_RETRIED', metadataJson: asInputJson({ captureKey: input.captureKey, resumedStatus: replayed.status }) } });
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
    if (replayed.captureRequests?.some((request) => request.captureKey === input.captureKey)) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
    if (replayed.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, replayed.captureRequests.length);
    return mapPersistedExecution(resumed, await propertySummary(execution.propertyId));
  }
  if (execution.operationId !== 'PROJECT_TRACKER_CREATE' && !['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'HOUSEHOLD_INVITATION', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'ROOM_CREATE', 'PROPERTY_PURCHASE_DATE_SET', 'HOME_JOURNEY_SET', 'MATERIAL_SPEC_ADD', 'HOME_PLANT_ADD', 'ROOM_PLANT_RECOMMENDATIONS', 'DO_NOTHING_SIMULATION_RUN', 'SERVICE_PRICE_CHECK_RUN', 'INVENTORY_ITEM_CREATE', 'HOME_EVENT_RADAR_TASK', 'HOME_EVENT_RADAR_PREFERENCES', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'CLAIM_FILE', 'HOME_DEADLINE_MONITOR', 'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'OWNERSHIP_COSTS', 'OWNERSHIP_COST_COMMAND', 'RESERVE_FUND_COMMAND', 'NEGOTIATION_SHIELD_CASE_START', 'NEGOTIATION_SHIELD_CASE_UPDATE', 'NEGOTIATION_SHIELD_CASE_ATTACH', 'RENOVATION_CASE_START', 'QUOTE_COMPARISON_COMMAND', 'PROPERTY_BRIEF_COMMAND', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'COVERAGE_GAPS', 'CAPTURE_FACT_CONFIRM', 'CAPTURE_EVENT_CONFIRM', 'CAPTURE_WARRANTY_CONFIRM', 'INVENTORY_ITEM_CORRECT', 'INSPECTION_NEGOTIATION_PACKAGE'].includes(execution.operationId ?? '')
    // Registered domain commands own their capture forms (Upgrade Planner, Habit Coach settings, ...). The stored-captureRequests
    // match just below is what proves a given form is still live, so this gate must not need a hand-edited entry per command.
    && !getAskDomainCommandByOperation(execution.operationId ?? '')) {
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
    // Group B resolution-center capture slice (gap audit §17): a focused single-action turn
    // stores its OWN propertyContextFeature (buildFocusedHomeActionGuidance's `captureFeature`
    // parameter) -- when present, capture and recompute must target THAT feature, not the
    // generic HOME_ACTIONS/VIEW_FEED scope the unfocused Home Actions list evaluates.
    const homeActionsParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const focusedCaptureFeature = homeActionsParameters.captureFeature && typeof homeActionsParameters.captureFeature === 'object' && !Array.isArray(homeActionsParameters.captureFeature)
      ? homeActionsParameters.captureFeature as { featureKey?: unknown; operationKey?: unknown; operationInput?: unknown }
      : null;
    const useFocusedFeature = typeof focusedCaptureFeature?.featureKey === 'string' && typeof focusedCaptureFeature?.operationKey === 'string';
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: useFocusedFeature ? focusedCaptureFeature!.featureKey as string : 'HOME_ACTIONS',
      operationKey: useFocusedFeature ? focusedCaptureFeature!.operationKey as string : 'VIEW_FEED',
      ...(useFocusedFeature ? { operationInput: (focusedCaptureFeature!.operationInput as Record<string, unknown> | undefined) ?? {} } : {}),
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    const focusedHomeActionId = typeof homeActionsParameters.focusedHomeActionId === 'string' ? homeActionsParameters.focusedHomeActionId : null;
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
      // Re-derives the SAME focused single-action card (rather than falling back to the
      // unfocused list) the exact way the original turn was launched -- see
      // homeActions.handler.ts's `home-actions.feed` registration.
      ...(focusedHomeActionId ? { launchContext: { surface: 'ASK_CAPTURE', entityType: 'HOME_ACTION', actionId: focusedHomeActionId } } : {}),
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
      // The form was opened from a recommended-task template: keep the link through to the confirmation.
      typeof parameters.maintenanceTemplateId === 'string' ? { id: parameters.maintenanceTemplateId } : null,
      typeof parameters.maintenanceGuidanceStepId === 'string' ? parameters.maintenanceGuidanceStepId : null,
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
  } else if (execution.operationId === 'MATERIAL_SPEC_UPDATE') {
    // Shared RecordEditor submit (FRD v1.390): the answer is every editor field; the target is the material the editor was opened for.
    if (input.captureKey !== MATERIAL_SPEC_UPDATE_CAPTURE_KEY) {
      const error = new Error('This material edit is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to edit a material.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const specId = typeof storedParameters.specId === 'string' ? storedParameters.specId : null;
    const spec = specId ? await prisma.materialSpec.findFirst({ where: { id: specId, propertyId: execution.propertyId }, select: { id: true, updatedAt: true } }) : null;
    if (!spec) {
      const error = new Error('This material is no longer available. It may have been removed.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const currentVersion = createHash('sha256').update(`${spec.id}:${spec.updatedAt.toISOString()}`).digest('hex');
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This material changed while the editor was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    result = await materialSpecUpdateResult(userId, execution.propertyId, execution.message, undefined, { specId: spec.id, answer: input.answer });
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'MaterialSpec';
  } else if (execution.operationId === 'HOME_EVENT_UPDATE') {
    // Shared RecordEditor submit (FRD v1.386): the answer is every editor field; the target is the event the editor was opened for.
    if (input.captureKey !== HOME_EVENT_UPDATE_CAPTURE_KEY) {
      const error = new Error('This event edit is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const eventId = typeof storedParameters.eventId === 'string' ? storedParameters.eventId : null;
    const event = eventId ? await prisma.homeEvent.findFirst({ where: { id: eventId, propertyId: execution.propertyId, isCurrent: true, deletedAt: null }, select: { id: true, revision: true } }) : null;
    if (!event) {
      const error = new Error('This timeline event changed or was removed while the editor was open. Open it again to edit the latest version.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const currentVersion = homeEventContextVersion(event);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This timeline event changed while the editor was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    result = await homeEventUpdateResult(userId, execution.propertyId, execution.message, undefined, { eventId: event.id, answer: input.answer });
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'HomeEvent';
  } else if (execution.operationId === 'WARRANTY_UPDATE') {
    // Shared RecordEditor submit (FRD v1.385): the answer is every editor field; the target is the warranty the editor was opened for.
    if (input.captureKey !== WARRANTY_UPDATE_CAPTURE_KEY) {
      const error = new Error('This warranty edit is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const warrantyId = typeof storedParameters.warrantyId === 'string' ? storedParameters.warrantyId : null;
    const warranty = warrantyId ? await prisma.warranty.findFirst({ where: { id: warrantyId, propertyId: execution.propertyId }, select: { id: true, updatedAt: true } }) : null;
    if (!warranty) {
      const error = new Error('This warranty is no longer available. It may have been deleted.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const currentVersion = warrantyContextVersion(warranty);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This warranty changed while the editor was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    result = await warrantyUpdateResult(userId, execution.propertyId, execution.message, undefined, { warrantyId: warranty.id, answer: input.answer });
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'Warranty';
  } else if (execution.operationId === 'PROPERTY_PURCHASE_DATE_SET' || execution.operationId === 'HOME_JOURNEY_SET') {
    const purchaseDate = execution.operationId === 'PROPERTY_PURCHASE_DATE_SET';
    if (input.captureKey !== (purchaseDate ? PURCHASE_DATE_CAPTURE_KEY : HOME_JOURNEY_CAPTURE_KEY)) {
      const error = new Error('This capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error(purchaseDate ? 'A contributor or owner is required to record the purchase date.' : 'A contributor or owner is required to confirm how the home is used.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = purchaseDate ? await purchaseDateContextVersion(execution.propertyId) : await homeJourneyContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error(purchaseDate ? 'The purchase date changed while this form was open. Start again from the Add purchase date button.' : 'The home journey changed while this form was open. Start again from the Confirm home journey button.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = purchaseDate ? PurchaseDateAnswerSchema.safeParse(input.answer) : HomeJourneyInputSchema.safeParse(input.answer);
    if (!answer.success) {
      const error = new Error(purchaseDate ? 'Enter a real date on or before today.' : 'Choose one of the listed options.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const sourceExecutionId = typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null;
    result = purchaseDate
      ? await purchaseDateResult(userId, execution.propertyId, answer.data as { purchaseDate: string }, sourceExecutionId)
      : await homeJourneyResult(userId, execution.propertyId, answer.data as { ownershipState: string }, sourceExecutionId);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = purchaseDate ? 'PropertyFinancingProfile' : 'PropertyOnboarding';
  } else if (execution.operationId === 'PROJECT_TRACKER_CREATE') {
    if (input.captureKey !== PROJECT_TRACKER_CREATE_CAPTURE_KEY) {
      throw Object.assign(new Error('This capture is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      throw Object.assign(new Error('A contributor or owner is required to start a project.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    const currentVersion = await projectTrackerCreateContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      throw Object.assign(new Error('The project list changed while this form was open. Start again from the Project Tracker answer.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    const answer = ProjectTrackerCreateInputSchema.safeParse(input.answer);
    if (!answer.success) {
      throw Object.assign(new Error(answer.error.issues[0]?.message ?? 'Complete the required project details.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    result = await projectTrackerCreateResult(userId, execution.propertyId, answer.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null, typeof storedParameters.guidanceStepId === 'string' ? storedParameters.guidanceStepId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'ProjectRecord';
  } else if (execution.operationId === 'MATERIAL_SPEC_ADD' || execution.operationId === 'HOME_PLANT_ADD') {
    const material = execution.operationId === 'MATERIAL_SPEC_ADD';
    if (input.captureKey !== (material ? MATERIAL_SPEC_CAPTURE_KEY : HOME_PLANT_CAPTURE_KEY)) {
      const error = new Error('This capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error(material ? 'A contributor or owner is required to record a material.' : 'A contributor or owner is required to add a plant.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = material ? await materialSpecContextVersion(execution.propertyId) : await homePlantContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('The rooms in this home changed while this form was open. Start again from the button on the answer.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    // A material's answer is validated against its category's server-owned editor fields inside materialSpecAddResult (type first, then the rest).
    const answer = material ? { success: true as const, data: input.answer } : HomePlantAddInputSchema.safeParse(input.answer);
    if (!answer.success) {
      const error = new Error('Enter the plant and choose its room.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const sourceExecutionId = typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null;
    result = material
      ? await materialSpecAddResult(userId, execution.propertyId, answer.data, sourceExecutionId)
      : await homePlantAddResult(userId, execution.propertyId, answer.data as ReturnType<typeof HomePlantAddInputSchema.parse>, sourceExecutionId);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = material ? 'MaterialSpec' : 'HomePlant';
  } else if (execution.operationId === 'HOME_DIGITAL_WILL_CREATE') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.homeDigitalWillMetadataLaunch && typeof storedParameters.homeDigitalWillMetadataLaunch === 'object' && !Array.isArray(storedParameters.homeDigitalWillMetadataLaunch)
      ? storedParameters.homeDigitalWillMetadataLaunch as { planId?: unknown } : null;
    const service = new (await import('../../homeDigitalWill.service')).HomeDigitalWillService();
    const plan = await service.getByProperty(execution.propertyId);
    const editor = storedParameters.homeDigitalWillEditorLaunch && typeof storedParameters.homeDigitalWillEditorLaunch === 'object' && !Array.isArray(storedParameters.homeDigitalWillEditorLaunch) ? storedParameters.homeDigitalWillEditorLaunch as { kind?: unknown; entityId?: unknown } : null;
    if (input.captureKey === HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY && launch && typeof launch.planId === 'string') {
      const currentVersion = plan ? createHash('sha256').update(`home-digital-will-metadata:${plan.id}:${plan.updatedAt.toISOString()}`).digest('hex') : null;
      if (!currentVersion || currentVersion !== input.expectedContextVersion) throw Object.assign(new Error('The plan changed while the form was open. Open Edit details again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      const parsed = HomeDigitalWillMetadataInputSchema.safeParse(input.answer);
      if (!parsed.success || (parsed.data.lastReviewedAt && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.lastReviewedAt))) throw Object.assign(new Error('Check the title, status, readiness and review date.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await homeDigitalWillMetadataResult(userId, execution.propertyId, launch.planId, parsed.data); capturedContextVersion = currentVersion;
    } else if (input.captureKey === HOME_DIGITAL_WILL_EDITOR_CAPTURE_KEY && editor && typeof editor.kind === 'string' && ['ENTRY_CREATE', 'ENTRY_EDIT', 'CONTACT_CREATE', 'CONTACT_CREATE_REACHABLE', 'CONTACT_EDIT', 'SECTION_CREATE', 'SECTION_EDIT'].includes(editor.kind)) {
      if (!plan || homeDigitalWillPlanVersion(plan) !== input.expectedContextVersion) throw Object.assign(new Error('The plan changed while the form was open. Open the editor again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      const schema = editor.kind.startsWith('ENTRY_') ? HomeDigitalWillEntryInputSchema : editor.kind.startsWith('CONTACT_') ? HomeDigitalWillContactInputSchema : HomeDigitalWillSectionInputSchema;
      const parsed = schema.safeParse(input.answer); if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? 'Check the required fields and formats.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await homeDigitalWillEditorResult(userId, execution.propertyId, editor.kind as HomeDigitalWillEditorKind, typeof editor.entityId === 'string' ? editor.entityId : null, parsed.data); capturedContextVersion = input.expectedContextVersion;
    } else throw Object.assign(new Error('This Home Continuity Plan form is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    captureId = input.idempotencyKey; canonicalOwner = 'HomeDigitalWill';
  } else if (execution.operationId === 'NEGOTIATION_SHIELD_CASE_START') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const startLaunch = storedParameters.negotiationStartLaunch && typeof storedParameters.negotiationStartLaunch === 'object' && !Array.isArray(storedParameters.negotiationStartLaunch)
      ? storedParameters.negotiationStartLaunch as { scenarioType?: unknown; sourceExecutionId?: unknown; guidanceStepId?: unknown }
      : null;
    if (input.captureKey !== NEGOTIATION_SHIELD_START_CAPTURE_KEY || !startLaunch || !isNegotiationStartScenario(startLaunch.scenarioType)) {
      const error = new Error('This review form is no longer active. Start again from Start a review.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to start a negotiation review.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = negotiationShieldStartContextVersion(execution.propertyId, startLaunch.scenarioType);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This review form is out of date. Start again from Start a review.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = parseNegotiationStartAnswer(startLaunch.scenarioType, input.answer);
    if (!answer.success) {
      const error = new Error(answer.reason === 'NO_DETAIL'
        ? 'Enter at least one detail about the quote, notice or settlement, then continue.'
        : 'Give the review a name of up to 160 characters and check the amounts and dates.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await negotiationShieldStartResult(userId, execution.propertyId, {
      scenarioType: startLaunch.scenarioType,
      sourceExecutionId: typeof startLaunch.sourceExecutionId === 'string' ? startLaunch.sourceExecutionId : null,
      guidanceStepId: typeof startLaunch.guidanceStepId === 'string' ? startLaunch.guidanceStepId : null,
    }, answer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'NegotiationShieldCase';
  } else if (execution.operationId === 'NEGOTIATION_SHIELD_CASE_UPDATE') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const editLaunch = storedParameters.negotiationEditLaunch && typeof storedParameters.negotiationEditLaunch === 'object' && !Array.isArray(storedParameters.negotiationEditLaunch)
      ? storedParameters.negotiationEditLaunch as { caseId?: unknown; scenarioType?: unknown; sourceExecutionId?: unknown }
      : null;
    if (input.captureKey !== NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY || !editLaunch || typeof editLaunch.caseId !== 'string' || !isNegotiationEditScenario(editLaunch.scenarioType)) {
      const error = new Error('This details form is no longer active. Open Edit details again.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to edit a negotiation review.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const editSpec = NEGOTIATION_EDIT_SCENARIO_SPECS[editLaunch.scenarioType];
    const editable = await getNegotiationShieldEditableInputForProperty(execution.propertyId, editLaunch.caseId, editSpec.inputType, editSpec.fields.map((field) => field.key));
    const currentVersion = editable ? negotiationShieldEditContextVersion(editable.case.id, editable.inputId, editable.inputUpdatedAt) : null;
    if (!currentVersion || currentVersion !== input.expectedContextVersion) {
      const error = new Error('The details of this review changed while the form was open. Open Edit details again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = parseNegotiationEditAnswer(editLaunch.scenarioType, input.answer);
    if (!answer.success) {
      const error = new Error('Check the amounts and dates, and keep notes to 1000 characters.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await negotiationShieldEditResult(userId, execution.propertyId, {
      caseId: editLaunch.caseId,
      sourceExecutionId: typeof editLaunch.sourceExecutionId === 'string' ? editLaunch.sourceExecutionId : null,
    }, answer.values);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'NegotiationShieldInput';
  } else if (execution.operationId === 'NEGOTIATION_SHIELD_CASE_ATTACH') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const attachLaunch = storedParameters.negotiationAttachLaunch && typeof storedParameters.negotiationAttachLaunch === 'object' && !Array.isArray(storedParameters.negotiationAttachLaunch)
      ? storedParameters.negotiationAttachLaunch as { caseId?: unknown; scenarioType?: unknown; sourceExecutionId?: unknown }
      : null;
    if (input.captureKey !== NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY || !attachLaunch || typeof attachLaunch.caseId !== 'string' || !isNegotiationEditScenario(attachLaunch.scenarioType)) {
      const error = new Error('This attach form is no longer active. Open Attach a document again.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to attach a document to a negotiation review.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const offer = await negotiationShieldAttachOffer(execution.propertyId, access.role, attachLaunch.caseId);
    if (!offer || offer.contextVersion !== input.expectedContextVersion) {
      const error = new Error('The records you can attach changed while the form was open. Open Attach a document again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = parseNegotiationAttachAnswer(attachLaunch.scenarioType, input.answer);
    if (!answer.success) {
      const error = new Error('Choose what the document is and which record to attach.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await negotiationShieldAttachResult(userId, execution.propertyId, {
      caseId: attachLaunch.caseId,
      sourceExecutionId: typeof attachLaunch.sourceExecutionId === 'string' ? attachLaunch.sourceExecutionId : null,
    }, answer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = offer.contextVersion;
    canonicalOwner = 'NegotiationShieldDocument';
  } else if (execution.operationId === 'GUIDANCE_STEP_DECLARE') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const declareLaunch = storedParameters.guidanceDeclareLaunch && typeof storedParameters.guidanceDeclareLaunch === 'object' && !Array.isArray(storedParameters.guidanceDeclareLaunch)
      ? storedParameters.guidanceDeclareLaunch as { stepId?: unknown; sourceExecutionId?: unknown }
      : null;
    if (input.captureKey !== GUIDANCE_STEP_DECLARE_CAPTURE_KEY || !declareLaunch || typeof declareLaunch.stepId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Open the step again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const declareAnswer = GuidanceStepDeclareAnswerSchema.safeParse(input.answer);
    if (!declareAnswer.success) throw Object.assign(new Error('Choose one of the options.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await guidanceStepDeclareResult(userId, execution.propertyId, GUIDANCE_STEP_DECLARE_MESSAGE,
      { operationId: 'GUIDANCE_STEP_DECLARE', entityType: 'GUIDANCE_STEP', entityId: declareLaunch.stepId, sourceExecutionId: typeof declareLaunch.sourceExecutionId === 'string' ? declareLaunch.sourceExecutionId : undefined } as never,
      declareAnswer.data.declarationKey);
    captureId = input.idempotencyKey;
    capturedContextVersion = input.expectedContextVersion;
    canonicalOwner = 'GuidanceManualDeclaration';
  } else if (execution.operationId === 'MAINTENANCE_EVIDENCE_ATTACH') {
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const evidenceLaunch = storedParameters.maintenanceEvidenceLaunch && typeof storedParameters.maintenanceEvidenceLaunch === 'object' && !Array.isArray(storedParameters.maintenanceEvidenceLaunch)
      ? storedParameters.maintenanceEvidenceLaunch as { stepId?: unknown; taskId?: unknown; sourceExecutionId?: unknown }
      : null;
    const linkLaunch = storedParameters.maintenanceLinkLaunch && typeof storedParameters.maintenanceLinkLaunch === 'object' && !Array.isArray(storedParameters.maintenanceLinkLaunch)
      ? storedParameters.maintenanceLinkLaunch as { stepId?: unknown; sourceExecutionId?: unknown }
      : null;
    if (input.captureKey === MAINTENANCE_LINK_CAPTURE_KEY && linkLaunch && typeof linkLaunch.stepId === 'string') {
      const linkAccess = await ensurePropertyAccess(userId, execution.propertyId);
      if (linkAccess.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to link a task.'), { code: 'ASK_PERMISSION_REQUIRED' });
      const linkAnswer = MaintenanceLinkAnswerSchema.safeParse(input.answer);
      if (!linkAnswer.success) throw Object.assign(new Error('Choose a task.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await maintenanceTaskLinkResult(userId, execution.propertyId, { stepId: linkLaunch.stepId, sourceExecutionId: typeof linkLaunch.sourceExecutionId === 'string' ? linkLaunch.sourceExecutionId : null }, linkAnswer.data);
      if (typeof result.contextVersion === 'string' && input.expectedContextVersion !== result.contextVersion) {
        throw Object.assign(new Error('Your tasks changed while this form was open. Choose Use an existing task again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      }
      captureId = input.idempotencyKey;
      capturedContextVersion = input.expectedContextVersion;
      canonicalOwner = 'GuidanceStepMaintenanceTaskLink';
    } else {
    if (input.captureKey !== MAINTENANCE_EVIDENCE_CAPTURE_KEY || !evidenceLaunch || typeof evidenceLaunch.taskId !== 'string') {
      throw Object.assign(new Error('This evidence form is no longer active. Open Attach evidence again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      throw Object.assign(new Error('A contributor or owner is required to attach evidence.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    const evidenceTask = await prisma.propertyMaintenanceTask.findFirst({ where: { id: evidenceLaunch.taskId, propertyId: execution.propertyId }, select: { id: true, updatedAt: true } });
    if (!evidenceTask || evidenceContextVersion(evidenceTask) !== input.expectedContextVersion) {
      throw Object.assign(new Error('The task changed while this form was open. Open Attach evidence again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    const answer = MaintenanceEvidenceAnswerSchema.safeParse(input.answer);
    if (!answer.success) {
      throw Object.assign(new Error('Choose at least one Home Record as evidence.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await maintenanceEvidenceAttachResult(userId, execution.propertyId, {
      stepId: typeof evidenceLaunch.stepId === 'string' ? evidenceLaunch.stepId : null,
      taskId: evidenceLaunch.taskId,
      sourceExecutionId: typeof evidenceLaunch.sourceExecutionId === 'string' ? evidenceLaunch.sourceExecutionId : null,
    }, answer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyMaintenanceTaskEvidence';
    }
  } else if (execution.operationId === 'RENOVATION_CASE_START') {
    if (input.captureKey !== RENOVATION_CASE_START_CAPTURE_KEY) {
      const error = new Error('This renovation case form is no longer active. Ask to start a renovation case again.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to start a renovation case.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = renovationCaseStartContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This renovation case form is out of date. Ask to start a renovation case again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = parseRenovationCaseStartAnswer(input.answer);
    if (!answer.success) {
      const error = new Error(answer.reason === 'DATES'
        ? 'The finish date must be on or after the start date.'
        : 'Give the case a name, choose the kind of work, and check the budget and dates.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const startLaunch = storedParameters.renovationCaseStartLaunch && typeof storedParameters.renovationCaseStartLaunch === 'object' && !Array.isArray(storedParameters.renovationCaseStartLaunch)
      ? storedParameters.renovationCaseStartLaunch as { sourceExecutionId?: unknown }
      : null;
    result = await renovationCaseStartResult(userId, execution.propertyId, {
      sourceExecutionId: typeof startLaunch?.sourceExecutionId === 'string' ? startLaunch.sourceExecutionId : null,
    }, answer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'RenovationCase';
  } else if (execution.operationId === 'DO_NOTHING_SIMULATION_RUN' || execution.operationId === 'SERVICE_PRICE_CHECK_RUN') {
    const simulation = execution.operationId === 'DO_NOTHING_SIMULATION_RUN';
    if (input.captureKey !== (simulation ? DO_NOTHING_RUN_CAPTURE_KEY : SERVICE_PRICE_CHECK_CAPTURE_KEY)) {
      const error = new Error('This capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error(simulation ? 'A contributor or owner is required to run the simulation.' : 'A contributor or owner is required to check a quote.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = simulation ? await doNothingRunContextVersion(userId, execution.propertyId) : priceCheckVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This form is out of date. Start again from the button on the answer.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = simulation ? DoNothingRunInputSchema.safeParse(input.answer) : ServicePriceCheckInputSchema.safeParse(input.answer);
    if (!answer.success) {
      const error = new Error(simulation ? 'Choose 6, 12, 24 or 36 months.' : 'Choose a service and enter a quote amount greater than zero and up to $250,000.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const sourceExecutionId = typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null;
    const guidanceStepId = typeof storedParameters.guidanceStepId === 'string' ? storedParameters.guidanceStepId : null;
    result = simulation
      ? await doNothingRunResult(userId, execution.propertyId, answer.data as ReturnType<typeof DoNothingRunInputSchema.parse>, sourceExecutionId, guidanceStepId)
      : await servicePriceCheckResult(userId, execution.propertyId, answer.data as ReturnType<typeof ServicePriceCheckInputSchema.parse>, sourceExecutionId, guidanceStepId);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = simulation ? 'DoNothingSimulationRun' : 'ServiceRadarCheck';
  } else if (execution.operationId === 'ROOM_PLANT_RECOMMENDATIONS') {
    if (input.captureKey !== PLANT_RECOMMENDATIONS_CAPTURE_KEY) {
      const error = new Error('This capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to generate plant recommendations.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await plantRecommendationContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('The rooms or Plant Advisor profiles changed while this form was open. Start again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const answer = RoomPlantRecommendationInputSchema.safeParse(input.answer);
    if (!answer.success) {
      const error = new Error('Choose a room and its light level, then review the other preferences.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await roomPlantRecommendationResult(userId, execution.propertyId, answer.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'RoomPlantProfile';
  } else if (execution.operationId === 'OWNERSHIP_COST_COMMAND') {
    if (input.captureKey !== OWNERSHIP_COST_SCENARIO_CAPTURE_KEY && input.captureKey !== OWNERSHIP_COST_DECISION_CAPTURE_KEY) {
      const error = new Error('This ownership-cost form is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to change ownership-cost planning records.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    if (input.expectedContextVersion !== 'ownership-cost-live') {
      const error = new Error('This ownership-cost form is out of date. Start again from the action on the answer.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.ownershipCostLaunch && typeof storedParameters.ownershipCostLaunch === 'object' && !Array.isArray(storedParameters.ownershipCostLaunch)
      ? storedParameters.ownershipCostLaunch as { actionId?: string; entityId?: string; entityType?: string; sourceExecutionId?: string }
      : null;
    if (!launch?.actionId) {
      const error = new Error('This ownership-cost action is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    if (input.captureKey === OWNERSHIP_COST_SCENARIO_CAPTURE_KEY) {
      if (launch.actionId === OWNERSHIP_COST_ACTION_IDS.CREATE_SCENARIO) {
        const answer = OwnershipCostScenarioInputSchema.safeParse(input.answer);
        if (!answer.success) throw Object.assign(new Error('Name the scenario and choose a valid lens, horizon, category, and bounded assumption.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
        result = await ownershipCostCommandResult(userId, execution.propertyId, launch, { kind: 'SCENARIO', value: answer.data });
      } else if (launch.actionId === OWNERSHIP_COST_ACTION_IDS.RENAME_SCENARIO) {
        const answer = OwnershipCostScenarioRenameInputSchema.safeParse(input.answer);
        if (!answer.success) throw Object.assign(new Error('Enter a scenario name between 1 and 80 characters.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
        result = await ownershipCostCommandResult(userId, execution.propertyId, launch, { kind: 'RENAME', value: answer.data });
      } else {
        throw Object.assign(new Error('This ownership-cost scenario form is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
      }
    } else {
      const answer = OwnershipCostDecisionInputSchema.safeParse(input.answer);
      if (!answer.success) throw Object.assign(new Error('Enter the requested reason or a valid revisit date.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await ownershipCostCommandResult(userId, execution.propertyId, launch, { kind: 'DECISION', value: answer.data });
    }
    captureId = input.idempotencyKey;
    capturedContextVersion = 'ownership-cost-live';
    canonicalOwner = 'OwnershipCostPlanning';
  } else if (execution.operationId === 'RESERVE_FUND_COMMAND') {
    if (![RESERVE_FUND_CONTRIBUTION_CAPTURE_KEY, RESERVE_FUND_BALANCE_CAPTURE_KEY, RESERVE_FUND_ALLOCATION_CAPTURE_KEY].includes(input.captureKey) || input.expectedContextVersion !== 'reserve-fund-live') {
      throw Object.assign(new Error('This reserve-fund form is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the Reserve Fund.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.reserveFundLaunch && typeof storedParameters.reserveFundLaunch === 'object' && !Array.isArray(storedParameters.reserveFundLaunch) ? storedParameters.reserveFundLaunch as { actionId?: string; entityId?: string; sourceExecutionId?: string } : null;
    if (input.captureKey === RESERVE_FUND_ALLOCATION_CAPTURE_KEY) {
      if (launch?.actionId !== RESERVE_FUND_ACTION_IDS.CONFIRM_ALLOCATION || !launch.entityId) throw Object.assign(new Error('This reserve-fund action is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
      const allocationAnswer = z.object({ monthlyDollars: z.coerce.number().min(0.01).max(1_000_000) }).strict().safeParse(input.answer);
      if (!allocationAnswer.success) throw Object.assign(new Error('Enter a monthly amount greater than zero.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await reserveFundCommandResult(userId, execution.propertyId, launch, undefined, null, null, null, Math.round(allocationAnswer.data.monthlyDollars * 100));
      captureId = input.idempotencyKey;
      capturedContextVersion = 'reserve-fund-live';
      canonicalOwner = 'HomeReserveFundLineItem';
    } else if (input.captureKey === RESERVE_FUND_BALANCE_CAPTURE_KEY) {
      if (launch?.actionId !== RESERVE_FUND_ACTION_IDS.SET_BALANCE) throw Object.assign(new Error('This reserve-fund action is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
      const balanceAnswer = z.object({ targetDollars: z.coerce.number().min(0).max(100_000_000), note: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()) }).strict().safeParse(input.answer);
      if (!balanceAnswer.success) throw Object.assign(new Error('Enter the balance as a dollar amount of zero or more.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await reserveFundCommandResult(userId, execution.propertyId, launch, undefined, null, { targetDollars: balanceAnswer.data.targetDollars, note: balanceAnswer.data.note ?? null });
      captureId = input.idempotencyKey;
      capturedContextVersion = 'reserve-fund-live';
      canonicalOwner = 'HomeReserveFundContribution';
    } else {
    if (launch?.actionId !== RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION) throw Object.assign(new Error('This reserve-fund action is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const answer = ReserveFundContributionInputSchema.safeParse(input.answer);
    if (!answer.success) throw Object.assign(new Error('Choose a valid entry type and enter a positive amount.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await reserveFundCommandResult(userId, execution.propertyId, launch, answer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = 'reserve-fund-live';
    canonicalOwner = 'HomeReserveFundContribution';
    }
  } else if (execution.operationId === 'QUOTE_COMPARISON_COMMAND') {
    const formKind = quoteFormKindFromCaptureKey(input.captureKey);
    if (!formKind) {
      throw Object.assign(new Error('This quote form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change a quote comparison.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const quoteLaunch = storedParameters.quoteCommandLaunch && typeof storedParameters.quoteCommandLaunch === 'object' && !Array.isArray(storedParameters.quoteCommandLaunch)
      ? storedParameters.quoteCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    // The form must be the one the stored launch opened (an Add form cannot be replayed as a Change, nor the reverse).
    if (!quoteLaunch || quoteLaunch.kind !== formKind || typeof quoteLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This quote form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const quoteAnswer = parseQuoteFormAnswer(formKind, input.answer);
    if (!quoteAnswer.success) {
      throw Object.assign(new Error(quoteAnswer.reason === 'DATES' ? 'The quote cannot expire before its date.' : 'Check the details: a provider and a total are needed, and answers cannot be empty.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await quoteCommandResult(userId, execution.propertyId, {
      kind: formKind, entityId: quoteLaunch.entityId, sourceExecutionId: typeof quoteLaunch.sourceExecutionId === 'string' ? quoteLaunch.sourceExecutionId : null,
    }, quoteAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'QuoteComparison';
  } else if (execution.operationId === 'PRICE_FINALIZATION_COMMAND') {
    const priceForm = priceFormKindFromCaptureKey(input.captureKey);
    if (!priceForm) throw Object.assign(new Error('This price form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to record a price.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const priceLaunch = storedParameters.priceCommandLaunch && typeof storedParameters.priceCommandLaunch === 'object' && !Array.isArray(storedParameters.priceCommandLaunch)
      ? storedParameters.priceCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown; guidanceStepId?: unknown } : null;
    // The form must be the one the stored launch opened (a start form cannot be replayed as a finalize, nor the reverse).
    if (!priceLaunch || typeof priceLaunch.kind !== 'string' || typeof priceLaunch.entityId !== 'string'
      || priceFormKindForCommand(priceLaunch.kind as PriceCommandKind) !== priceForm) {
      throw Object.assign(new Error('This price form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const priceAnswer = parsePriceFormAnswer(priceForm, input.answer);
    if (!priceAnswer.success) {
      throw Object.assign(new Error(priceAnswer.reason === 'VENDOR_REQUIRED' ? 'Enter the vendor to start a price record.' : 'Check the prices and terms: an accepted price must be more than zero.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await priceCommandResult(userId, execution.propertyId, {
      kind: priceLaunch.kind as PriceCommandKind, entityId: priceLaunch.entityId, sourceExecutionId: typeof priceLaunch.sourceExecutionId === 'string' ? priceLaunch.sourceExecutionId : null,
      guidanceStepId: typeof priceLaunch.guidanceStepId === 'string' ? priceLaunch.guidanceStepId : null,
    }, priceAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PriceFinalization';
  } else if (execution.operationId === 'NEGOTIATION_SHIELD_BUYER_COMMAND') {
    const buyerForm = buyerNegotiationKindFromCaptureKey(input.captureKey);
    if (!buyerForm) throw Object.assign(new Error('This negotiation form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change a negotiation.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const buyerLaunch = storedParameters.buyerNegotiationLaunch && typeof storedParameters.buyerNegotiationLaunch === 'object' && !Array.isArray(storedParameters.buyerNegotiationLaunch)
      ? storedParameters.buyerNegotiationLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!buyerLaunch || buyerLaunch.kind !== buyerForm || typeof buyerLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This negotiation form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const buyerAnswer = parseBuyerNegotiationAnswer(buyerForm, input.answer);
    if (!buyerAnswer.success) {
      throw Object.assign(new Error(buyerAnswer.reason === 'CREDIT_REQUIRED' ? 'Enter the credit the seller agreed to.' : 'Check the form: choose what you are asking for or the seller\u2019s response and outcome.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await buyerNegotiationResult(userId, execution.propertyId, {
      kind: buyerForm, entityId: buyerLaunch.entityId, sourceExecutionId: typeof buyerLaunch.sourceExecutionId === 'string' ? buyerLaunch.sourceExecutionId : null,
    }, buyerAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'NegotiationShieldBuyer';
  } else if (execution.operationId === 'PERMIT_TRACKER_COMMAND') {
    const permitForm = permitFormKindFromCaptureKey(input.captureKey);
    if (!permitForm) throw Object.assign(new Error('This permit form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change permit records.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const permitLaunch = storedParameters.permitCommandLaunch && typeof storedParameters.permitCommandLaunch === 'object' && !Array.isArray(storedParameters.permitCommandLaunch)
      ? storedParameters.permitCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    // The form must be the one the stored launch opened (an Add form cannot be replayed as a Change, nor the reverse).
    if (!permitLaunch || permitLaunch.kind !== permitForm || typeof permitLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This permit form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const permitAnswer = parsePermitFormAnswer(input.answer);
    if (!permitAnswer.success) {
      throw Object.assign(new Error(permitAnswer.reason === 'DATES' ? 'The dates must be in order: applied, then issued, then expires.' : 'Choose the kind of permit and the work, and check the dates and cost.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await permitCommandResult(userId, execution.propertyId, {
      kind: permitLaunch.kind as PermitCommandKind, entityId: permitLaunch.entityId, sourceExecutionId: typeof permitLaunch.sourceExecutionId === 'string' ? permitLaunch.sourceExecutionId : null,
    }, permitAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PermitTracker';
  } else if (execution.operationId === 'HOME_UPGRADE_COMMAND') {
    const upgradeForm = upgradeFormKindFromCaptureKey(input.captureKey);
    if (!upgradeForm) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change an upgrade option.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const upgradeLaunch = storedParameters.homeUpgradeLaunch && typeof storedParameters.homeUpgradeLaunch === 'object' && !Array.isArray(storedParameters.homeUpgradeLaunch)
      ? storedParameters.homeUpgradeLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    // The form must be the one the stored launch opened (a decision form cannot be replayed as a rename, nor the reverse).
    if (!upgradeLaunch || upgradeLaunch.kind !== upgradeForm || typeof upgradeLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const upgradeAnswer = parseUpgradeFormAnswer(upgradeForm, input.answer);
    if (!upgradeAnswer.success) {
      throw Object.assign(new Error(upgradeAnswer.reason === 'REASON_REQUIRED' ? 'Say why you are deferring or rejecting this option.' : 'Check the form: choose a decision or give the option a name.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await upgradeCommandResult(userId, execution.propertyId, {
      kind: upgradeLaunch.kind as UpgradeCommandKind, entityId: upgradeLaunch.entityId, sourceExecutionId: typeof upgradeLaunch.sourceExecutionId === 'string' ? upgradeLaunch.sourceExecutionId : null,
    }, upgradeAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HomeDigitalTwinScenario';
  } else if (execution.operationId === 'COVERAGE_COMMAND') {
    const coverageQuoteForm = input.captureKey === COVERAGE_QUOTE_CAPTURE_KEY;
    if (input.captureKey !== COVERAGE_DECISION_CAPTURE_KEY && !coverageQuoteForm) throw Object.assign(new Error('This coverage form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change coverage records.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const coverageLaunch = storedParameters.coverageCommandLaunch && typeof storedParameters.coverageCommandLaunch === 'object' && !Array.isArray(storedParameters.coverageCommandLaunch)
      ? storedParameters.coverageCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown; guidanceStepId?: unknown } : null;
    if (!coverageLaunch || coverageLaunch.kind !== (coverageQuoteForm ? 'ADD_QUOTE' : 'DECIDE') || typeof coverageLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This coverage form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const coverageLaunchArg = {
      kind: coverageLaunch.kind as CoverageCommandKind, entityId: coverageLaunch.entityId, sourceExecutionId: typeof coverageLaunch.sourceExecutionId === 'string' ? coverageLaunch.sourceExecutionId : null,
      guidanceStepId: typeof coverageLaunch.guidanceStepId === 'string' ? coverageLaunch.guidanceStepId : null,
    };
    if (coverageQuoteForm) {
      const quoteAnswer = parseCoverageQuoteAnswer(input.answer);
      if (!quoteAnswer.success) {
        throw Object.assign(new Error(quoteAnswer.reason === 'NO_FACTS' ? 'Enter at least one value from the quote.' : 'Check the form: choose the document and name the option.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      }
      result = await coverageCommandResult(userId, execution.propertyId, coverageLaunchArg, undefined, quoteAnswer.data);
    } else {
      const coverageAnswer = parseCoverageDecisionAnswer(input.answer);
      if (!coverageAnswer.success) {
        throw Object.assign(new Error(coverageAnswer.reason === 'OPTION_REQUIRED' ? 'Choose the option you would switch to.' : 'Choose what you want to do about your coverage.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      }
      result = await coverageCommandResult(userId, execution.propertyId, coverageLaunchArg, coverageAnswer.data);
    }
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'CoverageComparison';
  } else if (execution.operationId === 'CAPITAL_TIMELINE_COMMAND') {
    if (input.captureKey !== CAPITAL_ADJUST_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to adjust the capital timeline.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const capitalLaunch = storedParameters.capitalCommandLaunch && typeof storedParameters.capitalCommandLaunch === 'object' && !Array.isArray(storedParameters.capitalCommandLaunch)
      ? storedParameters.capitalCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!capitalLaunch || capitalLaunch.kind !== 'ADD' || typeof capitalLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const capitalAnswer = parseCapitalAdjustAnswer(input.answer);
    if (!capitalAnswer.success) {
      const message = capitalAnswer.reason === 'ITEM_REQUIRED' ? 'Choose the item this applies to.'
        : capitalAnswer.reason === 'ORDER' ? 'The end must be on or after the start, and the highest cost not below the lowest.'
          : capitalAnswer.reason === 'FIELDS_REQUIRED' ? 'Fill in the fields for the adjustment you chose.' : 'Check the form and try again.';
      throw Object.assign(new Error(message), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await capitalCommandResult(userId, execution.propertyId, {
      kind: 'ADD', entityId: capitalLaunch.entityId, sourceExecutionId: typeof capitalLaunch.sourceExecutionId === 'string' ? capitalLaunch.sourceExecutionId : null,
    }, capitalAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HomeCapitalTimeline';
  } else if (execution.operationId === 'STATUS_BOARD_COMMAND') {
    if (input.captureKey !== STATUS_BOARD_CORRECT_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the status board.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const boardLaunch = storedParameters.statusBoardCommandLaunch && typeof storedParameters.statusBoardCommandLaunch === 'object' && !Array.isArray(storedParameters.statusBoardCommandLaunch)
      ? storedParameters.statusBoardCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!boardLaunch || boardLaunch.kind !== 'CORRECT' || typeof boardLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const boardAnswer = parseStatusBoardCorrectAnswer(input.answer);
    if (!boardAnswer.success) {
      throw Object.assign(new Error(boardAnswer.reason === 'NOTHING' ? 'Fill in at least one thing to change.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await statusBoardCommandResult(userId, execution.propertyId, {
      kind: 'CORRECT', entityId: boardLaunch.entityId, sourceExecutionId: typeof boardLaunch.sourceExecutionId === 'string' ? boardLaunch.sourceExecutionId : null,
    }, boardAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HomeItemStatus';
  } else if (execution.operationId === 'PROPERTY_TAX_APPEAL_COMMAND') {
    const appealKind = appealFormKindFromCaptureKey(input.captureKey);
    if (!appealKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the appeal.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const appealLaunch = storedParameters.propertyTaxAppealLaunch && typeof storedParameters.propertyTaxAppealLaunch === 'object' && !Array.isArray(storedParameters.propertyTaxAppealLaunch)
      ? storedParameters.propertyTaxAppealLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!appealLaunch || appealLaunch.kind !== appealKind || typeof appealLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const appealAnswer = parseAppealFormAnswer(appealKind, input.answer);
    if (!appealAnswer.success) {
      throw Object.assign(new Error(appealAnswer.reason === 'FUTURE' ? 'That date cannot be in the future.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await appealCommandResult(userId, execution.propertyId, {
      kind: appealKind, entityId: appealLaunch.entityId, sourceExecutionId: typeof appealLaunch.sourceExecutionId === 'string' ? appealLaunch.sourceExecutionId : null,
    }, appealAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyTaxAppealCase';
  } else if (execution.operationId === 'SAVINGS_BENEFIT_COMMAND') {
    if (input.captureKey !== SAVINGS_OUTCOME_CAPTURE_KEY && input.captureKey !== SAVINGS_RECURRING_PLAN_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change savings records.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const savingsLaunch = storedParameters.savingsCommandLaunch && typeof storedParameters.savingsCommandLaunch === 'object' && !Array.isArray(storedParameters.savingsCommandLaunch)
      ? storedParameters.savingsCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (input.captureKey === SAVINGS_RECURRING_PLAN_CAPTURE_KEY) {
      // The recurring-cost plan form: the category comes from the stored launch, never from the answer.
      if (!savingsLaunch || savingsLaunch.kind !== 'PLAN' || !isSavingsRecurringCategory(savingsLaunch.entityId)) {
        throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
      }
      const planAnswer = parseSavingsPlanAnswer(savingsLaunch.entityId, input.answer);
      if (!planAnswer.success) throw Object.assign(new Error('Check the amount, billing period and dates.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await recurringSetupResult(userId, execution.propertyId, {
        kind: 'PLAN', entityId: savingsLaunch.entityId, sourceExecutionId: typeof savingsLaunch.sourceExecutionId === 'string' ? savingsLaunch.sourceExecutionId : null,
      }, planAnswer.data);
      captureId = input.idempotencyKey;
      capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
      canonicalOwner = 'HomeSavingsAccount';
    } else {
    const savingsTarget = savingsLaunch && typeof savingsLaunch.entityId === 'string' ? parseSavingsRowId(savingsLaunch.entityId) : null;
    if (!savingsLaunch || savingsLaunch.kind !== 'OUTCOME' || !savingsTarget) {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const savingsAnswer = parseSavingsOutcomeAnswer(savingsTarget.family, input.answer);
    if (!savingsAnswer.success) {
      throw Object.assign(new Error(SAVINGS_OUTCOME_INVALID_MESSAGES[savingsAnswer.reason]), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await savingsCommandResult(userId, execution.propertyId, {
      kind: 'OUTCOME', entityId: String(savingsLaunch.entityId), sourceExecutionId: typeof savingsLaunch.sourceExecutionId === 'string' ? savingsLaunch.sourceExecutionId : null,
    }, savingsAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'SavingsBenefitAction';
    }
  } else if (execution.operationId === 'RENOVATION_READINESS_COMMAND') {
    const readinessKind = readinessFormKindFromCaptureKey(input.captureKey);
    if (!readinessKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change readiness.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const readinessLaunch = storedParameters.readinessCommandLaunch && typeof storedParameters.readinessCommandLaunch === 'object' && !Array.isArray(storedParameters.readinessCommandLaunch)
      ? storedParameters.readinessCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!readinessLaunch || readinessLaunch.kind !== readinessKind || typeof readinessLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const readinessAnswer = parseReadinessFormAnswer(readinessKind, input.answer);
    if (!readinessAnswer.success) {
      throw Object.assign(new Error('Check the form and try again: a reason needs enough detail to be useful later.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await readinessCommandResult(userId, execution.propertyId, {
      kind: readinessKind, entityId: readinessLaunch.entityId, sourceExecutionId: typeof readinessLaunch.sourceExecutionId === 'string' ? readinessLaunch.sourceExecutionId : null,
    }, readinessAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'RenovationStartReadinessItem';
  } else if (execution.operationId === 'PAST_HAZARD_OUTCOME_COMMAND') {
    if (input.captureKey !== PAST_HAZARD_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to record what was observed.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const hazardLaunch = storedParameters.pastHazardLaunch && typeof storedParameters.pastHazardLaunch === 'object' && !Array.isArray(storedParameters.pastHazardLaunch)
      ? storedParameters.pastHazardLaunch as { entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!hazardLaunch || typeof hazardLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const hazardAnswer = parsePastHazardOutcomeAnswer(input.answer);
    if (!hazardAnswer.success) throw Object.assign(new Error(PAST_HAZARD_INVALID_MESSAGES[hazardAnswer.reason]), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await pastHazardCommandResult(userId, execution.propertyId, {
      entityId: hazardLaunch.entityId, sourceExecutionId: typeof hazardLaunch.sourceExecutionId === 'string' ? hazardLaunch.sourceExecutionId : null,
    }, hazardAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyHazardOutcome';
  } else if (execution.operationId === 'ENVIRONMENT_REPORT_COMMAND') {
    if (input.captureKey !== ENVIRONMENT_HVAC_FILTER_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to record HVAC filter maintenance.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const envLaunch = storedParameters.environmentReportLaunch && typeof storedParameters.environmentReportLaunch === 'object' && !Array.isArray(storedParameters.environmentReportLaunch)
      ? storedParameters.environmentReportLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!envLaunch || envLaunch.kind !== 'RECORD_HVAC_FILTER' || typeof envLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const hvacAnswer = parseEnvironmentHvacFilterAnswer(input.answer);
    if (!hvacAnswer.success) throw Object.assign(new Error(ENVIRONMENT_HVAC_FILTER_INVALID_MESSAGES[hvacAnswer.reason]), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await environmentReportCommandResult(userId, execution.propertyId, {
      kind: 'RECORD_HVAC_FILTER',
      entityId: envLaunch.entityId,
      sourceExecutionId: typeof envLaunch.sourceExecutionId === 'string' ? envLaunch.sourceExecutionId : null,
    }, hvacAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyMaintenanceTask';
  } else if (execution.operationId === 'HOME_BRIEFING_COMMAND') {
    if (input.captureKey !== BRIEFING_PREFERENCES_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    // CALLER_SCOPED (FRD v1.329): the briefing is the caller's own; membership is enforced by ensurePropertyAccess.
    await ensurePropertyAccess(userId, execution.propertyId);
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const briefingLaunch = storedParameters.briefingCommandLaunch && typeof storedParameters.briefingCommandLaunch === 'object' && !Array.isArray(storedParameters.briefingCommandLaunch)
      ? storedParameters.briefingCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!briefingLaunch || briefingLaunch.kind !== 'PREFERENCES' || typeof briefingLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const briefingAnswer = parseBriefingPreferencesAnswer(input.answer);
    if (!briefingAnswer.success) throw Object.assign(new Error('Choose on or off, how often, and at least one place to send it.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await briefingCommandResult(userId, execution.propertyId, {
      kind: 'PREFERENCES', entityId: briefingLaunch.entityId, sourceExecutionId: typeof briefingLaunch.sourceExecutionId === 'string' ? briefingLaunch.sourceExecutionId : null,
    }, briefingAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HomeBriefingPreference';
  } else if (execution.operationId === 'HOA_COMPLIANCE_COMMAND') {
    const hoaKind = hoaFormKindFromCaptureKey(input.captureKey);
    if (!hoaKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change HOA records.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const hoaLaunch = storedParameters.hoaCommandLaunch && typeof storedParameters.hoaCommandLaunch === 'object' && !Array.isArray(storedParameters.hoaCommandLaunch)
      ? storedParameters.hoaCommandLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!hoaLaunch || hoaLaunch.kind !== hoaKind || typeof hoaLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const associationEditor = hoaKind === 'ASSOCIATION' ? validateHoaAssociationEditorAnswer(input.answer) : null;
    const hoaAnswer = associationEditor
      ? Object.keys(associationEditor.errors).length
        ? { success: false as const, reason: 'INVALID' as const }
        : { success: true as const, data: hoaAssociationEditorFormValues(associationEditor.values) }
      : parseHoaFormAnswer(hoaKind, input.answer);
    if (!hoaAnswer.success) {
      throw Object.assign(new Error(hoaAnswer.reason === 'NOTHING' ? 'Change at least one thing.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await hoaCommandResult(userId, execution.propertyId, {
      kind: hoaKind, entityId: hoaLaunch.entityId, sourceExecutionId: typeof hoaLaunch.sourceExecutionId === 'string' ? hoaLaunch.sourceExecutionId : null,
    }, hoaAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HoaCompliance';
  } else if (execution.operationId === 'HOME_BRIEFING_SHARE_COMMAND') {
    if (input.captureKey !== BRIEFING_SHARE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role !== HouseholdRole.OWNER) throw Object.assign(new Error('Only an owner can share briefing updates.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const shareLaunch = storedParameters.briefingShareLaunch && typeof storedParameters.briefingShareLaunch === 'object' && !Array.isArray(storedParameters.briefingShareLaunch)
      ? storedParameters.briefingShareLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!shareLaunch || shareLaunch.kind !== 'CREATE' || typeof shareLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const shareAnswer = parseBriefingShareAnswer(input.answer);
    if (!shareAnswer.success) throw Object.assign(new Error('Choose at least one update (up to ten) and how long the link lasts.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await briefingShareResult(userId, execution.propertyId, {
      kind: 'CREATE', entityId: shareLaunch.entityId, sourceExecutionId: typeof shareLaunch.sourceExecutionId === 'string' ? shareLaunch.sourceExecutionId : null,
    }, shareAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'HomeBriefingShare';
  } else if (execution.operationId === 'FINANCING_PROFILE_COMMAND') {
    if (input.captureKey !== FINANCING_PROFILE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role !== HouseholdRole.OWNER) throw Object.assign(new Error('Only an owner can change the financing profile.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const profileLaunch = storedParameters.financingProfileLaunch && typeof storedParameters.financingProfileLaunch === 'object' && !Array.isArray(storedParameters.financingProfileLaunch)
      ? storedParameters.financingProfileLaunch as { entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!profileLaunch || typeof profileLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const profileAnswer = parseFinancingProfileAnswer(input.answer);
    if (!profileAnswer.success) {
      throw Object.assign(new Error(profileAnswer.reason === 'NOTHING' ? 'Change at least one thing.' : 'Check the amounts, dates and rate and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await financingProfileCommandResult(userId, execution.propertyId, {
      entityId: profileLaunch.entityId, sourceExecutionId: typeof profileLaunch.sourceExecutionId === 'string' ? profileLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyFinancingProfile';
  } else if (execution.operationId === 'SELL_HOLD_RENT_COMMAND') {
    if (input.captureKey !== SELL_HOLD_RENT_ASSUMPTIONS_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.sellHoldRentLaunch && typeof storedParameters.sellHoldRentLaunch === 'object' && !Array.isArray(storedParameters.sellHoldRentLaunch)
      ? storedParameters.sellHoldRentLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!launch || launch.kind !== 'EDIT_ASSUMPTIONS' || typeof launch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    result = await sellHoldRentCommandResult(userId, execution.propertyId, {
      kind: 'EDIT_ASSUMPTIONS', entityId: launch.entityId, sourceExecutionId: typeof launch.sourceExecutionId === 'string' ? launch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'ToolOverride';
  } else if (execution.operationId === 'HOME_HABIT_PREFERENCES_COMMAND') {
    if (input.captureKey !== HABIT_COACH_PREFERENCES_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the coach settings.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const habitAnswer = parseHabitCoachPreferencesAnswer(input.answer);
    if (!habitAnswer.success) throw Object.assign(new Error('Choose on or off, and a number of habits from 1 to 20 if you set one.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const habitLaunch = storedParameters.habitCoachSettingsLaunch as { sourceExecutionId?: unknown } | undefined;
    if (!habitLaunch) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    result = await habitCoachPreferencesResult(userId, execution.propertyId, typeof habitLaunch.sourceExecutionId === 'string' ? habitLaunch.sourceExecutionId : null, habitAnswer.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyHabitPreference';
  } else if (execution.operationId === 'DO_NOTHING_SCENARIO_COMMAND') {
    const dnKind = doNothingFormKindFromCaptureKey(input.captureKey);
    if (!dnKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change scenarios.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const dnLaunch = storedParameters.doNothingLaunch && typeof storedParameters.doNothingLaunch === 'object' && !Array.isArray(storedParameters.doNothingLaunch)
      ? storedParameters.doNothingLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!dnLaunch || dnLaunch.kind !== dnKind || typeof dnLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    if (!parseDoNothingScenarioAnswer(dnKind, input.answer).success) {
      throw Object.assign(new Error('Give the scenario a name and a horizon of 6, 12, 24 or 36 months; change at least one thing when editing.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await doNothingScenarioResult(userId, execution.propertyId, {
      kind: dnKind, entityId: dnLaunch.entityId, sourceExecutionId: typeof dnLaunch.sourceExecutionId === 'string' ? dnLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'DoNothingScenario';
  } else if (execution.operationId === 'SELLER_PREP_CASE_COMMAND') {
    const scKind = saleCaseFormKindFromCaptureKey(input.captureKey);
    if (!scKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the sale case.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const scLaunch = storedParameters.saleCaseLaunch && typeof storedParameters.saleCaseLaunch === 'object' && !Array.isArray(storedParameters.saleCaseLaunch)
      ? storedParameters.saleCaseLaunch as { kind?: unknown; sourceExecutionId?: unknown } : null;
    if (!scLaunch || scLaunch.kind !== scKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseSaleCaseAnswer(scKind, input.answer).success) {
      throw Object.assign(new Error('Fill in what changes; a closing date cannot be before the listing date.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await saleCaseCommandResult(userId, execution.propertyId, {
      kind: scKind, sourceExecutionId: typeof scLaunch.sourceExecutionId === 'string' ? scLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertySaleCase';
  } else if (execution.operationId === 'INSPECTION_NEGOTIATION_PACKAGE') {
    if (input.captureKey !== NEGOTIATION_PACKAGE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to build a negotiation package.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const negLaunch = storedParameters.negotiationLaunch && typeof storedParameters.negotiationLaunch === 'object' && !Array.isArray(storedParameters.negotiationLaunch)
      ? storedParameters.negotiationLaunch as { entityId?: unknown; findingIds?: unknown; sourceExecutionId?: unknown } : null;
    if (!negLaunch || typeof negLaunch.entityId !== 'string' || !Array.isArray(negLaunch.findingIds) || !negLaunch.findingIds.every((id) => typeof id === 'string')) {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    result = await negotiationPackageResult(userId, execution.propertyId, {
      entityId: negLaunch.entityId, sourceExecutionId: typeof negLaunch.sourceExecutionId === 'string' ? negLaunch.sourceExecutionId : null,
    }, { answer: input.answer as Record<string, unknown>, expectedContextVersion: input.expectedContextVersion, findingIds: negLaunch.findingIds as string[] });
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'InspectionNegotiationPackage';
  } else if (execution.operationId === 'HOME_WORK_ITEM_COMMAND') {
    const wiKind = workItemFormKindFromCaptureKey(input.captureKey);
    if (!wiKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change work items.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const wiLaunch = storedParameters.workItemLaunch && typeof storedParameters.workItemLaunch === 'object' && !Array.isArray(storedParameters.workItemLaunch)
      ? storedParameters.workItemLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!wiLaunch || wiLaunch.kind !== wiKind || typeof wiLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    if (!parseWorkItemAnswer(wiKind, input.answer).success) {
      throw Object.assign(new Error(WORK_ITEM_FORM_ERRORS[wiKind]), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await workItemCommandResult(userId, execution.propertyId, {
      kind: wiKind, entityId: wiLaunch.entityId, sourceExecutionId: typeof wiLaunch.sourceExecutionId === 'string' ? wiLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'OperationalWorkItem';
  } else if (execution.operationId === 'SEASONAL_ITEM_COMMAND') {
    if (input.captureKey !== SEASONAL_SNOOZE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change seasonal tasks.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const siLaunch = storedParameters.seasonalItemLaunch && typeof storedParameters.seasonalItemLaunch === 'object' && !Array.isArray(storedParameters.seasonalItemLaunch)
      ? storedParameters.seasonalItemLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!siLaunch || siLaunch.kind !== 'SNOOZE' || typeof siLaunch.entityId !== 'string') throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseSeasonalSnoozeAnswer(input.answer).success) throw Object.assign(new Error('Choose how long to snooze.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await seasonalItemResult(userId, execution.propertyId, {
      kind: 'SNOOZE', entityId: siLaunch.entityId, sourceExecutionId: typeof siLaunch.sourceExecutionId === 'string' ? siLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'SeasonalChecklistItem';
  } else if (execution.operationId === 'DIY_SKILL_PROFILE_COMMAND') {
    if (input.captureKey !== DIY_PROFILE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    await ensurePropertyAccess(userId, execution.propertyId);
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const dpLaunch = storedParameters.diyProfileLaunch && typeof storedParameters.diyProfileLaunch === 'object' && !Array.isArray(storedParameters.diyProfileLaunch)
      ? storedParameters.diyProfileLaunch as { sourceExecutionId?: unknown } : null;
    if (!dpLaunch) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseDiySkillProfileAnswer(input.answer).success) throw Object.assign(new Error('Choose beginner, intermediate or advanced for every area.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await diySkillProfileResult(userId, execution.propertyId, { sourceExecutionId: typeof dpLaunch.sourceExecutionId === 'string' ? dpLaunch.sourceExecutionId : null }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'DiySkillProfile';
  } else if (execution.operationId === 'DIY_PROJECT_NOTE_COMMAND') {
    if (input.captureKey !== DIY_NOTE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to add a note.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const dnLaunch2 = storedParameters.diyNoteLaunch && typeof storedParameters.diyNoteLaunch === 'object' && !Array.isArray(storedParameters.diyNoteLaunch)
      ? storedParameters.diyNoteLaunch as { entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!dnLaunch2 || typeof dnLaunch2.entityId !== 'string') throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseDiyNoteAnswer(input.answer).success) throw Object.assign(new Error('Write a note of at least three characters.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await diyProjectNoteResult(userId, execution.propertyId, {
      entityId: dnLaunch2.entityId, sourceExecutionId: typeof dnLaunch2.sourceExecutionId === 'string' ? dnLaunch2.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'DiyProject';
  } else if (execution.operationId === 'BUYER_WALKTHROUGH_COMMAND') {
    const bwKind = walkthroughFormKindFromCaptureKey(input.captureKey);
    if (!bwKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change the walkthrough.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const bwLaunch = storedParameters.walkthroughLaunch && typeof storedParameters.walkthroughLaunch === 'object' && !Array.isArray(storedParameters.walkthroughLaunch)
      ? storedParameters.walkthroughLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!bwLaunch || bwLaunch.kind !== bwKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseWalkthroughAnswer(bwKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await walkthroughCommandResult(userId, execution.propertyId, {
      kind: bwKind, entityId: typeof bwLaunch.entityId === 'string' ? bwLaunch.entityId : null, sourceExecutionId: typeof bwLaunch.sourceExecutionId === 'string' ? bwLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerWalkthroughWorkspace';
  } else if (execution.operationId === 'BUYER_CLOSING_ITEM_COMMAND') {
    const ciKind = closingItemKindFromCaptureKey(input.captureKey);
    if (!ciKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const ciLaunch = storedParameters.closingItemLaunch && typeof storedParameters.closingItemLaunch === 'object' && !Array.isArray(storedParameters.closingItemLaunch)
      ? storedParameters.closingItemLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!ciLaunch || ciLaunch.kind !== ciKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseClosingItemAnswer(ciKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await closingItemResult(userId, execution.propertyId, {
      kind: ciKind, entityId: typeof ciLaunch.entityId === 'string' ? ciLaunch.entityId : null, sourceExecutionId: typeof ciLaunch.sourceExecutionId === 'string' ? ciLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerClosingItem';
  } else if (execution.operationId === 'BUYER_INSURANCE_COMMAND') {
    const biKind = insuranceFormKindFromCaptureKey(input.captureKey);
    if (!biKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const biLaunch = storedParameters.insuranceLaunch && typeof storedParameters.insuranceLaunch === 'object' && !Array.isArray(storedParameters.insuranceLaunch)
      ? storedParameters.insuranceLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!biLaunch || biLaunch.kind !== biKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseInsuranceAnswer(biKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await insuranceCommandResult(userId, execution.propertyId, {
      kind: biKind, entityId: typeof biLaunch.entityId === 'string' ? biLaunch.entityId : null, sourceExecutionId: typeof biLaunch.sourceExecutionId === 'string' ? biLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerInsuranceWorkspace';
  } else if (execution.operationId === 'BUYER_CONTRACT_COMMAND') {
    const bcKind = contractFormKindFromCaptureKey(input.captureKey);
    if (!bcKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const bcLaunch = storedParameters.contractLaunch && typeof storedParameters.contractLaunch === 'object' && !Array.isArray(storedParameters.contractLaunch)
      ? storedParameters.contractLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!bcLaunch || bcLaunch.kind !== bcKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseContractAnswer(bcKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await contractCommandResult(userId, execution.propertyId, {
      kind: bcKind, entityId: typeof bcLaunch.entityId === 'string' ? bcLaunch.entityId : null, sourceExecutionId: typeof bcLaunch.sourceExecutionId === 'string' ? bcLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerContractRevision';
  } else if (execution.operationId === 'HOME_RECORD_STATE_COMMAND') {
    const hrKind = homeRecordFormKindFromCaptureKey(input.captureKey);
    if (!hrKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change a record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const hrLaunch = storedParameters.homeRecordLaunch && typeof storedParameters.homeRecordLaunch === 'object' && !Array.isArray(storedParameters.homeRecordLaunch)
      ? storedParameters.homeRecordLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!hrLaunch || hrLaunch.kind !== hrKind || typeof hrLaunch.entityId !== 'string') throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseHomeRecordAnswer(hrKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await homeRecordStateResult(userId, execution.propertyId, {
      kind: hrKind, entityId: hrLaunch.entityId, sourceExecutionId: typeof hrLaunch.sourceExecutionId === 'string' ? hrLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyRecord';
  } else if (execution.operationId === 'BUYER_CLOSING_DISCLOSURE_COMMAND') {
    const cdKind = cdFormKindFromCaptureKey(input.captureKey);
    if (!cdKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const cdLaunch = storedParameters.cdLaunch && typeof storedParameters.cdLaunch === 'object' && !Array.isArray(storedParameters.cdLaunch)
      ? storedParameters.cdLaunch as { kind?: unknown; sourceExecutionId?: unknown } : null;
    if (!cdLaunch || cdLaunch.kind !== cdKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseCdAnswer(cdKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await cdCommandResult(userId, execution.propertyId, {
      kind: cdKind, sourceExecutionId: typeof cdLaunch.sourceExecutionId === 'string' ? cdLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerClosingDisclosureRevision';
  } else if (execution.operationId === 'REFINANCE_COMMAND') {
    const refinanceKind = refinanceFormKindFromCaptureKey(input.captureKey);
    if (!refinanceKind) throw Object.assign(new Error('This refinance form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change refinance records.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.refinanceLaunch && typeof storedParameters.refinanceLaunch === 'object' && !Array.isArray(storedParameters.refinanceLaunch)
      ? storedParameters.refinanceLaunch as { kind?: unknown; entityId?: unknown; message?: unknown } : null;
    if (!launch || launch.kind !== refinanceKind) throw Object.assign(new Error('This refinance form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseRefinanceCommandAnswer(refinanceKind, input.answer).success) throw Object.assign(new Error('Fill in the required refinance details.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await refinanceCommandResult(userId, execution.propertyId, refinanceKind, typeof launch.entityId === 'string' ? launch.entityId : null, typeof launch.message === 'string' ? launch.message : execution.message, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'MortgageRefinanceRadar';
  } else if (execution.operationId === 'BUYER_LOAN_ESTIMATE_COMMAND') {
    const leKind = leFormKindFromCaptureKey(input.captureKey);
    if (!leKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const leLaunch = storedParameters.leLaunch && typeof storedParameters.leLaunch === 'object' && !Array.isArray(storedParameters.leLaunch)
      ? storedParameters.leLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!leLaunch || leLaunch.kind !== leKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseLeAnswer(leKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await leCommandResult(userId, execution.propertyId, {
      kind: leKind, entityId: typeof leLaunch.entityId === 'string' ? leLaunch.entityId : null, sourceExecutionId: typeof leLaunch.sourceExecutionId === 'string' ? leLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerPurchaseLoanEstimateRevision';
  } else if (execution.operationId === 'BUYER_PLAN_SETUP_COMMAND') {
    const setupKind = setupKindFromCaptureKey(input.captureKey);
    if (!setupKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change this.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const setupLaunch = storedParameters.setupLaunch && typeof storedParameters.setupLaunch === 'object' && !Array.isArray(storedParameters.setupLaunch)
      ? storedParameters.setupLaunch as { kind?: unknown; sourceExecutionId?: unknown } : null;
    if (!setupLaunch || setupLaunch.kind !== setupKind) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    if (!parseSetupAnswer(setupKind, input.answer).success) throw Object.assign(new Error('Fill in what the form asks for.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await setupCommandResult(userId, execution.propertyId, {
      kind: setupKind, sourceExecutionId: typeof setupLaunch.sourceExecutionId === 'string' ? setupLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'BuyerPurchaseSetup';
  } else if (execution.operationId === 'PROPERTY_TAX_COMPARABLE_COMMAND' && input.captureKey === DOCUMENT_FACTS_CAPTURE_KEY) {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to confirm tax facts.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const documentFactsLaunch = storedParameters.documentFactsLaunch && typeof storedParameters.documentFactsLaunch === 'object' && !Array.isArray(storedParameters.documentFactsLaunch)
      ? storedParameters.documentFactsLaunch as { sourceExecutionId?: unknown } : null;
    if (!documentFactsLaunch) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const factsAnswer = parseDocumentFactsAnswer(input.answer);
    if (!factsAnswer.success) {
      throw Object.assign(new Error(factsAnswer.reason === 'AFFIRMATION' ? 'Affirm the statement to continue.' : factsAnswer.reason === 'NO_FACTS' ? 'Enter at least one value from the document.' : factsAnswer.reason === 'FUTURE_DATE' ? 'A valuation date cannot be in the future.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await documentFactsResult(userId, execution.propertyId, {
      sourceExecutionId: typeof documentFactsLaunch.sourceExecutionId === 'string' ? documentFactsLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyTaxDocumentIntake';
  } else if (execution.operationId === 'PROPERTY_TAX_COMPARABLE_COMMAND' && input.captureKey === EVIDENCE_CAPTURE_KEY) {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to add evidence.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const evidenceLaunch = storedParameters.evidenceLaunch && typeof storedParameters.evidenceLaunch === 'object' && !Array.isArray(storedParameters.evidenceLaunch)
      ? storedParameters.evidenceLaunch as { kind?: unknown; sourceExecutionId?: unknown } : null;
    if (!evidenceLaunch || typeof evidenceLaunch.kind !== 'string' || !(evidenceLaunch.kind in EVIDENCE_MESSAGES)) {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const evidenceKind = evidenceLaunch.kind as EvidenceKind;
    const evidenceAnswer = parseEvidenceAnswer(evidenceKind, input.answer);
    // A decision outside the reviewed rule's list is re-checked against the rule by the handler; the shape is checked here.
    if (!evidenceAnswer.success && evidenceAnswer.reason !== 'DECISION') {
      throw Object.assign(new Error(evidenceAnswer.reason === 'URL' ? 'Use a web address that starts with https.' : evidenceAnswer.reason === 'SOURCE' ? 'Give either a link or a document from your home records.' : evidenceAnswer.reason === 'NO_MISMATCH' ? 'If the official record matches, there is no factual error to record.' : evidenceAnswer.reason === 'FUTURE' ? 'A notice cannot be dated in the future.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await evidenceCommandResult(userId, execution.propertyId, {
      kind: evidenceKind, sourceExecutionId: typeof evidenceLaunch.sourceExecutionId === 'string' ? evidenceLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyTaxAppealEvidence';
  } else if (execution.operationId === 'PROPERTY_TAX_COMPARABLE_COMMAND') {
    if (input.captureKey !== COMPARABLE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to add a comparable.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const comparableLaunch = storedParameters.comparableLaunch && typeof storedParameters.comparableLaunch === 'object' && !Array.isArray(storedParameters.comparableLaunch)
      ? storedParameters.comparableLaunch as { sourceExecutionId?: unknown } : null;
    if (!comparableLaunch) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const comparableAnswer = parseComparableAnswer(input.answer);
    if (!comparableAnswer.success) {
      throw Object.assign(new Error(comparableAnswer.reason === 'FUTURE' ? 'A comparable must be a sale that already happened.' : 'Check the form and try again.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    }
    result = await comparableCommandResult(userId, execution.propertyId, {
      sourceExecutionId: typeof comparableLaunch.sourceExecutionId === 'string' ? comparableLaunch.sourceExecutionId : null,
    }, input.answer as Record<string, unknown>);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'PropertyTaxAppealComparable';
  } else if (execution.operationId === 'CLAIM_ACTIVITY_COMMAND') {
    if (input.captureKey !== CLAIM_NOTE_CAPTURE_KEY) throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to change a claim.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const claimLaunch = storedParameters.claimActivityLaunch && typeof storedParameters.claimActivityLaunch === 'object' && !Array.isArray(storedParameters.claimActivityLaunch)
      ? storedParameters.claimActivityLaunch as { kind?: unknown; entityId?: unknown; sourceExecutionId?: unknown } : null;
    if (!claimLaunch || claimLaunch.kind !== 'NOTE' || typeof claimLaunch.entityId !== 'string') {
      throw Object.assign(new Error('This form is no longer active. Choose the action again.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    }
    const claimNote = parseClaimNoteAnswer(input.answer);
    if (!claimNote.success) throw Object.assign(new Error('Write a note of at least three characters.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    result = await claimActivityResult(userId, execution.propertyId, {
      kind: 'NOTE', entityId: claimLaunch.entityId, sourceExecutionId: typeof claimLaunch.sourceExecutionId === 'string' ? claimLaunch.sourceExecutionId : null,
    }, claimNote.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = typeof result.contextVersion === 'string' ? result.contextVersion : input.expectedContextVersion;
    canonicalOwner = 'ClaimTimelineEvent';
  } else if (execution.operationId === 'PROPERTY_BRIEF_COMMAND') {
    if (![PROPERTY_BRIEF_PREPARE_CAPTURE_KEY, PROPERTY_BRIEF_SHARE_CAPTURE_KEY].includes(input.captureKey) || input.expectedContextVersion !== 'property-brief-live') throw Object.assign(new Error('This Property Brief form is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to manage Property Briefs.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson) ? execution.parametersJson as Record<string, unknown> : {};
    const launch = storedParameters.propertyBriefLaunch && typeof storedParameters.propertyBriefLaunch === 'object' && !Array.isArray(storedParameters.propertyBriefLaunch) ? storedParameters.propertyBriefLaunch as { actionId?: string; entityId?: string; sourceExecutionId?: string } : null;
    if (input.captureKey === PROPERTY_BRIEF_PREPARE_CAPTURE_KEY && launch?.actionId === PROPERTY_BRIEF_ACTION_IDS.PREPARE) {
      const answer = PropertyBriefPrepareInputSchema.safeParse(input.answer);
      if (!answer.success) throw Object.assign(new Error('Choose a recipient purpose, at least one allowed section, and acknowledge any sensitive sections.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await propertyBriefCommandResult(userId, execution.propertyId, launch, { kind: 'PREPARE', value: answer.data });
    } else if (input.captureKey === PROPERTY_BRIEF_SHARE_CAPTURE_KEY && launch?.actionId === PROPERTY_BRIEF_ACTION_IDS.SHARE) {
      const answer = PropertyBriefShareInputSchema.safeParse(input.answer);
      if (!answer.success) throw Object.assign(new Error('Choose a 1–90 day expiry and recipient permission, review the snapshot, and enter a valid optional email.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
      result = await propertyBriefCommandResult(userId, execution.propertyId, launch, { kind: 'SHARE', value: answer.data });
    } else throw Object.assign(new Error('This Property Brief action is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    captureId = input.idempotencyKey; capturedContextVersion = 'property-brief-live'; canonicalOwner = 'PropertyBrief';
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
  } else if (execution.operationId === 'INVENTORY_ITEM_CORRECT' && input.captureKey === INVENTORY_COMPLETE_DETAILS_CAPTURE_KEY) {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) throw Object.assign(new Error('A contributor or owner is required to update an inventory item.'), { code: 'ASK_PERMISSION_REQUIRED' });
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const itemId = typeof storedParameters.inventoryCompletionItemId === 'string' ? storedParameters.inventoryCompletionItemId : null;
    if (!itemId) throw Object.assign(new Error('This inventory form is no longer active.'), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    const currentItem = await prisma.inventoryItem.findFirst({ where: { id: itemId, propertyId: execution.propertyId } });
    if (!currentItem || inventoryItemContextVersion(currentItem) !== input.expectedContextVersion) throw Object.assign(new Error('This inventory item changed while the form was open. Start again from Edit item or Add missing details.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    result = storedParameters.inventoryEditAll === true
      ? await inventoryEditResult(userId, execution.propertyId, itemId, input.answer, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null)
      : await inventoryCompleteDetailsResult(userId, execution.propertyId, itemId, input.answer, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    capturedContextVersion = input.expectedContextVersion;
    captureId = input.idempotencyKey;
    canonicalOwner = 'InventoryItem';
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
    }, new Set(state.excludedFactKeys));
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
      const built = buildUserAddedEventConfirmation(execution.parametersJson, storedContextVersion, input.answer, new Date(), await loadEventAddOptions(execution.propertyId));
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
    // The financing profile is owner-only (owner ruling 2026-10-13, FRD v1.332); say so before taking the answer rather than failing at the write.
    if ((await ensurePropertyAccess(userId, execution.propertyId)).role !== HouseholdRole.OWNER) {
      const error = new Error('Only an owner can change the financing profile.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
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
      }, { actor: { kind: 'USER', userId }, surface: 'ASK', expectedUpdatedAt: profile?.updatedAt ?? null });
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
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, suggestedNextActionsGoverned: result.suggestedNextActionsGoverned === true, suggestedNextActions: result.suggestedNextActions ?? [], skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
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
  // Typed launch (a verified Suggested Next Action): the area comes from the server-held outcome key through the registry's
  // outcome -> area mapping. Message text never decides it, and an unknown typed outcome is not routable (no fallback to the message).
  // The legacy message-routed launch (the Property Summary rows) keeps its existing behavior.
  const typedOutcome = launch?.outcomeKey ?? null;
  const scope = typedOutcome ? areaScopeForOutcome(typedOutcome) : areaScopeForMessage(envelope.message);
  const entityMatches = !launch?.entityType || launch.entityType !== 'PROPERTY_CONTEXT_AREA' || launch.entityId === scope;
  const declaredStart = launch?.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE' && launch.surface !== 'ASK_REFRESH' && scope !== null && entityMatches;
  const notRoutable = (): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_AREA_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{ type: 'SUMMARY', id: 'area-capture-not-routable', title: 'Use "Fill in missing details" on the home record', body: 'Missing home details are filled in from the completeness list in your home summary. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  });
  if (declaredStart && scope) {
    const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
    if (access.role === HouseholdRole.VIEWER) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{ type: 'SUMMARY', id: 'area-capture-permission', title: 'A contributor or owner can add home details', body: 'Your role can view the home record but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
        suggestions: [],
      };
    }
    // "Continue" from a receipt carries that workflow's skips; a start from any other result begins with none.
    let skip = new Set<string>();
    // The server-owned allowlist (packet D3): a typed launch asks only the unresolved, applicable, consumer-backed facts its chip promised.
    // A failed computation fails CLOSED: a chip that promised a bounded set must not silently open the unbounded flow.
    let excluded = new Set<string>();
    if (typedOutcome) {
      try {
        excluded = new Set((await loadAreaCaptureAllowlist(envelope.userId, envelope.propertyId!, scope)).excludedFactKeys);
      } catch (error) {
        logger.warn({ err: error, propertyId: envelope.propertyId, scope }, '[ask-area-capture] allowlist unavailable; typed launch not started');
        return {
          status: 'UNAVAILABLE', reasonCode: 'AREA_CAPTURE_ALLOWLIST_UNAVAILABLE',
          blocks: [{ type: 'SUMMARY', id: 'area-capture-allowlist-unavailable', title: 'Home details are not available right now', body: 'Nothing has changed. You can try again in a moment.', tone: 'CAUTION', actions: [] }],
          suggestions: [],
        };
      }
    }
    const sourceId = launch.sourceExecutionId ?? null;
    if (sourceId) {
      const source = await prisma.askExecution.findFirst({ where: { id: sourceId, userId: envelope.userId, propertyId: envelope.propertyId!, operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE' }, select: { parametersJson: true } });
      const inherited = source ? areaCaptureStateFrom(source.parametersJson) : null;
      if (inherited && inherited.scope === scope) {
        skip = new Set(inherited.skipFactKeys);
        // "Continue" keeps the workflow's allowlist, so a receipt cannot widen a bounded flow into the full area.
        if (!typedOutcome) excluded = new Set(inherited.excludedFactKeys);
      }
    }
    return areaCapturePrompt(envelope.userId, envelope.propertyId!, scope, skip, sourceId, undefined, excluded);
  }
  // A refresh of this execution re-asks with ITS OWN stored skips (never reset, never client-supplied); anything else is not routable.
  if (launch?.surface === 'ASK_REFRESH') {
    const own = await prisma.askExecution.findFirst({ where: { id: envelope.executionId, userId: envelope.userId }, select: { parametersJson: true } });
    const state = own ? areaCaptureStateFrom(own.parametersJson) : null;
    if (state) return areaCapturePrompt(envelope.userId, envelope.propertyId!, state.scope, new Set(state.skipFactKeys), state.sourceExecutionId, undefined, new Set(state.excludedFactKeys));
  }
  return notRoutable();
});
