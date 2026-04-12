// apps/backend/src/middleware/auth.middleware.ts

import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types/auth.types';
import { verifyAccessToken } from '../utils/jwt.util';
import { prisma } from '../lib/prisma';
import { auditLog } from '../lib/logger';

// NOTE: AuthRequest type is defined in '../types/auth.types' and is assumed
// to have been updated to include homeownerProfile and providerProfile on req.user.

/**
 * Shared implementation for authenticate and authenticateAllowUnverified.
 * requireEmailVerified=true  → used by all application routes (the default)
 * requireEmailVerified=false → used only by auth-flow routes that unverified
 *                              users must be able to reach (me, logout,
 *                              resend-verification).
 */
async function _authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  requireEmailVerified: boolean
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      auditLog('AUTH_NO_TOKEN', null, { ip: req.ip, path: req.path, method: req.method });
      res.status(401).json({
        success: false,
        error: {
          message: 'No token provided',
          code: 'NO_TOKEN',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    // Fetch user and include profile IDs
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        emailVerified: true,
        homeownerProfile: { select: { id: true } },
        providerProfile: { select: { id: true } },
      },
    });

    if (!user) {
      auditLog('AUTH_USER_NOT_FOUND', decoded.userId, { ip: req.ip, path: req.path, method: req.method });
      res.status(401).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        },
      });
      return;
    }

    if (user.status === 'SUSPENDED') {
      auditLog('AUTH_ACCOUNT_SUSPENDED', user.id, { ip: req.ip, path: req.path, method: req.method });
      res.status(403).json({
        success: false,
        error: {
          message: 'Account suspended',
          code: 'ACCOUNT_SUSPENDED',
        },
      });
      return;
    }

    if (user.status === 'INACTIVE') {
      auditLog('AUTH_ACCOUNT_INACTIVE', user.id, { ip: req.ip, path: req.path, method: req.method });
      res.status(403).json({
        success: false,
        error: {
          message: 'Account inactive',
          code: 'ACCOUNT_INACTIVE',
        },
      });
      return;
    }

    // Email verification gate — blocks unverified users from all application
    // routes. Auth-flow routes (/me, /logout, /resend-verification) bypass this
    // by calling authenticateAllowUnverified instead.
    if (requireEmailVerified && !user.emailVerified) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Email verification required',
          code: 'EMAIL_NOT_VERIFIED',
        },
      });
      return;
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified,
      status: user.status as any,
      homeownerProfile: user.homeownerProfile,
      providerProfile: user.providerProfile,
    };

    next();
  } catch (error: any) {
    auditLog('AUTH_INVALID_TOKEN', null, { ip: req.ip, path: req.path, method: req.method, reason: error.name });
    res.status(401).json({
      success: false,
      error: {
        message: error.message || 'Invalid token',
        code: 'INVALID_TOKEN',
      },
    });
  }
}

/**
 * Standard authentication middleware.
 * Verifies JWT, checks account status, and enforces email verification.
 * Use this on all application routes.
 */
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => _authenticate(req, res, next, true);

/**
 * Authentication middleware that skips the email verification check.
 * Use ONLY for auth-flow endpoints that unverified users must reach:
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 *   POST /api/auth/resend-verification
 */
export const authenticateAllowUnverified = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => _authenticate(req, res, next, false);


/**
 * Middleware to restrict access only to users with the HOMEOWNER role 
 * and an existing homeowner profile ID (required for home management data).
 */
export const restrictToHomeowner = ( // <--- MUST have 'export' here
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): void => {
  if (
    !req.user || 
    req.user.role !== 'HOMEOWNER' || 
    !req.user.homeownerProfile?.id // Checks if the profile ID is present
  ) {
    res.status(403).json({ 
      success: false, 
      error: {
        message: 'Access denied. Must be an authenticated homeowner with a profile.',
        code: 'HOMEOWNER_PROFILE_REQUIRED',
      }
    });
    return;
  }
  // If check passes, continue
  next();
};


/**
 * Middleware to require specific roles
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED',
        },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN',
        },
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require email verification
 */
export const requireEmailVerification = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      },
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      success: false,
      error: {
        message: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      },
    });
    return;
  }

  next();
};

/**
 * Optional authentication - doesn't fail if no token provided
 * But validates token if present
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        emailVerified: true,
        homeownerProfile: { select: { id: true } },
        providerProfile: { select: { id: true } },
      },
    });

    if (user && user.status === 'ACTIVE') {
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role as UserRole,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        status: user.status as any,
        homeownerProfile: user.homeownerProfile,
        providerProfile: user.providerProfile,
      };
    }

    next();
  } catch (error) {
    // Invalid token, but continue without user
    next();
  }
};