// apps/backend/src/controllers/mfa.controller.ts
//
// HTTP layer for TOTP-based MFA: delegates all business logic to MfaService.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { MfaService } from '../services/mfa.service';
import { auditLog } from '../lib/logger';

const mfaService = new MfaService();

/**
 * POST /api/auth/mfa/setup
 * Begin TOTP setup — returns otpauth URI + base32 secret.
 * Requires: authenticated, mfaEnabled=false.
 */
export async function setupMfa(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await mfaService.setup(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/mfa/setup/verify
 * Confirm TOTP setup by submitting the first code.
 * Sets mfaEnabled=true on success.
 */
export async function verifyMfaSetup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { code } = req.body as { code: string };
    const result = await mfaService.verifySetup(userId, code);
    res.status(200).json({
      success: true,
      data: {
        message: 'MFA enabled successfully',
        recoveryCodes: result.recoveryCodes,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/mfa/challenge
 * Exchange an MFA challenge token + TOTP code for a real access/refresh pair.
 * No authentication middleware — the mfaToken itself is the credential.
 */
export async function verifyMfaChallenge(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { mfaToken, code } = req.body as { mfaToken: string; code: string };
    auditLog('MFA_CHALLENGE_ATTEMPT', null, { ip: req.ip });
    const tokens = await mfaService.verifyChallenge(mfaToken, code);
    res.status(200).json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/mfa/challenge/recovery
 * Exchange an MFA challenge token + recovery code for real access/refresh tokens.
 */
export async function verifyMfaRecoveryChallenge(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { mfaToken, recoveryCode } = req.body as { mfaToken: string; recoveryCode: string };
    auditLog('MFA_RECOVERY_CHALLENGE_ATTEMPT', null, { ip: req.ip });
    const tokens = await mfaService.verifyRecoveryChallenge(mfaToken, recoveryCode);
    res.status(200).json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/mfa/disable
 * Disable MFA after verifying the current TOTP code.
 * Requires: authenticated, mfaEnabled=true.
 */
export async function disableMfa(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { code } = req.body as { code: string };
    await mfaService.disable(userId, code);
    res.status(200).json({ success: true, data: { message: 'MFA disabled successfully' } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/mfa/status
 * Return MFA enabled status + remaining recovery code count for authenticated user.
 */
export async function getMfaStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const data = await mfaService.getStatus(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/mfa/recovery-codes/regenerate
 * Regenerate one-time recovery codes after verifying current TOTP code.
 */
export async function regenerateMfaRecoveryCodes(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { code } = req.body as { code: string };
    const data = await mfaService.regenerateRecoveryCodes(userId, code);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
