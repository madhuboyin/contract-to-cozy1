import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import RouteStateCard from '../RouteStateCard';

describe('RouteStateCard accessibility semantics', () => {
  it('announces loading as a busy polite status', () => {
    render(
      <RouteStateCard
        state="loading"
        title="Loading your Closing Plan"
        description="Gathering property context."
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Loading your Closing Plan' })).toBeInTheDocument();
  });

  it('announces errors assertively and renders recovery actions', () => {
    render(
      <RouteStateCard
        state="error"
        title="Your Closing Plan couldn’t load"
        description="Your property record is still safe."
        action={<button type="button">Try again</button>}
        secondaryAction={<Link href="/dashboard/properties/property-1">Back to property</Link>}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to property' })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1',
    );
  });
});
