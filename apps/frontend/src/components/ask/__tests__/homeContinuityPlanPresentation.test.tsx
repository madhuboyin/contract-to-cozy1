import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { HomeContinuityPlanResultList } from '../HomeContinuityPlanResultList';
import { ProgressBlock } from '../patterns/ProgressBlock';

const action = { id: 'ENTRY_CREATE', label: 'Add entry', interactionType: 'MUTATE_RECORD' as const, message: 'Add an entry', operationId: 'HOME_DIGITAL_WILL_CREATE', style: 'PRIMARY' as const };

test('continuity sections start collapsed and distinguish management controls from real entry counts', () => {
  const onAction = jest.fn();
  const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
    type: 'GROUPED_LIST', id: 'digital-will-items', title: 'What the plan holds', filters: [], actions: [],
    sections: [{ id: 'digital-will-section-emergency', title: 'Emergency Instructions', count: 0, items: [{ id: 'emergency', entityType: 'HOME_DIGITAL_WILL_SECTION', title: 'Manage section', description: null, meta: ['Enabled'], status: 'ENABLED', href: null, actions: [action] }] }],
  };
  render(<HomeContinuityPlanResultList block={block} disabled={false} onAction={onAction} />);

  expect(screen.getByText('No entries yet')).toBeVisible();
  expect(screen.queryByText('Manage section')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Emergency Instructions/ }));
  expect(screen.getByText('Nothing recorded in this section.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  expect(onAction).toHaveBeenCalledWith('HOME_DIGITAL_WILL_SECTION', 'emergency', 'Add an entry', 'HOME_DIGITAL_WILL_CREATE', 'MUTATE_RECORD');
});

test('continuity readiness uses one compact module with actionable next steps', () => {
  const block: Extract<AskPresentationBlock, { type: 'PROGRESS' }> = {
    type: 'PROGRESS', id: 'digital-will-progress', title: 'Ready to hand off', description: 'Three requirements.', percent: 33, basis: '1 of 3 handoff requirements met',
    metrics: [{ label: 'Met', value: '1', tone: 'DEFAULT' }, { label: 'Missing', value: '2', tone: 'CAUTION' }],
    nextSteps: [{ id: 'emergency', entityType: 'HOME_DIGITAL_WILL_SECTION', title: 'Add an emergency instruction.', description: 'Handoff requirement not met yet', meta: [], status: 'MISSING', href: null, actions: [action] }], actions: [],
  };
  const view = render(<ProgressBlock block={block} executionId="execution" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);
  expect(view.container.querySelector('[data-display-pattern="continuity-readiness"]')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  expect(screen.getByText('Add an emergency instruction.')).toBeVisible();
  expect(screen.queryByText('Handoff requirement not met yet')).not.toBeInTheDocument();
});
