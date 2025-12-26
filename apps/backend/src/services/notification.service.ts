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

export class NotificationService {
  static async create(input: CreateNotificationInput) {
    // 1️⃣ Read user preferences
    const homeownerProfile = await prisma.homeownerProfile.findFirst({
      where: { userId: input.userId },
      select: { notificationPreferences: true },
    });

    const preferences = homeownerProfile?.notificationPreferences as
      | { emailEnabled?: boolean }
      | null;

    const emailEnabled = preferences?.emailEnabled !== false;

    // 2️⃣ Decide channels (future-ready)
    const channels: NotificationChannel[] = [];

    if (emailEnabled) channels.push(NotificationChannel.EMAIL);

    // Future toggles (no schema change)
    // channels.push(NotificationChannel.PUSH);
    // channels.push(NotificationChannel.SMS);

    if (channels.length === 0) {
      return null; // user opted out completely
    }

    // 3️⃣ Create notification + deliveries
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
        deliveries: {
          create: channels.map((channel) => ({
            channel,
            status: DeliveryStatus.PENDING,
          })),
        },
      },
      include: { deliveries: true },
    });

    // 4️⃣ Enqueue per-channel
    for (const delivery of notification.deliveries) {
      switch (delivery.channel) {
        case NotificationChannel.EMAIL:
          await emailNotificationQueue.add('SEND_EMAIL_NOTIFICATION', {
            notificationDeliveryId: delivery.id,
          });
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

    return notification;
  }
}
