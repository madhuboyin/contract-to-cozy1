import { askAnswerWidth, askAnswerWidthClass } from '../answerLayout';
import type { AskPresentationBlock } from '../types';

const summary: AskPresentationBlock = {
  type: 'SUMMARY', id: 'summary', title: 'Answer', body: 'A concise answer.', tone: 'DEFAULT', actions: [],
};

test('keeps ordinary conversational answers at a readable measure', () => {
  expect(askAnswerWidth([summary])).toBe('STANDARD');
  expect(askAnswerWidthClass('STANDARD')).toContain('max-w-[960px]');
});

test.each<AskPresentationBlock>([
  { type: 'TABLE', id: 'table', title: 'Facts', columns: [], rows: [], actions: [] },
  { type: 'TIMELINE', id: 'timeline', title: 'History', items: [] },
  { type: 'COMPARISON', id: 'comparison', title: 'Options', options: [], actions: [] },
  { type: 'GROUPED_LIST', id: 'shelves', title: 'Items', sections: [], filters: [], actions: [], presentation: { pattern: 'SHELVES' } },
  { type: 'GROUPED_LIST', id: 'home-work-items', title: 'Work items', sections: [], filters: [], actions: [], listDensity: 'DENSE' },
  { type: 'GROUPED_LIST', id: 'savings-recurring-setup', title: 'Recurring costs', sections: [], filters: [], actions: [] },
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
  expect(askAnswerWidth([summary, { ...table, id: 'ownership-cost-categories' }])).toBe('STANDARD');
  expect(askAnswerWidth([{ ...summary, id: 'coverage-summary' }, { ...comparison, id: 'coverage-comparison-options' }])).toBe('STANDARD');
});

test('keeps the reserve-fund decision answer at the Home Actions measure despite its timeline', () => {
  const progress: AskPresentationBlock = { type: 'PROGRESS', id: 'reserve-fund-overview', title: 'Funding progress', percent: 0, basis: '$0 funded', metrics: [], nextSteps: [], actions: [] };
  const timeline: AskPresentationBlock = { type: 'TIMELINE', id: 'capital-timeline', title: 'Capital timeline', items: [] };
  expect(askAnswerWidth([summary, progress, timeline])).toBe('STANDARD');
});

test('keeps property completeness and its summary at the Home Actions measure', () => {
  const progress: AskPresentationBlock = { type: 'PROGRESS', id: 'property-completeness-progress', title: 'Property details completeness', percent: 100, basis: '66 of 66 applicable facts known', metrics: [], nextSteps: [], actions: [] };
  const facts: AskPresentationBlock = { type: 'GROUPED_LIST', id: 'property-summary-facts', title: 'Home record summary', sections: [], filters: [], actions: [] };
  expect(askAnswerWidth([summary, progress, facts])).toBe('STANDARD');
});

test('keeps the room map aligned with Home Actions instead of widening for its presentation hint', () => {
  const rooms: AskPresentationBlock = {
    type: 'GROUPED_LIST', id: 'property-rooms', title: 'Rooms', sections: [], filters: [], actions: [],
    presentation: { pattern: 'ROOM_MAP' },
  };
  expect(askAnswerWidth([summary, rooms])).toBe('STANDARD');
  expect(askAnswerWidthClass(askAnswerWidth([summary, rooms]))).toContain('max-w-[960px]');
});
