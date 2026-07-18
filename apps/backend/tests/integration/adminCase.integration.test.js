const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    cases: [],
    caseNotes: [],
    users: [
      { id: 'admin-1', firstName: 'Ada', lastName: 'Min', role: 'ADMIN' },
      { id: 'admin-2', firstName: 'Bea', lastName: 'Ops', role: 'ADMIN' },
      { id: 'user-1', firstName: 'Sarah', lastName: 'Homeowner', role: 'HOMEOWNER' },
    ],
    reviews: [
      { id: 'rev-1', status: 'FLAGGED', authorId: 'user-1', providerId: 'provider-1', title: 'Suspicious review' },
    ],
    auditLogs: [],
    ...overrides,
  };

  function matchesCase(c, where) {
    if (!where) return true;
    if (where.id && c.id !== where.id) return false;
    if (where.type && c.type !== where.type) return false;
    if (where.severity && c.severity !== where.severity) return false;
    if (where.entityType && c.entityType !== where.entityType) return false;
    if (where.entityId && c.entityId !== where.entityId) return false;
    if (where.status) {
      if (typeof where.status === 'string' && c.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(c.status)) return false;
    }
    return true;
  }

  const prisma = {
    adminCase: {
      create: async ({ data }) => {
        const record = {
          id: `case-${state.cases.length + 1}`,
          status: 'OPEN',
          assignedToId: null,
          resolution: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.cases.push(record);
        return { ...record };
      },
      findMany: async ({ where, select, skip = 0, take }) => {
        let results = state.cases.filter((c) => matchesCase(c, where));
        results = results.slice(skip, take ? skip + take : undefined);
        return results.map((c) => {
          if (!select) return { ...c };
          const out = {};
          for (const key of Object.keys(select)) out[key] = c[key];
          return out;
        });
      },
      findUnique: async ({ where, select, include }) => {
        const c = state.cases.find((x) => x.id === where.id);
        if (!c) return null;
        if (include?.notes) {
          return { ...c, notes: state.caseNotes.filter((n) => n.caseId === c.id) };
        }
        if (select) {
          const out = {};
          for (const key of Object.keys(select)) out[key] = c[key];
          return out;
        }
        return { ...c };
      },
      count: async ({ where }) => state.cases.filter((c) => matchesCase(c, where)).length,
      update: async ({ where, data }) => {
        const index = state.cases.findIndex((c) => c.id === where.id);
        if (index < 0) throw new Error('not found');
        state.cases[index] = { ...state.cases[index], ...data, updatedAt: new Date() };
        return { ...state.cases[index] };
      },
    },
    adminCaseNote: {
      create: async ({ data }) => {
        const record = { id: `note-${state.caseNotes.length + 1}`, createdAt: new Date(), ...data };
        state.caseNotes.push(record);
        return { ...record };
      },
    },
    user: {
      findMany: async ({ where }) =>
        state.users
          .filter((u) => where.id.in.includes(u.id))
          .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName })),
      findUnique: async ({ where }) => {
        const u = state.users.find((x) => x.id === where.id);
        return u ? { id: u.id, role: u.role } : null;
      },
    },
    review: {
      findUnique: async ({ where }) => {
        const r = state.reviews.find((x) => x.id === where.id);
        return r ? { ...r } : null;
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
    '../../src/services/adminCase.service.ts',
    '../../src/services/adminReviewModeration.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const caseService = require('../../src/services/adminCase.service.ts');
  const moderationService = require('../../src/services/adminReviewModeration.service.ts');

  return { state, caseService, moderationService };
}

test('createCase assigns a case number, opens as OPEN, and audits with case metadata', async () => {
  const { caseService, state } = createHarness();
  const created = await caseService.createCase({
    actorId: 'admin-1',
    type: 'SAFETY',
    severity: 'CRITICAL',
    title: 'Injury reported on job site',
    description: 'Homeowner reported an injury during a booking.',
    entityType: 'BOOKING',
    entityId: 'b-1',
  });

  assert.match(created.caseNumber, /^CASE-\d{4}-[A-Z0-9]{6}$/);
  assert.equal(created.status, 'OPEN');

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_CREATE_CASE');
  assert.equal(audit.metadata.capability, 'SUPPORT_CASE_MANAGE');
  assert.equal(audit.metadata.relatedRefs.caseType, 'SAFETY');
  assert.equal(audit.metadata.relatedRefs.linkedEntityId, 'b-1');
});

test('listCases defaults to the open working set and resolves actor names', async () => {
  const { caseService } = createHarness();
  await caseService.createCase({ actorId: 'admin-1', type: 'SUPPORT', severity: 'LOW', title: 'A', description: 'a' });
  const opened = await caseService.createCase({ actorId: 'admin-2', type: 'ABUSE', severity: 'HIGH', title: 'B', description: 'b' });
  await caseService.changeCaseStatus({ caseId: opened.id, actorId: 'admin-1', status: 'CLOSED', reason: 'dup' });

  const result = await caseService.listCases();
  assert.equal(result.total, 1, 'closed case excluded from working set');
  assert.equal(result.cases[0].openedByName, 'Ada Min');

  const closed = await caseService.listCases({ status: 'CLOSED' });
  assert.equal(closed.total, 1);
});

test('changeCaseStatus enforces lifecycle: resolution required, invalid transitions rejected, reopen clears dates', async () => {
  const { caseService } = createHarness();
  const c = await caseService.createCase({ actorId: 'admin-1', type: 'ABUSE', severity: 'HIGH', title: 'Abuse report', description: 'x' });

  await assert.rejects(
    () => caseService.changeCaseStatus({ caseId: c.id, actorId: 'admin-1', status: 'RESOLVED', reason: 'done' }),
    (err) => err.code === 'RESOLUTION_REQUIRED'
  );

  await caseService.changeCaseStatus({ caseId: c.id, actorId: 'admin-1', status: 'RESOLVED', reason: 'done', resolution: 'User warned.' });
  let detail = await caseService.getCaseDetail(c.id);
  assert.equal(detail.status, 'RESOLVED');
  assert.ok(detail.resolvedAt);

  await assert.rejects(
    () => caseService.changeCaseStatus({ caseId: c.id, actorId: 'admin-1', status: 'IN_PROGRESS', reason: 'x' }),
    (err) => err.code === 'INVALID_TRANSITION'
  );

  await caseService.changeCaseStatus({ caseId: c.id, actorId: 'admin-1', status: 'OPEN', reason: 'new evidence' });
  detail = await caseService.getCaseDetail(c.id);
  assert.equal(detail.status, 'OPEN');
  assert.equal(detail.resolvedAt, null, 'reopen clears resolvedAt');
  assert.equal(detail.resolution, 'User warned.', 'resolution text kept as history');
});

test('assignCase only accepts ADMIN assignees and audits the change', async () => {
  const { caseService, state } = createHarness();
  const c = await caseService.createCase({ actorId: 'admin-1', type: 'SUPPORT', severity: 'LOW', title: 'T', description: 'd' });

  await assert.rejects(
    () => caseService.assignCase({ caseId: c.id, actorId: 'admin-1', assignedToId: 'user-1', reason: 'x' }),
    (err) => err.code === 'INVALID_ASSIGNEE'
  );

  await caseService.assignCase({ caseId: c.id, actorId: 'admin-1', assignedToId: 'admin-2', reason: 'routing' });
  const detail = await caseService.getCaseDetail(c.id);
  assert.equal(detail.assignedToId, 'admin-2');
  assert.equal(detail.assignedToName, 'Bea Ops');
  assert.equal(state.auditLogs.at(-1).action, 'ADMIN_ASSIGN_CASE');
});

test('addCaseNote appends to the trail and shows author names in detail', async () => {
  const { caseService } = createHarness();
  const c = await caseService.createCase({ actorId: 'admin-1', type: 'SUPPORT', severity: 'LOW', title: 'T', description: 'd' });
  await caseService.addCaseNote({ caseId: c.id, actorId: 'admin-2', body: 'Called the user.' });

  const detail = await caseService.getCaseDetail(c.id);
  assert.equal(detail.notes.length, 1);
  assert.equal(detail.notes[0].authorName, 'Bea Ops');

  await assert.rejects(
    () => caseService.addCaseNote({ caseId: 'nope', actorId: 'admin-1', body: 'x' }),
    (err) => err.code === 'CASE_NOT_FOUND'
  );
});

test('requestReviewInvestigation opens a linked REVIEW_INVESTIGATION case under REVIEW_MODERATE without touching review status', async () => {
  const { moderationService, caseService, state } = createHarness();

  await assert.rejects(
    () => moderationService.requestReviewInvestigation({ reviewId: 'rev-1', actorId: 'user-1', reason: 'x' }),
    (err) => err.code === 'SELF_MODERATION_FORBIDDEN'
  );

  const created = await moderationService.requestReviewInvestigation({
    reviewId: 'rev-1',
    actorId: 'admin-1',
    reason: 'Possible coordinated review abuse.',
  });

  assert.equal(created.type, 'REVIEW_INVESTIGATION');
  assert.equal(created.entityType, 'REVIEW');
  assert.equal(created.entityId, 'rev-1');
  assert.equal(state.reviews[0].status, 'FLAGGED', 'review status unchanged');

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_REQUEST_REVIEW_INVESTIGATION');
  assert.equal(audit.metadata.capability, 'REVIEW_MODERATE');

  const linked = await caseService.listCases({ entityType: 'REVIEW', entityId: 'rev-1' });
  assert.equal(linked.total, 1);
});
