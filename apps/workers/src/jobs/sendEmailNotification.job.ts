// apps/workers/src/jobs/sendEmailNotification.job.ts
import { prisma } from '../lib/prisma';
import { sendEmail } from '../email/email.service';
import { DeliveryStatus, NotificationChannel } from '@prisma/client';
import { buildDigestHtml } from '../email/buildDigestHtml';

const MAX_NOTIFICATIONS_PER_EMAIL = 10;

export async function sendEmailNotificationJob(
  notificationDeliveryId: string
) {
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
  
  const priority =
  (seedDelivery.notification.metadata as { priority?: string } | null)
    ?.priority;

  if (priority !== 'HIGH') {
    return; // let daily digest handle it
  }

  const user = seedDelivery.notification.user;
  if (!user?.email) return;

  // 2️⃣ Fetch MORE pending notifications for same user
  const deliveries = await prisma.notificationDelivery.findMany({
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

  if (deliveries.length === 0) return;

  // 3️⃣ Build email HTML
  const cardsHtml = deliveries
    .map(({ notification }) => {
      return `
        <tr>
          <td style="padding:12px 0;">
            <table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;">
              <tr>
                <td style="padding:14px;">
                  <h3 style="margin:0 0 6px;font-size:15px;color:#111;">
                    ${notification.title}
                  </h3>
                  <p style="margin:0 0 10px;font-size:14px;color:#444;">
                    ${notification.message}
                  </p>
                  ${
                    notification.actionUrl
                      ? `<a href="${notification.actionUrl}"
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

    console.error('[EMAIL-WORKER] Batch email delivery failed', err);
  }
}

export async function runDailyEmailDigest() {
  // 1️⃣ Find users with pending EMAIL deliveries
  const users = await prisma.notificationDelivery.findMany({
    where: {
      channel: 'EMAIL',
      status: 'PENDING',
    },
    select: {
      notification: {
        select: { userId: true },
      },
    },
  });


  const userIds = [
    ...new Set(users.map((u) => u.notification.userId)),
  ];

  console.log(`[DIGEST] Users with pending notifications: ${userIds.length}`);

  // 2️⃣ Send one email per user
  for (const userId of userIds) {
    try {
      await sendUserDigest(userId);
    } catch (err) {
      console.error(`[DIGEST] Failed for user=${userId}`, err);
    }
  }
}

async function sendUserDigest(userId: string) {
  const deliveries = await prisma.notificationDelivery.findMany({
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

  if (deliveries.length === 0) return;

  const user = deliveries[0].notification.user;
  if (!user?.email) return;

  const notifications = deliveries.map(d => d.notification);

  const subject = `Your daily updates from Contract to Cozy`;

  const html = buildDigestHtml(
    user.firstName || 'there',
    notifications
  );

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

  console.log(
    `[DIGEST] Sent ${notifications.length} notifications to ${user.email}`
  );
}

