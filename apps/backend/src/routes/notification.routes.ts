// apps/backend/src/routes/notification.routes.ts

import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * ============================================================
 * IN-APP NOTIFICATIONS (User-facing)
 * ============================================================
 */

// List all notifications for current user
router.get('/', authenticate, NotificationController.list);

// Unread count (badge)
router.get('/unread-count', authenticate, NotificationController.unreadCount);

// Mark all notifications as read
router.post('/read-all', authenticate, NotificationController.markAllAsRead);

// Mark single notification as read (Changed from .post to .patch to match frontend)
router.patch('/:id/read', authenticate, NotificationController.markAsRead);

// Mark single notification as unread (Persistent Reset)
router.patch('/:id/unread', authenticate, NotificationController.markAsUnread);

/**
 * ============================================================
 * DELIVERY MANAGEMENT (Admin / Advanced)
 * ============================================================
 */

// Retry a failed delivery (EMAIL only for now)
router.post(
  '/deliveries/:deliveryId/retry',
  authenticate,
  NotificationController.retryDelivery
);

export default router;
