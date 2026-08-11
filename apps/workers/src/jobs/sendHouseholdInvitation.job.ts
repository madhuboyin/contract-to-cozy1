import { sendEmail } from '../email/email.service';
import { renderEmailShell } from '../email/emailShell';
import { logger } from '../lib/logger';

export interface HouseholdInvitationPayload {
  to: string;
  inviterName: string;
  propertyAddress: string;
  householdRole: 'CONTRIBUTOR' | 'VIEWER';
  householdInviteUrl: string;
  expiresAt: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

export async function sendHouseholdInvitationJob(payload: HouseholdInvitationPayload): Promise<void> {
  if (!payload.to || !payload.householdInviteUrl) {
    logger.warn('[HOUSEHOLD-INVITE] missing recipient or invitation URL, skipping send');
    return;
  }
  const roleDescription = payload.householdRole === 'CONTRIBUTOR'
    ? 'view home records, complete tasks, log events, and add inventory'
    : 'view home records without making changes';
  const expiresLabel = new Date(payload.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const html = renderEmailShell({
    title: 'You’ve been invited to a ContractToCozy household',
    bodyHtml: `
<p style="margin:0 0 12px;">Hi,</p>
<p style="margin:0 0 12px;"><strong>${escapeHtml(payload.inviterName)}</strong> invited you to help with <strong>${escapeHtml(payload.propertyAddress)}</strong>.</p>
<p style="margin:0 0 16px;">Your proposed role is <strong>${escapeHtml(payload.householdRole === 'CONTRIBUTOR' ? 'Contributor' : 'Viewer')}</strong>, which lets you ${escapeHtml(roleDescription)}.</p>
<p style="margin:0 0 16px;"><a href="${escapeHtml(payload.householdInviteUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Review invitation</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#777;">Access begins only after you accept. This invitation expires ${escapeHtml(expiresLabel)} and does not change legal ownership of the property.</p>`,
    footerHtml: 'If you were not expecting this invitation, you can ignore this email.',
  });
  await sendEmail(payload.to, `${payload.inviterName} invited you to a ContractToCozy household`, html);
}
