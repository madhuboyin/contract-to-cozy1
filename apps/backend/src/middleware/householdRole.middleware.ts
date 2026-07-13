import { Response, NextFunction } from 'express';
import { HouseholdRole } from '@prisma/client';
import { CustomRequest } from '../types';

export const ROLE_RANK: Record<HouseholdRole, number> = {
  VIEWER: 0,
  CONTRIBUTOR: 1,
  OWNER: 2,
};

export function requireRole(minRole: HouseholdRole) {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    const role = req.householdRole;
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ message: 'Insufficient household role.' });
    }
    return next();
  };
}
