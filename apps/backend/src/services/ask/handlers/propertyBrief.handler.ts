// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { computeBriefStaleness, listPropertyBriefs } from '../../../propertyBrief/propertyBrief.service';
import { PROPERTY_BRIEF_TEMPLATES } from '../../../propertyBrief/propertyBrief.contracts';

// Property Brief capability-card slice (FRD v1.63): the fifteenth new operation for a capability with none. Reads
// listPropertyBriefs -- the call GET /properties/:id/property-briefs makes for the Property Brief page: every
// non-archived brief on the property, newest first, shared across the household (the route admits any role and so does
// the service; no owner-only lookup). A brief's sections are frozen when it is prepared, with other members' PRIVATE
// home events already left out then, so there is nothing per-viewer to filter here. One difference, on purpose: a share
// only turns EXPIRED when someone opens its link, so the page can call a lapsed link active (and flag a brief nobody can
// open as stale); Ask treats a link as live only while it is ACTIVE and unexpired. Recipient names and emails are left
// out because Ask keeps transcripts; counts stand in. Read-only: preparing, previewing, sharing, revoking and
// republishing stay on the page.
type PropertyBriefListView = Awaited<ReturnType<typeof listPropertyBriefs>>[number];
const PROPERTY_BRIEF_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', READY: 'Ready', SHARED: 'Shared', REVOKED: 'Revoked', ARCHIVED: 'Archived' };

export function propertyBriefsFromView(briefs: readonly PropertyBriefListView[], propertyId: string, now: Date = new Date()): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/property-brief`;
  const openAction = { id: 'open-property-brief', label: 'Open Property Brief', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'property-briefs-boundary', title: 'A snapshot the household assembled, not a disclosure',
    body: 'Each brief shows the selected records as they were on its snapshot date. It is not an inspection, appraisal or disclosure. Previewing, sharing, revoking and refreshing a brief stay on the Property Brief page.',
    severity: 'INFO', suggestions: [],
  };
  if (!briefs.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PROPERTY_BRIEFS_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'property-briefs-summary', title: 'No property briefs yet',
        body: 'A Property Brief is a snapshot of chosen home records you can share with a contractor, insurer, buyer or trusted contact through an expiring link. Open Property Brief to prepare one.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Summarize my home record'],
    };
  }
  const rows = briefs.map((brief) => {
    const liveShares = brief.shares.filter((share) => share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > now.getTime());
    const lapsedShares = brief.shares.filter((share) => share.status === 'EXPIRED' || (share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() <= now.getTime()));
    const { ageDays, isStale } = computeBriefStaleness(new Date(brief.asOf), liveShares.length > 0, now);
    return { brief, liveShares, lapsedShares, ageDays, isStale };
  });
  const live = rows.filter((row) => row.liveShares.length > 0);
  const stale = rows.filter((row) => row.isStale).length;
  const liveLinkCount = live.reduce((total, row) => total + row.liveShares.length, 0);
  const item = ({ brief, liveShares, lapsedShares, ageDays, isStale }: (typeof rows)[number]) => {
    const nextExpiry = liveShares.map((share) => new Date(share.expiresAt)).sort((a, b) => a.getTime() - b.getTime())[0];
    const invited = liveShares.filter((share) => share.recipientEmail).length;
    const opened = liveShares.filter((share) => share.invitationStatus === 'ACCEPTED').length;
    const views = liveShares.reduce((total, share) => total + share.accessCount, 0);
    return {
      id: brief.id,
      title: brief.title,
      description: `${PROPERTY_BRIEF_TEMPLATES[brief.purpose]?.label ?? readableCode(brief.purpose)} · snapshot of ${humanDate(new Date(brief.asOf))}`,
      meta: [
        `${brief.selectedSections.length} section${brief.selectedSections.length === 1 ? '' : 's'}`,
        liveShares.length ? `${liveShares.length} live link${liveShares.length === 1 ? '' : 's'}, ${liveShares.length === 1 ? 'expires' : 'next expires'} ${humanDate(nextExpiry)}` : null,
        liveShares.length ? `Opened ${views} time${views === 1 ? '' : 's'}` : null,
        invited ? `${opened} of ${invited} invited recipient${invited === 1 ? '' : 's'} opened it` : null,
        lapsedShares.length ? `${lapsedShares.length} expired link${lapsedShares.length === 1 ? '' : 's'}` : null,
        isStale ? `Not refreshed in ${ageDays} days` : null,
      ].filter((value): value is string => Boolean(value)),
      status: PROPERTY_BRIEF_STATUS_LABELS[brief.status] ?? readableCode(brief.status),
    };
  };
  const notShared = rows.filter((row) => row.liveShares.length === 0);
  const sections = [
    live.length ? { id: 'property-briefs-live', title: 'Shared with a live link', count: live.length, items: live.map(item) } : null,
    notShared.length ? { id: 'property-briefs-not-shared', title: 'Not currently shared', count: notShared.length, items: notShared.map(item) } : null,
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));
  return {
    status: 'ANSWERED', reasonCode: 'PROPERTY_BRIEFS_READY',
    blocks: [{
      type: 'SUMMARY', id: 'property-briefs-summary',
      title: `${briefs.length} property brief${briefs.length === 1 ? '' : 's'} saved`,
      body: [
        liveLinkCount
          ? `${live.length} ${live.length === 1 ? 'is' : 'are'} shared through ${liveLinkCount} live link${liveLinkCount === 1 ? '' : 's'}.`
          : 'None has a live share link right now.',
        stale ? `${stale} shared ${stale === 1 ? 'brief has' : 'briefs have'} not been refreshed in 90 days or more, so recipients may be seeing out-of-date records.` : null,
      ].filter(Boolean).join(' '),
      tone: stale ? 'CAUTION' : 'DEFAULT',
      actions: [openAction],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'property-briefs-items', title: 'Saved briefs',
      description: 'Newest first, as on the page. Open Property Brief to preview a brief, share it, test or revoke a link, or check it for updates.',
      sections, actions: [],
    }, boundary],
    suggestions: ['Summarize my home record'],
  };
}

async function propertyBriefsResult(propertyId: string): Promise<AskOperationResult> {
  return propertyBriefsFromView(await listPropertyBriefs(propertyId), propertyId);
}

registerCapabilityHandler('property-brief.briefs', async (envelope) => propertyBriefsResult(envelope.propertyId!));
