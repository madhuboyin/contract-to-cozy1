// apps/backend/src/controllers/notification.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { NotificationService } from '../services/notification.service';
import { prisma } from '../lib/prisma';
import { emailNotificationQueue } from '../services/JobQueue.service';
import { NotificationChannel, DeliveryStatus,SignalSourceType, SignalTriggerType } from '@prisma/client';

type SignalSourceBadge = {
  sourceType: SignalSourceType;
  triggerType: SignalTriggerType;
  sourceSystem?: string | null;
  summary?: string | null;
  confidence?: number | null; // 0..1
};

function inferSignalSourceFromNotification(n: any): SignalSourceBadge {
  // 1) Prefer explicit metadata.signalSource (if present)
  const ss = n?.metadata?.signalSource;
  if (ss?.sourceType && ss?.triggerType) {
    return {
      sourceType: ss.sourceType,
      triggerType: ss.triggerType,
      sourceSystem: ss.sourceSystem ?? null,
      summary: ss.summary ?? null,
      confidence: typeof ss.confidence === 'number' ? ss.confidence : null,
    };
  }

  const type = String(n?.type ?? '').toUpperCase();

  // 2) Fallback heuristic
  if (type.includes('SEASONAL') || type.includes('SCHEDULED')) {
    return {
      sourceType: SignalSourceType.SCHEDULED,
      triggerType: SignalTriggerType.SCHEDULE,
      sourceSystem: 'scheduler',
      summary: 'Scheduled reminder',
      confidence: null,
    };
  }

  if (type.includes('RECALL') || type.includes('CPSC')) {
    return {
      sourceType: SignalSourceType.EXTERNAL,
      triggerType: SignalTriggerType.INGEST,
      sourceSystem: 'externalFeed',
      summary: 'From a third-party feed',
      confidence: null,
    };
  }

  if (type.includes('WARRANTY') || type.includes('INSURANCE') || type.includes('COVERAGE')) {
    return {
      sourceType: SignalSourceType.COVERAGE,
      triggerType: SignalTriggerType.RULE,
      sourceSystem: 'coverage',
      summary: 'Derived from your coverage records',
      confidence: null,
    };
  }

  if (type.includes('RISK') || type.includes('FREEZE') || type.includes('LAPSE')) {
    return {
      sourceType: SignalSourceType.INTELLIGENCE,
      triggerType: SignalTriggerType.MODEL,
      sourceSystem: 'riskModel',
      summary: 'Generated from your property intelligence',
      confidence: null,
    };
  }

  if (type.includes('DOCUMENT') || type.includes('OCR')) {
    return {
      sourceType: SignalSourceType.DOCUMENT,
      triggerType: SignalTriggerType.EXTRACTION,
      sourceSystem: 'docExtraction',
      summary: 'Extracted from a document',
      confidence: null,
    };
  }

  // Default: user-driven lifecycle
  return {
    sourceType: SignalSourceType.MANUAL,
    triggerType: SignalTriggerType.USER_ACTION,
    sourceSystem: 'userActivity',
    summary: 'Triggered by your activity',
    confidence: null,
  };
}

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

    const limitParam = req.query.limit;
    const parsedLimit =
      typeof limitParam === 'string' ? Number.parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 30;

    const notifications = await NotificationService.listForUser(userId, limit);
<<<<<<< ours
    // ✅ enrich for UI
    const dto = notifications.map((n: any) => ({
      ...n,
      signalSource: inferSignalSourceFromNotification(n),
    }));
=======
>>>>>>> theirs

    return res.json({
      success: true,
      data: dto,
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
