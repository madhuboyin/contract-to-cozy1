import { NextFunction, Response } from 'express';
import { CustomRequest } from '../../../types';
import {
  getPersonalizationCapabilities,
  PersonalizationCapabilities,
} from '../domain/capabilityPolicy';

export function requirePersonalizationCapability(capability: keyof PersonalizationCapabilities) {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    if (!req.householdRole || !getPersonalizationCapabilities(req.householdRole)[capability]) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERSONALIZATION_CAPABILITY_REQUIRED', message: 'Insufficient personalization permission.' },
      });
    }
    return next();
  };
}
