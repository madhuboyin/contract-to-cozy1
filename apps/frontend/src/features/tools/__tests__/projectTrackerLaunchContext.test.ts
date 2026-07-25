import {
  projectTrackerLaunchQuery,
  projectTrackerLineage,
} from '../projectTrackerLaunchContext';

describe('Project Tracker launch context', () => {
  it('preserves recommendation attribution from the hub into project creation', () => {
    const input = new URLSearchParams({
      launchSurface: 'workflow',
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'contract-1',
      journeyId: 'journey-1',
      recommendationVersion: 'recommendation-v2',
    });
    const forwarded = new URLSearchParams(projectTrackerLaunchQuery(input));
    expect(forwarded.get('sourceEntityId')).toBe('contract-1');
    expect(forwarded.get('recommendationVersion')).toBe('recommendation-v2');
  });

  it('maps action, contract, and journey attribution into the project record', () => {
    expect(projectTrackerLineage(new URLSearchParams({
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'contract-1',
      journeyId: 'journey-1',
    }))).toEqual({
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'contract-1',
      sourceJourneyId: 'journey-1',
    });
  });
});
