// apps/workers/src/jobs/sendEmailNotification.job.ts
import { prisma } from '../lib/prisma';
import { sendEmail } from '../email/email.service';
import { DeliveryStatus, NotificationChannel } from '@prisma/client';
import { buildDigestHtml, buildWeeklyHomeBriefHtml, escapeHtml } from '../email/buildDigestHtml';
import { buildWeatherAlertCardHtml, isWeatherCardMetadata } from '../email/buildWeatherAlertCardHtml';
import { logger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { AppLogger } from '../lib/logger';
import {
  decideRefinanceAlertRollout,
  isRefinanceNotification,
  REFINANCE_ALERT_ROLLOUT_SUPPRESSION_REASON,
} from '../lib/refinanceAlertRollout';

const MAX_NOTIFICATIONS_PER_EMAIL = 10;

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). The pure HTML-building
// helpers (buildDigestHtml, escapeHtml, buildWeatherAlertCardHtml,
// isWeatherCardMetadata) are deliberately left as plain imports rather than
// deps — like normalize.ts's helpers in recallMatching.service.ts, they're
// deterministic and no test needs to substitute them.
export interface SendEmailNotificationDeps {
  prisma: Pick<typeof prisma, 'notificationDelivery'>;
  sendEmail: typeof sendEmail;
  filterDeliveriesByAggregationPolicy: typeof filterDeliveriesByAggregationPolicy;
  logger: AppLogger;
  decideRefinanceAlertRollout: typeof decideRefinanceAlertRollout;
}

const defaultDeps: SendEmailNotificationDeps = {
  prisma,
  sendEmail,
  filterDeliveriesByAggregationPolicy,
  logger,
  decideRefinanceAlertRollout,
};

async function applyRefinanceRolloutGate<T extends {
  id: string;
  notification: { type?: string | null; metadata?: unknown };
}>(
  deliveries: T[],
  recipientEmail: string,
  deps: SendEmailNotificationDeps,
): Promise<T[]> {
  const decision = deps.decideRefinanceAlertRollout(recipientEmail);
  if (decision.allowed) return deliveries;
  const suppressedIds = deliveries
    .filter((delivery) => isRefinanceNotification(delivery.notification))
    .map((delivery) => delivery.id);
  if (suppressedIds.length === 0) return deliveries;
  await deps.prisma.notificationDelivery.updateMany({
    where: { id: { in: suppressedIds } },
    data: {
      status: DeliveryStatus.SKIPPED,
      failureReason: REFINANCE_ALERT_ROLLOUT_SUPPRESSION_REASON,
    },
  });
  return deliveries.filter(
    (delivery) => !suppressedIds.includes(delivery.id),
  );
}

export async function sendEmailNotificationJob(
  notificationDeliveryId: string,
  deps: SendEmailNotificationDeps = defaultDeps
) {
  const { prisma, sendEmail, filterDeliveriesByAggregationPolicy, logger } = deps;
  // 1️⃣ Find the triggering delivery
  const seedDelivery = await prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
    include: {
      notification: {
        include: { user: true },
      },
    },
  });

  if (!seedDelivery) return;
  if (seedDelivery.status !== DeliveryStatus.PENDING) return;
  
  const md = seedDelivery.notification.metadata;
  const priority =
    md && typeof md === 'object' && !Array.isArray(md)
      ? (md as any).priority
      : undefined;
  

  if (priority !== 'HIGH') {
    return; // let daily digest handle it
  }

  const user = seedDelivery.notification.user;
  if (!user?.email) return;

  // 2️⃣ Fetch MORE pending notifications for same user
  const pendingDeliveries = await prisma.notificationDelivery.findMany({
    where: {
      channel: NotificationChannel.EMAIL,
      status: DeliveryStatus.PENDING,
      notification: {
        userId: user.id,
        metadata: {
          path: ['priority'],
          equals: 'HIGH',
        },
      },           
    },
    include: {
      notification: true,
    },
    orderBy: {
      notification: {
        createdAt: 'desc',
      },
    },
    take: MAX_NOTIFICATIONS_PER_EMAIL,
  });
  const aggregationDeliveries =
    await filterDeliveriesByAggregationPolicy(pendingDeliveries);
  const deliveries = await applyRefinanceRolloutGate(
    aggregationDeliveries,
    user.email,
    deps,
  );

  if (deliveries.length === 0) return;

  // 3️⃣ Build email HTML
  const cardsHtml = deliveries
    .map(({ notification }) => {
      const weather = (notification.metadata as any)?.weather;
      if (isWeatherCardMetadata(weather)) {
        const card = buildWeatherAlertCardHtml({
          title: notification.title,
          actionUrl: notification.actionUrl,
          weather,
        });
        return `<tr><td style="padding:12px 0;">${card}</td></tr>`;
      }

      const safeTitle = escapeHtml(notification.title);
      const safeMessage = escapeHtml(notification.message);
      const safeUrl = notification.actionUrl
        ? escapeHtml(notification.actionUrl)
        : '';
      return `
        <tr>
          <td style="padding:12px 0;">
            <table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;">
              <tr>
                <td style="padding:14px;">
                  <h3 style="margin:0 0 6px;font-size:15px;color:#111;">
                    ${safeTitle}
                  </h3>
                  <p style="margin:0 0 10px;font-size:14px;color:#444;">
                    ${safeMessage}
                  </p>
                  ${
                    notification.actionUrl
                      ? `<a href="${safeUrl}"
                           style="font-size:14px;color:#2e7d32;text-decoration:none;">
                          View details →
                        </a>`
                      : ''
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  const subject =
    deliveries.length === 1
      ? deliveries[0].notification.title
      : `You have ${deliveries.length} new updates from Contract to Cozy`;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px;">
<table width="600" style="background:#ffffff;border-radius:8px;">
<tr>
<td style="padding:20px;border-bottom:1px solid #eee;">
<h2 style="margin:0;color:#2e7d32;">Contract to Cozy</h2>
<p style="margin:6px 0 0;color:#555;">
See what’s happening with your home
</p>
</td>
</tr>

<tr>
<td style="padding:20px;">
<table width="100%">
${cardsHtml}
</table>
</td>
</tr>

<tr>
<td style="padding:16px;color:#777;font-size:12px;">
Manage notifications in your dashboard.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;

  // 4️⃣ Send ONE email
  try {
    await sendEmail(user.email, subject, html);

    // 5️⃣ Mark ALL as SENT
    await prisma.notificationDelivery.updateMany({
      where: {
        id: { in: deliveries.map((d) => d.id) },
      },
      data: {
        status: DeliveryStatus.SENT,
        sentAt: new Date(),
        failureReason: null,
      },
    });
  } catch (err: any) {
    await prisma.notificationDelivery.updateMany({
      where: {
        id: { in: deliveries.map((d) => d.id) },
      },
      data: {
        status: DeliveryStatus.FAILED,
        failureReason:
          err?.message ||
          err?.response?.message ||
          'EMAIL_DELIVERY_FAILED',
      },
    });

    logger.error({ err }, '[EMAIL-WORKER] Batch email delivery failed');
    // WKR-008: rethrow after marking the deliveries FAILED — swallowing
    // this let BullMQ mark the job "completed" on an actual send failure,
    // so it never showed up in queue failure counts and never triggered
    // alertOnJobFailure (emailNotificationWorker.on('failed', ...)).
    throw err;
  }
}

export async function runDailyEmailDigest(deps: SendEmailNotificationDeps = defaultDeps): Promise<WorkerRunResult> {
  return runPreferenceDigest('DAILY_DIGEST', deps);
}

export async function runWeeklyHomeBriefDigest(deps: SendEmailNotificationDeps = defaultDeps): Promise<WorkerRunResult> {
  return runPreferenceDigest('WEEKLY_BRIEF', deps);
}

async function runPreferenceDigest(cadence: 'DAILY_DIGEST' | 'WEEKLY_BRIEF', deps: SendEmailNotificationDeps): Promise<WorkerRunResult> {
  const { prisma, logger } = deps;
  // 1️⃣ Find users with pending EMAIL deliveries
  const users = await prisma.notificationDelivery.findMany({
    where: {
      channel: 'EMAIL',
      status: 'PENDING',
    },
    select: {
      notification: {
        select: { userId: true, metadata: true },
      },
    },
  });

  const userIds = [
    ...new Set(users
      .filter((row) => {
        const policyCadence = (row.notification.metadata as any)?.notificationPolicy?.channels
          ?.find((channel: any) => channel.channel === 'EMAIL')?.cadence;
        return cadence === 'DAILY_DIGEST'
          ? policyCadence == null || policyCadence === 'DAILY_DIGEST'
          : policyCadence === 'WEEKLY_BRIEF';
      })
      .map((u) => u.notification.userId)),
  ];

  logger.info(`[DIGEST] Users with pending notifications: ${userIds.length}`);

  // WKR-008: this loop previously caught and logged a per-user send failure
  // and nothing else — the function returned void, so the scheduler always
  // recorded SUCCEEDED even on a run where every single user's digest email
  // failed to send. Returning a WorkerRunResult lets the scheduler tell
  // SUCCEEDED, PARTIAL, and (all-failed) FAILED apart instead.
  let notified = 0;
  let skipped = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      const outcome = await sendUserDigest(userId, cadence, deps);
      if (outcome === 'sent') notified++;
      else skipped++;
    } catch (err) {
      failed++;
      logger.error({ err }, `[DIGEST] Failed for user=${userId}`);
    }
  }

  return {
    examined: userIds.length,
    notified,
    skipped,
    failed,
    reason: failed > 0 ? `${failed} of ${userIds.length} user digest(s) failed to send` : undefined,
  };
}

async function sendUserDigest(userId: string, cadence: 'DAILY_DIGEST' | 'WEEKLY_BRIEF', deps: SendEmailNotificationDeps): Promise<'sent' | 'skipped'> {
  const { prisma, sendEmail, filterDeliveriesByAggregationPolicy, logger } = deps;
  const pendingDeliveries = await prisma.notificationDelivery.findMany({
    where: {
      channel: NotificationChannel.EMAIL,
      status: DeliveryStatus.PENDING,
      notification: { userId },
    },
    include: {
      notification: { include: { user: true } },
    },
    orderBy: {
      notification: { createdAt: 'desc' },
    },
    take: 20,
  });
  const cadenceDeliveries = pendingDeliveries.filter((delivery) => {
    const policyCadence = (delivery.notification.metadata as any)?.notificationPolicy?.channels
      ?.find((channel: any) => channel.channel === 'EMAIL')?.cadence;
    return cadence === 'DAILY_DIGEST'
      ? policyCadence == null || policyCadence === 'DAILY_DIGEST'
      : policyCadence === 'WEEKLY_BRIEF';
  });
  const aggregationDeliveries =
    await filterDeliveriesByAggregationPolicy(cadenceDeliveries);

  if (aggregationDeliveries.length === 0) return 'skipped';

  const user = aggregationDeliveries[0].notification.user;
  if (!user?.email) return 'skipped';
  const deliveries = await applyRefinanceRolloutGate(
    aggregationDeliveries,
    user.email,
    deps,
  );
  if (deliveries.length === 0) return 'skipped';

  const notifications = deliveries.map(d => d.notification);

  const subject = cadence === 'WEEKLY_BRIEF'
    ? 'Your weekly Home Brief from Contract to Cozy'
    : 'Your daily updates from Contract to Cozy';

  const html = cadence === 'WEEKLY_BRIEF'
    ? buildWeeklyHomeBriefHtml(user.firstName || 'there', notifications)
    : buildDigestHtml(user.firstName || 'there', notifications);

  await sendEmail(user.email, subject, html);

  await prisma.notificationDelivery.updateMany({
    where: {
      id: { in: deliveries.map(d => d.id) },
    },
    data: {
      status: DeliveryStatus.SENT,
      sentAt: new Date(),
      failureReason: null,
    },
  });

  logger.info(
    `[DIGEST] Sent ${notifications.length} notifications to ${user.email}`
  );
  return 'sent';
}
