import { PrismaClient, ProviderStatus } from '@prisma/client';
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
import {
  LoginResponse,
  RegisterResponse,
  RefreshTokenResponse,
} from '../types/auth.types';

import { prisma } from '../lib/prisma';

export class AuthService {
  /**
   * Register a new user and auto-login
   */
  async register(data: RegisterInput): Promise<LoginResponse> {
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
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    // Determine the segment
    // @ts-ignore
    const segment = data.segment || 'EXISTING_OWNER';

    // Auto-create role-specific profile
    try {
      if (user.role === 'HOMEOWNER') {
        await prisma.homeownerProfile.create({
          data: {
            userId: user.id,
            spentAmount: 0,
            segment: segment, // Use the variable
          },
        });
        console.log(`✅ Created homeowner profile for user ${user.id}`);
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
        console.log(`✅ Created provider profile for user ${user.id}`);
      }
    } catch (profileError) {
      // If profile creation fails, delete the user and throw error
      console.error('Failed to create profile:', profileError);
      await prisma.user.delete({ where: { id: user.id } });
      throw new APIError(
        'Failed to create user profile. Please try again.',
        500,
        'PROFILE_CREATION_FAILED'
      );
    }

    // --- AUTO-LOGIN LOGIC ---
    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Return the same response as the login function
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
        emailVerified: user.emailVerified,
        status: user.status as any,
        segment: segment, // <-- segment included in the response
      },
    };
  }

  /**
   * Login user
   */
  async login(data: LoginInput): Promise<LoginResponse> {
    // Find user by email AND include the profile segment
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { homeownerProfile: { select: { segment: true } } }, // <-- FIX 1: Includes homeownerProfile
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

    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
        emailVerified: user.emailVerified,
        status: user.status as any,
        segment: user.homeownerProfile?.segment || 'EXISTING_OWNER', // <-- FIX 2: Returns the segment
      },
    };
  }

  /**
   * Logout user
   */
  async logout(refreshToken: string): Promise<void> {
    // Refresh tokens are stateless JWTs - no database cleanup needed
    return;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Get user to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new APIError('Account is not active', 403, 'ACCOUNT_NOT_ACTIVE');
    }

    // Generate new token pair
    const newTokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
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

    // TODO: Send password reset email
    // await emailService.sendPasswordResetEmail(user.email, resetToken);

    console.log(`Password reset token for ${user.email}: ${resetToken}`);
    
    // Return token only in development for easy testing
    if (process.env.NODE_ENV === 'development') {
      return { 
        message: 'If an account with that email exists, a password reset link has been sent.',
        resetToken: resetToken // For dev/testing purposes
      };
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

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
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
        avatar: true,
        bio: true,
        createdAt: true,
        homeownerProfile: { // <-- FIX 3: Select the profile
          select: {
            segment: true,
          },
        },
      },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

    // --- Flatten the response ---
    const { homeownerProfile, ...userData } = user;
    return {
      ...userData,
      segment: homeownerProfile?.segment || 'EXISTING_OWNER', // <-- FIX 4: Flatten the segment
    };
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
  async resendVerificationEmail(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists or not
      return;
    }

    if (user.emailVerified) {
      throw new APIError('Email already verified', 400, 'EMAIL_ALREADY_VERIFIED');
    }

    const emailVerificationToken = generateEmailVerificationToken(user.id, user.email);

    // TODO: Send verification email
    // await emailService.sendVerificationEmail(user.email, emailVerificationToken);

    console.log(`Verification token for ${user.email}: ${emailVerificationToken}`);
  }
}

export const authService = new AuthService();