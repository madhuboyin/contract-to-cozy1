const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    user: {
      id: 'user-1',
      email: 'mfa-user@example.com',
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      tokenVersion: 7,
      mfaEnabled: false,
      mfaSecret: 'encrypted-secret',
    },
    recoveryCodes: [],
    refreshSessions: [],
  };

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (!state.user || where.id !== state.user.id) return null;
        return { ...state.user };
      },
      update: async ({ where, data }) => {
        if (!state.user || where.id !== state.user.id) {
          throw new Error('User not found');
        }
        state.user = { ...state.user, ...data };
        return { ...state.user };
      },
    },
    mfaRecoveryCode: {
      deleteMany: async ({ where }) => {
        const before = state.recoveryCodes.length;
        state.recoveryCodes = state.recoveryCodes.filter((entry) => entry.userId !== where.userId);
        return { count: before - state.recoveryCodes.length };
      },
      createMany: async ({ data }) => {
        for (const row of data) {
          state.recoveryCodes.push({
            id: `rc-${state.recoveryCodes.length + 1}`,
            userId: row.userId,
            codeHash: row.codeHash,
            usedAt: null,
          });
        }
        return { count: data.length };
      },
      count: async ({ where }) =>
        state.recoveryCodes.filter(
          (entry) =>
            entry.userId === where.userId &&
            (where.usedAt === undefined || entry.usedAt === where.usedAt),
        ).length,
      updateMany: async ({ where, data }) => {
        let count = 0;
        state.recoveryCodes = state.recoveryCodes.map((entry) => {
          const matches =
            entry.userId === where.userId &&
            entry.codeHash === where.codeHash &&
            (where.usedAt === undefined || entry.usedAt === where.usedAt);
          if (!matches) return entry;
          count += 1;
          return { ...entry, ...data };
        });
        return { count };
      },
    },
    refreshTokenSession: {
      create: async ({ data }) => {
        state.refreshSessions.push(data);
        return data;
      },
    },
    $transaction: async (callback) => callback(prisma),
  };

  const redis = {
    get: async () => '0',
    ttl: async () => 0,
    incr: async () => 1,
    expire: async () => 1,
    del: async () => 1,
  };

  const mfaUtil = {
    generateTotpSecret: () => ({
      base32Secret: 'BASE32SECRET',
      encryptedSecret: 'encrypted-secret',
      otpauthUri: 'otpauth://totp/mock',
    }),
    verifyTotpCode: () => true,
    generateRecoveryCodes: () => ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'],
    hashRecoveryCode: (code) => `hash:${String(code).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`,
    ...overrides.mfaUtil,
  };

  const jwtUtil = {
    generateMfaChallengeToken: () => 'challenge-token',
    verifyMfaChallengeToken: () => ({
      userId: 'user-1',
      email: 'mfa-user@example.com',
      role: 'HOMEOWNER',
    }),
    ...overrides.jwtUtil,
  };

  const refreshUtil = {
    issueRefreshSessionTokenPair: () => ({
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      sessionId: 'session-1',
      tokenHash: 'token-hash-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    }),
    ...overrides.refreshUtil,
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma },
  };

  const redisPath = require.resolve('../../src/lib/redis.ts');
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: { redis },
  };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: {
      auditLog: () => {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    },
  };

  const mfaUtilPath = require.resolve('../../src/utils/mfa.util.ts');
  require.cache[mfaUtilPath] = {
    id: mfaUtilPath,
    filename: mfaUtilPath,
    loaded: true,
    exports: mfaUtil,
  };

  const jwtUtilPath = require.resolve('../../src/utils/jwt.util.ts');
  require.cache[jwtUtilPath] = {
    id: jwtUtilPath,
    filename: jwtUtilPath,
    loaded: true,
    exports: jwtUtil,
  };

  const refreshUtilPath = require.resolve('../../src/utils/refresh-session.util.ts');
  require.cache[refreshUtilPath] = {
    id: refreshUtilPath,
    filename: refreshUtilPath,
    loaded: true,
    exports: refreshUtil,
  };

  const servicePath = require.resolve('../../src/services/mfa.service.ts');
  delete require.cache[servicePath];
  const { MfaService } = require('../../src/services/mfa.service.ts');

  return {
    state,
    service: new MfaService(),
  };
}

test('verifySetup enables MFA and issues recovery codes', async () => {
  const { service, state } = createHarness();

  const result = await service.verifySetup('user-1', '123456');

  assert.equal(state.user.mfaEnabled, true);
  assert.deepEqual(result.recoveryCodes, ['ABCD-1234', 'EFGH-5678', 'IJKL-9012']);
  assert.deepEqual(
    state.recoveryCodes.map((entry) => entry.codeHash).sort(),
    ['hash:ABCD1234', 'hash:EFGH5678', 'hash:IJKL9012'],
  );
});

test('verifyRecoveryChallenge consumes code once and rejects replay', async () => {
  const { service, state } = createHarness();
  state.user.mfaEnabled = true;
  state.user.mfaSecret = 'encrypted-secret';
  state.recoveryCodes = [
    { id: 'rc-1', userId: 'user-1', codeHash: 'hash:ABCD1234', usedAt: null },
  ];

  const first = await service.verifyRecoveryChallenge('challenge-token', 'ABCD-1234');
  assert.equal(first.accessToken, 'access-token');
  assert.equal(first.refreshToken, 'refresh-token');
  assert.equal(state.refreshSessions.length, 1);
  assert.ok(state.recoveryCodes[0].usedAt instanceof Date);

  await assert.rejects(
    () => service.verifyRecoveryChallenge('challenge-token', 'ABCD-1234'),
    (error) => error && error.code === 'INVALID_RECOVERY_CODE',
  );
});

test('regenerateRecoveryCodes replaces old code set after valid TOTP', async () => {
  const { service, state } = createHarness();
  state.user.mfaEnabled = true;
  state.user.mfaSecret = 'encrypted-secret';
  state.recoveryCodes = [
    { id: 'old-1', userId: 'user-1', codeHash: 'hash:OLDCODE01', usedAt: null },
  ];

  const result = await service.regenerateRecoveryCodes('user-1', '123456');

  assert.deepEqual(result.recoveryCodes, ['ABCD-1234', 'EFGH-5678', 'IJKL-9012']);
  assert.deepEqual(
    state.recoveryCodes.map((entry) => entry.codeHash).sort(),
    ['hash:ABCD1234', 'hash:EFGH5678', 'hash:IJKL9012'],
  );
});

test('disable clears MFA secret and stored recovery codes', async () => {
  const { service, state } = createHarness();
  state.user.mfaEnabled = true;
  state.user.mfaSecret = 'encrypted-secret';
  state.recoveryCodes = [
    { id: 'rc-1', userId: 'user-1', codeHash: 'hash:ABCD1234', usedAt: null },
    { id: 'rc-2', userId: 'user-1', codeHash: 'hash:EFGH5678', usedAt: null },
  ];

  await service.disable('user-1', '123456');

  assert.equal(state.user.mfaEnabled, false);
  assert.equal(state.user.mfaSecret, null);
  assert.equal(state.recoveryCodes.length, 0);
});

