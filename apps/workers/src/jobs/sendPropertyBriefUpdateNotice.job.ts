// apps/workers/src/jobs/sendPropertyBriefUpdateNotice.job.ts
//
// Handles the 'SEND_PROPERTY_BRIEF_UPDATE_NOTICE' job on the
// email-notification-queue. Slice 7's "republish notifications" — tells an
// existing recipient their Property Brief changed, using the exact same
// ad-hoc external-recipient send path as sendPropertyBriefInvitation.job.ts
// (a Property Brief recipient is deliberately not a platform User, so
// there is no NotificationDelivery row to resolve).
//
// Deliberately does NOT include a fresh share link: share tokens are only
// ever stored as a SHA-256 hash (never plaintext) per Slice 7's original
// design, so the plaintext URL genuinely cannot be reconstructed here —
// and doesn't need to be, since republishing never rotates the token; the
// recipient's original link still works.
import { sendEmail } from '../email/email.service';
import { renderEmailShell } from '../email/emailShell';
import { logger } from '../lib/logger';

export interface PropertyBriefUpdateNoticePayload {
  to: string;
  recipientName?: string | null;
  propertyBriefTitle: string;
  propertyAddress: string;
  changedSections: string[];
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

function humanizeSection(section: string): string {
  return section
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function sendPropertyBriefUpdateNoticeJob(
  payload: PropertyBriefUpdateNoticePayload
): Promise<void> {
  const { to, recipientName, propertyBriefTitle, propertyAddress, changedSections } = payload;

  if (!to) {
    logger.warn('[PROPERTY-BRIEF-UPDATE-NOTICE] missing recipient, skipping send');
    return;
  }

  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi,';
  const sectionList = changedSections.length > 0
    ? changedSections.map((section) => escapeHtml(humanizeSection(section))).join(', ')
    : 'some details';

  const bodyHtml = `
<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 12px;">
  The Property Brief you have access to for <strong>${escapeHtml(propertyAddress)}</strong>
  (&ldquo;${escapeHtml(propertyBriefTitle)}&rdquo;) was just updated.
</p>
<p style="margin:0 0 12px;">
  Changed section(s): ${sectionList}.
</p>
<p style="margin:0 0 8px;font-size:12px;color:#777;">
  Your original link still works and now shows the updated version — no new link is needed.
</p>
`;

  const html = renderEmailShell({
    title: 'A Property Brief shared with you was updated',
    bodyHtml,
    footerHtml: 'This is a homeowner-assembled record, not an inspection, appraisal, or official disclosure.',
  });

  await sendEmail(to, `${propertyAddress} — Property Brief updated`, html);
}
