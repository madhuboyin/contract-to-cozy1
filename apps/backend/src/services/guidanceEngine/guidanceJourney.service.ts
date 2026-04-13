import { APIError } from '../../middleware/error.middleware';
import { prisma } from '../../lib/prisma';
import { getGuidanceTemplateBySignalFamily, getDefaultStepKey, getTemplateByIssueType } from './guidanceTemplateRegistry';
import { guidanceSignalResolverService } from './guidanceSignalResolver.service';
import { guidanceStepResolverService } from './guidanceStepResolver.service';
import { guidanceFinancialContextService } from './guidanceFinancialContext.service';
import { guidanceConfidenceService } from './guidanceConfidence.service';
import { guidancePriorityService } from './guidancePriority.service';
import { guidanceSuppressionService } from './guidanceSuppression.service';
import { guidanceCopyService } from './guidanceCopy.service';
import { guidanceValidationService } from './guidanceValidation.service';
import {
import { logger } from '../../lib/logger';
  clampConfidenceToDecimal,
  GuidanceEvidenceSourceType,
  GuidanceEvidenceStatus,
  GuidanceEvidenceType,
  GuidanceSignalSourceInput,
  GuidanceToolCompletionInput,
  UserInitiatedJourneyInput,
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

function hasProofBackedCompletionPayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return false;
  const normalized = asRecord(payload);
  const proofType = normalized.proofType;
  if (typeof proofType !== 'string' || proofType.trim().length === 0) return false;

  const proofIdKeys = [
    'proofId',
    'evidenceId',
    'recordId',
    'bookingId',
    'policyId',
    'quoteId',
    'matchId',
    'taskId',
    'analysisId',
    'sourceEntityId',
  ];

  return proofIdKeys.some((key) => {
    const value = normalized[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readFirstNonEmptyString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toNonEmptyString(record[key]);
    if (value) return value;
  }
  return null;
}

function inferEvidenceType(args: {
  sourceToolKey: string | null;
  sourceEntityType: string | null;
  proofType: string | null;
}): GuidanceEvidenceType {
  const sourceToolKey = String(args.sourceToolKey ?? '').toLowerCase();
  const sourceEntityType = String(args.sourceEntityType ?? '').toUpperCase();
  const proofType = String(args.proofType ?? '').toLowerCase();

  if (
    sourceToolKey.includes('book') ||
    sourceEntityType.includes('BOOKING') ||
    proofType.includes('booking')
  ) {
    return 'BOOKING_RECORD';
  }
  if (
    sourceToolKey.includes('coverage') ||
    sourceToolKey.includes('warranty') ||
    sourceEntityType.includes('POLICY') ||
    proofType.includes('coverage')
  ) {
    return 'POLICY_UPDATE';
  }
  if (
    sourceToolKey.includes('quote') ||
    sourceToolKey.includes('price-radar') ||
    sourceEntityType.includes('QUOTE') ||
    proofType.includes('quote')
  ) {
    return 'QUOTE_CAPTURE';
  }
  if (
    sourceToolKey.includes('negotiation') ||
    sourceEntityType.includes('NEGOTIATION') ||
    proofType.includes('negotiation')
  ) {
    return 'NEGOTIATION_ARTIFACT';
  }
  if (
    sourceToolKey.includes('document') ||
    sourceToolKey.includes('vault') ||
    sourceEntityType.includes('DOCUMENT') ||
    proofType.includes('document')
  ) {
    return 'DOCUMENT_PROOF';
  }
  if (sourceToolKey === 'frontend' || proofType.includes('checkpoint') || proofType.includes('confirmation')) {
    return 'USER_CONFIRMATION';
  }
  return 'TOOL_RESULT';
}

function inferEvidenceSourceType(args: {
  sourceToolKey: string | null;
  sourceEntityType: string | null;
  actorUserId: string | null | undefined;
}): GuidanceEvidenceSourceType {
  const sourceToolKey = String(args.sourceToolKey ?? '').toLowerCase();
  const sourceEntityType = String(args.sourceEntityType ?? '').toUpperCase();
  if (sourceToolKey === 'frontend') return 'USER_INPUT';
  if (sourceToolKey.includes('worker') || sourceEntityType.includes('WORKER')) return 'SYSTEM_WORKER';
  if (
    sourceToolKey.includes('integration') ||
    sourceEntityType.includes('INTEGRATION') ||
    sourceEntityType.includes('WEBHOOK')
  ) {
    return 'INTEGRATION';
  }
  if (!args.actorUserId) return 'EVENT_PIPELINE';
  return 'INTERNAL_TOOL';
}

function inferEvidenceStatus(args: {
  stepStatus: GuidanceToolCompletionInput['status'];
  proofType: string | null;
  sourceToolKey: string | null;
}): GuidanceEvidenceStatus {
  if (args.stepStatus !== 'COMPLETED') return 'CAPTURED';
  const sourceToolKey = String(args.sourceToolKey ?? '').toLowerCase();
  const proofType = String(args.proofType ?? '').toLowerCase();
  if (sourceToolKey === 'frontend' && proofType.includes('checkpoint')) {
    return 'CAPTURED';
  }
  return 'VERIFIED';
}

function shouldCaptureEvidence(args: {
  sourceEntityId: string | null;
  proofType: string | null;
  proofId: string | null;
  producedData: Record<string, unknown> | null | undefined;
  status: GuidanceToolCompletionInput['status'];
}): boolean {
  if (args.status === 'COMPLETED' || args.status === 'IN_PROGRESS') return true;
  if (args.sourceEntityId || args.proofType || args.proofId) return true;
  return guidanceValidationService.hasMeaningfulProducedData(args.producedData ?? null);
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
  private async resolveScopeFromSourceEntity(input: {
    propertyId: string;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    inventoryItemId?: string | null;
    homeAssetId?: string | null;
  }): Promise<{ inventoryItemId: string | null; homeAssetId: string | null }> {
    let inventoryItemId = input.inventoryItemId ?? null;
    let homeAssetId = input.homeAssetId ?? null;

    if (inventoryItemId || homeAssetId) {
      return { inventoryItemId, homeAssetId };
    }

    const sourceEntityType = String(input.sourceEntityType ?? '').trim().toUpperCase();
    const sourceEntityId = toNonEmptyString(input.sourceEntityId);
    if (!sourceEntityType || !sourceEntityId) {
      return { inventoryItemId, homeAssetId };
    }

    const db = prisma as any;

    try {
      if (sourceEntityType === 'REPLACE_REPAIR_ANALYSIS' && db.replaceRepairAnalysis) {
        const row = await db.replaceRepairAnalysis.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
      } else if (sourceEntityType === 'RECALL_MATCH' && db.recallMatch) {
        const row = await db.recallMatch.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true, homeAssetId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
        if (row?.homeAssetId) homeAssetId = row.homeAssetId;
      } else if (sourceEntityType === 'PRICE_FINALIZATION' && db.priceFinalization) {
        const row = await db.priceFinalization.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true, homeAssetId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
        if (row?.homeAssetId) homeAssetId = row.homeAssetId;
      } else if (sourceEntityType === 'BOOKING' && db.booking) {
        const row = await db.booking.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true, homeAssetId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
        if (row?.homeAssetId) homeAssetId = row.homeAssetId;
      } else if (sourceEntityType === 'SERVICE_PRICE_RADAR_CHECK' && db.serviceRadarCheckSystemLink) {
        const applianceLink = await db.serviceRadarCheckSystemLink.findFirst({
          where: {
            serviceRadarCheckId: sourceEntityId,
            linkedEntityType: 'APPLIANCE',
          },
          select: { linkedEntityId: true },
        });
        if (applianceLink?.linkedEntityId) inventoryItemId = applianceLink.linkedEntityId;

        const systemLink = await db.serviceRadarCheckSystemLink.findFirst({
          where: {
            serviceRadarCheckId: sourceEntityId,
            linkedEntityType: 'SYSTEM',
          },
          select: { linkedEntityId: true },
        });
        if (systemLink?.linkedEntityId) homeAssetId = systemLink.linkedEntityId;
      }
    } catch (error) {
      logger.warn('[GUIDANCE] failed to infer scope from source entity', {
        propertyId: input.propertyId,
        sourceEntityType,
        sourceEntityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { inventoryItemId, homeAssetId };
  }

  private async captureStepEvidence(args: {
    input: GuidanceToolCompletionInput;
    signal: any | null;
    journey: any;
    step: any;
    resolvedStepKey: string;
  }) {
    const { guidanceStepEvidence } = getGuidanceModels();
    if (!guidanceStepEvidence) return null;

    const producedData = args.input.producedData ?? null;
    const producedRecord = asRecord(producedData);
    const metadataRecord = asRecord(args.input.metadata);

    const proofType =
      toNonEmptyString(producedRecord.proofType) ?? toNonEmptyString(metadataRecord.proofType);
    const proofId =
      readFirstNonEmptyString(producedRecord, [
        'proofId',
        'evidenceId',
        'recordId',
        'bookingId',
        'policyId',
        'quoteId',
        'matchId',
        'taskId',
        'analysisId',
        'sourceEntityId',
      ]) ??
      readFirstNonEmptyString(metadataRecord, [
        'proofId',
        'evidenceId',
        'recordId',
        'bookingId',
        'policyId',
        'quoteId',
        'matchId',
        'taskId',
        'analysisId',
      ]);

    const evidenceRefType =
      toNonEmptyString(args.input.sourceEntityType) ??
      toNonEmptyString(producedRecord.sourceEntityType) ??
      toNonEmptyString(metadataRecord.sourceEntityType);
    const evidenceRefId =
      toNonEmptyString(args.input.sourceEntityId) ??
      toNonEmptyString(producedRecord.sourceEntityId) ??
      toNonEmptyString(metadataRecord.sourceEntityId) ??
      proofId;

    if (
      !shouldCaptureEvidence({
        sourceEntityId: evidenceRefId,
        proofType,
        proofId,
        producedData,
        status: args.input.status,
      })
    ) {
      return null;
    }

    const confidenceCandidate =
      typeof producedRecord.confidenceScore === 'number'
        ? producedRecord.confidenceScore
        : typeof metadataRecord.confidenceScore === 'number'
          ? metadataRecord.confidenceScore
          : null;
    const confidenceScore = clampConfidenceToDecimal(confidenceCandidate);

    const evidenceType = inferEvidenceType({
      sourceToolKey: args.input.sourceToolKey ?? null,
      sourceEntityType: evidenceRefType,
      proofType,
    });
    const sourceType = inferEvidenceSourceType({
      sourceToolKey: args.input.sourceToolKey ?? null,
      sourceEntityType: evidenceRefType,
      actorUserId: args.input.actorUserId ?? null,
    });
    const status = inferEvidenceStatus({
      stepStatus: args.input.status,
      proofType,
      sourceToolKey: args.input.sourceToolKey ?? null,
    });

    try {
      return await guidanceStepEvidence.create({
        data: {
          propertyId: args.input.propertyId,
          journeyId: args.journey.id,
          stepId: args.step.id,
          signalId: args.signal?.id ?? args.journey.primarySignalId ?? null,
          homeAssetId:
            args.journey.homeAssetId ??
            args.signal?.homeAssetId ??
            args.input.homeAssetId ??
            null,
          inventoryItemId:
            args.journey.inventoryItemId ??
            args.signal?.inventoryItemId ??
            args.input.inventoryItemId ??
            null,
          evidenceType,
          sourceType,
          status,
          sourceToolKey: args.input.sourceToolKey ?? null,
          sourceFeatureKey:
            toNonEmptyString(metadataRecord.sourceFeatureKey) ?? args.input.sourceToolKey ?? null,
          evidenceRefType,
          evidenceRefId,
          proofType,
          proofId,
          confidenceScore,
          observedAt: new Date(),
          createdByUserId: args.input.actorUserId ?? null,
          payloadJson: producedData,
          metadataJson: {
            ...metadataRecord,
            stepStatus: args.input.status,
            stepKey: args.resolvedStepKey,
            reasonCode: args.input.reasonCode ?? null,
            reasonMessage: args.input.reasonMessage ?? null,
          },
        },
      });
    } catch (error: any) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code === 'P2021' || code === 'P2022') {
        logger.warn('[GUIDANCE] GuidanceStepEvidence table/column missing; skipping evidence write', {
          propertyId: args.input.propertyId,
          journeyId: args.journey.id,
          stepId: args.step.id,
          prismaCode: code,
        });
        return null;
      }
      throw error;
    }
  }

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
      logger.info('[GUIDANCE] validation adjusted action', {
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
      itemName: (journey as any).inventoryItem?.name ?? null,
      assetType: (journey as any).homeAsset?.assetType ?? null,
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

      await guidanceJourneyEvent.create({
        data: {
          propertyId: params.propertyId,
          journeyId: journey.id,
          signalId: params.signal.id,
          eventType: 'CONTEXT_UPDATED',
          actorType: params.actorUserId ? 'USER' : 'SYSTEM',
          actorUserId: params.actorUserId ?? null,
          changedKeys: ['sourceSignalId', 'sourceEntityType', 'sourceEntityId', 'sourceToolKey', 'updatedFromSignalAt'],
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
    const normalizedSourceToolKey = String(input.sourceToolKey ?? '').trim().toLowerCase();

    if (
      input.status === 'COMPLETED' &&
      normalizedSourceToolKey === 'frontend' &&
      !hasProofBackedCompletionPayload(input.producedData ?? null)
    ) {
      throw new APIError(
        'Proof-backed completion data is required before marking this step complete.',
        400,
        'GUIDANCE_PROOF_REQUIRED'
      );
    }

    let signal: any | null = null;
    let journey: any | null = null;
    const inferredScope = await this.resolveScopeFromSourceEntity({
      propertyId: input.propertyId,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      inventoryItemId: input.inventoryItemId ?? null,
      homeAssetId: input.homeAssetId ?? null,
    });
    const resolvedInventoryItemId = input.inventoryItemId ?? inferredScope.inventoryItemId ?? null;
    const resolvedHomeAssetId = input.homeAssetId ?? inferredScope.homeAssetId ?? null;

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
        homeAssetId: resolvedHomeAssetId,
        inventoryItemId: resolvedInventoryItemId,
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

    await this.captureStepEvidence({
      input,
      signal,
      journey: transitioned.journey,
      step: transitioned.step,
      resolvedStepKey,
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
        evidences: {
          orderBy: [{ observedAt: 'desc' }],
          take: 75,
        },
        inventoryItem: {
          select: { name: true, category: true },
        },
        homeAsset: {
          select: { assetType: true },
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
        inventoryItem: {
          select: { name: true, category: true },
        },
        homeAsset: {
          select: { assetType: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async listSignalsForProperty(propertyId: string) {
    const { guidanceSignal } = getGuidanceModels();
    const now = new Date();

    return guidanceSignal.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ lastObservedAt: 'desc' }],
    });
  }

  async getPropertyGuidance(propertyId: string, options?: { userSelectedScopeId?: string }) {
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

    const suppression = guidanceSuppressionService.suppress(enriched, {
      userSelectedScopeId: options?.userSelectedScopeId,
    });
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

  async createUserInitiatedJourney(
    propertyId: string,
    input: UserInitiatedJourneyInput,
    actorUserId: string
  ) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();
    const template = getTemplateByIssueType(input.issueType, input.scopeCategory);
    const now = new Date();

    const scopeId = input.scopeId;
    const inventoryItemId = input.inventoryItemId ?? (input.scopeCategory === 'ITEM' ? input.scopeId : null) ?? null;
    const homeAssetId = input.homeAssetId ?? null;
    const serviceKey = input.serviceKey ?? (input.scopeCategory === 'SERVICE' ? input.scopeId : null) ?? null;

    const journey = await guidanceJourney.create({
      data: {
        propertyId,
        homeAssetId,
        inventoryItemId,
        primarySignalId: null,
        journeyKey: template.journeyKey,
        journeyTypeKey: template.journeyTypeKey,
        templateVersion: `${template.journeyTypeKey}@${template.version}`,
        issueDomain: template.issueDomain,
        decisionStage: template.defaultDecisionStage,
        executionReadiness: template.defaultReadiness,
        status: 'NOT_STARTED',
        scopeCategory: input.scopeCategory,
        scopeId,
        issueType: input.issueType,
        serviceKey,
        isUserInitiated: true,
        isLowContext: false,
        missingContextKeys: [],
        currentStepOrder: null,
        currentStepKey: template.canonicalFirstStepKey,
        contextSnapshotJson: {
          initiatedByUserId: actorUserId,
          issueType: input.issueType,
          scopeCategory: input.scopeCategory,
          scopeId,
        },
        derivedSnapshotJson: null,
        startedAt: now,
        lastTransitionAt: now,
      },
      include: {
        steps: { orderBy: [{ stepOrder: 'asc' }] },
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId,
        journeyId: journey.id,
        signalId: null,
        eventType: 'JOURNEY_CREATED',
        actorType: 'USER',
        actorUserId,
        payloadJson: {
          journeyTypeKey: template.journeyTypeKey,
          issueType: input.issueType,
          scopeCategory: input.scopeCategory,
          scopeId,
          isUserInitiated: true,
        },
      },
    });

    await guidanceStepResolverService.ensureTemplateSteps({
      propertyId,
      journeyId: journey.id,
      templateSteps: template.steps,
      actorUserId,
      signalId: null,
    });

    return guidanceStepResolverService.recomputeJourneyState({
      propertyId,
      journeyId: journey.id,
      actorUserId,
      signalId: null,
    });
  }

  async dismissJourney(
    propertyId: string,
    journeyId: string,
    actorUserId: string,
    dismissedReason?: string | null
  ) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();
    const now = new Date();

    const journey = await guidanceJourney.findFirst({
      where: { id: journeyId, propertyId },
    });

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    const updated = await guidanceJourney.update({
      where: { id: journeyId },
      data: {
        status: 'DISMISSED',
        dismissedReason: dismissedReason ?? null,
        dismissedAt: now,
        lastTransitionAt: now,
        version: { increment: 1 },
      },
      include: {
        steps: { orderBy: [{ stepOrder: 'asc' }] },
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId,
        journeyId,
        signalId: journey.primarySignalId ?? null,
        eventType: 'JOURNEY_DISMISSED',
        fromJourneyStatus: journey.status as any,
        toJourneyStatus: 'DISMISSED' as any,
        actorType: 'USER',
        actorUserId,
        reasonCode: 'USER_DISMISSED',
        reasonMessage: dismissedReason ?? null,
        payloadJson: { dismissedReason: dismissedReason ?? null },
      },
    });

    return updated;
  }

  async changeIssueForJourney(
    propertyId: string,
    journeyId: string,
    actorUserId: string,
    newIssueType: string
  ) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();

    const journey = await guidanceJourney.findFirst({
      where: { id: journeyId, propertyId },
    });

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    const scopeCategory = (journey.scopeCategory as string) ?? 'ITEM';
    const newTemplate = getTemplateByIssueType(newIssueType, scopeCategory);
    const now = new Date();

    await guidanceJourney.update({
      where: { id: journeyId },
      data: {
        issueType: newIssueType,
        journeyKey: newTemplate.journeyKey,
        journeyTypeKey: newTemplate.journeyTypeKey,
        templateVersion: `${newTemplate.journeyTypeKey}@${newTemplate.version}`,
        issueDomain: newTemplate.issueDomain,
        decisionStage: newTemplate.defaultDecisionStage,
        executionReadiness: newTemplate.defaultReadiness,
        status: 'NOT_STARTED',
        currentStepOrder: null,
        currentStepKey: newTemplate.canonicalFirstStepKey,
        lastTransitionAt: now,
        version: { increment: 1 },
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId,
        journeyId,
        signalId: journey.primarySignalId ?? null,
        eventType: 'JOURNEY_ISSUE_CHANGED',
        actorType: 'USER',
        actorUserId,
        reasonCode: 'USER_CHANGED_ISSUE',
        reasonMessage: newIssueType,
        payloadJson: {
          previousIssueType: journey.issueType ?? null,
          newIssueType,
          newJourneyTypeKey: newTemplate.journeyTypeKey,
        },
      },
    });

    await guidanceStepResolverService.ensureTemplateSteps({
      propertyId,
      journeyId,
      templateSteps: newTemplate.steps,
      actorUserId,
      signalId: null,
    });

    return guidanceStepResolverService.recomputeJourneyState({
      propertyId,
      journeyId,
      actorUserId,
      signalId: null,
    });
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

  // ---------------------------------------------------------------------------
  // FRD-FR-03: Context Injector — 2-Year Lookback
  // Called during the verify_history step to determine whether the user needs
  // to fill in historical service data. Also returns the last 3 events for the
  // asset history sidebar rendered inside GuidanceDrawer.
  // ---------------------------------------------------------------------------
  async getAssetResolutionContext(
    propertyId: string,
    inventoryItemId: string
  ): Promise<{
    hasHistory: boolean;
    lookbackRequired: boolean;
    recentEvents: Array<{
      id: string;
      type: string;
      title: string;
      occurredAt: Date;
      amount: unknown;
      isRetrospective: boolean;
    }>;
  }> {
    const db = prisma as any;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);

    const events = await db.homeEvent.findMany({
      where: {
        propertyId,
        inventoryItemId,
        occurredAt: { gte: cutoff },
        type: { in: ['REPAIR', 'MAINTENANCE', 'INSPECTION', 'VERIFIED_RESOLUTION'] },
      },
      orderBy: { occurredAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        title: true,
        occurredAt: true,
        amount: true,
        isRetrospective: true,
      },
    });

    const hasHistory = events.length > 0;
    return {
      hasHistory,
      lookbackRequired: !hasHistory,
      recentEvents: events.slice(0, 3),
    };
  }

  // ---------------------------------------------------------------------------
  // FRD-FR-11/FR-12: Journey Completion Side Effects
  // Called by guidanceStepResolver.service.ts when all required steps are done
  // and the journey transitions to COMPLETED.
  // Side effects:
  //   1. Sets InventoryItem.condition = GOOD  (FR-12)
  //   2. Creates HomeEvent of type VERIFIED_RESOLUTION linked to journey (FR-11)
  // Note: lastServicedOn is already set by booking.service.ts at booking
  // completion (Phase 5.1) — do not overwrite it here to avoid stale timestamps.
  // ---------------------------------------------------------------------------
  async onJourneyCompleted(journeyId: string): Promise<void> {
    const { guidanceJourney } = getGuidanceModels();
    const db = prisma as any;

    const journey = await guidanceJourney.findUnique({
      where: { id: journeyId },
      select: {
        id: true,
        propertyId: true,
        inventoryItemId: true,
        issueType: true,
        isUserInitiated: true,
      },
    });

    if (!journey || !journey.isUserInitiated) return;

    await db.$transaction(async (tx: any) => {
      // FR-12: Update asset condition to GOOD
      if (journey.inventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: journey.inventoryItemId },
          data: { condition: 'GOOD' },
        });
      }

      // FR-11: Create certified VERIFIED_RESOLUTION HomeEvent
      await tx.homeEvent.create({
        data: {
          propertyId: journey.propertyId,
          inventoryItemId: journey.inventoryItemId ?? undefined,
          guidanceJourneyId: journey.id,
          type: 'VERIFIED_RESOLUTION',
          title: `Issue resolved: ${journey.issueType ?? 'Asset serviced'}`,
          summary: 'Guided resolution completed via the Guidance Engine. All required steps were verified.',
          occurredAt: new Date(),
          sourceBadge: 'VERIFIED',
          importance: 'HIGH',
          isRetrospective: false,
        },
      });
    });
  }
}

export const guidanceJourneyService = new GuidanceJourneyService();
