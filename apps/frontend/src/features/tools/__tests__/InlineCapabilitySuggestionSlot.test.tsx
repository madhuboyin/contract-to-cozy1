import React from 'react';
import { render, screen } from '@testing-library/react';
import type { CapabilitySuggestionDTO } from '@/types';

const mockUseInlineCapabilitySuggestion = jest.fn();
const mockInlineCapabilitySuggestion = jest.fn(
  (props: { suggestion: CapabilitySuggestionDTO }) => (
    <div data-testid="inline-renderer">{props.suggestion.label}</div>
  ),
);

jest.mock('@/features/tools/useInlineCapabilitySuggestion', () => ({
  useInlineCapabilitySuggestion: (...args: unknown[]) =>
    mockUseInlineCapabilitySuggestion(...args),
}));
jest.mock('@/features/tools/InlineCapabilitySuggestion', () => ({
  InlineCapabilitySuggestion: (props: { suggestion: CapabilitySuggestionDTO }) =>
    mockInlineCapabilitySuggestion(props),
}));

import { InlineCapabilitySuggestionSlot } from '../InlineCapabilitySuggestionSlot';

const serverSuggestion = {
  suggestionId: 'material-specs:PROJECT:project-1:context-v1',
  capabilityId: 'material-specs',
  label: 'Material Specs',
} as CapabilitySuggestionDTO;

describe('InlineCapabilitySuggestionSlot', () => {
  beforeEach(() => {
    mockUseInlineCapabilitySuggestion.mockReset();
    mockInlineCapabilitySuggestion.mockClear();
  });

  it('requests by source context and renders the first server selection', () => {
    mockUseInlineCapabilitySuggestion.mockReturnValue({
      data: {
        registryVersion: 'registry-v1',
        suggestions: [serverSuggestion],
      },
    });

    render(
      <InlineCapabilitySuggestionSlot
        propertyId="property-1"
        sourceEntityType="PROJECT"
        sourceEntityId="project-1"
        sourceActionId="action-1"
        placementSurface="workflow"
      />,
    );

    expect(mockUseInlineCapabilitySuggestion).toHaveBeenCalledWith({
      propertyId: 'property-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      sourceActionId: 'action-1',
      placementSurface: 'workflow',
    }, { enabled: true });
    expect(screen.getByTestId('inline-renderer')).toHaveTextContent('Material Specs');
    expect(mockInlineCapabilitySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: serverSuggestion,
        propertyId: 'property-1',
        registryVersion: 'registry-v1',
        surface: 'workflow',
      }),
    );
  });

  it('renders no promotional container for loading, failure, or empty results', () => {
    mockUseInlineCapabilitySuggestion.mockReturnValue({ data: undefined });
    const { container, rerender } = render(
      <InlineCapabilitySuggestionSlot
        propertyId="property-1"
        sourceEntityType="ROOM"
        sourceEntityId="room-1"
        placementSurface="workflow"
      />,
    );
    expect(container.firstChild).toBeNull();

    mockUseInlineCapabilitySuggestion.mockReturnValue({
      data: { registryVersion: 'registry-v1', suggestions: [] },
    });
    rerender(
      <InlineCapabilitySuggestionSlot
        propertyId="property-1"
        sourceEntityType="ROOM"
        sourceEntityId="room-1"
        placementSurface="workflow"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
