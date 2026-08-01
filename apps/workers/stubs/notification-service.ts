// Stub for workers Docker build.
// The real notification.service.ts imports JobQueue.service which pulls in
// many backend-only dependencies (RiskAssessmentService, FinancialReportService, etc.).
// The worker image cannot import the backend delivery queues, but it must still
// persist the canonical in-app notification. Async email/push delivery remains
// the backend service's responsibility.

import { prisma } from '../lib/prisma';

export class NotificationService {
  static async create(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
    recallMatchId?: string;
    metadata?: Record<string, any>;
    signalSource?: Record<string, any>;
    category?: string;
    urgency?: string;
    requiredChannels?: string[];
    deduplicationKey?: string;
    // Accepted for type parity with the real notification.service.ts
    // (WKR-002 — apps/backend/src/config/workerExecutionPolicy.ts) but
    // unused here: this stub never enqueues a channel transport in the
    // first place, only persists the canonical in-app notification.
    transportEnabled?: boolean;
  }) {
    const existing = input.deduplicationKey
      ? await prisma.notification.findUnique({
        where: { deduplicationKey: input.deduplicationKey },
        include: { deliveries: true },
      })
      : input.entityType && input.entityId
      ? await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
        },
        include: { deliveries: true },
      })
      : null;
    if (existing) return existing;

    return prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        entityType: input.entityType,
        entityId: input.entityId,
        recallMatchId: input.recallMatchId,
        deduplicationKey: input.deduplicationKey,
        metadata: {
          ...input.metadata,
          category: input.category,
          urgency: input.urgency,
          workerPersisted: true,
        },
        deliveries: {
          create: { channel: 'IN_APP', status: 'SENT', sentAt: new Date() },
        },
      },
      include: { deliveries: true },
    });
  }
}
