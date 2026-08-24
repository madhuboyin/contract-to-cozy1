import {
  groupAttentionActions,
  isAssetLifecycleAction,
  isEnvironmentAction,
  resolveHomeAttentionState,
  shouldInitiallyExpandActionDetails,
  shouldBlockNavigationForLineage,
  splitHomeAttentionEntries,
} from '@/components/home/UnifiedHomeSurface';
import type { RankedHomeActionDTO } from '@/types';

describe('shouldBlockNavigationForLineage', () => {
  // Code-review finding (Phase 3 review, item 1): the primary CTA must not
  // navigate before a Decision Thread create/resume either succeeds or is
  // known to have failed/gone ambiguous.
  it('does not block when there is no decision lineage at all', () => {
    expect(shouldBlockNavigationForLineage(null)).toBe(false);
  });

  it.each(['LINKED', 'NOT_STARTED'] as const)('does not block status %s', (status) => {
    expect(shouldBlockNavigationForLineage({
      status,
      decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
      primaryEntityId: 'item-1',
      thread: status === 'LINKED' ? {
        decisionThreadId: 'thread-1',
        lifecycleStatus: 'RECOMMENDATION_AVAILABLE',
        contextStatus: 'CURRENT',
        currentRecommendationSnapshotId: 'snapshot-1',
        recommendationChange: null,
        limitationCodes: [],
      } : undefined,
    })).toBe(false);
  });

  // Phase 3 review finding 1: NOT_APPLICABLE must block here to match the
  // backend's BLOCKING_DECISION_LINEAGE_STATUSES (homeActions.service.ts),
  // which already degrades the CTA and sets materialActionAllowed: false
  // for this status. Previously missing from this set entirely.
  it.each(['AMBIGUOUS', 'UNAVAILABLE', 'NOT_APPLICABLE'] as const)('blocks status %s', (status) => {
    expect(shouldBlockNavigationForLineage({
      status,
      decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
      primaryEntityId: 'item-1',
    })).toBe(true);
  });

  // Phase 3 review finding 1: UNAVAILABLE now legitimately carries a null
  // decisionDefinitionId/primaryEntityId (a DECISION_REQUIRED action that
  // resolves to no registered decision family at all) — must still block.
  it('blocks UNAVAILABLE even with a null decisionDefinitionId/primaryEntityId', () => {
    expect(shouldBlockNavigationForLineage({
      status: 'UNAVAILABLE',
      decisionDefinitionId: null,
      primaryEntityId: null,
      reason: 'No decision-family adapter is registered for this recommendation type.',
    })).toBe(true);
  });
});

describe('recommendation-change presentation', () => {
  it('automatically expands an action card with an unread persisted change', () => {
    expect(shouldInitiallyExpandActionDetails({
      decisionLineage: {
        status: 'LINKED',
        decisionDefinitionId: 'COVERAGE_QUESTION',
        primaryEntityId: 'question-1',
        thread: {
          decisionThreadId: 'thread-1',
          lifecycleStatus: 'RECOMMENDATION_AVAILABLE',
          contextStatus: 'CURRENT',
          currentRecommendationSnapshotId: 'snapshot-2',
          recommendationChange: {
            category: 'MATERIAL',
            previousVerdict: 'KEEP_CURRENT',
            currentVerdict: 'ADD_COVERAGE',
            changedFactors: [],
          },
          limitationCodes: [],
        },
      },
    } as unknown as RankedHomeActionDTO)).toBe(true);
  });
});

describe('resolveHomeAttentionState', () => {
  it('keeps ranked actions ahead of incomplete setup', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 9,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('ACTIONS');
  });

  it('uses setup as the fallback when there are no actions and context is incomplete', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 1,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('SETUP');
  });

  it('shows a grounded first-value outlook before incomplete setup', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 4,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true)).toBe('OUTLOOK');
  });

  it('shows the outlook ahead of PLAN or CONSIDER actions', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true, 0)).toBe('OUTLOOK');
  });

  it('keeps a real NOW or SOON action ahead of the outlook', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true, 1)).toBe('ACTIONS');
  });

  it('reserves all-clear for no actions and complete current context', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('ALL_CLEAR');
  });
});

describe('environment attention classification', () => {
  it('routes promoted environment actions to the dedicated prominent card', () => {
    expect(isEnvironmentAction({
      id: 'environment:heat-2026-07-27',
      source: { kind: 'MAINTENANCE' },
    } as RankedHomeActionDTO)).toBe(true);
  });
});

describe('category-specific home card classification', () => {
  it('routes only an inventory-backed asset presentation to the lifecycle card', () => {
    const asset = {
      id: 'home-capital-timeline-window:item-1',
      source: { kind: 'SYSTEM' },
      presentation: {
        variant: 'ASSET_LIFECYCLE',
        subject: { kind: 'INVENTORY_ITEM', id: 'dishwasher-1', label: 'Dishwasher' },
      },
    } as RankedHomeActionDTO;
    const seasonal = {
      id: 'seasonal-checklist:summer',
      source: { kind: 'MAINTENANCE' },
      presentation: {
        variant: 'SEASONAL_CHECKLIST',
        subject: { kind: 'CHECKLIST', id: 'summer', label: 'Summer checklist' },
      },
    } as RankedHomeActionDTO;

    expect(isAssetLifecycleAction(asset)).toBe(true);
    expect(isAssetLifecycleAction(seasonal)).toBe(false);
    expect(groupAttentionActions([asset, seasonal]).map((entry) => entry.kind))
      .toEqual(['ASSET_LIFECYCLE', 'SEASONAL_CHECKLIST']);
  });
});

describe('home card hierarchy', () => {
  it('keeps urgent work separate from plan-ahead recommendations', () => {
    const actions = [
      { id: 'seasonal-checklist:1', priority: 'NOW', source: { kind: 'MAINTENANCE' } },
      { id: 'capital:1', priority: 'PLAN', source: { kind: 'SYSTEM' } },
      { id: 'context:1', priority: 'CONSIDER', source: { kind: 'SYSTEM' } },
      { id: 'coverage:1', priority: 'SOON', source: { kind: 'COVERAGE' } },
    ] as RankedHomeActionDTO[];

    const split = splitHomeAttentionEntries(groupAttentionActions(actions));

    expect(split.urgent.map((entry) => entry.kind === 'COVERAGE_CORRECTION_GROUP' ? 'coverage-group' : entry.action.id))
      .toEqual(['seasonal-checklist:1', 'coverage:1']);
    expect(split.planning.map((entry) => entry.kind === 'COVERAGE_CORRECTION_GROUP' ? 'coverage-group' : entry.action.id))
      .toEqual(['capital:1', 'context:1']);
  });
});
