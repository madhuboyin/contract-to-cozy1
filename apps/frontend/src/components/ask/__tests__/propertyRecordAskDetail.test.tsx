import { render, screen, waitFor } from '@testing-library/react';
import { PropertyRecordAskDetail } from '../PropertyRecordAskDetail';
import { getRecord } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi', () => ({ getRecord: jest.fn() }));
const mockedGetRecord = getRecord as jest.MockedFunction<typeof getRecord>;

// Documents on the canonical inventory (FRD v1.136): a Home Record's inline detail is read through the record route, so the record-level
// visibility rule applies, and it changes nothing.
const record = {
  id: 'r1', propertyId: 'home', title: 'Roof warranty', description: 'Ten-year shingle warranty.', recordType: 'WARRANTY', sensitivity: 'STANDARD', visibility: 'HOUSEHOLD',
  lifecycleStatus: 'ACTIVE', currentVersionId: 'v1', archivedAt: null, trashedAt: null, retainUntil: null, legalHoldReason: null, effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: '2036-01-01T00:00:00.000Z', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z', currentVersion: null, _count: { versions: 2, links: 1 },
  allowedActions: {}, needsReview: true, expiryStatus: 'CURRENT', versions: [], links: [], deletionImpact: {},
};
const apiError = (status: number, code?: string) => Object.assign(new Error('failed'), { status, payload: code ? { error: { code } } : undefined });
const link = (href: string, label: React.ReactNode) => <a href={href}>{label}</a>;
const renderDetail = (onAccessLost = jest.fn()) => {
  render(<PropertyRecordAskDetail recordId="r1" expectedPropertyId="home" fallbackTitle="Roof warranty" href="/dashboard/properties/home/tools/home-records" onAccessLost={onAccessLost} onClose={jest.fn()} link={link} />);
  return onAccessLost;
};
beforeEach(() => mockedGetRecord.mockReset());

describe('PropertyRecordAskDetail', () => {
  it('shows the current record\'s own facts and a link to Home Records, and offers no action', async () => {
    mockedGetRecord.mockResolvedValue(record as never);
    renderDetail();
    expect(await screen.findByText('Ten-year shingle warranty.')).toBeInTheDocument();
    expect(mockedGetRecord).toHaveBeenCalledWith('home', 'r1');
    expect(screen.getByText('Extracted details await review')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Home Records/ })).toHaveAttribute('href', '/dashboard/properties/home/tools/home-records');
    expect(screen.queryByRole('button', { name: /archive|trash|delete|restore|download|promote/i })).toBeNull();
  });

  it('says a removed or no-longer-visible record is unavailable, and keeps the conversation going', async () => {
    mockedGetRecord.mockRejectedValue(apiError(404, 'PROPERTY_RECORD_NOT_FOUND'));
    const onAccessLost = renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('Record no longer available');
    expect(screen.getByRole('alert')).toHaveTextContent('no longer visible to you');
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it('treats a property access denial (a 404 without the record code) as access lost', async () => {
    mockedGetRecord.mockRejectedValue(apiError(404, 'PROPERTY_ACCESS_DENIED'));
    const onAccessLost = renderDetail();
    await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it could not verify the record on any other failure', async () => {
    mockedGetRecord.mockRejectedValue(apiError(500));
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify the current record');
  });
});
