/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordWarrantyRow } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1&section=warranties') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;

const warranty = (n: number, overrides: Partial<AskRecordWarrantyRow> = {}): AskRecordWarrantyRow => ({
  id: `war-${n}`, providerName: `Provider ${n}`, category: 'HVAC', categoryLabel: 'Hvac', itemName: null, coverageSummary: null, status: 'ACTIVE', statusLabel: 'Active', daysRemaining: 200,
  startDate: '2025-10-01T12:00:00.000Z', expiryDate: '2027-05-01T12:00:00.000Z', hasDocuments: false, updatedAt: '2026-10-01T12:00:00.000Z', askQuestion: 'Show me my HVAC warranties.', ...overrides,
});
const FILTERS = [
  { key: 'status', label: 'Status', options: [{ value: 'EXPIRING', label: 'Expires within 60 days' }, { value: 'ACTIVE', label: 'Active' }] },
  { key: 'category', label: 'Category', options: [{ value: 'HVAC', label: 'Hvac' }, { value: 'PLUMBING', label: 'Plumbing' }] },
];
const page = (rows: AskRecordWarrantyRow[], overrides: Partial<AskRecordCollectionPage<AskRecordWarrantyRow>> = {}): AskRecordCollectionPage<AskRecordWarrantyRow> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId: 'warranties', generatedAt: '2026-10-19T12:00:00.000Z',
  total: rows.length, delivered: rows.length, nextCursor: null, truncated: false, sort: { key: 'status', label: 'Expiring first, then by expiry date' },
  query: { search: null, filters: {} }, filterOptions: FILTERS, rows, ...overrides,
});

describe('AskRecord warranties collection', () => {
  beforeEach(() => getPage.mockReset());

  it('shows status, expiry, linked item, and the category-level Ask action', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([
      warranty(1, { status: 'EXPIRING', statusLabel: 'Expires within 60 days', daysRemaining: 12, expiryDate: '2026-10-31T12:00:00.000Z', itemName: 'Furnace', hasDocuments: true, coverageSummary: 'Parts and labor' }),
      warranty(2, { status: 'EXPIRED', statusLabel: 'Expired', daysRemaining: -30, expiryDate: '2026-09-19T12:00:00.000Z' }),
      warranty(3, { status: 'NEEDS_REVIEW', statusLabel: 'Dates need review', daysRemaining: null }),
      warranty(4, { status: 'STARTS_LATER', statusLabel: 'Starts later', daysRemaining: null, startDate: '2026-12-01T12:00:00.000Z' }),
    ], { total: 30, delivered: 4, nextCursor: 'c1', truncated: true }) });
    render(<AskRecord />);

    expect(await screen.findByText('Showing 4 of 30 · sorted by expiring first, then by expiry date')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith('warranties', 'home-1', { limit: 25, search: '', filters: {} }, expect.anything());
    const first = document.querySelector('[data-record-row="war-1"]') as HTMLElement;
    expect(within(first).getByText('Hvac · Furnace · Has documents')).toBeInTheDocument();
    expect(within(first).getByText('Expires within 60 days: Expires Oct 31, 2026 · 12 days')).toBeInTheDocument();
    expect(within(first).getByText('Parts and labor')).toBeInTheDocument();
    const url = new URL(within(first).getByRole('link', { name: 'Open warranty from Provider 1' }).getAttribute('href') as string, 'https://x.test');
    expect(url.searchParams.get('question')).toBe('Show me my HVAC warranties.');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record?section=warranties');
    expect(within(document.querySelector('[data-record-row="war-2"]') as HTMLElement).getByText('Expired: Expired Sep 19, 2026')).toBeInTheDocument();
    expect(within(document.querySelector('[data-record-row="war-3"]') as HTMLElement).getByText('Dates need review')).toBeInTheDocument();
    expect(within(document.querySelector('[data-record-row="war-4"]') as HTMLElement).getByText(/Starts later: Starts Dec 1, 2026 · expires May 1, 2027/)).toBeInTheDocument();
  });

  it('sends status and category filters and restarts from the first page', async () => {
    getPage.mockResolvedValue({ success: true, data: page([warranty(1)]) });
    render(<AskRecord />);
    await screen.findByText('Provider 1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'EXPIRING' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('warranties', 'home-1', { limit: 25, search: '', filters: { status: 'EXPIRING' } }, expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'PLUMBING' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('warranties', 'home-1', { limit: 25, search: '', filters: { status: 'EXPIRING', category: 'PLUMBING' } }, expect.anything()));
  });

  it('says plainly when no warranties are recorded', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([], { total: 0, filterOptions: [] }) });
    render(<AskRecord />);
    expect(await screen.findByText('No warranties are recorded yet.')).toBeInTheDocument();
  });
});
