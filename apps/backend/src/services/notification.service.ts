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
 */
const IMPORTANT_TYPES = new Set([
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  'BOOKING_CONFIRMED',
]);

export class NotificationService {
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
     * 2️⃣ Decide delivery behavior
     */
    const isImportant = IMPORTANT_TYPES.has(input.type);

    const channels: NotificationChannel[] = [];
    if (emailEnabled) channels.push(NotificationChannel.EMAIL);

    // Future channels
    // channels.push(NotificationChannel.PUSH);
    // channels.push(NotificationChannel.SMS);

    if (channels.length === 0) {
      return null; // user opted out
    }

    /**
     * 3️⃣ Create notification + delivery rows
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
          importance: isImportant ? 'IMPORTANT' : 'NORMAL',
        },
        deliveries: {
          create: channels.map((channel) => ({
            channel,
            status: DeliveryStatus.PENDING,
          })),
        },
      },
      include: { deliveries: true },
    });

    /**
     * 4️⃣ Enqueue ONLY immediate notifications
     */
    if (isImportant) {
      for (const delivery of notification.deliveries) {
        switch (delivery.channel) {
          case NotificationChannel.EMAIL:
            await emailNotificationQueue.add(
              'SEND_EMAIL_NOTIFICATION',
              { notificationDeliveryId: delivery.id },
              {
                jobId: delivery.id, // idempotency
              }
            );
            break;

          case NotificationChannel.PUSH:
            await pushNotificationQueue.add('SEND_PUSH_NOTIFICATION', {
              notificationDeliveryId: delivery.id,
            });
            break;

          case NotificationChannel.SMS:
            await smsNotificationQueue.add('SEND_SMS_NOTIFICATION', {
              notificationDeliveryId: delivery.id,
            });
            break;
        }
      }
    }

    /**
     * Digest notifications are stored only.
     * Daily digest worker will pick them up.
     */
    return notification;
  }
}
