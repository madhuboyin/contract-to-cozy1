import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const props = (block: GroupedList, onItemAction = jest.fn()) => ({
  block, executionId: 'execution', propertyId: 'home', onItemAction,
  itemActionsDisabled: false, onFilterClick: jest.fn(), onCollectionPage: jest.fn(), onAccessLost: jest.fn(),
});

test('ownership-cost views render as compact conversational navigation', () => {
  const block: GroupedList = {
    type: 'GROUPED_LIST', id: 'ownership-cost-views', title: 'Explore ownership costs', filters: [], actions: [],
    sections: [{ id: 'views', title: 'Views', count: 2, items: [
      { id: 'current', title: 'Current cost', description: 'Recorded cost.', status: 'CURRENT', meta: [] },
      { id: 'changes', title: 'What changed', description: 'Compare periods.', meta: [], actions: [{ id: 'changes', label: 'What changed', message: 'What changed?', operationId: 'OWNERSHIP_COSTS', interactionType: 'CONVERSATION_CONTINUE', style: 'SECONDARY' }] },
    ] }],
  };
  const onItemAction = jest.fn();
  const { container } = render(<GenericGroupedListBlock {...props(block, onItemAction)} />);

  expect(container.querySelector('[data-ownership-cost-views]')).toHaveRole('navigation');
  expect(screen.getByText('Current cost')).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByText('Recorded cost.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'What changed' }));
  expect(onItemAction).toHaveBeenCalledWith(undefined, 'changes', 'What changed?', 'OWNERSHIP_COSTS', 'CONVERSATION_CONTINUE');
});

test('cost-alert preferences are collapsed compact switches', () => {
  const block: GroupedList = {
    type: 'GROUPED_LIST', id: 'ownership-cost-notifications', title: 'Reminders and revisit events', description: 'Only an explicit decision completes an action.', filters: [], actions: [],
    sections: [{ id: 'preferences', title: 'Preferences', count: 2, items: [
      { id: 'MATERIAL_CHANGE', entityType: 'OWNERSHIP_COST_NOTIFICATION', title: 'Material change', description: 'Enabled', status: 'ON', meta: [], actions: [{ id: 'toggle', label: 'Turn off', message: 'Manage ownership costs', operationId: 'OWNERSHIP_COST_COMMAND', interactionType: 'MUTATE_RECORD', entityId: 'MATERIAL_CHANGE:false', style: 'SECONDARY' }] },
      { id: 'UPCOMING_EVENT', entityType: 'OWNERSHIP_COST_NOTIFICATION', title: 'Upcoming event', description: 'Disabled', status: 'OFF', meta: [], actions: [] },
    ] }],
  };
  const onItemAction = jest.fn();
  const { container } = render(<GenericGroupedListBlock {...props(block, onItemAction)} />);

  expect(screen.getByText('1 on')).toBeInTheDocument();
  expect(container.querySelector('details')).not.toHaveAttribute('open');
  expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
  const toggle = screen.getByRole('switch', { name: 'Material change: Turn off' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(toggle);
  expect(onItemAction).toHaveBeenCalledWith('OWNERSHIP_COST_NOTIFICATION', 'MATERIAL_CHANGE:false', 'Manage ownership costs', 'OWNERSHIP_COST_COMMAND', 'MUTATE_RECORD');
});
