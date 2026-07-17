// apps/backend/src/middleware/adminCapability.middleware.ts
//
// Capability enforcement (ADMIN_MODULE_FRD.md §8.2, §11.2). Must run AFTER
// authenticate (and typically after requireRole(ADMIN)) in the middleware
// chain — it only checks capability grants, not authentication or role.
//
// Default-deny: a capability with no active grant row is denied, including
// during rollout before AdminCapabilityGrant rows exist. Run
// scripts/adminCapabilityBootstrap.ts once after `prisma db push` to grant
// the current ADMIN operator(s) their capabilities.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { AdminCapability } from '../config/adminCapabilities';
import { hasCapability } from '../services/adminCapability.service';
import { auditLog } from '../lib/logger';
import { securityAuthDenialsTotal } from '../lib/metrics';

export const requireCapability = (capability: AdminCapability) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      securityAuthDenialsTotal.inc({ surface: 'capability_guard', status_code: '401', code: 'AUTH_REQUIRED' });
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'AUTH_REQUIRED' },
      });
      return;
    }

    // Capabilities are only meaningful for the ADMIN role — a non-admin
    // never has an admin capability regardless of grants.
    if (req.user.role !== 'ADMIN') {
      securityAuthDenialsTotal.inc({ surface: 'capability_guard', status_code: '403', code: 'FORBIDDEN' });
      res.status(403).json({
        success: false,
        error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
      });
      return;
    }

    const allowed = await hasCapability(req.user.userId, capability);
    if (!allowed) {
      auditLog('PERMISSION_DENIED', req.user.userId, {
        ip: req.ip,
        path: req.path,
        method: req.method,
        capability,
      });
      securityAuthDenialsTotal.inc({ surface: 'capability_guard', status_code: '403', code: 'CAPABILITY_DENIED' });
      res.status(403).json({
        success: false,
        error: {
          message: `Missing required capability: ${capability}`,
          code: 'CAPABILITY_DENIED',
        },
      });
      return;
    }

    next();
  };
};
