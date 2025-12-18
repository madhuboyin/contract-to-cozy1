// apps/backend/src/routes/inspectionReport.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { inspectionAnalysisService } from '../services/inspectionAnalysis.service';
import { prisma } from '../config/database';

const router = Router();

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * @swagger
 * /api/inspection-reports/upload:
 *   post:
 *     summary: Upload and analyze inspection report PDF
 *     tags: [Inspection Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - file
 *             properties:
 *               propertyId:
 *                 type: string
 *                 description: Property ID
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF inspection report
 *     responses:
 *       200:
 *         description: Report uploaded and analysis started
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Analysis failed
 */
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'propertyId is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'PDF file is required'
      });
    }

    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Verify user is HOME_BUYER segment
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId }
    });

    if (homeownerProfile?.segment !== 'HOME_BUYER') {
      return res.status(403).json({
        success: false,
        message: 'This feature is only available for home buyers'
      });
    }

    console.log(`[INSPECTION] Analyzing report for property ${propertyId}`);

    // Start analysis (this is async but we return immediately)
    const reportId = await inspectionAnalysisService.analyzeInspectionReport(
      propertyId,
      userId,
      req.file.buffer,
      req.file.originalname,
      property
    );

    res.json({
      success: true,
      data: {
        reportId,
        message: 'Analysis completed successfully'
      }
    });

  } catch (error: any) {
    console.error('[INSPECTION] Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze inspection report'
    });
  }
});

/**
 * @swagger
 * /api/inspection-reports/:reportId:
 *   get:
 *     summary: Get inspection report by ID
 *     tags: [Inspection Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inspection report details
 *       404:
 *         description: Report not found
 */
router.get('/:reportId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { reportId } = req.params;

    const report = await inspectionAnalysisService.getInspectionReport(reportId, userId);

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[INSPECTION] Get report error:', error);
    res.status(error.message === 'Report not found' ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/inspection-reports/property/:propertyId:
 *   get:
 *     summary: Get all reports for a property
 *     tags: [Inspection Reports]
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
 *         description: List of inspection reports
 */
router.get('/property/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    const reports = await inspectionAnalysisService.getPropertyReports(propertyId, userId);

    res.json({
      success: true,
      data: reports
    });

  } catch (error: any) {
    console.error('[INSPECTION] Get property reports error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/inspection-reports/:reportId/maintenance-calendar:
 *   get:
 *     summary: Generate maintenance calendar from inspection issues
 *     tags: [Inspection Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Maintenance calendar
 */
router.get('/:reportId/maintenance-calendar', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { reportId } = req.params;

    const calendar = await inspectionAnalysisService.generateMaintenanceCalendar(reportId, userId);

    res.json({
      success: true,
      data: calendar
    });

  } catch (error: any) {
    console.error('[INSPECTION] Generate calendar error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;