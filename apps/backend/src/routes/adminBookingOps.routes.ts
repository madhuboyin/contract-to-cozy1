// apps/backend/src/routes/adminBookingOps.routes.ts
//
// Booking Operations API (ADMIN_MODULE_FRD.md §10.3, Phase 2 slice).
// Read-only v1 under BOOKING_VIEW — governed booking mutations
// (BOOKING_OPERATE) are a later slice.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate } from '../middleware/validate.middleware';
import { ListBookingsQuerySchema } from '../validators/adminBookingOps.validators';
import {
  getBookingDetailHandler,
  listBookingsHandler,
} from '../controllers/adminBookingOps.controller';

const router = Router();

router.use('/admin/bookings', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/bookings:
 *   get:
 *     summary: Booking search — by booking number, filter by status
 *     tags: [Admin Booking Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/bookings', requireCapability('BOOKING_VIEW'), validate(ListBookingsQuerySchema), listBookingsHandler);

/**
 * @swagger
 * /api/admin/bookings/{bookingId}:
 *   get:
 *     summary: Booking operational detail with merged event timeline
 *     tags: [Admin Booking Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/bookings/:bookingId', requireCapability('BOOKING_VIEW'), getBookingDetailHandler);

export default router;
