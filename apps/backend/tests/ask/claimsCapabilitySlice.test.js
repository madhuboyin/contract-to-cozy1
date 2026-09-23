const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.42: claims capability-card slice. Same fake-prisma harness as
// homeEventRadarWrites.test.js: the real registered handlers run without a database, and the fake prisma throws on
// any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const { CLAIM_TRANSITION_ACTIONS, claimItemActions } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { ClaimsService } = require('../../src/services/claims/claims.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { updateClaim: ClaimsService.updateClaim, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
let accessRole;
let claims;
let updateCalls;
let updateImpl;

function install() {
  accessRole = 'CONTRIBUTOR';
  claims = [
    { id: 'claim-draft', title: 'Kitchen leak', status: 'DRAFT', type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: new Date('2026-09-01'), closedAt: null, updatedAt: UPDATED_AT },
    { id: 'claim-closed', title: 'Old hail claim', status: 'CLOSED', type: 'STORM_WIND_HAIL', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: new Date('2025-05-01'), closedAt: new Date('2025-07-01'), updatedAt: UPDATED_AT },
  ];
  updateCalls = [];
  updateImpl = async (propertyId, claimId, userId, patch) => ({ ...claims.find((claim) => claim.id === claimId), ...patch });
  const models = {
    askExecution: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    claim: {
      findMany: async () => claims,
      findFirst: async ({ where }) => claims.find((claim) => claim.id === where.id) ?? null,
    },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  ClaimsService.updateClaim = async (...args) => { updateCalls.push(args); return updateImpl(...args); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  ClaimsService.updateClaim = originals.updateClaim;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'CLAIM_TRANSITION', createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (parameters) => confirmCapabilityInvoke('CLAIM_TRANSITION', { userId: 'u1', execution: execution(), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('CLAIM_TRANSITION') });

test('every declared claim action\'s canned message proposes exactly its own status for the launched claim', async () => {
  for (const action of CLAIM_TRANSITION_ACTIONS) {
    claims[0].status = action.status === 'APPROVED' || action.status === 'DENIED' || action.status === 'UNDER_REVIEW' ? 'SUBMITTED' : 'DRAFT';
    const result = await capabilityInvoke('CLAIM_TRANSITION', {
      userId: 'u1', propertyId: 'p1', message: action.message,
      launchContext: { surface: 'ASK_WORKSPACE', entityType: 'CLAIM', entityId: 'claim-draft', operationId: 'CLAIM_TRANSITION', sourceExecutionId: 'exec-list' },
    });
    assert.equal(result.status, 'NEEDS_CONFIRMATION', action.id);
    assert.equal(result.parameters.claimId, 'claim-draft', action.id);
    assert.equal(result.parameters.claimToStatus, action.status, action.id);
  }
  assert.deepEqual(updateCalls, [], 'proposing never writes');
});

test('claim rows carry CLAIM identity and every transition action for contributors; viewers get read-only rows', async () => {
  const list = async () => (await capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Show my claims' })).blocks.find((block) => block.id === 'incident-claim-list');
  const contributor = await list();
  const rows = contributor.sections.flatMap((section) => section.items);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.entityType, 'CLAIM');
    assert.deepEqual(row.actions.map((action) => action.id), CLAIM_TRANSITION_ACTIONS.map((action) => action.id));
    assert.ok(row.actions.every((action) => action.operationId === 'CLAIM_TRANSITION' && action.interactionType === 'MUTATE_RECORD'));
    assert.match(row.href, /\/claims\//, 'the traditional claim page stays reachable');
  }
  accessRole = 'VIEWER';
  const viewer = await list();
  assert.ok(viewer.sections.flatMap((section) => section.items).every((row) => row.actions.length === 0));
  assert.deepEqual(claimItemActions('VIEWER'), []);
});

test('every claim action survives the answer-trust whitelist for the claims read', () => {
  for (const action of claimItemActions('OWNER')) {
    assert.equal(isAskActionApplicable({ action, operationId: 'INCIDENT_CLAIM_STATUS', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

test('a submit blocked by the checklist names the blocking items instead of failing generically', async () => {
  updateImpl = async () => {
    throw Object.assign(new Error('Claim cannot be submitted. Checklist requirements are incomplete.'), {
      statusCode: 409, code: 'CLAIM_SUBMIT_BLOCKED',
      details: { blocking: [{ title: 'Photos of the damage', missingDocs: 2 }, { title: 'Call the adjuster', missingDocs: 0 }] },
    });
  };
  const version = require('node:crypto').createHash('sha256').update(`claim-draft:DRAFT:${UPDATED_AT.toISOString()}`).digest('hex');
  await assert.rejects(confirm({ claimId: 'claim-draft', claimToStatus: 'SUBMITTED', claimContextVersion: version }), (error) => {
    assert.equal(error.code, 'CLAIM_SUBMIT_BLOCKED');
    assert.match(error.message, /Photos of the damage \(missing 2 documents\); Call the adjuster \(not done\)/);
    assert.match(error.message, /Nothing was changed/);
    return true;
  });
  // Any other failure is not rewritten.
  updateImpl = async () => { throw new Error('database down'); };
  await assert.rejects(confirm({ claimId: 'claim-draft', claimToStatus: 'SUBMITTED', claimContextVersion: version }), /database down/);
});

test('the claims capability card now launches inline into the claims-only read', () => {
  const launch = capabilityCardLaunch('claims').inlineLaunch;
  assert.equal(launch.operationId, 'INCIDENT_CLAIM_STATUS');
  assert.equal(launch.message, 'Show my claims');
});
