// apps/backend/src/services/mfa.service.ts
//
// Business logic for TOTP-based MFA: setup, verification, challenge, and disable.

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { APIError } from '../middleware/error.middleware';
import { auditLog } from '../lib/logger';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from '../utils/mfa.util';
import {
  generateMfaChallengeToken,
  verifyMfaChallengeToken,
} from '../utils/jwt.util';
import { issueRefreshSessionTokenPair } from '../utils/refresh-session.util';
import { securityMfaFailuresTotal } from '../lib/metrics';

type TokenPair = { accessToken: string; refreshToken: string };

export class MfaService {
  private recordMfaFailure(stage: string, reason: string): void {
    securityMfaFailuresTotal.inc({ stage, reason });
  }

  private async issueVerifiedSessionTokens(input: {
    userId: string;
    email: string;
    role: string;
    tokenVersion: number;
  }): Promise<TokenPair> {
    const issued = issueRefreshSessionTokenPair({
      userId: input.userId,
      email: input.email,
      role: input.role,
      tokenVersion: input.tokenVersion,
      mfaEnabled: true,
      mfaVerified: true,
    });

    await prisma.refreshTokenSession.create({
      data: {
        id: issued.sessionId,
        userId: input.userId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      },
    });

    return issued.tokens;
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const recoveryCodes = generateRecoveryCodes(10);
    const hashedCodes = recoveryCodes.map((code) => ({
      userId,
      codeHash: hashRecoveryCode(code),
    }));

    await prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: hashedCodes });
    });

    return recoveryCodes;
  }

  private async loadMfaUserForChallenge(userId: string): Promise<{ mfaSecret: string; tokenVersion: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true, status: true, tokenVersion: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new APIError('MFA not configured for this account', 400, 'MFA_NOT_CONFIGURED');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new APIError('Account access denied', 403, 'ACCOUNT_DENIED');
    }

    return { mfaSecret: user.mfaSecret, tokenVersion: user.tokenVersion };
  }

  /**
   * Begin MFA setup for a user.
   * Generates a new TOTP secret, stores it (encrypted) in the DB,
   * and returns the otpauth:// URI for the authenticator app to scan.
   * mfaEnabled remains false until verifySetup() is called with a valid code.
   */
  async setup(userId: string): Promise<{ otpauthUri: string; base32Secret: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    });

    if (!user) throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    if (user.mfaEnabled) throw new APIError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED');

    const { base32Secret, encryptedSecret, otpauthUri } = generateTotpSecret(user.email);

    // Store encrypted secret; mfaEnabled stays false until setup is confirmed
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encryptedSecret },
    });

    auditLog('MFA_SETUP_INITIATED', userId, {});

    return { otpauthUri, base32Secret };
  }

  /**
   * Confirm MFA setup by verifying the first TOTP code from the authenticator app.
   * Sets mfaEnabled = true on success.
   */
  async verifySetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user)           throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    if (user.mfaEnabled) throw new APIError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED');
    if (!user.mfaSecret) throw new APIError('MFA setup not initiated', 400, 'MFA_SETUP_REQUIRED');

    if (!verifyTotpCode(user.mfaSecret, code)) {
      auditLog('MFA_SETUP_FAILED', userId, { reason: 'invalid_code' });
      this.recordMfaFailure('setup', 'invalid_totp_code');
      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    const recoveryCodes = await this.replaceRecoveryCodes(userId);

    auditLog('MFA_SETUP_COMPLETE', userId, {});
    return { recoveryCodes };
  }

  /**
   * Return MFA status and remaining (unused) recovery codes for authenticated user.
   */
  async getStatus(userId: string): Promise<{ mfaEnabled: boolean; recoveryCodesRemaining: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true },
    });

    if (!user) throw new APIError('User not found', 404, 'USER_NOT_FOUND');

    if (!user.mfaEnabled) {
      return { mfaEnabled: false, recoveryCodesRemaining: 0 };
    }

    const recoveryCodesRemaining = await prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });

    return { mfaEnabled: true, recoveryCodesRemaining };
  }

  /**
   * Regenerate one-time recovery codes after verifying a valid TOTP code.
   * Existing unused/used recovery codes are invalidated.
   */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user) throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    if (!user.mfaEnabled) throw new APIError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
    if (!user.mfaSecret) throw new APIError('MFA state inconsistent', 500, 'MFA_STATE_ERROR');

    if (!verifyTotpCode(user.mfaSecret, code)) {
      auditLog('MFA_RECOVERY_REGEN_FAILED', userId, { reason: 'invalid_code' });
      this.recordMfaFailure('regenerate_recovery_codes', 'invalid_totp_code');
      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    const recoveryCodes = await this.replaceRecoveryCodes(userId);
    auditLog('MFA_RECOVERY_REGENERATED', userId, {});
    return { recoveryCodes };
  }

  /**
   * Called during login when a user has MFA enabled.
   * Returns a short-lived MFA challenge token that the client must exchange
   * for real tokens by submitting a valid TOTP code.
   */
  issueMfaChallenge(userId: string, email: string, role: string): string {
    return generateMfaChallengeToken(userId, email, role);
  }

  /**
   * Exchange an MFA challenge token + TOTP code for a real access/refresh token pair.
   *
   * Account lockout: after MFA_MAX_FAILURES consecutive wrong codes the
   * userId is blocked for MFA_LOCKOUT_TTL_SECONDS regardless of IP address,
   * preventing brute-force by rotating IPs.
   */
  async verifyChallenge(
    mfaToken: string,
    code: string
  ): Promise<TokenPair> {
    const MFA_MAX_FAILURES = 5;
    const MFA_LOCKOUT_TTL = 900; // 15 minutes in seconds

    // --- 1. Validate the short-lived MFA challenge token --------------------
    let challengePayload: { userId: string; email: string; role: string };
    try {
      challengePayload = verifyMfaChallengeToken(mfaToken);
    } catch {
      this.recordMfaFailure('challenge_totp', 'invalid_or_expired_challenge_token');
      throw new APIError('Invalid or expired MFA challenge token', 401, 'INVALID_MFA_TOKEN');
    }

    const { userId, email, role } = challengePayload;
    const lockoutKey = `mfa:fail:${userId}`;

    // --- 2. Check per-user lockout counter BEFORE touching the TOTP secret --
    const failCount = parseInt((await redis.get(lockoutKey)) ?? '0', 10);
    if (failCount >= MFA_MAX_FAILURES) {
      const ttl = await redis.ttl(lockoutKey);
      auditLog('MFA_ACCOUNT_LOCKED', userId, { failCount, ttlSeconds: ttl });
      this.recordMfaFailure('challenge_totp', 'account_locked');
      throw new APIError(
        `Account temporarily locked after ${MFA_MAX_FAILURES} failed MFA attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        429,
        'MFA_ACCOUNT_LOCKED'
      );
    }

    // --- 3. Load user and verify account status -----------------------------
    const user = await this.loadMfaUserForChallenge(userId);

    // --- 4. Verify TOTP code ------------------------------------------------
    if (!verifyTotpCode(user.mfaSecret, code)) {
      // Increment failure counter; set TTL only on the first failure so the
      // window resets 15 min after the FIRST bad attempt, not the last one.
      const newCount = await redis.incr(lockoutKey);
      if (newCount === 1) {
        await redis.expire(lockoutKey, MFA_LOCKOUT_TTL);
      }

      auditLog('MFA_CHALLENGE_FAILED', userId, {
        reason: 'invalid_code',
        failCount: newCount,
        lockedOut: newCount >= MFA_MAX_FAILURES,
      });
      this.recordMfaFailure('challenge_totp', 'invalid_totp_code');

      if (newCount >= MFA_MAX_FAILURES) {
        auditLog('MFA_ACCOUNT_LOCKED', userId, { failCount: newCount });
        this.recordMfaFailure('challenge_totp', 'account_locked');
        throw new APIError(
          `Account temporarily locked after ${MFA_MAX_FAILURES} failed MFA attempts. Try again in 15 minutes.`,
          429,
          'MFA_ACCOUNT_LOCKED'
        );
      }

      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    // --- 5. Success — clear failure counter and issue tokens ----------------
    await redis.del(lockoutKey);
    auditLog('MFA_CHALLENGE_SUCCESS', userId, {});

    return this.issueVerifiedSessionTokens({
      userId,
      email,
      role,
      tokenVersion: user.tokenVersion,
    });
  }

  /**
   * Exchange an MFA challenge token + one-time recovery code for a token pair.
   * Recovery codes are single-use and immediately consumed on success.
   */
  async verifyRecoveryChallenge(
    mfaToken: string,
    recoveryCode: string
  ): Promise<TokenPair> {
    let challengePayload: { userId: string; email: string; role: string };
    try {
      challengePayload = verifyMfaChallengeToken(mfaToken);
    } catch {
      this.recordMfaFailure('challenge_recovery', 'invalid_or_expired_challenge_token');
      throw new APIError('Invalid or expired MFA challenge token', 401, 'INVALID_MFA_TOKEN');
    }

    const { userId, email, role } = challengePayload;
    const user = await this.loadMfaUserForChallenge(userId);
    const hashedCode = hashRecoveryCode(recoveryCode);

    const consumeResult = await prisma.mfaRecoveryCode.updateMany({
      where: {
        userId,
        codeHash: hashedCode,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    if (consumeResult.count !== 1) {
      auditLog('MFA_RECOVERY_CHALLENGE_FAILED', userId, { reason: 'invalid_recovery_code' });
      this.recordMfaFailure('challenge_recovery', 'invalid_recovery_code');
      throw new APIError('Invalid recovery code', 401, 'INVALID_RECOVERY_CODE');
    }

    auditLog('MFA_RECOVERY_CHALLENGE_SUCCESS', userId, {});
    return this.issueVerifiedSessionTokens({
      userId,
      email,
      role,
      tokenVersion: user.tokenVersion,
    });
  }

  /**
   * Disable MFA for a user after verifying their current TOTP code.
   */
  async disable(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user)            throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    if (!user.mfaEnabled) throw new APIError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
    if (!user.mfaSecret)  throw new APIError('MFA state inconsistent', 500, 'MFA_STATE_ERROR');

    if (!verifyTotpCode(user.mfaSecret, code)) {
      auditLog('MFA_DISABLE_FAILED', userId, { reason: 'invalid_code' });
      this.recordMfaFailure('disable', 'invalid_totp_code');
      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: false, mfaSecret: null },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    });

    auditLog('MFA_DISABLED', userId, {});
  }
}
