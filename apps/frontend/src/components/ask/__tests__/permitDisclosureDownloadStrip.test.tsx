/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PermitDisclosureDownloadStrip, readyPermitDisclosuresOf } from '../PermitDisclosureDownloadStrip';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getDisclosureExport: jest.fn() } }));
const get = api.getDisclosureExport as jest.Mock;

const list = (items: Array<{ id: string; status: string; title?: string; entityType?: string }>) => ({
  type: 'GROUPED_LIST', id: 'material-specs-exports', title: 'Your materials exports', filters: [], actions: [],
  sections: [{ id: 'material-exports', title: 'Recent exports', count: items.length, items: items.map((item) => ({ id: item.id, title: item.title ?? `Export ${item.id}`, status: item.status, entityType: item.entityType ?? 'PERMIT_DISCLOSURE_EXPORT', meta: [], href: null })) }],
});
const execution = (operationId: string, blocks: unknown[], property: { id: string } | null = { id: 'home-1' }) => ({ operation: { id: operationId }, blocks, property }) as never;

describe('PermitDisclosureDownloadStrip', () => {
  beforeEach(() => get.mockReset());

  it('offers a download only for ready permit disclosure reports in the Permit Tracker answer', () => {
    expect(readyPermitDisclosuresOf(execution('PERMIT_TRACKER_STATUS', [list([{ id: 'a', status: 'Ready' }, { id: 'b', status: 'Preparing' }, { id: 'c', status: 'Failed' }])])).map((entry) => entry.id)).toEqual(['a']);
    expect(readyPermitDisclosuresOf(execution('PERMIT_TRACKER_COMMAND', [list([{ id: 'a', status: 'Ready' }])]))).toEqual([]);
    expect(readyPermitDisclosuresOf(execution('PERMIT_TRACKER_STATUS', [list([{ id: 'a', status: 'Ready', entityType: 'MATERIAL_SPEC_EXPORT' }])]))).toEqual([]);
    const { container } = render(<PermitDisclosureDownloadStrip execution={execution('PERMIT_TRACKER_STATUS', [list([{ id: 'b', status: 'Preparing' }])])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for the link only when chosen, with the person\'s own session, and says so when the download is not ready', async () => {
    get.mockResolvedValue({ status: 'FAILED', fileUrl: null });
    render(<PermitDisclosureDownloadStrip execution={execution('PERMIT_TRACKER_STATUS', [list([{ id: 'a', status: 'Ready', title: 'Permit disclosure report' }])])} />);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download Permit disclosure report' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('home-1', 'a'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The download is not ready.');
  });

  it('shows the request\'s own error when it fails', async () => {
    get.mockRejectedValue(new Error('Export not found'));
    render(<PermitDisclosureDownloadStrip execution={execution('PERMIT_TRACKER_STATUS', [list([{ id: 'a', status: 'Ready', title: 'Permit disclosure report' }])])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Permit disclosure report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export not found');
  });

  it('renders nothing without a property', () => {
    const { container } = render(<PermitDisclosureDownloadStrip execution={execution('PERMIT_TRACKER_STATUS', [list([{ id: 'a', status: 'Ready' }])], null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
