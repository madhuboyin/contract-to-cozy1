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
    expect(screen.getByRole('link', { name: /Negotiation Shield/i })).toHaveAttribute(
      'href',
      '/dashboard/properties/prop-1/tools/negotiation-shield',
    );
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
