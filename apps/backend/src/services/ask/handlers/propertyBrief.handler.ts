// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { HouseholdRole } from '@prisma/client';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { computeBriefStaleness, getPropertyBriefPreview, inspectPropertyBriefUpdates, listPropertyBriefs } from '../../../propertyBrief/propertyBrief.service';
import { PROPERTY_BRIEF_TEMPLATES } from '../../../propertyBrief/propertyBrief.contracts';
import { PROPERTY_BRIEF_ACTION_IDS, PROPERTY_BRIEF_COMMAND_MESSAGE } from '../support/propertyBriefConstants';
import { getFactDefinition } from '../../../modules/propertyContext/catalog/factCatalog';
import { AREA_CAPTURE_MESSAGES, ensurePropertyAccess, isAreaCaptureScope } from '../askHandlerSupport';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import type { PropertyFactState } from '../../../modules/propertyContext/domain/contracts';

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
  operationId: 'PROPERTY_BRIEF_COMMAND', actionId: id, style,
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

const ACRONYMS = new Set(['ac', 'hoa', 'hvac', 'id', 'nj', 'sku', 'url']);
const PROVENANCE_LABELS: Record<string, string> = {
  USER_REPORTED: 'Self-reported', HOMEOWNER_RECORDED: 'Homeowner recorded',
  CANONICAL_PROPERTY_RECORD: 'Home record', VERIFIED: 'Verified',
  EVIDENCE_VERIFIED: 'Evidence verified', HOMEOWNER_CONFIRMED: 'Homeowner confirmed',
  UNKNOWN_OR_NOT_RECORDED: 'Unknown or not recorded', KNOWN_NOT_VERIFIED: 'Recorded, not yet verified',
};

function briefWords(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (Array.isArray(value)) return value.map(briefWords).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  const raw = String(value).trim();
  if (PROVENANCE_LABELS[raw]) return PROVENANCE_LABELS[raw];
  if (/^(?:https?:\/\/|mailto:)/i.test(raw) || raw.includes('@')) return raw;
  const words = raw.replace(/_/g, ' ').split(/\s+/);
  if (!raw.includes('_') && (raw !== raw.toLowerCase() || words.length > 4)) return raw;
  return words.map((word) => {
    const lower = word.toLowerCase();
    return ACRONYMS.has(lower) ? lower.toUpperCase() : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }).join(' ');
}

function briefFieldLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export function propertyBriefPreviewRow(item: Record<string, unknown>, fallbackId: string, proof?: { sourceLabel?: string | null; sourceAsOf?: Date | string | null; verification?: string | null }, sectionAsOf?: Date | string) {
  const label = typeof item.label === 'string' ? item.label : null;
  const primaryKey = ['title', 'name', 'providerName', 'carrierName', 'permitNumber', 'sectionTitle'].find((key) => item[key] != null);
  const primaryValue = primaryKey ? briefWords(item[primaryKey]) : null;
  const value = item.value != null ? briefWords(item.value) : null;
  const state = item.state != null ? briefWords(item.state) : null;
  const title = label
    ? `${briefWords(label)}: ${value ?? state ?? 'Not recorded'}`
    : primaryValue ?? value ?? state ?? 'Recorded item';
  const excluded = new Set(['key', 'asOf', 'source', 'verification', 'label', 'value', 'state', primaryKey].filter(Boolean));
  const details = Object.entries(item)
    .filter(([key, fieldValue]) => !excluded.has(key) && fieldValue != null && fieldValue !== '')
    .map(([key, fieldValue]) => `${briefFieldLabel(key)}: ${briefWords(fieldValue)}`);
  const source = proof?.sourceLabel
    ? proof.sourceLabel.replace(/^Verified property fact evidence:\s*/i, '').replace(/^Canonical property record gap$/i, 'Home record')
    : briefWords(item.source);
  const verification = briefWords(proof?.verification ?? item.verification);
  const observedAt = proof?.sourceAsOf ?? item.asOf ?? sectionAsOf;
  const observedDate = observedAt instanceof Date || typeof observedAt === 'string' ? new Date(observedAt) : null;
  return {
    id: String(item.key ?? fallbackId), title,
    description: details.join(' · ') || null,
    meta: [source && source !== 'Not recorded' ? `Source: ${briefWords(source)}` : null, observedDate && !Number.isNaN(observedDate.getTime()) ? `As of ${humanDate(observedDate)}` : null, verification !== 'Not recorded' ? verification : null].filter((entry): entry is string => Boolean(entry)),
  };
}

export function propertyBriefGapAction(factKey: string, canManage: boolean, liveState?: PropertyFactState) {
  if (!canManage || !liveState || liveState === 'KNOWN') return undefined;
  let fact: ReturnType<typeof getFactDefinition>;
  try {
    fact = getFactDefinition(factKey);
  } catch {
    return undefined;
  }
  if (!fact.writable || !isAreaCaptureScope(fact.scope)) return undefined;
  return {
    id: `property-brief-fill-${fact.scope.toLowerCase()}`,
    label: 'Add detail',
    message: AREA_CAPTURE_MESSAGES[fact.scope],
    operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE',
    interactionType: 'MUTATE_RECORD' as const,
    entityType: 'PROPERTY_CONTEXT_AREA',
    entityId: fact.scope,
    style: 'SECONDARY' as const,
  };
}

const sectionRecordCount = (section: { payload: unknown }) => {
  const payload = section.payload && typeof section.payload === 'object' && !Array.isArray(section.payload) ? section.payload as Record<string, unknown> : {};
  return Array.isArray(payload.items) ? payload.items.length : 0;
};

async function previewResult(propertyId: string, userId: string, briefId: string, role: HouseholdRole): Promise<AskOperationResult> {
  const canManage = role !== HouseholdRole.VIEWER;
  const [preview, updateStatus, liveContext] = await Promise.all([
    getPropertyBriefPreview(propertyId, userId, briefId),
    inspectPropertyBriefUpdates({ propertyId, briefId, role }),
    getPropertyContext(propertyId, { userId }, { scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'SYSTEMS'] }).catch(() => null),
  ]);
  const sections = preview.sections.map((section) => {
    const payload = section.payload && typeof section.payload === 'object' && !Array.isArray(section.payload) ? section.payload as Record<string, unknown> : {};
    const evidence = new Map(section.evidenceLinks.map((link) => [link.itemKey, link]));
    const rows = (Array.isArray(payload.items) ? payload.items : []).map((raw, index) => {
      const item: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : { value: raw };
      const proof = evidence.get(String(item.key ?? ''));
      const factKey = String(item.key ?? '');
      const liveState = liveContext?.facts[factKey]?.state;
      const gapAction = section.sectionType === 'OPEN_UNKNOWNS' ? propertyBriefGapAction(factKey, canManage, liveState) : undefined;
      const refreshAction = section.sectionType === 'OPEN_UNKNOWNS' && canManage && liveState === 'KNOWN'
        ? { ...commandAction(PROPERTY_BRIEF_ACTION_IDS.REPUBLISH, 'Refresh brief'), entityType: 'PROPERTY_BRIEF', entityId: preview.id }
        : undefined;
      return {
        ...propertyBriefPreviewRow(item, `${section.id}-${index}`, proof, section.asOf),
        status: section.sensitive ? 'Sensitive' : 'Included',
        ...(liveState === 'KNOWN' ? { description: 'This detail is now recorded in your home record.' } : {}),
        ...(gapAction ? { actions: [gapAction] } : refreshAction ? { actions: [refreshAction] } : {}),
      };
    });
    return { id: section.id, title: section.title, count: rows.length, items: rows.length ? rows : [{ id: `${section.id}-empty`, title: 'No eligible records were included', description: null, meta: [`As of ${humanDate(new Date(section.asOf))}`], status: 'EMPTY' }] };
  });
  const liveShares = preview.shares.filter((share) => share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > Date.now());
  const forBrief = (action: ReturnType<typeof commandAction>) => ({ ...action, interactionType: 'START_WORKFLOW' as const, entityType: 'PROPERTY_BRIEF', entityId: preview.id });
  const actions = canManage ? [
    forBrief(commandAction(PROPERTY_BRIEF_ACTION_IDS.SHARE, 'Create controlled share link', 'PRIMARY')),
    ...(updateStatus.hasUpdates ? [forBrief(commandAction(PROPERTY_BRIEF_ACTION_IDS.REPUBLISH, 'Refresh with current records'))] : []),
  ] : [];
  const shareRows = preview.shares.map((share) => {
    const isLive = share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > Date.now();
    return { id: `${preview.id}:${share.id}`, title: `${isLive ? 'Live' : readableCode(share.status)} controlled link`, description: `Expires ${humanDate(new Date(share.expiresAt))}`, meta: [`${share.accessCount} recipient access${share.accessCount === 1 ? '' : 'es'}`, share.lastTestedAt ? `Last tested ${humanDate(new Date(share.lastTestedAt))}` : 'Not tested yet', share.recipientEmail ? (share.invitationStatus === 'ACCEPTED' ? 'Invited recipient opened it' : 'Invited recipient has not opened it') : 'Copyable link'], status: isLive ? 'ACTIVE' : share.status, entityType: 'PROPERTY_BRIEF_SHARE', actions: canManage && isLive ? [commandAction(PROPERTY_BRIEF_ACTION_IDS.TEST_SHARE, 'Test access'), commandAction(PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE, 'Revoke', 'QUIET')] : [] };
  });
  const countFor = (types: string[]) => preview.sections.filter((section) => types.includes(section.sectionType)).reduce((sum, section) => sum + sectionRecordCount(section), 0);
  const total = preview.sections.reduce((sum, section) => sum + sectionRecordCount(section), 0);
  const facts = countFor(['PROPERTY_FACTS']), history = countFor(['VERIFIED_HISTORY']), gaps = countFor(['OPEN_UNKNOWNS']);
  const propertyBrief = {
    purposeLabel: PROPERTY_BRIEF_TEMPLATES[preview.purpose]?.label ?? readableCode(preview.purpose),
    snapshotAsOf: new Date(preview.asOf).toISOString(),
    excludedSections: preview.excludedSections.map(readableCode),
    changedSections: updateStatus.hasUpdates ? updateStatus.changedSectionTypes.map(readableCode) : [],
    counts: { facts, history, gaps, otherRecords: total - facts - history - gaps },
  };
  return { status: 'ANSWERED', reasonCode: 'PROPERTY_BRIEF_PREVIEW_READY', parameters: { propertyBriefId: preview.id }, blocks: [
    { type: 'SUMMARY', id: 'property-brief-preview-summary', title: preview.title, body: `${PROPERTY_BRIEF_TEMPLATES[preview.purpose]?.label ?? readableCode(preview.purpose)} · frozen snapshot of ${humanDate(new Date(preview.asOf))}. ${updateStatus.hasUpdates ? `Your home records have changed since this snapshot (${updateStatus.changedSectionTypes.map(readableCode).join(', ')}).` : 'The selected records still match this snapshot.'} Explicitly excluded: ${preview.excludedSections.length ? preview.excludedSections.map(readableCode).join(', ') : 'none'}.`, tone: updateStatus.hasUpdates ? 'CAUTION' : 'DEFAULT', actions, propertyBrief },
    { type: 'GROUPED_LIST', filters: [], id: 'property-brief-preview-sections', title: 'Exact recipient preview', description: 'Every item preserves its recorded source, verification state and as-of date.', sections, actions: [] },
    ...(shareRows.length ? [{ type: 'GROUPED_LIST' as const, filters: [], id: 'property-brief-preview-shares', title: 'Controlled links', description: 'Recipient names and email addresses are intentionally omitted from the conversation transcript.', sections: [{ id: 'property-brief-share-history', title: 'Share history', count: shareRows.length, items: shareRows }], actions: [] }] : []),
    { type: 'BOUNDARY', id: 'property-brief-preview-boundary', title: 'A homeowner-assembled snapshot, not a disclosure', body: preview.limitationStatement, severity: 'INFO', suggestions: [] },
  ], suggestions: [] };
}

async function propertyBriefsResult(userId: string, propertyId: string, launch: { entityType?: string | null; entityId?: string | null } | null | undefined, role: HouseholdRole): Promise<AskOperationResult> {
  // The operation registry enforces the viewer floor for this read. Mutation actions
  // enforce CONTRIBUTOR again in PROPERTY_BRIEF_COMMAND before showing a form or confirmation.
  const canManage = role !== HouseholdRole.VIEWER;
  if (launch?.entityType === 'PROPERTY_BRIEF' && launch.entityId) return previewResult(propertyId, userId, launch.entityId, role);
  return propertyBriefsFromView(await listPropertyBriefs(propertyId), propertyId, new Date(), canManage);
}

registerCapabilityHandler('property-brief.briefs', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return propertyBriefsResult(envelope.userId, envelope.propertyId!, envelope.launchContext, access.role);
});
