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
    users: [],
    refreshTokenSessions: [],
    metricCalls: {
      tokenReuse: [],
    },
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
        if (select) {
          return pickSelected(user, select);
        }
        const result = { ...user };
        if (include?.homeownerProfile) {
          result.homeownerProfile = user.homeownerProfile || null;
        } else {
          delete result.homeownerProfile;
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
      create: async ({ data }) => {
        const row = { ...data, revokedAt: null };
        state.refreshTokenSessions.push(row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.refreshTokenSessions = state.refreshTokenSessions.map((session) => {
          const matchesId = !where.id || session.id === where.id;
          const matchesUser = !where.userId || session.userId === where.userId;
          const matchesHash = !where.tokenHash || session.tokenHash === where.tokenHash;
          const matchesRevokedNull = where.revokedAt !== null || session.revokedAt === null;

          if (!matchesId || !matchesUser || !matchesHash || !matchesRevokedNull) return session;

          if (where.expiresAt?.gt && !(session.expiresAt > where.expiresAt.gt)) return session;

          count += 1;
          return { ...session, ...data };
        });
        return { count };
      },
      findUnique: async ({ where }) => {
        return state.refreshTokenSessions.find((s) => s.id === where.id) || null;
      },
    },
    notification: {
      create: async ({ data }) => ({ id: `notif-${Date.now()}`, ...data }),
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

  const metricsPath = require.resolve('../../src/lib/metrics.ts');
  require.cache[metricsPath] = {
    id: metricsPath,
    filename: metricsPath,
    loaded: true,
    exports: {
      securityTokenReuseTotal: {
        inc: (labels) => {
          state.metricCalls.tokenReuse.push(labels);
        },
      },
    },
  };

  const servicePath = require.resolve('../../src/services/auth.service.ts');
  delete require.cache[servicePath];
  const { AuthService } = require('../../src/services/auth.service.ts');

  return { state, authService: new AuthService() };
}

test('forgot -> reset -> login-after-reset end-to-end flow works and old session is invalidated', async () => {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const { hashPassword } = require('../../src/utils/password.util.ts');
    const oldPassword = 'OldPass!123';
    const newPassword = 'NewPass!456';

    const { authService, state } = createHarness({
      users: [
        {
          id: 'user-1',
          email: 'flow-user@example.com',
          firstName: 'Flow',
          lastName: 'User',
          role: 'HOMEOWNER',
          status: 'ACTIVE',
          emailVerified: true,
          mfaEnabled: false,
          tokenVersion: 0,
          passwordHash: await hashPassword(oldPassword),
          homeownerProfile: { segment: 'EXISTING_OWNER' },
        },
      ],
    });

    const initialLogin = await authService.login({
      email: 'flow-user@example.com',
      password: oldPassword,
    });
    assert.equal('accessToken' in initialLogin, true);

    const staleRefreshToken = initialLogin.refreshToken;

    const forgot = await authService.forgotPassword({ email: 'flow-user@example.com' });
    assert.ok(forgot.resetToken, 'Expected resetToken in development');

    await authService.resetPassword({
      token: forgot.resetToken,
      newPassword,
    });

    await assert.rejects(
      () =>
        authService.login({
          email: 'flow-user@example.com',
          password: oldPassword,
        }),
      (error) => error && error.code === 'INVALID_CREDENTIALS'
    );

    const loginAfterReset = await authService.login({
      email: 'flow-user@example.com',
      password: newPassword,
    });
    assert.equal('accessToken' in loginAfterReset, true);

    await assert.rejects(
      () => authService.refreshToken(staleRefreshToken),
      (error) => error && error.code === 'TOKEN_REVOKED'
    );

    assert.equal(state.users[0].tokenVersion, 1);
    assert.equal(
      state.refreshTokenSessions.some((session) => session.revokedAt instanceof Date),
      true
    );
  } finally {
    process.env.NODE_ENV = oldEnv;
  }
});

test('refresh-token replay increments token reuse security metric', async () => {
  const { hashPassword } = require('../../src/utils/password.util.ts');
  const { authService, state } = createHarness({
    users: [
      {
        id: 'user-1',
        email: 'replay-user@example.com',
        firstName: 'Replay',
        lastName: 'User',
        role: 'HOMEOWNER',
        status: 'ACTIVE',
        emailVerified: true,
        mfaEnabled: false,
        tokenVersion: 0,
        passwordHash: await hashPassword('ReplayPass!123'),
        homeownerProfile: { segment: 'EXISTING_OWNER' },
      },
    ],
  });

  const login = await authService.login({
    email: 'replay-user@example.com',
    password: 'ReplayPass!123',
  });

  const oldRefreshToken = login.refreshToken;
  const refreshed = await authService.refreshToken(oldRefreshToken);
  assert.equal(typeof refreshed.refreshToken, 'string');

  await assert.rejects(
    () => authService.refreshToken(oldRefreshToken),
    (error) => error && error.code === 'TOKEN_REPLAY_DETECTED',
  );

  assert.deepEqual(state.metricCalls.tokenReuse, [{ surface: 'refresh_token' }]);
});
