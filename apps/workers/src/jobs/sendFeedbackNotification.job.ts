// apps/workers/src/jobs/sendFeedbackNotification.job.ts
//
// Handles the 'SEND_FEEDBACK_NOTIFICATION' job on the email-notification-queue.
// Unlike sendEmailNotification.job.ts (which resolves a NotificationDelivery
// row tied to a User), this sends a direct, ad-hoc email straight to the
// pilot feedback team alias — there's no per-user notification record for it.
import { sendEmail } from '../email/email.service';
import { logger } from '../lib/logger';

export interface FeedbackNotificationPayload {
  to: string;
  rating: string;
  comment?: string | null;
  page: string;
  userEmail?: string;
  userId: string;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

export async function sendFeedbackNotificationJob(
  payload: FeedbackNotificationPayload
): Promise<void> {
  const { to, rating, comment, page, userEmail, userId } = payload;

  if (!to) {
    logger.warn('[FEEDBACK-NOTIFY] missing recipient, skipping send');
    return;
  }

  const subject = `[Pilot feedback] ${rating === 'up' ? '\u{1F44D}' : '\u{1F44E}'} on ${page}`;

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
<h2 style="margin:0;color:#2e7d32;">New pilot feedback</h2>
</td>
</tr>
<tr>
<td style="padding:20px;font-size:14px;color:#333;line-height:1.6;">
<p style="margin:0 0 8px;"><strong>Rating:</strong> ${escapeHtml(rating)}</p>
<p style="margin:0 0 8px;"><strong>Page:</strong> ${escapeHtml(page)}</p>
<p style="margin:0 0 8px;"><strong>User:</strong> ${escapeHtml(userEmail || 'unknown')} (${escapeHtml(userId)})</p>
<p style="margin:12px 0 0;"><strong>Comment:</strong></p>
<p style="margin:4px 0 0;white-space:pre-wrap;">${comment ? escapeHtml(comment) : '<em>(no comment left)</em>'}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;

  await sendEmail(to, subject, html);
}
