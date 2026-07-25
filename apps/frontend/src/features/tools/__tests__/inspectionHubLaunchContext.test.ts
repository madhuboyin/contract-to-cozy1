import {
  inspectionHubLaunchQuery,
  inspectionUploadLineage,
} from '../inspectionHubLaunchContext';

describe('Inspection Hub launch context', () => {
  it('preserves the complete recommendation query through the redirect and upload flow', () => {
    const input = new URLSearchParams({
      launchSurface: 'guidance',
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      journeyId: 'journey-1',
      recommendationVersion: 'recommendation-v2',
    });
    const forwarded = new URLSearchParams(inspectionHubLaunchQuery(input));
    expect(forwarded.get('sourceEntityId')).toBe('document-1');
    expect(forwarded.get('recommendationVersion')).toBe('recommendation-v2');
  });

  it('maps document and journey attribution into the upload contract', () => {
    expect(inspectionUploadLineage(new URLSearchParams({
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      journeyId: 'journey-1',
    }))).toEqual({
      sourceActionId: 'action-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      sourceJourneyId: 'journey-1',
    });
  });
});
