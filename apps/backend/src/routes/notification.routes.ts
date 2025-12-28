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

// Mark single notification as read
router.post('/:id/read', authenticate, NotificationController.markAsRead);

// Mark all notifications as read
router.post('/read-all', authenticate, NotificationController.markAllAsRead);

// Add this line to notification.routes.ts
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
