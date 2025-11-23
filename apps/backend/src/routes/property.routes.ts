import { Router } from 'express';
// --- DELETED: import { z } from 'zod'; --- (No longer needed here)
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas from validators.ts
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 

const router = Router();

// DELETED: Local Validation schemas were removed here and replaced by the imports above.

// Routes - all require authentication
// CRITICAL FIX: The validateBody middleware now uses the imported, comprehensive Zod schemas.
router.get('/', authenticate, propertyController.listProperties);
router.post('/', authenticate, validateBody(createPropertySchema), propertyController.createProperty);
router.get('/:id', authenticate, propertyController.getProperty);
router.put('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.deleteProperty);

export default router;