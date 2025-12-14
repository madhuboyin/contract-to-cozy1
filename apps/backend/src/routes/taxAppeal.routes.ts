// apps/backend/src/routes/taxAppeal.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { taxAppealService } from '../services/taxAppeal.service';

const router = Router();

// Configure multer for tax bill uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1, // Single tax bill
  },
  fileFilter: (req, file, cb) => {
    // Accept PDFs and images
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  },
});

/**
 * @swagger
 * /api/tax-appeal/extract-bill:
 *   post:
 *     summary: Extract data from property tax bill
 *     tags: [Tax Appeal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               taxBill:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Tax bill data extracted
 */
router.post('/extract-bill', authenticate, upload.single('taxBill'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Tax bill file is required'
      });
    }

    console.log('[TAX-APPEAL] Extracting tax bill data');

    const billData = await taxAppealService.extractTaxBillData(req.file);

    res.json({
      success: true,
      data: billData
    });

  } catch (error: any) {
    console.error('[TAX-APPEAL] Extract error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to extract tax bill data'
    });
  }
});

/**
 * @swagger
 * /api/tax-appeal/analyze:
 *   post:
 *     summary: Analyze property tax appeal opportunity
 *     tags: [Tax Appeal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: string
 *               taxBillData:
 *                 type: object
 *               userMarketEstimate:
 *                 type: number
 *               comparableSales:
 *                 type: array
 *               propertyConditionNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appeal analysis completed
 */
router.post('/analyze', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      propertyId,
      taxBillData,
      userMarketEstimate,
      comparableSales,
      propertyConditionNotes,
      recentImprovements,
    } = req.body;

    if (!propertyId || !taxBillData) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and taxBillData are required'
      });
    }

    console.log('[TAX-APPEAL] Analyzing appeal opportunity for property:', propertyId);

    const report = await taxAppealService.analyzeAppealOpportunity(
      propertyId,
      userId,
      {
        taxBillData,
        userMarketEstimate,
        comparableSales: comparableSales || [],
        propertyConditionNotes,
        recentImprovements,
      }
    );

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[TAX-APPEAL] Analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze appeal opportunity'
    });
  }
});

export default router;