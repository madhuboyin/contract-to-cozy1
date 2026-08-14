import type { NextFunction, Response } from 'express';
import { auditLog } from '../lib/logger';
import { securityAuthDenialsTotal } from '../lib/metrics';
import { readAskOperationalControls } from '../config/askOperationalControls';
import {
  ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED,
  ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE,
  ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
  ASK_ACCOUNT_ROLE_NOT_ELIGIBLE_MESSAGE,
  isAskAccountRoleEligible,
} from '../services/ask/askAccountEligibility';
import type { AuthRequest } from '../types/auth.types';

/**
 * Account-surface policy for homeowner Ask Cozy. Property and household-role
 * authorization remain separate and are enforced later by the orchestrator.
 */
export function requireAskEligibleAccount(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    securityAuthDenialsTotal.inc({ surface: 'ask_account_guard', status_code: '401', code: 'AUTH_REQUIRED' });
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }

  if (!readAskOperationalControls().accountRoleEligibilityEnabled) {
    securityAuthDenialsTotal.inc({
      surface: 'ask_account_guard',
      status_code: '503',
      code: ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED,
    });
    res.status(503).json({
      success: false,
      error: {
        code: ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED,
        message: ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE,
      },
    });
    return;
  }

  if (!isAskAccountRoleEligible(req.user.role)) {
    auditLog('PERMISSION_DENIED', req.user.userId, {
      ip: req.ip,
      path: req.path,
      method: req.method,
      role: req.user.role,
      surface: 'ASK',
      reason: 'account_role_not_eligible',
    });
    securityAuthDenialsTotal.inc({
      surface: 'ask_account_guard',
      status_code: '403',
      code: ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
    });
    res.status(403).json({
      success: false,
      error: {
        code: ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
        message: ASK_ACCOUNT_ROLE_NOT_ELIGIBLE_MESSAGE,
      },
    });
    return;
  }

  next();
}
