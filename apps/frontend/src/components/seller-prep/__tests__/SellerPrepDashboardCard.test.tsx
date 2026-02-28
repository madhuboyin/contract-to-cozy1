import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Stubs ─────────────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, ...rest }: any) => (
    <button disabled={disabled} {...rest}>{children}</button>
  ),
}));
jest.mock('lucide-react', () => ({
  TrendingUp: () => <span>TrendingUp</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  ArrowRight: () => <span>ArrowRight</span>,
}));
// Capture the href passed to Link so we can assert it
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

import { SellerPrepDashboardCard } from '../SellerPrepDashboardCard';

const properties = [
  { id: 'prop-1', address: '123 Main St', name: 'Home' },
  { id: 'prop-2', address: '456 Oak Ave', name: 'Cabin' },
];

// ── Bug 6: Link wrapping disabled button ──────────────────────────────────────
describe('SellerPrepDashboardCard — Link/disabled button (Bug 6)', () => {
  it('renders Get Started button as disabled when no property is selected', () => {
    render(<SellerPrepDashboardCard properties={properties} />);
    const btn = screen.getByText('Get Started').closest('button');
    expect(btn).toBeDisabled();
  });

  it('does NOT wrap the disabled button in a Link (no href on ancestor)', () => {
    render(<SellerPrepDashboardCard properties={properties} />);
    const btn = screen.getByText('Get Started').closest('button');
    // The button must not be inside an <a> tag when disabled
    expect(btn?.closest('a')).toBeNull();
  });

  it('enables the button and wraps it in a Link after selecting a property', () => {
    render(<SellerPrepDashboardCard properties={properties} />);

    fireEvent.click(screen.getByText('Home'));

    const btn = screen.getByText('Get Started').closest('button');
    expect(btn).not.toBeDisabled();

    const link = btn?.closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/dashboard/properties/prop-1/seller-prep');
  });

  it('auto-selects the only property and renders an enabled Link', () => {
    render(<SellerPrepDashboardCard properties={[properties[0]]} />);
    const btn = screen.getByText('Get Started').closest('button');
    expect(btn).not.toBeDisabled();
    expect(btn?.closest('a')?.getAttribute('href')).toBe('/dashboard/properties/prop-1/seller-prep');
  });
});
