import { askAnswerWidth, askAnswerWidthClass } from '../answerLayout';
import type { AskPresentationBlock } from '../types';

const summary: AskPresentationBlock = {
  type: 'SUMMARY', id: 'summary', title: 'Answer', body: 'A concise answer.', tone: 'DEFAULT', actions: [],
};

test('keeps ordinary conversational answers at a readable measure', () => {
  expect(askAnswerWidth([summary])).toBe('STANDARD');
  expect(askAnswerWidthClass('STANDARD')).toContain('max-w-[1080px]');
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
