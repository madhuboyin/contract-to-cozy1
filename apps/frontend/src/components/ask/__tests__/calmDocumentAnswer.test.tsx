import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';

// Documents D-1 (FRD v1.135): the document lookup in the calm anatomy.
const docRow = { id: 'd1', title: 'Roof invoice', description: null, meta: ['unverified', 'Sep 3, 2026'], status: 'UNVERIFIED', entityType: 'DOCUMENT', href: '/dashboard/properties/home/documents' };
const blocks = () => [
  { type: 'SUMMARY', id: 'document-lookup-summary', title: '2 documents on file', headline: '2 documents on file.', supportLine: 'Most recent: Roof invoice, added Sep 3, 2026.', body: '1 not yet verified.', tone: 'CAUTION',
    chips: [{ label: '1 not yet verified', tone: 'CAUTION' }, { label: '1 verified', tone: 'DEFAULT' }],
    actions: [{ id: 'open-documents', label: 'Open Documents', href: '/dashboard/properties/home/documents', style: 'SECONDARY' }] },
  { type: 'GROUPED_LIST', id: 'document-lookup-groups', title: 'Documents by type', filters: [],
    sections: [{ id: 'document-lookup-invoice', title: 'Invoices', count: 1, items: [docRow] }],
    actions: [{ id: 'open-documents-list', label: 'Open Documents', href: '/dashboard/properties/home/documents', style: 'SECONDARY' }] },
  { type: 'BOUNDARY', id: 'document-lookup-boundary', title: 'Recorded information only', body: 'Ask has not read or interpreted the documents themselves.', severity: 'INFO', suggestions: [] },
];
const execution = () => ({
  sessionId: 'session', executionId: 'execution', question: 'Show my documents', status: 'ANSWERED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-26T19:32:55.000Z', updatedAt: '2026-09-26T19:32:55.000Z', viewState: null, blocks: blocks(),
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const card = () => render(
  <ExecutionCard execution={execution()} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('calm Documents answer', () => {
  it('leads with the counted sentence and verification chips, and states the boundary as a quiet footnote', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: '2 documents on file.' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('1 not yet verified');
    expect(screen.getByText('Most recent: Roof invoice, added Sep 3, 2026.')).toBeInTheDocument();
    expect(container.querySelector('[data-calm-footnote]')).toHaveTextContent('Ask has not read or interpreted the documents themselves.');
  });

  it('draws the record page once, as quiet text, and offers no filled step', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card();
    expect(await screen.findAllByText('Open Documents')).toHaveLength(1);
    expect(document.querySelector('a.bg-teal-700, button.bg-teal-700')).toBeNull();
  });

  it('keeps the previous presentation, with the page linked once by the summary, when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: '2 documents on file' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
    expect(screen.getAllByText('Open Documents')).toHaveLength(1);
  });
});
