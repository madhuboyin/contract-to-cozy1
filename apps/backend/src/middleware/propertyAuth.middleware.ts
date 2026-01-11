// apps/backend/src/middleware/propertyAuth.middleware.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { CustomRequest } from '../types';

export const propertyAuthMiddleware = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
) => {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!propertyId) {
    return res.status(400).json({ message: 'Property ID must be provided.' });
  }

  try {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true }, // add more fields only if needed
    });

    if (!property) {
      return res.status(404).json({ message: 'Property not found or access denied.' });
    }

    req.property = property as any;
    return next();
  } catch (error) {
    console.error('Property Auth Error:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during property authorization check.' });
  }
};
