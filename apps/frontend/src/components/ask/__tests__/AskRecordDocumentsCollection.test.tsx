/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordDocumentRow } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1&section=documents') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;

const document_ = (n: number, overrides: Partial<AskRecordDocumentRow> = {}): AskRecordDocumentRow => ({
  id: `doc-${n}`, title: `Document ${n}`, kind: 'MANUAL', kindLabel: 'Manuals', verification: 'UNVERIFIED', needsReview: false, expiry: null, transitional: false,
  addedAt: '2026-10-05T12:00:00.000Z', updatedAt: '2026-10-05T12:00:00.000Z', askQuestion: 'Show me my manuals.', ...overrides,
});
const FILTERS = [
  { key: 'status', label: 'Status', options: [{ value: 'VERIFIED', label: 'Verified' }, { value: 'NEEDS_REVIEW', label: 'Needs review' }] },
  { key: 'kind', label: 'Type', options: [{ value: 'MANUAL', label: 'Manuals' }, { value: 'CONTRACT', label: 'Contracts' }] },
];
const page = (rows: AskRecordDocumentRow[], overrides: Partial<AskRecordCollectionPage<AskRecordDocumentRow>> = {}): AskRecordCollectionPage<AskRecordDocumentRow> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId: 'documents', generatedAt: '2026-10-19T12:00:00.000Z',
  total: rows.length, delivered: rows.length, nextCursor: null, truncated: false, sort: { key: 'addedAt', label: 'Recently added' },
  query: { search: null, filters: {} }, filterOptions: FILTERS, rows, ...overrides,
});

describe('AskRecord documents collection', () => {
  beforeEach(() => getPage.mockReset());

  it('shows kind, verification, review and expiry notes, and marks legacy-vault rows', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([
      document_(1, { kind: 'INSPECTION_REPORT', kindLabel: 'Inspection reports', verification: 'PENDING', needsReview: true, expiry: 'EXPIRING_SOON', askQuestion: 'Show me my inspection reports.' }),
      document_(2, { verification: null, transitional: true }),
    ], { total: 30, delivered: 2, nextCursor: 'c1', truncated: true }) });
    render(<AskRecord />);

    expect(await screen.findByText('Showing 2 of 30 · sorted by recently added')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith('documents', 'home-1', { limit: 25, search: '', filters: {} }, expect.anything());
    const first = document.querySelector('[data-record-row="doc-1"]') as HTMLElement;
    expect(within(first).getByText('Inspection reports · Pending verification · Added Oct 5, 2026')).toBeInTheDocument();
    expect(within(first).getByText('Extracted details need review · Expiring soon')).toBeInTheDocument();
    const url = new URL(within(first).getByRole('link', { name: 'Open inspection reports for Document 1' }).getAttribute('href') as string, 'https://x.test');
    expect(url.searchParams.get('question')).toBe('Show me my inspection reports.');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record?section=documents');
    const second = document.querySelector('[data-record-row="doc-2"]') as HTMLElement;
    expect(within(second).getByText('Manuals · Added Oct 5, 2026 · Legacy vault')).toBeInTheDocument();
    expect(within(second).queryByText(/Unverified|Verified/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show more (28 remaining)' })).toBeInTheDocument();
  });

  it('sends the status and type filters and restarts from the first page', async () => {
    getPage.mockResolvedValue({ success: true, data: page([document_(1)]) });
    render(<AskRecord />);
    await screen.findByText('Document 1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'NEEDS_REVIEW' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('documents', 'home-1', { limit: 25, search: '', filters: { status: 'NEEDS_REVIEW' } }, expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'CONTRACT' } });
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith('documents', 'home-1', { limit: 25, search: '', filters: { status: 'NEEDS_REVIEW', kind: 'CONTRACT' } }, expect.anything()));
  });

  it('says plainly when no documents are on file', async () => {
    getPage.mockResolvedValueOnce({ success: true, data: page([], { total: 0, filterOptions: [] }) });
    render(<AskRecord />);
    expect(await screen.findByText('No documents are on file yet.')).toBeInTheDocument();
  });
});
