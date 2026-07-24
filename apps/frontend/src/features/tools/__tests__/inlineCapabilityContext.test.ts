import { buildInlineCapabilityRequest } from '../inlineCapabilityContext';

describe('inlineCapabilityContext', () => {
  it('maps workflow context without accepting a capability identity', () => {
    const request = buildInlineCapabilityRequest({
      propertyId: 'property-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      sourceActionId: 'action-1',
      journeyId: 'journey-1',
      placementSurface: 'workflow',
    });

    expect(request).toEqual({
      propertyId: 'property-1',
      surface: 'WORKFLOW',
      limit: 1,
      sourceKind: 'JOURNEY',
      sourceId: 'journey-1',
      sourceActionId: 'action-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      sourceEventType: undefined,
    });
    expect(request).not.toHaveProperty('capabilityId');
  });

  it('maps a verified completion output to a single scoped request', () => {
    expect(buildInlineCapabilityRequest({
      propertyId: 'property-1',
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      completionEventType: 'ARTIFACT_CREATED',
      placementSurface: 'completion',
    })).toEqual({
      propertyId: 'property-1',
      surface: 'COMPLETION',
      limit: 1,
      sourceKind: 'COMPLETION',
      sourceId: 'document-1',
      sourceActionId: undefined,
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      sourceEventType: 'ARTIFACT_CREATED',
    });
  });

  it('uses the narrowest available non-completion source lineage', () => {
    expect(buildInlineCapabilityRequest({
      propertyId: 'property-1',
      sourceEntityType: 'ISSUE',
      sourceEntityId: 'finding-1',
      sourceActionId: 'action-1',
      placementSurface: 'workflow',
    }).sourceKind).toBe('HOME_ACTION');

    expect(buildInlineCapabilityRequest({
      propertyId: 'property-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      placementSurface: 'workflow',
    }).sourceKind).toBe('PROJECT');

    expect(buildInlineCapabilityRequest({
      propertyId: 'property-1',
      sourceEntityType: 'ROOM',
      sourceEntityId: 'room-1',
      placementSurface: 'workflow',
    }).sourceKind).toBe('PROPERTY_CONTEXT');
  });
});
