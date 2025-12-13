// apps/backend/src/routes/energyAuditor.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { energyAuditorService } from '../services/energyAuditor.service';

const router = Router();

// Configure multer for file uploads (memory storage for bill PDFs)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 3, // Max 3 bills
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
 * /api/energy/audit:
 *   post:
 *     summary: Generate AI energy audit for property
 *     tags: [Energy Auditor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: string
 *               averageMonthlyKWh:
 *                 type: number
 *               averageMonthlyBill:
 *                 type: number
 *               squareFootage:
 *                 type: number
 *               occupants:
 *                 type: number
 *               summerPeakKWh:
 *                 type: number
 *               winterPeakKWh:
 *                 type: number
 *               hasElectricHeat:
 *                 type: boolean
 *               hasElectricWaterHeater:
 *                 type: boolean
 *               hasCentralAC:
 *                 type: boolean
 *               hasPool:
 *                 type: boolean
 *               hasSolarPanels:
 *                 type: boolean
 *               bills:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Energy audit report generated
 */
router.post('/audit', authenticate, upload.array('bills', 3), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      propertyId,
      averageMonthlyKWh,
      averageMonthlyBill,
      squareFootage,
      occupants,
      summerPeakKWh,
      winterPeakKWh,
      hasElectricHeat,
      hasElectricWaterHeater,
      hasCentralAC,
      hasPool,
      hasSolarPanels,
    } = req.body;

    // Validate required fields
    if (!propertyId || !averageMonthlyKWh || !averageMonthlyBill || !squareFootage || !occupants) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: propertyId, averageMonthlyKWh, averageMonthlyBill, squareFootage, occupants'
      });
    }

    const inputData = {
      averageMonthlyKWh: parseFloat(averageMonthlyKWh),
      averageMonthlyBill: parseFloat(averageMonthlyBill),
      squareFootage: parseInt(squareFootage),
      occupants: parseInt(occupants),
      summerPeakKWh: summerPeakKWh ? parseFloat(summerPeakKWh) : undefined,
      winterPeakKWh: winterPeakKWh ? parseFloat(winterPeakKWh) : undefined,
      hasElectricHeat: hasElectricHeat === 'true',
      hasElectricWaterHeater: hasElectricWaterHeater === 'true',
      hasCentralAC: hasCentralAC === 'true',
      hasPool: hasPool === 'true',
      hasSolarPanels: hasSolarPanels === 'true',
    };

    console.log('[ENERGY-AUDITOR] Generating audit for property:', propertyId);
    console.log('[ENERGY-AUDITOR] Bills uploaded:', req.files?.length || 0);

    const report = await energyAuditorService.generateEnergyAudit(
      propertyId,
      userId,
      inputData,
      req.files as Express.Multer.File[]
    );

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[ENERGY-AUDITOR] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate energy audit'
    });
  }
});

export default router;