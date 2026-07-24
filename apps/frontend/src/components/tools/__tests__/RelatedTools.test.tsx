import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

const trackRelatedToolsEvent = jest.fn(() => Promise.resolve());
const track = jest.fn();
const useRelatedCapabilities = jest.fn();
const useCapabilityImpression = jest.fn((_input: unknown) => jest.fn());

jest.mock('@/features/tools/relatedToolsAnalytics', () => ({
  trackRelatedToolsEvent,
}));

jest.mock('@/lib/analytics/events', () => ({
  track,
}));

jest.mock('@/features/tools/useRelatedCapabilities', () => ({
  useRelatedCapabilities: (...args: unknown[]) => useRelatedCapabilities(...args),
}));

jest.mock('@/features/tools/useCapabilityImpression', () => ({
  useCapabilityImpression: (input: unknown) => useCapabilityImpression(input),
}));

import RelatedTools from '../RelatedTools';

describe('RelatedTools', () => {
  beforeEach(() => {
    trackRelatedToolsEvent.mockClear();
    track.mockClear();
    useCapabilityImpression.mockClear();
    useRelatedCapabilities.mockReset();
    useRelatedCapabilities.mockReturnValue({
      data: {
        registryVersion: 'registry-v2',
        recommendationVersion: 'capability-related-v1',
        contextVersion: 'context-v4',
        currentCapabilityId: 'service-price-radar',
        suggestions: [
          {
            capabilityId: 'negotiation-shield',
            manifestVersion: 1,
            label: 'Negotiation Shield',
            shortDescription: 'Prepare a negotiation.',
            iconName: 'shield',
            href: '/dashboard/properties/prop-1/tools/negotiation-shield',
            readiness: 'READY',
            reasonCode: 'EXPLICIT_RELATIONSHIP',
            score: 9,
          },
          {
            capabilityId: 'cost-explainer',
            manifestVersion: 1,
            label: 'Cost Explainer',
            shortDescription: 'Understand the cost.',
            iconName: 'dollar-sign',
            href: '/dashboard/properties/prop-1/tools/cost-explainer',
            readiness: 'READY',
            reasonCode: 'EXPLICIT_RELATIONSHIP',
            score: 8,
          },
        ],
      },
    });
  });

  it('renders the section title and related links', () => {
    render(
      <RelatedTools
        context="service-price-radar"
        currentToolId="service-price-radar"
        propertyId="prop-1"
      />,
    );

    expect(screen.getByText('Related tools')).toBeInTheDocument();
    const negotiationLink = screen.getByRole('link', { name: /Negotiation Shield/i });
    expect(negotiationLink.getAttribute('href')).toContain(
      '/dashboard/properties/prop-1/tools/negotiation-shield?',
    );
    expect(negotiationLink.getAttribute('href')).toContain('launchSurface=workflow');
    expect(negotiationLink.getAttribute('href')).toContain(
      'recommendationVersion=capability-related-v1',
    );
    expect(screen.getByRole('link', { name: /Cost Explainer/i })).toBeInTheDocument();
    expect(useRelatedCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'prop-1',
        currentCapabilityId: 'service-price-radar',
      }),
      { enabled: true },
    );
    expect(useCapabilityImpression).toHaveBeenCalledWith(expect.objectContaining({
      capabilityId: 'negotiation-shield',
      surface: 'workflow',
      registryVersion: 'registry-v2',
      recommendationReason: 'EXPLICIT_RELATIONSHIP',
      recommendationVersion: 'capability-related-v1',
      contextVersion: 'context-v4',
    }));

    fireEvent.click(negotiationLink);
    expect(track).toHaveBeenCalledWith('tool_discovery_clicked', expect.objectContaining({
      toolId: 'negotiation-shield',
      recommendationReason: 'EXPLICIT_RELATIONSHIP',
      recommendationVersion: 'capability-related-v1',
      contextVersion: 'context-v4',
    }));
  });

  it('renders nothing when the resolver returns no suggestions', () => {
    useRelatedCapabilities.mockReturnValue({
      data: {
        registryVersion: 'registry-v2',
        recommendationVersion: 'capability-related-v1',
        contextVersion: 'context-v4',
        currentCapabilityId: 'home-event-radar',
        suggestions: [],
      },
    });
    const { container } = render(
      <RelatedTools
        context="dashboard"
        currentToolId="home-event-radar"
        maxItems={1}
        propertyId="prop-1"
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
