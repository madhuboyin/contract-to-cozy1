import { APIError } from '../../middleware/error.middleware';
import {
  GuidanceExecutionGuardRequest,
  GuidanceExecutionGuardResult,
  getGuidanceModels,
} from './guidanceTypes';
import { guidanceCopyService } from './guidanceCopy.service';

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
    return steps.filter(
      (step) =>
        step.stepKey.includes('claim') ||
        step.stepKey.includes('escalat') ||
        (step.flowKey ?? '').includes('claim')
    );
  }

  return steps.filter((step) => step.decisionStage === 'EXECUTION');
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

      for (const executionStep of executionSteps) {
        const prerequisiteSteps = steps.filter(
          (step) => step.isRequired && step.stepOrder < executionStep.stepOrder
        );

        for (const prerequisite of prerequisiteSteps) {
          if (prerequisite.status === 'COMPLETED') continue;

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
      }
    }

    if (missingPrerequisites.length > 0) {
      const missingLabels = missingPrerequisites.map((item) => item.stepLabel);
      reasons.push(`Complete prerequisite steps first: ${Array.from(new Set(missingLabels)).join(', ')}`);
    }

    return {
      blocked: missingPrerequisites.length > 0 || reasons.length > 0,
      targetAction: request.targetAction,
      reasons: guidanceCopyService.polishExecutionGuardReasons(
        Array.from(new Set(reasons)),
        missingPrerequisites
      ),
      missingPrerequisites,
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
