/**
 * C6 (F6): shared Web Push helpers, replacing the mortgage-radar-only
 * subscription code. enablePush() must fetch the server VAPID key, gate on
 * permission, subscribe, and register the subscription server-side.
 */

import { enablePush, disablePush, getPushStatus } from '@/lib/pushNotifications';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const VALID_SUB = {
  endpoint: 'https://push.example.test/xyz',
  toJSON: () => ({
    endpoint: 'https://push.example.test/xyz',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  }),
  unsubscribe: jest.fn().mockResolvedValue(true),
};

let subscribe: jest.Mock;
let getSubscription: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  subscribe = jest.fn().mockResolvedValue(VALID_SUB);
  getSubscription = jest.fn().mockResolvedValue(null);

  const registration = { pushManager: { subscribe, getSubscription } };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      getRegistration: jest.fn().mockResolvedValue(registration),
    },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: Object.assign(jest.fn(), {
      permission: 'default' as NotificationPermission,
      requestPermission: jest.fn().mockResolvedValue('granted' as NotificationPermission),
    }),
  });
});

describe('enablePush', () => {
  it('subscribes and registers the subscription server-side', async () => {
    mockGet.mockResolvedValue({ data: { publicKey: 'BKpublic', configured: true } });
    mockPost.mockResolvedValue({ data: { message: 'ok' } });

    const result = await enablePush();

    expect(result).toEqual({ ok: true });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(mockPost).toHaveBeenCalledWith('/api/push/subscriptions', {
      endpoint: VALID_SUB.endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
  });

  it('stops with not_configured when the server has no VAPID key', async () => {
    mockGet.mockResolvedValue({ data: { publicKey: null, configured: false } });

    const result = await enablePush();

    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('stops with permission_denied when the user blocks notifications', async () => {
    mockGet.mockResolvedValue({ data: { publicKey: 'BKpublic', configured: true } });
    (window.Notification.requestPermission as jest.Mock).mockResolvedValue('denied');

    const result = await enablePush();

    expect(result).toEqual({ ok: false, reason: 'permission_denied' });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('disablePush', () => {
  it('unsubscribes locally and revokes server-side', async () => {
    getSubscription.mockResolvedValue(VALID_SUB);
    mockPost.mockResolvedValue({ data: {} });

    await disablePush();

    expect(VALID_SUB.unsubscribe).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith('/api/push/subscriptions/revoke', {
      endpoint: VALID_SUB.endpoint,
    });
  });
});

describe('getPushStatus', () => {
  it('reports configured + subscribed state', async () => {
    mockGet.mockResolvedValue({ data: { publicKey: 'BKpublic', configured: true } });
    getSubscription.mockResolvedValue(VALID_SUB);

    const status = await getPushStatus();

    expect(status.supported).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.subscribed).toBe(true);
  });
});
