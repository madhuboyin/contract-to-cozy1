const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    privacyRequests: [],
    users: [{ id: 'user-1', email: 'sarah@example.com' }],
    auditLogs: [],
    ...overrides,
  };

  function matches(r, where) {
    if (!where) return true;
    if (where.type && r.type !== where.type) return false;
    if (where.status) {
      if (typeof where.status === 'string' && r.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(r.status)) return false;
    }
    return true;
  }

  const prisma = {
    privacyRequest: {
      create: async ({ data }) => {
        const record = {
          id: `pr-${state.privacyRequests.length + 1}`,
          status: 'RECEIVED',
          legalHold: false,
          identityVerifiedAt: null,
          identityVerifiedBy: null,
          resolutionSummary: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.privacyRequests.push(record);
        return { ...record };
      },
      findMany: async ({ where, skip = 0, take }) => {
        return state.privacyRequests.filter((r) => matches(r, where)).slice(skip, take ? skip + take : undefined);
      },
      findUnique: async ({ where, select }) => {
        const r = state.privacyRequests.find((x) => x.id === where.id);
        if (!r) return null;
        if (!select) return { ...r };
        const out = {};
        for (const key of Object.keys(select)) out[key] = r[key];
        return out;
      },
      count: async ({ where }) => state.privacyRequests.filter((r) => matches(r, where)).length,
      update: async ({ where, data }) => {
        const index = state.privacyRequests.findIndex((r) => r.id === where.id);
        if (index < 0) throw new Error('not found');
        state.privacyRequests[index] = { ...state.privacyRequests[index], ...data, updatedAt: new Date() };
        return { ...state.privacyRequests[index] };
      },
    },
    user: {
      findUnique: async ({ where }) => {
        const u = state.users.find((x) => x.email === where.email);
        return u ? { id: u.id } : null;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        const record = { id: `audit-${state.auditLogs.length + 1}`, createdAt: new Date(), ...data };
        state.auditLogs.push(record);
        return record;
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {}, redactEmail: (e) => e },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/services/adminPrivacyRequests.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const privacyService = require('../../src/services/adminPrivacyRequests.service.ts');

  return { state, privacyService };
}

test('createPrivacyRequest snapshots the email, matches the subject, and defaults a due date', async () => {
  const { privacyService, state } = createHarness();

  const matched = await privacyService.createPrivacyRequest({
    actorId: 'admin-1',
    userEmail: 'Sarah@Example.com',
    type: 'ACCESS_EXPORT',
  });
  assert.match(matched.requestNumber, /^PRIV-\d{4}-[A-Z0-9]{6}$/);
  assert.equal(matched.userId, 'user-1');
  assert.equal(matched.userEmail, 'sarah@example.com');
  assert.ok(matched.dueAt > new Date(), 'due date defaulted into the future');

  const unmatched = await privacyService.createPrivacyRequest({
    actorId: 'admin-1',
    userEmail: 'gone@example.com',
    type: 'DELETION',
  });
  assert.equal(unmatched.userId, 'UNMATCHED');
  assert.equal(state.auditLogs.at(-1).metadata.relatedRefs.subjectMatched, false);
});

test('lifecycle: verification attribution, completion requires resolution, terminal states are closed', async () => {
  const { privacyService } = createHarness();
  const r = await privacyService.createPrivacyRequest({ actorId: 'admin-1', userEmail: 'sarah@example.com', type: 'CORRECTION' });

  await assert.rejects(
    () => privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'COMPLETED', reason: 'x', resolutionSummary: 'done' }),
    (err) => err.code === 'INVALID_TRANSITION',
    'cannot jump RECEIVED → COMPLETED'
  );

  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'VERIFYING', reason: 'id requested' });
  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-2', status: 'VERIFIED', reason: 'id confirmed' });

  const verified = await privacyService.getPrivacyRequestDetail(r.id);
  assert.equal(verified.identityVerifiedBy, 'admin-2');
  assert.ok(verified.identityVerifiedAt);

  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'IN_PROGRESS', reason: 'working' });

  await assert.rejects(
    () => privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'COMPLETED', reason: 'done' }),
    (err) => err.code === 'RESOLUTION_REQUIRED'
  );

  await privacyService.changePrivacyRequestStatus({
    requestId: r.id,
    actorId: 'admin-1',
    status: 'COMPLETED',
    reason: 'done',
    resolutionSummary: 'Correction applied via profile flow.',
  });

  await assert.rejects(
    () => privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'IN_PROGRESS', reason: 'reopen' }),
    (err) => err.code === 'INVALID_TRANSITION',
    'terminal states cannot be reopened'
  );
});

test('legal hold blocks DELETION completion and cannot change on a closed request', async () => {
  const { privacyService } = createHarness();
  const r = await privacyService.createPrivacyRequest({ actorId: 'admin-1', userEmail: 'sarah@example.com', type: 'DELETION' });

  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'VERIFYING', reason: 'x' });
  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'VERIFIED', reason: 'x' });
  await privacyService.changePrivacyRequestStatus({ requestId: r.id, actorId: 'admin-1', status: 'IN_PROGRESS', reason: 'x' });

  await privacyService.setLegalHold({ requestId: r.id, actorId: 'admin-1', legalHold: true, reason: 'litigation' });

  await assert.rejects(
    () =>
      privacyService.changePrivacyRequestStatus({
        requestId: r.id,
        actorId: 'admin-1',
        status: 'COMPLETED',
        reason: 'done',
        resolutionSummary: 'Deletion executed.',
      }),
    (err) => err.code === 'LEGAL_HOLD_ACTIVE'
  );

  await privacyService.setLegalHold({ requestId: r.id, actorId: 'admin-1', legalHold: false, reason: 'hold released' });
  await privacyService.changePrivacyRequestStatus({
    requestId: r.id,
    actorId: 'admin-1',
    status: 'COMPLETED',
    reason: 'done',
    resolutionSummary: 'Deletion executed via account-deletion cascade.',
  });

  await assert.rejects(
    () => privacyService.setLegalHold({ requestId: r.id, actorId: 'admin-1', legalHold: true, reason: 'x' }),
    (err) => err.code === 'REQUEST_TERMINAL'
  );
});

test('listPrivacyRequests defaults to the working set', async () => {
  const { privacyService } = createHarness();
  await privacyService.createPrivacyRequest({ actorId: 'admin-1', userEmail: 'sarah@example.com', type: 'ACCESS_EXPORT' });
  const second = await privacyService.createPrivacyRequest({ actorId: 'admin-1', userEmail: 'sarah@example.com', type: 'CORRECTION' });
  await privacyService.changePrivacyRequestStatus({ requestId: second.id, actorId: 'admin-1', status: 'CANCELLED', reason: 'dup' });

  const working = await privacyService.listPrivacyRequests();
  assert.equal(working.total, 1);

  const cancelled = await privacyService.listPrivacyRequests({ status: 'CANCELLED' });
  assert.equal(cancelled.total, 1);
});
