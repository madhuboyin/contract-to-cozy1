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

  // 1. MIME Type Check 
  if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ 
      message: `Invalid file type: ${req.file.mimetype}. Only PDF and common image types are supported.`,
    });
  }

  // 2. File Size Limit Check 
  if (req.file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({ 
      message: `File size limit exceeded. Max allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
    });
  }
  
  // 3. Zero-byte check
  if (req.file.size === 0) {
      return res.status(400).json({ message: 'Cannot process empty file.' });
  }

  next();
};