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

    // Auto-create role-specific profile
    try {
      if (user.role === 'HOMEOWNER') {
        await prisma.homeownerProfile.create({
          data: {
            userId: user.id,
            spentAmount: 0,
          },
        });
        console.log(`✅ Created homeowner profile for user ${user.id}`);
      } else if (user.role === 'PROVIDER') {
        // Create provider profile with required fields and sensible defaults
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
  async forgotPassword(data: ForgotPasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      // Don't reveal if user exists or not
      return;
    }

    const resetToken = generatePasswordResetToken(user.id, user.email);

    // TODO: Send password reset email
    // await emailService.sendPasswordResetEmail(user.email, resetToken);

    console.log(`Password reset token for ${user.email}: ${resetToken}`);
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
      },
    });

    if (!user) {
      throw new APIError('User not found', 404, 'USER_NOT_FOUND');
    }

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