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

test('focused Home Action shows its evidence without opening details, with the upload hint only when the server marks a target', () => {
  const withEvidence = (target: boolean): GroupedList => ({
    ...block,
    sections: [...block.sections, { id: 'work-evidence', title: 'Evidence', count: 1, items: [
      { id: 'e1', title: 'Invoice.pdf', meta: ['Document', 'Oct 20, 2026'], status: 'Awaiting review' },
      ...(target ? [{ id: 'work-1', title: 'Add a photo or document', description: 'Add a photo or document that shows what was done.', meta: [], entityType: 'OPERATIONAL_WORK_ITEM', evidenceTarget: true }] : []),
    ] }],
  });
  const view = (b: GroupedList) => render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke: jest.fn() }}>
      <GenericGroupedListBlock block={b} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </AskBlockActionContext.Provider>,
  );
  const first = view(withEvidence(true));
  expect(screen.getByText('Invoice.pdf')).toBeInTheDocument();
  expect(screen.getByText('Awaiting review')).toBeInTheDocument();
  expect(screen.getByText(/shows what was done/)).toBeInTheDocument();
  first.unmount();
  view(withEvidence(false));
  expect(screen.getByText('Invoice.pdf')).toBeInTheDocument();
  expect(screen.queryByText(/shows what was done/)).toBeNull();
});

test('the evidence region runs its declared actions against the work item', () => {
  const onItemAction = jest.fn();
  const target = { id: 'work-1', title: 'Add a photo or document', description: 'Add one.', meta: [], entityType: 'OPERATIONAL_WORK_ITEM', evidenceTarget: true, actions: [
    { id: 'attach', label: 'Attach an existing record', message: 'Attach an existing record as evidence for this work item.', interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND', style: 'SECONDARY' as const, entityType: 'OPERATIONAL_WORK_ITEM', entityId: 'work-1' },
  ] };
  const b: GroupedList = { ...block, sections: [...block.sections, { id: 'work-evidence', title: 'Evidence', count: 0, items: [target] }] };
  render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke: jest.fn() }}>
      <GenericGroupedListBlock block={b} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </AskBlockActionContext.Provider>,
  );
  expect(screen.getByText('No evidence is attached yet.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Attach an existing record' }));
  expect(onItemAction).toHaveBeenCalledWith('OPERATIONAL_WORK_ITEM', 'work-1', 'Attach an existing record as evidence for this work item.', 'HOME_WORK_ITEM_COMMAND', 'MUTATE_RECORD');
});
