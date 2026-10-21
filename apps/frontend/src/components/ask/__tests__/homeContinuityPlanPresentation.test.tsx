import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { AskCaptureRequest } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import { HomeContinuityPlanResultList } from '../HomeContinuityPlanResultList';
import { ProgressBlock } from '../patterns/ProgressBlock';
import { InlineCaptureCard } from '../workspace/CaptureCards';

const action = { id: 'ENTRY_CREATE', label: 'Add entry', interactionType: 'MUTATE_RECORD' as const, message: 'Add an entry', operationId: 'HOME_DIGITAL_WILL_CREATE', style: 'PRIMARY' as const };

const manager = (id: string, type: string, status = 'ENABLED') => ({
  id, entityType: 'HOME_DIGITAL_WILL_SECTION', title: 'Manage section', description: null, meta: [status === 'ENABLED' ? 'Enabled' : 'Disabled', `type:${type}`], status, href: null,
  actions: [
    { ...action, id: 'ENTRY_CREATE', label: 'Add entry', message: 'Add an entry', operationId: 'HOME_DIGITAL_WILL_CREATE' },
    { ...action, id: 'SECTION_EDIT', label: 'Edit section', style: 'SECONDARY', message: 'Edit section' },
    { ...action, id: 'SECTION_DELETE', label: 'Delete section', style: 'SECONDARY', message: 'Delete section' },
  ],
});
const planBlock = (entries: Record<string, number> = {}, contacts = 0): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> => ({
  type: 'GROUPED_LIST', id: 'digital-will-items', title: 'What the plan holds', filters: [],
  actions: [{ id: 'home-continuity-emergency', label: 'Emergency view', interactionType: 'START_WORKFLOW', message: 'Open', operationId: 'HOME_DIGITAL_WILL_CREATE', style: 'SECONDARY' }],
  sections: [
    ...([['emergency', 'EMERGENCY', 'Emergency Instructions'], ['critical', 'CRITICAL_INFO', 'Critical Information'], ['contractors', 'CONTRACTORS', 'Preferred Contractors'], ['utilities', 'UTILITIES', 'Utilities'], ['general', 'GENERAL_NOTES', 'General Notes']] as const).map(([id, type, title]) => ({
      id: `digital-will-section-${id}`, title, count: entries[id] ?? 0,
      items: [manager(id, type), ...Array.from({ length: entries[id] ?? 0 }, (_, index) => ({ id: `${id}-${index}`, entityType: 'HOME_DIGITAL_WILL_ENTRY', title: `${title} entry ${index + 1}`, description: null, meta: ['Instruction'], status: 'MEDIUM', href: null, actions: [{ ...action, id: 'ENTRY_EDIT', label: 'Edit', message: 'Edit entry' }] }))],
    })),
    ...(contacts ? [{ id: 'digital-will-contacts', title: 'Trusted contacts', count: contacts, items: [{ id: 'c1', entityType: 'HOME_DIGITAL_WILL_CONTACT', title: 'Jordan', description: null, meta: ['Family member'], status: 'PRIMARY', href: null, actions: [] }] }] : []),
  ],
} as unknown as Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>);

test('an empty plan opens as a guided starter: the essentials first with Add entry on each, the full structure behind a disclosure', () => {
  const onAction = jest.fn();
  const view = render(<HomeContinuityPlanResultList block={planBlock()} disabled={false} onAction={onAction} />);
  expect(view.container.querySelector('[data-continuity-starter]')).toBeInTheDocument();
  expect(screen.getByText('Start your plan')).toBeVisible();
  const starterRows = Array.from(view.container.querySelectorAll('[data-continuity-starter] > ul > li')).map((row) => row.querySelector('span span')?.textContent);
  expect(starterRows).toEqual(['Emergency Instructions', 'Utilities', 'Preferred Contractors', 'Trusted contacts']);
  expect(screen.getByText('Start with a primary contact in the checklist above.')).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Add entry to Emergency Instructions' })[0]).toBeVisible();
  expect(screen.getByRole('button', { name: 'Emergency view' })).toBeInTheDocument();
  expect(view.container.querySelector('details > summary')).toHaveTextContent('All plan sections (5)');
  fireEvent.click(screen.getAllByRole('button', { name: 'Add entry to Emergency Instructions' })[0]);
  expect(onAction).toHaveBeenCalledWith('HOME_DIGITAL_WILL_SECTION', 'emergency', 'Add an entry', 'HOME_DIGITAL_WILL_CREATE', 'MUTATE_RECORD');
});

test('once the plan holds anything, sections are compact rows with Add entry on the row, one empty-state message, and management in a menu', () => {
  const onAction = jest.fn();
  const view = render(<HomeContinuityPlanResultList block={planBlock({ emergency: 1 })} disabled={false} onAction={onAction} />);
  expect(view.container.querySelector('[data-continuity-starter]')).not.toBeInTheDocument();
  expect(screen.getByText('1 entry')).toBeVisible();
  expect(screen.getAllByText('No entries yet').length).toBe(4);
  expect(screen.getByRole('button', { name: 'Add entry to Utilities' })).toBeVisible();
  expect(screen.queryByText('Manage section')).not.toBeInTheDocument();
  expect(screen.queryByText('Nothing recorded in this section.')).not.toBeInTheDocument();
  // Opening an empty section shows its management menu, not a second empty card.
  fireEvent.click(screen.getByRole('button', { name: /^Utilities/ }));
  expect(screen.queryByText('Nothing recorded in this section.')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/More actions for Manage section/)).toBeInTheDocument();
  expect(screen.queryAllByRole('button', { name: 'Add entry' })).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry to Utilities' }));
  expect(onAction).toHaveBeenCalledWith('HOME_DIGITAL_WILL_SECTION', 'utilities', 'Add an entry', 'HOME_DIGITAL_WILL_CREATE', 'MUTATE_RECORD');
  // An entry is reachable by opening its section.
  fireEvent.click(screen.getByRole('button', { name: /^Emergency Instructions/ }));
  expect(screen.getByText('Emergency Instructions entry 1')).toBeVisible();
});

test('a trusted-contacts section never offers Add entry, and a disabled section offers none on its row', () => {
  const block = planBlock({ emergency: 1 }, 1);
  block.sections[1].items[0] = manager('critical', 'CRITICAL_INFO', 'DISABLED') as never;
  render(<HomeContinuityPlanResultList block={block} disabled={false} onAction={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add entry to Trusted contacts' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add entry to Critical Information' })).not.toBeInTheDocument();
  expect(screen.getByText('Disabled')).toBeVisible();
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


test('a readiness step that depends on another shows a waiting note and no action of its own', () => {
  const block = {
    type: 'PROGRESS', id: 'digital-will-progress', title: 'Ready to hand off', description: 'Three requirements.', percent: 0, basis: '0 of 3 handoff requirements met',
    metrics: [{ label: 'Met', value: '0', tone: 'DEFAULT' }, { label: 'Missing', value: '3', tone: 'CAUTION' }, { label: 'Entries', value: '0', tone: 'DEFAULT' }],
    nextSteps: [
      { id: 'a', entityType: 'HOME_DIGITAL_WILL', title: 'Choose a primary trusted contact.', description: 'Handoff requirement not met yet', meta: [], status: 'MISSING', href: null, actions: [action] },
      { id: 'b', entityType: 'HOME_DIGITAL_WILL', title: 'Add an email or phone number for the primary contact.', description: 'Waiting for a primary trusted contact', meta: [], status: 'WAITING', href: null, actions: [] },
    ],
    actions: [],
  } as unknown as Extract<AskPresentationBlock, { type: 'PROGRESS' }>;
  const view = render(<ProgressBlock block={block} executionId="execution" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);
  expect(view.container.querySelector('[data-step-waiting]')).toHaveTextContent('Waiting for a primary trusted contact');
  expect(screen.queryByText('Handoff requirement not met yet')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('the plan toolbar downloads the emergency packet with the person\'s own session, and says so when it fails', async () => {
  const blob = new Blob(['pdf']);
  jest.spyOn(api, 'downloadEmergencyPacketPdf').mockResolvedValueOnce(blob);
  const createUrl = jest.fn(() => 'blob:packet');
  const revoke = jest.fn();
  Object.assign(window.URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  render(<HomeContinuityPlanResultList block={planBlock({ emergency: 1 })} propertyId="home" disabled={false} onAction={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download emergency packet' }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(api.downloadEmergencyPacketPdf).toHaveBeenCalledWith('home');
  expect(createUrl).toHaveBeenCalledWith(blob);
  expect(revoke).toHaveBeenCalledWith('blob:packet');
  jest.spyOn(api, 'downloadEmergencyPacketPdf').mockRejectedValueOnce(new Error('nope'));
  fireEvent.click(screen.getByRole('button', { name: 'Download emergency packet' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The emergency packet could not be downloaded');
  click.mockRestore();
});

test('without a property the packet button is not offered', () => {
  render(<HomeContinuityPlanResultList block={planBlock({ emergency: 1 })} disabled={false} onAction={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Download emergency packet' })).not.toBeInTheDocument();
});
