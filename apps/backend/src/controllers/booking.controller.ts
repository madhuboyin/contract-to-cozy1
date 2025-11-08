// apps/backend/src/controllers/booking.controller.ts

import { Response, NextFunction } from 'express';
import { BookingService } from '../services/booking.service';
import {
  createBookingSchema,
  updateBookingSchema,
  cancelBookingSchema,
  completeBookingSchema,
  listBookingsSchema,
  CreateBookingInput,
  UpdateBookingInput,
  CancelBookingInput,
  CompleteBookingInput,
  ListBookingsQuery,
} from '../types/booking.types';
import { ZodError } from 'zod';
import { AuthRequest } from '../types/auth.types';

export class BookingController {
  /**
   * Create a new booking
   * POST /api/bookings
   */
  static async createBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || userRole !== 'HOMEOWNER') {
        res.status(403).json({
          success: false,
          message: 'Only homeowners can create bookings',
        });
        return;
      }

      // Validate input
      const input = createBookingSchema.parse(req.body) as CreateBookingInput;

      const booking = await BookingService.createBooking(userId, input);

      res.status(201).json({
        success: true,
        message: 'Booking created successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid booking data',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * List bookings
   * GET /api/bookings
   */
  static async listBookings(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Validate query parameters
      const query = listBookingsSchema.parse(req.query) as ListBookingsQuery;

      const result = await BookingService.listBookings(userId, userRole, query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: error.issues,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Get booking by ID
   * GET /api/bookings/:id
   */
  static async getBookingById(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const booking = await BookingService.getBookingById(id, userId, userRole);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
        });
        return;
      }

      // Get permissions for this user
      const permissions = BookingService.getBookingPermissions(
        booking,
        userId,
        userRole
      );

      res.status(200).json({
        success: true,
        data: {
          ...booking,
          permissions,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('permission')) {
        res.status(403).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Update booking
   * PUT /api/bookings/:id
   */
  static async updateBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Validate input
      const input = updateBookingSchema.parse(req.body) as UpdateBookingInput;

      const booking = await BookingService.updateBooking(id, userId, userRole, input);

      res.status(200).json({
        success: true,
        message: 'Booking updated successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid booking data',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  /**
   * Confirm booking (provider only)
   * POST /api/bookings/:id/confirm
   */
  static async confirmBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || userRole !== 'PROVIDER') {
        res.status(403).json({
          success: false,
          message: 'Only providers can confirm bookings',
        });
        return;
      }

      const booking = await BookingService.confirmBooking(id, userId);

      res.status(200).json({
        success: true,
        message: 'Booking confirmed successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  /**
   * Start booking (provider only)
   * POST /api/bookings/:id/start
   */
  static async startBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || userRole !== 'PROVIDER') {
        res.status(403).json({
          success: false,
          message: 'Only providers can start bookings',
        });
        return;
      }

      const booking = await BookingService.startBooking(id, userId);

      res.status(200).json({
        success: true,
        message: 'Booking started successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  /**
   * Complete booking (provider only)
   * POST /api/bookings/:id/complete
   */
  static async completeBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || userRole !== 'PROVIDER') {
        res.status(403).json({
          success: false,
          message: 'Only providers can complete bookings',
        });
        return;
      }

      // Validate input
      const input = completeBookingSchema.parse(req.body) as CompleteBookingInput;

      const booking = await BookingService.completeBooking(id, userId, input);

      res.status(200).json({
        success: true,
        message: 'Booking completed successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid completion data',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  /**
   * Cancel booking
   * POST /api/bookings/:id/cancel
   */
  static async cancelBooking(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Validate input
      const input = cancelBookingSchema.parse(req.body) as CancelBookingInput;

      const booking = await BookingService.cancelBooking(id, userId, userRole, input);

      res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully',
        data: booking,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid cancellation data',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }
}
