// apps/backend/src/routes/provider.routes.ts
// Complete working version - copy this entire file

import { Router } from 'express';
import { ProviderController } from '../controllers/provider.controller';

const router = Router();

// Use require to avoid circular dependency
const { authenticate } = require('../middleware/auth.middleware');

// =============================================================================
// AUTHENTICATED PROVIDER ROUTES (MUST COME BEFORE /:id ROUTES!)
// =============================================================================
// These routes are for the authenticated provider to manage their own services

/**
 * @swagger
 * /api/providers/services:
 *   get:
 *     summary: Get current provider's services
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of provider's services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.get('/services', authenticate, ProviderController.getMyServices);

/**
 * @swagger
 * /api/providers/services:
 *   post:
 *     summary: Create a new service
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - name
 *               - description
 *               - basePrice
 *               - priceUnit
 *               - isActive
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [INSPECTION, HANDYMAN]
 *               inspectionType:
 *                 type: string
 *               handymanType:
 *                 type: string
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               basePrice:
 *                 type: number
 *                 minimum: 0
 *               priceUnit:
 *                 type: string
 *               minimumCharge:
 *                 type: number
 *                 minimum: 0
 *               estimatedDuration:
 *                 type: integer
 *                 minimum: 0
 *                 description: Duration in minutes
 *               isActive:
 *                 type: boolean
 *           example:
 *             category: "INSPECTION"
 *             inspectionType: "HOME_INSPECTION"
 *             name: "Complete Home Inspection"
 *             description: "Comprehensive inspection of all major systems"
 *             basePrice: 450
 *             priceUnit: "flat rate"
 *             estimatedDuration: 180
 *             isActive: true
 *     responses:
 *       201:
 *         description: Service created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.post('/services', authenticate, ProviderController.createService);

/**
 * @swagger
 * /api/providers/services/{id}:
 *   patch:
 *     summary: Update a service
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               basePrice:
 *                 type: number
 *               priceUnit:
 *                 type: string
 *               minimumCharge:
 *                 type: number
 *               estimatedDuration:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *           example:
 *             basePrice: 475
 *             description: "Updated description"
 *     responses:
 *       200:
 *         description: Service updated successfully
 *       404:
 *         description: Service not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.patch('/services/:id', authenticate, ProviderController.updateService);

/**
 * @swagger
 * /api/providers/services/{id}:
 *   delete:
 *     summary: Delete a service
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     responses:
 *       204:
 *         description: Service deleted successfully
 *       404:
 *         description: Service not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.delete('/services/:id', authenticate, ProviderController.deleteService);

// =============================================================================
// PUBLIC ROUTES (COME AFTER AUTHENTICATED ROUTES)
// =============================================================================
// These routes are for homeowners to browse and view providers

/**
 * @swagger
 * /api/providers/search:
 *   get:
 *     summary: Search for providers
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: zipCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 25
 *         description: Search radius in miles
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *       - in: query
 *         name: availableOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of providers matching search criteria
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/search', authenticate, ProviderController.searchProviders);

/**
 * @swagger
 * /api/providers/{id}:
 *   get:
 *     summary: Get provider details by ID
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID
 *     responses:
 *       200:
 *         description: Provider details
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
 *         description: Provider not found
 */
router.get('/:id', ProviderController.getProviderById);

/**
 * @swagger
 * /api/providers/{id}/services:
 *   get:
 *     summary: Get services offered by a provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter for active services only
 *     responses:
 *       200:
 *         description: List of provider's services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Provider not found
 */
router.get('/:id/services', ProviderController.getProviderServices);

/**
 * @swagger
 * /api/providers/{id}/reviews:
 *   get:
 *     summary: Get reviews for a provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Provider ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *     responses:
 *       200:
 *         description: List of provider reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Provider not found
 */
router.get('/:id/reviews', ProviderController.getProviderReviews);

export default router;