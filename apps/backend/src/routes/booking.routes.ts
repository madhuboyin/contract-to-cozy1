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
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerId
 *               - serviceId
 *               - propertyId
 *               - description
 *               - estimatedPrice
 *             properties:
 *               providerId:
 *                 type: string
 *                 format: uuid
 *               serviceId:
 *                 type: string
 *                 format: uuid
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *               requestedDate:
 *                 type: string
 *                 format: date-time
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               specialRequests:
 *                 type: string
 *                 maxLength: 500
 *               estimatedPrice:
 *                 type: number
 *               depositAmount:
 *                 type: number
 *           example:
 *             providerId: provider-uuid
 *             serviceId: service-uuid
 *             propertyId: property-uuid
 *             scheduledDate: "2025-03-15T10:00:00Z"
 *             description: "Need full home inspection for property purchase"
 *             estimatedPrice: 450.00
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Homeowner only
 */
router.post('/', authenticate, BookingController.createBooking);

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: List bookings (filtered by user role)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
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
 *           maximum: 50
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, scheduledDate, status]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of bookings
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
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticate, BookingController.listBookings);

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Get booking details by ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Access denied
 */
router.get('/:id', authenticate, BookingController.getBookingById);

/**
 * @swagger
 * /api/bookings/{id}:
 *   put:
 *     summary: Update booking details
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               specialRequests:
 *                 type: string
 *                 maxLength: 500
 *               estimatedPrice:
 *                 type: number
 *               finalPrice:
 *                 type: number
 *               internalNotes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Provider only
 *           example:
 *             scheduledDate: "2025-03-16T14:00:00Z"
 *             description: "Updated: Need to inspect basement as well"
 *     responses:
 *       200:
 *         description: Booking updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Access denied
 */
router.put('/:id', authenticate, BookingController.updateBooking);

/**
 * @swagger
 * /api/bookings/{id}/confirm:
 *   post:
 *     summary: Confirm booking (Provider only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.post('/:id/confirm', authenticate, BookingController.confirmBooking);

/**
 * @swagger
 * /api/bookings/{id}/start:
 *   post:
 *     summary: Start booking / mark as in progress (Provider only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.post('/:id/start', authenticate, BookingController.startBooking);

/**
 * @swagger
 * /api/bookings/{id}/complete:
 *   post:
 *     summary: Complete booking (Provider only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actualStartTime
 *               - actualEndTime
 *               - finalPrice
 *             properties:
 *               actualStartTime:
 *                 type: string
 *                 format: date-time
 *               actualEndTime:
 *                 type: string
 *                 format: date-time
 *               finalPrice:
 *                 type: number
 *               internalNotes:
 *                 type: string
 *                 maxLength: 1000
 *           example:
 *             actualStartTime: "2025-03-15T10:00:00Z"
 *             actualEndTime: "2025-03-15T13:30:00Z"
 *             finalPrice: 475.00
 *             internalNotes: "Found additional issues with foundation"
 *     responses:
 *       200:
 *         description: Booking completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Provider only
 */
router.post('/:id/complete', authenticate, BookingController.completeBooking);

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   post:
 *     summary: Cancel booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *           example:
 *             reason: "Homeowner decided to postpone property purchase"
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Access denied
 */
router.post('/:id/cancel', authenticate, BookingController.cancelBooking);

export default router;