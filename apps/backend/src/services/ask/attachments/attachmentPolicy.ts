// BICC-MM-002 / MM-010 and FRD D04, D10: what an ephemeral chat attachment may be, how its type is established, and how long each stage of its life may last.
// Pure. Nothing here stores anything; storage, scanning and analysis are separate concerns and an attachment never inherits an unrelated retention period.
import { ASK_INTAKE_MAX_BYTES } from '../askIntake.contract';

/** D04: PDF, JPEG, PNG, HEIC and HEIF. */
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const;
export type AttachmentType = typeof ATTACHMENT_TYPES[number];

/** D04: a 25 MB target is provisional; until application-memory use is verified the current Ask intake limit stays authoritative. */
export const ATTACHMENT_PROVISIONAL_TARGET_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_EFFECTIVE_MAX_BYTES = ASK_INTAKE_MAX_BYTES;

/** D10 and MM-010: every stage has its own declared period. */
export const ATTACHMENT_RETENTION = Object.freeze({
  /** Unpromoted originals and every derivative are deleted this long after analysis COMPLETES. */
  afterAnalysisMs: 24 * 60 * 60 * 1000,
  /** A file that was never analysed does not linger either: the same period, from the upload. */
  unanalyzedMs: 24 * 60 * 60 * 1000,
  /** A failed or abandoned upload is cleaned up quickly. */
  failedUploadMs: 60 * 60 * 1000,
});

/** Everything derived from one attachment, so a deletion cannot forget a copy (MM-010). */
export const ATTACHMENT_DERIVED_KINDS = ['RAW_FILE', 'PREVIEW', 'OCR_TEXT', 'CHUNKS', 'DERIVED_INDEX'] as const;
export type AttachmentDerivedKind = typeof ATTACHMENT_DERIVED_KINDS[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, from: number, to: number): string => Buffer.from(bytes.subarray(from, to)).toString('latin1');
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** The type the BYTES say the file is. A declared MIME type or file extension is never authoritative (MM-002). Null when the content is none of the accepted types. */
export function sniffAttachmentType(bytes: Uint8Array): AttachmentType | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const major = ascii(bytes, 8, 12);
    if (HEIF_BRANDS.has(major)) return major === 'mif1' || major === 'msf1' ? 'image/heif' : 'image/heic';
  }
  return null;
}

export type AttachmentValidation =
  | { ok: true; type: AttachmentType; needsConversion: boolean }
  | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED' | 'TYPE_MISMATCH' | 'HEIC_CONVERSION_UNAVAILABLE'; message: string };

/**
 * Validates one file by its content. HEIC and HEIF are accepted only when the server can convert them (`canConvertHeic`); otherwise they are rejected with a specific
 * way forward, as MM-002 allows. A declared type that disagrees with the content is refused, not trusted.
 */
export function validateAttachment(input: { declaredMimeType: string; bytes: Uint8Array; canConvertHeic?: boolean; maxBytes?: number }): AttachmentValidation {
  const max = input.maxBytes ?? ATTACHMENT_EFFECTIVE_MAX_BYTES;
  if (input.bytes.length === 0) return { ok: false, code: 'EMPTY', message: 'That file is empty. Choose another file.' };
  if (input.bytes.length > max) return { ok: false, code: 'TOO_LARGE', message: `That file is larger than ${Math.floor(max / (1024 * 1024))} MB. Choose a smaller file or a lower-resolution photo.` };
  const type = sniffAttachmentType(input.bytes);
  if (!type) return { ok: false, code: 'TYPE_NOT_ALLOWED', message: 'Choose a PDF, JPEG, PNG, HEIC or HEIF file.' };
  const declared = input.declaredMimeType.toLowerCase().split(';')[0].trim();
  const sameFamily = declared === type || (type.startsWith('image/he') && declared.startsWith('image/he')) || (declared === 'image/jpg' && type === 'image/jpeg');
  if (declared && declared !== 'application/octet-stream' && !sameFamily) return { ok: false, code: 'TYPE_MISMATCH', message: 'The file’s contents do not match its type. Re-save or re-export it and try again.' };
  if (type === 'image/heic' || type === 'image/heif') {
    if (!input.canConvertHeic) return { ok: false, code: 'HEIC_CONVERSION_UNAVAILABLE', message: 'Ask cannot read HEIC photos yet. Share the photo as a JPEG (on an iPhone: Settings, Camera, Formats, Most Compatible) or take a screenshot of it.' };
    return { ok: true, type, needsConversion: true };
  }
  return { ok: true, type, needsConversion: false };
}
