import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/password.util';
import {
  generateTokenPair,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyRefreshToken,
  verifyEmailVerificationToken,
  verifyPasswordResetToken,
} from '../utils/jwt.util';
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../utils/validators';
import { APIError } from '../middleware/error.middleware';
import { LoginResponse, RegisterResponse, RefreshTokenResponse } from '../types/auth.types';

const prisma = new PrismaClient();

export class AuthService {
  /**
   * Register a new user
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
        emailVerified: true,
      },
    });

    // Generate email verification token
    const emailVerificationToken = generateEmailVerificationToken(user.id, user.email);

    // TODO: Send verification email
    // await emailService.sendVerificationEmail(user.email, emailVerificationToken);

    return {
      message: 'Registration successful. Please verify your email.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
      },
      // Include token in response for development/testing
      ...(process.env.NODE_ENV === 'development' && { emailVerificationToken }),
    };
  }

  /**
   * Login user
   */
  async login(data: LoginInput): Promise<LoginResponse> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

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

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check if account is active
    if (user.status !== 'ACTIVE' && user.status !== 'PENDING_VERIFICATION') {
      throw new APIError('Account is not active', 403, 'ACCOUNT_NOT_ACTIVE');
    }

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return tokens;
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    // Verify token
    const { userId } = verifyEmailVerificationToken(token);

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      message: 'Email verified successfully',
    };
  }

  /**
   * Send password reset email
   */
  async forgotPassword(data: ForgotPasswordInput): Promise<{ message: string }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // Don't reveal if user exists or not (security)
    if (!user) {
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Generate password reset token
    const resetToken = generatePasswordResetToken(user.id, user.email);

    // TODO: Send password reset email
    // await emailService.sendPasswordResetEmail(user.email, resetToken);

    // For development, log the token
    if (process.env.NODE_ENV === 'development') {
      console.log('Password reset token:', resetToken);
    }

    return {
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(data: ResetPasswordInput): Promise<{ message: string }> {
    // Verify token
    const { userId } = verifyPasswordResetToken(data.token);

    // Hash new password
    const passwordHash = await hashPassword(data.newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return {
      message: 'Password reset successfully',
    };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerified: true,
        phoneVerified: true,
        avatar: true,
        bio: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    return user;
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.emailVerified) {
      throw new APIError('Email already verified', 400, 'EMAIL_ALREADY_VERIFIED');
    }

    // Generate new verification token
    const emailVerificationToken = generateEmailVerificationToken(user.id, user.email);

    // TODO: Send verification email
    // await emailService.sendVerificationEmail(user.email, emailVerificationToken);

    // For development
    if (process.env.NODE_ENV === 'development') {
      console.log('Email verification token:', emailVerificationToken);
    }

    return {
      message: 'Verification email sent',
    };
  }
}
