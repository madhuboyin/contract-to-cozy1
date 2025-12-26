// apps/workers/src/email/buildDigestHtml.ts
import { Notification } from '@prisma/client';

export function buildDigestHtml(
  userName: string,
  notifications: Notification[]
) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Hi ${userName},</h2>

      <p>You have ${notifications.length} new updates from <b>Contract to Cozy</b>:</p>

      <ul style="padding-left: 16px;">
        ${notifications
          .map(
            (n) => `
            <li style="margin-bottom: 12px;">
              <strong>${n.title}</strong><br />
              <span>${n.message}</span>
              ${
                n.actionUrl
                  ? `<br /><a href="${n.actionUrl}">View details</a>`
                  : ''
              }
            </li>
          `
          )
          .join('')}
      </ul>

      <hr />

      <p style="font-size: 12px; color: #666;">
        You are receiving this email as part of your daily notification digest.
      </p>
    </div>
  `;
}
