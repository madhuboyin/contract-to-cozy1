/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MaterialExportDownloadStrip, readyMaterialExportsOf } from '../MaterialExportDownloadStrip';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { get: jest.fn() } }));
const get = api.get as jest.Mock;

const list = (items: Array<{ id: string; status: string; title?: string; entityType?: string }>) => ({
  type: 'GROUPED_LIST', id: 'material-specs-exports', title: 'Your materials exports', filters: [], actions: [],
  sections: [{ id: 'material-exports', title: 'Recent exports', count: items.length, items: items.map((item) => ({ id: item.id, title: item.title ?? `Export ${item.id}`, status: item.status, entityType: item.entityType ?? 'MATERIAL_SPEC_EXPORT', meta: [], href: null })) }],
});
const execution = (operationId: string, blocks: unknown[], property: { id: string } | null = { id: 'home-1' }) => ({ operation: { id: operationId }, blocks, property }) as never;

describe('MaterialExportDownloadStrip', () => {
  beforeEach(() => get.mockReset());

  it('offers a download only for ready materials exports in the Material Specs answer', () => {
    expect(readyMaterialExportsOf(execution('MATERIAL_SPECS_LIST', [list([{ id: 'a', status: 'Ready' }, { id: 'b', status: 'Preparing' }, { id: 'c', status: 'Failed' }])])).map((entry) => entry.id)).toEqual(['a']);
    expect(readyMaterialExportsOf(execution('WARRANTY_LOOKUP', [list([{ id: 'a', status: 'Ready' }])]))).toEqual([]);
    expect(readyMaterialExportsOf(execution('MATERIAL_SPECS_LIST', [list([{ id: 'a', status: 'Ready', entityType: 'HOME_REPORT_EXPORT' }])]))).toEqual([]);
    const { container } = render(<MaterialExportDownloadStrip execution={execution('MATERIAL_SPECS_LIST', [list([{ id: 'b', status: 'Preparing' }])])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for the link only when chosen, with the person\'s own session, and says so when the download is not ready', async () => {
    get.mockResolvedValue({ data: { export: { status: 'FAILED' }, signedUrl: null } });
    render(<MaterialExportDownloadStrip execution={execution('MATERIAL_SPECS_LIST', [list([{ id: 'a', status: 'Ready', title: 'Material specs' }])])} />);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download Material specs' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/properties/home-1/materials/exports/a'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The download is not ready.');
  });

  it('shows the request\'s own error when it fails', async () => {
    get.mockRejectedValue(new Error('Export not found'));
    render(<MaterialExportDownloadStrip execution={execution('MATERIAL_SPECS_LIST', [list([{ id: 'a', status: 'Ready', title: 'Material specs' }])])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Material specs' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export not found');
  });

  it('renders nothing without a property', () => {
    const { container } = render(<MaterialExportDownloadStrip execution={execution('MATERIAL_SPECS_LIST', [list([{ id: 'a', status: 'Ready' }])], null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
