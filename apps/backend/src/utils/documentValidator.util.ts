// apps/backend/src/utils/documentValidator.util.ts
//
// Magic-byte validation middleware for every file upload surface.
// Multer's fileFilter only sees the client-supplied Content-Type header which
// an attacker fully controls. These middlewares run AFTER multer has written
// the file into memory (req.file.buffer) and verify the actual file bytes.
//
// Exported validators (use the one that matches your endpoint's accepted types):
//   validateDocumentUpload    — PDF + JPEG/PNG/WEBP  (document intelligence route)
//   validateImageUpload       — JPEG/PNG/WEBP only   (visual inspector, inventory)
//   validatePdfUpload         — PDF only             (inspection report)
//   validatePdfOrImageUpload  — PDF + JPEG/PNG/WEBP  (energy auditor, tax appeal)
//   validateXlsxUpload        — XLSX only            (inventory import)

import { Request, Response, NextFunction } from 'express';
import { auditLog } from '../lib/logger';

// ---------------------------------------------------------------------------
// MIME-type allowlists
// ---------------------------------------------------------------------------

// SVG is intentionally absent: it is XML that can embed <script> tags and
// executes JavaScript when loaded as an <img> in Chrome/Safari.
const SAFE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const PDF_TYPE = 'application/pdf';

const XLSX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Some browsers (notably Safari on iOS) send application/octet-stream for
  // XLSX files — we accept it here and rely on magic-byte check to confirm.
  'application/octet-stream',
]);

// ---------------------------------------------------------------------------
// Magic-byte signatures
// Each entry is a list of valid byte sequences for that MIME type.
// ---------------------------------------------------------------------------
const MAGIC_BYTES: Record<string, number[][]> = {
  [PDF_TYPE]:     [[0x25, 0x50, 0x44, 0x46]],                           // %PDF
  'image/jpeg':   [[0xff, 0xd8, 0xff]],
  'image/jpg':    [[0xff, 0xd8, 0xff]],
  'image/png':    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], // \x89PNG\r\n\x1a\n
  'image/webp':   [[0x52, 0x49, 0x46, 0x46]],                           // RIFF....WEBP
  // XLSX is a ZIP file — all ZIP variants share this 4-byte signature.
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
  'application/octet-stream': [[0x50, 0x4b, 0x03, 0x04]],               // must be ZIP/XLSX
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB default cap

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

function hasSvgSignature(buffer: Buffer): boolean {
  // Detect SVG regardless of declared MIME type: look for the XML/SVG doctype
  // in the first 512 bytes (after optional BOM / whitespace).
  const head = buffer.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg ');
}

function buildValidator(
  allowedTypes: Set<string>,
  label: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const file = req.file ?? (req as any).files?.[0];

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded.' });
      return;
    }

    // Zero-byte guard
    if (file.size === 0) {
      res.status(400).json({ success: false, message: 'Cannot process empty file.' });
      return;
    }

    // Declared MIME allowlist
    if (!allowedTypes.has(file.mimetype)) {
      res.status(400).json({
        success: false,
        message: `File type "${file.mimetype}" is not accepted on this endpoint.`,
      });
      return;
    }

    // SVG content check — reject even if the declared MIME isn't image/svg+xml,
    // because an attacker could rename an SVG to .jpg and send it as image/jpeg.
    if (hasSvgSignature(file.buffer)) {
      auditLog('SUSPICIOUS_FILE_UPLOAD', (req as any).user?.userId ?? null, {
        ip: req.ip,
        reason: 'SVG_CONTENT_DETECTED',
        declaredMime: file.mimetype,
        filename: file.originalname,
      });
      res.status(400).json({ success: false, message: 'SVG files are not permitted.' });
      return;
    }

    // File size cap (belt-and-suspenders; multer already enforces this)
    if (file.size > MAX_FILE_SIZE) {
      res.status(400).json({ success: false, message: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.` });
      return;
    }

    // Magic-byte check: actual file bytes must match the declared type
    if (!matchesMagicBytes(file.buffer, file.mimetype)) {
      auditLog('SUSPICIOUS_FILE_UPLOAD', (req as any).user?.userId ?? null, {
        ip: req.ip,
        reason: 'MAGIC_BYTE_MISMATCH',
        declaredMime: file.mimetype,
        filename: file.originalname,
        validator: label,
      });
      res.status(400).json({
        success: false,
        message: 'File content does not match its declared type. Upload rejected.',
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Specialised multi-file validator (for upload.array() routes)
// Validates every file in req.files[].
// ---------------------------------------------------------------------------
function buildArrayValidator(allowedTypes: Set<string>, label: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const files: Express.Multer.File[] = Array.isArray((req as any).files)
      ? (req as any).files
      : Object.values((req as any).files ?? {}).flat() as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: 'No files uploaded.' });
      return;
    }

    for (const file of files) {
      if (file.size === 0) {
        res.status(400).json({ success: false, message: `File "${file.originalname}" is empty.` });
        return;
      }
      if (!allowedTypes.has(file.mimetype)) {
        res.status(400).json({ success: false, message: `File type "${file.mimetype}" is not accepted.` });
        return;
      }
      if (hasSvgSignature(file.buffer)) {
        auditLog('SUSPICIOUS_FILE_UPLOAD', (req as any).user?.userId ?? null, {
          ip: req.ip, reason: 'SVG_CONTENT_DETECTED', declaredMime: file.mimetype,
          filename: file.originalname,
        });
        res.status(400).json({ success: false, message: 'SVG files are not permitted.' });
        return;
      }
      if (!matchesMagicBytes(file.buffer, file.mimetype)) {
        auditLog('SUSPICIOUS_FILE_UPLOAD', (req as any).user?.userId ?? null, {
          ip: req.ip, reason: 'MAGIC_BYTE_MISMATCH', declaredMime: file.mimetype,
          filename: file.originalname, validator: label,
        });
        res.status(400).json({ success: false, message: 'File content does not match its declared type. Upload rejected.' });
        return;
      }
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Exported validators
// ---------------------------------------------------------------------------

/** PDF + JPEG/PNG/WEBP — used by the document intelligence (/analyze) route */
export const validateDocumentUpload = buildValidator(
  new Set([PDF_TYPE, ...SAFE_IMAGE_TYPES]),
  'document'
);

/** JPEG/PNG/WEBP only — visual inspector, inventory item images, room scans */
export const validateImageUpload = buildValidator(SAFE_IMAGE_TYPES, 'image');

/** Variant for upload.array() routes (visual inspector sends up to 20 images) */
export const validateImageArrayUpload = buildArrayValidator(SAFE_IMAGE_TYPES, 'image-array');

/** PDF only — inspection report upload */
export const validatePdfUpload = buildValidator(new Set([PDF_TYPE]), 'pdf');

/** PDF + JPEG/PNG/WEBP — energy auditor bills, tax appeal docs */
export const validatePdfOrImageUpload = buildValidator(
  new Set([PDF_TYPE, ...SAFE_IMAGE_TYPES]),
  'pdf-or-image'
);

/** XLSX only — inventory import */
export const validateXlsxUpload = buildValidator(XLSX_TYPES, 'xlsx');
