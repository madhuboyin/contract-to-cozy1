import { APIError } from '../../middleware/error.middleware';
import {
  GuidanceExecutionGuardRequest,
  GuidanceExecutionGuardResult,
  getGuidanceModels,
} from './guidanceTypes';
import { guidanceCopyService } from './guidanceCopy.service';
import { getStepSkipPolicy } from './guidanceTemplateRegistry';
import { logger } from '../../lib/logger';

function pickExecutionStepsForTarget(targetAction: GuidanceExecutionGuardRequest['targetAction'], steps: any[]) {
  if (targetAction === 'BOOKING') {
    return steps.filter(
      (step) =>
        step.toolKey === 'booking' ||
        step.stepKey === 'book_service' ||
        step.stepKey === 'route_specialist'
    );
  }

  if (targetAction === 'INSPECTION_SCHEDULING') {
    return steps.filter(
      (step) =>
        step.stepKey === 'route_specialist' ||
        step.stepKey.includes('schedule') ||
        step.toolKey === 'booking'
    );
  }

  if (targetAction === 'CLAIM_ESCALATION') {
    // S6-39: flowKey removed; claim escalation steps identified by stepKey convention only
    return steps.filter(
      (step) =>
        step.stepKey.includes('claim') ||
        step.stepKey.includes('escalat')
    );
  }

  return steps.filter((step) => step.decisionStage === 'EXECUTION');
}

function isSatisfiedExecutionPrerequisite(step: any, journeyTypeKey: string | null | undefined) {
  if (step?.status === 'COMPLETED') return true;
  if (step?.status !== 'SKIPPED') return false;
  return getStepSkipPolicy(journeyTypeKey ?? null, step?.stepKey ?? null) === 'ALLOWED';
}

export class GuidanceBookingGuardService {
  async evaluateExecutionGuard(
    request: GuidanceExecutionGuardRequest
  ): Promise<GuidanceExecutionGuardResult> {
    const { guidanceJourney } = getGuidanceModels();

    const where: Record<string, unknown> = {
      propertyId: request.propertyId,
      status: 'ACTIVE',
    };

    if (request.journeyId) {
      where.id = request.journeyId;
    }

    if (request.inventoryItemId) {
      where.inventoryItemId = request.inventoryItemId;
    }

    if (request.homeAssetId) {
      where.homeAssetId = request.homeAssetId;
    }

    const journeys = await guidanceJourney.findMany({
      where,
      include: {
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const missingPrerequisites: GuidanceExecutionGuardResult['missingPrerequisites'] = [];
    const reasons: string[] = [];

    for (const journey of journeys) {
      const steps = (journey.steps ?? []) as any[];
      const executionSteps = pickExecutionStepsForTarget(request.targetAction, steps);
      const journeyMissingContext = Array.isArray(journey.missingContextKeys)
        ? journey.missingContextKeys.filter((item: unknown): item is string => typeof item === 'string')
        : [];

      if (
        journey.executionReadiness === 'UNKNOWN' ||
        Boolean(journey.isLowContext) ||
        journeyMissingContext.length > 0
      ) {
        const fallbackPrior = steps.find(
          (step) =>
            step.isRequired &&
            (step.status === 'PENDING' || step.status === 'IN_PROGRESS' || step.status === 'BLOCKED')
        );

        reasons.push(
          'Execution is temporarily blocked because guidance context is incomplete.'
        );

        if (fallbackPrior) {
          missingPrerequisites.push({
            journeyId: journey.id,
            journeyTypeKey: journey.journeyTypeKey ?? null,
            stepKey: fallbackPrior.stepKey,
            stepLabel: guidanceCopyService.polishStepLabel({
              stepKey: fallbackPrior.stepKey,
              label: fallbackPrior.label,
              toolKey: fallbackPrior.toolKey ?? null,
            }),
          });
        }
      }

      for (const executionStep of executionSteps) {
        const prerequisiteSteps = steps.filter(
          (step) => step.isRequired && step.stepOrder < executionStep.stepOrder
        );
        let hasUnmetRequiredPrerequisite = false;

        for (const prerequisite of prerequisiteSteps) {
          if (isSatisfiedExecutionPrerequisite(prerequisite, journey.journeyTypeKey ?? null)) continue;
          hasUnmetRequiredPrerequisite = true;

          missingPrerequisites.push({
            journeyId: journey.id,
            journeyTypeKey: journey.journeyTypeKey ?? null,
            stepKey: prerequisite.stepKey,
            stepLabel: guidanceCopyService.polishStepLabel({
              stepKey: prerequisite.stepKey,
              label: prerequisite.label,
              toolKey: prerequisite.toolKey ?? null,
            }),
          });
        }

        if (executionStep.status === 'BLOCKED') {
          reasons.push(
            guidanceCopyService.polishBlockedReason(executionStep.blockedReason ?? null) ??
              `Execution step ${executionStep.label} is blocked.`
          );
        }
        if (
          request.targetAction !== 'BOOKING' &&
          executionSteps.length > 0 &&
          journey.executionReadiness !== 'READY' &&
          hasUnmetRequiredPrerequisite
        ) {
          reasons.push('Complete required guidance steps before execution.');
        }
      }
    }

    const dedupedMissing = Array.from(
      new Map(
        missingPrerequisites.map((item) => [
          `${item.journeyId}:${item.stepKey}`,
          item,
        ])
      ).values()
    );

    if (dedupedMissing.length > 0) {
      const missingLabels = dedupedMissing.map((item) => item.stepLabel);
      reasons.push(`Complete prerequisite steps first: ${Array.from(new Set(missingLabels)).join(', ')}`);
    }

    const blocked = dedupedMissing.length > 0 || reasons.length > 0;
    const safeNextStep = dedupedMissing[0] ?? null;
    const blockedReason =
      safeNextStep
        ? `Complete ${safeNextStep.stepLabel} first.`
        : Array.from(new Set(reasons))[0] ?? null;
    if (blocked) {
      logger.info({
        propertyId: request.propertyId,
        targetAction: request.targetAction,
        journeyCount: journeys.length,
        missingPrerequisites: dedupedMissing.length,
      }, '[GUIDANCE] execution blocked');
    }

    return {
      blocked,
      targetAction: request.targetAction,
      blockedReason,
      reasons: guidanceCopyService.polishExecutionGuardReasons(
        Array.from(new Set(reasons)),
        dedupedMissing
      ),
      missingPrerequisites: dedupedMissing,
      safeNextStep,
      evaluatedJourneyIds: journeys.map((journey: any) => journey.id),
    };
  }

  async assertCanExecute(request: GuidanceExecutionGuardRequest): Promise<void> {
    const result = await this.evaluateExecutionGuard(request);

    if (!result.blocked) return;

    throw new APIError(
      'Execution is blocked by incomplete guidance prerequisites.',
      409,
      'GUIDANCE_EXECUTION_BLOCKED',
      result
    );
  }
}

export const guidanceBookingGuardService = new GuidanceBookingGuardService();
