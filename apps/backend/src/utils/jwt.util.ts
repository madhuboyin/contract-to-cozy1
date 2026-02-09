// apps/backend/src/utils/jwt.util.ts

import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config'; // Keep import for expiration times and other keys

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface PurposeTokenPayload extends jwt.JwtPayload {
  userId: string;
  email: string;
  purpose: 'email_verification' | 'password_reset';
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

const parseAuthPayload = (decoded: string | jwt.JwtPayload): JWTPayload => {
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const { userId, email, role } = decoded;
  if (typeof userId !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload');
  }

  return { userId, email, role };
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
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: jwtConfig.accessToken.expiresIn,
  } as jwt.SignOptions);
};

/**
 * Generate refresh token (FIXED to use ENV variable for signing)
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  // Uses the same main secret for consistency and reliability
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: jwtConfig.refreshToken.expiresIn,
  } as jwt.SignOptions);
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (payload: JWTPayload): TokenPair => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

/**
 * Verify access token (FIXED to use ENV variable for verification)
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return parseAuthPayload(decoded);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token (FIXED to use ENV variable for verification)
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return parseAuthPayload(decoded);
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
