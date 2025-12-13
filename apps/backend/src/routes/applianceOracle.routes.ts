// apps/backend/src/routes/applianceOracle.routes.ts

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware'; // <-- NEW IMPORT: Property Authorization Middleware
import { CustomRequest } from '../types'; // <-- MODIFIED IMPORT: Use extended CustomRequest type

import { applianceOracleService } from '../services/applianceOracle.service';

const router = Router();

/**
 * @swagger
 * /api/oracle/predict/{propertyId}:
 * get:
 * summary: Generate AI-powered appliance replacement predictions
 * tags: [Appliance Oracle]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: propertyId
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: Oracle report generated successfully
 */
router.get(
  '/predict/:propertyId', 
  authenticate,
  propertyAuthMiddleware, // <-- ADDED: Enforce property ownership check (IDOR Prevention)
  async (req: CustomRequest, res: Response) => { // <-- UPDATED TYPE: Use CustomRequest
    try {
      // propertyAuthMiddleware ensures the propertyId is valid for the authenticated user
      const userId = req.user!.userId;
      const { propertyId } = req.params;

      console.log('[ORACLE] Generating prediction report for property:', propertyId);

      const report = await applianceOracleService.generateOracleReport(propertyId, userId);

      res.json({
        success: true,
        data: report
      });

    } catch (error: any) {
      console.error('[ORACLE] Error generating report:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate oracle report'
      });
    }
  }
);

/**
 * @swagger
 * /api/oracle/summary:
 * get:
 * summary: Get summary of critical appliances across all properties
 * tags: [Appliance Oracle]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: Summary retrieved successfully
 */
router.get('/summary', authenticate, async (req: CustomRequest, res: Response) => { // <-- UPDATED TYPE: Use CustomRequest
  try {
    const userId = req.user!.userId;

    console.log('[ORACLE] Generating summary for user:', userId);

    // This would aggregate across all properties
    // For now, return a simple response
    res.json({
      success: true,
      data: {
        message: 'Summary endpoint - implement aggregation if needed'
      }
    });

  } catch (error: any) {
    console.error('[ORACLE] Error generating summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate summary'
    });
  }
});

export default router;