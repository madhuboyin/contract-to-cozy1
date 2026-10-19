/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskSavedDestination } from '../saved/AskSavedDestination';
import { savedReopenHref } from '../saved/savedPresentation';
import { PinnedResultsStrip } from '../PinnedResultsStrip';
import { api } from '@/lib/api/client';
import type { AskSavedArtifact, AskSavedPage, AskSavedResolution } from '@/features/ask/types';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams('propertyId=home-1') }));
jest.mock('@/lib/property/PropertyContext', () => ({ usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }) }));
jest.mock('@/lib/api/client', () => ({ api: { getAskSavedPage: jest.fn(), resolveAskSavedArtifact: jest.fn(), setAskSavedArchive: jest.fn() } }));

const getSaved = api.getAskSavedPage as jest.Mock;
const resolveSaved = api.resolveAskSavedArtifact as jest.Mock;
const setArchive = api.setAskSavedArchive as jest.Mock;

const artifact = (overrides: Partial<AskSavedArtifact> = {}): AskSavedArtifact => ({
  artifactKey: 'comparison:q1', artifactType: 'QUOTE_COMPARISON', category: 'COMPARISON', owner: 'quote-comparison', entity: { type: 'QUOTE_COMPARISON_WORKSPACE', id: 'q1' }, propertyId: 'home-1',
  sourceExecutionId: null, title: 'Roofing quotes', summary: 'Selected Acme', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-07T12:00:00.000Z', sourceAsOf: '2026-10-07T12:00:00.000Z',
  version: { behavior: 'UPDATES_IN_PLACE_WITH_HISTORY', superseded: false, supersededBy: null, supersedes: null, label: 'Decided, updated 2026-10-07' },
  freshness: { state: 'CURRENT', reason: null }, visibility: { scope: 'HOUSEHOLD', sensitivity: 'STANDARD' }, archived: { byOwner: false, byYou: false },
  reopen: { operationId: 'QUOTE_COMPARISON_REVIEW', entityType: 'QUOTE_COMPARISON_WORKSPACE', entityId: 'q1', decisionThreadId: null, contextVersion: 'v1' }, reopenUnavailableReason: null,
  capabilities: { export: false, share: false }, sortAt: '2026-10-07T12:00:00.000Z', ...overrides,
});
const page = (rows: AskSavedArtifact[], overrides: Partial<AskSavedPage> = {}): AskSavedPage => ({
  contractVersion: 'ask-saved-v1', propertyId: 'home-1', generatedAt: '2026-10-20T12:00:00.000Z', archived: false, total: rows.length, totalScope: 'COMPLETE', partial: false, delivered: rows.length,
  nextCursor: null, truncated: false, counts: { active: rows.length, archived: 2 }, sort: { key: 'sortAt', label: 'Most recent first' }, query: { search: null, artifactType: null, freshness: null },
  filterOptions: { types: [{ value: 'QUOTE_COMPARISON', label: 'Quote comparisons' }], freshness: [{ value: 'CURRENT', label: 'Current' }, { value: 'SUPERSEDED', label: 'Replaced by a newer version' }] },
  types: [{ artifactType: 'QUOTE_COMPARISON', label: 'Quote comparisons', state: 'AVAILABLE', reason: null, total: rows.length, delivered: rows.length }], rows, ...overrides,
});
const resolution = (overrides: Partial<AskSavedResolution> = {}): AskSavedResolution => ({ contractVersion: 'ask-saved-v1', propertyId: 'home-1', artifactKey: 'comparison:q1', outcome: 'AVAILABLE', artifact: artifact(), message: 'Ready to open.', ...overrides });

describe('AskSavedDestination', () => {
  beforeEach(() => { for (const mock of [push, getSaved, resolveSaved, setArchive]) mock.mockReset(); });

  it('lists saved results with kind, freshness, version and counts for the saved and archived lists', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([artifact()]) });
    render(<AskSavedDestination />);
    expect(await screen.findByText('Roofing quotes')).toBeInTheDocument();
    const row = screen.getByText('Roofing quotes').closest('li') as HTMLElement;
    expect(within(row).getByText('Comparison')).toBeInTheDocument();
    expect(within(row).getByText('Current')).toBeInTheDocument();
    expect(within(row).getByText(/Decided, updated 2026-10-07/)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Saved1', 'Archived2']);
    expect(getSaved).toHaveBeenCalledWith('home-1', expect.objectContaining({ archived: false }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('searches, filters by kind and freshness, and switches to the archived list, restarting from the first page', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([artifact()]) });
    render(<AskSavedDestination />);
    await screen.findByText('Roofing quotes');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'QUOTE_COMPARISON' } });
    await waitFor(() => expect(getSaved).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ artifactType: 'QUOTE_COMPARISON' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Freshness'), { target: { value: 'SUPERSEDED' } });
    await waitFor(() => expect(getSaved).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ freshness: 'SUPERSEDED' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Search saved results'), { target: { value: 'roof' } });
    await waitFor(() => expect(getSaved).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ search: 'roof' }), expect.anything()), { timeout: 2000 });
    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }));
    await waitFor(() => expect(getSaved).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ archived: true }), expect.anything()));
  });

  it('pages every row with Show more and never repeats one', async () => {
    getSaved.mockResolvedValueOnce({ success: true, data: page([artifact()], { nextCursor: 'c1', truncated: true, total: 2 }) });
    getSaved.mockResolvedValueOnce({ success: true, data: page([artifact(), artifact({ artifactKey: 'seasonal:s1', artifactType: 'SEASONAL_CHECKLIST', category: 'CHECKLIST', title: 'Winter 2026 checklist' })], { total: 2 }) });
    render(<AskSavedDestination />);
    await screen.findByText('Roofing quotes');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Winter 2026 checklist')).toBeInTheDocument();
    expect(getSaved).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ cursor: 'c1' }), expect.anything());
    expect(screen.getAllByText('Roofing quotes')).toHaveLength(1);
  });

  it('reopens through a fresh resolve into Ask with the exact record, operation and version', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([artifact()]) });
    resolveSaved.mockResolvedValue({ success: true, data: resolution() });
    render(<AskSavedDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(resolveSaved).toHaveBeenCalledWith('home-1', 'comparison:q1');
    const url = new URL(push.mock.calls[0][0], 'https://x.test');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ propertyId: 'home-1', launchOperationId: 'QUOTE_COMPARISON_REVIEW', launchEntityType: 'QUOTE_COMPARISON_WORKSPACE', launchEntityId: 'q1', launchContextVersion: 'v1', from: 'saved' });
  });

  it.each([['DELETED', 'This was removed, so there is nothing to open.'], ['ACCESS_LOST', 'Your household role can no longer open this.'], ['UNAVAILABLE', 'This kind of saved result cannot be opened right now.']] as const)('says %s plainly, never shows a stale copy, and does not navigate', async (outcome, message) => {
    getSaved.mockResolvedValue({ success: true, data: page([artifact()]) });
    resolveSaved.mockResolvedValue({ success: true, data: resolution({ outcome, artifact: null, message }) });
    render(<AskSavedDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps a replaced version visible, marked, with a way to see the newer one', async () => {
    const prior = artifact({ artifactKey: 'decision:s1', artifactType: 'DECISION_RECOMMENDATION', category: 'DECISION_OUTPUT', title: 'Furnace (recommendation)', freshness: { state: 'SUPERSEDED', reason: 'A newer recommendation replaced this one; this version is kept.' }, version: { behavior: 'NEW_VERSION_RETAINED', superseded: true, supersededBy: 'decision:s2', supersedes: null, label: 'Recommendation of 2026-10-03' }, reopen: null, reopenUnavailableReason: null });
    const newer = artifact({ artifactKey: 'decision:s2', title: 'Furnace (recommendation)', reopen: { operationId: 'HVAC_DECISION_CONTINUE', entityType: 'InventoryItem', entityId: 'inv1', decisionThreadId: 't1', contextVersion: '4' } });
    getSaved.mockResolvedValue({ success: true, data: page([prior]) });
    resolveSaved.mockResolvedValue({ success: true, data: resolution({ artifactKey: 'decision:s2', artifact: newer }) });
    render(<AskSavedDestination />);
    const priorRow = (await screen.findByText('Furnace (recommendation)')).closest('li') as HTMLElement;
    expect(within(priorRow).getByText('Replaced by a newer version')).toBeInTheDocument();
    expect(within(priorRow).getByText(/this version is kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See the newer version' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(resolveSaved).toHaveBeenCalledWith('home-1', 'decision:s2');
    expect(push.mock.calls[0][0]).toContain('launchDecisionThreadId=t1');
  });

  it('archives and restores in your own list only, and does not offer restore for an owner-archived item', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([artifact(), artifact({ artifactKey: 'brief:b1', artifactType: 'PROPERTY_BRIEF', category: 'BRIEFING', title: 'Agent brief', archived: { byOwner: true, byYou: false } })]) });
    setArchive.mockResolvedValue({ success: true, data: resolution({ artifact: artifact({ archived: { byOwner: false, byYou: true } }) }) });
    render(<AskSavedDestination />);
    const rowA = (await screen.findByText('Roofing quotes')).closest('li') as HTMLElement;
    const rowB = screen.getByText('Agent brief').closest('li') as HTMLElement;
    expect(within(rowB).queryByRole('button', { name: /Archive|Restore/ })).not.toBeInTheDocument();
    expect(within(rowB).getByText(/cannot be restored from here/)).toBeInTheDocument();
    fireEvent.click(within(rowA).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(setArchive).toHaveBeenCalledWith('home-1', 'comparison:q1', true));
    await waitFor(() => expect(screen.queryByText('Roofing quotes')).not.toBeInTheDocument());
  });

  it('shows a result Ask cannot reopen with its state and a stated reason, no dead Open button', async () => {
    const report = artifact({ artifactKey: 'report:r1', artifactType: 'HOME_REPORT_EXPORT', category: 'REPORT', title: 'Home report pack report', reopen: null, reopenUnavailableReason: 'Ask cannot reopen a generated report file. Its state and expiry are shown here.', visibility: { scope: 'REQUESTER_ONLY', sensitivity: 'SENSITIVE' } });
    getSaved.mockResolvedValue({ success: true, data: page([report]) });
    render(<AskSavedDestination />);
    await screen.findByText('Home report pack report');
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.getByText('Sensitive')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.querySelector('[data-saved-detail]')).toHaveTextContent('Ask cannot reopen a generated report file');
    expect(document.querySelector('[data-saved-detail]')).toHaveTextContent('Only the person who requested it');
  });

  it('names kinds that could not be read and does not call a partial empty list empty', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([], { partial: true, total: null, totalScope: 'PARTIAL', types: [{ artifactType: 'PROPERTY_BRIEF', label: 'Property briefs', state: 'FAILED', reason: 'This kind of saved result could not be read right now.', total: null, delivered: 0 }] }) });
    render(<AskSavedDestination />);
    expect(await screen.findByText(/not a confirmed empty list/)).toBeInTheDocument();
    expect(document.querySelector('[data-saved-partial]')).toHaveTextContent('Property briefs');
    expect(screen.queryByText('Nothing is saved for this home yet.')).not.toBeInTheDocument();
  });

  it('states a real empty list only when every kind answered', async () => {
    getSaved.mockResolvedValue({ success: true, data: page([]) });
    render(<AskSavedDestination />);
    expect(await screen.findByText('Nothing is saved for this home yet.')).toBeInTheDocument();
  });
});

describe('pinning is a presentation preference, not saving', () => {
  it('the pinned strip never calls the API, and saving is a separate surface', () => {
    for (const mock of [getSaved, resolveSaved, setArchive]) mock.mockReset();
    const execution = { executionId: 'e1', updatedAt: '2026-10-20T12:00:00.000Z', question: 'Is my roof ok?', status: 'ANSWERED', blocks: [] } as never;
    const onUnpin = jest.fn();
    render(<PinnedResultsStrip executions={[execution]} onUnpin={onUnpin} />);
    fireEvent.click(screen.getByRole('button', { name: /^Unpin/ }));
    expect(onUnpin).toHaveBeenCalledWith('e1');
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });
});

describe('savedReopenHref', () => {
  it('is null when Ask has no way to reopen the artifact', () => {
    expect(savedReopenHref(artifact({ reopen: null }), 'home-1')).toBeNull();
    expect(savedReopenHref(artifact(), 'home-1')).toContain('launchOperationId=QUOTE_COMPARISON_REVIEW');
  });
});
