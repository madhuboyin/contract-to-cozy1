import { APIError } from '../../middleware/error.middleware';
import {
  GuidanceExecutionReadiness,
  GuidanceNextStepResult,
  GuidanceStepStatus,
  GuidanceStepTemplate,
  getGuidanceModels,
  isActionableStepStatus,
} from './guidanceTypes';
import { guidanceDerivedDataService } from './guidanceDerivedData.service';
import { guidanceValidationService } from './guidanceValidation.service';
import { getStepSkipPolicy } from './guidanceTemplateRegistry';
import { runJourneyCompletionHooks } from './guidanceCompletionHooks.service';

const VALID_STEP_TRANSITIONS: Record<GuidanceStepStatus, GuidanceStepStatus[]> = {
  PENDING: ['IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED'],
  IN_PROGRESS: ['COMPLETED', 'SKIPPED', 'BLOCKED', 'PENDING'],
  COMPLETED: ['COMPLETED'],
  SKIPPED: ['SKIPPED', 'PENDING', 'IN_PROGRESS'],
  BLOCKED: ['BLOCKED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'],
};

const CRITICAL_REQUIRED_STEP_KEYS = new Set([
  'repair_replace_decision',
  'check_coverage',
  'validate_price',
  'estimate_out_of_pocket_cost',
  'compare_action_options',
  'assess_urgency',
  'estimate_repair_cost',
  'safety_alert',
  'weather_safety_check',
  'protect_exposed_systems',
  'review_remedy_instructions',
  'recall_resolution',
]);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function statusToEventType(nextStatus: GuidanceStepStatus, previousStatus: GuidanceStepStatus): string {
  if (nextStatus === 'COMPLETED') return 'STEP_COMPLETED';
  if (nextStatus === 'SKIPPED') return 'STEP_SKIPPED';
  if (nextStatus === 'BLOCKED') return 'STEP_BLOCKED';
  if (nextStatus === 'IN_PROGRESS') return 'STEP_STARTED';
  if (nextStatus === 'PENDING' && previousStatus === 'BLOCKED') return 'STEP_UNBLOCKED';
  return 'STEP_STATUS_CHANGED';
}

function isBackwardTransition(previous: GuidanceStepStatus, next: GuidanceStepStatus) {
  if (next !== 'PENDING') return false;
  return previous === 'IN_PROGRESS' || previous === 'SKIPPED' || previous === 'BLOCKED';
}

function requiresCompletionData(step: any) {
  if (!step?.isRequired) return false;
  const stepKey = String(step.stepKey ?? '').toLowerCase();
  if (CRITICAL_REQUIRED_STEP_KEYS.has(stepKey)) return true;
  return false;
}

export class GuidanceStepResolverService {
  async ensureTemplateSteps(params: {
    propertyId: string;
    journeyId: string;
    templateSteps: GuidanceStepTemplate[];
    actorUserId?: string | null;
    signalId?: string | null;
  }) {
    const { guidanceJourneyStep } = getGuidanceModels();

    const existing = await guidanceJourneyStep.findMany({
      where: { journeyId: params.journeyId },
      orderBy: [{ stepOrder: 'asc' }],
    });

    const existingByKey = new Map<string, any>();
    for (const step of existing) {
      existingByKey.set(step.stepKey, step);
    }

    for (const step of params.templateSteps) {
      const existingStep = existingByKey.get(step.stepKey);

      if (!existingStep) {
        await guidanceJourneyStep.create({
          data: {
            journeyId: params.journeyId,
            stepOrder: step.stepOrder,
            stepKey: step.stepKey,
            stepType: step.stepType ?? null,
            label: step.label,
            description: step.description ?? null,
            decisionStage: step.decisionStage,
            executionReadiness: step.executionReadiness,
            status: 'PENDING',
            isRequired: step.isRequired,
            toolKey: step.toolKey ?? null,
            routePath: step.routePath ?? null,
            requiredContextKeys: step.requiredContextKeys ?? [],
            missingContextKeys: [],
          },
        });
        continue;
      }

      await guidanceJourneyStep.update({
        where: { id: existingStep.id },
        data: {
          stepOrder: step.stepOrder,
          stepType: step.stepType ?? existingStep.stepType,
          label: step.label,
          description: step.description ?? null,
          decisionStage: step.decisionStage,
          executionReadiness: step.executionReadiness,
          isRequired: step.isRequired,
          toolKey: step.toolKey ?? null,
          routePath: step.routePath ?? null,
          requiredContextKeys: step.requiredContextKeys ?? [],
        },
      });
    }

    return guidanceJourneyStep.findMany({
      where: { journeyId: params.journeyId },
      orderBy: [{ stepOrder: 'asc' }],
    });
  }

  async markStepStatus(params: {
    propertyId: string;
    stepId?: string;
    journeyId?: string;
    stepKey?: string;
    nextStatus: GuidanceStepStatus;
    actorUserId?: string | null;
    reasonCode?: string | null;
    reasonMessage?: string | null;
    producedData?: Record<string, unknown> | null;
    missingContextKeys?: string[] | null;
    signalId?: string | null;
    allowBackwardTransition?: boolean;
  }) {
    const { guidanceJourneyStep, guidanceJourneyEvent, guidanceJourney } = getGuidanceModels();

    let step: any | null = null;

    if (params.stepId) {
      step = await guidanceJourneyStep.findFirst({
        where: { id: params.stepId, journey: { propertyId: params.propertyId } },
        include: {
          journey: {
            select: {
              id: true,
              journeyTypeKey: true,
              missingContextKeys: true,
              isLowContext: true,
            },
          },
        },
      });
    } else if (params.journeyId && params.stepKey) {
      step = await guidanceJourneyStep.findFirst({
        where: {
          journeyId: params.journeyId,
          stepKey: params.stepKey,
          journey: { propertyId: params.propertyId },
        },
        include: {
          journey: {
            select: {
              id: true,
              journeyTypeKey: true,
              missingContextKeys: true,
              isLowContext: true,
            },
          },
        },
      });
    }

    if (!step) {
      throw new APIError('Guidance journey step not found.', 404, 'GUIDANCE_STEP_NOT_FOUND');
    }

    const allowed = VALID_STEP_TRANSITIONS[step.status as GuidanceStepStatus] ?? [];
    if (!allowed.includes(params.nextStatus)) {
      throw new APIError(
        `Invalid step transition from ${step.status} to ${params.nextStatus}.`,
        400,
        'GUIDANCE_INVALID_STEP_TRANSITION'
      );
    }

    if (
      isBackwardTransition(step.status as GuidanceStepStatus, params.nextStatus) &&
      !params.allowBackwardTransition
    ) {
      throw new APIError(
        `Backward step transition from ${step.status} to ${params.nextStatus} is not allowed.`,
        400,
        'GUIDANCE_BACKWARD_STEP_TRANSITION_BLOCKED'
      );
    }

    const skipPolicy = getStepSkipPolicy(step.journey?.journeyTypeKey ?? null, step.stepKey ?? null);

    if (
      params.nextStatus === 'SKIPPED' &&
      skipPolicy === 'DISALLOWED'
    ) {
      throw new APIError(
        'This step cannot be skipped by policy.',
        400,
        'GUIDANCE_STEP_SKIP_DISALLOWED'
      );
    }

    if (
      params.nextStatus === 'SKIPPED' &&
      (step.isRequired || skipPolicy === 'DISCOURAGED') &&
      !params.reasonCode &&
      !params.reasonMessage
    ) {
      throw new APIError(
        'This step cannot be skipped without an explicit reason.',
        400,
        'GUIDANCE_REQUIRED_STEP_SKIP_REASON_REQUIRED'
      );
    }

    if (params.nextStatus === 'COMPLETED' && requiresCompletionData(step)) {
      const hasIncomingData = guidanceValidationService.hasMeaningfulProducedData(params.producedData ?? null);
      const hasExistingData = guidanceValidationService.hasMeaningfulProducedData(step.producedDataJson ?? null);
      if (!hasIncomingData && !hasExistingData) {
        throw new APIError(
          'This required step needs completion data before it can be marked completed.',
          400,
          'GUIDANCE_COMPLETION_DATA_REQUIRED'
        );
      }
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      status: params.nextStatus,
    };

    if (params.missingContextKeys) {
      data.missingContextKeys = params.missingContextKeys;
    }

    if (params.nextStatus === 'IN_PROGRESS') {
      data.startedAt = step.startedAt ?? now;
      data.blockedReason = null;
      data.blockedReasonCode = null;
    }

    if (params.nextStatus === 'COMPLETED') {
      data.startedAt = step.startedAt ?? now;
      data.completedAt = now;
      data.blockedAt = null;
      data.blockedReason = null;
      data.blockedReasonCode = null;
      data.skippedAt = null;
      data.skippedReason = null;
      data.skippedReasonCode = null;
    }

    if (params.nextStatus === 'SKIPPED') {
      data.skippedAt = now;
      data.skippedReasonCode = params.reasonCode ?? null;
      data.skippedReason = params.reasonMessage ?? null;
      data.blockedAt = null;
      data.blockedReason = null;
      data.blockedReasonCode = null;
    }

    if (params.nextStatus === 'BLOCKED') {
      data.blockedAt = now;
      data.blockedReasonCode = params.reasonCode ?? 'BLOCKED';
      data.blockedReason = params.reasonMessage ?? 'Step is blocked by missing prerequisites.';
    }

    if (params.nextStatus === 'PENDING' && step.status === 'BLOCKED') {
      data.unblockedAt = now;
      data.blockedAt = null;
      data.blockedReason = null;
      data.blockedReasonCode = null;
    }

    if (params.producedData) {
      data.producedDataJson = params.producedData;
    }

    const updated = await guidanceJourneyStep.update({
      where: { id: step.id },
      data,
    });

    if (
      params.nextStatus === 'SKIPPED' &&
      (step.isRequired || skipPolicy !== 'ALLOWED')
    ) {
      const existingMissing = asStringArray(step.journey?.missingContextKeys ?? []);
      const skipMarker = `skipped:${updated.stepKey}`;
      const nextMissing = Array.from(new Set([...existingMissing, skipMarker]));
      await guidanceJourney.update({
        where: { id: updated.journeyId },
        data: {
          isLowContext: true,
          missingContextKeys: nextMissing,
          version: { increment: 1 },
        },
      });
    }

    await guidanceJourneyEvent.create({
      data: {
        propertyId: params.propertyId,
        journeyId: updated.journeyId,
        stepId: updated.id,
        signalId: params.signalId ?? null,
        eventType: statusToEventType(params.nextStatus, step.status),
        actorType: params.actorUserId ? 'USER' : 'SYSTEM',
        fromStepStatus: step.status,
        toStepStatus: params.nextStatus,
        actorUserId: params.actorUserId ?? null,
        reasonCode: params.reasonCode ?? null,
        reasonMessage: params.reasonMessage ?? null,
        payloadJson: params.producedData ?? null,
      },
    });

    if (params.producedData) {
      await guidanceDerivedDataService.mergeStepOutput({
        propertyId: params.propertyId,
        journeyId: updated.journeyId,
        stepId: updated.id,
        stepKey: updated.stepKey,
        toolKey: updated.toolKey,
        producedData: params.producedData,
        actorUserId: params.actorUserId ?? null,
        signalId: params.signalId ?? null,
      });
    }

    const journeyState = await this.recomputeJourneyState({
      propertyId: params.propertyId,
      journeyId: updated.journeyId,
      actorUserId: params.actorUserId ?? null,
      signalId: params.signalId ?? null,
    });

    return {
      step: updated,
      journey: journeyState,
    };
  }

  async recomputeJourneyState(params: {
    propertyId: string;
    journeyId: string;
    actorUserId?: string | null;
    signalId?: string | null;
  }) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();

    const journey = await guidanceJourney.findFirst({
      where: {
        id: params.journeyId,
        propertyId: params.propertyId,
      },
      include: {
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
    });

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    const steps = (journey.steps ?? []) as any[];
    const currentStep = steps.find((step) => isActionableStepStatus(step.status as GuidanceStepStatus)) ?? null;
    const blockedStep = steps.find((step) => step.status === 'BLOCKED') ?? null;

    let nextReadiness: GuidanceExecutionReadiness = 'UNKNOWN';
    if (blockedStep) {
      nextReadiness = 'NOT_READY';
    } else if (!currentStep) {
      nextReadiness = 'TRACKING_ONLY';
    } else if ((currentStep.decisionStage ?? 'AWARENESS') === 'EXECUTION') {
      const prerequisiteIncomplete = steps.some(
        (step) =>
          step.isRequired &&
          step.stepOrder < currentStep.stepOrder &&
          step.status !== 'COMPLETED'
      );
      nextReadiness = prerequisiteIncomplete ? 'NOT_READY' : 'READY';
    } else {
      nextReadiness = 'NEEDS_CONTEXT';
    }

    const journeyMissingContext = asStringArray(journey.missingContextKeys);
    const stepMissingContext = asStringArray(currentStep?.missingContextKeys);
    const missingContextKeys = [...new Set([...journeyMissingContext, ...stepMissingContext])];
    const isLowContext = missingContextKeys.length > 0;

    if (isLowContext && nextReadiness === 'READY') {
      nextReadiness = 'NEEDS_CONTEXT';
    }

    const requiredTerminal = steps.every((step) => {
      if (!step.isRequired) return true;
      if (step.status === 'COMPLETED') return true;
      if (step.status !== 'SKIPPED') return false;
      const stepKey = String(step.stepKey ?? '').toLowerCase();
      return !CRITICAL_REQUIRED_STEP_KEYS.has(stepKey);
    });
    const hasBlockedRequired = steps.some((step) => step.isRequired && step.status === 'BLOCKED');
    const hasCriticalIncomplete = steps.some((step) => {
      if (!step.isRequired) return false;
      const stepKey = String(step.stepKey ?? '').toLowerCase();
      return CRITICAL_REQUIRED_STEP_KEYS.has(stepKey) && step.status !== 'COMPLETED';
    });

    if (hasCriticalIncomplete && nextReadiness === 'TRACKING_ONLY') {
      nextReadiness = 'NOT_READY';
    }

    const nextStatus = requiredTerminal && !hasBlockedRequired && !hasCriticalIncomplete ? 'COMPLETED' : 'ACTIVE';
    const now = new Date();

    const shouldWriteJourneyUpdate =
      journey.currentStepOrder !== (currentStep?.stepOrder ?? null) ||
      journey.currentStepKey !== (currentStep?.stepKey ?? null) ||
      journey.executionReadiness !== nextReadiness ||
      journey.status !== nextStatus ||
      Boolean(journey.isLowContext) !== isLowContext ||
      JSON.stringify(asStringArray(journey.missingContextKeys)) !== JSON.stringify(missingContextKeys);

    if (shouldWriteJourneyUpdate) {
      await guidanceJourney.update({
        where: { id: journey.id },
        data: {
          currentStepOrder: currentStep?.stepOrder ?? null,
          currentStepKey: currentStep?.stepKey ?? null,
          executionReadiness: nextReadiness,
          decisionStage: (currentStep?.decisionStage ?? journey.decisionStage ?? 'TRACKING'),
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? journey.completedAt ?? now : null,
          lastTransitionAt: now,
          isLowContext,
          missingContextKeys,
          version: { increment: 1 },
        },
      });
    }

    if (journey.executionReadiness !== nextReadiness) {
      await guidanceJourneyEvent.create({
        data: {
          propertyId: params.propertyId,
          journeyId: params.journeyId,
          signalId: params.signalId ?? null,
          eventType: 'JOURNEY_READINESS_CHANGED',
          actorType: params.actorUserId ? 'USER' : 'SYSTEM',
          actorUserId: params.actorUserId ?? null,
          fromJourneyReadiness: journey.executionReadiness,
          toJourneyReadiness: nextReadiness,
          payloadJson: {
            from: journey.executionReadiness,
            to: nextReadiness,
            currentStepKey: currentStep?.stepKey ?? null,
          },
        },
      });
    }

    if (journey.status !== nextStatus) {
      await guidanceJourneyEvent.create({
        data: {
          propertyId: params.propertyId,
          journeyId: params.journeyId,
          signalId: params.signalId ?? null,
          eventType: 'JOURNEY_STATUS_CHANGED',
          actorType: params.actorUserId ? 'USER' : 'SYSTEM',
          fromJourneyStatus: journey.status,
          toJourneyStatus: nextStatus,
          actorUserId: params.actorUserId ?? null,
        },
      });

      // FRD-FR-11/FR-12: Run completion side-effects (asset condition + HomeEvent)
      // when the journey transitions to COMPLETED for the first time.
      // Fire-and-forget with a caught error so a hook failure never blocks the
      // step transition response returned to the user.
      if (nextStatus === 'COMPLETED' && journey.status !== 'COMPLETED') {
        runJourneyCompletionHooks(params.journeyId).catch((err: unknown) => {
          console.error('[guidance] runJourneyCompletionHooks failed:', err);
        });
      }
    }

    return guidanceJourney.findFirst({
      where: {
        id: params.journeyId,
        propertyId: params.propertyId,
      },
      include: {
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
    });
  }

  async resolveNextStep(params: { propertyId: string; journeyId: string }): Promise<GuidanceNextStepResult> {
    const updatedJourney = await this.recomputeJourneyState({
      propertyId: params.propertyId,
      journeyId: params.journeyId,
    });

    const steps = (updatedJourney.steps ?? []) as any[];
    const currentStep = steps.find((step) => isActionableStepStatus(step.status as GuidanceStepStatus)) ?? null;

    if (!currentStep) {
      return {
        journeyId: updatedJourney.id,
        currentStep: null,
        nextStep: null,
        executionReadiness: updatedJourney.executionReadiness,
        missingPrerequisites: [],
        warnings: updatedJourney.isLowContext ? ['Additional context may improve this journey.'] : [],
        blockedReason: null,
        recommendedToolKey: null,
        recommendedFlowKey: null,
      };
    }

    const missingPrerequisites = steps
      .filter(
        (step) =>
          step.isRequired &&
          step.stepOrder < currentStep.stepOrder &&
          step.status !== 'COMPLETED'
      )
      .map((step) => ({
        stepKey: step.stepKey,
        label: step.label,
      }));

    const warnings: string[] = [];
    if (updatedJourney.isLowContext) {
      warnings.push('Some context is missing and may affect readiness.');
    }
    if (missingPrerequisites.length > 0) {
      warnings.push('Complete required earlier steps before execution.');
    }

    const blockedReason =
      currentStep.status === 'BLOCKED'
        ? currentStep.blockedReason ?? 'Step is blocked.'
        : missingPrerequisites.length > 0
          ? 'Required prerequisite steps are incomplete.'
          : null;

    return {
      journeyId: updatedJourney.id,
      currentStep,
      nextStep: currentStep,
      executionReadiness: updatedJourney.executionReadiness,
      missingPrerequisites,
      warnings,
      blockedReason,
      recommendedToolKey: currentStep.toolKey ?? updatedJourney.primarySignal?.recommendedToolKey ?? null,
      recommendedFlowKey: updatedJourney.primarySignal?.recommendedFlowKey ?? null,
    };
  }
}

export const guidanceStepResolverService = new GuidanceStepResolverService();
