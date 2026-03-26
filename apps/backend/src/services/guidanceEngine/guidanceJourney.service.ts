import { APIError } from '../../middleware/error.middleware';
import { getGuidanceTemplateBySignalFamily, getDefaultStepKey } from './guidanceTemplateRegistry';
import { guidanceSignalResolverService } from './guidanceSignalResolver.service';
import { guidanceStepResolverService } from './guidanceStepResolver.service';
import { guidanceFinancialContextService } from './guidanceFinancialContext.service';
import { guidanceConfidenceService } from './guidanceConfidence.service';
import { guidancePriorityService } from './guidancePriority.service';
import { guidanceSuppressionService } from './guidanceSuppression.service';
import { guidanceCopyService } from './guidanceCopy.service';
import { guidanceValidationService } from './guidanceValidation.service';
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

type EnrichedGuidanceAction = {
  journey: any;
  signal: any | null;
  next: any | null;
  priorityScore: number;
  priorityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityGroup: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION';
  confidenceScore: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  financialImpactScore: number;
  fundingGapFlag: boolean;
  costOfDelay: number;
  coverageImpact: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN';
  explanation: {
    what: string;
    why: string;
    risk: string;
    nextStep: string;
  };
  validationIssues?: Array<{ code: string; message: string; level: 'WARN' | 'ERROR' }>;
  validationShouldSuppress?: boolean;
};

export class GuidanceJourneyService {
  private confidenceLabel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 0.72) return 'HIGH';
    if (score < 0.45) return 'LOW';
    return 'MEDIUM';
  }

  private resolveDerivedFreshnessForNextStep(journey: any, toolKey?: string | null) {
    if (!toolKey) return { isStale: false, ageDays: null as number | null, maxAgeDays: 180 };
    const byTool = asRecord(asRecord(journey.derivedSnapshotJson).byTool);
    const entry = asRecord(byTool[toolKey]);
    const freshness = asRecord(entry.freshness);
    if (typeof freshness.isStale === 'boolean') {
      return {
        isStale: freshness.isStale,
        ageDays: typeof freshness.ageDays === 'number' ? freshness.ageDays : null,
        maxAgeDays: typeof freshness.maxAgeDays === 'number' ? freshness.maxAgeDays : 180,
      };
    }

    const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : null;
    return guidanceValidationService.assessToolFreshness({
      toolKey,
      observedAt: updatedAt,
    });
  }

  private applyStepCopy(step: any) {
    if (!step) return step;
    const label = guidanceCopyService.polishStepLabel({
      stepKey: step.stepKey ?? null,
      label: step.label ?? null,
      toolKey: step.toolKey ?? null,
    });
    return {
      ...step,
      label,
      displayLabel: label,
    };
  }

  private resolveDigitalTwinCompleteness(journey: any, signal: any) {
    const journeyContext = asRecord(journey?.contextSnapshotJson);
    const journeyTwin = asRecord(journeyContext.digitalTwin);
    const signalPayload = asRecord(signal?.payloadJson);
    const signalMetadata = asRecord(signal?.metadataJson);

    const candidates = [
      journeyContext.digitalTwinCompleteness,
      journeyContext.digitalTwinCompletenessScore,
      journeyTwin.completeness,
      journeyTwin.completenessScore,
      signalPayload.digitalTwinCompleteness,
      signalPayload.digitalTwinCompletenessScore,
      signalMetadata.digitalTwinCompleteness,
      signalMetadata.digitalTwinCompletenessScore,
    ];

    for (const candidate of candidates) {
      const parsed = guidanceValidationService.readNumeric({ value: candidate }, 'value');
      if (parsed == null) continue;
      if (parsed > 1) return Math.max(0, Math.min(1, parsed / 100));
      return Math.max(0, Math.min(1, parsed));
    }

    return null;
  }

  private enrichAction(params: {
    journey: any;
    signal?: any | null;
    next?: any | null;
  }): EnrichedGuidanceAction {
    const journey = params.journey;
    const signal = params.signal ?? journey.primarySignal ?? null;
    const next = params.next ?? null;

    const financial = guidanceFinancialContextService.evaluate({
      journey,
      signal,
    });

    const polishedSteps = (journey.steps ?? []).map((step: any) => this.applyStepCopy(step));
    const polishedNextStep = next?.nextStep ? this.applyStepCopy(next.nextStep) : null;
    const polishedCurrentStep = next?.currentStep ? this.applyStepCopy(next.currentStep) : null;
    const signalFreshness = guidanceValidationService.assessSignalFreshness({
      signalIntentFamily: signal?.signalIntentFamily ?? null,
      observedAt:
        signal?.metadataJson?.observedAt ??
        signal?.lastObservedAt ??
        signal?.firstObservedAt ??
        null,
    });
    const derivedFreshness = this.resolveDerivedFreshnessForNextStep(
      journey,
      polishedNextStep?.toolKey ?? null
    );
    const digitalTwinCompleteness = this.resolveDigitalTwinCompleteness(journey, signal);

    const confidence = guidanceConfidenceService.evaluate({
      journey,
      signal,
      next,
      digitalTwinCompleteness,
      signalFreshness,
      derivedFreshness,
    });

    const priority = guidancePriorityService.score({
      issueDomain: journey.issueDomain,
      severity: signal?.severity ?? null,
      severityScore: signal?.severityScore ?? null,
      signalIntentFamily: signal?.signalIntentFamily ?? null,
      executionReadiness: journey.executionReadiness,
      confidence,
      financial,
      signalPayload: signal?.payloadJson ?? null,
    });

    const breakEvenMonths = guidanceValidationService.readNumeric(
      asRecord(asRecord(journey.derivedSnapshotJson).latest),
      'breakEvenMonths'
    );

    const validation = guidanceValidationService.validateMathAndSafety({
      priorityScore: priority.priorityScore,
      financialImpactScore: financial.financialImpactScore,
      costOfDelay: financial.costOfDelay,
      breakEvenMonths,
      confidenceScore: confidence.confidenceScore,
      executionReadiness: journey.executionReadiness,
      isSignalStale: signalFreshness.isStale,
      isDerivedStale: derivedFreshness.isStale,
      hasMissingContext:
        Boolean(journey.isLowContext) ||
        Array.isArray(journey.missingContextKeys) && journey.missingContextKeys.length > 0,
    });

    if (validation.issues.length > 0) {
      console.info('[GUIDANCE] validation adjusted action', {
        journeyId: journey.id,
        signalId: signal?.id ?? null,
        issueCodes: validation.issues.map((item) => item.code),
        suppressed: validation.shouldSuppress,
      });
    }

    const adjustedConfidenceScore = guidanceValidationService.sanitizeConfidenceScore(
      validation.sanitized.confidenceScore - validation.confidencePenalty
    );
    const adjustedConfidenceLabel = this.confidenceLabel(adjustedConfidenceScore);

    const adjustedPriorityScore = validation.sanitized.priorityScore;
    const adjustedPriorityBucket: 'HIGH' | 'MEDIUM' | 'LOW' =
      adjustedPriorityScore >= 72 ? 'HIGH' : adjustedPriorityScore < 40 ? 'LOW' : 'MEDIUM';
    const adjustedPriorityGroup: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION' =
      adjustedPriorityBucket === 'HIGH'
        ? 'IMMEDIATE'
        : adjustedPriorityBucket === 'MEDIUM'
          ? 'UPCOMING'
          : 'OPTIMIZATION';

    const explanation = guidanceCopyService.buildActionExplanation({
      issueDomain: journey.issueDomain,
      signalIntentFamily: signal?.signalIntentFamily ?? null,
      stepKey: polishedNextStep?.stepKey ?? polishedCurrentStep?.stepKey ?? null,
      stepLabel: polishedNextStep?.label ?? polishedCurrentStep?.label ?? null,
      priorityBucket: adjustedPriorityBucket,
      fundingGapFlag: financial.fundingGapFlag,
      costOfDelay: validation.sanitized.costOfDelay,
      coverageImpact: financial.coverageImpact,
      confidenceLabel: adjustedConfidenceLabel,
    });

    const baseWarnings = guidanceCopyService.polishWarnings(next?.warnings ?? [], {
      confidenceLabel: adjustedConfidenceLabel,
      fundingGapFlag: financial.fundingGapFlag,
    });
    const validationWarnings = validation.issues.map((item) => item.message);
    const warnings = Array.from(new Set([...baseWarnings, ...validationWarnings]));

    const polishedNext = next
      ? {
          ...next,
          currentStep: polishedCurrentStep,
          nextStep: polishedNextStep,
          warnings,
          blockedReason: guidanceCopyService.polishBlockedReason(next.blockedReason ?? null, {
            missingPrerequisites: next.missingPrerequisites ?? [],
          }),
          priorityScore: adjustedPriorityScore,
          priorityBucket: adjustedPriorityBucket,
          priorityGroup: adjustedPriorityGroup,
          confidenceScore: adjustedConfidenceScore,
          confidenceLabel: adjustedConfidenceLabel,
          financialImpactScore: validation.sanitized.financialImpactScore,
          fundingGapFlag: financial.fundingGapFlag,
          costOfDelay: validation.sanitized.costOfDelay,
          coverageImpact: financial.coverageImpact,
          explanation,
          nextStepLabel: explanation.nextStep,
          validationIssues: validation.issues,
        }
      : null;

    const enrichedJourney = {
      ...journey,
      steps: polishedSteps,
      priorityScore: adjustedPriorityScore,
      priorityBucket: adjustedPriorityBucket,
      priorityGroup: adjustedPriorityGroup,
      confidenceScore: adjustedConfidenceScore,
      confidenceLabel: adjustedConfidenceLabel,
      financialImpactScore: validation.sanitized.financialImpactScore,
      fundingGapFlag: financial.fundingGapFlag,
      costOfDelay: validation.sanitized.costOfDelay,
      coverageImpact: financial.coverageImpact,
      explanation,
      nextStepLabel: explanation.nextStep,
      validationIssues: validation.issues,
      signalFreshness,
      derivedFreshness,
    };

    return {
      journey: enrichedJourney,
      signal,
      next: polishedNext,
      priorityScore: adjustedPriorityScore,
      priorityBucket: adjustedPriorityBucket,
      priorityGroup: adjustedPriorityGroup,
      confidenceScore: adjustedConfidenceScore,
      confidenceLabel: adjustedConfidenceLabel,
      financialImpactScore: validation.sanitized.financialImpactScore,
      fundingGapFlag: financial.fundingGapFlag,
      costOfDelay: validation.sanitized.costOfDelay,
      coverageImpact: financial.coverageImpact,
      explanation,
      validationIssues: validation.issues,
      validationShouldSuppress: validation.shouldSuppress,
    };
  }

  private async findReusableJourney(args: {
    propertyId: string;
    journeyTypeKey: string;
    inventoryItemId: string | null;
    homeAssetId: string | null;
    duplicateGroupKey: string;
  }) {
    const { guidanceJourney } = getGuidanceModels();

    const mergedGroupMatch = await guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        status: 'ACTIVE',
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

    if (mergedGroupMatch) return mergedGroupMatch;

    const strictMatch = await guidanceJourney.findFirst({
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

    if (strictMatch) return strictMatch;

    return guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        status: 'ACTIVE',
        journeyTypeKey: args.journeyTypeKey,
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
          // S6-40: Record which template version created these steps for staleness detection
          templateVersion: `${template.journeyTypeKey}@${template.version}`,
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
          actorType: params.actorUserId ? 'USER' : 'SYSTEM',
          actorUserId: params.actorUserId ?? null,
          payloadJson: {
            journeyTypeKey: template.journeyTypeKey,
            signalIntentFamily: params.signal.signalIntentFamily,
          },
        },
      });
    } else {
      const isSameJourneyType = journey.journeyTypeKey === template.journeyTypeKey;
      journey = await guidanceJourney.update({
        where: { id: journey.id },
        data: {
          primarySignalId: journey.primarySignalId ?? params.signal.id,
          issueDomain: isSameJourneyType
            ? params.signal.issueDomain ?? journey.issueDomain
            : journey.issueDomain,
          decisionStage: isSameJourneyType
            ? params.signal.decisionStage ?? journey.decisionStage
            : journey.decisionStage,
          executionReadiness: isSameJourneyType
            ? params.signal.executionReadiness ?? journey.executionReadiness
            : journey.executionReadiness,
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
          version: { increment: 1 },
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

    const defaultStepKey = getDefaultStepKey(input.sourceToolKey, journey.journeyTypeKey ?? null);
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

    const next = await guidanceStepResolverService.resolveNextStep({
      propertyId,
      journeyId: journey.id,
    });

    const enriched = this.enrichAction({
      journey,
      signal: journey.primarySignal ?? null,
      next,
    });

    return {
      ...enriched.journey,
      events: journey.events ?? [],
    };
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

    const nextMap = new Map<string, any>();
    for (const next of nextByJourney) {
      nextMap.set(next.journeyId, next);
    }

    const enriched = journeys.map((journey: any) =>
      this.enrichAction({
        journey,
        signal: journey.primarySignal ?? null,
        next: nextMap.get(journey.id) ?? null,
      })
    );

    const suppression = guidanceSuppressionService.suppress(enriched);
    const surfaced = suppression.filteredActions;
    const surfacedSignalIds = new Set(
      surfaced
        .map((item) => item.signal?.id ?? item.journey?.primarySignalId ?? null)
        .filter((value): value is string => Boolean(value))
    );

    const visibleSignals =
      surfacedSignalIds.size > 0
        ? signals.filter((signal: any) => surfacedSignalIds.has(signal.id))
        : [];

    return {
      propertyId,
      counts: {
        activeSignals: signals.length,
        activeJourneys: journeys.length,
        surfacedSignals: visibleSignals.length,
        surfacedJourneys: surfaced.length,
        suppressedSignals: suppression.suppressedSignals.length,
      },
      signals: visibleSignals,
      journeys: surfaced.map((item) => item.journey),
      next: surfaced
        .map((item) => item.next)
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      suppressedSignals: suppression.suppressedSignals,
    };
  }

  async resolveNextStepWithIntelligence(params: { propertyId: string; journeyId: string }) {
    const journey = await this.getJourneyById(params.propertyId, params.journeyId);
    const next = await guidanceStepResolverService.resolveNextStep({
      propertyId: params.propertyId,
      journeyId: params.journeyId,
    });

    return this.enrichAction({
      journey,
      signal: journey.primarySignal ?? null,
      next,
    }).next;
  }
}

export const guidanceJourneyService = new GuidanceJourneyService();
