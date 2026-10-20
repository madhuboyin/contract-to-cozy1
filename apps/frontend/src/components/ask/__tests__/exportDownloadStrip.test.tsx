/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportDownloadStrip, readyExportsOf, sharedExportsOf } from '../ExportDownloadStrip';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getHomeReportExportDownloadUrl: jest.fn(), listHomeReportExports: jest.fn() } }));
const getUrl = api.getHomeReportExportDownloadUrl as jest.Mock;
const listExports = api.listHomeReportExports as jest.Mock;

const list = (items: Array<{ id: string; status: string; title?: string; meta?: string[] }>) => ({
  type: 'GROUPED_LIST', id: 'home-record-export-status-list', title: 'Your exports', filters: [], actions: [],
  sections: [{ id: 'exports', title: 'Recent exports', count: items.length, items: items.map((item) => ({ id: item.id, title: item.title ?? `Export ${item.id}`, status: item.status, entityType: 'HOME_REPORT_EXPORT', meta: item.meta ?? [], actions: [] })) }],
});
const execution = (operationId: string, blocks: unknown[]) => ({ operation: { id: operationId }, blocks, property: { id: 'home-1' } }) as never;

describe('ExportDownloadStrip', () => {
  beforeEach(() => { getUrl.mockReset(); listExports.mockReset(); });

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

  it('finds the exports with a working share link in the status answer and in a share receipt', () => {
    expect(sharedExportsOf(execution('HOME_RECORD_EXPORT_STATUS', [list([{ id: 'a', status: 'Ready', meta: ['Shared until Nov 1, 2026'] }, { id: 'b', status: 'Ready' }])])).map((entry) => entry.id)).toEqual(['a']);
    const receipt = { type: 'WORKFLOW_PROGRESS', id: 'home-record-export-share-exp-9', title: 'Share link created', status: 'COMPLETED', description: '', details: [], actions: [] };
    expect(sharedExportsOf(execution('HOME_RECORD_EXPORT_SHARE', [receipt])).map((entry) => entry.id)).toEqual(['exp-9']);
    expect(sharedExportsOf(execution('HOME_RECORD_EXPORT_SHARE', [{ ...receipt, id: 'home-record-export-unshare-exp-9' }]))).toEqual([]);
  });

  it('fetches the share link only when asked, copies it, and never shows a link that is no longer active', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    listExports.mockResolvedValue({ success: true, data: { exports: [{ id: 'a', shareToken: 'TOK', shareRevokedAt: null, shareExpiresAt: new Date(Date.now() + 86_400_000).toISOString() }] } });
    render(<ExportDownloadStrip execution={execution('HOME_RECORD_EXPORT_STATUS', [list([{ id: 'a', status: 'Ready', title: 'Home record export', meta: ['Shared until Nov 1, 2026'] }])])} />);
    expect(listExports).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the share link for Home record export' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/reports/share/TOK`));
    expect(listExports).toHaveBeenCalledWith('home-1');
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();

    listExports.mockResolvedValue({ success: true, data: { exports: [{ id: 'a', shareToken: 'TOK', shareRevokedAt: new Date().toISOString(), shareExpiresAt: null }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy the share link for Home record export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That link is no longer active.');
  });
});
