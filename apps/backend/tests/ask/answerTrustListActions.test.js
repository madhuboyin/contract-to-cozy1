const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The answer-trust validator and typed actions on list-type blocks. Found while building Negotiation Shield 3a (FRD v1.301): the validator strips an
// un-allowlisted action from a SUMMARY block but leaves one on a GROUPED_LIST's own actions (list-type blocks were never subject to the allowlist for
// their own typed in-Ask actions; only their links are judged). That carve-out is unchanged here. What this pins is that the validator now REPORTS what
// it did: it used to say it had removed such an action and repaired the answer when nothing had changed.

const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { recordAskAnswerTrustMetrics } = require('../../src/services/ask/support/answerGuards.ts');
const { askAnswerTrustUnlistedActionTotal } = require('../../src/lib/metrics.ts');

const OP = 'NEGOTIATION_SHIELD_CASES';
const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.cases', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } };
const typed = (id) => ({ id, label: 'Do it', interactionType: 'START_WORKFLOW', message: 'Do the thing.', operationId: OP, style: 'SECONDARY' });
const linked = (id, href) => ({ id, label: 'Open', href, style: 'SECONDARY' });
const summary = (actions = []) => ({ type: 'SUMMARY', id: 'answer', title: 'Your reviews', body: 'Two reviews.', tone: 'DEFAULT', actions });
const list = (actions = []) => ({
  type: 'GROUPED_LIST', id: 'negotiation-shield-documents', title: 'Documents', filters: [], actions,
  sections: [{ id: 's', title: 'Attached', count: 1, items: [{ id: 'i1', title: 'Estimate', meta: [], status: null, href: null }] }],
});
const validate = (blocks) => validateAskAnswerTrust({ question: 'Show my negotiation shield cases', operationId: OP, propertyId: 'prop-1', result: { status: 'ANSWERED', blocks: [summary(), ...blocks], suggestions: [], parameters: evidence } });
const listActions = (out) => out.result.blocks.find((b) => b.id === 'negotiation-shield-documents').actions.map((a) => a.id);

test('an allowlisted typed action on a list block passes with no codes', () => {
  const out = validate([list([typed('negotiation-shield-attach')])]);
  assert.deepEqual(listActions(out), ['negotiation-shield-attach']);
  assert.equal(out.trust.checks.actionApplicability, 'PASS');
  assert.equal(out.repaired, false);
  assert.deepEqual(out.trust.reasonCodes.filter((c) => /ACTION/.test(c)), []);
});

test('an un-allowlisted typed action on a list block is kept, and the report says kept, not removed', () => {
  const out = validate([list([typed('not-a-listed-action')])]);
  assert.deepEqual(listActions(out), ['not-a-listed-action'], 'list blocks keep their own typed actions (the unchanged carve-out)');
  assert.equal(out.repaired, false, 'nothing about the answer changed');
  assert.notEqual(out.trust.outcome, 'REPAIRABLE');
  assert.ok(out.trust.reasonCodes.includes('UNLISTED_ACTION_RETAINED'));
  assert.equal(out.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'), false, 'it must not claim a removal that did not happen');
  assert.equal(out.trust.checks.actionApplicability, 'FAIL', 'the check still reports that the action is not in the allowlist');
});

test('the same action on a SUMMARY block is still removed, and reported as repaired', () => {
  const out = validateAskAnswerTrust({ question: 'x', operationId: OP, propertyId: 'prop-1',
    result: { status: 'ANSWERED', blocks: [summary([typed('not-a-listed-action'), typed('negotiation-shield-back')])], suggestions: [], parameters: evidence } });
  assert.deepEqual(out.result.blocks[0].actions.map((a) => a.id), ['negotiation-shield-back']);
  assert.equal(out.repaired, true);
  assert.equal(out.trust.outcome, 'REPAIRABLE');
  assert.ok(out.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'));
  assert.equal(out.trust.reasonCodes.includes('UNLISTED_ACTION_RETAINED'), false);
});

test('a list block action that leaves Ask is still removed and reported as removed', () => {
  const out = validate([list([linked('open-page', '/dashboard/properties/prop-1/tools/negotiation-shield')])]);
  assert.deepEqual(listActions(out), []);
  assert.equal(out.repaired, true);
  assert.ok(out.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'));
  assert.equal(out.trust.reasonCodes.includes('UNLISTED_ACTION_RETAINED'), false);
});

test('when one action is removed and an unlisted one is kept, both facts are reported', () => {
  const out = validate([list([linked('open-page', '/dashboard/properties/prop-1/tools/negotiation-shield'), typed('not-a-listed-action')])]);
  assert.deepEqual(listActions(out), ['not-a-listed-action']);
  assert.equal(out.repaired, true);
  assert.ok(out.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'));
  assert.ok(out.trust.reasonCodes.includes('UNLISTED_ACTION_RETAINED'));
});

test('a kept unlisted action is counted per operation so the carve-out can be closed on evidence', async () => {
  const read = async () => (await askAnswerTrustUnlistedActionTotal.get()).values.filter((v) => v.labels.operation === OP).reduce((n, v) => n + v.value, 0);
  const before = await read();
  recordAskAnswerTrustMetrics(OP, validate([list([typed('not-a-listed-action')])]));
  assert.equal(await read(), before + 1);
  recordAskAnswerTrustMetrics(OP, validate([list([typed('negotiation-shield-attach')])]));
  assert.equal(await read(), before + 1, 'an allowlisted action is not counted');
});
