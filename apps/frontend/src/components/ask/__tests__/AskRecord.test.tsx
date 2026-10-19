/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskRecord } from '../record/AskRecord';
import { api } from '@/lib/api/client';
import type { AskRecordIndex, AskRecordIndexSection } from '@/features/ask/types';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1') }));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: { getAskRecordIndex: jest.fn() } }));

const getIndex = api.getAskRecordIndex as jest.Mock;

const section = (overrides: Partial<AskRecordIndexSection> & Pick<AskRecordIndexSection, 'id' | 'label'>): AskRecordIndexSection => ({
  scope: `${overrides.label} scope`, state: 'AVAILABLE', reasonCode: null, count: 2, countLabel: 'items', freshAsOf: null, freshnessSource: 'source', pagedCollection: false,
  primaryAction: { label: `Open ${overrides.label}`, question: `Show ${overrides.label}` },
  ...overrides,
});

const index = (sections: AskRecordIndexSection[], overrides: Partial<AskRecordIndex> = {}): AskRecordIndex => ({
  contractVersion: 'ask-record-index-v1', propertyId: 'home-1', generatedAt: '2026-10-19T12:00:00.000Z', accessRole: 'OWNER', operatingMode: 'OWNING',
  property: { name: 'Maple House', address: '1 Main St', city: 'Austin', state: 'TX' },
  completeness: { state: 'AVAILABLE', percent: 40, pendingDetails: 3 }, partial: false, sections, ...overrides,
});

describe('AskRecord', () => {
  beforeEach(() => getIndex.mockReset());

  it('lists every section with its state and a launch link that carries the Ask question', async () => {
    getIndex.mockResolvedValue({ success: true, data: index([
      section({ id: 'rooms', label: 'Rooms', count: 3, countLabel: 'rooms', freshAsOf: '2026-10-05T12:00:00.000Z' }),
      section({ id: 'warranties', label: 'Warranties', count: 0, countLabel: 'warranties' }),
      section({ id: 'permits', label: 'Permits', state: 'UNAVAILABLE', reasonCode: 'READER_NOT_CONNECTED', count: null, countLabel: null }),
      section({ id: 'buyer-records', label: 'Buyer records', state: 'NOT_APPLICABLE', reasonCode: 'LIFECYCLE_INAPPLICABLE', count: null, countLabel: null, primaryAction: null }),
      section({ id: 'inspections', label: 'Inspections', state: 'UNAVAILABLE', reasonCode: 'LIFECYCLE_CONTEXT_REQUIRED', count: null, countLabel: null, primaryAction: null }),
    ]) });
    render(<AskRecord />);

    expect(await screen.findByText('Maple House · Austin, TX')).toBeInTheDocument();
    expect(getIndex).toHaveBeenCalledWith('home-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const rows = Array.from(document.querySelectorAll('[data-record-section]'));
    expect(rows.map((row) => row.getAttribute('data-record-section'))).toEqual(['rooms', 'warranties', 'permits', 'buyer-records', 'inspections']);

    const rooms = rows[0] as HTMLElement;
    expect(within(rooms).getByText(/3 rooms · updated Oct 5, 2026/)).toBeInTheDocument();
    const link = within(rooms).getByRole('link', { name: 'Open Rooms: Rooms' });
    const url = new URL(link.getAttribute('href') as string, 'https://x.test');
    expect(url.pathname).toBe('/dashboard/ask');
    expect(url.searchParams.get('propertyId')).toBe('home-1');
    expect(url.searchParams.get('question')).toBe('Show Rooms');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/ask/record');

    expect(within(rows[1] as HTMLElement).getByText('None recorded')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText(/Count not shown here yet/)).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).getByText(/Does not apply at your home/)).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(rows[4] as HTMLElement).getByText(/Tell Cozy whether you own/)).toBeInTheDocument();
    expect(screen.getByText('40% of home details known')).toBeInTheDocument();
    expect(screen.getByText('3 details still to review')).toBeInTheDocument();
  });

  it('offers Browse all only for sections that serve a paged collection', async () => {
    getIndex.mockResolvedValue({ success: true, data: index([
      section({ id: 'rooms', label: 'Rooms', pagedCollection: true }),
      section({ id: 'inventory', label: 'Systems and inventory' }),
    ]) });
    render(<AskRecord />);
    const browse = await screen.findByRole('link', { name: 'Browse all Rooms' });
    expect(browse.getAttribute('href')).toBe('/dashboard/ask/record?propertyId=home-1&section=rooms');
    expect(screen.queryByRole('link', { name: /Browse all Systems/ })).toBeNull();
  });

  it('marks a partial read, keeps the other sections, and retries', async () => {
    getIndex.mockResolvedValueOnce({ success: true, data: index([
      section({ id: 'rooms', label: 'Rooms', state: 'UNAVAILABLE', reasonCode: 'PROVIDER_FAILED', count: null, countLabel: null }),
      section({ id: 'inventory', label: 'Systems and inventory', count: 5, countLabel: 'items' }),
    ], { partial: true }) });
    render(<AskRecord />);

    expect(await screen.findByText(/Some sections could not be read/)).toBeInTheDocument();
    expect(screen.getByText(/Temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByText('5 items')).toBeInTheDocument();

    getIndex.mockResolvedValueOnce({ success: true, data: index([section({ id: 'rooms', label: 'Rooms', count: 1, countLabel: 'room' })]) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/Some sections could not be read/)).toBeNull());
    expect(screen.getByText('1 room')).toBeInTheDocument();
  });

  it('shows a retryable error instead of an empty record when the index cannot be loaded', async () => {
    getIndex.mockRejectedValue(new Error('network'));
    render(<AskRecord />);
    expect(await screen.findByText('The home record could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-record-section]')).toHaveLength(0);
  });

  it('omits the completeness summary when completeness is unavailable', async () => {
    getIndex.mockResolvedValue({ success: true, data: index([section({ id: 'rooms', label: 'Rooms' })], { completeness: { state: 'UNAVAILABLE', percent: null, pendingDetails: null } }) });
    render(<AskRecord />);
    await screen.findByText('Rooms');
    expect(document.querySelector('[data-record-completeness]')).toBeNull();
  });

  it('keeps a compact two-column index on wide screens without fixed row heights or detached actions', async () => {
    getIndex.mockResolvedValue({ success: true, data: index([section({ id: 'rooms', label: 'Rooms' }), section({ id: 'inventory', label: 'Inventory' })]) });
    render(<AskRecord />);
    await screen.findByText('Inventory');
    const list = screen.getByRole('list', { name: 'Record sections' });
    expect(list.className).toContain('lg:grid-cols-2');
    for (const row of Array.from(list.querySelectorAll('li'))) {
      expect(row.className).not.toMatch(/(^|\s)h-/);
      expect(row.className).toContain('sm:flex-row');
      expect(row.querySelectorAll('a')).toHaveLength(1);
    }
  });
});
