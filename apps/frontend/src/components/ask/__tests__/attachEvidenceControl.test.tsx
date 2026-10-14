import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachEvidenceControl, EVIDENCE_ATTACH_MESSAGES, EVIDENCE_UPLOAD_MAX_BYTES } from '../AttachEvidenceControl';
import { api } from '@/lib/api/client';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.99: the shared upload control used for timeline events, inventory items and warranties.
jest.mock('@/lib/api/client', () => ({ api: { uploadAskEvidence: jest.fn() } }));
jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi', () => ({ uploadRecordForWorkflow: jest.fn() }));
const upload = api.uploadAskEvidence as jest.MockedFunction<typeof api.uploadAskEvidence>;

beforeEach(() => jest.clearAllMocks());
const file = (name: string, type: string, size = 1024) => Object.defineProperty(new File(['x'], name, { type }), 'size', { value: size });

test('each record type has its own canned message, matching the server\'s', () => {
  expect(EVIDENCE_ATTACH_MESSAGES).toEqual({
    HOME_EVENT: 'Attach evidence to this home timeline entry.',
    INVENTORY_ITEM: 'Attach this document to this inventory item.',
    WARRANTY: 'Attach this document to this warranty.',
  });
});

test('a picked file is uploaded to the property first, then its document id is handed on; the button carries the given label', async () => {
  upload.mockResolvedValueOnce({ success: true, data: { document: { id: 'doc-9', name: 'receipt.pdf', mimeType: 'application/pdf', fileSize: 1024 } } } as Awaited<ReturnType<typeof api.uploadAskEvidence>>);
  const onAttached = jest.fn();
  render(<AttachEvidenceControl event={{ entityType: 'INVENTORY_ITEM', id: 'item-1', title: 'Water heater' }} propertyId="home" onAttached={onAttached} label="Attach a document" />);
  expect(screen.getByRole('button', { name: /Attach a document/ })).toBeInTheDocument();
  const pick = file('receipt.pdf', 'application/pdf');
  fireEvent.change(screen.getByLabelText('Attach evidence file for Water heater'), { target: { files: [pick] } });
  await waitFor(() => expect(onAttached).toHaveBeenCalledWith('doc-9'));
  expect(upload).toHaveBeenCalledWith('home', pick);
});

test('an unsupported type, an oversized file, no home, or a failed upload shows an error and never hands anything on', async () => {
  const onAttached = jest.fn();
  const { rerender } = render(<AttachEvidenceControl event={{ entityType: 'WARRANTY', id: 'war-1', title: 'Acme' }} propertyId="home" onAttached={onAttached} />);
  const input = screen.getByLabelText('Attach evidence file for Acme');
  fireEvent.change(input, { target: { files: [file('notes.txt', 'text/plain')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG, PNG, WEBP, or PDF file.');
  fireEvent.change(input, { target: { files: [file('big.pdf', 'application/pdf', EVIDENCE_UPLOAD_MAX_BYTES + 1)] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('larger than 10MB'));
  upload.mockRejectedValueOnce(new Error('The file could not be uploaded.'));
  fireEvent.change(input, { target: { files: [file('ok.pdf', 'application/pdf')] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be uploaded'));
  rerender(<AttachEvidenceControl event={{ entityType: 'WARRANTY', id: 'war-1', title: 'Acme' }} onAttached={onAttached} />);
  fireEvent.change(screen.getByLabelText('Attach evidence file for Acme'), { target: { files: [file('ok.pdf', 'application/pdf')] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('home could not be determined'));
  expect(onAttached).not.toHaveBeenCalled();
});

describe('AttachEvidenceControl store (owner ruling D-P5)', () => {
  it('stores a project document as a Home Record through the canonical upload and returns its id, never calling the Ask evidence route', async () => {
    const workflow = jest.requireMock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi') as { uploadRecordForWorkflow: jest.Mock };
    workflow.uploadRecordForWorkflow.mockResolvedValue('record-7');
    const askUpload = jest.spyOn(api, 'uploadAskEvidence');
    const onAttached = jest.fn();
    const { container } = render(
      <AttachEvidenceControl event={{ entityType: 'PROJECT_RECORD', id: 'k', title: 'Receipt' }} propertyId="p1" store="HOME_RECORDS" onAttached={onAttached} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'receipt.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith('record-7'));
    expect(askUpload).not.toHaveBeenCalled();
    expect(workflow.uploadRecordForWorkflow).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'receipt.pdf', recordType: 'OTHER' }));
  });
});
