import { Response, NextFunction } from 'express';
import { HouseholdRole } from '@prisma/client';
import { CustomRequest } from '../types';
import { ROLE_RANK } from '../services/propertyAccess.service';

export { ROLE_RANK };

export function requireRole(minRole: HouseholdRole) {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    const role = req.householdRole;
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ message: 'Insufficient household role.' });
    }
    return next();
  };
}
