// apps/backend/src/feedback/feedback.controller.ts
//
// Generic, app-wide pilot feedback channel (thumbs up/down + optional
// comment) — not scoped to any single feature. See also
// src/sellerPrep/sellerPrep.controller.ts#submitFeedback, which predates
// this and writes to the same `Feedback` table with a required propertyId.
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { getEmailNotificationQueue } from '../services/JobQueue.service';
import { recordTypedFeedback } from '../services/feedback/typedFeedback.service';

// Placeholder team alias for pilot feedback alerts — override via env in
// any environment where a real monitored inbox exists.
const FEEDBACK_NOTIFICATION_EMAIL =
  process.env.FEEDBACK_NOTIFICATION_EMAIL || 'feedback@contracttocozy.com';

const VALID_RATINGS = ['up', 'down'];

export class FeedbackController {
  static async submit(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { rating, comment, page } = req.body;

      if (!rating || !VALID_RATINGS.includes(rating)) {
        return res.status(400).json({
          success: false,
          message: 'rating is required and must be "up" or "down"',
        });
      }

      if (!page || typeof page !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'page is required',
        });
      }

      const feedback = await recordTypedFeedback({
        userId,
        propertyId: null,
        page,
        rating,
        comment: comment || null,
        targetType: 'OTHER',
        targetId: page,
        surface: 'OTHER',
        reasonCodes: [rating === 'up' ? 'USEFUL' : 'NOT_USEFUL'],
      });

      // Fire-and-forget: notify the pilot feedback alias by email. A failed
      // enqueue (e.g. Redis unavailable) or failed send must never fail the
      // user's feedback submission, so this is not awaited and any error is
      // only logged.
      getEmailNotificationQueue()
        .add(
          'SEND_FEEDBACK_NOTIFICATION',
          {
            to: FEEDBACK_NOTIFICATION_EMAIL,
            rating,
            comment: comment || null,
            page,
            userEmail: req.user!.email,
            userId,
          },
          { removeOnComplete: true, removeOnFail: true, attempts: 2 }
        )
        .catch((err) => {
          logger.error(
            { err },
            '[FeedbackController] failed to enqueue feedback notification email'
          );
        });

      res.status(201).json({
        success: true,
        data: feedback,
        message: 'Feedback submitted successfully',
      });
    } catch (error) {
      logger.error({ err: error }, '[FeedbackController] submit error');
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit feedback',
      });
    }
  }
}
