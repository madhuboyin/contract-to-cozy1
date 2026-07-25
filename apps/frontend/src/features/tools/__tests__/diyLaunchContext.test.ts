import {
  diyProjectSourcePayload,
  diyPromptFromLaunchContext,
} from '../diyLaunchContext';
import type { ResolvedToolDestinationContext } from '../toolDestinationContext';

function resolved(
  entityType: string | null,
  entityId: string | null,
): ResolvedToolDestinationContext {
  return {
    sourceAction: null,
    sourceActionFound: false,
    journey: null,
    nextJourneyLabel: null,
    contextVersionStatus: 'CURRENT',
    currentContextVersion: 'ctx-1',
    recommendationLabel: null,
    sourceTitle: 'Replace the loose cabinet handle',
    sourceSummary: 'A reviewed maintenance task for the kitchen',
    prefill: {
      entityType,
      entityId,
      itemId: entityType === 'INVENTORY_ITEM' ? entityId : null,
      journeyId: null,
      serviceKey: null,
      issueType: null,
      scopeCategory: null,
      scopeId: null,
    },
    actionPlanHref: null,
    journeyHref: null,
  };
}

describe('DIY contextual launch', () => {
  it('prefills supported source lineage without guessing generic issues', () => {
    expect(diyProjectSourcePayload(resolved('MAINTENANCE_TASK', 'task-1')))
      .toEqual({ maintenanceTaskId: 'task-1' });
    expect(diyProjectSourcePayload(resolved('INVENTORY_ITEM', 'item-1')))
      .toEqual({ inventoryItemId: 'item-1' });
    expect(diyProjectSourcePayload(resolved('ISSUE', 'finding-1'))).toEqual({});
  });

  it('turns resolved recommendation context into an editable guide prompt', () => {
    expect(diyPromptFromLaunchContext(resolved('MAINTENANCE_TASK', 'task-1')))
      .toBe(
        'Replace the loose cabinet handle. A reviewed maintenance task for the kitchen',
      );
  });
});

