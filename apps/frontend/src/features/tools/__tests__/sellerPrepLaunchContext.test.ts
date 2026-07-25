import { sellerPrepSourceLineage } from '../sellerPrepLaunchContext';
import type { ToolLaunchContextValue } from '../ToolLaunchContextBoundary';

function launch(entityType: string | null): ToolLaunchContextValue {
  return {
    toolId: 'seller-prep',
    propertyId: 'property-1',
    context: {
      launchSurface: 'unified_home',
      sourceActionId: 'action-1',
      sourceEntityType: entityType,
      sourceEntityId: entityType ? 'project-1' : null,
      journeyId: 'journey-1',
    },
    isResolving: false,
    resolved: {
      sourceAction: null,
      sourceActionFound: false,
      journey: null,
      nextJourneyLabel: null,
      contextVersionStatus: 'CURRENT',
      currentContextVersion: 'context-v2',
      recommendationLabel: 'Seller journey active',
      sourceTitle: 'Prepare this home for sale',
      sourceSummary: null,
      prefill: {
        entityType,
        entityId: entityType ? 'project-1' : null,
        itemId: null,
        journeyId: 'journey-1',
        serviceKey: null,
        issueType: null,
        scopeCategory: null,
        scopeId: null,
      },
      actionPlanHref: null,
      journeyHref: null,
    },
  };
}

describe('Seller Prep contextual launch', () => {
  it('preserves action, journey, and project lineage for the created plan', () => {
    expect(sellerPrepSourceLineage(launch('PROJECT'))).toEqual({
      sourceActionId: 'action-1',
      sourceJourneyId: 'journey-1',
      sourceProjectId: 'project-1',
    });
  });

  it('does not guess project lineage from another entity type', () => {
    expect(sellerPrepSourceLineage(launch('JOURNEY'))).toEqual({
      sourceActionId: 'action-1',
      sourceJourneyId: 'journey-1',
    });
  });
});

