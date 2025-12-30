// apps/workers/src/email/buildDigestHtml.ts
import { Notification } from '@prisma/client';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
            (n) => {
              const safeTitle = escapeHtml(n.title);
              const safeMessage = escapeHtml(n.message);
              const safeUrl = n.actionUrl ? escapeHtml(n.actionUrl) : '';
              return `
            <li style="margin-bottom: 12px;">
              <strong>${safeTitle}</strong><br />
              <span>${safeMessage}</span>
              ${
                n.actionUrl
                  ? `<br /><a href="${safeUrl}">View details</a>`
                  : ''
              }
            </li>
          `
            }
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
