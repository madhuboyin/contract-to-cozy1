/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskSearchDialog } from '../search/AskSearchDialog';
import { searchResultHref } from '../search/searchPresentation';
import { api } from '@/lib/api/client';
import type { AskSearchResponse, AskSearchResult } from '@/features/ask/types';

const push = jest.fn();
let mockPath = '/dashboard/ask';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => mockPath }));
jest.mock('@/lib/api/client', () => ({ api: { searchAsk: jest.fn() } }));
const searchAsk = api.searchAsk as jest.Mock;

const result = (overrides: Partial<AskSearchResult> = {}): AskSearchResult => ({
  resultKey: 'k1', group: 'RECORD', providerId: 'RECORD_rooms', typeLabel: 'Rooms', title: 'Primary bedroom', snippet: null, propertyId: 'home-1', status: null, asOf: '2026-10-02T00:00:00.000Z', freshness: null,
  destination: { kind: 'RECORD', sectionId: 'rooms', recordId: 'room-9', open: { question: 'Show me the items in my Primary bedroom.' } }, ...overrides,
});
const response = (groups: AskSearchResponse['groups'], overrides: Partial<AskSearchResponse> = {}): AskSearchResponse => ({
  contractVersion: 'ask-search-v1', propertyId: 'home-1', generatedAt: '2026-10-20T12:00:00.000Z', partial: false, totalResults: groups.reduce((n, g) => n + g.results.length, 0), groups, providers: [], ...overrides,
});
const type = (text: string) => fireEvent.change(screen.getByLabelText('Search your home', { selector: 'input' }), { target: { value: text } });

describe('AskSearchDialog', () => {
  beforeEach(() => { mockPath = '/dashboard/ask'; push.mockReset(); searchAsk.mockReset(); });

  it('does not search until there are two characters, and says so', () => {
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('a');
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    expect(searchAsk).not.toHaveBeenCalled();
  });

  it('asks for a home when none is selected', () => {
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId={undefined} />);
    type('bed');
    expect(screen.getByText('Select a home to search it.')).toBeInTheDocument();
    expect(searchAsk).not.toHaveBeenCalled();
  });

  it('groups results by kind with type, status and date, and opens the exact record', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([
      { group: 'RECORD', label: 'Home record', more: false, results: [result()] },
      { group: 'WORK', label: 'Work', more: true, results: [result({ resultKey: 'w1', group: 'WORK', providerId: 'WORK_CLAIMS', typeLabel: 'Claims', title: 'Water claim', status: 'Closed', freshness: 'completed', destination: { kind: 'WORK', workKey: 'claim:c1', open: { question: 'Continue: Water claim', operationId: 'CLAIM_CHECKLIST_VIEW', entityType: 'CLAIM', entityId: 'c1', contextVersion: 'v1' } } })] },
    ]) });
    const onOpenChange = jest.fn();
    render(<AskSearchDialog open onOpenChange={onOpenChange} propertyId="home-1" />);
    type('bed');
    expect(await screen.findByText('Primary bedroom')).toBeInTheDocument();
    expect(searchAsk).toHaveBeenCalledWith('home-1', 'bed', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Home record', 'Work']);
    const work = document.querySelector('[data-search-group="WORK"]') as HTMLElement;
    expect(within(work).getByText(/Claims · Closed · completed/)).toBeInTheDocument();
    expect(within(work).getByText(/More matches exist/)).toBeInTheDocument();
    // Already in an Ask conversation: the record opens as a block in it, and the page goes nowhere.
    const requested = jest.fn();
    window.addEventListener('ask:ask-question', requested);
    fireEvent.click(screen.getByRole('button', { name: /Primary bedroom/ }));
    window.removeEventListener('ask:ask-question', requested);
    expect(requested).toHaveBeenCalledTimes(1);
    expect((requested.mock.calls[0][0] as CustomEvent).detail).toEqual({ propertyId: 'home-1', question: 'Show me the items in my Primary bedroom.', from: 'search' });
    expect(push).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('opens a result as a deep link into Ask from a page that is not an Ask conversation', async () => {
    mockPath = '/dashboard/properties';
    searchAsk.mockResolvedValue({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('bed');
    fireEvent.click(await screen.findByRole('button', { name: /Primary bedroom/ }));
    expect(new URL(push.mock.calls[0][0], 'https://x.test').searchParams.get('question')).toBe('Show me the items in my Primary bedroom.');
  });

  it('names the places that could not be searched and never calls a partial empty result empty', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([], { partial: true, providers: [
      { providerId: 'WORK_CLAIMS', group: 'WORK', label: 'Claims', state: 'TIMED_OUT', reason: 'This took too long to search.', returned: 0, more: false },
      { providerId: 'SAVED_HOME_DIGITAL_WILL', group: 'SAVED', label: 'Home digital will', state: 'UNAVAILABLE', reason: 'Needs its own visibility rules.', returned: 0, more: false },
    ] }) });
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('zzz');
    expect(await screen.findByText(/not a confirmed empty result/)).toBeInTheDocument();
    const partial = document.querySelector('[data-search-partial]') as HTMLElement;
    expect(partial).toHaveTextContent('Claims: This took too long to search.');
    expect(partial).toHaveTextContent('Home digital will');
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('keeps results from the groups that answered when another failed', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([{ group: 'SAVED', label: 'Saved', more: false, results: [result({ resultKey: 's1', group: 'SAVED', title: 'Roofing quotes', destination: { kind: 'SAVED', artifactKey: 'comparison:q1', open: { question: 'Show my saved results' } } })] }], { partial: true, providers: [{ providerId: 'WORK_CLAIMS', group: 'WORK', label: 'Claims', state: 'FAILED', reason: 'This could not be searched right now.', returned: 0, more: false }] }) });
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('roof');
    expect(await screen.findByText('Roofing quotes')).toBeInTheDocument();
    expect(document.querySelector('[data-search-partial]')).toHaveTextContent('Claims');
  });

  it('says No matches only when every place answered', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([]) });
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('nothing');
    expect(await screen.findByText('No matches.')).toBeInTheDocument();
  });

  it('shows a retry on failure and a calm message when the service is paused', async () => {
    searchAsk.mockRejectedValueOnce(new Error('network'));
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('roof');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search could not be completed');
    searchAsk.mockResolvedValueOnce({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Primary bedroom')).toBeInTheDocument();
  });

  it('never puts the query text anywhere but the box and the request body: not the URL, storage, or navigation', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('mortgage payoff');
    await screen.findByText('Primary bedroom');
    expect(setItem).not.toHaveBeenCalled();
    expect(window.location.href).not.toMatch(/mortgage/);
    const requested = jest.fn();
    window.addEventListener('ask:ask-question', requested);
    fireEvent.click(screen.getByRole('button', { name: /Primary bedroom/ }));
    window.removeEventListener('ask:ask-question', requested);
    expect(JSON.stringify((requested.mock.calls[0][0] as CustomEvent).detail)).not.toMatch(/mortgage/);
    setItem.mockRestore();
  });

  it('keeps a newer query from being overwritten by a slower older one', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    searchAsk.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    searchAsk.mockResolvedValueOnce({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result({ title: 'Newer result' })] }]) });
    render(<AskSearchDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    type('ro');
    await waitFor(() => expect(searchAsk).toHaveBeenCalledTimes(1));
    type('roof');
    expect(await screen.findByText('Newer result')).toBeInTheDocument();
    resolveFirst({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result({ title: 'Stale result' })] }]) });
    await waitFor(() => expect(screen.queryByText('Stale result')).not.toBeInTheDocument());
  });
});

describe('searchResultHref', () => {
  it('turns each typed destination into the question it asks, carrying the exact record the server declared', () => {
    const work = new URL(searchResultHref(result({ destination: { kind: 'WORK', workKey: 'claim:c1', open: { question: 'Continue: Water claim', operationId: 'CLAIM_CHECKLIST_VIEW', entityType: 'CLAIM', entityId: 'c1', contextVersion: 'v1' } } }), 'home-1'), 'https://x.test');
    expect(work.pathname).toBe('/dashboard/ask');
    expect(Object.fromEntries(work.searchParams)).toMatchObject({ propertyId: 'home-1', question: 'Continue: Water claim', launchOperationId: 'CLAIM_CHECKLIST_VIEW', launchEntityType: 'CLAIM', launchEntityId: 'c1', launchContextVersion: 'v1' });
    const saved = new URL(searchResultHref(result({ destination: { kind: 'SAVED', artifactKey: 'comparison:q1', open: { question: 'Show my saved results' } } }), 'home-1'), 'https://x.test');
    expect(saved.searchParams.get('question')).toBe('Show my saved results');
    expect(saved.searchParams.get('launchOperationId')).toBeNull();
    expect(searchResultHref(result({ destination: { kind: 'HISTORY', sessionId: 's1', executionId: 'e1' } }), 'home-1')).toBe('/dashboard/ask?propertyId=home-1&sessionId=s1&executionId=e1');
    const capability = searchResultHref(result({ destination: { kind: 'CAPABILITY', question: 'What maintenance is due?', entryId: 'x' } }), 'home-1');
    expect(new URL(capability, 'https://x.test').searchParams.get('question')).toBe('What maintenance is due?');
    expect(capability).not.toContain('launchOperationId');
    expect(JSON.stringify([work.href, saved.href])).not.toMatch(/dashboard\/ask\/(record|work|saved)/);
  });
});
