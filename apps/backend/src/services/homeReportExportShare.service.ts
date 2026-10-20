// Sharing a home-record export: the one place the rules live, shared by the routes (POST/DELETE .../share) and the Ask command
// (HOME_RECORD_EXPORT_SHARE) so a conversation can never create a link the route would refuse. A share link serves the redacted copy only.
import { prisma } from '../lib/prisma';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { buildShareToken, prepareShareArtifacts } from './homeReportExport.service';

/** A shared link lasts this long unless the person says otherwise, and never longer than the maximum. */
export const HOME_REPORT_SHARE_DEFAULT_DAYS = 14;
export const HOME_REPORT_SHARE_MAX_DAYS = 30;

export type ShareRuleFailure = { kind: 'NOT_FOUND' } | { kind: 'FORBIDDEN' } | { kind: 'NOT_CONTRIBUTOR' } | { kind: 'DELETED' };

async function loadOwnedExport(exportId: string, userId: string) {
  const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });
  if (!exp) return { failure: { kind: 'NOT_FOUND' } as ShareRuleFailure };
  if (exp.userId !== userId) return { failure: { kind: 'FORBIDDEN' } as ShareRuleFailure };
  const access = await resolvePropertyAccess(userId, exp.propertyId);
  if (!(access && ROLE_RANK[access.role] >= ROLE_RANK.CONTRIBUTOR)) return { failure: { kind: 'NOT_CONTRIBUTOR' } as ShareRuleFailure };
  if (exp.status === 'DELETED') return { failure: { kind: 'DELETED' } as ShareRuleFailure };
  return { exp };
}

/** True while a share link works: it has a token, was not revoked, and has not passed its expiry. */
export const shareIsActive = (exp: { shareToken: string | null; shareRevokedAt: Date | null; shareExpiresAt: Date | null }, now: Date = new Date()): boolean =>
  Boolean(exp.shareToken) && !exp.shareRevokedAt && Boolean(exp.shareExpiresAt) && (exp.shareExpiresAt as Date).getTime() > now.getTime();

/** Builds the redacted copy first (it throws if the report is not ready or sharing does not apply), then issues a new token; any earlier link stops working. */
export async function createShareLinkRecord(input: { exportId: string; userId: string; expiresInDays?: number }): Promise<ShareRuleFailure | { kind: 'CREATED'; shareToken: string; shareExpiresAt: Date; expiresInDays: number }> {
  const loaded = await loadOwnedExport(input.exportId, input.userId);
  if (loaded.failure) return loaded.failure;
  const exp = loaded.exp as NonNullable<typeof loaded.exp>;
  const expiresInDays = input.expiresInDays ?? HOME_REPORT_SHARE_DEFAULT_DAYS;
  const token = buildShareToken();
  await prepareShareArtifacts(input.exportId);
  const updated = await prisma.homeReportExport.update({
    where: { id: input.exportId },
    data: { shareToken: token, shareExpiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000), shareRevokedAt: null },
  });
  await prisma.homeReportExportEvent.create({ data: { reportId: input.exportId, type: 'SHARED', meta: { expiresInDays } } });
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId: input.userId, propertyId: exp.propertyId, moduleKey: AnalyticsModule.DASHBOARD, featureKey: AnalyticsFeature.HOME_REPORT_EXPORT,
    metadataJson: { actionType: 'share', expiresInDays },
  });
  return { kind: 'CREATED', shareToken: updated.shareToken as string, shareExpiresAt: updated.shareExpiresAt as Date, expiresInDays };
}

export async function revokeShareLinkRecord(input: { exportId: string; userId: string }): Promise<ShareRuleFailure | { kind: 'REVOKED' }> {
  const loaded = await loadOwnedExport(input.exportId, input.userId);
  if (loaded.failure) return loaded.failure;
  await prisma.homeReportExport.update({ where: { id: input.exportId }, data: { shareRevokedAt: new Date() } });
  await prisma.homeReportExportEvent.create({ data: { reportId: input.exportId, type: 'SHARE_REVOKED' } });
  return { kind: 'REVOKED' };
}
