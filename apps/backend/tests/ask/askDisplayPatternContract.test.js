// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-013–022, FRD v1.72): the shared display-pattern contract.
// Every addition is optional, so existing producers parse exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { AskPresentationBlockSchema, AskExecutionResponseSchema, ASK_RESPONSE_SCHEMA_VERSION } = require('../../src/productFramework/ask/ask.contract.ts');
const { applyAskAudiencePresentation } = require('../../src/services/ask/askAudiencePresentation.ts');

const itemAction = (id, label = id) => ({ id, label, message: `${label} this`, style: 'SECONDARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_ACTIONS' });

const groupedList = (extra = {}, itemExtra = {}) => ({
  type: 'GROUPED_LIST', id: 'tasks', title: 'Tasks', filters: [], actions: [],
  sections: [{ id: 'due', title: 'Due', count: 1, items: [{ id: 'task-1', title: 'Replace filter', meta: [], ...itemExtra }] }],
  ...extra,
});

test('existing blocks parse unchanged: no display-pattern keys are added by default', () => {
  const summary = AskPresentationBlockSchema.parse({ type: 'SUMMARY', id: 's', title: 'Answer', body: 'Two are overdue.' });
  assert.equal('chips' in summary, false);
  const list = AskPresentationBlockSchema.parse(groupedList());
  assert.equal('presentation' in list, false);
  for (const key of ['tone', 'timingLabel', 'amountLabel', 'floorLevel', 'countLabel', 'badgeLabel']) {
    assert.equal(key in list.sections[0].items[0], false, key);
  }
  const timeline = AskPresentationBlockSchema.parse({ type: 'TIMELINE', id: 't', title: 'History', items: [{ id: 'e1', label: 'Roof', date: '2020-08' }] });
  assert.deepEqual(Object.keys(timeline.items[0]).sort(), ['date', 'id', 'label']);
});

test('answer chips: at most four, tone defaults to DEFAULT', () => {
  const summary = AskPresentationBlockSchema.parse({ type: 'SUMMARY', id: 's', title: 'Answer', body: 'b', chips: [{ label: '2 overdue', tone: 'CRITICAL' }, { label: '4 this month' }] });
  assert.deepEqual(summary.chips, [{ label: '2 overdue', tone: 'CRITICAL' }, { label: '4 this month', tone: 'DEFAULT' }]);
  const five = Array.from({ length: 5 }, (_, index) => ({ label: `chip ${index}` }));
  assert.equal(AskPresentationBlockSchema.safeParse({ type: 'SUMMARY', id: 's', title: 'Answer', body: 'b', chips: five }).success, false);
});

test('grouped-list presentation hint: the three declared patterns parse and anything else is refused', () => {
  const shelves = AskPresentationBlockSchema.parse(groupedList({ presentation: { pattern: 'SHELVES' } }, { tone: 'CAUTION', timingLabel: 'Oct 3', amountLabel: '$150' }));
  assert.equal(shelves.presentation.pattern, 'SHELVES');
  assert.equal(shelves.sections[0].items[0].timingLabel, 'Oct 3');
  const deck = AskPresentationBlockSchema.parse(groupedList({ presentation: { pattern: 'DECK', swipeRightActionId: 'accept', swipeLeftActionId: null } }, { actions: [itemAction('accept')] }));
  assert.equal(deck.presentation.swipeRightActionId, 'accept');
  const rooms = AskPresentationBlockSchema.parse(groupedList({ presentation: { pattern: 'ROOM_MAP' } }, { floorLevel: 2, countLabel: '14 items', badgeLabel: '1 open' }));
  assert.equal(rooms.sections[0].items[0].floorLevel, 2);
  assert.equal(AskPresentationBlockSchema.safeParse(groupedList({ presentation: { pattern: 'CAROUSEL' } })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(groupedList({}, { floorLevel: 1.5 })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(groupedList({}, { tone: 'LOUD' })).success, false);
});

test('comparison options may carry up to three declared badges beside the legacy single badge', () => {
  const badge = (label, policyCode) => ({ label, basis: `${label} from the quote.`, policyCode });
  const block = (badges) => ({
    type: 'COMPARISON', id: 'quotes', title: 'Quotes', actions: [],
    options: [
      { id: 'a', label: 'A', attributes: [], actions: [], badges },
      { id: 'b', label: 'B', attributes: [], actions: [], badge: badge('Lowest price', 'LOWEST_TOTAL') },
    ],
  });
  const parsed = AskPresentationBlockSchema.parse(block([badge('Soonest start', 'EARLIEST_START'), badge('Longest warranty', 'LONGEST_PARTS_WARRANTY')]));
  assert.equal(parsed.options[0].badges.length, 2);
  assert.equal(parsed.options[1].badge.policyCode, 'LOWEST_TOTAL');
  const four = ['A', 'B', 'C', 'D'].map((label) => badge(label, `CODE_${label}`));
  assert.equal(AskPresentationBlockSchema.safeParse(block(four)).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(block([badge('Lowest', 'lowercase')])).success, false);
});

test('timeline items accept category, recorded date precision and declared item actions', () => {
  const parsed = AskPresentationBlockSchema.parse({ type: 'TIMELINE', id: 't', title: 'History', items: [
    { id: 'e1', label: 'Roof replaced', date: '2020-08', datePrecision: 'MONTH', category: { id: 'improve', label: 'Improvement' }, entityType: 'HOME_EVENT', actions: [itemAction('correct')] },
  ] });
  assert.equal(parsed.items[0].datePrecision, 'MONTH');
  assert.equal(parsed.items[0].category.label, 'Improvement');
  assert.equal(AskPresentationBlockSchema.safeParse({ type: 'TIMELINE', id: 't', title: 'History', items: [{ id: 'e1', label: 'x', datePrecision: 'WEEK' }] }).success, false);
});

test('LIFESPAN: declared status per item, a valid typical range, and items missing an age listed separately', () => {
  const block = (item) => ({
    type: 'LIFESPAN', id: 'life', title: 'Appliance ages', basis: 'Estimated from install years.',
    items: [{ id: 'wh', label: 'Water heater', ageYears: 10, typicalLifeYears: { min: 8, max: 12 }, status: 'PLAN_AHEAD', statusLabel: 'Plan ahead', ...item }],
  });
  const parsed = AskPresentationBlockSchema.parse(block({}));
  assert.deepEqual(parsed.missingAge, []);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ typicalLifeYears: { min: 12, max: 8 } })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ status: 'OLD' })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ ageYears: -1 })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse({ ...block({}), basis: '' }).success, false);
});

test('PROGRESS: percent bounded 0–100 with a basis, at most three metrics and three next steps', () => {
  const step = (id) => ({ id, title: `Step ${id}`, meta: [], actions: [itemAction('start')] });
  const block = (extra) => ({ type: 'PROGRESS', id: 'ready', title: 'Sale readiness', percent: 68, basis: '17 of 25 items done', ...extra });
  const parsed = AskPresentationBlockSchema.parse(block({ nextSteps: [step('1')] }));
  assert.deepEqual(parsed.metrics, []);
  assert.deepEqual(parsed.actions, []);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ percent: 120 })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ basis: '' })).success, false);
  assert.equal(AskPresentationBlockSchema.safeParse(block({ nextSteps: ['1', '2', '3', '4'].map(step) })).success, false);
});

test('an evidence claim may point at a LIFESPAN item, and only at one that exists', () => {
  const response = (targetItemId) => ({
    schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
    executionId: 'execution-life', sessionId: 'session-life', question: 'How old are my appliances?', status: 'ANSWERED',
    property: null, operation: null, contextVersion: null, captureRequests: [], confirmation: null,
    suggestions: [], createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z',
    blocks: [
      { type: 'LIFESPAN', id: 'life', title: 'Ages', basis: 'From install years.', items: [{ id: 'wh', label: 'Water heater', ageYears: 10, typicalLifeYears: { min: 8, max: 12 }, status: 'PLAN_AHEAD', statusLabel: 'Plan ahead' }] },
      { type: 'EVIDENCE', id: 'ev', title: 'Sources', items: [{ label: 'Install year', source: 'Inventory', observedAt: null, claim: { targetBlockId: 'life', targetItemId, text: 'Installed 2016' } }] },
    ],
  });
  assert.equal(AskExecutionResponseSchema.safeParse(response('wh')).success, true);
  const missing = AskExecutionResponseSchema.safeParse(response('nope'));
  assert.equal(missing.success, false);
  assert.ok(missing.error.issues.some((issue) => issue.message === 'Evidence claim item must exist in the referenced result block.'));
});

test('audience filter removes change actions from a PROGRESS block for a viewer, and keeps them for a contributor', () => {
  const progress = {
    type: 'PROGRESS', id: 'ready', title: 'Sale readiness', percent: 68, basis: '17 of 25 items done', metrics: [], nextSteps: [],
    actions: [{ id: 'mark-ready', label: 'Mark ready', style: 'PRIMARY' }, { id: 'open-seller-prep', label: 'Open seller prep', href: '/dashboard/properties/p/seller-prep', style: 'SECONDARY' }],
  };
  const run = (householdRole) => applyAskAudiencePresentation({ result: { status: 'ANSWERED', reasonCode: 'X', blocks: [progress], suggestions: [] }, householdRole, journeyContext: null, lifecycleFramingEnabled: false });
  assert.deepEqual(run('VIEWER').blocks[0].actions.map((action) => action.id), ['open-seller-prep']);
  assert.deepEqual(run('CONTRIBUTOR').blocks[0].actions.map((action) => action.id), ['mark-ready', 'open-seller-prep']);
});

test('audience framing keeps a summary\'s answer chips', () => {
  const result = applyAskAudiencePresentation({
    result: { status: 'ANSWERED', reasonCode: 'X', blocks: [{ type: 'SUMMARY', id: 's', title: 'Answer', body: 'b', tone: 'DEFAULT', actions: [], chips: [{ label: '2 overdue', tone: 'CRITICAL' }] }], suggestions: ['Mark it complete'] },
    householdRole: 'VIEWER', journeyContext: null, lifecycleFramingEnabled: false,
  });
  assert.deepEqual(result.blocks[0].chips, [{ label: '2 overdue', tone: 'CRITICAL' }]);
});
