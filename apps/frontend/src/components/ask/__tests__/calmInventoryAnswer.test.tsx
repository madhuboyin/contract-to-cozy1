import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';

// ACUI I-1 (FRD v1.121): the Inventory answer in the calm anatomy.
const item = (id: string, title: string) => ({ id, title, meta: ['Kitchen', 'Brand/model not recorded'], status: 'GOOD', entityType: 'INVENTORY_ITEM', actions: [] });
const blocks = (overrides: { workflow?: boolean } = {}) => [
  { type: 'SUMMARY', id: 'inventory-summary', title: '12 inventory records match this request', headline: '12 items recorded, 5 with missing details.', supportLine: 'Showing the first 10. Each row reflects the canonical inventory record.',
    body: 'Showing the first 10.', tone: 'DEFAULT', chips: [{ label: '12 records', tone: 'DEFAULT' }, { label: '5 missing details', tone: 'CAUTION' }, { label: '0 near end of life', tone: 'DEFAULT' }],
    actions: [{ id: 'open-inventory', label: 'Open home inventory', href: '/dashboard/properties/home/inventory?tab=items', style: 'PRIMARY' }] },
  { type: 'GROUPED_LIST', id: 'inventory-results', title: 'Inventory details', filters: [], presentation: undefined,
    sections: [{ id: 'items', title: 'Living Home Record', count: 12, items: [item('i1', 'Water heater'), item('i2', 'Refrigerator')] }],
    actions: [
      ...(overrides.workflow === false ? [] : [{ id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW', message: 'Add an item to my home inventory.', operationId: 'INVENTORY_ITEM_CREATE', style: 'PRIMARY' }]),
      { id: 'open-inventory-list', label: 'Open home inventory', href: '/dashboard/properties/home/inventory?tab=items', style: 'SECONDARY' },
    ] },
];
const execution = (list = blocks()) => ({
  sessionId: 'session', executionId: 'execution', question: 'Show my inventory', status: 'ANSWERED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-25T19:32:55.000Z', updatedAt: '2026-09-25T19:32:55.000Z', viewState: null, blocks: list,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const card = (value: AskExecutionResponse) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('calm Inventory answer', () => {
  it('leads with the producer sentence and chips, and shows no second copy of the summary link', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution());
    expect(await screen.findByRole('heading', { name: '12 items recorded, 5 with missing details.' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toHaveTextContent('Showing the first 10.');
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('5 missing details');
    // The summary's own action is dropped in an adopted answer; the list carries the one quiet link.
    expect(screen.getAllByText('Open home inventory')).toHaveLength(1);
  });

  it('makes "Add an item" the one dominant step and the full-inventory link quiet text', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution());
    expect(await screen.findByRole('button', { name: /Add an item/ })).toHaveClass('bg-teal-700');
    expect(screen.getByText('Open home inventory').closest('a')?.className ?? '').not.toContain('bg-teal-700');
  });

  it('has no dominant step for a viewer who cannot add', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution(blocks({ workflow: false })));
    expect(await screen.findByText('Open home inventory')).toBeInTheDocument();
    expect(document.querySelector('a.bg-teal-700, button.bg-teal-700')).toBeNull();
  });

  it('keeps the previous presentation, with one Open home inventory link, when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card(execution());
    expect(await screen.findByRole('heading', { name: '12 inventory records match this request' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
    expect(screen.getAllByText('Open home inventory')).toHaveLength(1);
  });
});
