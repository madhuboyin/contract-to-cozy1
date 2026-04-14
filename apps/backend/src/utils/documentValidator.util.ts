// apps/backend/src/utils/documentValidator.util.ts

import { Request, Response, NextFunction } from 'express';

// Define strict list of allowed file types for analysis (matching client/multer config)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
];

// Define maximum file size limit (10MB, matching the existing multer configuration)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Magic byte signatures for each allowed MIME type.
// Multer populates req.file.mimetype from the client-supplied Content-Type header,
// which an attacker controls. Verifying the actual file bytes prevents a malicious
// file (e.g. a PHP script) from being accepted by lying about its Content-Type.
const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],                          // %PDF
  'image/jpeg':      [[0xff, 0xd8, 0xff]],                                 // JFIF / EXIF
  'image/jpg':       [[0xff, 0xd8, 0xff]],
  'image/png':       [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], // \x89PNG\r\n\x1a\n
  'image/webp':      [[0x52, 0x49, 0x46, 0x46]],                          // RIFF (followed by ....WEBP)
};

function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
}

/**
 * Middleware to enforce strict validation rules on uploaded document files,
 * serving as a failsafe after multer processing.
 */
export const validateDocumentUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Multer should have processed the file into req.file
  if (!req.file) {
    return res.status(400).json({ message: 'Document file is missing from upload payload.' });
  }

  // 1. Zero-byte check (before anything else)
  if (req.file.size === 0) {
    return res.status(400).json({ message: 'Cannot process empty file.' });
  }

  // 2. MIME Type allowlist check (client-declared type)
  if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({
      message: `Invalid file type: ${req.file.mimetype}. Only PDF and common image types are supported.`,
    });
  }

  // 3. File size limit
  if (req.file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({
      message: `File size limit exceeded. Max allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
    });
  }

  // 4. Magic bytes verification — reject if actual file content doesn't match
  //    the declared MIME type. Multer uses memoryStorage so req.file.buffer
  //    is always available here.
  if (!matchesMagicBytes(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({
      message: 'File content does not match its declared type. Upload rejected.',
    });
  }

  next();
};