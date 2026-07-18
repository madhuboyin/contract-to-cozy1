// apps/backend/src/controllers/adminBookingOps.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminBookingOpsError,
  getBookingDetail,
  listBookings,
  openDisputeCase,
} from '../services/adminBookingOps.service';

export async function listBookingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, status, page, limit } = req.query as {
      q?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    const result = await listBookings({
      q,
      status: status as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-BOOKING-OPS] Failed to list bookings');
    res.status(500).json({ success: false, error: { message: 'Failed to list bookings' } });
  }
}

export async function getBookingDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  const { bookingId } = req.params;
  try {
    const detail = await getBookingDetail(bookingId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (err instanceof AdminBookingOpsError && err.code === 'BOOKING_NOT_FOUND') {
      res.status(404).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-BOOKING-OPS] Failed to load booking detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load booking detail' } });
  }
}

export async function openDisputeCaseHandler(req: AuthRequest, res: Response): Promise<void> {
  const { reason, severity } = req.body as { reason: string; severity?: string };
  try {
    const created = await openDisputeCase(
      { bookingId: req.params.bookingId, actorId: req.user!.userId, reason, severity: severity as any },
      { req }
    );
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err instanceof AdminBookingOpsError && (err.code === 'BOOKING_NOT_FOUND' || err.code === 'DISPUTE_CASE_ALREADY_OPEN')) {
      res
        .status(err.code === 'BOOKING_NOT_FOUND' ? 404 : 409)
        .json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-BOOKING-OPS] Failed to open dispute case');
    res.status(500).json({ success: false, error: { message: 'Failed to open dispute case' } });
  }
}
