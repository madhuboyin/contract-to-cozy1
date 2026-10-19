/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage, AskRecordDetail, AskRecordWarrantyRow } from '@/features/ask/types';

let section = 'warranties';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(`propertyId=home-1&section=${section}`) }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn(), getAskRecordDetail: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;
const getDetail = api.getAskRecordDetail as jest.Mock;

const warranty: AskRecordWarrantyRow = {
  id: 'war-1', providerName: 'Rheem Care', category: 'HVAC', categoryLabel: 'Hvac', itemName: null, coverageSummary: null, status: 'ACTIVE', statusLabel: 'Active', daysRemaining: 200,
  startDate: '2025-10-01T12:00:00.000Z', expiryDate: '2027-05-01T12:00:00.000Z', hasDocuments: false, updatedAt: '2026-10-01T12:00:00.000Z', askQuestion: 'Show me my HVAC warranties.',
};
const page = (recordDetail: AskRecordCollectionPage<AskRecordWarrantyRow>['recordDetail'], rows = [warranty]): AskRecordCollectionPage<AskRecordWarrantyRow> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId: section, generatedAt: '2026-10-19T12:00:00.000Z', total: rows.length, delivered: rows.length, nextCursor: null, truncated: false,
  sort: { key: 'status', label: 'Expiring first' }, query: { search: null, filters: {} }, filterOptions: [], rows, recordDetail,
});
const facet = (state: 'AVAILABLE' | 'NOT_RECORDED' | 'UNAVAILABLE', value: string | null, reason: string | null = null, at: string | null = null) => ({ state, value, at, reason });
const detail = (overrides: Partial<AskRecordDetail> = {}): AskRecordDetail => ({
  contractVersion: 'ask-record-detail-v1', propertyId: 'home-1', sectionId: 'warranties', recordId: 'war-1', generatedAt: '2026-10-19T12:00:00.000Z', title: 'Rheem Care warranty',
  facts: [{ label: 'Status', value: 'Active' }, { label: 'Policy number', value: 'Recorded (shown in the Ask answer)' }],
  provenance: {
    source: facet('NOT_RECORDED', null, 'The warranty record does not say how it was added.'),
    observed: facet('AVAILABLE', 'Last updated', null, '2026-10-01T12:00:00.000Z'),
    verification: facet('UNAVAILABLE', null, 'Warranties have no verification state.'),
    visibility: facet('AVAILABLE', 'Every household member can see warranties.'),
    related: { state: 'AVAILABLE', records: [{ label: 'Furnace', kindLabel: 'Inventory item', broken: false }], reason: null },
    history: { state: 'UNAVAILABLE', entries: [], reason: 'No canonical change-history reader is connected for warranties, so no history is shown and none is inferred.' },
  },
  corrections: [{ id: 'warranty-correct', label: 'Correct a detail', operationId: 'WARRANTY_CORRECT', requiredRole: 'CONTRIBUTOR', state: 'AVAILABLE', reason: null, launch: { message: 'Correct a detail of this warranty.', operationId: 'WARRANTY_CORRECT', entityType: 'WARRANTY', entityId: 'war-1', actionId: null }, note: 'Ask will ask which detail to change.' }],
  ...overrides,
});

describe('AskRecord per-record detail (FR-REC-004/005)', () => {
  beforeEach(() => { section = 'warranties'; getPage.mockReset(); getDetail.mockReset(); });

  it('reads nothing extra until Details is opened, then shows facts, provenance with reasons, history unavailable and the correction route', async () => {
    getPage.mockResolvedValue({ success: true, data: page({ state: 'CONNECTED' }) });
    getDetail.mockResolvedValue({ success: true, data: detail() });
    render(<AskRecord />);
    const toggle = await screen.findByRole('button', { name: /Details and history/ });
    expect(getDetail).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const panel = await waitFor(() => { const el = document.querySelector('[data-record-detail-panel="war-1"]') as HTMLElement; expect(el).toBeTruthy(); return el; });
    expect(getDetail).toHaveBeenCalledWith('warranties', 'home-1', 'war-1', expect.anything());
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByText('Recorded (shown in the Ask answer)')).toBeInTheDocument();
    expect(panel.querySelector('[data-provenance="source"]')).toHaveTextContent('Not recorded — The warranty record does not say how it was added.');
    expect(panel.querySelector('[data-provenance="observed"]')).toHaveTextContent('Last updated · Oct 1, 2026');
    expect(panel.querySelector('[data-provenance="verification"]')).toHaveTextContent('Not available — Warranties have no verification state.');
    expect(panel.querySelector('[data-provenance="related"]')).toHaveTextContent('Inventory item: Furnace');
    expect(panel.querySelector('[data-provenance="history"]')).toHaveAttribute('data-provenance-state', 'unavailable');
    expect(panel.querySelector('[data-provenance="history"]')).toHaveTextContent('Not available — No canonical change-history reader');
    const link = within(panel).getByRole('link', { name: 'Correct a detail' });
    const url = new URL(link.getAttribute('href') as string, 'https://x.test');
    expect(url.searchParams.get('question')).toBe('Correct a detail of this warranty.');
    expect([url.searchParams.get('launchOperationId'), url.searchParams.get('launchEntityType'), url.searchParams.get('launchEntityId')]).toEqual(['WARRANTY_CORRECT', 'WARRANTY', 'war-1']);
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record?section=warranties');
    expect(within(panel).getByText('Ask will ask which detail to change.')).toBeInTheDocument();
  });

  it('states a correction that cannot be used and why, with no link', async () => {
    getPage.mockResolvedValue({ success: true, data: page({ state: 'CONNECTED' }) });
    getDetail.mockResolvedValue({ success: true, data: detail({ corrections: [{ id: 'warranty-correct', label: 'Correct a detail', operationId: 'WARRANTY_CORRECT', requiredRole: 'CONTRIBUTOR', state: 'ROLE_REQUIRED', reason: 'Your household role cannot change this; it needs contributor access.', launch: null, note: null }] }) });
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('button', { name: /Details and history/ }));
    const route = await waitFor(() => { const el = document.querySelector('[data-correction="warranty-correct"]') as HTMLElement; expect(el).toBeTruthy(); return el; });
    expect(route).toHaveAttribute('data-correction-state', 'role_required');
    expect(route).toHaveTextContent('Not available — Your household role cannot change this; it needs contributor access.');
    expect(within(route).queryByRole('link')).toBeNull();
  });

  it('says a record is no longer available instead of showing stale detail', async () => {
    getPage.mockResolvedValue({ success: true, data: page({ state: 'CONNECTED' }) });
    getDetail.mockRejectedValue(Object.assign(new Error('gone'), { code: 'ASK_RECORD_NOT_FOUND' }));
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('button', { name: /Details and history/ }));
    expect(await screen.findByText('This record is no longer available to you.')).toBeInTheDocument();
  });

  it('offers a retry on a failed read', async () => {
    getPage.mockResolvedValue({ success: true, data: page({ state: 'CONNECTED' }) });
    getDetail.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ success: true, data: detail() });
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('button', { name: /Details and history/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(document.querySelector('[data-record-detail-panel="war-1"]')).toBeTruthy());
  });

  it('opens detail for a timeline row and for a command-less record whose route names no Ask command', async () => {
    section = 'timeline';
    const event = { id: 'ev-1', title: 'Roof replaced', summary: null, type: 'REPAIR', typeLabel: 'Repair', occurredAt: '2025-06-01T00:00:00.000Z', datePrecision: 'MONTH', dateRangeStart: null, dateRangeEnd: null, verification: 'UNVERIFIED', verificationLabel: 'Unverified', providerName: null, isPrivate: false, askQuestion: null };
    getPage.mockResolvedValue({ success: true, data: { ...page({ state: 'CONNECTED' }), sectionId: 'timeline', rows: [event], total: 1, delivered: 1 } });
    getDetail.mockResolvedValue({ success: true, data: detail({ sectionId: 'timeline', recordId: 'ev-1', corrections: [{ id: 'incident-change', label: 'Change this incident', operationId: null, requiredRole: null, state: 'UNAVAILABLE', reason: 'Incidents are raised and resolved by the system; no Ask command changes an incident.', launch: null, note: null }] }) });
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details and history for Roof replaced' }));
    expect(getDetail).toHaveBeenCalledWith('timeline', 'home-1', 'ev-1', expect.anything());
    const route = await waitFor(() => { const el = document.querySelector('[data-correction="incident-change"]') as HTMLElement; expect(el).toBeTruthy(); return el; });
    expect(route).toHaveTextContent('Not available — Incidents are raised and resolved by the system');
  });

  it('a section with no detail reader says so once and shows no Details control', async () => {
    section = 'permits';
    getPage.mockResolvedValue({ success: true, data: { ...page({ state: 'UNAVAILABLE', reason: 'No canonical per-record detail reader is connected for permits yet, so a row shows its listed facts only.' }), sectionId: 'permits', rows: [{ id: 'permit-1' }], total: 1, delivered: 1 } });
    render(<AskRecord />);
    expect(await screen.findByText(/Per-record details are not available for this section\. No canonical per-record detail reader is connected for permits yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Details and history/ })).toBeNull();
  });
});
