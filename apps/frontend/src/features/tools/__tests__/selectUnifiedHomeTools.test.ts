import type { RankedHomeActionDTO, UnifiedHomeDTO } from '@/types';
import { selectUnifiedHomeTools } from '../selectUnifiedHomeTools';

function action(overrides: Partial<RankedHomeActionDTO> = {}): RankedHomeActionDTO {
  return {
    id: 'action-1',
    lineageId: 'lineage-1',
    priority: 'SOON',
    state: 'OPEN',
    job: 'STAY_AHEAD',
    signal: 'Schedule furnace maintenance',
    whyItMatters: 'Prevent a more expensive repair.',
    recommendedAction: 'Schedule service',
    expectedOutcome: 'A serviced furnace.',
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Seasonal timing' },
    evidence: [],
    assumptions: [],
    confidence: { score: 0.8, label: 'HIGH', missing: [] },
    primaryCta: { label: 'Schedule service', href: '/dashboard/providers' },
    secondaryCtas: [],
    source: { kind: 'MAINTENANCE', entityId: 'task-1', version: null },
    governance: { safetyTier: 'LOW_CONSEQUENCE' },
    feedbackControls: ['COMPLETE'],
    ranking: {
      rank: 1,
      score: 80,
      explanation: 'Due soon',
      components: { consequence: 1, urgency: 1, confidence: 1, householdRelevance: 1, actionability: 1, missingContextPenalty: 0 },
    },
    deduplication: { canonicalKey: 'maintenance:furnace', mergedActionIds: [] },
    ...overrides,
  };
}

function home(actions: RankedHomeActionDTO[]): UnifiedHomeDTO {
  return {
    contractVersion: 'phase2-home-v1',
    property: { id: 'property-1', name: 'Home', address: '1 Main St', dwellingType: 'HOUSE', updatedAt: '2026-07-20T00:00:00.000Z' },
    propertyContext: {
      contextVersion: 'context-1',
      scopes: [],
      completenessPercent: 80,
      knownFactCount: 8,
      missingFactCount: 2,
      conflictedFactCount: 0,
      staleFactCount: 0,
      warningCount: 0,
    },
    attention: {
      actions,
      totalCount: actions.length,
      planHref: '/dashboard/actions',
      firstValueInsight: null,
    },
    decisions: [],
    activeMajorMoment: null,
    glance: {
      recordCompleteness: 80,
      knownPropertyFacts: 8,
      trackedSystems: 4,
      verifiedSystems: 2,
      documentCount: 1,
      verifiedDocumentCount: 1,
      coverageGapCount: 2,
      openWorkCount: actions.length,
      recentChanges: [],
      recordHref: '/dashboard/properties',
      systemsHref: '/dashboard/inventory',
      coverageHref: '/dashboard/protect',
      workHref: '/dashboard/actions',
    },
    diagnostics: {
      candidateCount: actions.length,
      surfacedCount: actions.length,
      duplicateCount: 0,
      suppressedCount: 0,
      snoozedCount: 0,
      promotedCount: 0,
      personalization: { status: 'AVAILABLE', evaluatedCount: 0, activeCount: 0 },
    },
    generatedAt: '2026-07-20T00:00:00.000Z',
  };
}

describe('selectUnifiedHomeTools', () => {
  it('uses the canonical Home action and context signals', () => {
    const recommendations = selectUnifiedHomeTools(home([action()]), 3);
    expect(recommendations.map((item) => item.toolId)).toEqual([
      'coverage-options',
      'service-price-radar',
      'home-digital-twin',
    ]);
  });

  it('does not repeat a tool already launched by a ranked action', () => {
    const recommendations = selectUnifiedHomeTools(home([
      action({ primaryCta: { label: 'Compare coverage', href: '/dashboard/properties/property-1/tools/coverage-options' } }),
    ]), 5);
    expect(recommendations.map((item) => item.toolId)).not.toContain('coverage-options');
  });

  it('never exceeds the requested recommendation cap', () => {
    const recommendations = selectUnifiedHomeTools(home([
      action({
        signal: 'Storm repair and replacement decision',
        governance: { safetyTier: 'MATERIAL_FINANCIAL' },
      }),
    ]), 2);
    expect(recommendations).toHaveLength(2);
  });

  it('filters recommendations disabled by the release policy', () => {
    const fixture = home([action({ signal: 'Flood watch for this home' })]);
    const recommendations = selectUnifiedHomeTools(fixture, 5, {
      enabled: true,
      enforceReleaseGates: false,
      disabledToolIds: ['home-event-radar'],
      rollouts: {},
      generatedAt: '2026-07-20T00:00:00.000Z',
    });
    expect(recommendations.map((item) => item.toolId)).not.toContain('home-event-radar');
  });

  it('uses active project moments as a recommendation signal', () => {
    const fixture = home([]);
    fixture.activeMajorMoment = {
      kind: 'PROJECT',
      id: 'project-1',
      title: 'Kitchen renovation',
      stage: 'PLANNING',
      blocker: null,
      nextMilestone: 'Review contractor scope',
      href: '/dashboard/projects/project-1',
    };
    expect(selectUnifiedHomeTools(fixture, 5).map((item) => item.toolId)).toContain('home-renovation-risk-advisor');
  });
});
