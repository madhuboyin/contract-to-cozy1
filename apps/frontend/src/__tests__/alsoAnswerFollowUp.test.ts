import { alsoAnswerFollowUp } from '@/features/ask/alsoAnswerFollowUp';

const withAction = (action: Record<string, unknown>, status = 'ANSWERED') => ({ status, blocks: [{ type: 'SUMMARY', id: 's', title: 't', actions: [action] }] }) as never;
const offer = { id: 'also-answer-capital-item-funding-goal', interactionType: 'START_WORKFLOW', message: 'What would a new roof cost?', operationId: 'CAPITAL_ITEM_FUNDING_GOAL' };

describe('alsoAnswerFollowUp', () => {
  it('follows the server offer on an answered turn', () => {
    expect(alsoAnswerFollowUp(withAction(offer))).toEqual({ message: 'What would a new roof cost?', operationId: 'CAPITAL_ITEM_FUNDING_GOAL' });
  });
  it('follows nothing when the first part did not answer', () => {
    expect(alsoAnswerFollowUp(withAction(offer, 'NEEDS_CONTEXT'))).toBeNull();
    expect(alsoAnswerFollowUp(undefined)).toBeNull();
  });
  it('ignores other actions and incomplete offers', () => {
    expect(alsoAnswerFollowUp(withAction({ ...offer, id: 'item-funding-capital-plan' }))).toBeNull();
    expect(alsoAnswerFollowUp(withAction({ ...offer, operationId: undefined }))).toBeNull();
    expect(alsoAnswerFollowUp(withAction({ ...offer, interactionType: 'OPEN_FILE_INTAKE' }))).toBeNull();
  });
});
