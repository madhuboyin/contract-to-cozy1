// Exporting the home record inside Ask (Sole Homeowner Interface FRD v1.2 §1.2). "Export my warranties and appliances" proposes the export:
// exactly what is included and what is not (and why), what is always on the cover, who can download it and how long it is kept. Nothing is
// created until the homeowner confirms, and the create rules are the route's own (homeReportExportCreate.service). "Is my export ready?"
// reads the caller's own exports. Only the person who creates an export can download it, so the file itself is fetched with their session.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { getAskRecordExportReview, ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS, ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS } from '../askRecordExportReview.service';
import { InvalidExportSelectionError, normalizeAskRecordExportRequest } from '../askRecordExportSelection';
import { getAggregationContextEnvelope } from '../../aggregationContext/context';
import { shareIsActive } from '../../homeReportExportShare.service';
import { createHomeReportExportRecord } from '../../homeReportExportCreate.service';
import type { ReportPackSelection } from '../../planningContext/reportPackSections';
import {
  HOME_RECORD_EXPORT_ACTION_IDS, HOME_RECORD_EXPORT_ENTITY_TYPE, HOME_RECORD_EXPORT_START_MESSAGE, HOME_RECORD_EXPORT_STATUS_MESSAGE,
  HOME_RECORD_EXPORT_SHARE_ACTION_IDS, isHomeRecordExportRequest, parseExportSections, shareMessage,
} from '../support/homeRecordExport';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const labelOf = (review: { sections: Array<{ id: string; label: string }> }, id: string) => review.sections.find((section) => section.id === id)?.label ?? id;
const list = (values: readonly string[]) => values.join(', ');

const statusAction = { id: HOME_RECORD_EXPORT_ACTION_IDS.STATUS, label: 'Check if it is ready', interactionType: 'START_WORKFLOW' as const, message: HOME_RECORD_EXPORT_STATUS_MESSAGE, operationId: 'HOME_RECORD_EXPORT_STATUS', style: 'SECONDARY' as const };

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'home-record-export-boundary', title: 'A copy of what is recorded',
  body: 'The export is a PDF snapshot of the sections listed, taken when it is prepared. It does not change your home record. Only you can download it.',
  severity: 'INFO', suggestions: [],
};

const unavailable = (status: AskOperationResult['status'], reasonCode: string, title: string, body: string, actions: Array<typeof statusAction> = []): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-record-export-unavailable', title, body, tone: 'DEFAULT', actions }], suggestions: [],
});

/** The reasons a requested section is left out, in a sentence. */
function leftOut(review: Awaited<ReturnType<typeof getAskRecordExportReview>>, selection: ReportPackSelection): string[] {
  const notInPack = selection.unavailable.map((entry) => {
    const section = review.sections.find((item) => item.id === entry.id);
    const reason = entry.reason === 'RESTRICTED' ? 'your household role cannot read it' : (section?.reason ?? 'the export pack does not carry it');
    return `${labelOf(review, entry.id)} (${reason})`;
  });
  return notInPack;
}

export async function homeRecordExportProposal(userId: string, propertyId: string, message: string, launch: { sourceExecutionId: string | null }): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const review = await getAskRecordExportReview(userId, propertyId);
  if (!review.create.allowed || access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'home-record-export-permission', title: 'A contributor or owner can create an export', body: review.create.reason ?? 'Your role can view this home but not create an export. Nothing was created.', tone: 'DEFAULT', actions: [] }],
      suggestions: [],
    };
  }

  const requested = parseExportSections(message);
  let selection: ReportPackSelection;
  try {
    selection = normalizeAskRecordExportRequest({ sections: requested, type: 'HOME_REPORT_PACK', role: access.role });
  } catch (error) {
    if (!(error instanceof InvalidExportSelectionError)) throw error;
    const carried = review.sections.filter((section) => section.state === 'INCLUDED').map((section) => section.label);
    const why = leftOut(review, { version: 1, requested: [], included: [], unavailable: error.unavailable });
    return unavailable('NOT_APPLICABLE', 'HOME_RECORD_EXPORT_NOTHING_EXPORTABLE', 'Nothing you named can be exported',
      `${why.length ? `Left out: ${list(why)}. ` : ''}The export can carry: ${list(carried)}. Nothing was created.`);
  }

  const inFlight = await prisma.homeReportExport.findFirst({ where: { propertyId, status: { in: ['PENDING', 'GENERATING'] } }, select: { id: true } });
  if (inFlight) {
    return unavailable('NOT_APPLICABLE', 'HOME_RECORD_EXPORT_IN_PROGRESS', 'An export is already being prepared', 'One export at a time is prepared for a home. Check on it, then ask for another. Nothing new was created.', [statusAction]);
  }
  const propertyContext = await getAggregationContextEnvelope(propertyId, userId, 'REPORT_SUMMARIES');
  if (propertyContext.decision.status !== 'APPLICABLE') {
    return unavailable('NOT_APPLICABLE', 'HOME_RECORD_EXPORT_CONTEXT_NOT_READY', 'Not enough is recorded for an export yet', 'The report needs a little more about this home before it can be prepared. Nothing was created.');
  }

  const contextVersion = sha(`home-record-export:${propertyId}:${access.role}:${selection.included.join(',')}`);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const included = selection.included.map((id) => labelOf(review, id));
  const excluded = [...leftOut(review, selection), ...review.sections.filter((section) => section.state === 'EXCLUDED' && !selection.requested.includes(section.id)).map((section) => section.label)];
  const everything = requested === null;
  const fields = [
    { label: 'Home', value: review.property ? `${review.property.name?.trim() || review.property.address}, ${review.property.city}` : 'This home' },
    { label: 'Includes', value: list(included) },
    ...(excluded.length ? [{ label: everything ? 'Not in the export' : 'Left out', value: list(excluded).slice(0, 380) }] : []),
    { label: 'On the cover', value: 'The home’s street address, city, state and ZIP code' },
    { label: 'Format', value: 'PDF' },
    { label: 'Who can download it', value: 'Only you' },
    { label: 'Kept for', value: `${ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS} days` },
    { label: 'Sharing', value: `A shared link carries a redacted copy (no street address or ZIP) for ${ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS} days by default; it is made separately` },
  ];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_RECORD_EXPORT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homeRecordExport: { sections: requested, included: selection.included }, homeRecordExportContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [
      { type: 'SUMMARY', id: 'home-record-export-review', title: everything ? 'Export your home record?' : `Export ${included.length} ${included.length === 1 ? 'section' : 'sections'} of your home record?`, body: 'Review exactly what the export includes. Nothing is created until you confirm.', tone: 'DEFAULT', actions: [] },
      BOUNDARY,
    ],
    confirmation: {
      confirmationId: `home-record-export-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: 'Create this export?',
      description: 'A PDF of the sections listed is prepared in the background. It is a snapshot; your home record does not change.',
      fields, editableFields: [], confirmLabel: 'Create the export', consentText: 'I authorize creating this export of my home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('home-record-export.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.surface === 'ASK_REFRESH') return unavailable('NOT_APPLICABLE', 'HOME_RECORD_EXPORT_NOT_REFRESHABLE', 'Ask for the export again', 'An export is created only from a request you confirm. Nothing was created.');
  if (!isHomeRecordExportRequest(envelope.message) && envelope.message !== HOME_RECORD_EXPORT_START_MESSAGE) {
    return unavailable('NOT_APPLICABLE', 'HOME_RECORD_EXPORT_NOT_DIRECTLY_ROUTABLE', 'Say what to export', 'Ask for what you want, for example “export my warranties and appliances”. Nothing was created.');
  }
  return homeRecordExportProposal(envelope.userId, envelope.propertyId!, envelope.message, { sourceExecutionId: launch?.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmHomeRecordExport(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  const stored = parameters.homeRecordExport as { sections?: unknown; included?: unknown } | undefined;
  const requested = Array.isArray(stored?.sections) ? stored.sections.filter((id): id is string => typeof id === 'string') : null;
  if (stored === undefined || (stored.sections !== null && !Array.isArray(stored.sections))) throw stale('The export to create is invalid.');
  const propertyId = execution.propertyId;
  if (access.role === HouseholdRole.VIEWER) throw stale('Your role can no longer create an export for this home.', 'ASK_PERMISSION_REQUIRED');

  // The sections and role are re-derived: a role change or a change to what the pack carries is a stale confirmation, never a different export.
  let selection: ReportPackSelection;
  try {
    selection = normalizeAskRecordExportRequest({ sections: requested, type: 'HOME_REPORT_PACK', role: access.role });
  } catch (error) {
    if (error instanceof InvalidExportSelectionError) throw stale(error.message);
    throw error;
  }
  if (parameters.homeRecordExportContextVersion !== sha(`home-record-export:${propertyId}:${access.role}:${selection.included.join(',')}`)) {
    throw stale('What the export includes changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }

  // A retry after an unknown outcome must not create a second export: one created by this person for this home since this request began is it.
  const existing = await prisma.homeReportExport.findFirst({
    where: { propertyId, userId, requestedAt: { gte: execution.createdAt }, status: { not: 'DELETED' } }, orderBy: { requestedAt: 'desc' }, select: { id: true, status: true },
  });
  let exportId: string;
  let created = false;
  if (existing) {
    exportId = existing.id;
  } else {
    let outcome;
    try {
      outcome = await createHomeReportExportRecord({ userId, propertyId, sections: requested ?? undefined });
    } catch (error) {
      if (error instanceof InvalidExportSelectionError) throw stale(error.message);
      throw error;
    }
    if (outcome.kind === 'IN_FLIGHT') throw stale('An export is already being prepared for this home. Check on it first.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (outcome.kind === 'CONTEXT_NOT_READY') throw stale('Not enough is recorded for an export yet.');
    exportId = outcome.export.id;
    created = true;
  }

  const review = await getAskRecordExportReview(userId, propertyId);
  const included = selection.included.map((id) => labelOf(review, id));
  const left = leftOut(review, selection);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: created ? 'HOME_RECORD_EXPORT_CREATED' : 'HOME_RECORD_EXPORT_ALREADY_CREATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-record-export-${exportId}`, title: created ? 'Export started' : 'Export already started', status: 'COMPLETED',
      description: 'Your home record PDF is being prepared. Ask “Is my export ready?” to check on it. Only you can download it, and it is kept for 30 days.',
      details: [{ label: 'Includes', value: list(included) }, ...(left.length ? [{ label: 'Left out', value: list(left).slice(0, 380) }] : [])],
      actions: [statusAction],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'home-record-export-refresh-failed', severity: 'CAUTION', title: 'Started; view could not refresh', body: 'The export was started. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: HOME_RECORD_EXPORT_ENTITY_TYPE, artifactId: exportId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-record-export.command', confirmHomeRecordExport);

const STATUS_COPY: Record<string, { label: string; line: string }> = {
  PENDING: { label: 'Preparing', line: 'is being prepared.' },
  GENERATING: { label: 'Preparing', line: 'is being prepared.' },
  READY: { label: 'Ready', line: 'is ready to download.' },
  FAILED: { label: 'Could not be generated', line: 'could not be generated.' },
  EXPIRED: { label: 'Expired', line: 'has expired.' },
};

interface ExportRow { id: string; status: string; requestedAt: Date; expiresAt: Date | null; sections: unknown; errorMessage: string | null; shareToken?: string | null; shareRevokedAt?: Date | null; shareExpiresAt?: Date | null }

function includedCount(sections: unknown): number | null {
  const included = (sections as { included?: unknown } | null)?.included;
  return Array.isArray(included) ? included.length : null;
}

/** The caller's own recent exports for this home, newest first, with where each stands. Pure: the handler reads the rows. */
export function homeRecordExportStatusFromRows(input: readonly ExportRow[], now: Date = new Date(), canShare = false): AskOperationResult {
  // A file whose keep-until date has passed is expired, whatever its stored status still says.
  const rows = input.map((row) => (row.status === 'READY' && row.expiresAt && row.expiresAt.getTime() <= now.getTime() ? { ...row, status: 'EXPIRED' } : row));
  if (rows.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_RECORD_EXPORT_NONE',
      blocks: [{
        type: 'SUMMARY', id: 'home-record-export-status-summary', title: 'You have not created an export for this home', headline: 'No exports yet.', supportLine: 'Ask to export your home record, or just part of it.',
        body: 'You have not created an export for this home. Ask “export my home record” or “export my warranties” to prepare one.', tone: 'DEFAULT',
        actions: [{ id: HOME_RECORD_EXPORT_ACTION_IDS.START, label: 'Export my home record', interactionType: 'START_WORKFLOW', message: HOME_RECORD_EXPORT_START_MESSAGE, operationId: 'HOME_RECORD_EXPORT', style: 'PRIMARY' }],
      }, BOUNDARY],
      suggestions: [],
    };
  }
  const [latest] = rows;
  const copy = STATUS_COPY[latest.status] ?? { label: latest.status.toLowerCase(), line: 'is in an unknown state.' };
  const requested = humanDate(latest.requestedAt);
  const headline = `Your latest export${requested ? `, from ${requested},` : ''} ${copy.line}`;
  const items = rows.map((row) => {
    const status = STATUS_COPY[row.status] ?? { label: row.status.toLowerCase(), line: '' };
    const count = includedCount(row.sections);
    const shared = shareIsActive({ shareToken: row.shareToken ?? null, shareRevokedAt: row.shareRevokedAt ?? null, shareExpiresAt: row.shareExpiresAt ?? null }, now);
    return {
      id: row.id, title: `Home record export · ${humanDate(row.requestedAt) ?? 'recent'}`, description: row.status === 'FAILED' ? (row.errorMessage ?? 'The export could not be generated.') : null,
      status: status.label, entityType: HOME_RECORD_EXPORT_ENTITY_TYPE, href: null,
      meta: [count != null ? `${count} ${count === 1 ? 'section' : 'sections'}` : null, row.status === 'READY' && row.expiresAt ? `Download until ${humanDate(row.expiresAt)}` : null, shared ? `Shared until ${humanDate(row.shareExpiresAt)}` : null].filter((value): value is string => Boolean(value)),
      // Share and Stop sharing act on this export and confirm first; only someone who can share is offered them, and only for a file that is ready.
      actions: canShare && row.status === 'READY' ? [
        { id: HOME_RECORD_EXPORT_SHARE_ACTION_IDS.SHARE, label: shared ? 'Replace the link' : 'Share a link', message: shareMessage('SHARE', `Home record export · ${humanDate(row.requestedAt) ?? 'recent'}`), interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_RECORD_EXPORT_SHARE', style: 'SECONDARY' as const },
        ...(shared ? [{ id: HOME_RECORD_EXPORT_SHARE_ACTION_IDS.REVOKE, label: 'Stop sharing', message: shareMessage('REVOKE', `Home record export · ${humanDate(row.requestedAt) ?? 'recent'}`), interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_RECORD_EXPORT_SHARE', style: 'QUIET' as const }] : []),
      ] : [],
    };
  });
  return {
    status: latest.status === 'FAILED' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: latest.status === 'FAILED' ? 'HOME_RECORD_EXPORT_FAILED' : undefined,
    blocks: [
      {
        type: 'SUMMARY', id: 'home-record-export-status-summary', title: headline.replace(/\.$/, ''), body: headline, headline,
        supportLine: latest.status === 'READY' ? 'Download it below. Only you can download it.' : latest.status === 'FAILED' ? 'Ask to export again to try once more.' : 'Ask again in a moment.',
        tone: latest.status === 'FAILED' ? 'CAUTION' : 'DEFAULT', actions: latest.status === 'PENDING' || latest.status === 'GENERATING' ? [statusAction] : [],
      },
      {
        type: 'GROUPED_LIST', id: 'home-record-export-status-list', title: 'Your exports', filters: [],
        sections: [{ id: 'exports', title: 'Recent exports', count: items.length, items }],
        collection: collectionDescriptor({ sourceTotal: items.length, fetchedCount: items.length, sections: [{ items }], nextPageAvailable: false }),
        actions: [],
      },
      BOUNDARY,
    ],
    suggestions: [],
  };
}

registerCapabilityHandler('home-record-export.status', async (envelope) => {
  const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  const rows = await prisma.homeReportExport.findMany({
    where: { propertyId: envelope.propertyId!, userId: envelope.userId, status: { not: 'DELETED' } }, orderBy: { requestedAt: 'desc' }, take: 5,
    select: { id: true, status: true, requestedAt: true, expiresAt: true, sections: true, errorMessage: true, shareToken: true, shareRevokedAt: true, shareExpiresAt: true },
  });
  return homeRecordExportStatusFromRows(rows, new Date(), access.role !== HouseholdRole.VIEWER);
});
