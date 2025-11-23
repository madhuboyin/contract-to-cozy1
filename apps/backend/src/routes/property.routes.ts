import { Router } from 'express';
// DELETE: Removed unnecessary local z import
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas (with all new fields) from validators.ts
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 

const router = Router();

// Validation schemas were deleted from this file, relying entirely on the imports above.

// Routes - all require authentication
// CRITICAL FIX: The validateBody middleware now uses the imported, comprehensive Zod schemas.
router.get('/', authenticate, propertyController.listProperties);
router.post('/', authenticate, validateBody(createPropertySchema), propertyController.createProperty);
router.get('/:id', authenticate, propertyController.getProperty);
router.put('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.deleteProperty);

export default router;