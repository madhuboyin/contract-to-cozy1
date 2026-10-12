// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { computeBriefStaleness, getPropertyBriefPreview, listPropertyBriefs } from '../../../propertyBrief/propertyBrief.service';
import { PROPERTY_BRIEF_TEMPLATES } from '../../../propertyBrief/propertyBrief.contracts';
import { PROPERTY_BRIEF_ACTION_IDS, PROPERTY_BRIEF_COMMAND_MESSAGE } from '../support/propertyBriefConstants';

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

const commandAction = (id: string, label: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') => ({
  id, label, interactionType: 'MUTATE_RECORD' as const, message: PROPERTY_BRIEF_COMMAND_MESSAGE,
  operationId: 'PROPERTY_BRIEF_COMMAND', style,
});

export function propertyBriefsFromView(briefs: readonly PropertyBriefListView[], propertyId: string, now: Date = new Date(), canManage = false): AskOperationResult {
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'property-briefs-boundary', title: 'A snapshot the household assembled, not a disclosure',
    body: 'Each brief shows the selected records as they were on its snapshot date. It is not an inspection, appraisal or disclosure.',
    severity: 'INFO', suggestions: [],
  };
  if (!briefs.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PROPERTY_BRIEFS_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'property-briefs-summary', title: 'No property briefs yet',
        body: 'A Property Brief is a snapshot of chosen home records you can share with a contractor, insurer, buyer or trusted contact through an expiring link. A contributor or owner can prepare one.',
        tone: 'DEFAULT', actions: canManage ? [{ ...commandAction(PROPERTY_BRIEF_ACTION_IDS.PREPARE, 'Prepare a property brief', 'PRIMARY'), interactionType: 'START_WORKFLOW' as const }] : [],
      }, boundary],
      suggestions: [],
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
      entityType: 'PROPERTY_BRIEF',
      actions: [
        { id: 'property-brief-preview', label: 'Preview', message: 'Preview this property brief.', operationId: 'PROPERTY_BRIEFS_LIST', interactionType: 'CONVERSATION_CONTINUE' as const, style: 'PRIMARY' as const },
        ...(canManage && liveShares.length ? [commandAction(PROPERTY_BRIEF_ACTION_IDS.REPUBLISH, 'Check for updates')] : []),
      ],
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
      actions: canManage ? [{ ...commandAction(PROPERTY_BRIEF_ACTION_IDS.PREPARE, 'Prepare another brief'), interactionType: 'START_WORKFLOW' as const }] : [],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'property-briefs-items', title: 'Saved briefs',
      description: 'Newest first. Select Preview to inspect the exact frozen recipient snapshot and manage its controlled links inline.',
      sections, actions: [],
    }, boundary],
    suggestions: [],
  };
}

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (Array.isArray(value)) return value.map(printable).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return readableCode(String(value));
}

async function previewResult(propertyId: string, userId: string, briefId: string, canManage: boolean): Promise<AskOperationResult> {
  const preview = await getPropertyBriefPreview(propertyId, userId, briefId);
  const sections = preview.sections.map((section) => {
    const payload = section.payload && typeof section.payload === 'object' && !Array.isArray(section.payload) ? section.payload as Record<string, unknown> : {};
    const evidence = new Map(section.evidenceLinks.map((link) => [link.itemKey, link]));
    const rows = (Array.isArray(payload.items) ? payload.items : []).map((raw, index) => {
      const item: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : { value: raw };
      const proof = evidence.get(String(item.key ?? ''));
      const details = Object.entries(item).filter(([key, value]) => !['key', 'asOf', 'source', 'verification'].includes(key) && value != null).map(([key, value]) => `${readableCode(key)}: ${printable(value)}`);
      return { id: String(item.key ?? `${section.id}-${index}`), title: details[0] ?? 'Recorded item', description: details.slice(1).join(' · ') || null, meta: [`Source: ${proof?.sourceLabel ?? printable(item.source)}`, `As of ${humanDate(new Date(proof?.sourceAsOf ?? String(item.asOf ?? section.asOf)))}`, printable(proof?.verification ?? item.verification)], status: section.sensitive ? 'SENSITIVE' : 'INCLUDED' };
    });
    return { id: section.id, title: section.title, count: rows.length, items: rows.length ? rows : [{ id: `${section.id}-empty`, title: 'No eligible records were included', description: null, meta: [`As of ${humanDate(new Date(section.asOf))}`], status: 'EMPTY' }] };
  });
  const liveShares = preview.shares.filter((share) => share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > Date.now());
  const forBrief = (action: ReturnType<typeof commandAction>) => ({ ...action, interactionType: 'START_WORKFLOW' as const, entityType: 'PROPERTY_BRIEF', entityId: preview.id });
  const actions = canManage ? [
    forBrief(commandAction(PROPERTY_BRIEF_ACTION_IDS.SHARE, 'Create controlled share link', 'PRIMARY')),
    ...(liveShares.length ? [forBrief(commandAction(PROPERTY_BRIEF_ACTION_IDS.REPUBLISH, 'Check for updates'))] : []),
  ] : [];
  const shareRows = preview.shares.map((share) => {
    const isLive = share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > Date.now();
    return { id: `${preview.id}:${share.id}`, title: `${isLive ? 'Live' : readableCode(share.status)} controlled link`, description: `Expires ${humanDate(new Date(share.expiresAt))}`, meta: [`${share.accessCount} recipient access${share.accessCount === 1 ? '' : 'es'}`, share.lastTestedAt ? `Last tested ${humanDate(new Date(share.lastTestedAt))}` : 'Not tested yet', share.recipientEmail ? (share.invitationStatus === 'ACCEPTED' ? 'Invited recipient opened it' : 'Invited recipient has not opened it') : 'Copyable link'], status: isLive ? 'ACTIVE' : share.status, entityType: 'PROPERTY_BRIEF_SHARE', actions: canManage && isLive ? [commandAction(PROPERTY_BRIEF_ACTION_IDS.TEST_SHARE, 'Test access'), commandAction(PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE, 'Revoke', 'QUIET')] : [] };
  });
  return { status: 'ANSWERED', reasonCode: 'PROPERTY_BRIEF_PREVIEW_READY', parameters: { propertyBriefId: preview.id }, blocks: [
    { type: 'SUMMARY', id: 'property-brief-preview-summary', title: preview.title, body: `${PROPERTY_BRIEF_TEMPLATES[preview.purpose]?.label ?? readableCode(preview.purpose)} · frozen snapshot of ${humanDate(new Date(preview.asOf))}. Explicitly excluded: ${preview.excludedSections.length ? preview.excludedSections.map(readableCode).join(', ') : 'none'}.`, tone: 'DEFAULT', actions },
    { type: 'GROUPED_LIST', filters: [], id: 'property-brief-preview-sections', title: 'Exact recipient preview', description: 'Every item preserves its recorded source, verification state and as-of date.', sections, actions: [] },
    ...(shareRows.length ? [{ type: 'GROUPED_LIST' as const, filters: [], id: 'property-brief-preview-shares', title: 'Controlled links', description: 'Recipient names and email addresses are intentionally omitted from the conversation transcript.', sections: [{ id: 'property-brief-share-history', title: 'Share history', count: shareRows.length, items: shareRows }], actions: [] }] : []),
    { type: 'BOUNDARY', id: 'property-briefs-boundary', title: 'A homeowner-assembled snapshot, not a disclosure', body: preview.limitationStatement, severity: 'INFO', suggestions: [] },
  ], suggestions: [] };
}

async function propertyBriefsResult(userId: string, propertyId: string, launch: { entityType?: string | null; entityId?: string | null } | null | undefined): Promise<AskOperationResult> {
  // The operation registry enforces the viewer floor for this read. Mutation actions
  // enforce CONTRIBUTOR again in PROPERTY_BRIEF_COMMAND before showing a form or confirmation.
  const canManage = true;
  if (launch?.entityType === 'PROPERTY_BRIEF' && launch.entityId) return previewResult(propertyId, userId, launch.entityId, canManage);
  return propertyBriefsFromView(await listPropertyBriefs(propertyId), propertyId, new Date(), canManage);
}

registerCapabilityHandler('property-brief.briefs', async (envelope) => propertyBriefsResult(envelope.userId, envelope.propertyId!, envelope.launchContext));
