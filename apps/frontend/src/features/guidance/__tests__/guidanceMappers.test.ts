import { mapGuidanceJourneyToActionModel, filterGuidanceActions } from '../utils/guidanceMappers';
import { GuidanceJourneyDTO, GuidanceNextStepResult, GuidanceStepDTO } from '@/lib/api/guidanceApi';

function buildStep(overrides: Partial<GuidanceStepDTO>): GuidanceStepDTO {
  return {
    id: overrides.id ?? 'step-1',
    journeyId: overrides.journeyId ?? 'journey-1',
    stepOrder: overrides.stepOrder ?? 1,
    stepKey: overrides.stepKey ?? 'repair_replace_decision',
    stepType: overrides.stepType ?? 'DECISION',
    label: overrides.label ?? 'Compare repair vs replace',
    description: overrides.description ?? null,
    decisionStage: overrides.decisionStage ?? 'DECISION',
    executionReadiness: overrides.executionReadiness ?? 'NEEDS_CONTEXT',
    status: overrides.status ?? 'PENDING',
    isRequired: overrides.isRequired ?? true,
    toolKey: overrides.toolKey ?? 'replace-repair',
    flowKey: overrides.flowKey ?? 'replace-repair-analysis',
    routePath: overrides.routePath ?? null,
    requiredContextKeys: overrides.requiredContextKeys ?? [],
    missingContextKeys: overrides.missingContextKeys ?? [],
    blockedReasonCode: overrides.blockedReasonCode ?? null,
    blockedReason: overrides.blockedReason ?? null,
    skippedReasonCode: overrides.skippedReasonCode ?? null,
    skippedReason: overrides.skippedReason ?? null,
    producedData: overrides.producedData ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    skippedAt: overrides.skippedAt ?? null,
    blockedAt: overrides.blockedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

function buildJourney(steps: GuidanceStepDTO[]): GuidanceJourneyDTO {
  return {
    id: 'journey-1',
    propertyId: 'property-1',
    homeAssetId: null,
    inventoryItemId: 'item-1',
    journeyKey: 'journey_asset_lifecycle_resolution',
    journeyTypeKey: 'asset_lifecycle_resolution',
    issueDomain: 'ASSET_LIFECYCLE',
    decisionStage: 'DECISION',
    executionReadiness: 'NEEDS_CONTEXT',
    status: 'ACTIVE',
    currentStepOrder: 1,
    currentStepKey: 'repair_replace_decision',
    isLowContext: false,
    missingContextKeys: [],
    contextSnapshot: null,
    derivedSnapshot: null,
    startedAt: null,
    completedAt: null,
    updatedAt: null,
    progress: {
      completedCount: 0,
      totalCount: steps.length,
      percent: 0,
    },
    priorityScore: 0,
    priorityBucket: 'MEDIUM',
    priorityGroup: 'UPCOMING',
    confidenceScore: 0.6,
    confidenceLabel: 'MEDIUM',
    financialImpactScore: 0,
    fundingGapFlag: false,
    costOfDelay: 0,
    coverageImpact: 'UNKNOWN',
    explanation: null,
    nextStepLabel: null,
    primarySignal: {
      id: 'signal-1',
      propertyId: 'property-1',
      homeAssetId: null,
      inventoryItemId: 'item-1',
      signalIntentFamily: 'lifecycle_end_or_past_life',
      issueDomain: 'ASSET_LIFECYCLE',
      decisionStage: 'DECISION',
      executionReadiness: 'NEEDS_CONTEXT',
      severity: 'HIGH',
      severityScore: 82,
      confidenceScore: 0.75,
      sourceToolKey: 'replace-repair',
      sourceFeatureKey: 'replace-repair',
      sourceEntityType: null,
      sourceEntityId: null,
      status: 'ACTIVE',
      canonicalFirstStepKey: 'repair_replace_decision',
      recommendedToolKey: 'replace-repair',
      recommendedFlowKey: 'replace-repair-analysis',
      missingContextKeys: [],
      contextPrerequisites: [],
      firstObservedAt: null,
      lastObservedAt: null,
      resolvedAt: null,
      updatedAt: null,
    },
    steps,
  };
}

describe('guidance mappers', () => {
  it('maps next step and resolves replace-repair route with inventory item', () => {
    const step = buildStep({ stepOrder: 1, toolKey: 'replace-repair', routePath: null });
    const journey = buildJourney([step]);
    const next: GuidanceNextStepResult = {
      journeyId: 'journey-1',
      currentStep: step,
      nextStep: step,
      executionReadiness: 'NEEDS_CONTEXT',
      missingPrerequisites: [],
      warnings: [],
      blockedReason: null,
      recommendedToolKey: 'replace-repair',
      recommendedFlowKey: 'replace-repair-analysis',
    };

    const mapped = mapGuidanceJourneyToActionModel({
      propertyId: 'property-1',
      journey,
      next,
    });

    expect(mapped.title).toContain('Lifecycle End Or Past Life');
    expect(mapped.href).toContain('/dashboard/properties/property-1/inventory/items/item-1/replace-repair');
    expect(mapped.href).toContain('guidanceJourneyId=journey-1');
    expect(mapped.href).toContain('guidanceStepKey=repair_replace_decision');
    expect(mapped.nextStep?.label).toBe('Compare repair vs replace');
  });

  it('filters actions by issue domain and tool key', () => {
    const lifecycleStep = buildStep({ id: 's1', toolKey: 'replace-repair' });
    const insuranceStep = buildStep({
      id: 's2',
      toolKey: 'coverage-intelligence',
      stepKey: 'check_coverage',
      label: 'Check coverage',
    });

    const lifecycleJourney = buildJourney([lifecycleStep]);
    const insuranceJourney = {
      ...buildJourney([insuranceStep]),
      id: 'journey-2',
      issueDomain: 'INSURANCE' as const,
      steps: [insuranceStep],
    };

    const lifecycleAction = mapGuidanceJourneyToActionModel({
      propertyId: 'property-1',
      journey: lifecycleJourney,
      next: null,
    });

    const insuranceAction = mapGuidanceJourneyToActionModel({
      propertyId: 'property-1',
      journey: insuranceJourney,
      next: null,
    });

    const filtered = filterGuidanceActions([lifecycleAction, insuranceAction], {
      issueDomains: ['INSURANCE'],
      toolKey: 'coverage-intelligence',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].journeyId).toBe('journey-2');
  });

  it('orders actions by priority score when available', () => {
    const highStep = buildStep({ id: 's-priority-high', stepKey: 'check_coverage', toolKey: 'coverage-intelligence' });
    const lowStep = buildStep({ id: 's-priority-low', stepKey: 'track_resolution', toolKey: 'home-event-radar' });

    const highJourney = {
      ...buildJourney([highStep]),
      id: 'journey-high',
      issueDomain: 'INSURANCE' as const,
      priorityScore: 92,
      priorityBucket: 'HIGH' as const,
      priorityGroup: 'IMMEDIATE' as const,
    };

    const lowJourney = {
      ...buildJourney([lowStep]),
      id: 'journey-low',
      issueDomain: 'MAINTENANCE' as const,
      priorityScore: 18,
      priorityBucket: 'LOW' as const,
      priorityGroup: 'OPTIMIZATION' as const,
    };

    const highAction = mapGuidanceJourneyToActionModel({
      propertyId: 'property-1',
      journey: highJourney,
      next: null,
    });
    const lowAction = mapGuidanceJourneyToActionModel({
      propertyId: 'property-1',
      journey: lowJourney,
      next: null,
    });

    const ordered = filterGuidanceActions([lowAction, highAction]);
    expect(ordered[0].journeyId).toBe('journey-high');
    expect(ordered[1].journeyId).toBe('journey-low');
  });
});
