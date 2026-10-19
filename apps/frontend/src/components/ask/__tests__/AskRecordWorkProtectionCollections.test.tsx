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

  it('coverage lists policies with status, dates, and verification, and never a policy number or amount', async () => {
    mockSection = 'coverage';
    getPage.mockResolvedValueOnce({ success: true, data: page('coverage', [
      { id: 'pol1', carrierName: 'Acme Mutual', coverageType: 'Homeowner', status: 'ACTIVE' as const, statusLabel: 'Active', startDate: '2026-01-01T12:00:00.000Z', expiryDate: '2027-01-01T12:00:00.000Z', verified: true, lastVerifiedAt: '2026-02-01T12:00:00.000Z', askQuestion: null as null },
      { id: 'pol2', carrierName: 'Old Co', coverageType: null, status: 'NEEDS_REVIEW' as const, statusLabel: 'Dates need review', startDate: null, expiryDate: null, verified: false, lastVerifiedAt: null, askQuestion: null as null },
    ]) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Coverage and policies' })).toBeInTheDocument();
    expect(screen.getByText('Homeowner · Active until Jan 1, 2027 · Verified Feb 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Dates need review · Not verified')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-record-row] a')).toHaveLength(0);
  });

  it('financing scenarios, buyer tasks, and sale checklist items state their facts, and the no-plan and persisted-items notices show', async () => {
    mockSection = 'financing-ownership';
    getPage.mockResolvedValueOnce({ success: true, data: page('financing-ownership', [
      { id: 'f1', title: 'Roof loan', projectCostLabel: '$40,000', status: 'DRAFT', statusLabel: 'Draft', selectedOptionLabel: 'Home Equity Loan', entryPointLabel: 'Direct', createdAt: '2026-05-01T12:00:00.000Z', askQuestion: null as null },
      { id: 'f2', title: 'Kitchen', projectCostLabel: '$9,000', status: 'SAVED', statusLabel: 'Saved', selectedOptionLabel: null, entryPointLabel: null, createdAt: '2026-04-01T12:00:00.000Z', askQuestion: null as null },
    ]) });
    const first = render(<AskRecord />);
    expect(await screen.findByRole('heading', { name: 'Financing and ownership' })).toBeInTheDocument();
    expect(screen.getByText('$40,000 · Draft · Chosen: Home Equity Loan · Direct · Created May 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('$9,000 · Saved · No option chosen · Created Apr 1, 2026')).toBeInTheDocument();
    first.unmount();

    mockSection = 'buyer-records';
    getPage.mockResolvedValueOnce({ success: true, data: page('buyer-records', [
      { id: 'b1', title: 'Order appraisal', description: 'Lender step', status: 'BLOCKED', statusLabel: 'Blocked', phase: 'DUE_DILIGENCE', phaseLabel: 'Due Diligence', required: true, blocking: true, dueAt: '2026-12-01T12:00:00.000Z', completedAt: null, askQuestion: null as null },
    ]) });
    const second = render(<AskRecord />);
    expect(await screen.findByText('Due Diligence · Blocked · Required · Due Dec 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Blocking the plan')).toBeInTheDocument();
    second.unmount();

    mockSection = 'seller-records';
    getPage.mockResolvedValueOnce({ success: true, data: page('seller-records', [
      { id: 's1', title: 'Fix railing', detail: 'Rail is loose', category: 'SAFETY_STRUCTURAL', categoryLabel: 'Safety Structural', requirementLabel: 'Material Blocker', status: 'OPEN', statusLabel: 'Open', dueAt: null, costRangeLabel: '$500 to $1,200', askQuestion: null as null },
    ], { notice: 'These are the sale checklist items as last refreshed. Open the seller checklist in Ask to refresh them from your latest records.' }) });
    render(<AskRecord />);
    expect(await screen.findByText('Safety Structural · Material Blocker · Open · Estimated $500 to $1,200')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('as last refreshed');
  });

  it('household access shows names, roles, the primary owner, and who is reading, with nothing administrative', async () => {
    mockSection = 'household-access';
    getPage.mockResolvedValueOnce({ success: true, data: page('household-access', [
      { id: 'm1', name: 'Sarah Chen', role: 'OWNER' as const, roleLabel: 'Owner', isPrimaryOwner: true, isYou: true, joinedAt: '2025-01-10T12:00:00.000Z', askQuestion: null as null },
      { id: 'm2', name: 'Nana', role: 'VIEWER' as const, roleLabel: 'Viewer', isPrimaryOwner: false, isYou: false, joinedAt: '2026-03-02T12:00:00.000Z', askQuestion: null as null },
    ]) });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Household access' })).toBeInTheDocument();
    expect(screen.getByText('Owner · Primary owner · Joined Jan 10, 2025')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Viewer · Joined Mar 2, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove|invite|change role/i })).toBeNull();
    expect(document.querySelectorAll('[data-record-row] a')).toHaveLength(0);
  });
});
