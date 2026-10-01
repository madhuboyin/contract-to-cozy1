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
])('preserves the full workspace width for $type artifacts', (block) => {
  expect(askAnswerWidth([summary, block])).toBe('WIDE');
  expect(askAnswerWidthClass('WIDE')).toContain('max-w-[1140px]');
});
