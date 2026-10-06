import { render } from '@testing-library/react';
import { SeasonalNextSteps } from '../SeasonalAnswerCards';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';

// R1 (conversational presentation Phase 2): the next-steps card keeps each action's declared style; the producer owns which step is recommended.
type SummaryBlock = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;
const action = (id: string, label: string, style: AskAction['style']): AskAction => ({
  id, label, style, interactionType: 'START_WORKFLOW', message: label, operationId: 'HOME_BASICS_GUIDE',
} as AskAction);
const card = (actions: AskAction[]) => render(
  <SeasonalNextSteps block={{ type: 'SUMMARY', id: 'home-basics-next', title: 'What would you like to do next?', body: 'Pick one.', tone: 'DEFAULT', actions } as unknown as SummaryBlock} />,
).container;
const filled = (container: HTMLElement) => Array.from(container.querySelectorAll('button')).filter((button) => button.className.includes('bg-teal-700')).map((button) => button.textContent);

describe('seasonal next-steps card', () => {
  it('fills only the action declared PRIMARY (the habits, checklist and setup-enabled plan shape: PRIMARY first, the rest SECONDARY)', () => {
    expect(filled(card([action('a', 'Add these to my tasks', 'PRIMARY'), action('b', 'Walk me through the first task', 'SECONDARY'), action('c', 'Update home details', 'SECONDARY')]))).toEqual(['Add these to my tasks']);
  });

  it('shows no filled button when the producer declares no primary action (home basics, and the plan with no setup context)', () => {
    expect(filled(card([action('a', 'A simple monthly routine', 'SECONDARY'), action('b', 'Home care for this season', 'SECONDARY')]))).toEqual([]);
  });

  it('does not promote the first action: a PRIMARY declared second is the one filled', () => {
    expect(filled(card([action('a', 'First', 'SECONDARY'), action('b', 'Second', 'PRIMARY')]))).toEqual(['Second']);
  });

  it('passes QUIET through unchanged: it is not promoted to the filled style', () => {
    expect(filled(card([action('a', 'Quiet one', 'QUIET'), action('b', 'Other', 'SECONDARY')]))).toEqual([]);
  });
});
