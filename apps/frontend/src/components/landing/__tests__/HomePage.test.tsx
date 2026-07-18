import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, fill: _fill, priority: _priority, ...rest }: any) => <img alt={alt} {...rest} />,
}));

import Home from '@/app/page';

describe('homepage narrative', () => {
  it('renders the primary homeowner jobs and consistent account CTAs', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: /Own your home with confidence/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stay Ahead' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Save Money' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Make Better Decisions' })).toBeInTheDocument();

    const accountLinks = screen.getAllByRole('link', { name: /Create free account/i });
    expect(accountLinks.length).toBeGreaterThanOrEqual(2);
    accountLinks.forEach((link) => expect(link).toHaveAttribute('href', '/signup'));
  });

  it('keeps the savings form labeled and shows an illustrative result', () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText('Property location'), { target: { value: 'Brooklyn, NY' } });
    fireEvent.change(screen.getByLabelText('Purchase price'), { target: { value: '500000' } });
    fireEvent.change(screen.getByLabelText('Purchase date'), { target: { value: '2024-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find my opportunities' }));

    expect(screen.getByText('Illustrative opportunity preview')).toBeInTheDocument();
    expect(screen.queryByText('Potential value')).not.toBeInTheDocument();
  });

  it('exposes semantic headers for the desktop comparison table', () => {
    render(<Home />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'With Contract to Cozy' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Finding savings' })).toBeInTheDocument();
  });
});
