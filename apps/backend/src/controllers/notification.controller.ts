// apps/backend/src/controllers/notification.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { NotificationService } from '../services/notification.service';
import { prisma } from '../lib/prisma';
import { emailNotificationQueue } from '../services/JobQueue.service';
import { NotificationChannel, DeliveryStatus } from '@prisma/client';

export class NotificationController {
  /**
   * ============================================================
   * LIST NOTIFICATIONS (In-App)
   * ============================================================
   */
  static async list(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notifications = await NotificationService.listForUser(userId);

    return res.json({
      success: true,
      data: notifications,
    });
  }

  /**
   * ============================================================
   * MARK SINGLE NOTIFICATION AS READ
   * ============================================================
   */
// apps/backend/src/controllers/notification.controller.ts

static async markAsRead(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // This service call performs the persistent DB update
  const notification = await NotificationService.markRead(userId, id);
  return res.json({ success: true, data: notification });
}

static async markAsUnread(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // This service call clears the read status in the DB
  const notification = await NotificationService.markUnread(userId, id);
  return res.json({ success: true, data: notification });
}
  /**
   * ============================================================
   * MARK ALL NOTIFICATIONS AS READ
   * ============================================================
   */
  static async markAllAsRead(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await NotificationService.markAllRead(userId);

    return res.json({ success: true });
  }

  /**
   * ============================================================
   * UNREAD COUNT (Bell Badge)
   * ============================================================
   */
  static async unreadCount(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const count = await NotificationService.getUnreadCount(userId);

    return res.json({
      success: true,
      data: { count },
    });
  }

  /**
   * ============================================================
   * RETRY FAILED DELIVERY (ADMIN / FUTURE UI)
   * ============================================================
   */
  static async retryDelivery(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;
    const { deliveryId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });

    if (!delivery) {
      return res.status(404).json({
        message: 'Delivery not found',
      });
    }

    // 🔒 Ownership check (important)
    if (delivery.notification.userId !== userId) {
      return res.status(403).json({
        message: 'Forbidden',
      });
    }

    if (delivery.status !== DeliveryStatus.FAILED) {
      return res.status(400).json({
        message: 'Only FAILED deliveries can be retried',
      });
    }

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.PENDING,
        failureReason: null,
      },
    });

    // Retry only supported channels
    if (delivery.channel === NotificationChannel.EMAIL) {
      await emailNotificationQueue.add(
        'SEND_EMAIL_NOTIFICATION',
        { notificationDeliveryId: deliveryId },
        { jobId: deliveryId } // idempotent
      );
    }

    return res.json({ success: true });
  }
}
