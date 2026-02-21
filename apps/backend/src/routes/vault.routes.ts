// apps/backend/src/routes/vault.routes.ts
// Public route — no authentication required. Password-protected at the service layer.

import { Router, Request, Response } from 'express';
import { getVaultData } from '../services/vault.service';

const router = Router();

/**
 * @swagger
 * /api/vault/access/{propertyId}:
 *   post:
 *     summary: Access a property's Seller's Vault (public, password-protected)
 *     description: >
 *       No JWT required. The caller must supply the vault password in the
 *       request body. Returns a curated, read-only view of the property's
 *       proof-of-care data (verified assets, service history, badges).
 *     tags: [Vault]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: The property whose vault to open
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
 *                 example: vault_test_2026
 *     responses:
 *       200:
 *         description: Vault data returned
 *       400:
 *         description: Password missing
 *       401:
 *         description: Invalid password
 *       404:
 *         description: Property not found
 */
router.post('/access/:propertyId', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const password = String(req.body?.password ?? '').trim();

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const data = await getVaultData(propertyId, password);
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to access vault',
    });
  }
});

export default router;
