// Share a home-record export by link, or stop sharing it, from the conversation (FRD v1.6). "Share my home record export" and the Share /
// Stop sharing row actions on the export status answer propose the change: what the link shows (a redacted copy, never the full PDF),
// who can open it (anyone who has the link), how long it works, and that a new link replaces an earlier one. Nothing changes until the
// homeowner confirms. The writes are the routes' own (homeReportExportShare.service). The link itself is never put in the answer, which is
// stored in the conversation: the client fetches it when the person chooses to copy it.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getAskRecordExportReview } from '../askRecordExportReview.service';
import { createShareLinkRecord, revokeShareLinkRecord, shareIsActive } from '../../homeReportExportShare.service';
import {
  HOME_RECORD_EXPORT_ENTITY_TYPE, HOME_RECORD_EXPORT_STATUS_MESSAGE, HOME_RECORD_SHARE_DEFAULT_DAYS, homeRecordExportShareKind, shareDaysFromWords, shareKindFromMessage,
  type HomeRecordExportShareKind,
} from '../support/homeRecordExport';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const statusAction = { id: 'home-record-export-status', label: 'Check my exports', interactionType: 'START_WORKFLOW' as const, message: HOME_RECORD_EXPORT_STATUS_MESSAGE, operationId: 'HOME_RECORD_EXPORT_STATUS', style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-record-export-share-unavailable', title, body, tone: 'DEFAULT', actions: [statusAction] }], suggestions: [],
});

interface ShareRow { id: string; status: string; requestedAt: Date; expiresAt: Date | null; sections: unknown; shareToken: string | null; shareRevokedAt: Date | null; shareExpiresAt: Date | null }
const SELECT = { id: true, status: true, requestedAt: true, expiresAt: true, sections: true, shareToken: true, shareRevokedAt: true, shareExpiresAt: true } as const;
const isReady = (row: ShareRow, now = new Date()) => row.status === 'READY' && !(row.expiresAt && row.expiresAt.getTime() <= now.getTime());
const label = (row: ShareRow) => `Home record export · ${humanDate(row.requestedAt) ?? 'recent'}`;
const includedIds = (row: ShareRow): string[] => {
  const included = (row.sections as { included?: unknown } | null)?.included;
  return Array.isArray(included) ? included.filter((id): id is string => typeof id === 'string') : [];
};
const versionOf = (kind: HomeRecordExportShareKind, row: ShareRow, days: number) =>
  sha(`export-share:${kind}:${row.id}:${row.status}:${shareIsActive(row) ? row.shareExpiresAt?.toISOString() : 'none'}:${days}`);

/** The export a request is about: the one a row action names, else the newest of the caller's own that the request could apply to. */
async function targetExport(userId: string, propertyId: string, kind: HomeRecordExportShareKind, entityId: string | null): Promise<ShareRow | null> {
  if (entityId) return prisma.homeReportExport.findFirst({ where: { id: entityId, userId, propertyId, status: { not: 'DELETED' } }, select: SELECT }) as Promise<ShareRow | null>;
  const rows = await prisma.homeReportExport.findMany({ where: { userId, propertyId, status: { not: 'DELETED' } }, orderBy: { requestedAt: 'desc' }, take: 10, select: SELECT }) as ShareRow[];
  return rows.find((row) => (kind === 'SHARE' ? isReady(row) : shareIsActive(row))) ?? null;
}

export async function homeRecordExportShareProposal(
  userId: string, propertyId: string, input: { kind: HomeRecordExportShareKind; entityId: string | null; message: string; sourceExecutionId: string | null },
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-record-export-share-permission', title: 'A contributor or owner can share an export', body: 'Your role can view this home but not share an export. Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  }
  const { kind } = input;
  const row = await targetExport(userId, propertyId, kind, input.entityId);
  if (!row) {
    return kind === 'SHARE'
      ? unavailable('HOME_RECORD_EXPORT_SHARE_NO_EXPORT', 'There is no ready export to share', 'Export your home record first, then share it once it is ready. Nothing changed.')
      : unavailable('HOME_RECORD_EXPORT_SHARE_NOT_SHARED', 'Nothing is being shared', 'None of your exports has an active share link. Nothing changed.');
  }
  if (kind === 'SHARE' && !isReady(row)) return unavailable('HOME_RECORD_EXPORT_SHARE_NOT_READY', 'That export is not ready to share', 'It is still being prepared, could not be generated, or has expired. Nothing changed.');
  if (kind === 'REVOKE' && !shareIsActive(row)) return unavailable('HOME_RECORD_EXPORT_SHARE_NOT_SHARED', 'That export is not being shared', 'It has no active share link. Nothing changed.');

  const days = kind === 'SHARE' ? (shareDaysFromWords(input.message) ?? HOME_RECORD_SHARE_DEFAULT_DAYS) : 0;
  const contextVersion = versionOf(kind, row, days);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const replacing = kind === 'SHARE' && shareIsActive(row);
  let fields: Array<{ label: string; value: string }>;
  if (kind === 'SHARE') {
    const review = await getAskRecordExportReview(userId, propertyId);
    const withheld = [...new Set(review.sections.filter((section) => includedIds(row).includes(section.id)).flatMap((section) => section.withheldFromShared))];
    fields = [
      { label: 'Export', value: label(row) },
      { label: 'Link works for', value: `${days} ${days === 1 ? 'day' : 'days'}, until ${humanDate(new Date(Date.now() + days * 86_400_000)) ?? 'then'}` },
      { label: 'Who can open it', value: 'Anyone who has the link' },
      { label: 'What it shows', value: 'A redacted copy: city and state, without the street address or ZIP code' },
      ...(withheld.length ? [{ label: 'Also withheld', value: withheld.join(', ').slice(0, 300) }] : []),
      ...(replacing ? [{ label: 'The current link', value: `Stops working. It was set to last until ${humanDate(row.shareExpiresAt) ?? 'later'}` }] : []),
      { label: 'You can', value: 'Stop sharing at any time' },
    ];
  } else {
    fields = [{ label: 'Export', value: label(row) }, { label: 'The link', value: `Stops working now. It was set to last until ${humanDate(row.shareExpiresAt) ?? 'later'}` }];
  }
  const title = kind === 'SHARE' ? (replacing ? 'Replace the share link?' : 'Create a share link?') : 'Stop sharing this export?';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_RECORD_EXPORT_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { exportShare: { kind, exportId: row.id, days }, exportShareContextVersion: contextVersion, sourceExecutionId: input.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'home-record-export-share-review', title, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-record-export-${kind.toLowerCase()}-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title,
      description: kind === 'SHARE' ? 'Anyone with the link can open the redacted copy until it expires. The full PDF is never behind a link.' : 'Anyone who has the link can no longer open it. Your export stays as it is.',
      fields, editableFields: [], confirmLabel: kind === 'SHARE' ? (replacing ? 'Replace the link' : 'Create the link') : 'Stop sharing',
      consentText: kind === 'SHARE' ? 'I authorize a link that lets anyone who has it open a redacted copy of this export.' : 'I authorize stopping this share link.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('home-record-export-share.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = shareKindFromMessage(envelope.message);
  if (!kind || launch?.surface === 'ASK_REFRESH') return unavailable('HOME_RECORD_EXPORT_SHARE_NOT_ROUTABLE', 'Say what to share', 'Ask to share your home record export, or use Share on an export. Nothing changed.');
  const entityId = launch?.entityType === HOME_RECORD_EXPORT_ENTITY_TYPE && launch.entityId ? launch.entityId : null;
  return homeRecordExportShareProposal(envelope.userId, envelope.propertyId!, { kind, entityId, message: envelope.message, sourceExecutionId: launch?.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmExportShare(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  const stored = parameters.exportShare as { kind?: unknown; exportId?: unknown; days?: unknown } | undefined;
  const kind = stored?.kind;
  if ((kind !== 'SHARE' && kind !== 'REVOKE') || typeof stored?.exportId !== 'string' || typeof stored.days !== 'number') throw stale('The change to make is invalid.');
  if (access.role === HouseholdRole.VIEWER) throw stale('Your role can no longer share an export.', 'ASK_PERMISSION_REQUIRED');
  const row = await targetExport(userId, execution.propertyId, kind, stored.exportId);
  if (!row) throw stale('That export is no longer available.');
  if (parameters.exportShareContextVersion !== versionOf(kind, row, stored.days) || (kind === 'SHARE' ? !isReady(row) : !shareIsActive(row))) {
    throw stale('That export changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  let until: Date | null = null;
  if (kind === 'SHARE') {
    const outcome = await createShareLinkRecord({ exportId: row.id, userId, expiresInDays: stored.days });
    if (outcome.kind !== 'CREATED') throw stale('The share link could not be created.');
    until = outcome.shareExpiresAt;
  } else {
    const outcome = await revokeShareLinkRecord({ exportId: row.id, userId });
    if (outcome.kind !== 'REVOKED') throw stale('The share link could not be stopped.');
  }
  // The link is not in this answer: the answer is stored in the conversation, and a link is a secret. The client fetches it when it is copied.
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_RECORD_EXPORT_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `${kind === 'SHARE' ? 'home-record-export-share' : 'home-record-export-unshare'}-${row.id}`, title: kind === 'SHARE' ? 'Share link created' : 'Sharing stopped', status: 'COMPLETED',
      description: kind === 'SHARE' ? 'Copy the link below. It is not kept in this conversation, so copy it again from your exports whenever you need it.' : 'The link no longer works. Your export is unchanged.',
      details: [{ label: 'Export', value: label(row) }, ...(until ? [{ label: 'Works until', value: humanDate(until) ?? 'the date shown' }] : [])], actions: [statusAction],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'home-record-export-share-refresh-failed', severity: 'CAUTION', title: 'Done; view could not refresh', body: 'The change was made. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'HOME_REPORT_EXPORT', artifactId: row.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-record-export-share.command', confirmExportShare);

export { homeRecordExportShareKind };
