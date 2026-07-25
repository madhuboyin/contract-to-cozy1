const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const writes = [];
const audits = [];
let rows = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      capabilityGovernanceReview: {
        findMany: async () => rows,
        upsert: async (args) => {
          writes.push(args);
          return { id: 'review-1', ...args.create };
        },
      },
    },
  },
};

const auditPath = require.resolve('../../src/services/personalizationAudit.service.ts');
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    recordPersonalizationAuditEvent: async (event) => audits.push(event),
  },
};

const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  evaluateCapabilityGovernanceReadiness,
  loadApprovedCapabilityIds,
  recordCapabilityGovernanceReview,
} = require('../../src/services/capabilityGovernanceReview.service.ts');

function review(capability, role, overrides = {}) {
  return {
    capabilityId: capability.id,
    manifestVersion: capability.version,
    policyVersion: capability.governance.policyVersion,
    role,
    decision: 'APPROVED',
    reviewerUserId: `reviewer-${role.toLowerCase()}`,
    notes: null,
    reviewedAt: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
  };
}

test('CAP-902 derives manifest governance roles from safety and commercial policy', () => {
  const low = canonicalCapabilityRegistry.getById('material-specs');
  const regulated = canonicalCapabilityRegistry.capabilities.find((capability) =>
    capability.governance.safetyTier === 'REGULATED_COVERAGE');
  const commercial = canonicalCapabilityRegistry.capabilities.find((capability) =>
    capability.governance.commercialAction);

  assert.deepEqual(
    evaluateCapabilityGovernanceReadiness(low, []).requiredRoles,
    ['PRODUCT'],
  );
  assert.deepEqual(
    evaluateCapabilityGovernanceReadiness(regulated, []).requiredRoles,
    ['PRODUCT', 'DOMAIN', 'TRUST', 'LEGAL_COMPLIANCE'],
  );
  assert.ok(
    evaluateCapabilityGovernanceReadiness(commercial, [])
      .requiredRoles.includes('COMMERCIAL_INTEGRITY'),
  );
});

test('CAP-902 ignores approvals from stale manifest or policy versions', () => {
  const capability = canonicalCapabilityRegistry.getById('material-specs');
  const readiness = evaluateCapabilityGovernanceReadiness(capability, [
    review(capability, 'PRODUCT', {
      manifestVersion: capability.version + 1,
    }),
    review(capability, 'PRODUCT', {
      policyVersion: 'previous-policy',
    }),
  ]);

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.approvedRoles, []);
  assert.deepEqual(readiness.missingRoles, ['PRODUCT']);
});

test('CAP-902 returns only capabilities with every current required approval', async () => {
  const material = canonicalCapabilityRegistry.getById('material-specs');
  rows = [review(material, 'PRODUCT')];

  const approvedIds = await loadApprovedCapabilityIds();
  assert.deepEqual(approvedIds, ['material-specs']);
});

test('CAP-902 records a current role decision and immutable audit event', async () => {
  writes.length = 0;
  audits.length = 0;
  const capability = canonicalCapabilityRegistry.getById('material-specs');

  const result = await recordCapabilityGovernanceReview({
    capabilityId: 'material-specs',
    role: 'PRODUCT',
    decision: 'APPROVED',
    reviewerUserId: 'admin-product',
    notes: 'Product outcome and copy reviewed.',
  });

  assert.equal(result.decision, 'APPROVED');
  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0].where.capabilityId_manifestVersion_policyVersion_role,
    {
      capabilityId: 'material-specs',
      manifestVersion: capability.version,
      policyVersion: capability.governance.policyVersion,
      role: 'PRODUCT',
    },
  );
  assert.equal(audits[0].action, 'CAPABILITY_GOVERNANCE_APPROVED');
  assert.equal(audits[0].entityType, 'TOOL_CAPABILITY');
  assert.equal(audits[0].entityId, 'material-specs');
});

test('CAP-902 rejects a review role not required by the capability policy', async () => {
  await assert.rejects(
    () => recordCapabilityGovernanceReview({
      capabilityId: 'material-specs',
      role: 'LEGAL_COMPLIANCE',
      decision: 'APPROVED',
      reviewerUserId: 'admin-legal',
    }),
    (error) =>
      error.code === 'ROLE_NOT_REQUIRED'
      && error.details.requiredRoles.includes('PRODUCT'),
  );
});
