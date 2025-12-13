// apps/backend/src/routes/visualInspector.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { visualInspectorService } from '../services/visualInspector.service';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 20, // Max 20 images
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * @swagger
 * /api/visual-inspector/analyze:
 *   post:
 *     summary: Analyze property images with AI
 *     tags: [Visual Inspector]
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
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               roomTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Visual inspection report generated
 */
router.post('/analyze', authenticate, upload.array('images', 20), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId, roomTypes } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'propertyId is required'
      });
    }

    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one image is required'
      });
    }

    const files = req.files as Express.Multer.File[];
    
    // Parse roomTypes (sent as JSON string or array)
    let parsedRoomTypes: string[] = [];
    if (typeof roomTypes === 'string') {
      try {
        parsedRoomTypes = JSON.parse(roomTypes);
      } catch {
        parsedRoomTypes = [roomTypes];
      }
    } else if (Array.isArray(roomTypes)) {
      parsedRoomTypes = roomTypes;
    }

    // Create images array with roomType
    const images = files.map((file, index) => ({
      file,
      roomType: parsedRoomTypes[index] || 'Other',
    }));

    console.log(`[VISUAL-INSPECTOR] Analyzing ${images.length} images for property:`, propertyId);

    const report = await visualInspectorService.analyzePropertyImages(
      propertyId,
      userId,
      images
    );

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('[VISUAL-INSPECTOR] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze property images'
    });
  }
});

export default router;