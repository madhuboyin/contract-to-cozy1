// apps/workers/src/jobs/sendEmailNotification.job.ts

import { prisma } from '../lib/prisma';
import { sendEmail } from '../email/email.service';
import { DeliveryStatus } from '@prisma/client';

export async function sendEmailNotificationJob(
  notificationDeliveryId: string
) {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
    include: {
      notification: {
        include: { user: true },
      },
    },
  });

  if (!delivery) return;
  if (delivery.status !== DeliveryStatus.PENDING) return;

  const { notification } = delivery;
  const user = notification.user;

  if (!user?.email) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.FAILED,
        failureReason: 'USER_EMAIL_MISSING',
      },
    });
    return;
  }

  try {
    const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #eee;">
                <h2 style="margin:0;color:#2e7d32;">Contract to Cozy</h2>
                <p style="margin:6px 0 0;color:#555;font-size:14px;">
                  See what’s happening with your home
                </p>
              </td>
            </tr>

            <!-- Notification Card -->
            <tr>
              <td style="padding:20px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;">
                  <tr>
                    <td style="padding:16px;">
                      <h3 style="margin:0 0 8px;font-size:16px;color:#111;">
                        ${notification.title}
                      </h3>
                      <p style="margin:0 0 12px;font-size:14px;color:#444;">
                        ${notification.message}
                      </p>

                      ${
                        notification.actionUrl
                          ? `
                        <a href="${notification.actionUrl}"
                           style="display:inline-block;padding:10px 14px;
                                  background:#2e7d32;color:#ffffff;
                                  text-decoration:none;border-radius:4px;
                                  font-size:14px;">
                          View details →
                        </a>
                      `
                          : ''
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;font-size:12px;color:#777;">
                You’re receiving this because you’re a Contract to Cozy user.
                <br />
                <a href="#" style="color:#777;text-decoration:underline;">
                  Manage notification preferences
                </a>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    await sendEmail(user.email, notification.title, html);

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.SENT,
        sentAt: new Date(),
        failureReason: null,
      },
    });
  } catch (err: any) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.FAILED,
        failureReason:
          err?.message ||
          err?.response?.message ||
          'EMAIL_DELIVERY_FAILED',
      },
    });

    console.error(
      `[EMAIL-WORKER] Delivery failed for notificationDeliveryId=${delivery.id}`,
      err
    );
  }
}
