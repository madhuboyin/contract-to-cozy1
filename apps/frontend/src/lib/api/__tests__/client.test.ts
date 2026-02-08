import { api } from '../client';

describe('APIClient', () => {
  it('exports a singleton api instance', () => {
    expect(api).toBeDefined();
  });
});

describe('validateFile (via uploadDocument)', () => {
  it('rejects files that are too large', async () => {
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    });

    await expect(api.uploadDocument(largeFile, {
      type: 'OTHER',
      name: 'test',
    })).rejects.toThrow('File too large');
  });

  it('rejects disallowed file types', async () => {
    const exeFile = new File(['data'], 'malware.exe', {
      type: 'application/x-msdownload',
    });

    await expect(api.uploadDocument(exeFile, {
      type: 'OTHER',
      name: 'test',
    })).rejects.toThrow('File type');
  });

  it('accepts a valid file (does not throw validation error)', async () => {
    const validFile = new File(['data'], 'doc.pdf', {
      type: 'application/pdf',
    });

    // Mock fetch so the network request doesn't actually fire
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    // Should not throw a validation error — it will proceed to the network call
    await expect(api.uploadDocument(validFile, {
      type: 'OTHER',
      name: 'test',
    })).resolves.toBeDefined();
  });
});

describe('validateFile (via uploadCompletionPhoto)', () => {
  it('rejects non-image files for photo upload', async () => {
    const pdfFile = new File(['data'], 'doc.pdf', {
      type: 'application/pdf',
    });

    await expect(api.uploadCompletionPhoto(
      'prop-1', 'action-key', pdfFile, 0
    )).rejects.toThrow('File type');
  });

  it('rejects files over 5MB for photo upload', async () => {
    const bigImage = new File(['x'.repeat(6 * 1024 * 1024)], 'photo.jpg', {
      type: 'image/jpeg',
    });

    await expect(api.uploadCompletionPhoto(
      'prop-1', 'action-key', bigImage, 0
    )).rejects.toThrow('File too large');
  });
});
