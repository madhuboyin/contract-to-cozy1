/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportDownloadStrip, readyExportsOf } from '../ExportDownloadStrip';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getHomeReportExportDownloadUrl: jest.fn() } }));
const getUrl = api.getHomeReportExportDownloadUrl as jest.Mock;

const list = (items: Array<{ id: string; status: string; title?: string }>) => ({
  type: 'GROUPED_LIST', id: 'home-record-export-status-list', title: 'Your exports', filters: [], actions: [],
  sections: [{ id: 'exports', title: 'Recent exports', count: items.length, items: items.map((item) => ({ id: item.id, title: item.title ?? `Export ${item.id}`, status: item.status, entityType: 'HOME_REPORT_EXPORT', meta: [], actions: [] })) }],
});
const execution = (operationId: string, blocks: unknown[]) => ({ operation: { id: operationId }, blocks }) as never;

describe('ExportDownloadStrip', () => {
  beforeEach(() => getUrl.mockReset());

  it('offers a download only for ready exports in the export status answer', () => {
    expect(readyExportsOf(execution('HOME_RECORD_EXPORT_STATUS', [list([{ id: 'a', status: 'Ready' }, { id: 'b', status: 'Preparing' }, { id: 'c', status: 'Expired' }])]))).toEqual([{ id: 'a', title: 'Export a' }]);
    expect(readyExportsOf(execution('WARRANTY_LOOKUP', [list([{ id: 'a', status: 'Ready' }])]))).toEqual([]);
    const { container } = render(<ExportDownloadStrip execution={execution('HOME_RECORD_EXPORT_STATUS', [list([{ id: 'b', status: 'Preparing' }])])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('requests the link when chosen, with the person\'s own session, and says so when the download is not ready', async () => {
    getUrl.mockResolvedValue({ success: false, message: 'Report not ready' });
    render(<ExportDownloadStrip execution={execution('HOME_RECORD_EXPORT_STATUS', [list([{ id: 'a', status: 'Ready', title: 'Home record export · Oct 19' }])])} />);
    expect(getUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download Home record export · Oct 19' }));
    await waitFor(() => expect(getUrl).toHaveBeenCalledWith('a'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Report not ready');
  });
});
