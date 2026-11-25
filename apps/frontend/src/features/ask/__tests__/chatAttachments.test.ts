import { expiresLabel, formatFileSize, preflightProblem, stateLabel, typeLabel } from '../chatAttachments';

describe('chat attachment helpers (MM-002)', () => {
  it('formats sizes and types plainly', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(typeLabel('application/pdf')).toBe('PDF');
    expect(typeLabel('image/jpeg')).toBe('JPEG photo');
    expect(typeLabel('image/heic')).toBe('HEIC photo');
    expect(typeLabel('x/y')).toBe('File');
  });
  it('rejects only what is obviously wrong, with a way forward', () => {
    expect(preflightProblem({ name: 'a.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(preflightProblem({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toMatch(/empty/);
    expect(preflightProblem({ name: 'a.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' })).toMatch(/10 MB/);
    expect(preflightProblem({ name: 'IMG_1.HEIC', size: 1000, type: '' })).toMatch(/Most Compatible/);
    expect(preflightProblem({ name: 'photo', size: 1000, type: 'image/heif' })).toMatch(/HEIC/);
  });
  it('says what a state means and when the file goes away', () => {
    expect(stateLabel('READY')).toMatch(/Ask about it/);
    expect(stateLabel('FAILED')).toMatch(/Could not/);
    const now = new Date('2026-11-25T12:00:00Z');
    expect(expiresLabel('2026-11-26T12:00:00Z', now)).toBe('Removed automatically in about 24 hours');
    expect(expiresLabel('2026-11-25T12:30:00Z', now)).toBe('Removed within an hour');
    expect(expiresLabel('2026-11-25T11:00:00Z', now)).toBe('Removing soon');
  });
});
