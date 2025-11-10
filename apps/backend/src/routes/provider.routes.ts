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
 * @route   GET /api/providers/services
 * @desc    Get current provider's services
 * @access  Private (Provider only)
 * 
 * @example
 * GET /api/providers/services
 * Headers: { Authorization: Bearer <token> }
 */
router.get('/services', authenticate, ProviderController.getMyServices);

/**
 * @route   POST /api/providers/services
 * @desc    Create a new service
 * @access  Private (Provider only)
 * 
 * @body    {
 *   category: 'INSPECTION' | 'HANDYMAN',
 *   inspectionType?: string,
 *   handymanType?: string,
 *   name: string (1-200 chars),
 *   description: string (10-1000 chars),
 *   basePrice: number (positive),
 *   priceUnit: string,
 *   minimumCharge?: number (positive),
 *   estimatedDuration?: number (positive, in minutes),
 *   isActive: boolean
 * }
 * 
 * @example
 * POST /api/providers/services
 * Headers: { Authorization: Bearer <token> }
 * Body: {
 *   "category": "INSPECTION",
 *   "inspectionType": "HOME_INSPECTION",
 *   "name": "Complete Home Inspection",
 *   "description": "Comprehensive inspection of all major systems",
 *   "basePrice": 450,
 *   "priceUnit": "flat rate",
 *   "estimatedDuration": 180,
 *   "isActive": true
 * }
 */
router.post('/services', authenticate, ProviderController.createService);

/**
 * @route   PATCH /api/providers/services/:id
 * @desc    Update a service
 * @access  Private (Provider only)
 * 
 * @param   {string} id - Service ID
 * @body    Same as POST but all fields optional
 * 
 * @example
 * PATCH /api/providers/services/service-uuid
 * Headers: { Authorization: Bearer <token> }
 * Body: {
 *   "basePrice": 475,
 *   "description": "Updated description"
 * }
 */
router.patch('/services/:id', authenticate, ProviderController.updateService);

/**
 * @route   DELETE /api/providers/services/:id
 * @desc    Delete a service
 * @access  Private (Provider only)
 * 
 * @param   {string} id - Service ID
 * 
 * @example
 * DELETE /api/providers/services/service-uuid
 * Headers: { Authorization: Bearer <token> }
 */
router.delete('/services/:id', authenticate, ProviderController.deleteService);

// =============================================================================
// PUBLIC ROUTES (COME AFTER AUTHENTICATED ROUTES)
// =============================================================================
// These routes are for homeowners to browse and view providers

/**
 * @route   GET /api/providers/search
 * @desc    Search for providers
 * @access  Public
 * 
 * @query   {
 *   zipCode?: string,
 *   latitude?: number,
 *   longitude?: number,
 *   radius?: number (default: 25 miles),
 *   category?: ServiceCategory,
 *   minRating?: number (1-5),
 *   availableOnly?: boolean,
 *   page?: number,
 *   limit?: number
 * }
 * 
 * @example
 * GET /api/providers/search?zipCode=08536&category=INSPECTION&radius=50
 */
router.get('/search', ProviderController.searchProviders);

/**
 * @route   GET /api/providers/:id
 * @desc    Get provider details by ID
 * @access  Public
 * 
 * @param   {string} id - Provider ID
 * 
 * @example
 * GET /api/providers/provider-uuid
 */
router.get('/:id', ProviderController.getProviderById);

/**
 * @route   GET /api/providers/:id/services
 * @desc    Get services offered by a provider
 * @access  Public
 * 
 * @param   {string} id - Provider ID
 * @query   {
 *   activeOnly?: boolean (default: true)
 * }
 * 
 * @example
 * GET /api/providers/provider-uuid/services
 */
router.get('/:id/services', ProviderController.getProviderServices);

/**
 * @route   GET /api/providers/:id/reviews
 * @desc    Get reviews for a provider
 * @access  Public
 * 
 * @param   {string} id - Provider ID
 * @query   {
 *   page?: number,
 *   limit?: number,
 *   minRating?: number
 * }
 * 
 * @example
 * GET /api/providers/provider-uuid/reviews?page=1&limit=10
 */
router.get('/:id/reviews', ProviderController.getProviderReviews);

export default router;
