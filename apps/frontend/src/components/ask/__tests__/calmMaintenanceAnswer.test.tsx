import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (IW-CALM-001..005, 010/011, FRD v1.111): the Maintenance answer, slice A.
const task = (id: string, title: string) => ({ id, title, meta: ['HVAC'], status: 'PENDING', entityType: 'MAINTENANCE_TASK', tone: 'CRITICAL', timingLabel: 'Was due Sep 22, 2026', actions: [] });
const blocks = [
  { type: 'SUMMARY', id: 'maintenance-summary', title: '9 maintenance records match this request', headline: '8 tasks are overdue, and 1 more is due in the next 30 days.', supportLine: '8 completed tasks are hidden.',
    body: '9 open, 8 completed, and 8 overdue tasks are recorded in the selected scope.', tone: 'CAUTION', chips: [{ label: '8 overdue', tone: 'CRITICAL' }, { label: '1 due in 30 days', tone: 'CAUTION' }, { label: '9 open', tone: 'DEFAULT' }],
    actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'PRIMARY' }] },
  { type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance record', description: 'Showing 50-item server pages when a section exceeds that size.',
    filters: [{ id: 'all', label: 'All open', message: 'Now show all open maintenance tasks', active: true }], actions: [], presentation: { pattern: 'SHELVES' },
    sections: [{ id: 'overdue', title: 'Overdue', count: 1, offset: 0, items: [task('filter', 'Replace HVAC filter')] }] },
  { type: 'BOUNDARY', id: 'maintenance-record-boundary', title: 'Based on recorded tasks', body: 'An empty or completed task list is not a professional inspection.', severity: 'INFO', suggestions: [] },
];
const execution = (overrides: Partial<AskExecutionResponse> = {}) => ({
  sessionId: 'session', executionId: 'execution', question: 'What maintenance tasks are coming due?', status: 'COMPLETED', property: { id: 'home', label: '94 Ashford Dr' },
  createdAt: '2026-09-25T19:32:55.000Z', updatedAt: '2026-09-25T19:32:55.000Z', viewState: { resultId: 'result', revision: 1 }, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
  ...overrides,
} as unknown as AskExecutionResponse);

const card = (execution: AskExecutionResponse, suggestions: string[] = []) => render(
  <ExecutionCard execution={execution} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={suggestions} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} onToggleFold={jest.fn()} onTogglePin={jest.fn()} />,
);

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('calm Maintenance answer', () => {
  it('leads with the headline and supporting line, and drops the frame, title, paging note and count line', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution());
    expect(await screen.findByRole('heading', { name: '8 tasks are overdue, and 1 more is due in the next 30 days.' })).toBeInTheDocument();
    expect(screen.getByText('8 completed tasks are hidden.')).toBeInTheDocument();
    expect(screen.getByText('8 overdue')).toBeInTheDocument();
    expect(screen.queryByText(/Showing 50-item server pages/)).toBeNull();
    expect(screen.queryByText(/matching tasks/)).toBeNull();
    expect(screen.queryByText(/^Updated /)).toBeNull();
    // The old per-answer card header is gone; the one control is the overflow menu.
    expect(screen.queryByRole('button', { name: /Refresh this result/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Response options' })).toBeInTheDocument();
    expect(container.querySelector('article > div.rounded-3xl')).toBeNull();
  });

  it('shows the informational limit as a footnote, not a warning card', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution());
    const footnote = await waitFor(() => { const node = container.querySelector('[data-calm-footnote]'); expect(node).not.toBeNull(); return node as HTMLElement; });
    expect(footnote).toHaveTextContent('Based on recorded tasks. An empty or completed task list is not a professional inspection.');
    expect(container.querySelector('svg.lucide-triangle-alert, svg.lucide-alert-triangle')).toBeNull();
  });

  it('keeps Refresh, Pin and Collapse reachable inside the overflow menu', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution());
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Response options' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Refresh/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Pin/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Collapse/ })).toBeInTheDocument();
    expect(within(menu).getByText(/^Updated /)).toBeInTheDocument();
  });

  it('offers exactly one retry: the "Try again" suggestion chip is not repeated', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution({ correctionCapabilities: { retryResponse: true, intent: false, entity: false, homeRecord: false } } as Partial<AskExecutionResponse>), ['Try again', 'Only show overdue tasks']);
    await screen.findByRole('heading', { name: /8 tasks are overdue/ });
    expect(screen.getByRole('button', { name: 'Try again with current records' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Only show overdue tasks' })).toBeInTheDocument();
  });

  it('keeps the current rendering when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card(execution());
    expect(await screen.findByText('9 maintenance records match this request')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh this result/ })).toBeInTheDocument();
    expect(screen.getByText(/Showing 50-item server pages/)).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
  });

  it('gives another domain the calm shell but not the calm answer anatomy', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution({ blocks: [blocks[0], { ...blocks[1], id: 'inventory-results', title: 'Inventory' }] } as Partial<AskExecutionResponse>));
    expect(await screen.findByRole('button', { name: 'Response options' })).toBeInTheDocument();
    expect(screen.getByText('9 maintenance records match this request')).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
  });
});
