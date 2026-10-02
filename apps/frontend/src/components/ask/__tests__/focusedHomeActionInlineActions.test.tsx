import { fireEvent, render, screen } from '@testing-library/react';
import { AskBlockActionContext } from '../blocks/context';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const block: GroupedList = {
  type: 'GROUPED_LIST',
  id: 'focused-home-action-guidance',
  title: 'What to do next',
  description: 'Guidance for the selected action.',
  filters: [],
  sections: [
    { id: 'next-step', title: 'Recommended next step', count: 1, items: [{ id: 'primary', title: 'Book a chimney inspection', description: 'Use a qualified professional.', meta: ['low confidence'] }] },
    { id: 'why-it-matters', title: 'Why this matters', count: 1, items: [{ id: 'why', title: 'Safety', description: 'A blocked flue can create a fire or carbon-monoxide risk.', meta: [] }] },
    { id: 'known-details', title: 'Known details', count: 2, items: [
      { id: 'age', title: 'Age', description: '11.8 years', meta: ['History'] },
      { id: 'budget', title: 'Estimated budget', description: '$821–$1,232', meta: ['Plan'] },
    ] },
  ],
  actions: [
    { id: 'home-action-complete-1', label: 'Mark complete', interactionType: 'START_WORKFLOW', message: 'Complete this work item.', operationId: 'OPERATIONAL_WORK_UPDATE', entityType: 'WORK_ITEM', entityId: 'work-1', style: 'PRIMARY' },
    { id: 'home-action-snooze-1', label: 'Snooze reminders', interactionType: 'START_WORKFLOW', message: 'Snooze this work item.', operationId: 'OPERATIONAL_WORK_UPDATE', entityType: 'WORK_ITEM', entityId: 'work-1', style: 'SECONDARY' },
  ],
};

test('focused Home Action keeps details and snooze choices inline', () => {
  const invoke = jest.fn();
  render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke }}>
      <GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </AskBlockActionContext.Provider>,
  );

  expect(screen.queryByText(/blocked flue/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View details' }));
  expect(screen.getByText(/blocked flue/)).toBeInTheDocument();
  expect(screen.getByText('Planning rationale')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Planning details' })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /Guidance Planning rationale/ })).not.toBeInTheDocument();
  expect(screen.getByRole('row', { name: 'History Age 11.8 years' })).toBeInTheDocument();
  expect(screen.getByRole('row', { name: 'Plan Estimated budget $821–$1,232' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Snooze reminders' }));
  expect(screen.queryByText(/blocked flue/)).not.toBeInTheDocument();
  expect(screen.getByText('When should Cozy remind you?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'One week' }));

  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
    id: 'home-action-snooze-1',
    message: 'Snooze this work item for one week.',
    operationId: 'OPERATIONAL_WORK_UPDATE',
    entityId: 'work-1',
  }));
});
