import { Router } from 'express';
// DELETE: Remove the local 'z' import as it's no longer used for local schema definitions
// import { z } from 'zod'; 
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas from validators.ts (which includes all new fields)
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 

const router = Router();

// DELETED: Local Validation schemas were removed from this file.

// Routes - all require authentication
// The validateBody middleware now uses the imported, comprehensive Zod schemas,
// which include all Basic and Advanced property fields.
router.get('/', authenticate, propertyController.listProperties);
router.post('/', authenticate, validateBody(createPropertySchema), propertyController.createProperty);
router.get('/:id', authenticate, propertyController.getProperty);
router.put('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.deleteProperty);

export default router;