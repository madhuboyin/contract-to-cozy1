// apps/workers/src/jobs/sendPropertyBriefInvitation.job.ts
//
// Handles the 'SEND_PROPERTY_BRIEF_INVITATION' job on the
// email-notification-queue. Like sendFeedbackNotification.job.ts, this is a
// direct, ad-hoc email to an arbitrary external address — a Property Brief
// recipient is deliberately not a platform User (Slice 7 of
// HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md),
// so there is no NotificationDelivery row to resolve.
//
// Closes the gap the plan's own Slice 7 pass explicitly declined to fake:
// "no existing sync send-to-arbitrary-external-address path... UI copy
// says 'you still need to send it yourself' rather than claiming a 'sent'
// capability that doesn't exist." This job is that path.
import { sendEmail } from '../email/email.service';
import { renderEmailShell } from '../email/emailShell';
import { logger } from '../lib/logger';

export interface PropertyBriefInvitationPayload {
  to: string;
  recipientName?: string | null;
  propertyBriefTitle: string;
  propertyAddress: string;
  shareUrl: string;
  expiresAt: string; // ISO datetime
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export async function sendPropertyBriefInvitationJob(
  payload: PropertyBriefInvitationPayload
): Promise<void> {
  const { to, recipientName, propertyBriefTitle, propertyAddress, shareUrl, expiresAt } = payload;

  if (!to) {
    logger.warn('[PROPERTY-BRIEF-INVITE] missing recipient, skipping send');
    return;
  }

  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi,';
  const expiresLabel = new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const bodyHtml = `
<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 12px;">
  You've been sent a Property Brief for <strong>${escapeHtml(propertyAddress)}</strong>
  (&ldquo;${escapeHtml(propertyBriefTitle)}&rdquo;).
</p>
<p style="margin:0 0 16px;">
  <a href="${shareUrl}" style="display:inline-block;background:#2e7d32;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
    View the Property Brief
  </a>
</p>
<p style="margin:0 0 8px;font-size:12px;color:#777;">
  This link expires ${escapeHtml(expiresLabel)} and can be revoked by the property owner at any time.
</p>
`;

  const html = renderEmailShell({
    title: 'A Property Brief was shared with you',
    bodyHtml,
    footerHtml: 'This is a homeowner-assembled record, not an inspection, appraisal, or official disclosure.',
  });

  await sendEmail(to, `${propertyAddress} — Property Brief shared with you`, html);
}
