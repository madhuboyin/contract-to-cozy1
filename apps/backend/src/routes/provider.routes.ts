// apps/backend/src/routes/provider.routes.ts

import express from 'express';
import { ProviderController } from '../controllers/provider.controller';

const router = express.Router();

/**
 * Provider Search & Details Routes
 * 
 * All routes are public (no authentication required)
 * as users should be able to browse providers before signing up
 */

/**
 * @route   GET /api/providers/search
 * @desc    Search for providers by location and service type
 * @access  Public
 * @query   {
 *   latitude?: number,
 *   longitude?: number,
 *   zipCode?: string,
 *   city?: string,
 *   state?: string,
 *   radius?: number (default: 25),
 *   category?: 'INSPECTION' | 'HANDYMAN',
 *   inspectionType?: InspectionType,
 *   handymanType?: HandymanType,
 *   minRating?: number (0-5),
 *   sortBy?: 'rating' | 'distance' | 'reviews' | 'price' (default: 'rating'),
 *   sortOrder?: 'asc' | 'desc' (default: 'desc'),
 *   page?: number (default: 1),
 *   limit?: number (default: 10, max: 50)
 * }
 * 
 * @example
 * GET /api/providers/search?latitude=30.2672&longitude=-97.7431&radius=25&category=INSPECTION
 * GET /api/providers/search?zipCode=78701&category=HANDYMAN&minRating=4
 * GET /api/providers/search?city=Austin&state=TX&inspectionType=HOME_INSPECTION
 */
router.get('/search', ProviderController.searchProviders);

/**
 * @route   GET /api/providers/:id
 * @desc    Get detailed information about a specific provider
 * @access  Public
 * @param   {string} id - Provider profile ID
 * 
 * @example
 * GET /api/providers/abc-123-def-456
 */
router.get('/:id', ProviderController.getProviderById);

/**
 * @route   GET /api/providers/:id/services
 * @desc    Get all services offered by a provider
 * @access  Public
 * @param   {string} id - Provider profile ID
 * @query   {
 *   activeOnly?: boolean (default: true)
 * }
 * 
 * @example
 * GET /api/providers/abc-123-def-456/services
 * GET /api/providers/abc-123-def-456/services?activeOnly=false
 */
router.get('/:id/services', ProviderController.getProviderServices);

/**
 * @route   GET /api/providers/:id/reviews
 * @desc    Get reviews for a specific provider
 * @access  Public
 * @param   {string} id - Provider profile ID
 * @query   {
 *   page?: number (default: 1),
 *   limit?: number (default: 10, max: 50)
 * }
 * 
 * @example
 * GET /api/providers/abc-123-def-456/reviews
 * GET /api/providers/abc-123-def-456/reviews?page=2&limit=20
 */
router.get('/:id/reviews', ProviderController.getProviderReviews);

export default router;
