/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordInventoryRow } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1&section=inventory') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;

const item = (n: number, overrides: Partial<AskRecordInventoryRow> = {}): AskRecordInventoryRow => ({
  id: `item-${n}`, name: `Item ${n}`, category: 'Appliance', condition: 'Good', roomName: 'Kitchen', brandModel: 'Acme M1', verified: true, missingDetails: [], endOfLifeBy: null,
  updatedAt: '2026-10-05T12:00:00.000Z', askQuestion: `Show inventory item "Item ${n}"`, ...overrides,
});
const FILTERS = [
  { key: 'status', label: 'Status', options: [{ value: 'incomplete', label: 'Missing details' }, { value: 'lifecycle', label: 'Nearing end of life' }] },
  { key: 'category', label: 'Category', options: [{ value: 'APPLIANCE', label: 'Appliance' }, { value: 'HVAC', label: 'Hvac' }] },
];
const page = (rows: AskRecordInventoryRow[], overrides: Partial<AskRecordCollectionPage<AskRecordInventoryRow>> = {}): AskRecordCollectionPage<AskRecordInventoryRow> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId: 'inventory', generatedAt: '2026-10-19T12:00:00.000Z',
  total: rows.length, delivered: rows.length, nextCursor: null, truncated: false, sort: { key: 'updatedAt', label: 'Recently updated' },
  query: { search: null, filters: {} }, filterOptions: FILTERS, rows, ...overrides,
});

describe('AskRecord inventory collection', () => {
  beforeEach(() => getPage.mockReset());

  it('shows each item with its category, room, status notes, and the declared Ask action', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([
      item(1, { missingDetails: ['Model', 'Documents'], verified: false, endOfLifeBy: '2027-03-01T12:00:00.000Z' }),
      item(2, { condition: null, roomName: null, brandModel: null }),
    ], { total: 40, delivered: 2, nextCursor: 'c1', truncated: true }) });
    render(<AskRecord />);

    expect(await screen.findByText('Showing 2 of 40 · sorted by recently updated')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith('inventory', 'home-1', { limit: 25, search: '', filters: {} }, expect.anything());
    expect(screen.getByRole('heading', { name: 'Systems and inventory' })).toBeInTheDocument();
    const first = document.querySelector('[data-record-row="item-1"]') as HTMLElement;
    expect(within(first).getByText('Appliance · Kitchen · Acme M1 · Good · Updated Oct 5, 2026')).toBeInTheDocument();
    expect(within(first).getByText('Not verified · Nearing end of life by Mar 1, 2027 · Missing: model, documents')).toBeInTheDocument();
    const second = document.querySelector('[data-record-row="item-2"]') as HTMLElement;
    expect(within(second).getByText('Appliance · Updated Oct 5, 2026')).toBeInTheDocument();
    const url = new URL(within(first).getByRole('link', { name: 'Open Item 1' }).getAttribute('href') as string, 'https://x.test');
    expect(url.searchParams.get('question')).toBe('Show inventory item "Item 1"');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record?section=inventory');
    expect(screen.getByRole('button', { name: 'Show more (38 remaining)' })).toBeInTheDocument();
  });

  it('sends the status and category filters together and restarts from the first page', async () => {
    getPage.mockResolvedValue({ success: true, data: page([item(1)]) });
    render(<AskRecord />);
    await screen.findByText('Item 1');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'incomplete' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('inventory', 'home-1', { limit: 25, search: '', filters: { status: 'incomplete' } }, expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'HVAC' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('inventory', 'home-1', { limit: 25, search: '', filters: { status: 'incomplete', category: 'HVAC' } }, expect.anything()));
    expect(screen.getByRole('option', { name: 'Any status' })).toBeInTheDocument();
  });

  it('says plainly when no inventory is recorded', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([], { total: 0 }) });
    render(<AskRecord />);
    expect(await screen.findByText('No inventory items are recorded yet.')).toBeInTheDocument();
    expect(screen.getByText(/None recorded/)).toBeInTheDocument();
  });
});
