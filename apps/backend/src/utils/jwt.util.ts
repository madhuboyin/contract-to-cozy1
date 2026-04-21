// apps/backend/src/utils/jwt.util.ts

import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config'; // Keep import for expiration times and other keys

type TokenType = 'access' | 'refresh';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  /** Snapshot of User.tokenVersion at the time of issue.
   *  The auth middleware rejects tokens whose version is stale. */
  tokenVersion?: number;
  /** Whether this account has TOTP-MFA configured and active. */
  mfaEnabled?: boolean;
  /** True only when the MFA challenge was completed in this session. */
  mfaVerified?: boolean;
}

export interface RefreshTokenPayload extends JWTPayload {
  tokenType: 'refresh';
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface PurposeTokenPayload extends jwt.JwtPayload {
  userId: string;
  email: string;
  purpose: 'email_verification' | 'password_reset' | 'mfa_challenge';
  role?: string;
}

// CRITICAL HELPER: Ensures we get the secret directly from the environment
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail-fast if the master secret is missing
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
  }
  return secret;
};

const parseBaseAuthPayload = (decoded: jwt.JwtPayload): JWTPayload => {
  const { userId, email, role, tokenVersion, mfaEnabled, mfaVerified } = decoded as any;
  if (typeof userId !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload');
  }

  return {
    userId,
    email,
    role,
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : undefined,
    mfaEnabled: typeof mfaEnabled === 'boolean' ? mfaEnabled : undefined,
    mfaVerified: typeof mfaVerified === 'boolean' ? mfaVerified : undefined,
  };
};

const parseAccessPayload = (decoded: string | jwt.JwtPayload): JWTPayload => {
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const payload = decoded as jwt.JwtPayload;
  if (payload.tokenType !== 'access') {
    throw new Error('Invalid token type');
  }

  return parseBaseAuthPayload(payload);
};

const parseRefreshPayload = (decoded: string | jwt.JwtPayload): RefreshTokenPayload => {
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const payload = decoded as jwt.JwtPayload;
  if (payload.tokenType !== 'refresh' || typeof payload.sessionId !== 'string') {
    throw new Error('Invalid token payload');
  }

  return {
    ...parseBaseAuthPayload(payload),
    tokenType: 'refresh',
    sessionId: payload.sessionId,
  };
};

const buildBaseClaims = (payload: JWTPayload): JWTPayload => {
  const { userId, email, role, tokenVersion, mfaEnabled, mfaVerified } = payload;
  if (typeof userId !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload');
  }

  return {
    userId,
    email,
    role,
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : undefined,
    mfaEnabled: typeof mfaEnabled === 'boolean' ? mfaEnabled : undefined,
    mfaVerified: typeof mfaVerified === 'boolean' ? mfaVerified : undefined,
  };
};

const verifyPurposeToken = (
  token: string,
  secret: string,
  expectedPurpose: PurposeTokenPayload['purpose']
): { userId: string; email: string } => {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const payload = decoded as jwt.JwtPayload;
  if (
    payload.purpose !== expectedPurpose ||
    typeof payload.userId !== 'string' ||
    typeof payload.email !== 'string'
  ) {
    throw new Error('Invalid token purpose');
  }

  return { userId: payload.userId, email: payload.email };
};


/**
 * Generate access token (FIXED to use ENV variable for signing)
 */
export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(
    { ...buildBaseClaims(payload), tokenType: 'access' as TokenType },
    getJwtSecret(),
    {
      expiresIn: jwtConfig.accessToken.expiresIn,
    } as jwt.SignOptions
  );
};

/**
 * Generate refresh token (FIXED to use ENV variable for signing)
 */
export const generateRefreshToken = (payload: JWTPayload, refreshSessionId: string): string => {
  // Uses the same main secret for consistency and reliability
  return jwt.sign(
    {
      ...buildBaseClaims(payload),
      tokenType: 'refresh' as TokenType,
      sessionId: refreshSessionId,
      jti: randomUUID(),
    },
    getJwtSecret(),
    {
      expiresIn: jwtConfig.refreshToken.expiresIn,
    } as jwt.SignOptions
  );
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (payload: JWTPayload, refreshSessionId: string): TokenPair => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload, refreshSessionId),
  };
};

/**
 * Verify access token (FIXED to use ENV variable for verification)
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return parseAccessPayload(decoded);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token (FIXED to use ENV variable for verification)
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return parseRefreshPayload(decoded);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Generate email verification token (Retained original logic for secondary secrets)
 */
export const generateEmailVerificationToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email, purpose: 'email_verification' },
    jwtConfig.emailVerificationToken.secret, 
    { expiresIn: jwtConfig.emailVerificationToken.expiresIn } as jwt.SignOptions
  );
};

/**
 * Verify email verification token
 */
export const verifyEmailVerificationToken = (token: string): { userId: string; email: string } => {
  try {
    return verifyPurposeToken(token, jwtConfig.emailVerificationToken.secret, 'email_verification');
  } catch (error) {
    throw new Error('Invalid or expired email verification token');
  }
};

/**
 * Generate password reset token
 */
export const generatePasswordResetToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email, purpose: 'password_reset' },
    jwtConfig.passwordResetToken.secret,
    { expiresIn: jwtConfig.passwordResetToken.expiresIn } as jwt.SignOptions
  );
};

/**
 * Verify password reset token
 */
export const verifyPasswordResetToken = (token: string): { userId: string; email: string } => {
  try {
    return verifyPurposeToken(token, jwtConfig.passwordResetToken.secret, 'password_reset');
  } catch (error) {
    throw new Error('Invalid or expired password reset token');
  }
};

/**
 * Decode token without verification (useful for debugging)
 */
export const decodeToken = (token: string): jwt.JwtPayload | string | null => {
  return jwt.decode(token);
};

// ---------------------------------------------------------------------------
// MFA helpers
// ---------------------------------------------------------------------------

/**
 * Generate a short-lived (5 min) MFA challenge token.
 * Issued after a successful password check when the account has MFA enabled.
 * Must be exchanged for real tokens via POST /api/auth/mfa/challenge.
 */
export const generateMfaChallengeToken = (
  userId: string,
  email: string,
  role: string
): string => {
  return jwt.sign(
    { userId, email, role, purpose: 'mfa_challenge' },
    jwtConfig.mfaChallengeToken.secret,
    { expiresIn: jwtConfig.mfaChallengeToken.expiresIn } as jwt.SignOptions
  );
};

/**
 * Verify an MFA challenge token and return its payload.
 */
export const verifyMfaChallengeToken = (
  token: string
): { userId: string; email: string; role: string } => {
  try {
    const decoded = jwt.verify(token, jwtConfig.mfaChallengeToken.secret);
    if (typeof decoded === 'string') throw new Error('Invalid payload');

    const payload = decoded as PurposeTokenPayload;
    if (
      payload.purpose !== 'mfa_challenge' ||
      typeof payload.userId !== 'string' ||
      typeof payload.email  !== 'string' ||
      typeof payload.role   !== 'string'
    ) {
      throw new Error('Invalid token purpose');
    }
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    throw new Error('Invalid or expired MFA challenge token');
  }
};

/**
 * Generate access + refresh token pair with mfaVerified: true.
 * Use this instead of generateTokenPair when the full MFA challenge has
 * been completed.
 */
export const generateMfaVerifiedTokenPair = (
  payload: JWTPayload,
  refreshSessionId: string
): TokenPair => {
  return generateTokenPair({ ...payload, mfaVerified: true }, refreshSessionId);
};
