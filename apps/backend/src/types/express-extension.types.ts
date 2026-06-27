// apps/backend/src/types/express-extension.types.ts

import { Request } from 'express';
import { Property, HouseholdRole } from '@prisma/client';
import { AuthUser } from './auth.types';

export interface CustomRequest extends Request {
  user?: AuthUser;
  property?: Property;
  householdRole?: HouseholdRole; // Added by propertyAuthMiddleware for household-aware routes
}