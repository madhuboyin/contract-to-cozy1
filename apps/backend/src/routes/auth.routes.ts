import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter, strictRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/validators';

const router = Router();
const authController = new AuthController();

/**
 * Public routes (no authentication required)
 */

// Register new user
router.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  authController.register.bind(authController)
);

// Login
router.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  authController.login.bind(authController)
);

// Refresh token
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  authController.refreshToken.bind(authController)
);

// Verify email
router.post(
  '/verify-email',
  validateBody(verifyEmailSchema),
  authController.verifyEmail.bind(authController)
);

// Forgot password - send reset email
router.post(
  '/forgot-password',
  strictRateLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
);

// Reset password
router.post(
  '/reset-password',
  strictRateLimiter,
  validateBody(resetPasswordSchema),
  authController.resetPassword.bind(authController)
);

/**
 * Protected routes (authentication required)
 */

// Get current user
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser.bind(authController)
);

// Logout
router.post(
  '/logout',
  authenticate,
  authController.logout.bind(authController)
);

// Resend verification email
router.post(
  '/resend-verification',
  authenticate,
  strictRateLimiter,
  authController.resendVerification.bind(authController)
);

export default router;
