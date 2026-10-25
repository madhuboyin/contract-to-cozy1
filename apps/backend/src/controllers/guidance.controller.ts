import { GUIDANCE_STEP_PROOF_MATRIX } from '../services/ask/askGuidanceStepProofMatrix';
import { MANUAL_DECLARATION_STEP_KEYS, MANUAL_DECLARATION_TOOL_KEY, declareGuidanceStep } from '../services/guidanceEngine/guidanceManualDeclaration';
import { MAINTENANCE_LINKABLE_STEP_KEYS } from '../services/maintenanceTaskJourneyOperations';
import { FINDINGS_STEP_KEY, FINDINGS_STEP_TOOL_KEY, checkFindingDecisionsWithEffects } from '../services/inspectionFindingsProofOperations';
import { COVERAGE_RECORD_STEP_KEYS, COVERAGE_RECORD_TOOL_KEY, checkCoverageRecordWithEffects } from '../services/coverageRecordProofOperations';
import { linkMaintenanceTaskToStep } from '../services/maintenanceTaskJourneyOperations';
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { guidanceStepResolverService } from '../services/guidanceEngine/guidanceStepResolver.service';
import { guidanceBookingGuardService } from '../services/guidanceEngine/guidanceBookingGuard.service';
import {
  SUGGESTED_ISSUE_TYPES_ITEM,
  SUGGESTED_ISSUE_TYPES_SERVICE,
  getSymptomTypesForCategory,
} from '../services/guidanceEngine/guidanceTemplateRegistry';
import {
  mapGuidanceJourney,
  mapGuidanceSignal,
  mapGuidanceStep,
  mapGuidanceEvent,
  mapGuidanceEvidence,
} from '../services/guidanceEngine/guidanceMapper';
import { APIError } from '../middleware/error.middleware';
import { acknowledgeGuidanceStepById, isAcknowledgeableStep, isAcknowledgeableStepKey } from '../services/guidanceEngine/guidanceAcknowledgement';
import { GUIDANCE_STEP_REFUSAL_TEXT } from '../services/guidanceEngine/guidanceStepBinding';
import { getGuidanceModels } from '../services/guidanceEngine/guidanceTypes';
import { modelShortlistAdvisorService } from '../services/guidanceEngine/modelShortlistAdvisor.service';
import { vendorSuggestionsAdvisorService } from '../services/guidanceEngine/vendorSuggestionsAdvisor.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProtectionContextDecisions } from '../services/protection/context';

const GUIDANCE_TARGET_ACTIONS = new Set([
  'BOOKING',
  'CLAIM_ESCALATION',
  'INSPECTION_SCHEDULING',
  'PROVIDER_HANDOFF',
  'EXECUTION',
]);

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  return userId;
}

export async function getPropertyGuidance(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const userSelectedScopeId = req.query.userSelectedScopeId
      ? String(req.query.userSelectedScopeId)
      : undefined;

    const [payload, protectionContext] = await Promise.all([
      guidanceJourneyService.getPropertyGuidance(propertyId, { userSelectedScopeId }),
      getProtectionContextDecisions(propertyId, userId),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { journeyCount: payload.journeys.length },
    });

    const reconciledSuppressedIds = new Set(protectionContext.reconciliation.suppressedGuidanceSignalIds);
    const signals = payload.signals.filter((signal: any) => !reconciledSuppressedIds.has(signal.id));
    const journeys = payload.journeys.filter((journey: any) => !reconciledSuppressedIds.has(journey.primarySignalId));
    const next = payload.next.filter((item: any) => !reconciledSuppressedIds.has(item.signalId));
    const contextSuppressions = [...reconciledSuppressedIds].map((signalId) => ({
      signalId,
      reasonCode: protectionContext.reconciliation.suppressionReasons[signalId],
      source: 'PROPERTY_CONTEXT_RECONCILIATION',
    }));

    res.json({
      success: true,
      data: {
        propertyId,
        counts: {
          ...payload.counts,
          surfacedSignals: signals.length,
          surfacedJourneys: journeys.length,
          suppressedSignals: (payload.suppressedSignals?.length ?? 0) + contextSuppressions.length,
        },
        signals: signals.map(mapGuidanceSignal),
        journeys: journeys.map(mapGuidanceJourney),
        next,
        suppressedSignals: [...(payload.suppressedSignals ?? []), ...contextSuppressions],
        protectionContext,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listActiveGuidanceJourneys(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const payload = await guidanceJourneyService.getPropertyGuidance(propertyId);
    res.json({
      success: true,
      data: {
        journeys: payload.journeys.map(mapGuidanceJourney),
        suppressedSignals: payload.suppressedSignals ?? [],
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceJourneyDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const journey = await guidanceJourneyService.getJourneyById(propertyId, journeyId, userId);
    const next = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
      userId,
    });

    res.json({
      success: true,
      data: {
        journey: mapGuidanceJourney(journey),
        next: next ?? null,
        events: (journey.events ?? []).map((event: any) =>
          mapGuidanceEvent(event, {
            suppressGenericRepairReplace: journey.inventoryItem?.category === 'HVAC',
          })
        ),
        evidences: (journey.evidences ?? [])
          .filter(
            (evidence: any) =>
              journey.inventoryItem?.category !== 'HVAC' ||
              evidence.proofType !== 'repair_replace_analysis'
          )
          .map(mapGuidanceEvidence),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveGuidanceSignal(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const result = await guidanceJourneyService.ingestSignal({
      propertyId,
      ...(req.body ?? {}),
      actorUserId: userId,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'resolve_signal' },
    });

    res.status(201).json({
      success: true,
      data: {
        signal: mapGuidanceSignal(result.signal),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

/** Every step with a connected typed path (a reporter that reads the canonical state or the domain write) has no self-reported completion: the generic endpoints refuse it. */
const TYPED_PATH_REQUIRED = () => new APIError('This step is completed by its own action in the tool, not by marking it done.', 409, 'GUIDANCE_TYPED_PATH_REQUIRED');
const hasConnectedTypedPath = (toolKey: string | null | undefined, stepKey: string | null | undefined) =>
  GUIDANCE_STEP_PROOF_MATRIX[`${toolKey ?? ''}:${stepKey ?? ''}`]?.verdict === 'CONNECTED';
const MANUAL_DECLARATION_REQUIRED = () => new APIError('This step is recorded as a declaration: choose the declaration instead of completing it.', 409, 'GUIDANCE_DECLARATION_REQUIRED');
const MAINTENANCE_TASK_REQUIRED = () => new APIError('Link a maintenance task to this step and complete it with evidence: this step is not completed by marking it done or by having no open tasks.', 409, 'GUIDANCE_MAINTENANCE_TASK_REQUIRED');
const FINDINGS_DECISION_REQUIRED = () => new APIError('Decide what to do about each finding, then check: this step is completed by the findings\' decisions, not by marking it done.', 409, 'GUIDANCE_FINDING_DECISIONS_REQUIRED');
// The coverage record steps have no weaker path either: only a saved, active record completes them.
const COVERAGE_RECORD_REQUIRED = () => new APIError('Save the plan, then check your records: this step is completed by a saved policy or warranty, not by marking it done.', 409, 'GUIDANCE_COVERAGE_RECORD_REQUIRED');
const ACKNOWLEDGEMENT_REQUIRED = () => new APIError('This is a review step: mark it as reviewed instead of completing it.', 409, 'GUIDANCE_ACKNOWLEDGEMENT_REQUIRED');

/** The one way to complete a review step from the page: the same typed acknowledgement Ask records (exact signal and version, step, actor, time, REVIEWED). */
export async function acknowledgeGuidanceStepEndpoint(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const outcome = await acknowledgeGuidanceStepById(req.params.propertyId, userId, req.params.stepId, { disposition: req.body?.disposition ?? null, note: req.body?.note ?? null });
    if (!outcome.ok) {
      if (outcome.reason === 'RECORD_FAILED') throw new APIError('The review could not be recorded. Try again.', 500, 'GUIDANCE_ACKNOWLEDGEMENT_FAILED');
      throw new APIError(GUIDANCE_STEP_REFUSAL_TEXT[outcome.reason], outcome.reason === 'NOT_FOUND' ? 404 : 409, `GUIDANCE_ACKNOWLEDGEMENT_${outcome.reason}`);
    }
    analyticsEmitter.track({ eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: req.params.propertyId, moduleKey: AnalyticsModule.GUIDANCE, featureKey: AnalyticsFeature.GUIDANCE_ADVISOR, metadataJson: { actionType: 'acknowledge_step' } });
    const { journey, step } = outcome.result;
    res.json({ success: true, data: { step: mapGuidanceStep(step, { suppressGenericRepairReplace: journey?.inventoryItem?.category === 'HVAC' }), journey: mapGuidanceJourney(journey) } });
  } catch (error) { next(error); }
}

export async function linkMaintenanceTaskEndpoint(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const taskId = req.body?.maintenanceTaskId;
    if (typeof taskId !== 'string' || !taskId) throw new APIError('A maintenance task is required.', 400, 'MAINTENANCE_TASK_REQUIRED');
    const { link, reused } = await linkMaintenanceTaskToStep(req.params.propertyId, userId, taskId, req.params.stepId, 'DESKTOP');
    res.json({ success: true, data: { link, reused } });
  } catch (error) { next(error); }
}

/** Desktop's check of the saved coverage record for a step: the page names its journey and step key; the step is resolved inside this home and the saved records decide. */
export async function checkCoverageRecordEndpoint(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    let stepId: string | null = req.body?.guidanceStepId ?? null;
    if (!stepId && req.body?.guidanceJourneyId && req.body?.guidanceStepKey) {
      const step = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { journeyId: req.body.guidanceJourneyId, stepKey: req.body.guidanceStepKey, journey: { propertyId } }, select: { id: true } });
      stepId = step?.id ?? null;
    }
    if (!stepId) throw new APIError('The journey step this was started from is no longer available.', 404, 'GUIDANCE_STEP_NOT_FOUND');
    const result = await checkCoverageRecordWithEffects(propertyId, userId, stepId);
    res.json({ success: true, data: { recordId: result.record.id, recordKind: result.record.kind, guidanceReported: result.guidanceReported } });
  } catch (error) { next(error); }
}

/** Desktop's check that every finding the journey is about has a decision: the findings decide, the page's checklist does not. */
export async function checkFindingDecisionsEndpoint(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    let stepId: string | null = req.body?.guidanceStepId ?? null;
    if (!stepId && req.body?.guidanceJourneyId) {
      const step = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { journeyId: req.body.guidanceJourneyId, stepKey: FINDINGS_STEP_KEY, journey: { propertyId } }, select: { id: true } });
      stepId = step?.id ?? null;
    }
    if (!stepId) throw new APIError('The journey step this was started from is no longer available.', 404, 'GUIDANCE_STEP_NOT_FOUND');
    const result = await checkFindingDecisionsWithEffects(propertyId, userId, stepId);
    res.json({ success: true, data: { findingCount: result.state.total, guidanceReported: result.guidanceReported } });
  } catch (error) { next(error); }
}

/** An intentionally manual step: the caller names a declaration key; the server owns the words and the subject. */
export async function declareGuidanceStepEndpoint(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const outcome = await declareGuidanceStep(req.params.propertyId, userId, req.params.stepId, String(req.body?.declarationKey ?? ''));
    if (!outcome.ok) {
      if (outcome.reason === 'RECORD_FAILED') throw new APIError('The declaration could not be recorded. Try again.', 500, 'GUIDANCE_DECLARATION_FAILED');
      if (outcome.reason === 'UNKNOWN_DECLARATION') throw new APIError('That is not a declaration this step accepts.', 400, 'GUIDANCE_DECLARATION_UNKNOWN');
      throw new APIError(GUIDANCE_STEP_REFUSAL_TEXT[outcome.reason], outcome.reason === 'NOT_FOUND' ? 404 : 409, `GUIDANCE_DECLARATION_${outcome.reason}`);
    }
    res.json({ success: true, data: { declared: true } });
  } catch (error) { next(error); }
}

export async function completeGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;
    // A review step has no weaker path: self-reported producedData cannot complete it.
    const target = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { id: stepId, journey: { propertyId } }, select: { stepKey: true, toolKey: true } });
    if (target && target.toolKey === MANUAL_DECLARATION_TOOL_KEY && MANUAL_DECLARATION_STEP_KEYS.includes(target.stepKey)) throw MANUAL_DECLARATION_REQUIRED();
    if (target && target.toolKey === 'maintenance' && MAINTENANCE_LINKABLE_STEP_KEYS.includes(target.stepKey)) throw MAINTENANCE_TASK_REQUIRED();
    if (target && target.stepKey === FINDINGS_STEP_KEY && target.toolKey === FINDINGS_STEP_TOOL_KEY) throw FINDINGS_DECISION_REQUIRED();
    if (target && COVERAGE_RECORD_STEP_KEYS.includes(target.stepKey) && target.toolKey === COVERAGE_RECORD_TOOL_KEY) throw COVERAGE_RECORD_REQUIRED();
    if (target && isAcknowledgeableStep(target.toolKey, target.stepKey)) throw ACKNOWLEDGEMENT_REQUIRED();
    if (target && hasConnectedTypedPath(target.toolKey, target.stepKey)) throw TYPED_PATH_REQUIRED();

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'COMPLETED',
      producedData: req.body?.producedData ?? null,
      actorUserId: userId,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'complete_step' },
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step, {
          suppressGenericRepairReplace: result.journey?.inventoryItem?.category === 'HVAC',
        }),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function skipGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'SKIPPED',
      reasonCode: req.body?.reasonCode ?? 'USER_SKIPPED',
      reasonMessage: req.body?.reasonMessage ?? null,
      producedData: req.body?.producedData ?? null,
      actorUserId: userId,
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step, {
          suppressGenericRepairReplace: result.journey?.inventoryItem?.category === 'HVAC',
        }),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function blockGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'BLOCKED',
      reasonCode: req.body?.reasonCode ?? 'MISSING_PREREQUISITE',
      reasonMessage: req.body?.reasonMessage ?? null,
      missingContextKeys: req.body?.missingContextKeys ?? null,
      actorUserId: userId,
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step, {
          suppressGenericRepairReplace: result.journey?.inventoryItem?.category === 'HVAC',
        }),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceNextStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = String(req.query.journeyId || '');

    if (!journeyId) throw new APIError('journeyId is required.', 400, 'GUIDANCE_JOURNEY_ID_REQUIRED');

    const result = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceExecutionGuard(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const targetAction = String(req.query.targetAction || 'BOOKING') as
      | 'BOOKING'
      | 'CLAIM_ESCALATION'
      | 'INSPECTION_SCHEDULING'
      | 'PROVIDER_HANDOFF'
      | 'EXECUTION';

    if (!GUIDANCE_TARGET_ACTIONS.has(targetAction)) {
      throw new APIError('Invalid targetAction supplied.', 400, 'GUIDANCE_INVALID_TARGET_ACTION');
    }

    const result = await guidanceBookingGuardService.evaluateExecutionGuard({
      propertyId,
      targetAction,
      journeyId: req.query.journeyId ? String(req.query.journeyId) : null,
      inventoryItemId: req.query.inventoryItemId ? String(req.query.inventoryItemId) : null,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function recordGuidanceToolCompletion(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    if (req.body?.status === 'COMPLETED' && MANUAL_DECLARATION_STEP_KEYS.includes(String(req.body?.stepKey ?? '')) && (req.body?.sourceToolKey ?? MANUAL_DECLARATION_TOOL_KEY) === MANUAL_DECLARATION_TOOL_KEY) throw MANUAL_DECLARATION_REQUIRED();
    if (req.body?.status === 'COMPLETED' && MAINTENANCE_LINKABLE_STEP_KEYS.includes(String(req.body?.stepKey ?? '')) && (req.body?.sourceToolKey ?? 'maintenance') === 'maintenance') throw MAINTENANCE_TASK_REQUIRED();
    if (req.body?.status === 'COMPLETED' && req.body?.stepKey === FINDINGS_STEP_KEY) throw FINDINGS_DECISION_REQUIRED();
    if (req.body?.status === 'COMPLETED' && COVERAGE_RECORD_STEP_KEYS.includes(String(req.body?.stepKey ?? ''))) throw COVERAGE_RECORD_REQUIRED();
    if (req.body?.status === 'COMPLETED' && isAcknowledgeableStepKey(String(req.body?.stepKey ?? ''))) throw ACKNOWLEDGEMENT_REQUIRED();
    if (req.body?.status === 'COMPLETED' && req.body?.stepKey) {
      const named = req.body.journeyId
        ? await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { journeyId: req.body.journeyId, stepKey: req.body.stepKey, journey: { propertyId } }, select: { toolKey: true } })
        : null;
      if (hasConnectedTypedPath(named?.toolKey ?? req.body.sourceToolKey, req.body.stepKey)) throw TYPED_PATH_REQUIRED();
    }

    const result = await guidanceJourneyService.recordToolCompletion({
      propertyId,
      ...(req.body ?? {}),
      actorUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: {
        signal: result.signal ? mapGuidanceSignal(result.signal) : null,
        journey: mapGuidanceJourney(result.journey),
        step: mapGuidanceStep(result.step, {
          suppressGenericRepairReplace: result.journey?.inventoryItem?.category === 'HVAC',
        }),
        next: result.next,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function startGuidanceJourney(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const journey = await guidanceJourneyService.createUserInitiatedJourney(
      propertyId,
      req.body,
      userId
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'start_journey' },
    });

    res.status(201).json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function dismissGuidanceJourney(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const journey = await guidanceJourneyService.dismissJourney(
      propertyId,
      journeyId,
      userId,
      req.body?.reason ?? null
    );

    res.json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function branchGuidanceRepairReplace(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const result = await guidanceJourneyService.branchFromRepairReplaceDecision({
      propertyId,
      journeyId,
      actorUserId: userId,
      stepKey: req.body.stepKey,
      analysisId: req.body.analysisId,
      verdict: req.body.verdict,
      choice: req.body.choice,
    });

    res.json({
      success: true,
      data: {
        sourceJourney: mapGuidanceJourney(result.sourceJourney),
        activeJourney: mapGuidanceJourney(result.activeJourney),
        next: result.next,
        branchCreated: result.branchCreated,
        branchType: result.branchType,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function changeGuidanceJourneyIssue(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    if (!req.body?.issueType) {
      throw new APIError('issueType is required.', 400, 'GUIDANCE_ISSUE_TYPE_REQUIRED');
    }

    const journey = await guidanceJourneyService.changeIssueForJourney(
      propertyId,
      journeyId,
      userId,
      req.body.issueType
    );

    res.json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceIssueTypes(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const scopeCategory = String(req.query.scopeCategory || 'ITEM');
    const issueTypes =
      scopeCategory === 'SERVICE' ? SUGGESTED_ISSUE_TYPES_SERVICE : SUGGESTED_ISSUE_TYPES_ITEM;

    res.json({
      success: true,
      data: { scopeCategory, issueTypes },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceServiceCategories(_req: CustomRequest, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: {
        serviceCategories: [
          { key: 'warranty_purchase', label: 'Home warranty' },
          { key: 'insurance_purchase', label: 'Home insurance' },
          { key: 'general_inspection', label: 'Home inspection' },
          { key: 'cleaning_service', label: 'Cleaning service' },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
}

// FRD-FR-04: Returns asset-category-specific symptom types for the verify_history step.
// ?category=HVAC returns HVAC-specific symptoms; omitting category returns the DEFAULT list.
export async function getGuidanceSymptomTypes(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const category = req.query.category ? String(req.query.category) : undefined;
    const symptomTypes = getSymptomTypesForCategory(category);

    res.json({
      success: true,
      data: { category: category ?? 'DEFAULT', symptomTypes },
    });
  } catch (error) {
    next(error);
  }
}

export async function generateGuidanceModelShortlist(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const { assetName, budgetMin, budgetMax, rebateAmount, primaryPriority, homeOwnershipYears, mustHaves, journeyContext } = req.body as {
      assetName: string;
      budgetMin?: number;
      budgetMax?: number;
      rebateAmount?: number;
      primaryPriority?: string;
      homeOwnershipYears?: string;
      mustHaves?: string[];
      journeyContext?: string;
    };

    const result = await modelShortlistAdvisorService.generateShortlist({
      propertyId,
      assetName,
      budgetMin,
      budgetMax,
      rebateAmount,
      primaryPriority,
      homeOwnershipYears,
      mustHaves,
      journeyContext,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'generate_model_shortlist' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function generateGuidanceVendorSuggestions(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const { assetName, modelName, budgetMax } = req.body as {
      assetName: string;
      modelName: string;
      budgetMax?: number;
    };

    const result = await vendorSuggestionsAdvisorService.generateSuggestions({
      propertyId,
      assetName,
      modelName,
      budgetMax,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'generate_vendor_suggestions' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// FRD-FR-03: Returns the 2-year lookback context for a specific inventory item.
// Used by the verify_history step to decide whether to show the lookback form
// and to populate the asset history sidebar in GuidanceDrawer.
export async function getAssetResolutionContext(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const inventoryItemId = String(req.query.inventoryItemId || '');

    if (!inventoryItemId) {
      throw new APIError('inventoryItemId is required.', 400, 'GUIDANCE_INVENTORY_ITEM_ID_REQUIRED');
    }

    const context = await guidanceJourneyService.getAssetResolutionContext(
      propertyId,
      inventoryItemId
    );

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
}
