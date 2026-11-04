/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardCommandPalette from '../DashboardCommandPalette';
import { api } from '@/lib/api/client';
import type { AskSearchResponse, AskSearchResult } from '@/features/ask/types';

const push = jest.fn();
let mockPath = '/dashboard/ask';
let mockRole = 'HOMEOWNER';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => mockPath }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { role: mockRole } }) }));
jest.mock('@/lib/property/PropertyContext', () => ({ usePropertyContext: () => ({ selectedPropertyId: 'home-1' }) }));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/features/tools/useCapabilityCatalog', () => ({ useCapabilityCatalog: () => ({ data: { registryVersion: 'v', capabilities: [] }, isError: false }) }));
jest.mock('@/features/tools/useCapabilityImpression', () => ({ useCapabilityImpression: () => ({ current: null }) }));
jest.mock('@/lib/api/client', () => ({ api: { searchAsk: jest.fn() } }));
const searchAsk = api.searchAsk as jest.Mock;

const result = (overrides: Partial<AskSearchResult> = {}): AskSearchResult => ({
  resultKey: 'k1', group: 'RECORD', providerId: 'RECORD_rooms', typeLabel: 'Rooms', title: 'Primary bedroom', snippet: null, propertyId: 'home-1', status: null, asOf: '2026-10-02T00:00:00.000Z', freshness: null,
  destination: { kind: 'RECORD', sectionId: 'rooms', recordId: 'room-9', open: { question: 'Show me the items in my Primary bedroom.' } }, ...overrides,
});
const response = (groups: AskSearchResponse['groups'], overrides: Partial<AskSearchResponse> = {}): AskSearchResponse => ({
  contractVersion: 'ask-search-v1', propertyId: 'home-1', generatedAt: '2026-10-20T12:00:00.000Z', partial: false, totalResults: groups.reduce((n, g) => n + g.results.length, 0), groups, providers: [], ...overrides,
});
const openPalette = () => { render(<DashboardCommandPalette />); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); };
const input = () => screen.getByPlaceholderText(/Search your home, pages/);
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });

beforeAll(() => {
  // cmdk measures its list and scrolls the highlighted item; jsdom has neither.
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = jest.fn();
});

describe('unified Cmd/Ctrl+K search', () => {
  beforeEach(() => { mockPath = '/dashboard/ask'; mockRole = 'HOMEOWNER'; push.mockReset(); searchAsk.mockReset(); });

  it('opens from the shortcut, and shows pages and commands with no home search for a short query', () => {
    openPalette();
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    type('a');
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    expect(searchAsk).not.toHaveBeenCalled();
  });

  it('shows home results in fixed group order above pages, and opens the exact record in the conversation on screen', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([
      { group: 'WORK', label: 'Work', more: true, results: [result({ resultKey: 'w1', group: 'WORK', typeLabel: 'Claims', title: 'Water claim', status: 'Closed', destination: { kind: 'WORK', workKey: 'claim:c1', open: { question: 'Continue: Water claim' } } })] },
      { group: 'RECORD', label: 'Home record', more: false, results: [result()] },
    ]) });
    openPalette();
    type('bed');
    expect(await screen.findByText('Primary bedroom')).toBeInTheDocument();
    expect(searchAsk).toHaveBeenCalledWith('home-1', 'bed', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const order = Array.from(document.querySelectorAll('[data-search-group]')).map((el) => el.getAttribute('data-search-group'));
    expect(order).toEqual(['RECORD', 'WORK']);
    expect(within(document.querySelector('[data-search-group="WORK"]') as HTMLElement).getByText(/More matches exist/)).toBeInTheDocument();
    // Server results are never hidden by the palette's own text filter.
    expect(screen.getByText('Water claim')).toBeInTheDocument();
    const requested = jest.fn();
    window.addEventListener('ask:ask-question', requested);
    fireEvent.click(screen.getByText('Primary bedroom'));
    window.removeEventListener('ask:ask-question', requested);
    expect((requested.mock.calls[0][0] as CustomEvent).detail).toEqual({ propertyId: 'home-1', question: 'Show me the items in my Primary bedroom.', from: 'search' });
    expect(push).not.toHaveBeenCalled();
  });

  it('opens a result as a deep link into Ask from any other page', async () => {
    mockPath = '/dashboard/properties';
    searchAsk.mockResolvedValue({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    openPalette();
    type('bed');
    fireEvent.click(await screen.findByText('Primary bedroom'));
    expect(new URL(push.mock.calls[0][0], 'https://x.test').searchParams.get('question')).toBe('Show me the items in my Primary bedroom.');
  });

  it('moves through home results and pages with the arrow keys and opens the highlighted one with Enter', async () => {
    mockPath = '/dashboard/properties';
    searchAsk.mockResolvedValue({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    openPalette();
    type('bed');
    await screen.findByText('Primary bedroom');
    const selected = () => document.querySelector('[cmdk-item][data-selected="true"]');
    expect(selected()).toHaveTextContent('Primary bedroom');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('names places that could not be searched and never calls a partial empty result empty', async () => {
    searchAsk.mockResolvedValue({ success: true, data: response([], { partial: true, providers: [{ providerId: 'WORK_CLAIMS', group: 'WORK', label: 'Claims', state: 'TIMED_OUT', reason: 'This took too long to search.', returned: 0, more: false }] }) });
    openPalette();
    type('zzz');
    expect(await screen.findByText(/not a confirmed empty home search/)).toBeInTheDocument();
    expect(document.querySelector('[data-search-partial]')).toHaveTextContent('Claims: This took too long to search.');
    expect(screen.queryByText('No home matches.')).not.toBeInTheDocument();
  });

  it('says there are no home matches only when every place answered, and offers retry on failure', async () => {
    searchAsk.mockResolvedValueOnce({ success: true, data: response([]) });
    openPalette();
    type('nothing');
    expect(await screen.findByText('No home matches.')).toBeInTheDocument();
    searchAsk.mockRejectedValueOnce(new Error('network'));
    type('roof');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be completed');
    searchAsk.mockResolvedValueOnce({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result()] }]) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Primary bedroom')).toBeInTheDocument();
  });

  it('keeps the query out of storage, the URL and the opened question, and ignores a slower older response', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    let resolveFirst: (value: unknown) => void = () => undefined;
    searchAsk.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    searchAsk.mockResolvedValueOnce({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result({ title: 'Newer result' })] }]) });
    openPalette();
    type('mo');
    await waitFor(() => expect(searchAsk).toHaveBeenCalledTimes(1));
    type('mortgage payoff');
    expect(await screen.findByText('Newer result')).toBeInTheDocument();
    resolveFirst({ success: true, data: response([{ group: 'RECORD', label: 'Home record', more: false, results: [result({ title: 'Stale result' })] }]) });
    await waitFor(() => expect(screen.queryByText('Stale result')).not.toBeInTheDocument());
    expect(setItem).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/mortgage/));
    expect(window.location.href).not.toMatch(/mortgage/);
    setItem.mockRestore();
  });

  it('does not search the home for an admin, who only gets the admin command list', () => {
    mockRole = 'ADMIN';
    openPalette();
    type('bedroom');
    expect(searchAsk).not.toHaveBeenCalled();
  });
});
