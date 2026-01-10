// apps/backend/src/middleware/recallMatchAuth.middleware.ts
import type { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import type { CustomRequest } from '../types';

/**
 * Ensures :matchId belongs to :propertyId.
 * Must run AFTER propertyAuthMiddleware (so property access is already validated).
 */
export async function recallMatchAuthMiddleware(req: CustomRequest, res: Response, next: NextFunction) {
  const { propertyId, matchId } = req.params as { propertyId: string; matchId: string };

  if (!propertyId || !matchId) {
    return res.status(400).json({ message: 'propertyId and matchId are required' });
  }

  const match = await prisma.recallMatch.findFirst({
    where: { id: matchId, propertyId },
    select: { id: true },
  });

  if (!match) {
    return res.status(404).json({ message: 'Recall match not found for this property' });
  }

  return next();
}
