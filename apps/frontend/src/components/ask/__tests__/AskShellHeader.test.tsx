import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskShellHeader } from '../workspace/AskShellHeader';

const replace = jest.fn();
const push = jest.fn();
const setSelectedPropertyId = jest.fn();
const logout = jest.fn();

let mockPath = '/dashboard/profile';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
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

jest.mock('../search/AskSearchDialog', () => ({ AskSearchDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Search your home" /> : null) }));

jest.mock('@/components/layout/CtcPropertySelector', () => ({
  CtcPropertySelector: ({ onPropertySelect }: { onPropertySelect: (propertyId: string) => void }) => (
    <button type="button" onClick={() => onPropertySelect('home-2')}>Choose Lake House</button>
  ),
}));

describe('AskShellHeader', () => {
  beforeEach(() => { jest.clearAllMocks(); mockPath = '/dashboard/profile'; });

  it('exposes every persistent utility and opens global command search', async () => {
    const user = userEvent.setup();
    const opened = jest.fn();
    window.addEventListener('ctc-command-palette-open', opened, { once: true });
    render(<AskShellHeader />);

    expect(screen.getByRole('link', { name: 'Ask Cozy Home' })).toHaveAttribute('href', '/dashboard/ask');
    expect(screen.getByRole('button', { name: 'Notifications (12 unread)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search pages, actions, and tools' }));
    expect(opened).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Open settings for Ada Homeowner' }));
    expect(await screen.findByRole('menuitem', { name: 'Profile, privacy & settings' })).toHaveAttribute('href', '/dashboard/profile');
    expect(screen.getByRole('menuitem', { name: 'Notification settings' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('opens the federated home search from its own button, separate from the pages-and-tools palette', () => {
    render(<AskShellHeader />);
    expect(screen.queryByRole('dialog', { name: 'Search your home' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search your home' }));
    expect(screen.getByRole('dialog', { name: 'Search your home' })).toBeInTheDocument();
  });

  it('keeps the current destination but clears the old property conversation when switching homes', () => {
    render(<AskShellHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lake House' }));
    expect(setSelectedPropertyId).toHaveBeenCalledWith('home-2');
    expect(replace).toHaveBeenCalledWith('/dashboard/profile?propertyId=home-2');
  });
  it('asks "What\'s new?" in the open conversation, and opens Ask with it from any other page', async () => {
    const asked = jest.fn();
    window.addEventListener('ask:ask-question', asked);
    mockPath = '/dashboard/ask';
    const { unmount } = render(<AskShellHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (12 unread)' }));
    expect((asked.mock.calls[0][0] as CustomEvent).detail).toEqual({ propertyId: 'home-1', question: "What's new?" });
    expect(push).not.toHaveBeenCalled();
    unmount();
    window.removeEventListener('ask:ask-question', asked);

    mockPath = '/dashboard/profile';
    render(<AskShellHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (12 unread)' }));
    expect(new URL(push.mock.calls[0][0], 'https://x.test').searchParams.get('question')).toBe("What's new?");
  });

  it('asks for the notification settings from the account menu', async () => {
    const user = userEvent.setup();
    render(<AskShellHeader />);
    await user.click(screen.getByRole('button', { name: 'Open settings for Ada Homeowner' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Notification settings' }));
    expect(new URL(push.mock.calls[0][0], 'https://x.test').searchParams.get('question')).toBe('Show my notification settings');
  });
});
