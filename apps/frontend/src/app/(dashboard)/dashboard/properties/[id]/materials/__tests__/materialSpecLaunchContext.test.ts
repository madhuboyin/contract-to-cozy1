import { materialSpecLaunchPrefill } from '../materialSpecLaunchContext';
import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';

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
    recommendationLabel: 'Material record needed',
    sourceTitle: 'Kitchen renovation',
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

describe('Material Specs recommendation prefill', () => {
  it('links a project recommendation to the created material record', () => {
    expect(materialSpecLaunchPrefill({
      toolId: 'material-specs',
      resolved: resolved('PROJECT', 'project-1'),
    })).toEqual({
      initialValues: {
        scopeLevel: 'PROPERTY',
        projectId: 'project-1',
      },
      sourceLabel: 'Kitchen renovation',
    });
  });

  it('preselects room scope for room recommendations', () => {
    expect(materialSpecLaunchPrefill({
      toolId: 'material-specs',
      resolved: resolved('ROOM', 'room-1'),
    })?.initialValues).toEqual({
      scopeLevel: 'ROOM',
      roomId: 'room-1',
    });
  });

  it('does not infer unsupported context', () => {
    expect(materialSpecLaunchPrefill({
      toolId: 'material-specs',
      resolved: resolved('ISSUE', 'issue-1'),
    })).toBeNull();
  });
});
