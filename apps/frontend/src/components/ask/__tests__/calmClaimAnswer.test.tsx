import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';

// Claims C-1 (FRD v1.127): the incident and claim status answer in the calm anatomy.
const claimRow = { id: 'c1', title: 'Kitchen leak', description: 'Acme · water damage', meta: ['submitted', 'Opened Sep 1, 2026'], status: 'SUBMITTED', entityType: 'CLAIM', href: '/dashboard/properties/home/claims/c1', actions: [] };
const blocks = () => [
  { type: 'SUMMARY', id: 'incident-claim-summary', title: '2 active items need attention', headline: '1 active incident and 1 open claim.', supportLine: '1 closed claim also on file.', body: 'x', tone: 'CAUTION',
    chips: [{ label: '1 active incident', tone: 'CAUTION' }, { label: '1 open claim', tone: 'CAUTION' }, { label: '1 closed', tone: 'DEFAULT' }],
    actions: [{ id: 'open-incidents', label: 'Open incidents', href: '/dashboard/properties/home/incidents', style: 'SECONDARY' }, { id: 'open-claims', label: 'Open claims', href: '/dashboard/properties/home/claims', style: 'PRIMARY' }] },
  { type: 'GROUPED_LIST', id: 'incident-claim-list', title: 'Incidents and claims', filters: [],
    sections: [{ id: 'active-claims', title: 'Open claims', count: 1, items: [claimRow] }],
    actions: [{ id: 'open-incidents-list', label: 'Open incidents', href: '/dashboard/properties/home/incidents', style: 'SECONDARY' }, { id: 'open-claims-list', label: 'Open claims', href: '/dashboard/properties/home/claims', style: 'SECONDARY' }] },
  { type: 'BOUNDARY', id: 'claim-status-boundary', title: 'Recorded information only', body: 'This shows the incident and claim records in your Home Record. It does not decide whether a claim will be approved or covered. Filing a claim or changing its status happens only when you ask and confirm.', severity: 'INFO', suggestions: [] },
];
const execution = () => ({
  sessionId: 'session', executionId: 'execution', question: 'Show my claims', status: 'ANSWERED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-25T19:32:55.000Z', updatedAt: '2026-09-25T19:32:55.000Z', viewState: null, blocks: blocks(),
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const askMock = jest.fn();
const card = (value: AskExecutionResponse = execution()) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={askMock} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); askMock.mockClear(); });

describe('calm Claims answer', () => {
  it('leads with the producer sentence and chips, states the boundary as a quiet footnote, and says nothing about approval', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: '1 active incident and 1 open claim.' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('1 open claim');
    expect(container.querySelector('[data-calm-footnote]')).toHaveTextContent('It does not decide whether a claim will be approved or covered.');
  });

  it('draws each record page once, as quiet text, and offers no filled step', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card();
    expect(await screen.findAllByText('Open claims')).toHaveLength(1);
    expect(screen.getAllByText('Open incidents')).toHaveLength(1);
    expect(document.querySelector('a.bg-teal-700, button.bg-teal-700')).toBeNull();
    expect(screen.queryByRole('button', { name: /file|start a claim|new claim/i })).toBeNull();
  });

  it('keeps the previous presentation, with each record page linked once by the summary, when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: '2 active items need attention' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-summary]')).toBeNull();
    expect(screen.getAllByText('Open claims')).toHaveLength(1);
    expect(screen.getAllByText('Open incidents')).toHaveLength(1);
  });
});

// C-2 (FRD v1.128): declared filters replace the result through the source execution, never through the words of the earlier question.
const filters = (scope: 'BOTH' | 'CLAIMS', state: 'ALL' | 'OPEN') => [
  { id: 'scope-both', label: 'Incidents and claims', message: 'Now show all incidents and claims', active: scope === 'BOTH' },
  { id: 'scope-claims', label: 'Claims', message: 'Only show claims', active: scope === 'CLAIMS' },
  { id: 'state-all', label: 'Open and closed', message: 'Now show open and closed records', active: state === 'ALL' },
  { id: 'state-open', label: 'Open', message: 'Only show open records', active: state === 'OPEN' },
  ...(scope !== 'BOTH' || state !== 'ALL' ? [{ id: 'clear-all', label: 'Clear filters', message: 'Now show all records with no filters', active: false }] : []),
];
const withFilters = (list: ReturnType<typeof filters>) => { const value = execution(); ((value.blocks as unknown[])[1] as { filters: unknown }).filters = list; return value; };

describe('calm Claims filters', () => {
  it('shows scope and state as separate groups, marks the applied ones, and sends a chip through the source execution', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(withFilters(filters('CLAIMS', 'OPEN')));
    const scope = await screen.findByRole('group', { name: 'Claim scope filters' });
    const state = screen.getByRole('group', { name: 'Claim status filters' });
    expect(within(scope).getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(scope).getByRole('button', { name: 'Claims' })).toBeDisabled();
    expect(within(state).getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(state).getByRole('button', { name: 'Open and closed' }));
    expect(askMock).toHaveBeenCalledWith('Now show open and closed records', undefined, { sourceExecutionId: 'execution' });
  });

  it('offers "Clear filters" only while a filter is applied', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { unmount } = card(withFilters(filters('CLAIMS', 'ALL')));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    expect(askMock).toHaveBeenCalledWith('Now show all records with no filters', undefined, { sourceExecutionId: 'execution' });
    unmount();
    card(withFilters(filters('BOTH', 'ALL')));
    await screen.findByRole('group', { name: 'Claim scope filters' });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('says so, and keeps the chips, when nothing matches', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const value = withFilters(filters('CLAIMS', 'OPEN'));
    ((value.blocks as unknown[])[1] as { sections: unknown[] }).sections = [];
    card(value);
    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('renders no filter group when the result declares none', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card();
    await screen.findByRole('heading', { name: '1 active incident and 1 open claim.' });
    expect(screen.queryByRole('group', { name: /Claim .*filters/ })).toBeNull();
  });
});

