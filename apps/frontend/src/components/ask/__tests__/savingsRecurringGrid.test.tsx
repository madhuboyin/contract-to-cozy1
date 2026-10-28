import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const action = {
  id: 'set-up', label: 'Set up plan', message: 'Set up this plan', operationId: 'SAVINGS_BENEFIT_COMMAND',
  interactionType: 'MUTATE_RECORD' as const, style: 'PRIMARY' as const,
};

const block: GroupedList = {
  type: 'GROUPED_LIST', id: 'savings-recurring-setup', title: 'Your recurring costs',
  description: 'Add what you pay now and Ask compares it with benchmarks for your area. These are estimates, not quotes.',
  filters: [], actions: [],
  sections: [{ id: 'recurring-setup', title: 'Costs to compare', count: 4, items: [
    { id: 'insurance', entityType: 'HOME_SAVINGS_CATEGORY', title: 'Home insurance', description: 'Not set up yet. Add what you pay now and Ask will compare it.', meta: ['Not set up'], status: 'NOT_SET_UP', actions: [action] },
    { id: 'warranty', title: 'Home warranty', description: 'Choice Home. These details come from your warranty record, so they are read from there and cannot be changed here.', meta: ['From your warranty record', '$55 monthly'], status: 'CURRENT', actions: [] },
    { id: 'internet', title: 'Internet', description: 'Comcast · Gigabit', meta: ['Plan saved', '$89.99 monthly', 'Possible saving found'], status: 'FOUND_SAVINGS', actions: [{ ...action, label: 'Update plan' }] },
    { id: 'utilities', title: 'Electricity and gas', description: 'Not set up yet. Add what you pay now and Ask will compare it.', meta: ['Not set up'], status: 'NOT_SET_UP', actions: [action] },
  ] }],
};

test('renders recurring costs as a compact responsive grid without repeated setup state', () => {
  const onItemAction = jest.fn();
  const { container } = render(<GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);

  expect(screen.getByRole('heading', { name: 'Recurring costs to compare' })).toBeInTheDocument();
  expect(screen.getByText('4 costs')).toBeInTheDocument();
  expect(container.querySelector('[data-savings-recurring-grid] ul')).toHaveClass('md:grid-cols-2');
  expect(screen.queryByText('Costs to compare')).not.toBeInTheDocument();
  expect(screen.queryByText('Not set up yet. Add what you pay now and Ask will compare it.')).not.toBeInTheDocument();
  expect(screen.getAllByText('Not set up')).toHaveLength(2);
  expect(screen.getByText(/From your warranty record/)).toBeInTheDocument();
  expect(screen.queryAllByRole('button', { name: /plan/i })).toHaveLength(3);

  fireEvent.click(screen.getAllByRole('button', { name: 'Set up plan' })[0]);
  expect(onItemAction).toHaveBeenCalledWith('HOME_SAVINGS_CATEGORY', 'insurance', 'Set up this plan', 'SAVINGS_BENEFIT_COMMAND', 'MUTATE_RECORD');
});
