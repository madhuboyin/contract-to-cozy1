const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.255: the expiration-reminder answer used to send a coverage conflict to a desktop page. An insurance conflict is a pending extracted fact that
// disagrees with the confirmed one, and confirming or rejecting each pending fact (insurancePolicyRecord.confirmPolicyFact, already reachable in Ask through
// DOCUMENT_PROMOTION_CONFIRM) is what clears it, so the answer now starts the existing pending-document review. A warranty conflict has no Ask resolution.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const conflict = require('../../src/services/coverageConflict.service.ts');
const { homeDeadlineMonitorResult } = require('../../src/services/ask/handlers/miscHandlers.handler.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const prisma = prismaModule.default ?? prismaModule.prisma ?? prismaModule;
const future = new Date(Date.now() + 90 * 86_400_000);
const original = { assert: conflict.assertCoverageConflictFree, policy: prisma.insurancePolicy, warranty: prisma.warranty };
test.afterEach(() => {
  conflict.assertCoverageConflictFree = original.assert;
  prisma.insurancePolicy = original.policy; prisma.warranty = original.warranty;
});
const conflicted = async () => { throw Object.assign(new Error('conflict'), { code: 'COVERAGE_CONFLICT_REVIEW_REQUIRED', details: { resolutionPath: '/dashboard/insurance?resolveConflict=1' } }); };

test('an insurance conflict starts the pending policy-value review and links nowhere', async () => {
  conflict.assertCoverageConflictFree = conflicted;
  prisma.insurancePolicy = { findFirst: async () => ({ id: 'p1', expiryDate: future, carrierName: 'Acme' }), findMany: async () => [] };
  const result = await homeDeadlineMonitorResult('u1', 'prop1', 'Remind me before my insurance policy expires');
  assert.equal(result.reasonCode, 'COVERAGE_CONFLICT_REVIEW_REQUIRED');
  const [block] = result.blocks;
  assert.equal(block.actions.length, 1);
  const action = block.actions[0];
  assert.equal(action.href, undefined);
  assert.equal(action.interactionType, 'START_WORKFLOW');
  assert.equal(action.operationId, 'DOCUMENT_PROMOTION_REVIEW');
  assert.match(action.message, /pending document reviews/);
  assert.doesNotMatch(JSON.stringify(result), /\/dashboard/);
});

test('a warranty conflict is explained honestly with no action', async () => {
  conflict.assertCoverageConflictFree = conflicted;
  prisma.warranty = { findFirst: async () => ({ id: 'w1', propertyId: 'prop1', expiryDate: future }) };
  const result = await homeDeadlineMonitorResult('u1', 'prop1', 'Remind me before my warranty expires');
  const [block] = result.blocks;
  assert.deepEqual(block.actions, []);
  assert.match(block.body, /cannot resolve warranty/i);
  assert.doesNotMatch(JSON.stringify(result), /\/dashboard/);
});

test('the review action survives the trust policy for HOME_DEADLINE_MONITOR', async () => {
  conflict.assertCoverageConflictFree = conflicted;
  prisma.insurancePolicy = { findFirst: async () => ({ id: 'p1', expiryDate: future, carrierName: 'Acme' }), findMany: async () => [] };
  const result = await homeDeadlineMonitorResult('u1', 'prop1', 'Remind me before my insurance policy expires');
  const action = result.blocks[0].actions[0];
  for (const role of ['OWNER', 'CONTRIBUTOR', 'VIEWER']) {
    assert.equal(isAskActionApplicable({ action, operationId: 'HOME_DEADLINE_MONITOR', propertyId: 'prop1', householdRole: role, authoritativeSourceAvailable: true }), true, role);
  }
  assert.equal(isAskActionApplicable({ action, operationId: 'HOME_ACTIONS', propertyId: 'prop1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), false);
});
