import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthRequest } from '../types/auth.types';
import {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  VerifyEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '../utils/validators';
import { auditLog, redactEmail } from '../lib/logger';

const authService = new AuthService();

export class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data: RegisterInput = req.body;
    try {
      const result = await authService.register(data);
      auditLog('AUTH_REGISTER_SUCCESS', result.user.id, {
        ip: req.ip,
        role: data.role,
        email: redactEmail(data.email),
      });
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data: LoginInput = req.body;
    try {
      const result = await authService.login(data);

      // MFA challenge path: return 200 with mfaRequired=true so the client can
      // prompt for the TOTP code and POST to /api/auth/mfa/challenge.
      if ('mfaRequired' in result) {
        auditLog('AUTH_LOGIN_MFA_REQUIRED', null, {
          ip: req.ip,
          email: redactEmail(data.email),
        });
        res.status(200).json({ success: true, data: result });
        return;
      }

      auditLog('AUTH_LOGIN_SUCCESS', result.user.id, {
        ip: req.ip,
        email: redactEmail(data.email),
        role: result.user.role,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const auditableFailures = ['INVALID_CREDENTIALS', 'ACCOUNT_SUSPENDED', 'ACCOUNT_INACTIVE'];
      if (auditableFailures.includes(error?.code)) {
        auditLog('AUTH_LOGIN_FAILURE', null, {
          ip: req.ip,
          email: redactEmail(data.email),
          reason: error.code,
        });
      }
      next(error);
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken }: RefreshTokenInput = req.body;
      const result = await authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify email
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token }: VerifyEmailInput = req.body;
      const result = await authService.verifyEmail(token);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forgot password - send reset email
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: ForgotPasswordInput = req.body;
      const result = await authService.forgotPassword(data);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password
   * POST /api/auth/reset-password
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: ResetPasswordInput = req.body;
      const result = await authService.resetPassword(data);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user
   * GET /api/auth/me
   */
  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Not authenticated',
            code: 'NOT_AUTHENTICATED',
          },
        });
        return;
      }

      const result = await authService.getCurrentUser(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // In a stateless JWT system, logout is handled client-side
      // by removing the tokens from storage
      // 
      // For a more robust solution, you could:
      // 1. Maintain a token blacklist in Redis
      // 2. Use shorter-lived tokens
      // 3. Implement token versioning

      res.status(200).json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password
   * PUT /api/auth/change-password
   */
  async changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' } });
        return;
      }

      const data: ChangePasswordInput = req.body;
      await authService.changePassword(req.user.userId, data);

      res.status(200).json({ success: true, data: { message: 'Password changed successfully. Please log in again.' } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend verification email
   * POST /api/auth/resend-verification
   */
  async resendVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            message: 'Not authenticated',
            code: 'NOT_AUTHENTICATED',
          },
        });
        return;
      }

      const result = await authService.resendVerificationEmail(req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
