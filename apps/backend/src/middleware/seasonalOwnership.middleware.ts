import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types/auth.types';
import { resolvePropertyAccess } from '../services/propertyAccess.service';

export const requireSeasonalChecklistOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const checklistId = req.params.checklistId;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (!checklistId) {
    res.status(400).json({ success: false, message: 'checklistId is required' });
    return;
  }

  const checklist = await prisma.seasonalChecklist.findUnique({
    where: { id: checklistId },
    select: { propertyId: true },
  });

  if (!checklist) {
    res.status(404).json({ success: false, message: 'Seasonal checklist not found' });
    return;
  }

  // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
  const access = await resolvePropertyAccess(userId, checklist.propertyId);
  if (!access) {
    res.status(404).json({ success: false, message: 'Seasonal checklist not found' });
    return;
  }

  next();
};

export const requireSeasonalItemOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const itemId = req.params.itemId;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (!itemId) {
    res.status(400).json({ success: false, message: 'itemId is required' });
    return;
  }

  const item = await prisma.seasonalChecklistItem.findUnique({
    where: { id: itemId },
    select: { propertyId: true },
  });

  if (!item) {
    res.status(404).json({ success: false, message: 'Seasonal checklist item not found' });
    return;
  }

  // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
  const access = await resolvePropertyAccess(userId, item.propertyId);
  if (!access) {
    res.status(404).json({ success: false, message: 'Seasonal checklist item not found' });
    return;
  }

  next();
};
