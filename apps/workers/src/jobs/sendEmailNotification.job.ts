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
        include: {
          user: true,
        },
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
      <h3>${notification.title}</h3>
      <p>${notification.message}</p>
      ${
        notification.actionUrl
          ? `<p><a href="${notification.actionUrl}">View details</a></p>`
          : ''
      }
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
