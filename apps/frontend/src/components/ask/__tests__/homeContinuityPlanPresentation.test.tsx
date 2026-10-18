import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { AskCaptureRequest } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import { HomeContinuityPlanResultList } from '../HomeContinuityPlanResultList';
import { ProgressBlock } from '../patterns/ProgressBlock';
import { InlineCaptureCard } from '../workspace/CaptureCards';

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

const entryRequest = {
  requirementId: 'home-digital-will-entry_create', captureKey: 'HOME_DIGITAL_WILL_EDITOR_INPUTS', classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM',
  title: 'Add plan entry', question: 'Add plan entry details', helpText: 'Nothing is saved until review.', allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Updates the shared Home Continuity Plan', expectedContextVersion: 'v1',
  inputSchema: { type: 'GROUP', groups: [
    { id: 'essentials', title: 'Entry essentials', fieldKeys: ['title', 'entryType', 'priority', 'targetSectionId'] },
    { id: 'details', title: 'Instructions', fieldKeys: ['content', 'summary'] },
    { id: 'visibility', title: 'Visibility and timing', fieldKeys: ['isPinned', 'isEmergency'] },
  ], fields: [
    { key: 'title', label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 500 } },
    { key: 'entryType', label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Instruction', value: 'INSTRUCTION' }, { label: 'Location note', value: 'LOCATION_NOTE' }] } },
    { key: 'priority', label: 'Priority', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Low', value: 'LOW' }, { label: 'Critical', value: 'CRITICAL' }] } },
    { key: 'targetSectionId', label: 'Section', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Emergency Instructions', value: 'emergency' }, { label: 'Utilities', value: 'utilities' }] } },
    { key: 'content', label: 'Full instructions or details', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 10000 } },
    { key: 'summary', label: 'Short summary', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
    { key: 'isPinned', label: 'Pin this entry', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
    { key: 'isEmergency', label: 'Show in Emergency view', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
  ] }, currentAnswer: { entryType: 'INSTRUCTION', priority: 'CRITICAL', targetSectionId: 'emergency', isPinned: 'NO', isEmergency: 'YES' },
} as unknown as AskCaptureRequest;

test('continuity entry capture uses compact controls and defers consent to the final step', () => {
  const view = render(<InlineCaptureCard executionId="entry-execution" request={entryRequest} onCompleted={jest.fn()} />);
  expect(view.container.querySelector('[data-home-continuity-capture]')).toHaveClass('bg-white', 'max-w-[820px]');
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('INSTRUCTION');
  expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('emergency');
  expect(screen.getByRole('button', { name: 'Critical' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText('I confirm this information can be saved to the home record.')).not.toBeInTheDocument();
  expect(screen.getByText('Complete the required fields to continue.')).toBeVisible();

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Water shutoff' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next: Instructions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next: Visibility and timing' }));
  expect(screen.getByText('I confirm this information can be saved to the home record.')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: /Pin this entry/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Show in Emergency view/ })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Cancel' }).parentElement).not.toHaveClass('sticky');
});

test('continuity capture Cancel uses the governed execution cancellation', async () => {
  const completed = jest.fn();
  const cancelledExecution = { executionId: 'entry-execution', status: 'CANCELLED' };
  const cancelled = { success: true, data: cancelledExecution } as Awaited<ReturnType<typeof api.cancelAskExecution>>;
  jest.spyOn(api, 'cancelAskExecution').mockResolvedValueOnce(cancelled);
  render(<InlineCaptureCard executionId="entry-execution" request={entryRequest} onCompleted={completed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.cancelAskExecution).toHaveBeenCalledWith('entry-execution');
  await waitFor(() => expect(completed).toHaveBeenCalledWith(cancelledExecution));
});
