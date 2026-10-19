import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskShellHeader } from '../workspace/AskShellHeader';

const replace = jest.fn();
const push = jest.fn();
const setSelectedPropertyId = jest.fn();
const logout = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/ask/work',
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams('propertyId=home-1&sessionId=session-1&executionId=execution-1'),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { properties: [{ id: 'home-1', name: 'Maple House' }, { id: 'home-2', name: 'Lake House' }] } }),
}));

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId }),
}));

jest.mock('@/lib/notifications/NotificationContext', () => ({
  useNotifications: () => ({ unreadCount: 12 }),
}));

jest.mock('../workspace/useAskAccount', () => ({
  useAskAccount: () => ({ accountName: 'Ada Homeowner', accountEmail: 'ada@example.com', loggingOut: false, handleLogout: logout }),
}));

jest.mock('@/components/layout/CtcPropertySelector', () => ({
  CtcPropertySelector: ({ onPropertySelect }: { onPropertySelect: (propertyId: string) => void }) => (
    <button type="button" onClick={() => onPropertySelect('home-2')}>Choose Lake House</button>
  ),
}));

describe('AskShellHeader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes every persistent utility and opens global command search', async () => {
    const user = userEvent.setup();
    const opened = jest.fn();
    window.addEventListener('ctc-command-palette-open', opened, { once: true });
    render(<AskShellHeader />);

    expect(screen.getByRole('link', { name: 'Ask Cozy Home' })).toHaveAttribute('href', '/dashboard/ask');
    expect(screen.getByRole('link', { name: 'Notifications (12 unread)' })).toHaveAttribute('href', '/dashboard/notifications');
    fireEvent.click(screen.getByRole('button', { name: 'Search pages, actions, and tools' }));
    expect(opened).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Open settings for Ada Homeowner' }));
    expect(await screen.findByRole('menuitem', { name: 'Profile, privacy & settings' })).toHaveAttribute('href', '/dashboard/profile');
    expect(screen.getByRole('menuitem', { name: 'Notification settings' })).toHaveAttribute('href', '/dashboard/notifications');
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('keeps the current destination but clears the old property conversation when switching homes', () => {
    render(<AskShellHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lake House' }));
    expect(setSelectedPropertyId).toHaveBeenCalledWith('home-2');
    expect(replace).toHaveBeenCalledWith('/dashboard/ask/work?propertyId=home-2');
  });
});
