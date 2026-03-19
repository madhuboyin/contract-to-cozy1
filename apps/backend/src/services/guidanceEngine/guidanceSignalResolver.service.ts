import { getGuidanceModels, clampConfidenceToDecimal, clampSeverityScore, GuidanceSignalSourceInput, NormalizedGuidanceSignalInput, GuidanceDecisionStage, GuidanceExecutionReadiness, GuidanceIssueDomain, GuidanceSeverity } from './guidanceTypes';
import { guidanceValidationService } from './guidanceValidation.service';

const ISSUE_DOMAIN_BY_FAMILY: Record<string, GuidanceIssueDomain> = {
  lifecycle_end_or_past_life: 'ASSET_LIFECYCLE',
  maintenance_failure_risk: 'MAINTENANCE',
  coverage_gap: 'INSURANCE',
  coverage_lapse_detected: 'INSURANCE',
  recall_detected: 'SAFETY',
  inspection_followup_needed: 'MAINTENANCE',
  financial_exposure: 'FINANCIAL',
  cost_of_inaction_risk: 'FINANCIAL',
  freeze_risk: 'WEATHER',
};

const STAGE_BY_FAMILY: Record<string, GuidanceDecisionStage> = {
  lifecycle_end_or_past_life: 'DIAGNOSIS',
  maintenance_failure_risk: 'DIAGNOSIS',
  coverage_gap: 'AWARENESS',
  coverage_lapse_detected: 'AWARENESS',
  recall_detected: 'AWARENESS',
  inspection_followup_needed: 'DIAGNOSIS',
  financial_exposure: 'DIAGNOSIS',
  cost_of_inaction_risk: 'DIAGNOSIS',
  freeze_risk: 'AWARENESS',
};

const READINESS_BY_FAMILY: Record<string, GuidanceExecutionReadiness> = {
  lifecycle_end_or_past_life: 'NEEDS_CONTEXT',
  maintenance_failure_risk: 'NEEDS_CONTEXT',
  coverage_gap: 'NEEDS_CONTEXT',
  coverage_lapse_detected: 'NEEDS_CONTEXT',
  recall_detected: 'READY',
  inspection_followup_needed: 'NEEDS_CONTEXT',
  financial_exposure: 'NEEDS_CONTEXT',
  cost_of_inaction_risk: 'NEEDS_CONTEXT',
  freeze_risk: 'READY',
};

const FIRST_STEP_BY_FAMILY: Record<string, string> = {
  lifecycle_end_or_past_life: 'repair_replace_decision',
  maintenance_failure_risk: 'repair_replace_decision',
  coverage_gap: 'check_coverage',
  coverage_lapse_detected: 'check_coverage',
  recall_detected: 'safety_alert',
  inspection_followup_needed: 'assess_urgency',
  financial_exposure: 'estimate_out_of_pocket_cost',
  cost_of_inaction_risk: 'estimate_out_of_pocket_cost',
  freeze_risk: 'review_signal',
};

const RECOMMENDED_TOOL_BY_FAMILY: Record<string, string> = {
  lifecycle_end_or_past_life: 'replace-repair',
  maintenance_failure_risk: 'replace-repair',
  coverage_gap: 'coverage-intelligence',
  coverage_lapse_detected: 'coverage-intelligence',
  recall_detected: 'recalls',
  inspection_followup_needed: 'inspection-report',
  financial_exposure: 'true-cost',
  cost_of_inaction_risk: 'do-nothing-simulator',
  freeze_risk: 'home-event-radar',
};

function toFamilySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferSignalIntentFamily(input: GuidanceSignalSourceInput): string {
  if (input.signalIntentFamily && input.signalIntentFamily.trim().length > 0) {
    return toFamilySlug(input.signalIntentFamily);
  }

  const sourceEntityType = String(input.sourceEntityType ?? '').toUpperCase();
  const sourceFeatureKey = toFamilySlug(String(input.sourceFeatureKey ?? ''));
  const sourceToolKey = toFamilySlug(String(input.sourceToolKey ?? ''));
  const payload = input.payloadJson ?? {};

  if (sourceEntityType === 'RECALL_MATCH' || sourceFeatureKey.includes('recall') || sourceToolKey.includes('recall')) {
    return 'recall_detected';
  }

  if (
    sourceEntityType === 'REPLACE_REPAIR_ANALYSIS' ||
    sourceFeatureKey.includes('replace_repair') ||
    sourceToolKey === 'replace_repair' ||
    sourceToolKey === 'replace_repair_analysis'
  ) {
    return 'lifecycle_end_or_past_life';
  }

  if (
    sourceEntityType === 'COVERAGE_ANALYSIS' ||
    sourceEntityType === 'INSURANCE_POLICY' ||
    sourceFeatureKey.includes('coverage') ||
    sourceToolKey.includes('coverage')
  ) {
    return 'coverage_gap';
  }

  if (
    sourceEntityType === 'INSPECTION_REPORT' ||
    sourceFeatureKey.includes('inspection') ||
    sourceToolKey.includes('inspection')
  ) {
    return 'inspection_followup_needed';
  }

  if (sourceEntityType === 'INCIDENT') {
    const typeKey = toFamilySlug(String((payload as any)?.typeKey ?? (payload as any)?.incidentType ?? ''));
    if (typeKey.includes('coverage')) return 'coverage_lapse_detected';
    if (typeKey.includes('freeze') || typeKey.includes('weather')) return 'freeze_risk';
    if (typeKey.includes('maintenance') || typeKey.includes('lifecycle')) return 'maintenance_failure_risk';
  }

  if (sourceFeatureKey.includes('financial') || sourceFeatureKey.includes('cost') || sourceToolKey.includes('savings')) {
    return 'financial_exposure';
  }

  return 'generic_actionable_signal';
}

function computeDedupeKey(input: {
  propertyId: string;
  signalIntentFamily: string;
  inventoryItemId: string | null;
  homeAssetId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
}): string {
  const scope = input.inventoryItemId ?? input.homeAssetId ?? (input.sourceEntityId ? `${input.sourceEntityType ?? 'ENTITY'}:${input.sourceEntityId}` : 'PROPERTY');
  return [input.propertyId, input.signalIntentFamily, scope].join(':');
}

function computeDuplicateGroupKey(input: {
  propertyId: string;
  signalIntentFamily: string;
  issueDomain: GuidanceIssueDomain;
  inventoryItemId: string | null;
  homeAssetId: string | null;
}): string {
  const scope = input.inventoryItemId ?? input.homeAssetId ?? 'PROPERTY';
  return [input.propertyId, input.issueDomain, input.signalIntentFamily, scope].join(':');
}

function inferSeverity(input: GuidanceSignalSourceInput, family: string): GuidanceSeverity | null {
  if (input.severity) return input.severity;

  const score = clampSeverityScore(input.severityScore);
  if (score != null) {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 15) return 'LOW';
    return 'INFO';
  }

  if (family === 'recall_detected') return 'HIGH';
  if (family === 'freeze_risk') return 'HIGH';
  if (family === 'coverage_gap') return 'MEDIUM';
  if (family === 'lifecycle_end_or_past_life') return 'MEDIUM';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export class GuidanceSignalResolverService {
  normalizeSignal(input: GuidanceSignalSourceInput): NormalizedGuidanceSignalInput {
    const signalIntentFamily = inferSignalIntentFamily(input);
    const issueDomain = input.issueDomain ?? ISSUE_DOMAIN_BY_FAMILY[signalIntentFamily] ?? 'OTHER';
    const decisionStage = input.decisionStage ?? STAGE_BY_FAMILY[signalIntentFamily] ?? 'AWARENESS';
    const executionReadiness =
      input.executionReadiness ?? READINESS_BY_FAMILY[signalIntentFamily] ?? 'UNKNOWN';

    const sourceEntityType = input.sourceEntityType ? String(input.sourceEntityType).toUpperCase() : null;
    const sourceEntityId = input.sourceEntityId ?? null;
    const sourceToolKey = input.sourceToolKey ?? null;
    const sourceFeatureKey = input.sourceFeatureKey ?? null;

    const dedupeKey =
      input.dedupeKey ??
      computeDedupeKey({
        propertyId: input.propertyId,
        signalIntentFamily,
        inventoryItemId: input.inventoryItemId ?? null,
        homeAssetId: input.homeAssetId ?? null,
        sourceEntityType,
        sourceEntityId,
      });

    const duplicateGroupKey =
      input.duplicateGroupKey ??
      computeDuplicateGroupKey({
        propertyId: input.propertyId,
        signalIntentFamily,
        issueDomain,
        inventoryItemId: input.inventoryItemId ?? null,
        homeAssetId: input.homeAssetId ?? null,
      });

    const payloadJson = input.payloadJson ?? null;
    const metadataJson = input.metadataJson ?? null;
    const observedAt =
      guidanceValidationService.inferObservedAtFromPayload(payloadJson) ??
      guidanceValidationService.inferObservedAtFromPayload(metadataJson) ??
      new Date().toISOString();

    const freshness = guidanceValidationService.assessSignalFreshness({
      signalIntentFamily,
      observedAt,
    });

    const confidenceScoreBase = clampConfidenceToDecimal(input.confidenceScore);
    const confidenceScore = freshness.isStale
      ? guidanceValidationService.sanitizeConfidenceScore((confidenceScoreBase ?? 0.58) - 0.2)
      : confidenceScoreBase;

    const actionWeaknessFlags = Array.from(
      new Set([
        ...(input.actionWeaknessFlags ?? []),
        ...(freshness.isStale ? ['STALE_SIGNAL'] : []),
      ])
    );

    const missingContextKeys = Array.from(
      new Set([
        ...(input.missingContextKeys ?? []),
        ...(freshness.isStale ? ['refresh_signal_context'] : []),
      ])
    );

    const nextReadiness =
      freshness.isStale && executionReadiness === 'READY' ? 'NEEDS_CONTEXT' : executionReadiness;

    if (freshness.isStale) {
      console.info('[GUIDANCE] stale signal normalized', {
        propertyId: input.propertyId,
        signalIntentFamily,
        observedAt: freshness.observedAt,
        ageDays: freshness.ageDays,
        maxAgeDays: freshness.maxAgeDays,
      });
    }

    return {
      propertyId: input.propertyId,
      homeAssetId: input.homeAssetId ?? null,
      inventoryItemId: input.inventoryItemId ?? null,
      signalIntentFamily,
      issueDomain,
      decisionStage,
      executionReadiness: nextReadiness,
      severity: inferSeverity(input, signalIntentFamily),
      severityScore: clampSeverityScore(input.severityScore),
      confidenceScore,
      sourceType: input.sourceType ?? null,
      sourceFeatureKey,
      sourceToolKey,
      sourceEntityType,
      sourceEntityId,
      sourceRunId: input.sourceRunId ?? null,
      sourceProvenanceId: input.sourceProvenanceId ?? null,
      dedupeKey,
      duplicateGroupKey,
      actionWeaknessFlags,
      contextPrerequisites: input.contextPrerequisites ?? [],
      missingContextKeys,
      canonicalFirstStepKey: input.canonicalFirstStepKey ?? FIRST_STEP_BY_FAMILY[signalIntentFamily] ?? null,
      recommendedToolKey: input.recommendedToolKey ?? RECOMMENDED_TOOL_BY_FAMILY[signalIntentFamily] ?? null,
      recommendedFlowKey: input.recommendedFlowKey ?? null,
      payloadJson,
      metadataJson: {
        ...asRecord(metadataJson),
        observedAt,
        freshness: {
          isStale: freshness.isStale,
          ageDays: freshness.ageDays,
          maxAgeDays: freshness.maxAgeDays,
        },
      },
    };
  }

  async upsertSignal(normalized: NormalizedGuidanceSignalInput) {
    const { guidanceSignal } = getGuidanceModels();
    const now = new Date();

    const existing = await guidanceSignal.findFirst({
      where: {
        propertyId: normalized.propertyId,
        dedupeKey: normalized.dedupeKey,
        status: 'ACTIVE',
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (existing) {
      return guidanceSignal.update({
        where: { id: existing.id },
        data: {
          issueDomain: normalized.issueDomain,
          decisionStage: normalized.decisionStage,
          executionReadiness: normalized.executionReadiness,
          severity: normalized.severity,
          severityScore: normalized.severityScore,
          confidenceScore: normalized.confidenceScore,
          sourceType: normalized.sourceType,
          sourceFeatureKey: normalized.sourceFeatureKey,
          sourceToolKey: normalized.sourceToolKey,
          sourceEntityType: normalized.sourceEntityType,
          sourceEntityId: normalized.sourceEntityId,
          sourceRunId: normalized.sourceRunId,
          sourceProvenanceId: normalized.sourceProvenanceId,
          duplicateGroupKey: normalized.duplicateGroupKey,
          actionWeaknessFlags: normalized.actionWeaknessFlags,
          contextPrerequisites: normalized.contextPrerequisites,
          missingContextKeys: normalized.missingContextKeys,
          canonicalFirstStepKey: normalized.canonicalFirstStepKey,
          recommendedToolKey: normalized.recommendedToolKey,
          recommendedFlowKey: normalized.recommendedFlowKey,
          payloadJson: normalized.payloadJson,
          metadataJson: normalized.metadataJson,
          homeAssetId: normalized.homeAssetId,
          inventoryItemId: normalized.inventoryItemId,
          lastObservedAt: now,
          archivedAt: null,
          resolvedAt: null,
          status: 'ACTIVE',
        },
      });
    }

    return guidanceSignal.create({
      data: {
        propertyId: normalized.propertyId,
        homeAssetId: normalized.homeAssetId,
        inventoryItemId: normalized.inventoryItemId,
        signalIntentFamily: normalized.signalIntentFamily,
        issueDomain: normalized.issueDomain,
        decisionStage: normalized.decisionStage,
        executionReadiness: normalized.executionReadiness,
        status: 'ACTIVE',
        severity: normalized.severity,
        severityScore: normalized.severityScore,
        confidenceScore: normalized.confidenceScore,
        sourceType: normalized.sourceType,
        sourceFeatureKey: normalized.sourceFeatureKey,
        sourceToolKey: normalized.sourceToolKey,
        sourceEntityType: normalized.sourceEntityType,
        sourceEntityId: normalized.sourceEntityId,
        sourceRunId: normalized.sourceRunId,
        sourceProvenanceId: normalized.sourceProvenanceId,
        dedupeKey: normalized.dedupeKey,
        duplicateGroupKey: normalized.duplicateGroupKey,
        actionWeaknessFlags: normalized.actionWeaknessFlags,
        contextPrerequisites: normalized.contextPrerequisites,
        missingContextKeys: normalized.missingContextKeys,
        canonicalFirstStepKey: normalized.canonicalFirstStepKey,
        recommendedToolKey: normalized.recommendedToolKey,
        recommendedFlowKey: normalized.recommendedFlowKey,
        payloadJson: normalized.payloadJson,
        metadataJson: normalized.metadataJson,
        firstObservedAt: now,
        lastObservedAt: now,
      },
    });
  }

  async resolveAndPersistSignal(input: GuidanceSignalSourceInput) {
    const normalized = this.normalizeSignal(input);
    return this.upsertSignal(normalized);
  }

  async archiveSignal(signalId: string) {
    const { guidanceSignal } = getGuidanceModels();
    const now = new Date();

    return guidanceSignal.update({
      where: { id: signalId },
      data: {
        status: 'ARCHIVED',
        archivedAt: now,
      },
    });
  }
}

export const guidanceSignalResolverService = new GuidanceSignalResolverService();
