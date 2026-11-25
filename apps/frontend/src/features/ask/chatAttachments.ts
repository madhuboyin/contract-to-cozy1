// BICC-3.1 / MM-002: what the client shows for a chat attachment. Pure, so it is tested without a browser. The server is the only authority on type and size: this only
// rejects what is obviously wrong before spending an upload, and shows the server's own message for everything else.
export interface ChatAttachment {
  id: string; fileName: string; type: string; sizeBytes: number; state: string; scopeKind: 'PROPERTY' | 'CANDIDATE'; scopeId: string; sessionId: string | null;
  uploadedAt: string; deleteAfter: string;
}

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function typeLabel(type: string): string {
  if (type === 'application/pdf') return 'PDF';
  if (type === 'image/jpeg') return 'JPEG photo';
  if (type === 'image/png') return 'PNG photo';
  if (type === 'image/heic' || type === 'image/heif') return 'HEIC photo';
  return 'File';
}

/** Null when the file may be sent; otherwise a specific, recoverable message. HEIC/HEIF are named because phones produce them and the server cannot read them yet. */
export function preflightProblem(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return 'That file is empty. Choose another file.';
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return `That file is larger than ${CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB. Choose a smaller file or a lower-resolution photo.`;
  if (/\.(heic|heif)$/i.test(file.name) || /image\/he/i.test(file.type)) return 'Cozy cannot read HEIC photos yet. Share the photo as a JPEG (on an iPhone: Settings, Camera, Formats, Most Compatible) or take a screenshot of it.';
  return null;
}

export function stateLabel(state: string): string {
  switch (state) {
    case 'READY': return 'Ready. Ask about it in your next message.';
    case 'ANALYZING': return 'Being read…';
    case 'ANALYZED': return 'Read';
    case 'FAILED': return 'Could not be saved';
    default: return state;
  }
}

export function expiresLabel(deleteAfter: string, now: Date = new Date()): string {
  const ms = new Date(deleteAfter).getTime() - now.getTime();
  if (ms <= 0) return 'Removing soon';
  const hours = Math.ceil(ms / 3_600_000);
  return hours <= 1 ? 'Removed within an hour' : `Removed automatically in about ${hours} hours`;
}
