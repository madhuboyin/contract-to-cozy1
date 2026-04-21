const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function pickSelected(model, select) {
  if (!select) return { ...model };
  const out = {};
  for (const [key, include] of Object.entries(select)) {
    if (!include) continue;
    out[key] = model[key];
  }
  return out;
}

function createHarness(stateOverrides = {}) {
  const state = {
    users: [
      {
        id: 'user-1',
        email: 'reset-user@example.com',
        firstName: 'Reset',
        lastName: 'User',
        role: 'HOMEOWNER',
        status: 'ACTIVE',
        emailVerified: true,
        mfaEnabled: false,
        tokenVersion: 3,
        passwordHash: 'placeholder-hash',
        homeownerProfile: { segment: 'EXISTING_OWNER' },
      },
    ],
    refreshTokenSessions: [],
    notifications: [],
    ...stateOverrides,
  };

  const findUser = (where) => {
    if (where?.id) return state.users.find((u) => u.id === where.id) || null;
    if (where?.email) return state.users.find((u) => u.email === where.email) || null;
    return null;
  };

  const prisma = {
    user: {
      findUnique: async ({ where, include, select }) => {
        const user = findUser(where);
        if (!user) return null;
        let result = { ...user };
        if (include?.homeownerProfile) {
          result.homeownerProfile = user.homeownerProfile || null;
        } else {
          delete result.homeownerProfile;
        }
        if (select) {
          result = pickSelected(user, select);
        }
        return result;
      },
      update: async ({ where, data }) => {
        const index = state.users.findIndex((u) => u.id === where.id);
        if (index < 0) throw new Error('User not found');
        const current = state.users[index];
        const next = { ...current };
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in value) {
            next[key] = (next[key] || 0) + value.increment;
          } else {
            next[key] = value;
          }
        }
        state.users[index] = next;
        return { ...next };
      },
    },
    refreshTokenSession: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.refreshTokenSessions = state.refreshTokenSessions.map((session) => {
          const matchesUser = !where.userId || session.userId === where.userId;
          const matchesRevokedNull = where.revokedAt !== null || session.revokedAt === null;
          if (!matchesUser || !matchesRevokedNull) return session;
          count += 1;
          return { ...session, ...data };
        });
        return { count };
      },
    },
    notification: {
      create: async ({ data }) => {
        const notification = {
          id: `notif-${state.notifications.length + 1}`,
          ...data,
          deliveries: data.deliveries?.create || [],
        };
        state.notifications.push(notification);
        return notification;
      },
    },
    $transaction: async (callback) => callback(prisma),
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma },
  };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      auditLog: () => {},
      redactEmail: (email) => email,
    },
  };

  const servicePath = require.resolve('../../src/services/auth.service.ts');
  delete require.cache[servicePath];
  const { AuthService } = require('../../src/services/auth.service.ts');

  return { state, authService: new AuthService() };
}

test('forgotPassword in production enqueues high-priority email delivery with reset link', async () => {
  const oldEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PASSWORD_RESET_BASE_URL: process.env.PASSWORD_RESET_BASE_URL,
  };

  process.env.NODE_ENV = 'production';
  process.env.PASSWORD_RESET_BASE_URL = 'https://contracttocozy.com';

  try {
    const { authService, state } = createHarness();

    const result = await authService.forgotPassword({ email: 'reset-user@example.com' });
    assert.equal(result.resetToken, undefined);
    assert.match(result.message, /If an account with that email exists/i);
    assert.equal(state.notifications.length, 1);

    const notification = state.notifications[0];
    assert.equal(notification.type, 'PASSWORD_RESET_REQUESTED');
    assert.equal(notification.metadata?.priority, 'HIGH');
    assert.ok(notification.actionUrl.startsWith('https://contracttocozy.com/reset-password?token='));
    assert.deepEqual(notification.deliveries, [
      {
        channel: 'EMAIL',
        status: 'PENDING',
      },
    ]);

    const url = new URL(notification.actionUrl);
    const token = url.searchParams.get('token');
    assert.ok(token, 'Expected reset token in actionUrl');

    const { verifyPasswordResetToken } = require('../../src/utils/jwt.util.ts');
    const payload = verifyPasswordResetToken(token);
    assert.equal(payload.userId, 'user-1');
    assert.equal(payload.email, 'reset-user@example.com');
  } finally {
    process.env.NODE_ENV = oldEnv.NODE_ENV;
    process.env.PASSWORD_RESET_BASE_URL = oldEnv.PASSWORD_RESET_BASE_URL;
  }
});

test('forgotPassword for unknown email still returns generic success without enqueueing', async () => {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const { authService, state } = createHarness();
    const result = await authService.forgotPassword({ email: 'missing-user@example.com' });
    assert.match(result.message, /If an account with that email exists/i);
    assert.equal(state.notifications.length, 0);
  } finally {
    process.env.NODE_ENV = oldEnv;
  }
});

test('resetPassword updates hash, increments tokenVersion, and revokes active refresh sessions', async () => {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const { hashPassword, comparePassword } = require('../../src/utils/password.util.ts');
    const oldHash = await hashPassword('OldPass!123');

    const { authService, state } = createHarness({
      users: [
        {
          id: 'user-1',
          email: 'reset-user@example.com',
          firstName: 'Reset',
          lastName: 'User',
          role: 'HOMEOWNER',
          status: 'ACTIVE',
          emailVerified: true,
          mfaEnabled: false,
          tokenVersion: 5,
          passwordHash: oldHash,
          homeownerProfile: { segment: 'EXISTING_OWNER' },
        },
      ],
      refreshTokenSessions: [
        { id: 's-1', userId: 'user-1', revokedAt: null },
        { id: 's-2', userId: 'user-1', revokedAt: null },
      ],
    });

    const forgot = await authService.forgotPassword({ email: 'reset-user@example.com' });
    assert.ok(forgot.resetToken, 'Expected reset token in development');

    await authService.resetPassword({
      token: forgot.resetToken,
      newPassword: 'NewPass!456',
    });

    const updatedUser = state.users[0];
    assert.equal(updatedUser.tokenVersion, 6);
    assert.equal(await comparePassword('NewPass!456', updatedUser.passwordHash), true);
    assert.equal(await comparePassword('OldPass!123', updatedUser.passwordHash), false);
    assert.equal(state.refreshTokenSessions.every((session) => session.revokedAt instanceof Date), true);
  } finally {
    process.env.NODE_ENV = oldEnv;
  }
});
