import { askAnswerWidth, askAnswerWidthClass } from '../answerLayout';
import type { AskPresentationBlock } from '../types';

const summary: AskPresentationBlock = {
  type: 'SUMMARY', id: 'summary', title: 'Answer', body: 'A concise answer.', tone: 'DEFAULT', actions: [],
};

test('keeps ordinary conversational answers at a readable measure', () => {
  expect(askAnswerWidth([summary])).toBe('STANDARD');
  expect(askAnswerWidthClass('STANDARD')).toContain('max-w-[920px]');
});

test.each<AskPresentationBlock>([
  { type: 'TABLE', id: 'table', title: 'Facts', columns: [], rows: [], actions: [] },
  { type: 'TIMELINE', id: 'timeline', title: 'History', items: [] },
  { type: 'COMPARISON', id: 'comparison', title: 'Options', options: [], actions: [] },
  { type: 'GROUPED_LIST', id: 'shelves', title: 'Items', sections: [], filters: [], actions: [], presentation: { pattern: 'SHELVES' } },
  { type: 'PRIORITY_LIST', id: 'priorities', title: 'Priorities', propertyId: 'home', rankingPolicyVersion: 'v1', generatedAt: '2026-10-01T00:00:00.000Z', sourceFreshnessAt: null, truncated: false, items: [
    { homeActionId: 'one', title: 'One', consumerPriority: 'WATCH', comparativeReasonCodes: [], confidenceLabel: 'MEDIUM', deadlineAt: null, dependencyRefs: [], cta: null, inlineLaunch: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
    { homeActionId: 'two', title: 'Two', consumerPriority: 'WATCH', comparativeReasonCodes: [], confidenceLabel: 'MEDIUM', deadlineAt: null, dependencyRefs: [], cta: null, inlineLaunch: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
  ] },
])('preserves the full workspace width for $type artifacts', (block) => {
  expect(askAnswerWidth([summary, block])).toBe('WIDE');
  expect(askAnswerWidthClass('WIDE')).toContain('max-w-[1140px]');
});

test('decision answers (a chart, or Sell / Hold / Rent) read at the standard measure even with tables or a comparison', () => {
  const table: AskPresentationBlock = { type: 'TABLE', id: 'table', title: 'Facts', columns: [], rows: [], actions: [] };
  const chart: AskPresentationBlock = { type: 'TREND_CHART', id: 'break-even-chart', title: 'Chart', basis: 'Planning.', valueFormat: 'CURRENCY', categories: ['1'], series: [], markers: [], actions: [] };
  const comparison: AskPresentationBlock = { type: 'COMPARISON', id: 'sell-hold-rent-comparison', title: 'Options', options: [], actions: [] };
  expect(askAnswerWidth([summary, table, chart])).toBe('STANDARD');
  expect(askAnswerWidth([summary, comparison])).toBe('STANDARD');
  expect(askAnswerWidth([summary, { ...table, id: 'do-nothing-items' }])).toBe('STANDARD');
});
