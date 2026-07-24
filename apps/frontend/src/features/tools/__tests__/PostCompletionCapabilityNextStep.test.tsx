import React from 'react';
import { render, screen } from '@testing-library/react';
import type {
  CapabilityCompletionNextResponseDTO,
  CapabilitySuggestionDTO,
} from '@/types';

const mockInlineCapabilitySuggestion = jest.fn(
  (props: { suggestion: CapabilitySuggestionDTO }) => (
    <div data-testid="inline-next-capability">{props.suggestion.label}</div>
  ),
);

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
jest.mock('@/features/tools/InlineCapabilitySuggestion', () => ({
  InlineCapabilitySuggestion: (props: { suggestion: CapabilitySuggestionDTO }) =>
    mockInlineCapabilitySuggestion(props),
}));

import { PostCompletionCapabilityNextStep } from '../PostCompletionCapabilityNextStep';

function result(
  suggestion: CapabilitySuggestionDTO | null,
): CapabilityCompletionNextResponseDTO {
  return {
    contractVersion: 'capability-completion-next-v1',
    propertyId: 'property-1',
    recordedAt: '2026-07-24T12:00:00.000Z',
    completion: {
      capabilityId: 'material-specs',
      capabilityVersion: 1,
      completionKind: 'OUTPUT_VIEWED',
      outputEntityType: 'DOCUMENT',
      outputEntityId: 'document-1',
    },
    registryVersion: 'registry-v1',
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v1',
    suggestion,
    exploreToolsHref: '/dashboard/home-tools?propertyId=property-1',
  };
}

const nextSuggestion = {
  suggestionId: 'home-digital-will:COMPLETION:event-1:context-v1',
  capabilityId: 'home-digital-will',
  label: 'Home Digital Will',
} as CapabilitySuggestionDTO;

describe('PostCompletionCapabilityNextStep', () => {
  beforeEach(() => {
    mockInlineCapabilitySuggestion.mockClear();
  });

  it('renders nothing before a completion result exists', () => {
    const { container } = render(
      <PostCompletionCapabilityNextStep result={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one primary next step and the Explore Tools fallback', () => {
    render(
      <PostCompletionCapabilityNextStep result={result(nextSuggestion)} />,
    );

    expect(screen.getByTestId('inline-next-capability')).toHaveTextContent(
      'Home Digital Will',
    );
    expect(mockInlineCapabilitySuggestion).toHaveBeenCalledTimes(1);
    expect(mockInlineCapabilitySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: nextSuggestion,
        propertyId: 'property-1',
        registryVersion: 'registry-v1',
        surface: 'completion',
      }),
    );
    expect(
      screen.getByRole('link', { name: /Explore all tools/i }),
    ).toHaveAttribute(
      'href',
      '/dashboard/home-tools?propertyId=property-1',
    );
  });

  it('renders only the Explore Tools link when no next step is eligible', () => {
    const { container } = render(
      <PostCompletionCapabilityNextStep result={result(null)} />,
    );

    expect(screen.queryByTestId('post-completion-next-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inline-next-capability')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Explore tools/i }),
    ).toHaveAttribute(
      'href',
      '/dashboard/home-tools?propertyId=property-1',
    );
    expect(container.querySelector('section')).toBeNull();
  });
});
