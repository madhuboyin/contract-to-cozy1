// apps/backend/src/routes/vault.routes.ts

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { strictRateLimiter } from '../middleware/rateLimiter.middleware';
import { getVaultData, getVaultStatus, setVaultPassword } from '../services/vault.service';
import { AuthRequest } from '../types/auth.types';
import { auditLog } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/vault/access/{propertyId}:
 *   post:
 *     summary: Access a property's Seller's Vault (public, password-protected)
 *     description: >
 *       No JWT required. The caller must supply the vault password set by the
 *       homeowner. Rate-limited to 3 attempts per hour per IP.
 *     tags: [Vault]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vault data returned
 *       400:
 *         description: Password missing
 *       401:
 *         description: Invalid password
 *       429:
 *         description: Too many attempts
 */
router.post('/access/:propertyId', strictRateLimiter, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const password = String(req.body?.password ?? '').trim();

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const data = await getVaultData(propertyId, password);
    auditLog('VAULT_ACCESS_SUCCESS', null, { ip: req.ip, propertyId });
    return res.json({ success: true, data });
  } catch (error: any) {
    auditLog('VAULT_ACCESS_FAILURE', null, { ip: req.ip, propertyId, reason: error?.code });
    const status = error?.statusCode ?? 500;
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to access vault',
    });
  }
});

/**
 * @swagger
 * /api/vault/status/{propertyId}:
 *   get:
 *     summary: Check whether a vault password has been configured (authenticated)
 *     description: Used by the homeowner dashboard to decide whether to show the set-password form.
 *     tags: [Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns { isConfigured: boolean }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 */
router.get(
  '/status/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { propertyId } = req.params;
      const status = await getVaultStatus(propertyId);
      return res.json({ success: true, data: status });
    } catch (error: any) {
      const status = error?.statusCode ?? 500;
      return res.status(status).json({
        success: false,
        message: error?.message || 'Failed to retrieve vault status',
      });
    }
  }
);

/**
 * @swagger
 * /api/vault/setup/{propertyId}:
 *   post:
 *     summary: Set or replace the vault password for a property (authenticated)
 *     description: >
 *       Homeowner must be authenticated and own the property.
 *       Accepts the new plaintext password, bcrypt-hashes it, and stores the hash.
 *       The plaintext password is never stored.
 *     tags: [Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Vault password set successfully
 *       400:
 *         description: Password too short or missing
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found or access denied
 */
router.post(
  '/setup/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { propertyId } = req.params;
    const userId = req.user!.userId;
    try {
      const password = String(req.body?.password ?? '').trim();

      if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }

      await setVaultPassword(propertyId, password);
      auditLog('VAULT_PASSWORD_SET', userId, { ip: req.ip, propertyId });
      return res.json({ success: true, message: 'Vault password set successfully' });
    } catch (error: any) {
      const status = error?.statusCode ?? 500;
      return res.status(status).json({
        success: false,
        message: error?.message || 'Failed to set vault password',
      });
    }
  }
);

export default router;
