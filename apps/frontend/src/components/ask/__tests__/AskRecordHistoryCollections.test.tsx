/** @jest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { timelineDateLabel } from '../record/RecordHistoryRows';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage } from '@/features/ask/types';

let mockSection = 'timeline';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(`propertyId=home-1&section=${mockSection}`) }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;

const page = <Row,>(sectionId: string, rows: Row[], overrides: Partial<AskRecordCollectionPage<Row>> = {}): AskRecordCollectionPage<Row> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId, generatedAt: '2026-10-19T12:00:00.000Z', total: rows.length, delivered: rows.length,
  nextCursor: null, truncated: false, notice: null, sort: { key: 'k', label: 'Most recent first' }, query: { search: null, filters: {} }, filterOptions: [], rows, ...overrides,
});

describe('AskRecord history collections', () => {
  beforeEach(() => getPage.mockReset());

  it('timeline shows recorded date precision, verification, privacy, and discloses a source limit; rows carry no action', async () => {
    mockSection = 'timeline';
    const base = { summary: null, type: 'REPAIR', typeLabel: 'Repair', dateRangeStart: null, dateRangeEnd: null, verification: 'UNVERIFIED', verificationLabel: 'Unverified', providerName: null, isPrivate: false, askQuestion: null } as const;
    getPage.mockResolvedValueOnce({ success: true, data: page('timeline', [
      { ...base, id: 'e1', title: 'Roof repair', occurredAt: '2026-03-01T12:00:00.000Z', datePrecision: 'MONTH' as const, verificationLabel: 'Evidence Verified', providerName: 'RoofCo', summary: 'Replaced flashing' },
      { ...base, id: 'e2', title: 'Bought house', occurredAt: '2019-06-15T12:00:00.000Z', datePrecision: 'YEAR' as const, isPrivate: true },
      { ...base, id: 'e3', title: 'Old work', occurredAt: '1970-01-01T00:00:00.000Z', datePrecision: 'UNKNOWN' as const },
    ], { notice: 'This shows the 200 most recent events. Older events are recorded but cannot be listed here yet.' }) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Home timeline' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('200 most recent events');
    expect(within(document.querySelector('[data-record-row="e1"]') as HTMLElement).getByText('Repair · March 2026 · Evidence Verified · RoofCo')).toBeInTheDocument();
    expect(within(document.querySelector('[data-record-row="e1"]') as HTMLElement).getByText('Replaced flashing')).toBeInTheDocument();
    expect(within(document.querySelector('[data-record-row="e2"]') as HTMLElement).getByText('Repair · 2019 · Unverified · Private')).toBeInTheDocument();
    expect(within(document.querySelector('[data-record-row="e3"]') as HTMLElement).getByText(/Date unknown/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-record-row] a')).toHaveLength(0);
  });

  it('formats a range and an exact date without inventing precision', () => {
    expect(timelineDateLabel({ occurredAt: '2020-01-01T12:00:00.000Z', datePrecision: 'RANGE', dateRangeStart: '2020-01-01T12:00:00.000Z', dateRangeEnd: '2020-03-01T12:00:00.000Z' })).toBe('Jan 1, 2020 – Mar 1, 2020');
    expect(timelineDateLabel({ occurredAt: '2020-01-01T12:00:00.000Z', datePrecision: 'RANGE', dateRangeStart: null, dateRangeEnd: null })).toBe('Around Jan 1, 2020');
    expect(timelineDateLabel({ occurredAt: '2020-05-09T12:00:00.000Z', datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null })).toBe('May 9, 2020');
  });

  it('maintenance history shows completion, cost, and says when the date was not recorded', async () => {
    mockSection = 'maintenance-history';
    getPage.mockResolvedValueOnce({ success: true, data: page('maintenance-history', [
      { id: 't1', title: 'Replace filter', scope: 'Furnace', completedOn: '2026-03-01T12:00:00.000Z', actualCost: '$125', source: 'action center', repeats: 'quarterly', priority: 'high', askQuestion: null as null },
      { id: 't2', title: 'Clean gutters', scope: 'Roof and exterior', completedOn: null, actualCost: null, source: 'user created', repeats: null, priority: 'medium', askQuestion: null as null },
    ], { filterOptions: [{ key: 'year', label: 'Year', options: [{ value: '2026', label: '2026' }, { value: 'undated', label: 'Date not recorded' }] }] }) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Maintenance history' })).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith('maintenance-history', 'home-1', { limit: 25, search: '', filters: {} }, expect.anything());
    expect(screen.getByText('Furnace · Completed Mar 1, 2026 · Actual cost $125 · high priority · action center · Repeats quarterly')).toBeInTheDocument();
    expect(screen.getByText('Roof and exterior · Completion date not recorded · medium priority · user created')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Year' })).toBeInTheDocument();
  });

  it('inspections show date, inspector, status, and finding counts with safety and major findings called out', async () => {
    mockSection = 'inspections';
    getPage.mockResolvedValueOnce({ success: true, data: page('inspections', [
      { id: 'r1', reportType: 'ROOF', reportTypeLabel: 'Roof inspection', inspectionDate: '2026-05-01T12:00:00.000Z', inspector: 'Sam Lee, RoofRight', status: 'CONFIRMED', statusLabel: 'Confirmed', totalFindings: 4, openFindings: 2, safetyFindings: 1, majorFindings: 1, askQuestion: null as null },
      { id: 'r2', reportType: 'GENERAL', reportTypeLabel: 'General inspection', inspectionDate: '2025-05-01T12:00:00.000Z', inspector: null, status: 'REVIEW_PENDING', statusLabel: 'Waiting for your review', totalFindings: 1, openFindings: 0, safetyFindings: 0, majorFindings: 0, askQuestion: null as null },
    ]) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Inspections' })).toBeInTheDocument();
    expect(screen.getByText('May 1, 2026 · Sam Lee, RoofRight · Confirmed')).toBeInTheDocument();
    expect(screen.getByText('4 findings · 2 open · 1 safety · 1 major')).toBeInTheDocument();
    expect(screen.getByText('May 1, 2025 · Waiting for your review')).toBeInTheDocument();
    expect(screen.getByText('1 finding')).toBeInTheDocument();
  });
});
