import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskDestinationNav } from '../workspace/AskDestinationNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/ask/work',
  useSearchParams: () => new URLSearchParams('propertyId=home&sessionId=session&executionId=execution'),
}));

describe('AskDestinationNav', () => {
  it('provides labeled keyboard links, current-destination state, and continuity URLs on desktop and mobile', async () => {
    const user = userEvent.setup();
    render(<AskDestinationNav />);
    expect(screen.getAllByRole('navigation', { name: 'Ask Cozy destinations' })).toHaveLength(2);
    const homeLinks = screen.getAllByRole('link', { name: 'Home' });
    const workLinks = screen.getAllByRole('link', { name: 'Work' });
    expect(workLinks.every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
    expect(homeLinks[0]).toHaveAttribute('href', '/dashboard/ask?propertyId=home&sessionId=session&executionId=execution');
    await user.tab();
    expect(homeLinks[0]).toHaveFocus();
    await user.tab();
    expect(workLinks[0]).toHaveFocus();
  });
});
