/** @jest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordCollectionPage } from '@/features/ask/types';

let mockSection = 'permits';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(`propertyId=home-1&section=${mockSection}`) }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn() } }));

const getPage = api.getAskRecordSectionPage as jest.Mock;
const page = <Row,>(sectionId: string, rows: Row[], overrides: Partial<AskRecordCollectionPage<Row>> = {}): AskRecordCollectionPage<Row> => ({
  contractVersion: 'ask-record-collection-v1', propertyId: 'home-1', sectionId, generatedAt: '2026-10-19T12:00:00.000Z', total: rows.length, delivered: rows.length,
  nextCursor: null, truncated: false, notice: null, sort: { key: 'k', label: 'Active first' }, query: { search: null, filters: {} }, filterOptions: [], rows, ...overrides,
});

describe('AskRecord permits, projects, and incidents/claims', () => {
  beforeEach(() => getPage.mockReset());

  it('permits show the official status, a reported status only when unconfirmed, and open inspections; rows carry no action', async () => {
    mockSection = 'permits';
    const base = { description: null, reportedStatusLabel: null, closed: false, hasOpenInspections: false, issueDate: null, finaledDate: null, expirationDate: null, contractorName: null, verified: false, askQuestion: null } as const;
    getPage.mockResolvedValueOnce({ success: true, data: page('permits', [
      { ...base, id: 'a', title: 'Building permit P-1', officialStatus: 'UNKNOWN', officialStatusLabel: 'Official status not confirmed', reportedStatusLabel: 'Issued', hasOpenInspections: true, issueDate: '2026-03-01T12:00:00.000Z' },
      { ...base, id: 'b', title: 'Roofing permit', officialStatus: 'FINALED', officialStatusLabel: 'Finaled (closed out)', closed: true, finaledDate: '2026-04-01T12:00:00.000Z', contractorName: 'RoofCo', verified: true, description: 'roof replacement' },
    ], { notice: 'This lists the first 500 permit records. More are recorded but cannot be listed here yet.' }) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Permits' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('first 500 permit records');
    const a = document.querySelector('[data-record-row="a"]') as HTMLElement;
    expect(within(a).getByText('Official: Official status not confirmed · Reported by the household: Issued · Issued Mar 1, 2026')).toBeInTheDocument();
    expect(within(a).getByText('Has open inspections')).toBeInTheDocument();
    const b = document.querySelector('[data-record-row="b"]') as HTMLElement;
    expect(within(b).getByText('Official: Finaled (closed out) · Finaled Apr 1, 2026 · Contractor: RoofCo · Verified record')).toBeInTheDocument();
    expect(within(b).queryByText(/Reported by/)).toBeNull();
    expect(document.querySelectorAll('[data-record-row] a')).toHaveLength(0);
  });

  it('projects show recorded amounts, say when a contract amount or provider is missing, and flag disputes and issues', async () => {
    mockSection = 'projects-renovations';
    const base = { typeLabel: 'Kitchen Remodel', expectedEndDate: null, warrantyExpiresAt: null, askQuestion: null, milestoneCount: 3, issueCount: 0 } as const;
    getPage.mockResolvedValueOnce({ success: true, data: page('projects-renovations', [
      { ...base, id: 'p1', name: 'Kitchen', status: 'IN_PROGRESS', statusLabel: 'In Progress', providerLabel: 'BuildCo', contractLabel: '$10,000', paidLabel: '$2,500', remainingLabel: '$7,500', expectedEndDate: '2027-01-01T12:00:00.000Z', issueCount: 2 },
      { ...base, id: 'p2', name: 'Floors', typeLabel: 'Flooring', status: 'COMPLETED', statusLabel: 'Completed', providerLabel: null, contractLabel: null, paidLabel: '$50', remainingLabel: null, warrantyExpiresAt: '2028-05-01T12:00:00.000Z', milestoneCount: 1 },
    ]) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Projects and renovations' })).toBeInTheDocument();
    expect(screen.getByText('Kitchen Remodel · BuildCo · Contract $10,000 · Paid $2,500 · Remaining $7,500 · Due Jan 1, 2027')).toBeInTheDocument();
    expect(screen.getByText('In Progress · 3 milestones · 2 issues')).toBeInTheDocument();
    expect(screen.getByText('Flooring · Provider not recorded · Contract amount not set · Paid $50 · Warranty expires May 1, 2028')).toBeInTheDocument();
    expect(screen.getByText('Completed · 1 milestone')).toBeInTheDocument();
  });

  it('incidents and claims label the kind, state, dates, and provider', async () => {
    mockSection = 'incidents-claims';
    getPage.mockResolvedValueOnce({ success: true, data: page('incidents-claims', [
      { id: 'incident:1', recordId: '1', kind: 'INCIDENT' as const, title: 'Water leak', summary: 'Pipe burst', statusLabel: 'resolved', open: false, detailLabel: 'high severity', providerName: null, openedAt: '2026-05-01T12:00:00.000Z', closedAt: '2026-05-10T12:00:00.000Z', askQuestion: null },
      { id: 'claim:1', recordId: '1', kind: 'CLAIM' as const, title: 'Roof claim', summary: null, statusLabel: 'in progress', open: true, detailLabel: 'property damage', providerName: 'Acme Mutual', openedAt: '2026-04-01T12:00:00.000Z', closedAt: null, askQuestion: null },
    ], { filterOptions: [{ key: 'kind', label: 'Kind', options: [{ value: 'INCIDENT', label: 'Incidents' }, { value: 'CLAIM', label: 'Claims' }] }] }) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Incidents and claims' })).toBeInTheDocument();
    expect(screen.getByText('Incident · Resolved · high severity · Opened May 1, 2026 · Closed May 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('Pipe burst')).toBeInTheDocument();
    expect(screen.getByText('Claim · In progress · property damage · Acme Mutual · Opened Apr 1, 2026')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kind' })).toBeInTheDocument();
  });
});
