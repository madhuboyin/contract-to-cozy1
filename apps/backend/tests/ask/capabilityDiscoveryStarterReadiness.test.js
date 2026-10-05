const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Inventory section 4c / owner decision D-O15: CAPABILITY_DISCOVERY EXECUTED as a candidate starter. The real router, the real capability
// registry/catalog/matcher and the real availability adapter run; only the two DB-backed readiness lookups are stubbed to "no data" (the shape
// an empty home gives). This establishes what the handler returns for candidate starter messages, not how a production rollout is configured.

const related = require('../../src/services/capabilityRelated.service.ts');
related.getCapabilityDiscoveryReadiness = async () => ({ contextVersion: 'ctx-1', availableCapabilityIds: [], readinessByCapabilityId: {}, reasonsByCapabilityId: {} });
related.getRelatedCapabilities = async () => ({ suggestions: [] });
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { capabilityResult } = require('../../src/services/ask/support/capabilityDiscovery.ts');

const GENERIC = ['What tools do you have to help me?', 'What can help me with my home?', 'Is there a tool that can help me?'];
const NOT_ROUTED = ['What can Cozy do?', 'Show me the tools available'];

test('EXECUTED: generic discovery messages route to CAPABILITY_DISCOVERY but answer "Tell me what outcome you want", a no-match prompt with one navigation action, not a capability list', async () => {
  for (const message of GENERIC) {
    assert.equal(resolveAskOperation(message).operationId, 'CAPABILITY_DISCOVERY', message);
    const result = await capabilityResult('u1', 'p1', message);
    assert.equal(result.status, 'ANSWERED');
    assert.deepEqual(result.blocks.map((b) => [b.type, b.id]), [['SUMMARY', 'no-capability-match']], message);
    assert.equal(result.blocks.some((b) => b.type === 'CAPABILITY_LIST'), false);
    assert.deepEqual(result.blocks[0].actions.map((a) => a.id), ['explore-tools']);
    assert.match(result.blocks[0].actions[0].href, /\/dashboard\/properties\/p1\/tools$/);
  }
});

test('EXECUTED: the obvious "what can Cozy do" phrasings do NOT route to CAPABILITY_DISCOVERY at all (they fall to GROUNDED_GUIDANCE, which Ask treats as last resort)', () => {
  for (const message of NOT_ROUTED) assert.equal(resolveAskOperation(message).operationId, 'GROUNDED_GUIDANCE', message);
});

test('EXECUTED: a goal-bearing message returns either a capability answer or an UNAVAILABLE explanation depending on release-gate and rollout configuration, so content is not data-independent', async () => {
  const goals = ['Help me organize my home records', 'Is there a tool to track permits or projects?', 'Are there any savings or rebates I should look at?'];
  for (const message of goals) {
    const result = await capabilityResult('u1', 'p1', message);
    assert.ok(['ANSWERED', 'UNAVAILABLE'].includes(result.status), `${message}: ${result.status}`);
    if (result.status === 'UNAVAILABLE') assert.equal(typeof result.reasonCode, 'string');
  }
});

test('property-less execution returns the same shape with the home-tools link (the starter is global; identity is per property)', async () => {
  const result = await capabilityResult('u1', null, GENERIC[0]);
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks[0].actions[0].href, '/dashboard/home-tools');
});
