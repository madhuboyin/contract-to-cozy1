import {
  complianceLaunchLineage,
  forwardComplianceLaunchQuery,
} from '../complianceLaunchContext';

describe('compliance launch context', () => {
  it('preserves recommendation attribution across property-scoped redirects', () => {
    const input = new URLSearchParams({
      launchSurface: 'property_detail',
      sourceActionId: 'action-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      journeyId: 'journey-1',
      recommendationVersion: 'recommendation-v2',
    });
    const forwarded = new URLSearchParams(
      forwardComplianceLaunchQuery(input, 'property-1'),
    );
    expect(forwarded.get('propertyId')).toBe('property-1');
    expect(forwarded.get('sourceActionId')).toBe('action-1');
    expect(forwarded.get('sourceEntityId')).toBe('project-1');
    expect(forwarded.get('recommendationVersion')).toBe('recommendation-v2');
  });

  it('maps launch attribution to tracked compliance records', () => {
    expect(complianceLaunchLineage(new URLSearchParams({
      sourceActionId: 'action-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      journeyId: 'journey-1',
    }))).toEqual({
      sourceActionId: 'action-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      sourceJourneyId: 'journey-1',
    });
  });
});
