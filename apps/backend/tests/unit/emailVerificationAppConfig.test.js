const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function setEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function createHarness(users = []) {
  const state = {
    users: users.map((user) => ({ ...user })),
    notifications: [],
    refreshSessions: [],
    auditEvents: [],
  };

  const findUser = (where) => {
    if (where?.id) return state.users.find((user) => user.id === where.id) ?? null;
    if (where?.email) return state.users.find((user) => user.email === where.email) ?? null;
    return null;
  };

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        const user = findUser(where);
        return user ? { ...user } : null;
      },
      create: async ({ data }) => {
        const user = {
          id: `user-${state.users.length + 1}`,
          createdAt: new Date('2026-07-18T00:00:00.000Z'),
          mfaEnabled: false,
          tokenVersion: 0,
          ...data,
        };
        state.users.push(user);
        return { ...user };
      },
      update: async ({ where, data }) => {
        const index = state.users.findIndex((user) => user.id === where.id);
        if (index < 0) throw new Error('User not found');
        state.users[index] = { ...state.users[index], ...data };
        return { ...state.users[index] };
      },
      delete: async ({ where }) => {
        state.users = state.users.filter((user) => user.id !== where.id);
      },
    },
    homeownerProfile: { create: async () => ({ id: 'homeowner-profile-1' }) },
    providerProfile: { create: async () => ({ id: 'provider-profile-1' }) },
    notification: {
      create: async ({ data }) => {
        state.notifications.push(data);
        return data;
      },
    },
    refreshTokenSession: {
      create: async ({ data }) => {
        state.refreshSessions.push(data);
        return data;
      },
    },
  };

  const installModule = (relativePath, exports) => {
    const resolved = require.resolve(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  };

  installModule('../../src/lib/prisma.ts', { prisma });
  installModule('../../src/utils/password.util.ts', {
    hashPassword: async () => 'hashed-password',
    comparePassword: async (password) => password === 'Password123!',
  });
  installModule('../../src/utils/jwt.util.ts', {
    generateEmailVerificationToken: () => 'verification-token',
    generatePasswordResetToken: () => 'reset-token',
    generateMfaChallengeToken: () => 'mfa-token',
    verifyRefreshToken: () => ({}),
    verifyEmailVerificationToken: () => ({}),
    verifyPasswordResetToken: () => ({}),
  });
  installModule('../../src/utils/refresh-session.util.ts', {
    issueRefreshSessionTokenPair: () => ({
      sessionId: 'session-1',
      tokenHash: 'token-hash',
      expiresAt: new Date('2026-08-18T00:00:00.000Z'),
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    }),
    hashRefreshToken: () => 'token-hash',
  });
  installModule('../../src/lib/logger.ts', {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    auditLog: (action, userId, metadata) => state.auditEvents.push({ action, userId, metadata }),
  });
  installModule('../../src/lib/metrics.ts', {
    securityTokenReuseTotal: { inc: () => {} },
  });

  const servicePath = require.resolve('../../src/services/auth.service.ts');
  delete require.cache[servicePath];
  const { AuthService } = require('../../src/services/auth.service.ts');
  return { state, authService: new AuthService() };
}

const registration = {
  email: 'pilot@example.com',
  password: 'Password123!',
  firstName: 'Pilot',
  lastName: 'User',
  role: 'HOMEOWNER',
  acceptedTerms: true,
};

test('app config disables verification only for the exact string true', () => {
  const original = process.env.DISABLE_EMAIL_VERIFICATION;
  const { isEmailVerificationDisabled } = require('../../src/config/appConfig.ts');
  try {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      setEnv('DISABLE_EMAIL_VERIFICATION', value);
      assert.equal(isEmailVerificationDisabled(), false);
    }
    setEnv('DISABLE_EMAIL_VERIFICATION', 'true');
    assert.equal(isEmailVerificationDisabled(), true);
  } finally {
    setEnv('DISABLE_EMAIL_VERIFICATION', original);
  }
});

test('disabled verification creates an active verified pilot account without email delivery', async () => {
  const originalFlag = process.env.DISABLE_EMAIL_VERIFICATION;
  const originalNodeEnv = process.env.NODE_ENV;
  setEnv('DISABLE_EMAIL_VERIFICATION', 'true');
  setEnv('NODE_ENV', 'production');
  try {
    const { state, authService } = createHarness();
    const result = await authService.register(registration);
    assert.equal(result.user.emailVerified, true);
    assert.equal(result.user.status, 'ACTIVE');
    assert.equal(result.emailVerificationToken, undefined);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.auditEvents[0]?.action, 'AUTH_EMAIL_VERIFICATION_BYPASSED');
  } finally {
    setEnv('DISABLE_EMAIL_VERIFICATION', originalFlag);
    setEnv('NODE_ENV', originalNodeEnv);
  }
});

test('secure default creates a pending account and enqueues verification delivery', async () => {
  const originalFlag = process.env.DISABLE_EMAIL_VERIFICATION;
  const originalNodeEnv = process.env.NODE_ENV;
  setEnv('DISABLE_EMAIL_VERIFICATION', undefined);
  setEnv('NODE_ENV', 'production');
  try {
    const { state, authService } = createHarness();
    const result = await authService.register(registration);
    assert.equal(result.user.emailVerified, false);
    assert.equal(result.user.status, 'PENDING_VERIFICATION');
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].type, 'EMAIL_VERIFICATION_REQUIRED');
  } finally {
    setEnv('DISABLE_EMAIL_VERIFICATION', originalFlag);
    setEnv('NODE_ENV', originalNodeEnv);
  }
});

test('successful login promotes an existing pending pilot account when verification is disabled', async () => {
  const originalFlag = process.env.DISABLE_EMAIL_VERIFICATION;
  setEnv('DISABLE_EMAIL_VERIFICATION', 'true');
  try {
    const { state, authService } = createHarness([{
      id: 'pending-user',
      email: registration.email,
      firstName: registration.firstName,
      lastName: registration.lastName,
      role: 'HOMEOWNER',
      status: 'PENDING_VERIFICATION',
      emailVerified: false,
      passwordHash: 'hashed-password',
      tokenVersion: 0,
      mfaEnabled: false,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
    }]);
    const result = await authService.login({ email: registration.email, password: registration.password });
    assert.equal(result.user.emailVerified, true);
    assert.equal(result.user.status, 'ACTIVE');
    assert.equal(state.users[0].emailVerified, true);
    assert.equal(state.refreshSessions.length, 1);
  } finally {
    setEnv('DISABLE_EMAIL_VERIFICATION', originalFlag);
  }
});
