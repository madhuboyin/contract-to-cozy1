// apps/backend/src/middleware/error.middleware.ts
// FIX: Add proper logging for Prisma validation errors

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import * as Sentry from '@sentry/node';
import { logger } from '../lib/logger';
/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'APIError';
  }
}

/**
 * Extracts a concise error message from Prisma validation error output.
 * Prisma validation errors contain a full dump of the call stack and data,
 * which makes logs unreadable.
 */
function extractPrismaMessage(message: string): string {
  if (!message) return 'Prisma validation error';
  
  // Find the last sentence/phrase after double newlines which usually
  // contains the actual validation failure.
  const parts = message.split('\n\n');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart) return lastPart;
  }
  
  // Fallback to the first line if it's not the generic invocation message
  const lines = message.split('\n').filter(l => l.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine && !firstLine.includes('invocation:')) return firstLine;
  }

  return 'Prisma validation error';
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isProd = process.env.NODE_ENV === 'production';
  const apiErr = error as any;

  // ✅ Correct status code selection (fix precedence bug)
  let statusCode =
    typeof apiErr?.statusCode === 'number'
      ? apiErr.statusCode
      : (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  let message = apiErr?.message || error.message || 'An unexpected error occurred';
  let errorCode = apiErr?.code || 'INTERNAL_ERROR';

  // Capture unexpected server errors in Sentry (5xx only — 4xx are client errors,
  // not actionable bugs, and would add noise to the Sentry issue stream).
  if (statusCode >= 500) {
    Sentry.captureException(error, {
      extra: { path: req.path, method: req.method, statusCode },
    });
  }

  // Structured error log — redact fields are handled by pino's redact config
  // Note: requestId is automatically added by logger's mixin via AsyncLocalStorage
  logger.error({
    name: error.name,
    message: error.message,
    code: apiErr?.code,
    statusCode,
    path: req.path,
    method: req.method,
    ...(isProd ? {} : { stack: error.stack }),
  }, 'Request error');

  // Handle Serialization Crash
  if (
    error instanceof TypeError &&
    (error.message.includes('BigInt') || error.message.includes('Decimal'))
  ) {
    statusCode = 500;
    message = 'Data serialization failed. Unconverted Decimal/BigInt type detected.';
    errorCode = 'JSON_SERIALIZATION_CRASH';
    logger.error({ message: error.message, ...(isProd ? {} : { stack: error.stack }) }, 'FATAL JSON SERIALIZATION CRASH');
  }

  // ✅ Handle custom API errors first
  if (error instanceof APIError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    });
    return;
  }

  // Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          message: `Duplicate entry for field: ${(error.meta?.target as string[])?.join(', ')}`,
          code: 'DUPLICATE_ENTRY',
        },
      });
      return;
    }

    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid reference to related record',
          code: 'INVALID_REFERENCE',
        },
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          message: 'Record not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }
  }

  // Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    const conciseMessage = extractPrismaMessage(error.message);
    
    logger.error({
      prismaMessage: conciseMessage,
      fullPrismaError: error.message, // Keep for full debugging in structured log but separate from concise message
      path: req.path,
      method: req.method,
      ...(isProd ? {} : { params: req.params, stack: error.stack }),
    }, 'Prisma validation error');

    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid data provided',
        code: 'VALIDATION_ERROR',
        details: isProd ? conciseMessage : error.message,
      },
    });
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' },
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: { message: 'Token expired', code: 'TOKEN_EXPIRED' },
    });
    return;
  }

  // Multer errors
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      success: false,
      error: { message: error.message || 'Multer error occurred', code: 'MULTER_ERROR' },
    });
    return;
  }

  // Default
  res.status(statusCode).json({
    success: false,
    error: {
      message: isProd ? 'An unexpected error occurred' : message,
      code: errorCode,
      ...(isProd ? {} : { stack: error.stack }),
    },
  });
};

/**
 * 404 handler for unknown routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  res.status(404);
  next(new APIError(`Not Found - ${req.originalUrl}`, 404, 'NOT_FOUND_ROUTE'));
};