import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import * as propertyController from '../controllers/property.controller';

const router = Router();

// Validation schemas
const createPropertySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(5).max(255),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}$/),
  isPrimary: z.boolean().optional().default(false),
});

const updatePropertySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(5).max(255).optional(),
  city: z.string().min(2).max(100).optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().regex(/^\d{5}$/).optional(),
  isPrimary: z.boolean().optional(),
});

// Routes - all require authentication
router.get('/', authenticate, propertyController.listProperties);
router.post('/', authenticate, validate(createPropertySchema), propertyController.createProperty);
router.get('/:id', authenticate, propertyController.getProperty);
router.put('/:id', authenticate, validate(updatePropertySchema), propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.deleteProperty);

export default router;
