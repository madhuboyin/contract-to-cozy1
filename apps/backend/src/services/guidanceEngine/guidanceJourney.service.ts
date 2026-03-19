import { APIError } from '../../middleware/error.middleware';
import { getGuidanceTemplateBySignalFamily, TOOL_DEFAULT_STEP_KEY } from './guidanceTemplateRegistry';
import { guidanceSignalResolverService } from './guidanceSignalResolver.service';
import { guidanceStepResolverService } from './guidanceStepResolver.service';
import {
  GuidanceSignalSourceInput,
  GuidanceToolCompletionInput,
  getGuidanceModels,
} from './guidanceTypes';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeRecord(
  baseValue: unknown,
  patchValue: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const base = asRecord(baseValue);
  const patch = patchValue ?? {};
  const merged = {
    ...base,
    ...patch,
  };
  return Object.keys(merged).length > 0 ? merged : null;
}

export class GuidanceJourneyService {
  private async findReusableJourney(args: {
    propertyId: string;
    journeyTypeKey: string;
    inventoryItemId: string | null;
    homeAssetId: string | null;
    duplicateGroupKey: string;
  }) {
    const { guidanceJourney } = getGuidanceModels();

    return guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        status: 'ACTIVE',
        journeyTypeKey: args.journeyTypeKey,
        mergedSignalGroupKey: args.duplicateGroupKey,
        inventoryItemId: args.inventoryItemId,
        homeAssetId: args.homeAssetId,
      },
      include: {
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async ensureJourneyForSignal(params: {
    propertyId: string;
    signal: any;
    actorUserId?: string | null;
  }) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();
    const template = getGuidanceTemplateBySignalFamily(params.signal.signalIntentFamily);

    let journey = await this.findReusableJourney({
      propertyId: params.propertyId,
      journeyTypeKey: template.journeyTypeKey,
      inventoryItemId: params.signal.inventoryItemId ?? null,
      homeAssetId: params.signal.homeAssetId ?? null,
      duplicateGroupKey: params.signal.duplicateGroupKey,
    });

    const now = new Date();

    if (!journey) {
      journey = await guidanceJourney.create({
        data: {
          propertyId: params.propertyId,
          homeAssetId: params.signal.homeAssetId ?? null,
          inventoryItemId: params.signal.inventoryItemId ?? null,
          primarySignalId: params.signal.id,
          journeyKey: template.journeyKey,
          journeyTypeKey: template.journeyTypeKey,
          issueDomain: params.signal.issueDomain ?? template.issueDomain,
          decisionStage: params.signal.decisionStage ?? template.defaultDecisionStage,
          executionReadiness: params.signal.executionReadiness ?? template.defaultReadiness,
          status: 'ACTIVE',
          mergedSignalGroupKey: params.signal.duplicateGroupKey,
          currentStepOrder: null,
          currentStepKey: params.signal.canonicalFirstStepKey ?? template.canonicalFirstStepKey,
          isLowContext: (params.signal.missingContextKeys ?? []).length > 0,
          missingContextKeys: params.signal.missingContextKeys ?? [],
          contextSnapshotJson: mergeRecord(null, {
            sourceSignalId: params.signal.id,
            sourceEntityType: params.signal.sourceEntityType,
            sourceEntityId: params.signal.sourceEntityId,
            sourceToolKey: params.signal.sourceToolKey,
          }),
          derivedSnapshotJson: null,
          startedAt: now,
          lastTransitionAt: now,
        },
        include: {
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      });

      await guidanceJourneyEvent.create({
        data: {
          propertyId: params.propertyId,
          journeyId: journey.id,
          signalId: params.signal.id,
          eventType: 'JOURNEY_CREATED',
          actorUserId: params.actorUserId ?? null,
          payloadJson: {
            journeyTypeKey: template.journeyTypeKey,
            signalIntentFamily: params.signal.signalIntentFamily,
          },
        },
      });
    } else {
      journey = await guidanceJourney.update({
        where: { id: journey.id },
        data: {
          primarySignalId: journey.primarySignalId ?? params.signal.id,
          issueDomain: params.signal.issueDomain ?? journey.issueDomain,
          decisionStage: params.signal.decisionStage ?? journey.decisionStage,
          executionReadiness: params.signal.executionReadiness ?? journey.executionReadiness,
          mergedSignalGroupKey: params.signal.duplicateGroupKey ?? journey.mergedSignalGroupKey,
          isLowContext:
            Boolean(journey.isLowContext) || (params.signal.missingContextKeys ?? []).length > 0,
          missingContextKeys: Array.from(
            new Set([...(journey.missingContextKeys ?? []), ...(params.signal.missingContextKeys ?? [])])
          ),
          contextSnapshotJson: mergeRecord(journey.contextSnapshotJson, {
            sourceSignalId: params.signal.id,
            sourceEntityType: params.signal.sourceEntityType,
            sourceEntityId: params.signal.sourceEntityId,
            sourceToolKey: params.signal.sourceToolKey,
            updatedFromSignalAt: now.toISOString(),
          }),
        },
        include: {
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      });
    }

    await guidanceStepResolverService.ensureTemplateSteps({
      propertyId: params.propertyId,
      journeyId: journey.id,
      templateSteps: template.steps,
      actorUserId: params.actorUserId ?? null,
      signalId: params.signal.id,
    });

    const recomputed = await guidanceStepResolverService.recomputeJourneyState({
      propertyId: params.propertyId,
      journeyId: journey.id,
      actorUserId: params.actorUserId ?? null,
      signalId: params.signal.id,
    });

    return recomputed;
  }

  async ingestSignal(input: GuidanceSignalSourceInput & { actorUserId?: string | null }) {
    const signal = await guidanceSignalResolverService.resolveAndPersistSignal(input);
    const journey = await this.ensureJourneyForSignal({
      propertyId: input.propertyId,
      signal,
      actorUserId: input.actorUserId ?? null,
    });

    return {
      signal,
      journey,
    };
  }

  async recordToolCompletion(input: GuidanceToolCompletionInput) {
    const { guidanceJourney } = getGuidanceModels();

    let signal: any | null = null;
    let journey: any | null = null;

    if (input.journeyId) {
      journey = await guidanceJourney.findFirst({
        where: {
          id: input.journeyId,
          propertyId: input.propertyId,
        },
        include: {
          primarySignal: true,
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      });

      if (!journey) {
        throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
      }

      signal = journey.primarySignal ?? null;
    } else {
      const ingest = await this.ingestSignal({
        propertyId: input.propertyId,
        homeAssetId: input.homeAssetId ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
        signalIntentFamily: input.signalIntentFamily ?? null,
        issueDomain: input.issueDomain ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceToolKey: input.sourceToolKey,
        sourceFeatureKey: input.sourceToolKey,
        payloadJson: input.producedData ?? null,
        metadataJson: input.metadata ?? null,
        actorUserId: input.actorUserId ?? null,
      });

      signal = ingest.signal;
      journey = ingest.journey;
    }

    const defaultStepKey = TOOL_DEFAULT_STEP_KEY[input.sourceToolKey] ?? null;
    const currentStep = (journey.steps ?? []).find((step: any) => step.status === 'IN_PROGRESS' || step.status === 'PENDING');

    const resolvedStepKey = input.stepKey ?? defaultStepKey ?? currentStep?.stepKey ?? journey.currentStepKey;
    if (!resolvedStepKey) {
      throw new APIError('Unable to resolve a journey step key for tool completion.', 400, 'GUIDANCE_STEP_KEY_REQUIRED');
    }

    const transitioned = await guidanceStepResolverService.markStepStatus({
      propertyId: input.propertyId,
      journeyId: journey.id,
      stepKey: resolvedStepKey,
      nextStatus: input.status,
      actorUserId: input.actorUserId ?? null,
      reasonCode: input.reasonCode ?? null,
      reasonMessage: input.reasonMessage ?? null,
      producedData: input.producedData ?? null,
      signalId: signal?.id ?? null,
    });

    const next = await guidanceStepResolverService.resolveNextStep({
      propertyId: input.propertyId,
      journeyId: journey.id,
    });

    return {
      signal,
      journey: transitioned.journey,
      step: transitioned.step,
      next,
    };
  }

  async getJourneyById(propertyId: string, journeyId: string) {
    const { guidanceJourney } = getGuidanceModels();

    const journey = await guidanceJourney.findFirst({
      where: {
        id: journeyId,
        propertyId,
      },
      include: {
        primarySignal: true,
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
        events: {
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
        },
      },
    });

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    return journey;
  }

  async listActiveJourneysForProperty(propertyId: string) {
    const { guidanceJourney } = getGuidanceModels();

    return guidanceJourney.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
      },
      include: {
        primarySignal: true,
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async listSignalsForProperty(propertyId: string) {
    const { guidanceSignal } = getGuidanceModels();

    return guidanceSignal.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
      },
      orderBy: [{ lastObservedAt: 'desc' }],
    });
  }

  async getPropertyGuidance(propertyId: string) {
    const journeys = await this.listActiveJourneysForProperty(propertyId);
    const signals = await this.listSignalsForProperty(propertyId);

    const nextByJourney = await Promise.all(
      journeys.map((journey: any) =>
        guidanceStepResolverService.resolveNextStep({
          propertyId,
          journeyId: journey.id,
        })
      )
    );

    return {
      propertyId,
      counts: {
        activeSignals: signals.length,
        activeJourneys: journeys.length,
      },
      signals,
      journeys,
      next: nextByJourney,
    };
  }
}

export const guidanceJourneyService = new GuidanceJourneyService();
