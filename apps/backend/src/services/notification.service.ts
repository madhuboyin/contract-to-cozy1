// apps/backend/src/services/notification.service.ts

import { prisma } from '../lib/prisma';
import { NotificationChannel, DeliveryStatus,SignalSourceType, SignalTriggerType } from '@prisma/client';
import {
  emailNotificationQueue,
  pushNotificationQueue,
  smsNotificationQueue,
} from './JobQueue.service';
import { getAggregationContextEnvelope } from './aggregationContext/context';
import { resolveNotificationPolicy } from './notificationPreference.service';
import type { NotificationCategory, NotificationUrgency } from '../productFramework/notificationPolicy.contract';
import { logger } from '../lib/logger';

type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  recallMatchId?: string;
  metadata?: Record<string, any>;
  signalSource?: NotificationSignalSource;
  category?: NotificationCategory;
  urgency?: NotificationUrgency;
  requiredChannels?: NotificationChannel[];
};

type NotificationSignalSource = {
  sourceType: SignalSourceType;
  triggerType: SignalTriggerType;
  sourceSystem?: string;
  summary?: string;
  confidence?: number | null; // 0..1
};
/**
 * Notification types that MUST be delivered immediately
 * (affects EMAIL/SMS/PUSH urgency — NOT in-app behavior)
 */
const IMPORTANT_TYPES = new Set<string>([
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  'BOOKING_CONFIRMED',
  // Claims
  'CLAIM_SUBMITTED',
  'CLAIM_CLOSED',
  'FOLLOW_UP_DUE',
]);

export class NotificationService {
  /**
   * ============================================================
   * CREATE NOTIFICATION (Single Source of Truth)
   * ============================================================
   */
  static async create(input: CreateNotificationInput) {
    const propertyId = typeof input.metadata?.propertyId === 'string'
      ? input.metadata.propertyId
      : undefined;
    if (propertyId) {
      const propertyContext = await getAggregationContextEnvelope(propertyId, input.userId, 'NOTIFICATIONS');
      if (propertyContext.decision.status !== 'APPLICABLE') {
        return null;
      }
      const explicitIdentity = typeof input.metadata?.aggregationIdentity === 'string'
        ? input.metadata.aggregationIdentity
        : null;
      const actionKey = typeof input.metadata?.actionKey === 'string'
        ? input.metadata.actionKey.toUpperCase()
        : null;
      const lifecycle = propertyContext.lifecycle.find((item) =>
        (explicitIdentity && item.identity === explicitIdentity) ||
        (input.entityId && item.sourceId === input.entityId) ||
        (actionKey && item.actionKey?.toUpperCase() === actionKey),
      );
      if (lifecycle && lifecycle.status !== 'ACTIVE') {
        return null;
      }
      input = {
        ...input,
        metadata: {
          ...input.metadata,
          propertyContextVersion: propertyContext.contextVersion,
          aggregationDecision: propertyContext.decision,
          aggregationLifecycle: propertyContext.lifecycle,
          aggregationIdentity: explicitIdentity ?? lifecycle?.identity ?? null,
        },
      };
    }
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
    const policy = await resolveNotificationPolicy({
      userId: input.userId,
      propertyId,
      type: input.type,
      category: input.category,
      urgency: input.urgency ?? (IMPORTANT_TYPES.has(input.type) ? 'MATERIAL' : undefined),
      legacyEmailEnabled: emailEnabled,
    });
    const isImportant = policy.urgency !== 'ROUTINE';

    const mergedMetadata = {
      ...input.metadata,
      priority: isImportant ? 'HIGH' : 'LOW',
      signalSource: input.signalSource ?? input.metadata?.signalSource ?? undefined,
      notificationPolicy: policy,
    };

    /**
     * 3️⃣ Decide channels
     *
     * 🔒 IN_APP is ALWAYS created
     *     (cannot be disabled; UI depends on it)
     */
    const channels = policy.channels.filter((candidate) => candidate.enabled);
    for (const requiredChannel of input.requiredChannels ?? []) {
      if (!channels.some((candidate) => candidate.channel === requiredChannel)) {
        channels.push({ channel: requiredChannel, enabled: true, cadence: 'IMMEDIATE', deliverImmediately: true, quietHoursApplied: false });
      }
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
        recallMatchId: input.recallMatchId,
        metadata: mergedMetadata,
        deliveries: {
          create: channels.map((candidate) => ({
            channel: candidate.channel as NotificationChannel,
            status:
              candidate.channel === NotificationChannel.IN_APP
                ? DeliveryStatus.SENT
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
        const channelPolicy = channels.find((candidate) => candidate.channel === delivery.channel);
        if (!channelPolicy?.deliverImmediately) continue;
        try {
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
            await prisma.notificationDelivery.update({
              where: { id: delivery.id },
              data: { enqueuedAt: new Date() },
            });
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
        } catch (error) {
          logger.warn({ err: error, notificationId: notification.id, deliveryId: delivery.id }, '[NOTIFICATION] Immediate enqueue failed; pending delivery remains eligible for retry.');
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

  static async markUnread(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) throw new Error('Notification not found');

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: false,
        readAt: null, // Critical: Clear the date so it doesn't count as read
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
