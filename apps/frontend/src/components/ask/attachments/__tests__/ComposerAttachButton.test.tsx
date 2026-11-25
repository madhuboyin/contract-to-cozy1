import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ComposerAttachButton } from '../ComposerAttachButton';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { listAskAttachments: jest.fn(), uploadAskAttachment: jest.fn(), deleteAskAttachment: jest.fn() } }));
const mocked = api as unknown as Record<'listAskAttachments' | 'uploadAskAttachment' | 'deleteAskAttachment', jest.Mock>;
const stored = { id: 'att1', fileName: 'policy.pdf', type: 'application/pdf', sizeBytes: 2048, state: 'READY', scopeKind: 'PROPERTY', scopeId: 'p1', sessionId: 's1', uploadedAt: '2026-11-25T12:00:00Z', deleteAfter: '2099-01-01T00:00:00Z' };

beforeEach(() => {
  Object.values(mocked).forEach((fn) => fn.mockReset());
  mocked.listAskAttachments.mockResolvedValue({ success: true, data: { attachments: [] } });
  (global as unknown as { URL: { createObjectURL: () => string; revokeObjectURL: () => void } }).URL.createObjectURL = () => 'blob:preview';
  (global as unknown as { URL: { createObjectURL: () => string; revokeObjectURL: () => void } }).URL.revokeObjectURL = () => undefined;
});
const open = async (props = {}) => { render(<ComposerAttachButton propertyId="p1" sessionId="s1" {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Ask about a photo or PDF' })); await screen.findByText('Files in this conversation'); };
const pick = (file: File) => fireEvent.change(screen.getByLabelText('Choose a photo or PDF'), { target: { files: [file] } });

// BICC-3.1 MM-001/002: preview, type, size, state, removal and retry for a chat attachment.
describe('ComposerAttachButton', () => {
  it('renders nothing without a selected home', () => {
    const { container } = render(<ComposerAttachButton propertyId={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says plainly that the file is not saved to home records, and lists files with type, size, state and expiry', async () => {
    mocked.listAskAttachments.mockResolvedValue({ success: true, data: { attachments: [stored] } });
    await open();
    expect(screen.getByText(/not saved to your home records/)).toBeInTheDocument();
    expect(await screen.findByText('policy.pdf')).toBeInTheDocument();
    expect(screen.getByText(/PDF · 2 KB · Ready/)).toBeInTheDocument();
    expect(screen.getByText(/Removed automatically/)).toBeInTheDocument();
    expect(mocked.listAskAttachments).toHaveBeenCalledWith('s1');
  });

  it('uploads to the selected home and this conversation, then shows the stored file', async () => {
    mocked.uploadAskAttachment.mockResolvedValue({ success: true, data: stored });
    await open();
    const file = new File(['%PDF-1.4'], 'policy.pdf', { type: 'application/pdf' });
    mocked.listAskAttachments.mockResolvedValue({ success: true, data: { attachments: [stored] } });
    pick(file);
    await waitFor(() => expect(mocked.uploadAskAttachment).toHaveBeenCalledWith(file, { kind: 'PROPERTY', id: 'p1' }, 's1'));
    expect(await screen.findByText(/policy.pdf added/)).toBeInTheDocument();
    expect(await screen.findByText(/PDF · 2 KB/)).toBeInTheDocument();
  });

  it('refuses a HEIC photo before uploading, with the way forward, and offers removal but no retry', async () => {
    await open();
    pick(new File(['x'], 'IMG_1.HEIC', { type: '' }));
    expect(await screen.findByText(/Most Compatible/)).toBeInTheDocument();
    expect(mocked.uploadAskAttachment).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry IMG_1.HEIC' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove IMG_1.HEIC' }));
    await waitFor(() => expect(screen.queryByText('IMG_1.HEIC')).toBeNull());
  });

  it('shows the server message on a failed upload and retries the same file', async () => {
    mocked.uploadAskAttachment.mockResolvedValueOnce({ success: false, message: 'The file could not be saved. Try again.' }).mockResolvedValueOnce({ success: true, data: stored });
    await open();
    pick(new File(['%PDF-1.4'], 'policy.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('The file could not be saved. Try again.')).toBeInTheDocument();
    mocked.listAskAttachments.mockResolvedValue({ success: true, data: { attachments: [stored] } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry policy.pdf' }));
    await waitFor(() => expect(mocked.uploadAskAttachment).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/policy.pdf added/)).toBeInTheDocument();
  });

  it('removes a stored file, and says when removal is still finishing', async () => {
    mocked.listAskAttachments.mockResolvedValue({ success: true, data: { attachments: [stored] } });
    mocked.deleteAskAttachment.mockResolvedValue({ success: true, data: { deleted: false, retryLater: true } });
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove policy.pdf' }));
    await waitFor(() => expect(mocked.deleteAskAttachment).toHaveBeenCalledWith('att1'));
    expect(await screen.findByText(/will be removed shortly/)).toBeInTheDocument();
  });
});
