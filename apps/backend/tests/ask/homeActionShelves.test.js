const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.82): Home Actions render as read-only shelves. The feed
// orchestration is not independently testable (see the note above homeActionsResult), so this covers the shelf facts,
// the block contract and the answer checker on the block shape the handler builds.

const { homeActionShelfFacts } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const fmt = (value) => value.toISOString().slice(0, 10);

test('only a Now action is coloured; timing is the due date, else the feed rationale, capped at 80 characters', () => {
  assert.deepEqual(homeActionShelfFacts({ priority: 'NOW', timing: { dueAt: '2026-10-03T12:00:00.000Z' } }, fmt), { tone: 'CAUTION', timingLabel: 'Due 2026-10-03' });
  assert.deepEqual(homeActionShelfFacts({ priority: 'SOON', timing: { dueAt: null, rationale: 'Before the first frost' } }, fmt), { tone: 'DEFAULT', timingLabel: 'Before the first frost' });
  assert.deepEqual(homeActionShelfFacts({ priority: 'PLAN', timing: {} }, fmt), { tone: 'DEFAULT', timingLabel: null });
  const long = homeActionShelfFacts({ priority: 'PLAN', timing: { rationale: 'x'.repeat(200) } }, fmt);
  assert.equal(long.timingLabel.length, 80);
  assert.ok(long.timingLabel.endsWith('…'));
});

const listBlock = () => ({
  type: 'GROUPED_LIST', filters: [], id: 'home-actions-list', title: 'Prioritized actions',
  presentation: { pattern: 'SHELVES' },
  description: 'Priority and order come from the canonical Home Action feed. Ask does not independently rerank them.',
  sections: [{ id: 'now', title: 'Now', count: 1, items: [{
    id: 'a1', title: 'HVAC_FILTER_CHANGE', description: 'A clogged filter strains the system.', meta: ['due Oct 3, 2026'],
    status: 'OPEN', href: '/dashboard', tone: 'CAUTION', timingLabel: 'Due Oct 3, 2026',
  }] }],
  actions: [],
});

test('the shelves block satisfies the contract, with no per-item actions', () => {
  const parsed = AskPresentationBlockSchema.parse(listBlock());
  assert.equal(parsed.presentation.pattern, 'SHELVES');
  assert.equal(parsed.sections[0].items[0].actions, undefined);
});

test('the answer checker keeps the Home Actions answer, even with a code-like action title', () => {
  const result = attachAskAuthoritativeSourceEvidence({
    status: 'ANSWERED', suggestions: ['What should I plan?'],
    blocks: [
      { type: 'SUMMARY', id: 'home-actions-summary', title: '1 governed Home Actions are ready to review', body: 'These are the final grounded actions.', tone: 'DEFAULT', actions: [] },
      listBlock(),
    ],
  }, [completedAskAuthoritativeSourceEvidence('HOME_ACTIONS')]);
  const checked = validateAskAnswerTrustPipeline({ question: 'What needs attention now?', operationId: 'HOME_ACTIONS', propertyId: 'p1', semanticEnabled: true, result });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
});
