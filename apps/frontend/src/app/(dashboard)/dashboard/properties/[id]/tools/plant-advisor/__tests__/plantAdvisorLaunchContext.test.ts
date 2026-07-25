import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';
import {
  plantAdvisorGrowingContextState,
  plantAdvisorRoomPrefill,
} from '../plantAdvisorLaunchContext';

function resolved(
  entityType: string,
  entityId: string,
): ResolvedToolDestinationContext {
  return {
    sourceAction: null,
    sourceActionFound: false,
    journey: null,
    nextJourneyLabel: null,
    contextVersionStatus: 'CURRENT',
    currentContextVersion: 'context-v1',
    recommendationLabel: 'Plant suitable room context',
    sourceTitle: 'Bright living room',
    sourceSummary: null,
    prefill: {
      entityType,
      entityId,
      itemId: null,
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

describe('Plant Advisor activation context', () => {
  it('prefills a room from canonical recommendation lineage', () => {
    expect(plantAdvisorRoomPrefill({
      toolId: 'plant-advisor',
      resolved: resolved('ROOM', 'room-1'),
    })).toBe('room-1');
  });

  it('does not infer a room from unsupported source types', () => {
    expect(plantAdvisorRoomPrefill({
      toolId: 'plant-advisor',
      resolved: resolved('MAINTENANCE', 'task-1'),
    })).toBeNull();
  });

  it('requires light before declaring the growing context ready', () => {
    expect(plantAdvisorGrowingContextState(null)).toEqual({
      state: 'NEEDS_CONTEXT',
      reason: 'Choose this room’s light level before generating recommendations.',
    });
    expect(plantAdvisorGrowingContextState('MEDIUM')).toEqual({
      state: 'READY',
      reason: null,
    });
  });
});
