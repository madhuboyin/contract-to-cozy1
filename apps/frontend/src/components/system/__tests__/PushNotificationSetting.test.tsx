/**
 * C6 (F6): the single "push notifications on this device" switch.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushNotificationSetting } from '@/components/system/PushNotificationSetting';
import * as pushLib from '@/lib/pushNotifications';

jest.mock('@/lib/pushNotifications', () => ({
  isPushSupported: jest.fn(() => true),
  getPushStatus: jest.fn(),
  enablePush: jest.fn(),
  disablePush: jest.fn(),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const mockGetStatus = pushLib.getPushStatus as jest.Mock;
const mockEnable = pushLib.enablePush as jest.Mock;
const mockDisable = pushLib.disablePush as jest.Mock;
const mockSupported = pushLib.isPushSupported as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSupported.mockReturnValue(true);
});

it('shows an unavailable message when the server is not configured', async () => {
  mockGetStatus.mockResolvedValue({ supported: true, configured: false, permission: 'default', subscribed: false });
  render(<PushNotificationSetting />);
  expect(await screen.findByText(/not available right now/i)).toBeInTheDocument();
});

it('turns push on from the off state', async () => {
  mockGetStatus
    .mockResolvedValueOnce({ supported: true, configured: true, permission: 'default', subscribed: false })
    .mockResolvedValue({ supported: true, configured: true, permission: 'granted', subscribed: true });
  mockEnable.mockResolvedValue({ ok: true });

  render(<PushNotificationSetting />);
  const toggle = await screen.findByRole('switch');
  expect(toggle).toHaveAttribute('aria-checked', 'false');

  await act(async () => {
    await userEvent.click(toggle);
  });

  expect(mockEnable).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
});

it('turns push off from the on state', async () => {
  mockGetStatus
    .mockResolvedValueOnce({ supported: true, configured: true, permission: 'granted', subscribed: true })
    .mockResolvedValue({ supported: true, configured: true, permission: 'granted', subscribed: false });
  mockDisable.mockResolvedValue(undefined);

  render(<PushNotificationSetting />);
  const toggle = await screen.findByRole('switch');
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

  await act(async () => {
    await userEvent.click(toggle);
  });

  expect(mockDisable).toHaveBeenCalledTimes(1);
});

it('disables the switch when notifications are browser-blocked', async () => {
  mockGetStatus.mockResolvedValue({ supported: true, configured: true, permission: 'denied', subscribed: false });
  render(<PushNotificationSetting />);
  const toggle = await screen.findByRole('switch');
  expect(toggle).toBeDisabled();
});
