import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GroupedListBlock } from '../blocks/GroupedListBlock';

type WorkBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

function workBlock(): WorkBlock {
  return {
    type: 'GROUPED_LIST',
    id: 'work-overview-results',
    title: 'Needs you',
    actions: [],
    filters: [
      { id: 'view-needs_you', label: 'Needs you · 10', message: 'Only show work that needs me', active: true },
      { id: 'view-active', label: 'Active · 2', message: 'Only show active work', active: false },
      { id: 'view-waiting', label: 'Waiting', message: 'Only show waiting work', active: false },
      { id: 'view-scheduled', label: 'Scheduled', message: 'Only show scheduled work', active: false },
      { id: 'view-completed', label: 'Completed', message: 'Only show completed work', active: false },
      { id: 'view-archived', label: 'Archived', message: 'Only show archived work', active: false },
      { id: 'kind-home_work_item', label: 'Home tasks', message: 'Only show home task work', active: false },
      { id: 'show-more', label: 'Show more', message: 'Now show more work', active: false },
    ],
    sections: [{
      id: 'work', title: 'Needs you work', count: 14,
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `work-${index + 1}`,
        title: `Work item ${index + 1}`,
        description: `Description ${index + 1}`,
        status: 'Accepted',
        entityType: 'HOME_WORK_ITEM',
        href: null,
        meta: ['Home tasks', 'Next: Start or schedule this'],
        actions: [{ id: 'continue', label: 'Start or schedule', message: `Continue ${index + 1}`, interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_WORK_ITEM_COMMAND', style: 'PRIMARY' }],
      })),
    }],
  };
}

test('renders Work as a compact lifecycle surface without generic layout controls', () => {
  const onFilterClick = jest.fn();
  const onItemAction = jest.fn();
  render(<GroupedListBlock block={workBlock()} executionId="execution" propertyId="home" itemActionsDisabled={false} onFilterClick={onFilterClick} onItemAction={onItemAction} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);

  expect(document.querySelector('[data-work-overview-list]')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Work lifecycle' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
  expect(screen.queryByText('Accepted')).not.toBeInTheDocument();
  expect(screen.getAllByText(/Work item/)).toHaveLength(8);

  fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
  expect(screen.getAllByText(/Work item/)).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: 'Show more work' }));
  expect(onFilterClick).toHaveBeenCalledWith('Now show more work');

  fireEvent.click(screen.getAllByRole('button', { name: 'Start or schedule' })[0]);
  expect(onItemAction).toHaveBeenCalledWith('HOME_WORK_ITEM', 'work-1', 'Continue 1', 'HOME_WORK_ITEM_COMMAND', 'CONVERSATION_CONTINUE');
});
