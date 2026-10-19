/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordExportReview, AskRecordExportReviewSection } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1&export=review') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: {
  getAskRecordIndex: jest.fn(), getAskRecordSectionPage: jest.fn(), getAskRecordExportReview: jest.fn(),
  createHomeReportExport: jest.fn(), listHomeReportExports: jest.fn(), getHomeReportExportDownloadUrl: jest.fn(),
} }));

const getReview = api.getAskRecordExportReview as jest.Mock;
const createExport = api.createHomeReportExport as jest.Mock;
const listExports = api.listHomeReportExports as jest.Mock;
const downloadUrl = api.getHomeReportExportDownloadUrl as jest.Mock;

const included = (id: string, label: string, overrides: Partial<AskRecordExportReviewSection> = {}): AskRecordExportReviewSection => ({
  id, label, state: 'INCLUDED', applicability: 'APPLICABLE', packPath: 'coverage.insurancePolicies', reason: null, note: null,
  ownerFields: ['providerName', 'policyNumber', 'premium'], sharedFields: ['providerName'], withheldFromShared: ['policyNumber', 'premium'], ...overrides,
});
const excluded = (id: string, label: string, reason: string, overrides: Partial<AskRecordExportReviewSection> = {}): AskRecordExportReviewSection => ({
  id, label, state: 'EXCLUDED', applicability: 'APPLICABLE', packPath: null, reason, note: null, ownerFields: [], sharedFields: [], withheldFromShared: [], ...overrides,
});
const review = (overrides: Partial<AskRecordExportReview> = {}): AskRecordExportReview => ({
  contractVersion: 'ask-record-export-review-v1', propertyId: 'home-1', generatedAt: '2026-10-19T12:00:00.000Z', property: { name: 'Maple House', address: '1 Main St', city: 'Austin', state: 'TX' },
  accessRole: 'OWNER', operatingMode: 'OWNING', create: { allowed: true, requiredRole: 'CONTRIBUTOR', reason: null },
  pack: { format: 'PDF', sectionsSelectable: false, downloadableBy: 'CREATOR', recordExpiresInDays: 30 }, sharing: { requiredRole: 'CONTRIBUTOR', defaultExpiryDays: 14, copy: 'REDACTED' },
  sections: [included('coverage', 'Coverage and policies', { note: 'Insurance policies only.' }), excluded('timeline', 'Home timeline', 'The pack has no timeline section.'), excluded('buyer-records', 'Buyer records', 'The pack has no buyer records section.', { applicability: 'NOT_APPLICABLE' })],
  included: ['coverage'], excluded: ['timeline', 'buyer-records'], ...overrides,
});

describe('Record export review', () => {
  beforeEach(() => { getReview.mockReset(); createExport.mockReset(); listExports.mockReset(); downloadUrl.mockReset(); });

  it('discloses inclusions, exclusions, sensitive fields, expiry, and who can download before anything is created', async () => {
    getReview.mockResolvedValue({ success: true, data: review() });
    render(<AskRecord />);

    expect(await screen.findByRole('heading', { name: 'Export home record' })).toBeInTheDocument();
    expect(getReview).toHaveBeenCalledWith('home-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const facts = document.querySelector('[data-export-facts]') as HTMLElement;
    expect(within(facts).getByText('Maple House')).toBeInTheDocument();
    expect(within(facts).getByText(/you cannot choose a subset/)).toBeInTheDocument();
    expect(within(facts).getByText(/Only you, the person who creates it. It is kept for 30 days./)).toBeInTheDocument();
    expect(within(facts).getByText(/redacted copy only, never this full export, and lasts 14 days by default/)).toBeInTheDocument();
    const coverage = document.querySelector('[data-export-section="coverage"]') as HTMLElement;
    expect(within(coverage).getByText('Your copy has: provider name, policy number, premium.')).toBeInTheDocument();
    expect(within(coverage).getByText('Only in your copy, never in a shared link: policy number, premium.')).toBeInTheDocument();
    expect(within(coverage).getByText('Insurance policies only.')).toBeInTheDocument();
    expect(within(document.querySelector('[data-export-section="timeline"]') as HTMLElement).getByText('The pack has no timeline section.')).toBeInTheDocument();
    expect(within(document.querySelector('[data-export-section="buyer-records"]') as HTMLElement).getByText(/Not applicable at your home’s stage/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Included (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not included (2)' })).toBeInTheDocument();
    expect(createExport).not.toHaveBeenCalled();
  });

  it('creates nothing until the sensitive-fields acknowledgement is checked, then shows a receipt with what was and was not included', async () => {
    getReview.mockResolvedValue({ success: true, data: review() });
    createExport.mockResolvedValue({ success: true, data: { exportId: 'exp-1', status: 'PENDING' } });
    render(<AskRecord />);

    const button = await screen.findByRole('button', { name: 'Create export' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(createExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);

    await waitFor(() => expect(createExport).toHaveBeenCalledWith('home-1'));
    const receipt = await screen.findByText('Export requested');
    const box = receipt.closest('[data-export-receipt]') as HTMLElement;
    expect(within(box).getByText(/Waiting to be generated/)).toBeInTheDocument();
    expect(within(box).getByText('Included: Coverage and policies.')).toBeInTheDocument();
    expect(within(box).getByText('Not included: Home timeline, Buyer records.')).toBeInTheDocument();
    expect(within(box).getByText(/Kept for 30 days. No share link has been created./)).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('checks status, offers the download only when ready, and reports a failure', async () => {
    getReview.mockResolvedValue({ success: true, data: review() });
    createExport.mockResolvedValue({ success: true, data: { exportId: 'exp-1', status: 'PENDING' } });
    listExports.mockResolvedValueOnce({ success: true, data: { exports: [{ id: 'exp-1', status: 'READY', requestedAt: '2026-10-19T12:01:00.000Z' }] } });
    downloadUrl.mockResolvedValue({ success: true, data: { url: 'https://files.example/pack.pdf' } });
    const assign = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create export' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check status' }));
    const download = await screen.findByRole('button', { name: 'Download' });
    expect(screen.getByText(/Ready to download/)).toBeInTheDocument();
    fireEvent.click(download);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://files.example/pack.pdf'));

    listExports.mockResolvedValueOnce({ success: true, data: { exports: [{ id: 'exp-1', status: 'FAILED', requestedAt: '2026-10-19T12:01:00.000Z', errorMessage: 'Renderer unavailable' }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Renderer unavailable');
  });

  it('a viewer sees the same contents but cannot create, and a refused create shows the reason', async () => {
    getReview.mockResolvedValueOnce({ success: true, data: review({ accessRole: 'VIEWER', create: { allowed: false, requiredRole: 'CONTRIBUTOR', reason: 'Creating an export needs the CONTRIBUTOR role for this home.' } }) });
    const first = render(<AskRecord />);
    expect(await screen.findByText('Creating an export needs the CONTRIBUTOR role for this home.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create export' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Included (1)' })).toBeInTheDocument();
    first.unmount();

    getReview.mockResolvedValueOnce({ success: true, data: review() });
    createExport.mockRejectedValueOnce(new Error('A report export is already in progress for this property.'));
    render(<AskRecord />);
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in progress');
    expect(screen.queryByText('Export requested')).toBeNull();
  });

  it('shows a retryable error when the review cannot be loaded', async () => {
    getReview.mockRejectedValueOnce(new Error('network'));
    render(<AskRecord />);
    expect(await screen.findByText('The export review could not be loaded.')).toBeInTheDocument();
    getReview.mockResolvedValueOnce({ success: true, data: review() });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Included (1)' })).toBeInTheDocument();
  });
});
