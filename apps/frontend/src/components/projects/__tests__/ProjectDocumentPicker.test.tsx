import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectDocumentPicker } from '../ProjectDocumentPicker';
import { api } from '@/lib/api/client';
import { uploadRecordForWorkflow } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi';

jest.mock('@/lib/api/client', () => ({ api: { listPropertyRecords: jest.fn() } }));
jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi', () => ({ uploadRecordForWorkflow: jest.fn() }));

const record = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Doc ${id}`, recordType: 'OTHER', visibility: 'HOUSEHOLD', sensitivity: 'LEGAL', lifecycleStatus: 'ACTIVE', createdAt: '2026-01-01', currentVersion: { scanStatus: 'CLEAN' }, ...over,
});

describe('ProjectDocumentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.listPropertyRecords as jest.Mock).mockResolvedValue({ success: true, data: { records: [record('a'), record('b', { visibility: 'OWNER_ONLY' })] } });
  });

  it('lists eligible records with their sensitivity, says how many owner-only were left out, and selects by record id (never typed)', async () => {
    const onChange = jest.fn();
    render(<ProjectDocumentPicker propertyId="p1" value={[]} onChange={onChange} label="Evidence" />);
    expect(await screen.findByText(/Doc a/)).toBeInTheDocument();
    expect(screen.getByText(/Legal/)).toBeInTheDocument();
    expect(screen.queryByText(/Doc b/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 owner-only record is not listed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('stores an added file as a Home Record through the canonical upload and selects the record id', async () => {
    (uploadRecordForWorkflow as jest.Mock).mockResolvedValue('new-record');
    const onChange = jest.fn();
    const { container } = render(<ProjectDocumentPicker propertyId="p1" value={['a']} onChange={onChange} label="Evidence" uploadTitle="Change order" />);
    await screen.findByText(/Doc a/);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'permit.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['a', 'new-record']));
    expect(uploadRecordForWorkflow).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'permit.pdf', recordType: 'OTHER', sensitivity: 'STANDARD' }));
  });
});
