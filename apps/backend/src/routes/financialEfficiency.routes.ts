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

// Route 1: Get FES Summary for the dashboard card 
// Path handled: /api/v1/financial-efficiency/summary
router.get('/summary', getPrimaryFESSummary);

// Route 2: Get Detailed FES Report for a specific property
// Path handled: /api/v1/properties/:propertyId/financial-efficiency
router.get('/:propertyId/financial-efficiency', getDetailedFESReport);

// Route 3: Manually trigger FES recalculation
// Path handled: /api/v1/properties/:propertyId/financial-efficiency/recalculate
router.post('/:propertyId/financial-efficiency/recalculate', recalculateFES);


export default router;