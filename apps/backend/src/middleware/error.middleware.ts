import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

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
  let statusCode = (error as APIError).statusCode || res.statusCode !== 200 ? res.statusCode : 500;
  let message = error.message;
  let errorCode = (error as APIError).code || 'INTERNAL_ERROR';

  // Log error for debugging
  console.error('Error:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // --- START: CRITICAL ADDITION FOR SERIALIZATION/PRISMA CRASH ---
  // Handle Serialization Crash (The most likely cause of generic 500s on Home Management)
  if (
    error instanceof TypeError && 
    (error.message.includes('BigInt') || error.message.includes('Decimal'))
  ) {
    statusCode = 500;
    message = 'Data serialization failed. Unconverted Decimal/BigInt type detected.';
    errorCode = 'JSON_SERIALIZATION_CRASH';
    console.error('FATAL JSON SERIALIZATION CRASH: Error in home-management due to unconverted Decimal/BigInt type.', error);
  }
  // --- END: CRITICAL ADDITION FOR SERIALIZATION/PRISMA CRASH ---

  // Handle custom API errors
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

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
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

    // Foreign key constraint violation
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
    
    // Other known Prisma errors (e.g., P2025 - not found)
    if (error.code === 'P2025') {
        res.status(404).json({
          success: false,
          error: {
            message: 'Record not found.',
            code: 'NOT_FOUND',
          },
        });
        return;
    }
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid data provided',
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      },
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      },
    });
    return;
  }

  // Default error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : message, // Use the extracted/default message
      code: errorCode,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
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