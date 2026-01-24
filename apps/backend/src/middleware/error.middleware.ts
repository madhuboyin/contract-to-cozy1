// apps/backend/src/middleware/error.middleware.ts
// FIX: Add proper logging for Prisma validation errors

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
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

  // ✅ Safe logging
  console.error('Error:', {
    name: error.name,
    message: error.message,
    code: apiErr?.code,
    statusCode,
    path: req.path,
    method: req.method,
    ...(isProd ? {} : { stack: error.stack }),
  });

  // Handle Serialization Crash
  if (
    error instanceof TypeError &&
    (error.message.includes('BigInt') || error.message.includes('Decimal'))
  ) {
    statusCode = 500;
    message = 'Data serialization failed. Unconverted Decimal/BigInt type detected.';
    errorCode = 'JSON_SERIALIZATION_CRASH';
    console.error('FATAL JSON SERIALIZATION CRASH:', { message: error.message, ...(isProd ? {} : { stack: error.stack }) });
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
    console.error('PRISMA VALIDATION ERROR:', {
      message: error.message,
      path: req.path,
      method: req.method,
      ...(isProd ? {} : { body: req.body, params: req.params, stack: error.stack }),
    });

    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid data provided',
        code: 'VALIDATION_ERROR',
        ...(isProd ? {} : { details: error.message }),
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