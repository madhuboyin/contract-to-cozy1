// apps/backend/src/routes/propertyAppreciation.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { propertyAppreciationService } from '../services/propertyAppreciation.service';

const router = Router();

/**
 * @swagger
 * /api/appreciation/analyze/{propertyId}:
 *   post:
 *     summary: Generate property appreciation analysis
 *     tags: [Property Appreciation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               purchasePrice:
 *                 type: number
 *               purchaseDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Appreciation report generated
 */
router.post('/analyze/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;
    const { purchasePrice, purchaseDate } = req.body;

    console.log('[APPRECIATION] Generating report for:', propertyId);

    const report = await propertyAppreciationService.generateAppreciationReport(
      propertyId,
      userId,
      purchasePrice,
      purchaseDate
    );

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[APPRECIATION] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate appreciation report'
    });
  }
});

export default router;