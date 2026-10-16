import { fireEvent, render, screen } from '@testing-library/react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const DRAFT = 'Hello,\n\nThank you for the estimate. Could you itemize the labor and materials before we proceed?';
const draftBlock: GroupedList = {
  type: 'GROUPED_LIST', id: 'negotiation-shield-draft', title: 'Draft email — nothing has been sent', filters: [], actions: [],
  description: 'Prepared for you to read and edit. Ask has not sent it to anyone and cannot send it.',
  sections: [{ id: 'negotiation-shield-draft-parts', title: 'Draft', count: 1, items: [{
    id: 'draft-0', title: 'Question about your estimate', meta: ['Prepared Oct 3, 2026'], status: 'Draft', detail: DRAFT,
  }] }],
};

const renderBlock = (block: GroupedList, onItemAction = jest.fn()) => render(
  <GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />,
);

test('the draft is collapsed by default, labelled as unsent, and revealed on request', () => {
  renderBlock(draftBlock);
  expect(screen.getByText('Draft email — nothing has been sent')).toBeInTheDocument();
  expect(screen.queryByText(/itemize the labor and materials/)).not.toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: /Show the draft/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByText(/itemize the labor and materials/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Hide the draft/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Hide the draft/ }));
  expect(screen.queryByText(/itemize the labor and materials/)).not.toBeInTheDocument();
});

test('other blocks do not gain a reveal control from the same field', () => {
  renderBlock({ ...draftBlock, id: 'some-other-list' });
  expect(screen.queryByRole('button', { name: /Show the draft|View details/ })).not.toBeInTheDocument();
});

test('a case row offers Review, which launches the in-conversation read with the case identity', () => {
  const onItemAction = jest.fn();
  renderBlock({
    type: 'GROUPED_LIST', id: 'negotiation-shield-cases', title: 'Negotiation reviews', filters: [], actions: [],
    sections: [{ id: 'negotiation-shield-open', title: 'Open', count: 1, items: [{
      id: 'case-1', title: 'Roof quote', meta: ['Contractor quote review'], status: 'Analyzed', entityType: 'NEGOTIATION_SHIELD_CASE',
      actions: [{ id: 'negotiation-shield-review', label: 'Review', message: 'Review this negotiation case.', operationId: 'NEGOTIATION_SHIELD_CASES', interactionType: 'CONVERSATION_CONTINUE', style: 'PRIMARY' }],
    }] }],
  }, onItemAction);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(onItemAction).toHaveBeenCalledWith('NEGOTIATION_SHIELD_CASE', 'case-1', 'Review this negotiation case.', 'NEGOTIATION_SHIELD_CASES', 'CONVERSATION_CONTINUE');
});
