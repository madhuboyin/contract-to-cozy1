// apps/backend/src/services/mfa.service.ts
//
// Business logic for TOTP-based MFA: setup, verification, challenge, and disable.

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { APIError } from '../middleware/error.middleware';
import { auditLog } from '../lib/logger';
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptTotpSecret,
} from '../utils/mfa.util';
import {
  generateMfaChallengeToken,
  generateMfaVerifiedTokenPair,
  verifyMfaChallengeToken,
} from '../utils/jwt.util';

export class MfaService {
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
  async verifySetup(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user)           throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    if (user.mfaEnabled) throw new APIError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED');
    if (!user.mfaSecret) throw new APIError('MFA setup not initiated', 400, 'MFA_SETUP_REQUIRED');

    if (!verifyTotpCode(user.mfaSecret, code)) {
      auditLog('MFA_SETUP_FAILED', userId, { reason: 'invalid_code' });
      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    auditLog('MFA_SETUP_COMPLETE', userId, {});
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
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const MFA_MAX_FAILURES = 5;
    const MFA_LOCKOUT_TTL = 900; // 15 minutes in seconds

    // --- 1. Validate the short-lived MFA challenge token --------------------
    let challengePayload: { userId: string; email: string; role: string };
    try {
      challengePayload = verifyMfaChallengeToken(mfaToken);
    } catch {
      throw new APIError('Invalid or expired MFA challenge token', 401, 'INVALID_MFA_TOKEN');
    }

    const { userId, email, role } = challengePayload;
    const lockoutKey = `mfa:fail:${userId}`;

    // --- 2. Check per-user lockout counter BEFORE touching the TOTP secret --
    const failCount = parseInt((await redis.get(lockoutKey)) ?? '0', 10);
    if (failCount >= MFA_MAX_FAILURES) {
      const ttl = await redis.ttl(lockoutKey);
      auditLog('MFA_ACCOUNT_LOCKED', userId, { failCount, ttlSeconds: ttl });
      throw new APIError(
        `Account temporarily locked after ${MFA_MAX_FAILURES} failed MFA attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        429,
        'MFA_ACCOUNT_LOCKED'
      );
    }

    // --- 3. Load user and verify account status -----------------------------
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true, status: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new APIError('MFA not configured for this account', 400, 'MFA_NOT_CONFIGURED');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new APIError('Account access denied', 403, 'ACCOUNT_DENIED');
    }

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

      if (newCount >= MFA_MAX_FAILURES) {
        auditLog('MFA_ACCOUNT_LOCKED', userId, { failCount: newCount });
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

    const tokens = generateMfaVerifiedTokenPair({
      userId,
      email,
      role,
      mfaEnabled:  true,
      mfaVerified: true,
    });

    return tokens;
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
      throw new APIError('Invalid TOTP code', 401, 'INVALID_MFA_CODE');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    auditLog('MFA_DISABLED', userId, {});
  }
}
