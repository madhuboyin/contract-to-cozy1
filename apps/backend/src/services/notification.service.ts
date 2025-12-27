// apps/backend/src/services/notification.service.ts

import { prisma } from '../lib/prisma';
import { NotificationChannel, DeliveryStatus } from '@prisma/client';
import {
  emailNotificationQueue,
  pushNotificationQueue,
  smsNotificationQueue,
} from './JobQueue.service';

type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
};

/**
 * Notification types that MUST be delivered immediately
 * (affects EMAIL/SMS/PUSH urgency — NOT in-app behavior)
 */
const IMPORTANT_TYPES = new Set<string>([
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  'BOOKING_CONFIRMED',
]);

export class NotificationService {
  /**
   * ============================================================
   * CREATE NOTIFICATION (Single Source of Truth)
   * ============================================================
   */
  static async create(input: CreateNotificationInput) {
    /**
     * 1️⃣ Load user notification preferences
     */
    const homeownerProfile = await prisma.homeownerProfile.findFirst({
      where: { userId: input.userId },
      select: { notificationPreferences: true },
    });

    const preferences = homeownerProfile?.notificationPreferences as
      | { emailEnabled?: boolean }
      | null;

    const emailEnabled = preferences?.emailEnabled !== false;

    /**
     * 2️⃣ Decide importance / priority
     */
    const isImportant = IMPORTANT_TYPES.has(input.type);

    /**
     * 3️⃣ Decide channels
     *
     * 🔒 IN_APP is ALWAYS created
     *     (cannot be disabled; UI depends on it)
     */
    const channels: NotificationChannel[] = [
      NotificationChannel.IN_APP,
    ];

    if (emailEnabled) {
      channels.push(NotificationChannel.EMAIL);
    }

    // Future extensibility
    // channels.push(NotificationChannel.PUSH);
    // channels.push(NotificationChannel.SMS);

    /**
     * 4️⃣ Create Notification + Delivery rows atomically
     */
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: {
          ...input.metadata,
          priority: isImportant ? 'HIGH' : 'LOW',
        },
        deliveries: {
          create: channels.map((channel) => ({
            channel,
            status:
              channel === NotificationChannel.IN_APP
                ? DeliveryStatus.SENT // In-app is instant
                : DeliveryStatus.PENDING,
          })),
        },
      },
      include: { deliveries: true },
    });

    /**
     * 5️⃣ Enqueue ONLY immediate (important) async deliveries
     *
     * IN_APP never goes to a queue
     */
    if (isImportant) {
      for (const delivery of notification.deliveries) {
        switch (delivery.channel) {
          case NotificationChannel.EMAIL:
            await emailNotificationQueue.add(
              'SEND_EMAIL_NOTIFICATION',
              { notificationDeliveryId: delivery.id },
              {
                jobId: delivery.id, // idempotent
                removeOnComplete: true,
                removeOnFail: false,
              }
            );
            break;

          case NotificationChannel.PUSH:
            await pushNotificationQueue.add(
              'SEND_PUSH_NOTIFICATION',
              { notificationDeliveryId: delivery.id }
            );
            break;

          case NotificationChannel.SMS:
            await smsNotificationQueue.add(
              'SEND_SMS_NOTIFICATION',
              { notificationDeliveryId: delivery.id }
            );
            break;

          case NotificationChannel.IN_APP:
            // No-op — already delivered
            break;
        }
      }
    }

    /**
     * Non-important notifications:
     * - Stored only
     * - Picked up later by digest workers (email/push)
     */
    return notification;
  }

  /**
   * ============================================================
   * IN-APP NOTIFICATION QUERIES
   * ============================================================
   */

  static async listForUser(userId: string, limit = 30) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  static async markRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.isRead) {
      return notification;
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  static async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
