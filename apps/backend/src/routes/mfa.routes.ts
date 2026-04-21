// apps/backend/src/routes/mfa.routes.ts
//
// TOTP-based MFA endpoints.
//
// Public (challenge token only):
//   POST /api/auth/mfa/challenge  — exchange challenge token + TOTP for real tokens
//   POST /api/auth/mfa/challenge/recovery — exchange challenge token + recovery code
//
// Authenticated (requires valid access token):
//   POST /api/auth/mfa/setup         — begin TOTP setup
//   POST /api/auth/mfa/setup/verify  — confirm setup with first TOTP code
//   GET  /api/auth/mfa/status        — fetch status + recovery codes remaining
//   POST /api/auth/mfa/recovery-codes/regenerate — rotate recovery codes
//   POST /api/auth/mfa/disable       — disable MFA

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  setupMfa,
  verifyMfaSetup,
  verifyMfaChallenge,
  verifyMfaRecoveryChallenge,
  getMfaStatus,
  regenerateMfaRecoveryCodes,
  disableMfa,
} from '../controllers/mfa.controller';
import { z } from 'zod';

const router = Router();

const totpCodeSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  code: z.string().length(6).regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const mfaRecoveryChallengeSchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  recoveryCode: z.string().min(4, 'recoveryCode is required'),
});

// All MFA endpoints share the tight auth rate limiter
router.use(authRateLimiter);

/**
 * @swagger
 * /api/auth/mfa/challenge:
 *   post:
 *     summary: Complete MFA challenge — exchange challenge token + TOTP code for access/refresh tokens
 *     tags: [Auth MFA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mfaToken, code]
 *             properties:
 *               mfaToken:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: 6-digit TOTP code from authenticator app
 *     responses:
 *       200:
 *         description: Returns accessToken and refreshToken
 *       401:
 *         description: Invalid or expired challenge token / invalid TOTP code
 */
router.post('/auth/mfa/challenge', validateBody(mfaChallengeSchema), verifyMfaChallenge);

/**
 * @swagger
 * /api/auth/mfa/challenge/recovery:
 *   post:
 *     summary: Complete MFA challenge with a one-time recovery code
 *     tags: [Auth MFA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mfaToken, recoveryCode]
 *             properties:
 *               mfaToken:
 *                 type: string
 *               recoveryCode:
 *                 type: string
 *                 description: One-time recovery code generated during MFA setup
 *     responses:
 *       200:
 *         description: Returns accessToken and refreshToken
 *       401:
 *         description: Invalid or expired challenge token / invalid recovery code
 */
router.post(
  '/auth/mfa/challenge/recovery',
  validateBody(mfaRecoveryChallengeSchema),
  verifyMfaRecoveryChallenge,
);

/**
 * @swagger
 * /api/auth/mfa/setup:
 *   post:
 *     summary: Begin MFA setup — returns otpauth URI and base32 secret
 *     tags: [Auth MFA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: otpauthUri and base32Secret for QR code display
 *       409:
 *         description: MFA already enabled
 */
router.post('/auth/mfa/setup', authenticate, setupMfa);

/**
 * @swagger
 * /api/auth/mfa/setup/verify:
 *   post:
 *     summary: Confirm MFA setup with first TOTP code
 *     tags: [Auth MFA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: MFA enabled
 *       401:
 *         description: Invalid TOTP code
 */
router.post('/auth/mfa/setup/verify', authenticate, validateBody(totpCodeSchema), verifyMfaSetup);

/**
 * @swagger
 * /api/auth/mfa/status:
 *   get:
 *     summary: Get MFA enabled status and remaining recovery codes
 *     tags: [Auth MFA]
 *     security:
 *       - bearerAuth: []
 */
router.get('/auth/mfa/status', authenticate, getMfaStatus);

/**
 * @swagger
 * /api/auth/mfa/recovery-codes/regenerate:
 *   post:
 *     summary: Regenerate MFA recovery codes after TOTP verification
 *     tags: [Auth MFA]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/auth/mfa/recovery-codes/regenerate',
  authenticate,
  validateBody(totpCodeSchema),
  regenerateMfaRecoveryCodes,
);

/**
 * @swagger
 * /api/auth/mfa/disable:
 *   post:
 *     summary: Disable MFA after verifying current TOTP code
 *     tags: [Auth MFA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: MFA disabled
 *       401:
 *         description: Invalid TOTP code
 */
router.post('/auth/mfa/disable', authenticate, validateBody(totpCodeSchema), disableMfa);

export default router;
