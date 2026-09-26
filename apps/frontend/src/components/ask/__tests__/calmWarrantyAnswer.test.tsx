import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';

// Warranties W-1 (FRD v1.124): the Warranties answer in the calm anatomy.
const row = (id: string, title: string, status: string, description: string | null, meta: string[]) => ({ id, title, description, meta, status, entityType: 'WARRANTY', href: null, actions: undefined });
const blocks = (overrides: { workflow?: boolean } = {}) => [
  { type: 'SUMMARY', id: 'warranty-summary', title: '3 recorded warranties match this request', headline: '3 warranties: 1 active, 1 expiring within 60 days, 1 expired.', body: 'x', tone: 'CAUTION',
    chips: [{ label: '3 warranties', tone: 'DEFAULT' }, { label: '1 expire within 60 days', tone: 'CAUTION' }],
    actions: [{ id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'PRIMARY' }] },
  { type: 'GROUPED_LIST', id: 'warranty-results', title: 'Recorded warranties', filters: [],
    sections: [{ id: 'warranties', title: 'Recorded warranties', count: 3, items: [
      row('w1', 'Apex Roofing', 'EXPIRING', 'Shingles and flashing for 10 years.', ['Roofing', 'Expires Nov 12, 2026 · 47 days', '1 document']),
      row('w2', 'Acme Home Warranty', 'ACTIVE', 'No coverage details recorded.', ['Home warranty plan', 'Expires Sep 1, 2027', '0 documents']),
      row('w3', 'Cool Air', 'EXPIRED', null, ['HVAC', 'Expired Jan 3, 2026', '0 documents']),
    ] }],
    actions: [
      ...(overrides.workflow === false ? [] : [{ id: 'add-warranty', label: 'Add a warranty', interactionType: 'START_WORKFLOW', message: 'Add a warranty to my home record.', operationId: 'CAPTURE_WARRANTY_CONFIRM', style: 'PRIMARY' }]),
      { id: 'open-warranties-list', label: 'Open Warranties', href: '/dashboard/warranties', style: 'SECONDARY' },
    ] },
  { type: 'EVIDENCE', id: 'warranty-evidence', title: 'Record freshness', items: [{ label: 'Apex Roofing', source: 'Home warranties · recorded', observedAt: '2026-09-01T00:00:00.000Z' }] },
  { type: 'BOUNDARY', id: 'warranty-boundary', title: 'Recorded information only', body: 'This reports the warranty information recorded in your Home Record. It does not determine whether a repair is covered or file a claim.', severity: 'INFO', suggestions: [] },
];
const execution = (list = blocks()) => ({
  sessionId: 'session', executionId: 'execution', question: 'Show my warranties', status: 'ANSWERED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-25T19:32:55.000Z', updatedAt: '2026-09-25T19:32:55.000Z', viewState: null, blocks: list,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const card = (value: AskExecutionResponse) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('calm Warranties answer', () => {
  it('leads with the producer sentence and chips, states the boundary as a quiet footnote, and shows one Warranties link', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution());
    expect(await screen.findByRole('heading', { name: '3 warranties: 1 active, 1 expiring within 60 days, 1 expired.' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('1 expire within 60 days');
    expect(container.querySelector('[data-calm-footnote]')).toHaveTextContent('This reports the warranty information recorded in your Home Record. It does not determine whether a repair is covered or file a claim.');
    expect(screen.getAllByText('Open Warranties')).toHaveLength(1);
  });

  it('shows each warranty with its status, dates and the coverage text exactly as recorded, and marks the ones that need attention', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution());
    expect(await screen.findByText('Shingles and flashing for 10 years.')).toBeInTheDocument();
    expect(screen.getByText('No coverage details recorded.')).toBeInTheDocument();
    expect(screen.getByText('Roofing · Expires Nov 12, 2026 · 47 days · 1 document')).toBeInTheDocument();
    expect(screen.getByText('EXPIRING')).toHaveClass('text-amber-800');
    expect(screen.getByText('ACTIVE')).not.toHaveClass('text-amber-800');
  });

  it('makes "Add a warranty" the one dominant step and the page link quiet text; a viewer has no dominant step', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { unmount } = card(execution());
    expect(await screen.findByRole('button', { name: /Add a warranty/ })).toHaveClass('bg-teal-700');
    expect(screen.getByText('Open Warranties').closest('a')?.className ?? '').not.toContain('bg-teal-700');
    unmount();
    card(execution(blocks({ workflow: false })));
    expect(await screen.findByText('Open Warranties')).toBeInTheDocument();
    expect(document.querySelector('a.bg-teal-700, button.bg-teal-700')).toBeNull();
  });

  it('keeps the previous presentation, with one Open Warranties link, when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card(execution());
    expect(await screen.findByRole('heading', { name: '3 recorded warranties match this request' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
    expect(screen.getAllByText('Open Warranties')).toHaveLength(1);
  });
});
