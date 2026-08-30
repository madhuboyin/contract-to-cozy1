import { decimalToNumber } from './guidanceTypes';
import {
  buildRecommendationResponseContract,
  resolveRecommendationResponseStatus,
} from '../../productFramework/recommendationResponse.contract';

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapGuidanceSignal(signal: any) {
  const payload = signal.payloadJson && typeof signal.payloadJson === 'object'
    ? signal.payloadJson as Record<string, unknown>
    : null;
  const radarMatchId = signal.sourceToolKey === 'home-event-radar'
    && typeof payload?.propertyRadarMatchId === 'string'
    && payload.propertyRadarMatchId.trim().length > 0
    ? payload.propertyRadarMatchId
    : null;
  return {
    id: signal.id,
    propertyId: signal.propertyId,
    inventoryItemId: signal.inventoryItemId ?? null,
    signalIntentFamily: signal.signalIntentFamily,
    issueDomain: signal.issueDomain,
    decisionStage: signal.decisionStage,
    executionReadiness: signal.executionReadiness,
    severity: signal.severity ?? null,
    severityScore: signal.severityScore ?? null,
    confidenceScore: decimalToNumber(signal.confidenceScore),
    sourceToolKey: signal.sourceToolKey ?? null,
    sourceFeatureKey: signal.sourceFeatureKey ?? null,
    sourceEntityType: signal.sourceEntityType ?? null,
    sourceEntityId: signal.sourceEntityId ?? null,
    radarMatchId,
    status: signal.status,
    canonicalFirstStepKey: signal.canonicalFirstStepKey ?? null,
    recommendedToolKey: signal.recommendedToolKey ?? null,
    recommendedFlowKey: signal.recommendedFlowKey ?? null,
    missingContextKeys: signal.missingContextKeys ?? [],
    contextPrerequisites: signal.contextPrerequisites ?? [],
    firstObservedAt: asIso(signal.firstObservedAt),
    lastObservedAt: asIso(signal.lastObservedAt),
    resolvedAt: asIso(signal.resolvedAt),
    updatedAt: asIso(signal.updatedAt),
  };
}

function isGenericRepairReplacePayload(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).proofType === 'repair_replace_analysis'
  );
}

function suppressHvacGenericDerivedVerdict(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const snapshot = value as Record<string, unknown>;
  const latest = snapshot.latest && typeof snapshot.latest === 'object' && !Array.isArray(snapshot.latest)
    ? { ...(snapshot.latest as Record<string, unknown>) }
    : {};
  for (const key of [
    'replaceRepairVerdict',
    'replaceRepairConfidence',
    'breakEvenMonths',
    'expectedAnnualRepairRiskCents',
    'estimatedReplacementCostCents',
    'replace-repairObservedAt',
    'replace-repairStale',
  ]) {
    delete latest[key];
  }

  const byStep = Object.fromEntries(
    Object.entries(
      snapshot.byStep && typeof snapshot.byStep === 'object' && !Array.isArray(snapshot.byStep)
        ? snapshot.byStep as Record<string, unknown>
        : {}
    ).filter(([, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
      const record = entry as Record<string, unknown>;
      return record.toolKey !== 'replace-repair' && !isGenericRepairReplacePayload(record.raw);
    })
  );
  const byTool = {
    ...(snapshot.byTool && typeof snapshot.byTool === 'object' && !Array.isArray(snapshot.byTool)
      ? snapshot.byTool as Record<string, unknown>
      : {}),
  };
  delete byTool['replace-repair'];

  return { ...snapshot, byStep, byTool, latest };
}

export function mapGuidanceStep(step: any, options?: { suppressGenericRepairReplace?: boolean }) {
  const producedData = step.producedDataJson ?? null;
  return {
    id: step.id,
    journeyId: step.journeyId,
    stepOrder: step.stepOrder,
    stepKey: step.stepKey,
    stepType: step.stepType ?? null,
    label: step.label,
    description: step.description ?? null,
    decisionStage: step.decisionStage ?? null,
    executionReadiness: step.executionReadiness,
    status: step.status,
    isRequired: Boolean(step.isRequired),
    toolKey: step.toolKey ?? null,
    routePath: step.routePath ?? null,
    displayLabel: step.displayLabel ?? null,
    requiredContextKeys: step.requiredContextKeys ?? [],
    missingContextKeys: step.missingContextKeys ?? [],
    governance: step.governanceJson ?? {
      safetyTier: step.safetyTier ?? 'LOW_CONSEQUENCE',
      professionalBoundary: step.professionalBoundary ?? null,
      conservativeFallback: step.conservativeFallback ?? null,
      emergencyEscalation: step.emergencyEscalation ?? null,
      policyVersion: step.governancePolicyVersion ?? 'phase4-v1',
    },
    blockedReasonCode: step.blockedReasonCode ?? null,
    blockedReason: step.blockedReason ?? null,
    skippedReasonCode: step.skippedReasonCode ?? null,
    skippedReason: step.skippedReason ?? null,
    producedData:
      options?.suppressGenericRepairReplace && isGenericRepairReplacePayload(producedData)
        ? null
        : producedData,
    startedAt: asIso(step.startedAt),
    completedAt: asIso(step.completedAt),
    skippedAt: asIso(step.skippedAt),
    blockedAt: asIso(step.blockedAt),
    updatedAt: asIso(step.updatedAt),
  };
}

export function mapGuidanceJourney(journey: any) {
  const isHvac = journey.inventoryItem?.category === 'HVAC';
  const allSteps = (journey.steps ?? []).map((step: any) =>
    mapGuidanceStep(step, { suppressGenericRepairReplace: isHvac })
  );
  // Exclude steps that were silently removed from the template (TEMPLATE_REMOVED).
  // These are historically persisted steps that no longer exist in the current
  // template version — they should be invisible to the frontend in all contexts:
  // step strip, progress counts, and next-step resolution.
  const steps = allSteps.filter((step: any) => step.skippedReasonCode !== 'TEMPLATE_REMOVED');
  const completedCount = steps.filter((step: any) => step.status === 'COMPLETED').length;
  const totalCount = steps.length;
  const confidence = decimalToNumber(journey.primarySignal?.confidenceScore);
  const safetyTier = steps.find((step: any) => step.status === 'PENDING' || step.status === 'IN_PROGRESS')
    ?.governance?.safetyTier ?? steps[0]?.governance?.safetyTier ?? 'LOW_CONSEQUENCE';
  const responseStatus = resolveRecommendationResponseStatus({
    confidence,
    missingFacts: journey.missingContextKeys ?? [],
  });

  return {
    id: journey.id,
    propertyId: journey.propertyId,
    inventoryItemId: journey.inventoryItemId ?? null,
    journeyKey: journey.journeyKey ?? null,
    journeyTypeKey: journey.journeyTypeKey ?? null,
    issueDomain: journey.issueDomain,
    decisionStage: journey.decisionStage,
    executionReadiness: journey.executionReadiness,
    status: journey.status,
    currentStepOrder: journey.currentStepOrder ?? null,
    currentStepKey: journey.currentStepKey ?? null,
    isLowContext: Boolean(journey.isLowContext),
    missingContextKeys: journey.missingContextKeys ?? [],
    contextSnapshot: journey.contextSnapshotJson ?? null,
    derivedSnapshot: isHvac
      ? suppressHvacGenericDerivedVerdict(journey.derivedSnapshotJson)
      : journey.derivedSnapshotJson ?? null,
    templateVersion: journey.templateVersion ?? null,
    scopeCategory: journey.scopeCategory ?? null,
    scopeId: journey.scopeId ?? null,
    issueType: journey.issueType ?? null,
    serviceKey: journey.serviceKey ?? null,
    parentJourneyId: journey.parentJourneyId ?? null,
    branchFromStepKey: journey.branchFromStepKey ?? null,
    branchType: journey.branchType ?? null,
    branchChoice: journey.branchChoice ?? null,
    sourceVerdict: isHvac ? null : journey.sourceVerdict ?? null,
    branchedAt: asIso(journey.branchedAt),
    isUserInitiated: Boolean(journey.isUserInitiated),
    dismissedReason: journey.dismissedReason ?? null,
    dismissedAt: asIso(journey.dismissedAt),
    startedAt: asIso(journey.startedAt),
    completedAt: asIso(journey.completedAt),
    updatedAt: asIso(journey.updatedAt),
    progress: {
      completedCount,
      totalCount,
      percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    },
    priorityScore: typeof journey.priorityScore === 'number' ? journey.priorityScore : null,
    priorityBucket: journey.priorityBucket ?? null,
    priorityGroup: journey.priorityGroup ?? null,
    confidenceScore: decimalToNumber(journey.confidenceScore),
    confidenceLabel: journey.confidenceLabel ?? null,
    recommendationResponse: buildRecommendationResponseContract({
      status: responseStatus,
      safetyTier,
      missingFacts: journey.missingContextKeys ?? [],
      reasonCode: responseStatus === 'AVAILABLE' ? 'GUIDANCE_AVAILABLE' : `GUIDANCE_${responseStatus}`,
    }),
    financialImpactScore:
      typeof journey.financialImpactScore === 'number' ? journey.financialImpactScore : null,
    fundingGapFlag: Boolean(journey.fundingGapFlag),
    costOfDelay: typeof journey.costOfDelay === 'number' ? journey.costOfDelay : null,
    coverageImpact: journey.coverageImpact ?? null,
    explanation: journey.explanation ?? null,
    nextStepLabel: journey.nextStepLabel ?? null,
    primarySignal: journey.primarySignal ? mapGuidanceSignal(journey.primarySignal) : null,
    inventoryItem: journey.inventoryItem
      ? {
          name: journey.inventoryItem.name ?? null,
          category: journey.inventoryItem.category ?? null,
          assetType: journey.inventoryItem.assetType ?? null,
        }
      : null,
    steps,
  };
}

export function mapGuidanceEvent(event: any, options?: { suppressGenericRepairReplace?: boolean }) {
  const payload = event.payloadJson ?? null;
  const payloadRecord =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  const containsGenericRepairReplace = Boolean(
    payloadRecord &&
      (isGenericRepairReplacePayload(payloadRecord) ||
        payloadRecord.proofType === 'repair_replace_branch_decision' ||
        (Array.isArray(payloadRecord.keys) && payloadRecord.keys.includes('replaceRepairVerdict')))
  );
  return {
    id: event.id,
    journeyId: event.journeyId,
    stepId: event.stepId ?? null,
    signalId: event.signalId ?? null,
    eventType: event.eventType,
    fromJourneyStatus: event.fromJourneyStatus ?? null,
    toJourneyStatus: event.toJourneyStatus ?? null,
    fromStepStatus: event.fromStepStatus ?? null,
    toStepStatus: event.toStepStatus ?? null,
    actorUserId: event.actorUserId ?? null,
    reasonCode: event.reasonCode ?? null,
    reasonMessage: event.reasonMessage ?? null,
    payload: options?.suppressGenericRepairReplace && containsGenericRepairReplace ? null : payload,
    createdAt: asIso(event.createdAt),
  };
}

export function mapGuidanceEvidence(evidence: any) {
  return {
    id: evidence.id,
    propertyId: evidence.propertyId,
    journeyId: evidence.journeyId,
    stepId: evidence.stepId,
    signalId: evidence.signalId ?? null,
    inventoryItemId: evidence.inventoryItemId ?? null,
    evidenceType: evidence.evidenceType,
    sourceType: evidence.sourceType,
    status: evidence.status,
    sourceToolKey: evidence.sourceToolKey ?? null,
    sourceFeatureKey: evidence.sourceFeatureKey ?? null,
    evidenceRefType: evidence.evidenceRefType ?? null,
    evidenceRefId: evidence.evidenceRefId ?? null,
    proofType: evidence.proofType ?? null,
    proofId: evidence.proofId ?? null,
    confidenceScore: decimalToNumber(evidence.confidenceScore),
    expectedScopeCategory: evidence.expectedScopeCategory ?? null,
    expectedScopeId: evidence.expectedScopeId ?? null,
    actualScopeCategory:
      evidence.actualScopeCategory ??
      (evidence.sourceToolKey === 'ownership-costs'
        ? 'PROPERTY'
        : null) ??
      (evidence.inventoryItemId ? 'ITEM' : 'PROPERTY'),
    actualScopeId:
      evidence.actualScopeId ??
      (evidence.sourceToolKey === 'ownership-costs'
        ? evidence.propertyId
        : null) ??
      evidence.inventoryItemId ??
      evidence.propertyId ??
      null,
    compatibility: evidence.compatibility ?? 'UNKNOWN',
    observedAt: asIso(evidence.observedAt),
    verifiedAt: asIso(evidence.verifiedAt),
    invalidatedAt: asIso(evidence.invalidatedAt),
    createdByUserId: evidence.createdByUserId ?? null,
    payload: evidence.payloadJson ?? null,
    metadata: evidence.metadataJson ?? null,
    createdAt: asIso(evidence.createdAt),
    updatedAt: asIso(evidence.updatedAt),
  };
}
