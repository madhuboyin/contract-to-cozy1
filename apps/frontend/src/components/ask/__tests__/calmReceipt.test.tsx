import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// ACUI-005 (FRD v1.117): review, confirm and receipt read as stages, and a finished action leaves its record one click away.
const receipt = (overrides: Record<string, unknown> = {}) => ({
  type: 'WORKFLOW_PROGRESS', id: 'maintenance-task-1', title: 'Maintenance task created', status: 'COMPLETED',
  description: 'The task is now part of this home’s canonical Maintenance record.',
  details: [{ label: 'Task', value: 'Replace HVAC filter' }, { label: 'Due', value: 'Oct 3, 2026' }], actions: [], ...overrides,
} as AskPresentationBlock);
const output = { type: 'OUTPUT_ARTIFACTS', id: 'out', title: 'Created record', items: [{ artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: 'task-1', relationship: 'CREATED', label: 'Replace HVAC filter', status: 'PENDING', createdAt: '2026-09-18T12:00:00.000Z', navigation: { label: 'Open task in Maintenance', href: '/dashboard/maintenance?taskId=task-1' } }] } as AskPresentationBlock;
const execution = (overrides: Partial<AskExecutionResponse> = {}) => ({
  sessionId: 'session', executionId: 'execution', question: 'Create a maintenance task', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-25T19:30:21.000Z', updatedAt: '2026-09-25T19:30:21.000Z', viewState: null, blocks: [receipt(), output],
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
  ...overrides,
} as unknown as AskExecutionResponse);
const confirmation = { confirmationId: 'c1', version: 1, title: 'Review this maintenance task', description: 'No shared-home record has changed yet.', fields: [{ label: 'Task', value: 'Replace HVAC filter' }], editableFields: [], confirmLabel: 'Create task', consentText: 'I confirm', expiresAt: '2099-01-01T00:00:00.000Z' };
const card = (value: AskExecutionResponse) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1'); });

describe('calm receipt', () => {
  it('is a plain past-tense receipt: title, what changed, and the created record as the one primary link', async () => {
    const { container } = card(execution());
    const section = container.querySelector('[data-calm-receipt="completed"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent('Receipt');
    expect(screen.getByRole('heading', { name: 'Maintenance task created' })).toBeInTheDocument();
    expect(section).toHaveTextContent('Replace HVAC filter');
    expect(section).toHaveTextContent('Oct 3, 2026');
    expect(section.querySelector('section.bg-teal-50\\/70, .rounded-2xl')).toBeNull();
    const link = screen.getByRole('link', { name: 'Open task in Maintenance' });
    expect(link).toHaveAttribute('href', '/dashboard/maintenance?taskId=task-1');
    expect(link.className).toContain('bg-teal-700');
  });

  it('keeps the producer’s own actions, first one primary and the rest quiet, and adds no second link', () => {
    const { container } = card(execution({ blocks: [receipt({ actions: [{ id: 'a', label: 'Open completed task', href: '/dashboard/maintenance?taskId=t', style: 'SECONDARY' }, { id: 'b', label: 'Open Radar', href: '/radar', style: 'PRIMARY' }] }), output] }));
    expect(screen.getByRole('link', { name: 'Open completed task' }).className).toContain('bg-teal-700');
    expect(screen.getByRole('link', { name: 'Open Radar' }).className).not.toContain('bg-teal-700');
    expect(screen.queryByRole('link', { name: 'Open task in Maintenance' })).toBeNull();
    expect(container.querySelectorAll('[data-calm-receipt] a')).toHaveLength(2);
  });

  it('never marks a cancelled or expired action as a receipt or success', () => {
    const { container } = card(execution({ blocks: [receipt({ status: 'CANCELLED', title: 'Nothing was created', details: [] })] }));
    const section = container.querySelector('[data-calm-receipt="cancelled"]') as HTMLElement;
    expect(section).toHaveTextContent('Cancelled');
    expect(section).not.toHaveTextContent('Receipt');
    expect(section).not.toHaveAttribute('aria-label');
  });

  it('keeps the previous receipt card when the calm setting is off', () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card(execution());
    expect(container.querySelector('[data-calm-receipt]')).toBeNull();
    expect(screen.getByText('CREATED')).toBeInTheDocument();
  });
});

describe('calm review and unknown outcome', () => {
  it('names the review stage and says nothing is saved yet', () => {
    const { container } = card(execution({ status: 'NEEDS_CONFIRMATION', confirmation, blocks: [] } as Partial<AskExecutionResponse>));
    expect(container.querySelector('[data-conversational-stage="review"]')).toHaveTextContent('Review · nothing is saved until you confirm');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
  });

  it('reconciles an unknown outcome with a status check, never a second execution invitation', () => {
    const { container } = card(execution({ status: 'RUNNING', confirmation, blocks: [] } as Partial<AskExecutionResponse>));
    expect(container.querySelector('[data-calm-outcome-unknown]')).toHaveTextContent('Outcome not yet known');
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create task' })).toBeNull();
  });
});
