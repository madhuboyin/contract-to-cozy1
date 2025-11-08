// apps/backend/src/routes/booking.routes.ts

import express from 'express';
import { BookingController } from '../controllers/booking.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

/**
 * Booking Management Routes
 * 
 * All routes require authentication
 * Permissions are checked within each controller
 */

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking
 * @access  Private (Homeowner only)
 * @body    {
 *   providerId: string,
 *   serviceId: string,
 *   propertyId: string,
 *   requestedDate?: string (ISO),
 *   scheduledDate?: string (ISO),
 *   startTime?: string (ISO),
 *   endTime?: string (ISO),
 *   description: string (10-1000 chars),
 *   specialRequests?: string (max 500 chars),
 *   estimatedPrice: number,
 *   depositAmount?: number
 * }
 * 
 * @example
 * POST /api/bookings
 * {
 *   "providerId": "provider-uuid",
 *   "serviceId": "service-uuid",
 *   "propertyId": "property-uuid",
 *   "scheduledDate": "2025-03-15T10:00:00Z",
 *   "description": "Need full home inspection for property purchase",
 *   "estimatedPrice": 450.00
 * }
 */
router.post('/', authenticate, BookingController.createBooking);

/**
 * @route   GET /api/bookings
 * @desc    List bookings (filtered by user role)
 * @access  Private
 * @query   {
 *   status?: BookingStatus,
 *   category?: ServiceCategory,
 *   fromDate?: string (ISO),
 *   toDate?: string (ISO),
 *   page?: number (default: 1),
 *   limit?: number (default: 10, max: 50),
 *   sortBy?: 'createdAt' | 'scheduledDate' | 'status' (default: 'createdAt'),
 *   sortOrder?: 'asc' | 'desc' (default: 'desc')
 * }
 * 
 * @example
 * GET /api/bookings?status=CONFIRMED&page=1&limit=10
 * GET /api/bookings?fromDate=2025-03-01&toDate=2025-03-31
 */
router.get('/', authenticate, BookingController.listBookings);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking details by ID
 * @access  Private (Homeowner, Provider, or Admin)
 * @param   {string} id - Booking ID
 * 
 * @example
 * GET /api/bookings/booking-uuid-here
 */
router.get('/:id', authenticate, BookingController.getBookingById);

/**
 * @route   PUT /api/bookings/:id
 * @desc    Update booking details
 * @access  Private (Homeowner, Provider, or Admin)
 * @param   {string} id - Booking ID
 * @body    {
 *   scheduledDate?: string (ISO),
 *   startTime?: string (ISO),
 *   endTime?: string (ISO),
 *   description?: string (10-1000 chars),
 *   specialRequests?: string (max 500 chars),
 *   estimatedPrice?: number,
 *   finalPrice?: number,
 *   internalNotes?: string (max 1000 chars, provider only)
 * }
 * 
 * @example
 * PUT /api/bookings/booking-uuid-here
 * {
 *   "scheduledDate": "2025-03-16T14:00:00Z",
 *   "description": "Updated: Need to inspect basement as well"
 * }
 */
router.put('/:id', authenticate, BookingController.updateBooking);

/**
 * @route   POST /api/bookings/:id/confirm
 * @desc    Confirm booking (Provider only)
 * @access  Private (Provider only)
 * @param   {string} id - Booking ID
 * 
 * @example
 * POST /api/bookings/booking-uuid-here/confirm
 */
router.post('/:id/confirm', authenticate, BookingController.confirmBooking);

/**
 * @route   POST /api/bookings/:id/start
 * @desc    Start booking / mark as in progress (Provider only)
 * @access  Private (Provider only)
 * @param   {string} id - Booking ID
 * 
 * @example
 * POST /api/bookings/booking-uuid-here/start
 */
router.post('/:id/start', authenticate, BookingController.startBooking);

/**
 * @route   POST /api/bookings/:id/complete
 * @desc    Complete booking (Provider only)
 * @access  Private (Provider only)
 * @param   {string} id - Booking ID
 * @body    {
 *   actualStartTime: string (ISO),
 *   actualEndTime: string (ISO),
 *   finalPrice: number,
 *   internalNotes?: string (max 1000 chars)
 * }
 * 
 * @example
 * POST /api/bookings/booking-uuid-here/complete
 * {
 *   "actualStartTime": "2025-03-15T10:00:00Z",
 *   "actualEndTime": "2025-03-15T13:30:00Z",
 *   "finalPrice": 475.00,
 *   "internalNotes": "Found additional issues with foundation"
 * }
 */
router.post('/:id/complete', authenticate, BookingController.completeBooking);

/**
 * @route   POST /api/bookings/:id/cancel
 * @desc    Cancel booking
 * @access  Private (Homeowner, Provider, or Admin)
 * @param   {string} id - Booking ID
 * @body    {
 *   reason: string (10-500 chars)
 * }
 * 
 * @example
 * POST /api/bookings/booking-uuid-here/cancel
 * {
 *   "reason": "Homeowner decided to postpone property purchase"
 * }
 */
router.post('/:id/cancel', authenticate, BookingController.cancelBooking);

export default router;
