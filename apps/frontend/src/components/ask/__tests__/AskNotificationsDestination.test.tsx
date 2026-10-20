/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskNotificationsDestination } from '../notifications/AskNotificationsDestination';
import { notificationDestinationHref } from '../notifications/notificationPresentation';
import { api } from '@/lib/api/client';
import type { AskNotificationItem, AskNotificationOpenResult, AskNotificationPage, AskNotificationSettings } from '@/features/ask/types';

const push = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(mockSearch) }));
jest.mock('@/lib/property/PropertyContext', () => ({ usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }) }));
jest.mock('@/lib/api/client', () => ({ api: {
  getAskNotifications: jest.fn(), openAskNotification: jest.fn(), resolveAskWork: jest.fn(), resolveAskSavedArtifact: jest.fn(), setAskNotificationDismissed: jest.fn(), setAskNotificationRead: jest.fn(),
  getAskNotificationSettings: jest.fn(), updateAskNotificationCategory: jest.fn(), updateAskNotificationQuietHours: jest.fn(), setAskNotificationConsent: jest.fn(),
} }));
const mocks = api as unknown as Record<string, jest.Mock>;

const item = (overrides: Partial<AskNotificationItem> = {}): AskNotificationItem => ({
  id: 'n1', type: 'CLAIM_SUBMITTED', category: 'WORKFLOW', categoryLabel: 'Your requests and claims', urgency: 'MATERIAL', title: 'Claim submitted', message: 'Your claim was sent.', whyItAppeared: 'Something you started, a request, claim or booking, changed.',
  propertyId: 'home-1', propertyLabel: '94 Ashford Dr', propertyAccess: 'ACCESSIBLE', createdAt: '2026-10-18T12:00:00.000Z', expiresAt: null, expired: false, isRead: false, dismissed: false, continuationKind: 'WORK', deliveryPaused: null, ...overrides,
});
const page = (items: AskNotificationItem[], overrides: Partial<AskNotificationPage> = {}): AskNotificationPage => ({
  contractVersion: 'ask-notification-v1', generatedAt: '2026-10-20T12:00:00.000Z', view: 'INBOX', total: items.length, unreadCount: items.filter((i) => !i.isRead).length, dismissedCount: 2, nextCursor: null, truncated: false,
  query: { unreadOnly: false, category: null, propertyId: null }, filterOptions: { categories: [{ value: 'WORKFLOW', label: 'Your requests and claims' }], properties: [{ value: 'home-1', label: '94 Ashford Dr' }, { value: 'home-2', label: 'Lake House' }] }, items, ...overrides,
});
const opened = (overrides: Partial<AskNotificationOpenResult> = {}): AskNotificationOpenResult => ({ contractVersion: 'ask-notification-v1', notificationId: 'n1', outcome: 'AVAILABLE', destination: { kind: 'WORK', workKey: 'claim:c1' }, propertyId: 'home-1', legacy: false, message: 'Ready to open.', ...overrides });
const settings = (): AskNotificationSettings => ({
  generatedAt: '2026-10-20T12:00:00.000Z',
  channels: [{ channel: 'IN_APP', configurable: false, disclosure: 'Notifications are always kept in your inbox.' }, { channel: 'EMAIL', configurable: true, disclosure: 'Email is optional.' }],
  unavailableChannels: [{ channel: 'PUSH', reason: 'Push notifications are not available yet.' }],
  quietHours: { start: null, end: null, timezone: 'UTC' },
  categories: [
    { category: 'SAFETY', label: 'Safety', description: 'Safety notice.', canPause: false, email: { mode: 'ON', snoozedUntil: null, cadence: null, defaultCadence: 'IMMEDIATE' }, consent: { required: false, granted: false, version: null, disclosure: null } },
    { category: 'MAINTENANCE', label: 'Maintenance', description: 'A maintenance reminder.', canPause: true, email: { mode: 'ON', snoozedUntil: null, cadence: null, defaultCadence: 'WEEKLY_BRIEF' }, consent: { required: false, granted: false, version: null, disclosure: null } },
    { category: 'REFINANCE', label: 'Refinance alerts', description: 'Rate alerts.', canPause: true, email: { mode: 'MUTED', snoozedUntil: null, cadence: 'MUTED', defaultCadence: 'WEEKLY_BRIEF' }, consent: { required: true, granted: false, version: null, disclosure: 'If you allow it, we email you when refinance rates cross a threshold.' } },
  ],
  capabilitySettings: [{ id: 'refinance-monitors', label: 'Refinance rate monitors', description: 'Each monitor has its own threshold.', question: 'Show my refinance rate monitors.' }],
});

describe('AskNotificationsDestination', () => {
  beforeEach(() => { mockSearch = ''; push.mockReset(); for (const mock of Object.values(mocks)) mock.mockReset(); });

  it('lists the inbox with home, kind, why it appeared and unread state, and counts unread and dismissed', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item()]) });
    render(<AskNotificationsDestination />);
    expect(await screen.findByText('Claim submitted')).toBeInTheDocument();
    const row = screen.getByText('Claim submitted').closest('li') as HTMLElement;
    expect(within(row).getByText('94 Ashford Dr')).toBeInTheDocument();
    expect(within(row).getByText('Your requests and claims')).toBeInTheDocument();
    expect(within(row).getByText('New')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Why this?' }));
    expect(document.querySelector('[data-notification-detail]')).toHaveTextContent('Something you started');
    expect(document.querySelector('[data-notification-detail]')).toHaveTextContent('No expiry');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Inbox1', 'Dismissed2', 'Settings']);
  });

  it('opens the exact current destination, marks it read, and goes there', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item()]) });
    mocks.openAskNotification.mockResolvedValue({ success: true, data: opened() });
    render(<AskNotificationsDestination />);
    // The work is reread first, then continued in Ask with its own operation and record: no Work page.
    mocks.resolveAskWork.mockResolvedValue({ success: true, data: { outcome: 'AVAILABLE', message: '', row: { title: 'Water claim', resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: { operationId: 'CLAIM_CHECKLIST_VIEW', entityType: 'CLAIM', entityId: 'c1', actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: 'v1' } } } } });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue this' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(push.mock.calls[0][0], 'https://x.test');
    expect(url.pathname).toBe('/dashboard/ask');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ propertyId: 'home-1', question: 'Continue: Water claim', launchOperationId: 'CLAIM_CHECKLIST_VIEW', launchEntityType: 'CLAIM', launchEntityId: 'c1', launchContextVersion: 'v1' });
    expect(mocks.resolveAskWork).toHaveBeenCalledWith('home-1', 'claim:c1');
    expect(mocks.openAskNotification).toHaveBeenCalledWith('n1');
  });

  it.each([['DELETED', 'What this was about has been removed, so there is nothing to open.'], ['ACCESS_LOST', 'You no longer have access to the home this is about.'], ['UNAVAILABLE', 'This service booking is not a repair, and Ask cannot manage bookings yet.']] as const)('says %s plainly and does not navigate', async (outcome, message) => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item()]) });
    mocks.openAskNotification.mockResolvedValue({ success: true, data: opened({ outcome, destination: null, message }) });
    render(<AskNotificationsDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue this' }));
    expect(await screen.findByText(message, { exact: false })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a lost home without naming it, flags paused email and expiry, and says when a link leaves Ask', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item({ propertyAccess: 'LOST', propertyLabel: null, deliveryPaused: 'SNOOZED', expired: true, expiresAt: '2026-10-19T00:00:00.000Z', continuationKind: 'LEGACY_LINK' })]) });
    render(<AskNotificationsDestination />);
    expect(await screen.findByText('A home you no longer have access to')).toBeInTheDocument();
    const lostRow = screen.getByText('Claim submitted').closest('li') as HTMLElement;
    expect(within(lostRow).queryByText('94 Ashford Dr')).not.toBeInTheDocument();
    expect(screen.getByText('Email snoozed')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this?' }));
    expect(document.querySelector('[data-notification-detail]')).toHaveTextContent('opens a page outside Ask');
  });

  it('has no dead action for a notification with nothing to open', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item({ continuationKind: 'NONE' })]) });
    render(<AskNotificationsDestination />);
    await screen.findByText('Claim submitted');
    expect(screen.queryByRole('button', { name: /Open|Ask about/ })).not.toBeInTheDocument();
  });

  it('marks read and dismisses without leaving, and dismissed items can be restored', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item()]) });
    mocks.setAskNotificationRead.mockResolvedValue({ success: true, data: { id: 'n1', isRead: true } });
    mocks.setAskNotificationDismissed.mockResolvedValue({ success: true, data: { id: 'n1', dismissed: true } });
    render(<AskNotificationsDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(mocks.setAskNotificationRead).toHaveBeenCalledWith('n1', true));
    expect(await screen.findByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(mocks.setAskNotificationDismissed).toHaveBeenCalledWith('n1', true));
    await waitFor(() => expect(screen.queryByText('Claim submitted')).not.toBeInTheDocument());
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([item({ dismissed: true })], { view: 'DISMISSED' }) });
    fireEvent.click(screen.getByRole('tab', { name: /Dismissed/ }));
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(mocks.getAskNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'DISMISSED' }), expect.anything());
  });

  it('filters by unread, kind and home, and pages to the end', async () => {
    mocks.getAskNotifications.mockResolvedValueOnce({ success: true, data: page([item()], { nextCursor: 'c1', truncated: true, total: 2 }) });
    mocks.getAskNotifications.mockResolvedValueOnce({ success: true, data: page([item(), item({ id: 'n2', title: 'Checklist ready' })], { total: 2 }) });
    render(<AskNotificationsDestination />);
    await screen.findByText('Claim submitted');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Checklist ready')).toBeInTheDocument();
    expect(mocks.getAskNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }), expect.anything());
    expect(screen.getAllByText('Claim submitted')).toHaveLength(1);
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([]) });
    fireEvent.click(screen.getByLabelText('Unread only'));
    await waitFor(() => expect(mocks.getAskNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ unreadOnly: true }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'WORKFLOW' } });
    await waitFor(() => expect(mocks.getAskNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'WORKFLOW' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Home'), { target: { value: 'home-2' } });
    await waitFor(() => expect(mocks.getAskNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ propertyId: 'home-2' }), expect.anything()));
    expect(await screen.findByText('No notifications match this filter.')).toBeInTheDocument();
  });

  it('says it is all caught up only on a real empty inbox, and a calm message when the service is paused', async () => {
    mocks.getAskNotifications.mockResolvedValue({ success: true, data: page([]) });
    const { unmount } = render(<AskNotificationsDestination />);
    expect(await screen.findByText('You are all caught up.')).toBeInTheDocument();
    unmount();
    mocks.getAskNotifications.mockRejectedValue(Object.assign(new Error('paused'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    render(<AskNotificationsDestination />);
    expect(await screen.findByText(/temporarily unavailable. Nothing was lost./)).toBeInTheDocument();
    expect(screen.queryByText('You are all caught up.')).not.toBeInTheDocument();
  });
});

describe('Notification settings', () => {
  beforeEach(() => { mockSearch = 'tab=settings'; push.mockReset(); for (const mock of Object.values(mocks)) mock.mockReset(); });

  it('discloses the channels, never offers to mute safety, and requires consent before financial email', async () => {
    mocks.getAskNotificationSettings.mockResolvedValue({ success: true, data: settings() });
    render(<AskNotificationsDestination />);
    expect(await screen.findByText('How you are notified')).toBeInTheDocument();
    expect(screen.getByText(/always kept in your inbox/)).toBeInTheDocument();
    expect(screen.getByText(/Push notifications are not available yet/)).toBeInTheDocument();
    const safety = document.querySelector('[data-notification-category="SAFETY"]') as HTMLElement;
    expect(within(safety).getByText('Always sent')).toBeInTheDocument();
    expect(within(safety).queryByRole('combobox')).not.toBeInTheDocument();
    const refinance = document.querySelector('[data-notification-category="REFINANCE"]') as HTMLElement;
    expect(within(refinance).getByText(/refinance rates cross a threshold/)).toBeInTheDocument();
    expect(within(within(refinance).getByRole('combobox')).getByRole('option', { name: 'On' })).toBeDisabled();
    mocks.setAskNotificationConsent.mockResolvedValue({ success: true, data: { category: 'REFINANCE', granted: true, version: 'v1' } });
    fireEvent.click(within(refinance).getByRole('button', { name: 'I agree to email for this' }));
    await waitFor(() => expect(mocks.setAskNotificationConsent).toHaveBeenCalledWith('REFINANCE', true));
  });

  it('mutes, snoozes and saves quiet hours through the server, and shows the server\'s refusal', async () => {
    mocks.getAskNotificationSettings.mockResolvedValue({ success: true, data: settings() });
    mocks.updateAskNotificationCategory.mockResolvedValue({ success: true, data: { ...settings().categories[1], email: { mode: 'MUTED', snoozedUntil: null, cadence: 'MUTED', defaultCadence: 'WEEKLY_BRIEF' } } });
    render(<AskNotificationsDestination />);
    const maintenance = (await screen.findByText('Maintenance')).closest('li') as HTMLElement;
    fireEvent.change(within(maintenance).getByRole('combobox'), { target: { value: 'MUTED' } });
    await waitFor(() => expect(mocks.updateAskNotificationCategory).toHaveBeenCalledWith('MAINTENANCE', { mode: 'MUTED' }));
    fireEvent.change(within(maintenance).getByRole('combobox'), { target: { value: '7' } });
    await waitFor(() => expect(mocks.updateAskNotificationCategory).toHaveBeenLastCalledWith('MAINTENANCE', expect.objectContaining({ mode: 'SNOOZED', snoozedUntil: expect.any(String) })));
    const call = mocks.updateAskNotificationCategory.mock.calls.at(-1)?.[1];
    const days = (new Date(call.snoozedUntil).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    mocks.updateAskNotificationQuietHours.mockResolvedValue({ success: true, data: { start: '22:00', end: '07:00', timezone: 'UTC' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '07:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }));
    await waitFor(() => expect(mocks.updateAskNotificationQuietHours).toHaveBeenCalledWith(expect.objectContaining({ start: '22:00', end: '07:00' })));
    mocks.updateAskNotificationCategory.mockRejectedValue(Object.assign(new Error('Safety and active-damage notices cannot be muted or snoozed.'), { code: 'ASK_NOTIFICATION_NOT_ALLOWED' }));
    fireEvent.change(within(maintenance).getByRole('combobox'), { target: { value: 'MUTED' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be muted or snoozed');
  });

  it('points to the settings that live in each tool and opens them in Ask', async () => {
    mocks.getAskNotificationSettings.mockResolvedValue({ success: true, data: settings() });
    render(<AskNotificationsDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Ask' }));
    expect(push).toHaveBeenCalled();
    expect(new URL(push.mock.calls[0][0], 'https://x.test').searchParams.get('question')).toBe('Show my refinance rate monitors.');
  });
});

describe('notificationDestinationHref', () => {
  it('builds each destination, and only a stored link leaves Ask', () => {
    expect(new URL(notificationDestinationHref({ kind: 'SAVED', artifactKey: 'seasonal:s1' }, 'h'), 'https://x.test').searchParams.get('question')).toBe('Show my saved results');
    expect(new URL(notificationDestinationHref({ kind: 'WORK', workKey: 'claim:c1' }, 'h'), 'https://x.test').searchParams.get('question')).toBe('What needs me?');
    expect(notificationDestinationHref({ kind: 'CONVERSATION', sessionId: 's', executionId: 'e' }, 'h')).toBe('/dashboard/ask?propertyId=h&sessionId=s&executionId=e&from=notification');
    expect(new URL(notificationDestinationHref({ kind: 'QUESTION', question: 'Show my warranties.' }, 'h'), 'https://x.test').searchParams.get('question')).toBe('Show my warranties.');
    expect(notificationDestinationHref({ kind: 'LEGACY_LINK', path: '/dashboard/profile' }, 'h')).toBe('/dashboard/profile');
  });
});
