// apps/backend/src/types/express-extension.types.ts

import { Request } from 'express';
import { Property } from '@prisma/client'; // Import Prisma-generated Property model
import { AuthUser } from './auth.types'; // Import AuthUser type

/**
 * Custom Request type extending the Express Request object 
 * to include authenticated user data (req.user) and resolved 
 * property data (req.property) for authorization checks.
 */
export interface CustomRequest extends Request {
  user?: AuthUser; // Use AuthUser type which includes userId, email, role, etc.
  property?: Property; // Added by propertyAuthMiddleware
}