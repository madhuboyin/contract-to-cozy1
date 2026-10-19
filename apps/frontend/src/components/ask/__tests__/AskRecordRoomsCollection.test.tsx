/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordRoomRow } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1&section=rooms') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;
const getIndex = api.getAskRecordIndex as jest.Mock;

const room = (n: number, overrides: Partial<AskRecordRoomRow> = {}): AskRecordRoomRow => ({
  id: `room-${n}`, name: `Room ${n}`, type: 'Bedroom', floorLevel: null, itemCount: n, openTaskCount: 0, updatedAt: '2026-10-05T12:00:00.000Z', askQuestion: `Show me the items in my Room ${n}.`, ...overrides,
});
const page = (rows: AskRecordRoomRow[], overrides: Partial<AskRecordCollectionPage<AskRecordRoomRow>> = {}): AskRecordCollectionPage<AskRecordRoomRow> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId: 'rooms', generatedAt: '2026-10-19T12:00:00.000Z',
  total: rows.length, delivered: rows.length, nextCursor: null, truncated: false, sort: { key: 'sortOrder', label: 'Home order, then name' },
  query: { search: null, filters: {} }, filterOptions: [], rows, ...overrides,
});

describe('AskRecord rooms collection', () => {
  beforeEach(() => { getPage.mockReset(); getIndex.mockReset(); });

  it('pages every room with an explicit remaining count and appends the next page without duplicates', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([room(1), room(2)], { total: 3, delivered: 2, nextCursor: 'c1', truncated: true }) });
    render(<AskRecord />);

    expect(await screen.findByText('Showing 2 of 3 · sorted by home order, then name')).toBeInTheDocument();
    expect(getIndex).not.toHaveBeenCalled();
    expect(getPage).toHaveBeenCalledWith('rooms', 'home-1', { limit: 25, search: '', filters: {} }, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    getPage.mockResolvedValueOnce({ success: true, data: page([room(2), room(3)], { total: 3, delivered: 2 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Show more (1 remaining)' }));
    await waitFor(() => expect(screen.getByText('Showing 3 of 3 · sorted by home order, then name')).toBeInTheDocument());
    expect(getPage).toHaveBeenLastCalledWith('rooms', 'home-1', expect.objectContaining({ cursor: 'c1' }), expect.anything());
    expect(document.querySelectorAll('[data-record-row]')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();

    const link = within(document.querySelector('[data-record-row="room-1"]') as HTMLElement).getByRole('link', { name: 'Open Room 1' });
    const url = new URL(link.getAttribute('href') as string, 'https://x.test');
    expect(url.searchParams.get('question')).toBe('Show me the items in my Room 1.');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record?section=rooms');
  });

  it('restarts from the first page when the floor filter changes and shows an honest no-match state', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([room(1, { floorLevel: 1 })], { filterOptions: [{ key: 'floor', label: 'Floor', options: [{ value: '1', label: 'Level 1' }, { value: 'none', label: 'Floor not recorded' }] }] }) });
    render(<AskRecord />);
    await screen.findByText('Room 1');
    expect(screen.getByText(/Bedroom · Level 1 · 1 item · Updated Oct 5, 2026/)).toBeInTheDocument();

    getPage.mockResolvedValueOnce({ success: true, data: page([], { total: 0, query: { search: null, filters: { floor: 'none' } }, filterOptions: [{ key: 'floor', label: 'Floor', options: [{ value: '1', label: 'Level 1' }, { value: 'none', label: 'Floor not recorded' }] }] }) });
    fireEvent.change(screen.getByRole('combobox', { name: 'Floor' }), { target: { value: 'none' } });
    expect(await screen.findByText('No records match your search or filter.')).toBeInTheDocument();
    expect(getPage).toHaveBeenLastCalledWith('rooms', 'home-1', { limit: 25, search: '', filters: { floor: 'none' } }, expect.anything());
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it('debounces search into a first-page query', async () => {
    jest.useFakeTimers();
    try {
      getPage.mockResolvedValue({ success: true, data: page([room(1)]) });
      render(<AskRecord />);
      await act(async () => { await Promise.resolve(); });
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search rooms' }), { target: { value: 'kit' } });
      expect(getPage).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(350); await Promise.resolve(); });
      expect(getPage).toHaveBeenLastCalledWith('rooms', 'home-1', { limit: 25, search: 'kit', filters: {} }, expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps delivered rooms and offers a retry when a continuation fails, and shows a none-recorded state', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([room(1)], { total: 2, nextCursor: 'c1', truncated: true }) });
    render(<AskRecord />);
    await screen.findByText('Room 1');
    getPage.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Show more (1 remaining)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load more');
    expect(screen.getByText('Room 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more (1 remaining)' })).toBeEnabled();
  });

  it('shows a retryable error rather than an empty list when the first page fails', async () => {
    getPage.mockRejectedValueOnce(new Error('network'));
    render(<AskRecord />);
    expect(await screen.findByText('Rooms could not be loaded.')).toBeInTheDocument();
    getPage.mockResolvedValueOnce({ success: true, data: page([], { total: 0 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No rooms are recorded yet.')).toBeInTheDocument();
  });
});
