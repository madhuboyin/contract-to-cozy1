import React from 'react';
import { render } from '@testing-library/react';

const mockInlineCapabilitySuggestionSlot = jest.fn((_props: unknown) => null);

jest.mock('@/features/tools/InlineCapabilitySuggestionSlot', () => ({
  InlineCapabilitySuggestionSlot: (props: unknown) =>
    mockInlineCapabilitySuggestionSlot(props),
}));

import {
  CAPABILITY_DISCOVERY_ANCHORS,
  CapabilityDiscoveryAnchor,
} from '../CapabilityDiscoveryAnchor';

describe('CapabilityDiscoveryAnchor', () => {
  beforeEach(() => {
    mockInlineCapabilitySuggestionSlot.mockClear();
  });

  it('covers every reviewed CAP-605 anchor with canonical context only', () => {
    expect(CAPABILITY_DISCOVERY_ANCHORS).toEqual({
      INSPECTION_RESULT: 'DOCUMENT',
      INSPECTION_FINDING_COMPLETED: 'ISSUE',
      PROJECT_CREATED: 'PROJECT',
      PROJECT_COMPLETED: 'PROJECT',
      ROOM_SETUP_COMPLETED: 'ROOM',
      INVENTORY_ITEM_INGESTED: 'INVENTORY_ITEM',
      DOCUMENT_INGESTED: 'DOCUMENT',
      QUOTE_ANALYSIS_RESULT: 'SERVICE',
      SELLER_INTENT_ACTIVE: 'PROPERTY',
      CONTRACTOR_SELECTED: 'PROJECT',
      CONTRACT_UPLOADED: 'PROJECT',
    });
    expect(JSON.stringify(CAPABILITY_DISCOVERY_ANCHORS)).not.toContain(
      'capabilityId',
    );
  });

  it('passes source lineage to the shared slot without selecting a capability', () => {
    render(
      <CapabilityDiscoveryAnchor
        anchor="PROJECT_CREATED"
        propertyId="property-1"
        entityId="project-1"
        sourceActionId="action-1"
        journeyId="journey-1"
      />,
    );

    expect(mockInlineCapabilitySuggestionSlot).toHaveBeenCalledWith({
      propertyId: 'property-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      sourceActionId: 'action-1',
      journeyId: 'journey-1',
      placementSurface: 'workflow',
      enabled: true,
      className: undefined,
    });
    expect(mockInlineCapabilitySuggestionSlot.mock.calls[0][0]).not.toHaveProperty(
      'capabilityId',
    );
  });
});
