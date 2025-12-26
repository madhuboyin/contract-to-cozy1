import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { prisma } from '../lib/prisma';
import { emailNotificationQueue } from '../services/JobQueue.service';

export class NotificationController {
  static async list(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notifications);
  }

  static async markAsRead(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;
    const { id } = req.params;

    await prisma.notification.updateMany({
      where: { id, userId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.status(204).send();
  }

  static async unreadCount(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    res.json({ count });
  }
  static async retryDelivery(req: AuthRequest, res: Response) {
    const { deliveryId } = req.params;
  
    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });
  
    if (!delivery || delivery.status !== 'FAILED') {
      return res.status(400).json({
        message: 'Only FAILED deliveries can be retried',
      });
    }
  
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        failureReason: null,
      },
    });
  
    await emailNotificationQueue.add('SEND_EMAIL_NOTIFICATION', {
      notificationDeliveryId: deliveryId,
    });
  
    res.json({ success: true });
  }
  

}
