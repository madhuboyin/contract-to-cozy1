// apps/backend/src/routes/financialEfficiency.routes.ts

import { Router } from 'express';
import { 
    getPrimaryFESSummary, 
    getDetailedFESReport, 
    recalculateFES 
} from '../controllers/financialEfficiency.controller';
import { authenticate } from '../middleware/auth.middleware'; 

const router = Router();

// Middleware to ensure user is authenticated for all routes
router.use(authenticate); 

/**
 * @swagger
 * /api/v1/financial-efficiency/summary:
 *   get:
 *     summary: Get Financial Efficiency Score (FES) summary for dashboard
 *     tags: [Financial Efficiency]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FES summary for primary property
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
 *                     score:
 *                       type: number
 *                     category:
 *                       type: string
 *                     insights:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/summary', getPrimaryFESSummary);

/**
 * @swagger
 * /api/v1/properties/{propertyId}/financial-efficiency:
 *   get:
 *     summary: Get detailed Financial Efficiency Score report for a specific property
 *     tags: [Financial Efficiency]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Detailed FES report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:propertyId/financial-efficiency', getDetailedFESReport);

/**
 * @swagger
 * /api/v1/properties/{propertyId}/financial-efficiency/recalculate:
 *   post:
 *     summary: Manually trigger FES recalculation
 *     tags: [Financial Efficiency]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: FES recalculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/:propertyId/financial-efficiency/recalculate', recalculateFES);


export default router;