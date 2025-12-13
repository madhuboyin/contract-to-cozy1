// apps/backend/src/middleware/propertyAuth.middleware.ts (MODIFIED)

import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { CustomRequest } from '../types'; // <-- FIXED IMPORT (Now correctly exported from index.ts)

/**
 * Middleware to check if the authenticated user has ownership/access to the propertyId 
 * provided in the route parameters. This prevents Insecure Direct Object Reference (IDOR).
 */
export const propertyAuthMiddleware = async (
  req: CustomRequest, // <-- USING CustomRequest
  res: Response,
  next: NextFunction
) => {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  if (!propertyId || !userId) {
    // Relying on preceding middleware to catch missing propertyId or auth failures, 
    // but keeping basic checks here for robustness.
    return res.status(401).json({ message: 'Authentication required and Property ID must be provided.' });
  }

  try {
    // CRITICAL SECURITY FIX: Use nested relation check instead of non-existent ownerId field.
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { // <-- CHECK THE RELATED HOMEOWNER PROFILE
          userId: userId,    // <-- CHECK IF THE PROFILE IS OWNED BY THE AUTHENTICATED USER
        },
      },
    });

    if (!property) {
      // Security by obscurity: return 404/Not Found instead of 403/Forbidden 
      // to avoid leaking which IDs belong to which users.
      return res.status(404).json({ message: 'Property not found or access denied.' });
    }

    // Attach the property data to the request for easy access in the controller/service layer
    req.property = property;
    next();
  } catch (error) {
    console.error(`Property Auth Error:`, error);
    res.status(500).json({ message: 'Internal server error during property authorization check.' });
  }
};