import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config'; // Keep import for other config data (expiresIn)

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Helper to ensure the JWT_SECRET is available and cast to string
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // This will cause a crash on service startup if the variable is missing, which is correct
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
  }
  return secret;
};


/**
 * Generate access token (FIXED to use ENV variable)
 */
export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: jwtConfig.accessToken.expiresIn,
  } as jwt.SignOptions);
};

/**
 * Generate refresh token (FIXED to use ENV variable)
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  // NOTE: Assuming refresh tokens use the same main JWT_SECRET, which is a common practice.
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
 * Verify access token (FIXED to use ENV variable)
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    // CRITICAL FIX: Use the directly verified environment variable secret
    const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token (FIXED to use ENV variable)
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    // CRITICAL FIX: Use the directly verified environment variable secret
    const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Generate email verification token (FIXED to use ENV variable)
 */
export const generateEmailVerificationToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email, purpose: 'email_verification' },
    jwtConfig.emailVerificationToken.secret, // Assuming specific secrets for these are correctly loaded via config
    { expiresIn: jwtConfig.emailVerificationToken.expiresIn } as jwt.SignOptions
  );
};

/**
 * Verify email verification token
 */
export const verifyEmailVerificationToken = (token: string): { userId: string; email: string } => {
  try {
    const decoded = jwt.verify(token, jwtConfig.emailVerificationToken.secret) as any;
    if (decoded.purpose !== 'email_verification') {
      throw new Error('Invalid token purpose');
    }
    return { userId: decoded.userId, email: decoded.email };
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
    const decoded = jwt.verify(token, jwtConfig.passwordResetToken.secret) as any;
    if (decoded.purpose !== 'password_reset') {
      throw new Error('Invalid token purpose');
    }
    return { userId: decoded.userId, email: decoded.email };
  } catch (error) {
    throw new Error('Invalid or expired password reset token');
  }
};

/**
 * Decode token without verification (useful for debugging)
 */
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};