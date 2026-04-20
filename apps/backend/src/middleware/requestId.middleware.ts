// apps/backend/src/middleware/requestId.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContextStorage } from '../lib/requestContext';

/**
 * Middleware to add a unique Request ID to each request.
 * This ID is added to the request object and returned in the 'X-Request-Id' header.
 * The ID is also stored in AsyncLocalStorage for automated log correlation.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Attach to request object
  (req as any).id = requestId;
  
  // Set in response header
  res.setHeader('X-Request-Id', requestId);
  
  // Run the rest of the request within the async context
  requestContextStorage.run({ requestId }, () => {
    next();
  });
};
