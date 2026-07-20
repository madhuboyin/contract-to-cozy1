import { APIError } from '../../middleware/error.middleware';
import { prisma } from '../../lib/prisma';
import { getGuidanceTemplateBySignalFamily, getDefaultStepKey, getStepSkipPolicy, getTemplateByIssueType, getTemplateByJourneyTypeKey } from './guidanceTemplateRegistry';
import { guidanceSignalResolverService } from './guidanceSignalResolver.service';
import { guidanceStepResolverService } from './guidanceStepResolver.service';
import { guidanceFinancialContextService } from './guidanceFinancialContext.service';
import { guidanceConfidenceService } from './guidanceConfidence.service';
import { guidancePriorityService } from './guidancePriority.service';
import { guidanceSuppressionService } from './guidanceSuppression.service';
import { guidanceCopyService } from './guidanceCopy.service';
import { guidanceValidationService } from './guidanceValidation.service';
import { guidanceAdvisorService } from './guidanceAdvisor.service';
import {
  clampConfidenceToDecimal,
  GuidanceEvidenceCompatibility,
  GuidanceEvidenceScopeCategory,
  GuidanceEvidenceSourceType,
  GuidanceEvidenceStatus,
  GuidanceEvidenceType,
  GuidanceSignalSourceInput,
  GuidanceToolCompletionInput,
  UserInitiatedJourneyInput,
  RepairReplaceBranchChoice,
  RepairReplaceVerdict,
  getGuidanceModels,
} from './guidanceTypes';
import { logger } from '../../lib/logger';
import { recordToolLifecycleEvents } from '../analytics/toolLifecycle';

const ACTIVE_GUIDANCE_JOURNEY_STATUSES = ['ACTIVE', 'NOT_STARTED'] as const;
const REPLACEMENT_BRANCH_TYPE_BY_CHOICE: Record<
  Extract<RepairReplaceBranchChoice, 'CONTINUE_REPLACEMENT' | 'PLAN_LATER' | 'SHOP_NOW'>,
  { branchType: string; journeyTypeKey: string; issueType: string }
> = {
  CONTINUE_REPLACEMENT: {
    branchType: 'REPLACEMENT_PURCHASE_NOW',
    journeyTypeKey: 'replacement_purchase_now',
    issueType: 'replacement_purchase_now',
  },
  PLAN_LATER: {
    branchType: 'REPLACEMENT_PLAN_LATER',
    journeyTypeKey: 'replacement_plan_later',
    issueType: 'replacement_plan_later',
  },
  SHOP_NOW: {
    branchType: 'REPLACEMENT_SHOP_NOW',
    journeyTypeKey: 'replacement_shop_now',
    issueType: 'replacement_shop_now',
  },
};

const CLEANING_JOURNEY_SELECTION_BY_ISSUE: Record<
  string,
  { selectedCleaningType: string; selectedCleaningTypeLabel: string }
> = {
  deep_clean: {
    selectedCleaningType: 'deep_clean',
    selectedCleaningTypeLabel: 'One-time deep clean',
  },
  move_clean: {
    selectedCleaningType: 'move_clean',
    selectedCleaningTypeLabel: 'Move-in / move-out clean',
  },
  post_construction: {
    selectedCleaningType: 'post_construction',
    selectedCleaningTypeLabel: 'Post-construction clean-up',
  },
};

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isSatisfiedJourneyStep(step: any, journeyTypeKey: string | null | undefined): boolean {
  if (step?.status === 'COMPLETED') return true;
  if (step?.status !== 'SKIPPED') return false;
  return getStepSkipPolicy(journeyTypeKey ?? null, step?.stepKey ?? null) === 'ALLOWED';
}

type GuidanceEvidenceScopeSnapshot = {
  category: GuidanceEvidenceScopeCategory;
  scopeId: string | null;
};

function normalizeEvidenceScopeCategory(value: unknown): GuidanceEvidenceScopeCategory | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === 'PROPERTY' ||
    normalized === 'ITEM' ||
    normalized === 'SERVICE' ||
    normalized === 'UNKNOWN'
  ) {
    return normalized;
  }
  return null;
}

function buildEvidenceScopeSnapshot(
  category: GuidanceEvidenceScopeCategory,
  scopeId: string | null
): GuidanceEvidenceScopeSnapshot {
  return {
    category,
    scopeId: toNonEmptyString(scopeId),
  };
}

function inferExpectedEvidenceScope(journey: any): GuidanceEvidenceScopeSnapshot {
  if (journey?.scopeCategory === 'SERVICE') {
    return buildEvidenceScopeSnapshot('SERVICE', journey?.scopeId ?? journey?.serviceKey ?? null);
  }
  if (journey?.inventoryItemId) {
    return buildEvidenceScopeSnapshot('ITEM', journey.inventoryItemId);
  }
  return buildEvidenceScopeSnapshot('PROPERTY', journey?.propertyId ?? null);
}

function inferActualEvidenceScope(args: {
  input: GuidanceToolCompletionInput;
  journey: any;
  signal: any | null;
  producedRecord: Record<string, unknown>;
  metadataRecord: Record<string, unknown>;
}): GuidanceEvidenceScopeSnapshot {
  const explicitCategory =
    normalizeEvidenceScopeCategory(args.metadataRecord.actualScopeCategory) ??
    normalizeEvidenceScopeCategory(args.producedRecord.actualScopeCategory) ??
    normalizeEvidenceScopeCategory(args.metadataRecord.scopeCategory) ??
    normalizeEvidenceScopeCategory(args.producedRecord.scopeCategory);

  const explicitScopeId =
    readFirstNonEmptyString(args.metadataRecord, ['actualScopeId', 'scopeId']) ??
    readFirstNonEmptyString(args.producedRecord, ['actualScopeId', 'scopeId']);

  if (explicitCategory) {
    const fallbackScopeId =
      explicitCategory === 'PROPERTY'
        ? args.input.propertyId
        : explicitCategory === 'SERVICE'
          ? toNonEmptyString(args.journey?.scopeId ?? args.journey?.serviceKey ?? null)
          : explicitCategory === 'ITEM'
            ? toNonEmptyString(args.input.inventoryItemId ?? args.journey?.inventoryItemId ?? args.signal?.inventoryItemId ?? null)
            : null;
    return buildEvidenceScopeSnapshot(explicitCategory, explicitScopeId ?? fallbackScopeId ?? null);
  }

  if (args.input.inventoryItemId ?? args.signal?.inventoryItemId ?? args.journey?.inventoryItemId) {
    return buildEvidenceScopeSnapshot(
      'ITEM',
      toNonEmptyString(args.input.inventoryItemId ?? args.signal?.inventoryItemId ?? args.journey?.inventoryItemId ?? null)
    );
  }

  if (args.journey?.scopeCategory === 'SERVICE' && (args.journey?.scopeId ?? args.journey?.serviceKey)) {
    return buildEvidenceScopeSnapshot(
      'SERVICE',
      toNonEmptyString(args.journey?.scopeId ?? args.journey?.serviceKey ?? null)
    );
  }

  return buildEvidenceScopeSnapshot('PROPERTY', args.input.propertyId);
}

function determineEvidenceCompatibility(args: {
  expected: GuidanceEvidenceScopeSnapshot;
  actual: GuidanceEvidenceScopeSnapshot;
}): GuidanceEvidenceCompatibility {
  const { expected, actual } = args;

  if (expected.category === 'UNKNOWN' || actual.category === 'UNKNOWN') {
    return 'UNKNOWN';
  }

  if (expected.category === actual.category) {
    if (!expected.scopeId || !actual.scopeId) return 'MATCHED';
    return expected.scopeId === actual.scopeId ? 'MATCHED' : 'MISMATCHED';
  }

  if (actual.category === 'PROPERTY' && expected.category !== 'PROPERTY') {
    return 'BROADER_CONTEXT';
  }

  return 'MISMATCHED';
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
  strategicAdvice?: string | null;
  validationIssues?: Array<{ code: string; message: string; level: 'WARN' | 'ERROR' }>;
  validationShouldSuppress?: boolean;
};

export class GuidanceJourneyService {
  private async resolveScopeFromSourceEntity(input: {
    propertyId: string;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    inventoryItemId?: string | null;
  }): Promise<{ inventoryItemId: string | null }> {
    let inventoryItemId = input.inventoryItemId ?? null;

    if (inventoryItemId) {
      return { inventoryItemId };
    }

    const sourceEntityType = String(input.sourceEntityType ?? '').trim().toUpperCase();
    const sourceEntityId = toNonEmptyString(input.sourceEntityId);
    if (!sourceEntityType || !sourceEntityId) {
      return { inventoryItemId };
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
          select: { inventoryItemId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
      } else if (sourceEntityType === 'PRICE_FINALIZATION' && db.priceFinalization) {
        const row = await db.priceFinalization.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
      } else if (sourceEntityType === 'BOOKING' && db.booking) {
        const row = await db.booking.findFirst({
          where: { id: sourceEntityId, propertyId: input.propertyId },
          select: { inventoryItemId: true },
        });
        if (row?.inventoryItemId) inventoryItemId = row.inventoryItemId;
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
        if (systemLink?.linkedEntityId) inventoryItemId = systemLink.linkedEntityId;
      }
    } catch (error) {
      logger.warn({
        propertyId: input.propertyId,
        sourceEntityType,
        sourceEntityId,
        error: error instanceof Error ? error.message : String(error),
      }, '[GUIDANCE] failed to infer scope from source entity');
    }

    return { inventoryItemId };
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
    const expectedScope = inferExpectedEvidenceScope(args.journey);
    const actualScope = inferActualEvidenceScope({
      input: args.input,
      journey: args.journey,
      signal: args.signal,
      producedRecord,
      metadataRecord,
    });
    const compatibility = determineEvidenceCompatibility({
      expected: expectedScope,
      actual: actualScope,
    });

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
          inventoryItemId: actualScope.category === 'ITEM' ? actualScope.scopeId : null,
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
          expectedScopeCategory: expectedScope.category,
          expectedScopeId: expectedScope.scopeId,
          actualScopeCategory: actualScope.category,
          actualScopeId: actualScope.scopeId,
          compatibility,
          observedAt: new Date(),
          createdByUserId: args.input.actorUserId ?? null,
          payloadJson: producedData,
          metadataJson: {
            ...metadataRecord,
            expectedScopeCategory: expectedScope.category,
            expectedScopeId: expectedScope.scopeId,
            actualScopeCategory: actualScope.category,
            actualScopeId: actualScope.scopeId,
            compatibility,
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
        logger.warn({
          propertyId: args.input.propertyId,
          journeyId: args.journey.id,
          stepId: args.step.id,
          prismaCode: code,
        }, '[GUIDANCE] GuidanceStepEvidence table/column missing; skipping evidence write');
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

  private async enrichAction(params: {
    journey: any;
    signal?: any | null;
    next?: any | null;
    includeAIAdvice?: boolean;
    userId?: string | null;
  }): Promise<EnrichedGuidanceAction> {
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
      logger.info({
        journeyId: journey.id,
        signalId: signal?.id ?? null,
        issueCodes: validation.issues.map((item) => item.code),
        suppressed: validation.shouldSuppress,
      }, '[GUIDANCE] validation adjusted action');
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
      assetType: (journey as any).inventoryItem?.assetType ?? null,
    });

    const baseWarnings = guidanceCopyService.polishWarnings(next?.warnings ?? [], {
      confidenceLabel: adjustedConfidenceLabel,
      fundingGapFlag: financial.fundingGapFlag,
    });
    const validationWarnings = validation.issues.map((item) => item.message);
    const warnings = Array.from(new Set([...baseWarnings, ...validationWarnings]));

    // FRD-FR-15: AI-powered strategic advice for the guidance overview (Top Class feature)
    let strategicAdvice: string | null = null;
    if (params.includeAIAdvice && journey.status === 'ACTIVE' && params.userId) {
      strategicAdvice = await guidanceAdvisorService.generateStrategicAdvice({
        propertyId: journey.propertyId,
        userId: params.userId,
        journeyId: journey.id,
        issueDomain: journey.issueDomain,
        signalIntentFamily: signal?.signalIntentFamily ?? null,
        assetName: (journey as any).inventoryItem?.name ?? (journey as any).inventoryItem?.assetType ?? null,
        symptom: (journey as any).producedDataJson?.symptomKey ?? (journey as any).issueType ?? null,
        currentStepLabel: explanation.nextStep,
        priorityBucket: adjustedPriorityBucket,
        costOfDelay: validation.sanitized.costOfDelay,
        coverageImpact: financial.coverageImpact,
      });
    } else if (params.includeAIAdvice && journey.status === 'ACTIVE' && !params.userId) {
      logger.warn(
        { journeyId: journey.id },
        '[GUIDANCE-ADVISOR] Skipped AI advice generation: no userId supplied to enrichAction'
      );
    }

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
      strategicAdvice,
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
      strategicAdvice,
      validationIssues: validation.issues,
      validationShouldSuppress: validation.shouldSuppress,
    };
  }

  private async findReusableJourney(args: {
    propertyId: string;
    journeyTypeKey: string;
    inventoryItemId: string | null;
    duplicateGroupKey: string;
  }) {
    const { guidanceJourney } = getGuidanceModels();

    const mergedGroupMatch = await guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        status: 'ACTIVE',
        mergedSignalGroupKey: args.duplicateGroupKey,
        inventoryItemId: args.inventoryItemId,
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
      duplicateGroupKey: params.signal.duplicateGroupKey,
    });

    const now = new Date();

    if (!journey) {
      journey = await guidanceJourney.create({
        data: {
          propertyId: params.propertyId,
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
      templateGovernance: template.governance,
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
    });
    const resolvedInventoryItemId = input.inventoryItemId ?? inferredScope.inventoryItemId ?? null;

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

    const targetStep = (journey.steps ?? []).find(
      (step: any) => step.stepKey === resolvedStepKey
    );

    if (input.status === 'COMPLETED' && targetStep?.status === 'SKIPPED') {
      await guidanceStepResolverService.markStepStatus({
        propertyId: input.propertyId,
        journeyId: journey.id,
        stepKey: resolvedStepKey,
        nextStatus: 'IN_PROGRESS',
        actorUserId: input.actorUserId ?? null,
        signalId: signal?.id ?? null,
      });
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

    const lifecycleStage = input.status === 'COMPLETED'
      ? 'COMPLETED'
      : input.status === 'IN_PROGRESS'
        ? 'STARTED'
        : 'ABANDONED';
    if (input.actorUserId && normalizedSourceToolKey && normalizedSourceToolKey !== 'frontend') {
      void recordToolLifecycleEvents({
        userId: input.actorUserId,
        propertyId: input.propertyId,
        events: [...(input.status === 'COMPLETED' ? [{
          toolId: normalizedSourceToolKey,
          stage: 'OUTPUT_GENERATED' as const,
          surface: 'guidance',
          journeyId: journey.id,
          sourceEntityId: input.sourceEntityId ?? resolvedInventoryItemId,
          completionKind: 'GUIDANCE_STEP_COMPLETED',
          outputKey: resolvedStepKey,
        }] : []), {
          toolId: normalizedSourceToolKey,
          stage: lifecycleStage,
          surface: 'guidance',
          journeyId: journey.id,
          sourceEntityId: input.sourceEntityId ?? resolvedInventoryItemId,
          completionKind: input.status === 'COMPLETED' ? 'GUIDANCE_STEP_COMPLETED' : null,
          outputKey: resolvedStepKey,
          metadata: {
            guidanceStatus: input.status,
            guidanceStepKey: resolvedStepKey,
            reasonCode: input.reasonCode ?? null,
          },
        }],
      }).catch((error) => {
        logger.warn({ error }, '[ToolLifecycle] Failed to persist guidance tool lifecycle event');
      });
    }

    return {
      signal,
      journey: transitioned.journey,
      step: transitioned.step,
      next,
    };
  }

  private buildReplaceRepairProducedData(analysis: any) {
    return {
      proofType: 'repair_replace_analysis',
      proofId: analysis.id,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      impactLevel: analysis.impactLevel ?? null,
      summary: analysis.summary ?? null,
      ageYears: analysis.ageYears ?? null,
      remainingYears: analysis.remainingYears ?? null,
      breakEvenMonths: analysis.breakEvenMonths ?? null,
      estimatedNextRepairCostCents: analysis.estimatedNextRepairCostCents ?? null,
      estimatedReplacementCostCents: analysis.estimatedReplacementCostCents ?? null,
      expectedAnnualRepairRiskCents: analysis.expectedAnnualRepairRiskCents ?? null,
      decisionTrace: analysis.decisionTrace ?? [],
      nextSteps: analysis.nextSteps ?? [],
    };
  }

  private isLegacyLifecycleCostStep(step: any) {
    const stepKey = String(step?.stepKey ?? '').toLowerCase();
    const toolKey = String(step?.toolKey ?? '').toLowerCase();
    const label = String(step?.label ?? '').toLowerCase();
    return (
      stepKey === 'estimate_cost_impact' ||
      toolKey === 'true-cost' ||
      label.includes('cost tradeoff')
    );
  }

  private getStepProducedData(step: any): Record<string, unknown> | null {
    const value = step?.producedDataJson ?? step?.producedData ?? null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private async reconcileInvalidLegacyRepairReplaceState(args: {
    propertyId: string;
    journey: any;
  }) {
    const journey = args.journey;
    if (
      journey?.journeyTypeKey !== 'asset_lifecycle_resolution' ||
      !journey?.inventoryItemId
    ) {
      return false;
    }

    const repairDecisionStep = (journey.steps ?? []).find(
      (step: any) => step.stepKey === 'repair_replace_decision'
    );
    const legacyCostStep = (journey.steps ?? []).find(
      (step: any) => this.isLegacyLifecycleCostStep(step)
    );

    if (!repairDecisionStep || !legacyCostStep) {
      return false;
    }

    const repairPayload = this.getStepProducedData(repairDecisionStep);
    const legacyCostPayload = this.getStepProducedData(legacyCostStep);
    const repairProofType = toNonEmptyString(repairPayload?.proofType);
    const legacyCostProofType = toNonEmptyString(legacyCostPayload?.proofType);

    const invalidLegacyState =
      repairDecisionStep.status === 'SKIPPED' &&
      legacyCostStep.status === 'COMPLETED' &&
      repairProofType !== 'repair_replace_analysis' &&
      legacyCostProofType === 'cost_estimate';

    if (!invalidLegacyState) {
      return false;
    }

    const filteredMissing = asStringArray(journey.missingContextKeys).filter(
      (item) => item !== 'skipped:repair_replace_decision'
    );

    await prisma.$transaction(async (tx) => {
      await (tx as any).guidanceJourneyStep.update({
        where: { id: repairDecisionStep.id },
        data: {
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
          skippedAt: null,
          skippedReason: null,
          skippedReasonCode: null,
          blockedAt: null,
          blockedReason: null,
          blockedReasonCode: null,
        },
      });

      await (tx as any).guidanceJourneyStep.update({
        where: { id: legacyCostStep.id },
        data: {
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
          blockedAt: null,
          blockedReason: null,
          blockedReasonCode: null,
        },
      });

      await (tx as any).guidanceJourney.update({
        where: { id: journey.id },
        data: {
          isLowContext: filteredMissing.length > 0,
          missingContextKeys: filteredMissing,
          version: { increment: 1 },
        },
      });
    });

    await guidanceStepResolverService.recomputeJourneyState({
      propertyId: args.propertyId,
      journeyId: journey.id,
      actorUserId: null,
      signalId: journey.primarySignalId ?? null,
    });

    return true;
  }

  private async backfillLegacyLifecycleCostEvidence(args: {
    propertyId: string;
    journey: any;
  }) {
    const journey = args.journey;
    if (
      journey?.journeyTypeKey !== 'asset_lifecycle_resolution' ||
      !journey?.inventoryItemId
    ) {
      return false;
    }

    const legacyCostStep = (journey.steps ?? []).find(
      (step: any) => this.isLegacyLifecycleCostStep(step)
    );
    if (!legacyCostStep || legacyCostStep.status !== 'COMPLETED') {
      return false;
    }

    const hasItemScopedEvidence = (journey.evidences ?? []).some(
      (evidence: any) =>
        evidence.stepId === legacyCostStep.id &&
        evidence.proofType === 'repair_replace_analysis'
    );

    const repairDecisionStep = (journey.steps ?? []).find(
      (step: any) =>
        step.stepKey === 'repair_replace_decision'
    );

    const fallbackProducedData =
      repairDecisionStep?.producedData &&
      typeof repairDecisionStep.producedData === 'object' &&
      repairDecisionStep.producedData.proofType === 'repair_replace_analysis'
        ? repairDecisionStep.producedData
        : null;
    const fallbackProofId = toNonEmptyString(fallbackProducedData?.proofId);

    const latestAnalysis = await prisma.replaceRepairAnalysis.findFirst({
      where: {
        propertyId: args.propertyId,
        inventoryItemId: journey.inventoryItemId,
      },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latestAnalysis && !fallbackProducedData) {
      return false;
    }

    const sharedProducedData = latestAnalysis
      ? this.buildReplaceRepairProducedData(latestAnalysis)
      : fallbackProducedData;
    const sharedSourceEntityId = latestAnalysis?.id ?? fallbackProofId;

    let changed = false;

    if (
      repairDecisionStep &&
      repairDecisionStep.status !== 'COMPLETED' &&
      sharedProducedData
    ) {
      try {
        await this.recordToolCompletion({
          propertyId: args.propertyId,
          actorUserId: null,
          journeyId: journey.id,
          inventoryItemId: journey.inventoryItemId,
          signalIntentFamily:
            journey.primarySignal?.signalIntentFamily ?? 'lifecycle_end_or_past_life',
          issueDomain: 'ASSET_LIFECYCLE',
          sourceToolKey: 'replace-repair',
          sourceEntityType: 'REPLACE_REPAIR_ANALYSIS',
          sourceEntityId: sharedSourceEntityId,
          stepKey: repairDecisionStep.stepKey,
          status: 'COMPLETED',
          producedData: sharedProducedData,
          metadata: {
            actualScopeCategory: 'ITEM',
            actualScopeId: journey.inventoryItemId,
            resultContextLabel: 'Item-specific repair vs replace analysis',
            legacyStepBackfill: true,
          },
        });
        changed = true;
      } catch (error) {
        logger.warn(
          {
            propertyId: args.propertyId,
            journeyId: journey.id,
            inventoryItemId: journey.inventoryItemId,
            error: error instanceof Error ? error.message : String(error),
          },
          '[GUIDANCE] failed to backfill repair/replace decision step'
        );
      }
    }

    if (hasItemScopedEvidence) {
      return changed;
    }

    try {
      await this.recordToolCompletion({
        propertyId: args.propertyId,
        actorUserId: null,
        journeyId: journey.id,
        inventoryItemId: journey.inventoryItemId,
        signalIntentFamily: journey.primarySignal?.signalIntentFamily ?? 'lifecycle_end_or_past_life',
        issueDomain: 'ASSET_LIFECYCLE',
        sourceToolKey: 'replace-repair',
        sourceEntityType: 'REPLACE_REPAIR_ANALYSIS',
        sourceEntityId: sharedSourceEntityId,
        stepKey: legacyCostStep.stepKey,
        status: 'COMPLETED',
        producedData: sharedProducedData,
        metadata: {
          actualScopeCategory: 'ITEM',
          actualScopeId: journey.inventoryItemId,
          resultContextLabel: 'Item-specific repair vs replace analysis',
          legacyStepBackfill: true,
          sourceStepKey: repairDecisionStep?.stepKey ?? null,
        },
      });
      return true;
    } catch (error) {
      logger.warn(
        {
          propertyId: args.propertyId,
          journeyId: journey.id,
          inventoryItemId: journey.inventoryItemId,
          error: error instanceof Error ? error.message : String(error),
        },
        '[GUIDANCE] failed to backfill legacy lifecycle cost evidence'
      );
      return changed;
    }
  }

  private async reconcileOutOfOrderStepState(args: {
    propertyId: string;
    journey: any;
  }) {
    const journey = args.journey;
    const steps = Array.isArray(journey?.steps) ? [...journey.steps] : [];
    if (steps.length === 0) return false;

    const sortedSteps = steps.sort((a: any, b: any) => a.stepOrder - b.stepOrder);
    let earliestUnsatisfiedRequiredOrder: number | null = null;

    for (const step of sortedSteps) {
      if (!step.isRequired) continue;
      if (isSatisfiedJourneyStep(step, journey?.journeyTypeKey ?? null)) continue;
      earliestUnsatisfiedRequiredOrder = step.stepOrder;
      break;
    }

    if (earliestUnsatisfiedRequiredOrder == null) {
      return false;
    }

    const invalidLaterSteps = sortedSteps.filter((step: any) => {
      if (step.stepOrder <= earliestUnsatisfiedRequiredOrder!) return false;
      return step.status !== 'PENDING';
    });

    if (invalidLaterSteps.length === 0) {
      return false;
    }

    const invalidStepIds = new Set(invalidLaterSteps.map((step: any) => step.id));
    const invalidStepKeys = new Set(invalidLaterSteps.map((step: any) => step.stepKey));
    const filteredMissingContextKeys = asStringArray(journey.missingContextKeys).filter((key) => {
      if (!key.startsWith('skipped:')) return true;
      const skippedStepKey = key.slice('skipped:'.length);
      return !invalidStepKeys.has(skippedStepKey);
    });

    await prisma.$transaction(async (tx) => {
      await (tx as any).guidanceJourneyStep.updateMany({
        where: {
          id: { in: Array.from(invalidStepIds) },
        },
        data: {
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
          skippedAt: null,
          skippedReason: null,
          skippedReasonCode: null,
          blockedAt: null,
          blockedReason: null,
          blockedReasonCode: null,
          unblockedAt: null,
        },
      });

      await (tx as any).guidanceJourney.update({
        where: { id: journey.id },
        data: {
          isLowContext: filteredMissingContextKeys.length > 0,
          missingContextKeys: filteredMissingContextKeys,
          version: { increment: 1 },
        },
      });
    });

    logger.warn(
      {
        propertyId: args.propertyId,
        journeyId: journey.id,
        journeyTypeKey: journey.journeyTypeKey,
        earliestUnsatisfiedRequiredOrder,
        resetStepKeys: invalidLaterSteps.map((step: any) => step.stepKey),
      },
      '[GUIDANCE] reset out-of-order journey steps'
    );

    await guidanceStepResolverService.recomputeJourneyState({
      propertyId: args.propertyId,
      journeyId: journey.id,
      actorUserId: null,
      signalId: journey.primarySignalId ?? null,
    });

    return true;
  }

  async getJourneyById(propertyId: string, journeyId: string, userId?: string | null) {
    const { guidanceJourney } = getGuidanceModels();

    const fetchJourney = (id: string) =>
      guidanceJourney.findFirst({
        where: {
          id,
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
            select: { name: true, category: true, assetType: true },
          },
        },
      });

    let journey = await fetchJourney(journeyId);

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    if (journey.status === 'BRANCHED') {
      const childJourney = await guidanceJourney.findFirst({
        where: {
          propertyId,
          parentJourneyId: journey.id,
          status: { in: [...ACTIVE_GUIDANCE_JOURNEY_STATUSES] },
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
      if (childJourney?.id) {
        journey = await fetchJourney(childJourney.id);
      }
    }

    const didBackfillLegacyEvidence = await this.backfillLegacyLifecycleCostEvidence({
      propertyId,
      journey,
    });

    const didReconcileLegacyState = didBackfillLegacyEvidence
      ? false
      : await this.reconcileInvalidLegacyRepairReplaceState({
          propertyId,
          journey,
        });

    const didReconcileOutOfOrderState =
      didBackfillLegacyEvidence || didReconcileLegacyState
        ? false
        : await this.reconcileOutOfOrderStepState({
            propertyId,
            journey,
          });

    if (didBackfillLegacyEvidence || didReconcileLegacyState || didReconcileOutOfOrderState) {
      journey = await fetchJourney(journey.id);
    }

    if (!journey) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    const next = await guidanceStepResolverService.resolveNextStep({
      propertyId,
      journeyId: journey.id,
    });

    const enriched = await this.enrichAction({
      journey,
      signal: journey.primarySignal ?? null,
      next,
      includeAIAdvice: true,
      userId,
    });

    return {
      ...enriched.journey,
      events: journey.events ?? [],
    };
  }

  async listActiveJourneysForProperty(propertyId: string) {
    const { guidanceJourney } = getGuidanceModels();

    const fetchJourneys = () => guidanceJourney.findMany({
      where: {
        propertyId,
        status: { in: [...ACTIVE_GUIDANCE_JOURNEY_STATUSES] },
      },
      include: {
        primarySignal: true,
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
        evidences: {
          orderBy: [{ observedAt: 'desc' }],
          take: 50,
        },
        inventoryItem: {
          select: { name: true, category: true, assetType: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    let journeys = await fetchJourneys();
    let changed = false;

    for (const journey of journeys) {
      const didBackfill = await this.backfillLegacyLifecycleCostEvidence({
        propertyId,
        journey,
      });

      const didReconcile = didBackfill
        ? false
        : await this.reconcileInvalidLegacyRepairReplaceState({
            propertyId,
            journey,
          });

      const didReconcileOutOfOrder =
        didBackfill || didReconcile
          ? false
          : await this.reconcileOutOfOrderStepState({
              propertyId,
              journey,
            });

      if (didBackfill || didReconcile || didReconcileOutOfOrder) {
        changed = true;
      }
    }

    if (changed) {
      journeys = await fetchJourneys();
    }

    return journeys;
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

    const enriched = await Promise.all(
      journeys.map((journey: any) =>
        this.enrichAction({
          journey,
          signal: journey.primarySignal ?? null,
          next: nextMap.get(journey.id) ?? null,
          includeAIAdvice: false,
        })
      )
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

  private async createJourneyFromTemplate(args: {
    propertyId: string;
    actorUserId: string | null;
    templateKey: string;
    issueType: string;
    scopeCategory: 'ITEM' | 'SERVICE';
    scopeId: string;
    inventoryItemId?: string | null;
    serviceKey?: string | null;
    parentJourneyId?: string | null;
    branchFromStepKey?: string | null;
    branchType?: string | null;
    branchChoice?: string | null;
    sourceVerdict?: string | null;
    contextSnapshotPatch?: Record<string, unknown> | null;
  }) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();
    const template = getTemplateByJourneyTypeKey(args.templateKey);
    const now = new Date();

    const journey = await guidanceJourney.create({
      data: {
        propertyId: args.propertyId,
        inventoryItemId: args.inventoryItemId ?? null,
        parentJourneyId: args.parentJourneyId ?? null,
        primarySignalId: null,
        journeyKey: template.journeyKey,
        journeyTypeKey: template.journeyTypeKey,
        templateVersion: `${template.journeyTypeKey}@${template.version}`,
        issueDomain: template.issueDomain,
        decisionStage: template.defaultDecisionStage,
        executionReadiness: template.defaultReadiness,
        status: 'NOT_STARTED',
        scopeCategory: args.scopeCategory,
        scopeId: args.scopeId,
        issueType: args.issueType,
        serviceKey: args.serviceKey ?? null,
        isUserInitiated: true,
        isLowContext: false,
        missingContextKeys: [],
        currentStepOrder: null,
        currentStepKey: template.canonicalFirstStepKey,
        branchFromStepKey: args.branchFromStepKey ?? null,
        branchType: args.branchType ?? null,
        branchChoice: args.branchChoice ?? null,
        sourceVerdict: args.sourceVerdict ?? null,
        branchedAt: args.parentJourneyId ? now : null,
        contextSnapshotJson: {
          initiatedByUserId: args.actorUserId,
          issueType: args.issueType,
          scopeCategory: args.scopeCategory,
          scopeId: args.scopeId,
          ...(args.contextSnapshotPatch ?? {}),
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
        propertyId: args.propertyId,
        journeyId: journey.id,
        signalId: null,
        eventType: 'JOURNEY_CREATED',
        actorType: args.actorUserId ? 'USER' : 'SYSTEM',
        actorUserId: args.actorUserId ?? null,
        payloadJson: {
          journeyTypeKey: template.journeyTypeKey,
          issueType: args.issueType,
          scopeCategory: args.scopeCategory,
          scopeId: args.scopeId,
          isUserInitiated: true,
          parentJourneyId: args.parentJourneyId ?? null,
          branchType: args.branchType ?? null,
          branchChoice: args.branchChoice ?? null,
        },
      },
    });

    await guidanceStepResolverService.ensureTemplateSteps({
      propertyId: args.propertyId,
      journeyId: journey.id,
      templateSteps: template.steps,
      templateGovernance: template.governance,
      actorUserId: args.actorUserId ?? null,
      signalId: null,
    });

    return guidanceStepResolverService.recomputeJourneyState({
      propertyId: args.propertyId,
      journeyId: journey.id,
      actorUserId: args.actorUserId ?? null,
      signalId: null,
    });
  }

  async createUserInitiatedJourney(
    propertyId: string,
    input: UserInitiatedJourneyInput,
    actorUserId: string
  ) {
    const issueType = input.issueType.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const scopeId = input.scopeId;
    const inventoryItemId = input.inventoryItemId ?? (input.scopeCategory === 'ITEM' ? input.scopeId : null) ?? null;
    const serviceKey = input.serviceKey ?? (input.scopeCategory === 'SERVICE' ? input.scopeId : null) ?? null;
    const template = getTemplateByIssueType(issueType, input.scopeCategory, serviceKey);

    let journey = await this.createJourneyFromTemplate({
      propertyId,
      actorUserId,
      templateKey: template.journeyTypeKey,
      issueType,
      scopeCategory: input.scopeCategory,
      scopeId,
      inventoryItemId,
      serviceKey,
    });

    // When arriving from a coverage analysis REPLACE_SOON verdict, the replacement
    // decision is already confirmed — auto-skip step 1 (confirm_replacement_path)
    // so the user lands directly on step 2 (check_replacement_coverage).
    if (issueType === 'near_end_of_life' && template.journeyTypeKey === 'replacement_purchase_now') {
      await this.recordToolCompletion({
        propertyId,
        actorUserId,
        journeyId: journey.id,
        sourceToolKey: 'frontend',
        stepKey: 'confirm_replacement_path',
        status: 'SKIPPED',
        reasonCode: 'DECISION_PRE_CONFIRMED',
        reasonMessage: 'Replacement decision already confirmed via coverage analysis verdict.',
      });
    }

    const cleaningSelection = CLEANING_JOURNEY_SELECTION_BY_ISSUE[issueType];
    if (
      cleaningSelection &&
      template.journeyTypeKey === 'cleaning_service_journey'
    ) {
      journey = await this.recordToolCompletion({
        propertyId,
        actorUserId,
        journeyId: journey.id,
        sourceToolKey: 'guidance-overview',
        stepKey: 'select_cleaning_type',
        status: 'COMPLETED',
        producedData: {
          proofType: 'guided_overview_checkpoint',
          proofId: `select_cleaning_type:${cleaningSelection.selectedCleaningType}`,
          actionLabel: cleaningSelection.selectedCleaningTypeLabel,
          completedFrom: 'guidance_overview_issue_selection',
          completedAt: new Date().toISOString(),
          ...cleaningSelection,
        },
      });
    }

    return journey;
  }

  async branchFromRepairReplaceDecision(args: {
    propertyId: string;
    journeyId: string;
    actorUserId: string;
    stepKey: string;
    analysisId: string;
    verdict: RepairReplaceVerdict;
    choice: RepairReplaceBranchChoice;
  }) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();
    const sourceJourney = await guidanceJourney.findFirst({
      where: { id: args.journeyId, propertyId: args.propertyId },
      include: {
        steps: { orderBy: [{ stepOrder: 'asc' }] },
        inventoryItem: { select: { name: true, category: true, assetType: true } },
      },
    });

    if (!sourceJourney) {
      throw new APIError('Guidance journey not found.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    }

    if (sourceJourney.journeyTypeKey !== 'asset_lifecycle_resolution') {
      throw new APIError(
        'Repair vs replace branching is only supported on asset lifecycle journeys.',
        400,
        'GUIDANCE_BRANCH_UNSUPPORTED_JOURNEY'
      );
    }

    const repairDecisionStep = (sourceJourney.steps ?? []).find(
      (step: any) => step.stepKey === args.stepKey
    );

    if (!repairDecisionStep) {
      throw new APIError('Repair vs replace step not found on this journey.', 404, 'GUIDANCE_STEP_NOT_FOUND');
    }

    const isReplacementVerdict = args.verdict === 'REPLACE_NOW' || args.verdict === 'REPLACE_SOON';
    const completionPayload = {
      proofType: 'repair_replace_branch_decision',
      proofId: args.analysisId,
      analysisId: args.analysisId,
      verdict: args.verdict,
      branchChoice: args.choice,
      overrideApplied: args.choice === 'CONTINUE_REPAIR' && isReplacementVerdict,
      confirmedAt: new Date().toISOString(),
    };

    const completed = await guidanceStepResolverService.markStepStatus({
      propertyId: args.propertyId,
      journeyId: sourceJourney.id,
      stepKey: args.stepKey,
      nextStatus: 'COMPLETED',
      actorUserId: args.actorUserId,
      reasonCode: 'USER_CONFIRMED_REPAIR_REPLACE_DECISION',
      producedData: completionPayload,
      signalId: sourceJourney.primarySignalId ?? null,
    });

    if (!isReplacementVerdict || args.choice === 'CONTINUE_REPAIR') {
      await guidanceJourneyEvent.create({
        data: {
          propertyId: args.propertyId,
          journeyId: sourceJourney.id,
          stepId: repairDecisionStep.id,
          signalId: sourceJourney.primarySignalId ?? null,
          eventType: 'CONTEXT_UPDATED',
          actorType: 'USER',
          actorUserId: args.actorUserId,
          reasonCode: isReplacementVerdict ? 'REPLACEMENT_OVERRIDDEN_TO_REPAIR' : 'REPAIR_PATH_CONFIRMED',
          payloadJson: completionPayload,
        },
      });

      const activeJourney = await this.getJourneyById(args.propertyId, sourceJourney.id, args.actorUserId);
      const next = await this.resolveNextStepWithIntelligence({
        propertyId: args.propertyId,
        journeyId: activeJourney.id,
        userId: args.actorUserId,
      });

      return {
        sourceJourney: completed.journey,
        activeJourney,
        next,
        branchCreated: false,
        branchType: null,
      };
    }

    if (args.verdict === 'REPLACE_NOW' && args.choice !== 'CONTINUE_REPLACEMENT') {
      throw new APIError('REPLACE_NOW must continue with replacement or repair.', 400, 'GUIDANCE_INVALID_BRANCH_CHOICE');
    }

    if (args.verdict === 'REPLACE_SOON' && !['PLAN_LATER', 'SHOP_NOW'].includes(args.choice)) {
      throw new APIError('REPLACE_SOON requires a planning or shopping choice.', 400, 'GUIDANCE_INVALID_BRANCH_CHOICE');
    }

    const branchConfig = REPLACEMENT_BRANCH_TYPE_BY_CHOICE[
      args.choice as Extract<RepairReplaceBranchChoice, 'CONTINUE_REPLACEMENT' | 'PLAN_LATER' | 'SHOP_NOW'>
    ];

    const existingChild = await guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        parentJourneyId: sourceJourney.id,
        branchType: branchConfig.branchType,
        status: { in: [...ACTIVE_GUIDANCE_JOURNEY_STATUSES] },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (existingChild) {
      const activeJourney = await this.getJourneyById(args.propertyId, existingChild.id, args.actorUserId);
      const next = await this.resolveNextStepWithIntelligence({
        propertyId: args.propertyId,
        journeyId: activeJourney.id,
        userId: args.actorUserId,
      });
      return {
        sourceJourney: completed.journey,
        activeJourney,
        next,
        branchCreated: false,
        branchType: branchConfig.branchType,
      };
    }

    const sourceUpdated = await guidanceJourney.update({
      where: { id: sourceJourney.id },
      data: {
        status: 'BRANCHED',
        branchFromStepKey: args.stepKey,
        branchType: branchConfig.branchType,
        branchChoice: args.choice,
        sourceVerdict: args.verdict,
        branchedAt: new Date(),
        lastTransitionAt: new Date(),
        version: { increment: 1 },
      },
      include: {
        steps: { orderBy: [{ stepOrder: 'asc' }] },
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId: args.propertyId,
        journeyId: sourceJourney.id,
        stepId: repairDecisionStep.id,
        signalId: sourceJourney.primarySignalId ?? null,
        eventType: 'JOURNEY_BRANCHED',
        actorType: 'USER',
        actorUserId: args.actorUserId,
        reasonCode: branchConfig.branchType,
        payloadJson: {
          ...completionPayload,
          branchType: branchConfig.branchType,
        },
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId: args.propertyId,
        journeyId: sourceJourney.id,
        signalId: sourceJourney.primarySignalId ?? null,
        eventType: 'JOURNEY_STATUS_CHANGED',
        actorType: 'USER',
        actorUserId: args.actorUserId,
        fromJourneyStatus: sourceJourney.status as any,
        toJourneyStatus: 'BRANCHED' as any,
        reasonCode: branchConfig.branchType,
      },
    });

    let childJourney = await this.createJourneyFromTemplate({
      propertyId: args.propertyId,
      actorUserId: args.actorUserId,
      templateKey: branchConfig.journeyTypeKey,
      issueType: branchConfig.issueType,
      scopeCategory: (sourceJourney.scopeCategory as 'ITEM' | 'SERVICE') ?? 'ITEM',
      scopeId:
        sourceJourney.scopeId ??
        sourceJourney.inventoryItemId ??
        sourceJourney.serviceKey ??
        sourceJourney.id,
      inventoryItemId: sourceJourney.inventoryItemId ?? null,
      serviceKey: sourceJourney.serviceKey ?? null,
      parentJourneyId: sourceJourney.id,
      branchFromStepKey: args.stepKey,
      branchType: branchConfig.branchType,
      branchChoice: args.choice,
      sourceVerdict: args.verdict,
      contextSnapshotPatch: {
        sourceJourneyId: sourceJourney.id,
        sourceIssueType: sourceJourney.issueType ?? null,
        sourceJourneyTypeKey: sourceJourney.journeyTypeKey ?? null,
        sourceAssetName: sourceJourney.inventoryItem?.name ?? null,
        repairReplaceAnalysisId: args.analysisId,
        repairReplaceVerdict: args.verdict,
      },
    });

    const confirmStep = (childJourney.steps ?? []).find((step: any) => step.stepOrder === 1);
    if (confirmStep) {
      const confirmResult = await guidanceStepResolverService.markStepStatus({
        propertyId: args.propertyId,
        journeyId: childJourney.id,
        stepKey: confirmStep.stepKey,
        nextStatus: 'COMPLETED',
        actorUserId: args.actorUserId,
        reasonCode: 'SYSTEM_CONFIRMED_BRANCH_ENTRY',
        producedData: {
          proofType: 'replacement_branch_entry',
          proofId: args.analysisId,
          analysisId: args.analysisId,
          sourceJourneyId: sourceJourney.id,
          sourceStepKey: args.stepKey,
          branchChoice: args.choice,
          verdict: args.verdict,
        },
      });
      childJourney = confirmResult.journey;
    }

    const activeJourney = await this.getJourneyById(args.propertyId, childJourney.id, args.actorUserId);
    const next = await this.resolveNextStepWithIntelligence({
      propertyId: args.propertyId,
      journeyId: activeJourney.id,
      userId: args.actorUserId,
    });

    return {
      sourceJourney: sourceUpdated,
      activeJourney,
      next,
      branchCreated: true,
      branchType: branchConfig.branchType,
    };
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
    const newTemplate = getTemplateByIssueType(newIssueType, scopeCategory, journey.serviceKey as string | null);
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
      templateGovernance: newTemplate.governance,
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

  async resolveNextStepWithIntelligence(params: {
    propertyId: string;
    journeyId: string;
    userId?: string | null;
  }) {
    const journey = await this.getJourneyById(params.propertyId, params.journeyId, params.userId);
    const next = await guidanceStepResolverService.resolveNextStep({
      propertyId: params.propertyId,
      journeyId: journey.id,
    });

    const enriched = await this.enrichAction({
      journey,
      signal: journey.primarySignal ?? null,
      next,
      includeAIAdvice: true,
      userId: params.userId,
    });
    return enriched.next;
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
