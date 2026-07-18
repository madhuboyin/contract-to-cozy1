const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    grants: [
      { id: 'g-1', userId: 'admin-1', capability: 'USER_VIEW', bundleName: 'CUSTOMER_SUPPORT_OPERATOR', revokedAt: null },
      { id: 'g-2', userId: 'admin-1', capability: 'USER_STATUS_CHANGE', bundleName: null, revokedAt: null },
      { id: 'g-3', userId: 'admin-2', capability: 'REVIEW_MODERATE', bundleName: null, revokedAt: null },
      { id: 'g-old', userId: 'admin-2', capability: 'BREAK_GLASS', bundleName: null, revokedAt: new Date('2026-01-01') },
    ],
    campaigns: [],
    decisions: [],
    users: [
      { id: 'admin-1', firstName: 'Ada', lastName: 'Min', email: 'ada@example.com' },
      { id: 'admin-2', firstName: 'Bea', lastName: 'Ops', email: 'bea@example.com' },
    ],
    auditLogs: [],
    ...overrides,
  };

  const prisma = {
    accessCertificationCampaign: {
      count: async ({ where }) => state.campaigns.filter((c) => c.status === where.status).length,
      create: async ({ data }) => {
        const campaign = {
          id: `camp-${state.campaigns.length + 1}`,
          status: 'OPEN',
          completedAt: null,
          cancelledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          name: data.name,
          openedById: data.openedById,
          dueAt: data.dueAt,
        };
        state.campaigns.push(campaign);
        for (const d of data.decisions.create) {
          state.decisions.push({
            id: `dec-${state.decisions.length + 1}`,
            campaignId: campaign.id,
            state: 'PENDING',
            decidedById: null,
            decidedAt: null,
            reason: null,
            createdAt: new Date(),
            ...d,
          });
        }
        return { ...campaign };
      },
      findMany: async () => state.campaigns.map((c) => ({ ...c })),
      findUnique: async ({ where, include, select }) => {
        const c = state.campaigns.find((x) => x.id === where.id);
        if (!c) return null;
        if (include?.decisions) {
          return { ...c, decisions: state.decisions.filter((d) => d.campaignId === c.id) };
        }
        if (select) {
          const out = {};
          for (const key of Object.keys(select)) out[key] = c[key];
          return out;
        }
        return { ...c };
      },
      update: async ({ where, data }) => {
        const index = state.campaigns.findIndex((c) => c.id === where.id);
        state.campaigns[index] = { ...state.campaigns[index], ...data };
        return { ...state.campaigns[index] };
      },
    },
    accessCertificationDecision: {
      groupBy: async ({ where }) => {
        const grouped = {};
        for (const d of state.decisions.filter((x) => where.campaignId.in.includes(x.campaignId))) {
          const key = `${d.campaignId}:${d.state}`;
          grouped[key] = (grouped[key] || 0) + 1;
        }
        return Object.entries(grouped).map(([key, count]) => {
          const [campaignId, decisionState] = key.split(':');
          return { campaignId, state: decisionState, _count: { _all: count } };
        });
      },
      findUnique: async ({ where, include }) => {
        const d = state.decisions.find((x) => x.id === where.id);
        if (!d) return null;
        if (include?.campaign) {
          const c = state.campaigns.find((x) => x.id === d.campaignId);
          return { ...d, campaign: { id: c.id, status: c.status } };
        }
        return { ...d };
      },
      update: async ({ where, data }) => {
        const index = state.decisions.findIndex((d) => d.id === where.id);
        state.decisions[index] = { ...state.decisions[index], ...data };
        return { ...state.decisions[index] };
      },
      count: async ({ where }) =>
        state.decisions.filter((d) => d.campaignId === where.campaignId && d.state === where.state).length,
    },
    adminCapabilityGrant: {
      findMany: async ({ where }) => {
        return state.grants
          .filter((g) => g.revokedAt === null && where.revokedAt === null)
          .map((g) => ({ id: g.id, userId: g.userId, capability: g.capability, bundleName: g.bundleName }));
      },
      findFirst: async ({ where }) => {
        const g = state.grants.find(
          (x) => x.userId === where.userId && x.capability === where.capability && x.revokedAt === null
        );
        return g ? { ...g } : null;
      },
      update: async ({ where, data }) => {
        const index = state.grants.findIndex((g) => g.id === where.id);
        state.grants[index] = { ...state.grants[index], ...data };
        return { ...state.grants[index] };
      },
    },
    user: {
      findMany: async ({ where }) =>
        state.users
          .filter((u) => where.id.in.includes(u.id))
          .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email })),
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
    '../../src/services/adminCapability.service.ts',
    '../../src/services/adminAccessCertification.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const certService = require('../../src/services/adminAccessCertification.service.ts');

  return { state, certService };
}

test('openCampaign snapshots only active grants and blocks a second open campaign', async () => {
  const { certService, state } = createHarness();

  const campaign = await certService.openCampaign({ actorId: 'admin-1', name: 'Q3 review' });
  assert.equal(state.decisions.length, 3, 'revoked grant g-old is not snapshotted');
  assert.ok(state.decisions.every((d) => d.state === 'PENDING'));
  assert.equal(state.auditLogs.at(-1).action, 'ADMIN_OPEN_ACCESS_CERTIFICATION');
  assert.equal(state.auditLogs.at(-1).metadata.relatedRefs.grantCount, 3);

  await assert.rejects(
    () => certService.openCampaign({ actorId: 'admin-1', name: 'Another' }),
    (err) => err.code === 'CAMPAIGN_ALREADY_OPEN'
  );

  const list = await certService.listCampaigns();
  assert.equal(list[0].id, campaign.id);
  assert.equal(list[0].decisionCounts.PENDING, 3);
});

test('attestDecision blocks self-attestation and records KEEP', async () => {
  const { certService, state } = createHarness();
  await certService.openCampaign({ actorId: 'admin-1', name: 'Q3' });

  const ownDecision = state.decisions.find((d) => d.holderId === 'admin-1');
  await assert.rejects(
    () => certService.attestDecision({ decisionId: ownDecision.id, actorId: 'admin-1', decision: 'KEEP', reason: 'mine' }),
    (err) => err.code === 'SELF_ATTESTATION_FORBIDDEN'
  );

  const kept = await certService.attestDecision({ decisionId: ownDecision.id, actorId: 'admin-2', decision: 'KEEP', reason: 'still needed' });
  assert.equal(kept.state, 'KEEP');
  assert.equal(kept.revokeExecuted, false);

  await assert.rejects(
    () => certService.attestDecision({ decisionId: ownDecision.id, actorId: 'admin-2', decision: 'REVOKE', reason: 'x' }),
    (err) => err.code === 'ALREADY_ATTESTED'
  );
});

test('REVOKE attestation executes the real capability revoke', async () => {
  const { certService, state } = createHarness();
  await certService.openCampaign({ actorId: 'admin-1', name: 'Q3' });

  const target = state.decisions.find((d) => d.holderId === 'admin-2' && d.capability === 'REVIEW_MODERATE');
  const result = await certService.attestDecision({ decisionId: target.id, actorId: 'admin-1', decision: 'REVOKE', reason: 'role changed' });

  assert.equal(result.state, 'REVOKE');
  assert.equal(result.revokeExecuted, true);

  const grant = state.grants.find((g) => g.id === 'g-3');
  assert.ok(grant.revokedAt, 'grant actually revoked');
  assert.equal(grant.revokedBy, 'admin-1');
  assert.match(grant.revokeReason, /^Access certification:/);

  const revokeAudit = state.auditLogs.find((a) => a.action === 'REVOKE_CAPABILITY');
  assert.ok(revokeAudit, 'standard revoke audit written');
  const attestAudit = state.auditLogs.at(-1);
  assert.equal(attestAudit.action, 'ADMIN_ATTEST_ACCESS_CERTIFICATION');
  assert.equal(attestAudit.metadata.relatedRefs.revokeExecuted, true);
});

test('REVOKE on a grant already revoked outside the campaign still succeeds', async () => {
  const { certService, state } = createHarness();
  await certService.openCampaign({ actorId: 'admin-1', name: 'Q3' });

  // Simulate an out-of-band revoke between snapshot and attestation.
  state.grants.find((g) => g.id === 'g-3').revokedAt = new Date();

  const target = state.decisions.find((d) => d.holderId === 'admin-2');
  const result = await certService.attestDecision({ decisionId: target.id, actorId: 'admin-1', decision: 'REVOKE', reason: 'gone' });
  assert.equal(result.state, 'REVOKE');
  assert.equal(result.revokeExecuted, false, 'no second revoke executed');
});

test('completeCampaign requires all decisions attested; cancel closes an open campaign', async () => {
  const { certService, state } = createHarness();
  const campaign = await certService.openCampaign({ actorId: 'admin-1', name: 'Q3' });

  await assert.rejects(
    () => certService.completeCampaign({ campaignId: campaign.id, actorId: 'admin-1', reason: 'done' }),
    (err) => err.code === 'DECISIONS_PENDING'
  );

  for (const d of state.decisions) {
    const actor = d.holderId === 'admin-1' ? 'admin-2' : 'admin-1';
    await certService.attestDecision({ decisionId: d.id, actorId: actor, decision: 'KEEP', reason: 'ok' });
  }

  const completed = await certService.completeCampaign({ campaignId: campaign.id, actorId: 'admin-1', reason: 'all reviewed' });
  assert.equal(completed.status, 'COMPLETED');

  await assert.rejects(
    () => certService.cancelCampaign({ campaignId: campaign.id, actorId: 'admin-1', reason: 'x' }),
    (err) => err.code === 'CAMPAIGN_NOT_OPEN'
  );

  // Attestation on a closed campaign is rejected.
  const anyDecision = state.decisions[0];
  anyDecision.state = 'PENDING';
  await assert.rejects(
    () => certService.attestDecision({ decisionId: anyDecision.id, actorId: 'admin-2', decision: 'KEEP', reason: 'x' }),
    (err) => err.code === 'CAMPAIGN_NOT_OPEN'
  );
});
