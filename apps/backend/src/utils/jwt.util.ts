import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access token
 */
export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, jwtConfig.accessToken.secret, {
    expiresIn: jwtConfig.accessToken.expiresIn,
  } as jwt.SignOptions);
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, jwtConfig.refreshToken.secret, {
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
 * Verify access token
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, jwtConfig.accessToken.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, jwtConfig.refreshToken.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Generate email verification token
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
