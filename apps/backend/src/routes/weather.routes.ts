// apps/backend/src/routes/weather.routes.ts

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { weatherService } from '../services/weather.service';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * @swagger
 * /api/weather/check/{propertyId}:
 *   get:
 *     summary: Fetch active weather signals for a property's zip code
 *     description: >
 *       Returns an array of active SignalType values based on the 5-day OWM
 *       forecast for the property's zip code. Results are cached for 30 minutes.
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *         description: The property to check weather for
 *     responses:
 *       200:
 *         description: Active weather signals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     propertyId:
 *                       type: string
 *                     zipCode:
 *                       type: string
 *                     signals:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum:
 *                           - WEATHER_FORECAST_MIN_TEMP
 *                           - WEATHER_FORECAST_HEAVY_RAIN
 *       404:
 *         description: Property not found
 */
router.get('/check/:propertyId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.params;

    // 1. Fetch property — verify ownership and retrieve zipCode
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true, zipCode: true, address: true },
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const zipCode = property.zipCode?.trim();
    if (!zipCode) {
      return res.status(200).json({
        success: true,
        data: {
          propertyId,
          zipCode: null,
          signals: [],
          message: 'No zip code on file for this property',
        },
      });
    }

    // 2. Delegate to WeatherService (handles caching + error isolation)
    const signals = await weatherService.getLocalSignals(zipCode);

    return res.json({
      success: true,
      data: {
        propertyId,
        zipCode,
        signals,
      },
    });
  } catch (error: any) {
    console.error('[WEATHER] /check/:propertyId error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch weather signals',
    });
  }
});

export default router;
