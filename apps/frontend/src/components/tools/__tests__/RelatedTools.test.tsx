import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

const trackRelatedToolsEvent = jest.fn(() => Promise.resolve());

jest.mock('@/features/tools/relatedToolsAnalytics', () => ({
  trackRelatedToolsEvent,
}));

jest.mock('@/features/tools/useToolDiscoveryAvailability', () => ({
  useToolDiscoveryAvailability: () => ({ data: undefined }),
}));

import RelatedTools from '../RelatedTools';

describe('RelatedTools', () => {
  beforeEach(() => {
    trackRelatedToolsEvent.mockClear();
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
    expect(screen.getByRole('link', { name: /Cost Explainer/i })).toBeInTheDocument();
  });

  it('renders nothing when no related tools survive filtering', () => {
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
