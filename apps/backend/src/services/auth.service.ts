import { DeliveryStatus, NotificationChannel, ProviderStatus } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/password.util';
import {
  JWTPayload,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  generateMfaChallengeToken,
  verifyRefreshToken,
  verifyEmailVerificationToken,
  verifyPasswordResetToken,
} from '../utils/jwt.util';
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '../utils/validators';
import { APIError } from '../middleware/error.middleware';
import {
  MfaChallengeResponse,
  RegisterResponse,
  UserResponse,
} from '../types/auth.types';
import {
  issueRefreshSessionTokenPair,
  hashRefreshToken,
} from '../utils/refresh-session.util';

import { prisma } from '../lib/prisma';

// Bumped whenever the Terms of Service / Privacy Policy content materially
// changes, so we can tell which version a given user's tosAcceptedAt covers.
const TOS_VERSION = '2026-07-09';
import { logger, auditLog } from '../lib/logger';
import { securityTokenReuseTotal } from '../lib/metrics';

export class AuthService {
  private buildSessionUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    emailVerified: boolean;
    status: string;
    mfaEnabled?: boolean;
    createdAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as any,
      emailVerified: user.emailVerified,
      status: user.status as any,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private getEmailVerificationBaseUrl(): string {
    const explicitBaseUrl =
      process.env.EMAIL_VERIFICATION_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_BASE_URL;

    if (explicitBaseUrl && explicitBaseUrl.trim().length > 0) {
      return explicitBaseUrl.trim().replace(/\/+$/, '');
    }

    const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (allowedOrigins.length > 0) {
      return allowedOrigins[0].replace(/\/+$/, '');
    }

    return 'http://localhost:3000';
  }

  private buildEmailVerificationLink(verificationToken: string): string {
    const baseUrl = this.getEmailVerificationBaseUrl();
    return `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  }

  private async enqueueVerificationDelivery(user: {
    id: string;
    email: string;
  }, verificationToken: string): Promise<void> {
    const verifyLink = this.buildEmailVerificationLink(verificationToken);

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION_REQUIRED',
        title: 'Verify your Contract to Cozy email',
        message: 'Use the secure link to verify your email address and finish activating your account.',
        actionUrl: verifyLink,
        metadata: {
          priority: 'HIGH',
          category: 'AUTH',
          template: 'EMAIL_VERIFICATION',
        },
        deliveries: {
          create: [
            {
              channel: NotificationChannel.EMAIL,
              status: DeliveryStatus.PENDING,
            },
          ],
        },
      },
    });
  }

  private async issueAuthTokens(payload: JWTPayload): Promise<{ accessToken: string; refreshToken: string }> {
    const issued = issueRefreshSessionTokenPair(payload);
    await prisma.refreshTokenSession.create({
      data: {
        id: issued.sessionId,
        userId: payload.userId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      },
    });

    return issued.tokens;
  }

  private getPasswordResetBaseUrl(): string {
    const explicitBaseUrl =
      process.env.PASSWORD_RESET_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_BASE_URL;

    if (explicitBaseUrl && explicitBaseUrl.trim().length > 0) {
      return explicitBaseUrl.trim().replace(/\/+$/, '');
    }

    const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (allowedOrigins.length > 0) {
      return allowedOrigins[0].replace(/\/+$/, '');
    }

    return 'http://localhost:3000';
  }

  private buildPasswordResetLink(resetToken: string): string {
    const baseUrl = this.getPasswordResetBaseUrl();
    return `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  }

  private async enqueuePasswordResetDelivery(user: {
    id: string;
    email: string;
  }, resetToken: string): Promise<void> {
    const resetLink = this.buildPasswordResetLink(resetToken);

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET_REQUESTED',
        title: 'Reset your Contract to Cozy password',
        message:
          'Use the secure link to set a new password. If you did not request this, you can ignore this email.',
        actionUrl: resetLink,
        metadata: {
          priority: 'HIGH',
          category: 'AUTH',
          template: 'PASSWORD_RESET',
        },
        deliveries: {
          create: [
            {
              channel: NotificationChannel.EMAIL,
              status: DeliveryStatus.PENDING,
            },
          ],
        },
      },
    });
  }

  /**
   * Register a new user and auto-login
   */
  async register(data: RegisterInput): Promise<RegisterResponse> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new APIError('Email already registered', 409, 'EMAIL_EXISTS');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        // registerSchema requires acceptedTerms === true, so reaching here
        // means the user explicitly agreed at signup.
        tosAcceptedAt: new Date(),
        tosVersion: TOS_VERSION,
      },
    });

    // Auto-create role-specific profile
    try {
      if (user.role === 'HOMEOWNER') {
        await prisma.homeownerProfile.create({
          data: {
            userId: user.id,
            spentAmount: 0,
          },
        });
        logger.info(`✅ Created homeowner profile for user ${user.id}`);
      } else if (user.role === 'PROVIDER') {
        // ... (existing provider profile logic)
        await prisma.providerProfile.create({
          data: {
            userId: user.id,
            businessName: `${data.firstName} ${data.lastName}'s Services`,
            serviceRadius: 25,
            status: ProviderStatus.PENDING_APPROVAL,
            insuranceVerified: false,
            licenseVerified: false,
            averageRating: 0,
            totalReviews: 0,
            totalCompletedJobs: 0,
            stripeOnboarded: false,
          },
        });
        logger.info(`✅ Created provider profile for user ${user.id}`);
      }
    } catch (profileError) {
      // If profile creation fails, delete the user and throw error
      logger.error({ profileError }, 'Failed to create profile');
      await prisma.user.delete({ where: { id: user.id } });
      throw new APIError(
        'Failed to create user profile. Please try again.',
        500,
        'PROFILE_CREATION_FAILED'
      );
    }

    const emailVerificationToken = generateEmailVerificationToken(user.id, user.email);

    if (process.env.NODE_ENV !== 'development') {
      try {
        await this.enqueueVerificationDelivery(
          {
            id: user.id,
            email: user.email,
          },
          emailVerificationToken
        );
      } catch (error: any) {
        logger.error(
          {
            err: error,
            userId: user.id,
            stage: 'register_verification_delivery',
          },
          'Email verification delivery enqueue failed'
        );
      }
    }

    return {
      message: 'Account created. Verify your email before signing in.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
        emailVerified: user.emailVerified,
        status: user.status as any,
        mfaEnabled: user.mfaEnabled,
        createdAt: user.createdAt.toISOString(),
      },
      ...(process.env.NODE_ENV === 'development' ? { emailVerificationToken } : {}),
    };
  }

  /**
   * Login user
   */
  async login(data: LoginInput): Promise<({ accessToken: string; refreshToken: string; user: UserResponse }) | MfaChallengeResponse> {
    // Find user by email and include MFA state.
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    // Note: Prisma includes all scalar fields on the User model by default
    // so tokenVersion is available via user.tokenVersion below.

    if (!user) {
      throw new APIError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Check password
    const isPasswordValid = await comparePassword(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new APIError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Check if account is suspended
    if (user.status === 'SUSPENDED') {
      throw new APIError('Account has been suspended', 403, 'ACCOUNT_SUSPENDED');
    }

    // Check if account is inactive
    if (user.status === 'INACTIVE') {
      throw new APIError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
    }

    if (!user.emailVerified) {
      throw new APIError('Email verification required before sign-in', 403, 'EMAIL_NOT_VERIFIED');
    }

    // MFA gate: if the user has TOTP configured, issue a short-lived challenge
    // token instead of full access/refresh tokens. The client must POST this
    // token + a TOTP code to /api/auth/mfa/challenge to obtain real tokens.
    if (user.mfaEnabled) {
      const mfaToken = generateMfaChallengeToken(user.id, user.email, user.role);
      return { mfaRequired: true, mfaToken };
    }

    // Generate access and refresh tokens
    const { accessToken, refreshToken } = await this.issueAuthTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      mfaEnabled: false,
    });

    return {
      accessToken,
      refreshToken,
      user: this.buildSessionUser(user),
    };
  }

  /**
   * Logout user
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.refreshTokenSession.updateMany({
        where: {
          id: payload.sessionId,
          userId: payload.userId,
          tokenHash: hashRefreshToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Keep logout idempotent and do not reveal token validity.
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; sessionRefreshed: true }> {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Get user to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, status: true, tokenVersion: true },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new APIError('Account is not active', 403, 'ACCOUNT_NOT_ACTIVE');
    }

    // Reject refresh tokens issued before a password change
    const tokenVer = payload.tokenVersion ?? 0;
    if (tokenVer !== user.tokenVersion) {
      throw new APIError('Session expired. Please log in again.', 401, 'TOKEN_REVOKED');
    }

    const now = new Date();
    const incomingTokenHash = hashRefreshToken(refreshToken);
    const issued = issueRefreshSessionTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      mfaEnabled: payload.mfaEnabled,
      mfaVerified: payload.mfaVerified,
    });

    const rotateResult = await prisma.refreshTokenSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: user.id,
        tokenHash: incomingTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      },
    });

    if (rotateResult.count !== 1) {
      const existing = await prisma.refreshTokenSession.findUnique({
        where: { id: payload.sessionId },
        select: { userId: true, tokenHash: true, revokedAt: true, expiresAt: true },
      });

      if (
        !existing ||
        existing.userId !== user.id ||
        existing.revokedAt !== null ||
        existing.expiresAt <= now
      ) {
        throw new APIError('Session expired. Please log in again.', 401, 'TOKEN_REVOKED');
      }

      if (existing.tokenHash !== incomingTokenHash) {
        securityTokenReuseTotal.inc({ surface: 'refresh_token' });
        throw new APIError('Refresh token already used. Please log in again.', 401, 'TOKEN_REPLAY_DETECTED');
      }

      throw new APIError('Session expired. Please log in again.', 401, 'TOKEN_REVOKED');
    }

    return {
      accessToken: issued.tokens.accessToken,
      refreshToken: issued.tokens.refreshToken,
      sessionRefreshed: true,
    };
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    const payload = verifyEmailVerificationToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.emailVerified) {
      throw new APIError('Email already verified', 400, 'EMAIL_ALREADY_VERIFIED');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(data: ForgotPasswordInput): Promise<{ message: string; resetToken?: string }> {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // Security: Do not reveal if user exists or not
    if (!user) {
      return { message: 'If an account with that email exists, a password reset link has been sent.' };
    }

    const resetToken = generatePasswordResetToken(user.id, user.email);
    
    // Return token only in development for easy testing
    if (process.env.NODE_ENV === 'development') {
      return { 
        message: 'If an account with that email exists, a password reset link has been sent.',
        resetToken: resetToken // For dev/testing purposes
      };
    }

    try {
      await this.enqueuePasswordResetDelivery(
        {
          id: user.id,
          email: user.email,
        },
        resetToken
      );
    } catch (error: any) {
      // Never leak delivery failures to callers (anti-enumeration + resilience).
      logger.error(
        {
          err: error,
          userId: user.id,
          stage: 'forgotPassword_delivery',
        },
        'Password reset delivery enqueue failed'
      );
    }

    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  }

  /**
   * Reset password
   */
  async resetPassword(data: ResetPasswordInput): Promise<void> {
    const payload = verifyPasswordResetToken(data.token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    const passwordHash = await hashPassword(data.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.refreshTokenSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    auditLog('PASSWORD_CHANGED', user.id, { method: 'reset' });
  }

  /**
   * Change password for an authenticated user.
   * Increments tokenVersion so all pre-existing tokens become invalid.
   */
  async changePassword(userId: string, data: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) throw new APIError('User not found', 404, 'USER_NOT_FOUND');

    const isValid = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new APIError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
    }

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.refreshTokenSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    auditLog('PASSWORD_CHANGED', userId, { method: 'change' });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        emailVerified: true,
        status: true,
        mfaEnabled: true,
        avatar: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    // --- Flatten the response ---
    return user;
  }
  /**
   * Get current user (for /api/auth/me endpoint)
   */
  async getCurrentUser(userId: string) {
    return this.getUserById(userId);
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<{ emailVerificationToken?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.emailVerified) {
      throw new APIError('Email already verified', 400, 'EMAIL_ALREADY_VERIFIED');
    }

    const emailVerificationToken = generateEmailVerificationToken(user.id, user.email);

    if (process.env.NODE_ENV !== 'development') {
      await this.enqueueVerificationDelivery(
        {
          id: user.id,
          email: user.email,
        },
        emailVerificationToken
      );
    }

    return process.env.NODE_ENV === 'development'
      ? { emailVerificationToken }
      : {};
  }
}

export const authService = new AuthService();
