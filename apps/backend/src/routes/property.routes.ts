import { Router } from 'express';
// DELETE: Removed unnecessary local z import
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as propertyController from '../controllers/property.controller';
// CRITICAL FIX: Import the comprehensive schemas (with all new fields) from validators.ts
import { createPropertySchema, updatePropertySchema } from '../utils/validators'; 

const router = Router();

// Routes - all require authentication

/**
 * @swagger
 * /api/properties:
 *   get:
 *     summary: List all properties for authenticated user
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     properties:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Property'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticate, propertyController.listProperties);

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a new property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - city
 *               - state
 *               - zipCode
 *             properties:
 *               address:
 *                 type: string
 *                 example: "123 Main St"
 *               city:
 *                 type: string
 *                 example: "San Francisco"
 *               state:
 *                 type: string
 *                 example: "CA"
 *               zipCode:
 *                 type: string
 *                 example: "94102"
 *               propertyType:
 *                 type: string
 *                 enum: [SINGLE_FAMILY, CONDO, TOWNHOUSE, MULTI_FAMILY]
 *               squareFootage:
 *                 type: number
 *                 example: 2000
 *               yearBuilt:
 *                 type: integer
 *                 example: 2010
 *               purchaseDate:
 *                 type: string
 *                 format: date
 *               purchasePrice:
 *                 type: number
 *               bedrooms:
 *                 type: integer
 *               bathrooms:
 *                 type: number
 *     responses:
 *       201:
 *         description: Property created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', authenticate, validateBody(createPropertySchema), propertyController.createProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get a single property by ID
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id', authenticate, propertyController.getProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Update a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipCode:
 *                 type: string
 *               propertyType:
 *                 type: string
 *                 enum: [SINGLE_FAMILY, CONDO, TOWNHOUSE, MULTI_FAMILY]
 *               squareFootage:
 *                 type: number
 *               yearBuilt:
 *                 type: integer
 *               bedrooms:
 *                 type: integer
 *               bathrooms:
 *                 type: number
 *     responses:
 *       200:
 *         description: Property updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/:id', authenticate, validateBody(updatePropertySchema), propertyController.updateProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Delete a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Property ID
 *     responses:
 *       204:
 *         description: Property deleted successfully
 *       404:
 *         description: Property not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/:id', authenticate, propertyController.deleteProperty);

export default router;