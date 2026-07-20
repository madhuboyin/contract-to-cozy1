import type { GuidanceJourneyDetailResponse } from '@/lib/api/guidanceApi';
import type { RankedHomeActionDTO, UnifiedHomeDTO } from '@/types';
import { resolveToolDestinationContext } from '../toolDestinationContext';

function action(): RankedHomeActionDTO {
  return {
    id: 'action-1',
    lineageId: 'lineage-1',
    priority: 'SOON',
    state: 'OPEN',
    job: 'STAY_AHEAD',
    signal: 'Furnace coverage is missing',
    whyItMatters: 'An uncovered repair could create an unexpected cost.',
    recommendedAction: 'Review furnace coverage',
    expectedOutcome: 'A documented coverage decision.',
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Before service' },
    evidence: [],
    assumptions: [],
    confidence: { score: 0.8, label: 'HIGH', missing: [] },
    primaryCta: { label: 'Review coverage', href: '/coverage' },
    secondaryCtas: [],
    source: { kind: 'GUIDANCE', entityId: 'furnace-1', version: null },
    governance: { safetyTier: 'REGULATED_COVERAGE' },
    feedbackControls: ['COMPLETE'],
    ranking: {
      rank: 1,
      score: 80,
      explanation: 'Coverage gap',
      components: { consequence: 1, urgency: 1, confidence: 1, householdRelevance: 1, actionability: 1, missingContextPenalty: 0 },
    },
    deduplication: { canonicalKey: 'coverage:furnace', mergedActionIds: ['legacy-action-1'] },
  };
}

function home(): UnifiedHomeDTO {
  return {
    contractVersion: 'phase2-home-v1',
    property: { id: 'property-1', name: 'Home', address: '1 Main St', dwellingType: 'HOUSE', updatedAt: '2026-07-20T00:00:00.000Z' },
    propertyContext: {
      contextVersion: 'context-v2',
      scopes: [],
      completenessPercent: 80,
      knownFactCount: 8,
      missingFactCount: 2,
      conflictedFactCount: 0,
      staleFactCount: 0,
      warningCount: 0,
    },
    attention: { actions: [action()], totalCount: 1, planHref: '/dashboard/actions' },
    decisions: [],
    activeMajorMoment: null,
    glance: {
      recordCompleteness: 80,
      knownPropertyFacts: 8,
      trackedSystems: 4,
      verifiedSystems: 2,
      documentCount: 1,
      verifiedDocumentCount: 1,
      coverageGapCount: 1,
      openWorkCount: 1,
      recentChanges: [],
      recordHref: '/dashboard/properties',
      systemsHref: '/dashboard/inventory',
      coverageHref: '/dashboard/protect',
      workHref: '/dashboard/actions',
    },
    diagnostics: {
      candidateCount: 1,
      surfacedCount: 1,
      duplicateCount: 0,
      suppressedCount: 0,
      snoozedCount: 0,
      promotedCount: 0,
      personalization: { status: 'AVAILABLE', evaluatedCount: 0, activeCount: 0 },
    },
    generatedAt: '2026-07-20T00:00:00.000Z',
  };
}

describe('resolveToolDestinationContext', () => {
  it('resolves a merged source action, current context, and inventory prefill', () => {
    const result = resolveToolDestinationContext({
      propertyId: 'property-1',
      home: home(),
      context: {
        launchSurface: 'unified_home',
        sourceActionId: 'legacy-action-1',
        sourceEntityType: 'INVENTORY_ITEM',
        sourceEntityId: 'furnace-1',
        contextVersion: 'context-v2',
        recommendationReason: 'rule-v2:COVERAGE_GAPS_PRESENT',
      },
    });

    expect(result.sourceAction?.id).toBe('action-1');
    expect(result.contextVersionStatus).toBe('CURRENT');
    expect(result.recommendationLabel).toBe('Coverage gaps present');
    expect(result.prefill.itemId).toBe('furnace-1');
    expect(result.actionPlanHref).toContain('focusActionId=action-1');
  });

  it('uses journey scope to resume a tool and flags stale launch context', () => {
    const journeyDetail = {
      journey: {
        id: 'journey-1',
        scopeCategory: 'ITEM',
        scopeId: 'water-heater-1',
        inventoryItemId: 'water-heater-1',
        serviceKey: 'WATER_HEATER_SERVICE',
        issueType: 'LEAK',
        explanation: { what: 'Resolve a water-heater issue', why: 'A leak can cause damage' },
        progress: { completedCount: 1, totalCount: 4, percent: 25 },
        nextStepLabel: 'Compare repair options',
      },
      next: { nextStepLabel: 'Review service prices' },
    } as unknown as GuidanceJourneyDetailResponse;

    const result = resolveToolDestinationContext({
      propertyId: 'property-1',
      home: home(),
      journeyDetail,
      context: {
        launchSurface: 'guidance',
        journeyId: 'journey-1',
        contextVersion: 'context-v1',
      },
    });

    expect(result.contextVersionStatus).toBe('UPDATED');
    expect(result.prefill.itemId).toBe('water-heater-1');
    expect(result.prefill.serviceKey).toBe('WATER_HEATER_SERVICE');
    expect(result.nextJourneyLabel).toBe('Review service prices');
    expect(result.journeyHref).toContain('journeyId=journey-1');
  });
});
