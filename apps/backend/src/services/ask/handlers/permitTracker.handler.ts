// The Permit Tracker read inside Ask (register P0 "Permits", slice PM-A; FRD v1.313).
//
// Reads what the Permit Tracker page's list, summary and flags endpoints read (permitTrackerService.listPermits, getPermitSummary, listFlags), with the
// page's own read-only behavior and none of its effects (the route also attaches a project-compliance envelope and emits TOOL_USED analytics; Ask does
// neither). Official versus reported status is kept apart: a reported "issued" is never shown as an issued permit. Not here: add or change a permit,
// inspections, flags, remediation, readiness checks and the disclosure export (later slices; the last two need their own designs). Ask links to no page.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { PERMIT_COMMAND_ACTION_IDS, PERMIT_COMMAND_MESSAGES, PERMIT_ENTITY_TYPE, PERMIT_PROPERTY_ENTITY_TYPE } from '../support/permitTrackerCommand';
import { permitTrackerService } from '../../permitTracker.service';
import { prisma } from '../../../lib/prisma';
import {
  INSPECTION_STATUS_LABELS, INSPECTION_STAGE_LABELS, PERMIT_EXTRA_ACTION_IDS as EXTRA, PERMIT_EXTRA_MESSAGES, PERMIT_FLAG_ENTITY_TYPE, PERMIT_INSPECTION_ENTITY_TYPE, inspectionEntityId,
  PERMIT_DISCLOSURE_ENTITY_TYPE, PERMIT_DISCLOSURE_STATUS_ACTION_ID, PERMIT_DISCLOSURE_STATUS_MESSAGE, PERMIT_FETCH_STATUS_MESSAGE, type PermitExtraActionId,
} from '../support/permitTrackerExtra';
import { permitFetchService } from '../../permitFetch.service';
import {
  PERMIT_CATEGORY_LABELS, PERMIT_FLAG_STATUS_LABELS, PERMIT_OFFICIAL_STATUS_LABELS, PERMIT_OPEN_FLAG_STATUSES, PERMIT_REPORTED_STATUS_LABELS, PERMIT_RISK_LABELS,
  PERMIT_WORK_TYPE_LABELS,
} from '../support/permitTrackerRead';

export const PERMIT_ASK_LIMIT = 30;
const FLAG_ASK_LIMIT = 10;
type PermitItem = Awaited<ReturnType<typeof permitTrackerService.listPermits>>['items'][number] & { reportedStatus?: string | null };
type FlagItem = Awaited<ReturnType<typeof permitTrackerService.listFlags>>['items'][number];
type PermitSummary = Awaited<ReturnType<typeof permitTrackerService.getPermitSummary>>;

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'permit-tracker-boundary', title: 'As recorded, not a legal determination',
  body: 'These are the permit records and flags kept for this home. The issuing authority’s record controls, and what must be disclosed to a buyer depends on local rules. Check with the permitting office or a professional before relying on this.',
  severity: 'INFO', suggestions: [],
};

export interface InspectionStep { id: string; permitRecordId: string; stageName: string; stageType: string; status: string; scheduledDate: Date | string | null; inspectedDate: Date | string | null; isRequired?: boolean }
const INSPECTION_PERMIT_LIMIT = 5;
const extraAction = (id: PermitExtraActionId, label: string, entityType: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET') =>
  ({ id, label, message: PERMIT_EXTRA_MESSAGES[id], operationId: 'PERMIT_TRACKER_COMMAND' as const, actionId: id, entityType, entityId, style });
/** A list-level step (on the whole answer) starts a workflow; a row-level step changes that row's record. */
const listExtra = (id: PermitExtraActionId, label: string, entityType: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') =>
  ({ ...extraAction(id, label, entityType, entityId, style), interactionType: 'START_WORKFLOW' as const });
const rowExtra = (id: PermitExtraActionId, label: string, entityType: string, entityId: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') =>
  ({ ...extraAction(id, label, entityType, entityId, style), interactionType: 'MUTATE_RECORD' as const });
const when = (iso: string | null | undefined) => (iso ? humanDate(new Date(iso)) : null);

/** Pure: the answer from the three reads, exported for tests. */
export function permitTrackerFromView(permits: readonly PermitItem[], summary: PermitSummary, flags: readonly FlagItem[], hasMorePermits = false, canChange = false, propertyId = '', inspections: readonly InspectionStep[] = []): AskOperationResult {
  // A contributor or owner can add a permit and change or remove one; a viewer is offered nothing it would refuse.
  const addAction = canChange && propertyId ? [{
    id: PERMIT_COMMAND_ACTION_IDS.ADD, label: 'Add a permit', interactionType: 'START_WORKFLOW' as const, message: PERMIT_COMMAND_MESSAGES.ADD,
    operationId: 'PERMIT_TRACKER_COMMAND' as const, entityType: PERMIT_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'PRIMARY' as const,
  }] : [];
  const listActions = canChange && propertyId ? [
    listExtra(EXTRA.FETCH, 'Look for records at my permit office', PERMIT_PROPERTY_ENTITY_TYPE, propertyId),
    listExtra(EXTRA.SCAN, 'Check for possible unpermitted work', PERMIT_PROPERTY_ENTITY_TYPE, propertyId),
    listExtra(EXTRA.FLAG_ADD, 'Record work I may not have a permit for', PERMIT_PROPERTY_ENTITY_TYPE, propertyId, 'QUIET'),
    listExtra(EXTRA.DISCLOSURE_EXPORT, 'Create a disclosure report', PERMIT_PROPERTY_ENTITY_TYPE, propertyId, 'QUIET'),
  ] : [];
  if (!permits.length && !flags.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PERMIT_TRACKER_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'permit-tracker-summary', title: 'No permits are recorded for this home',
        body: 'Nothing is recorded here, which is not the same as nothing having been permitted: records may exist with the permitting office that have not been added. '+(canChange ? 'Add one you know about.' : 'A contributor or owner can add one.'),
        tone: 'DEFAULT', actions: [...addAction, ...listActions],
      }, BOUNDARY],
      suggestions: [],
    };
  }
  const row = (permit: PermitItem) => {
    const official = PERMIT_OFFICIAL_STATUS_LABELS[permit.status] ?? permit.status;
    const reported = permit.reportedStatus ? PERMIT_REPORTED_STATUS_LABELS[permit.reportedStatus] ?? null : null;
    const category = PERMIT_CATEGORY_LABELS[permit.category] ?? permit.category;
    return {
      id: permit.id,
      title: `${category} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`,
      description: permit.description ?? (permit.workTypes?.length ? permit.workTypes.map(PERMIT_WORK_TYPE_LABELS).join(', ') : null),
      meta: [
        `Official: ${official}`,
        // Only worth saying when it differs: a reported status is the household's or contractor's word, not the authority's.
        ...(reported && permit.status === 'UNKNOWN' ? [`Reported by the household: ${reported}`] : []),
        permit.hasOpenInspections ? 'Has open inspections' : null,
        when(permit.issueDate) ? `Issued ${when(permit.issueDate)}` : null,
        when(permit.finaledDate) ? `Finaled ${when(permit.finaledDate)}` : null,
        when(permit.expirationDate) ? `Expires ${when(permit.expirationDate)}` : null,
        permit.contractorName ? `Contractor: ${permit.contractorName}` : null,
        permit.isVerified ? 'Verified record' : null,
      ].filter((value): value is string => Boolean(value)).slice(0, 6),
      status: official, href: null,
      entityType: PERMIT_ENTITY_TYPE,
      actions: canChange ? [
        { id: PERMIT_COMMAND_ACTION_IDS.EDIT, label: 'Change details', message: PERMIT_COMMAND_MESSAGES.EDIT, operationId: 'PERMIT_TRACKER_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const },
        rowExtra(EXTRA.INSPECTION_ADD, 'Add inspection step', PERMIT_ENTITY_TYPE, permit.id),
        rowExtra(EXTRA.OFFICIAL_STATUS, 'Record official status', PERMIT_ENTITY_TYPE, permit.id, 'QUIET'),
        { id: PERMIT_COMMAND_ACTION_IDS.REMOVE, label: 'Remove', message: PERMIT_COMMAND_MESSAGES.REMOVE, operationId: 'PERMIT_TRACKER_COMMAND', interactionType: 'MUTATE_RECORD' as const, style: 'QUIET' as const },
      ] : [],
    };
  };
  const closed = new Set(['FINALED', 'EXPIRED', 'VOIDED']);
  const active = permits.filter((permit) => !closed.has(permit.status));
  const done = permits.filter((permit) => closed.has(permit.status));
  const openInspections = permits.filter((permit) => permit.hasOpenInspections).length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'permit-tracker-summary',
    title: `${summary.totalPermits} permit${summary.totalPermits === 1 ? '' : 's'} recorded${summary.openFlags ? `, ${summary.openFlags} flag${summary.openFlags === 1 ? '' : 's'} to look into` : ''}`,
    body: [
      `${summary.activePermits} active and ${summary.finaledPermits} finaled.`,
      openInspections ? `${openInspections} ${openInspections === 1 ? 'has' : 'have'} inspections still open.` : null,
      summary.openFlags ? 'Flags mark work that may have needed a permit and has no matching record.' : null,
    ].filter(Boolean).join(' '),
    tone: summary.openFlags || openInspections ? 'CAUTION' : 'DEFAULT', actions: [...addAction, ...listActions],
  }];
  if (hasMorePermits) {
    blocks.push({ type: 'LIMITATION', id: 'permit-tracker-limit', title: `Showing the first ${PERMIT_ASK_LIMIT}`, body: 'More permit records exist than are listed here.', severity: 'INFO' });
  }
  if (permits.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'permit-tracker-permits', title: 'Permit records',
      description: 'Official status is the authority’s record; it is shown separately from anything the household reported.',
      sections: [
        ...(active.length ? [{ id: 'permit-tracker-active', title: 'Active', count: active.length, items: active.map(row) }] : []),
        ...(done.length ? [{ id: 'permit-tracker-closed', title: 'Closed out or no longer valid', count: done.length, items: done.map(row) }] : []),
      ],
      actions: [],
    });
  }
  if (flags.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'permit-tracker-flags', title: 'Flags to look into',
      description: 'Work that may have needed a permit, with how risky it would be to disclose.',
      sections: [{
        id: 'permit-tracker-flags-open', title: 'Open flags', count: flags.length,
        items: flags.slice(0, FLAG_ASK_LIMIT).map((flag) => ({
          id: flag.id, title: `${PERMIT_WORK_TYPE_LABELS(String(flag.workType))}`, description: String(flag.flagReason ?? '').slice(0, 240) || null,
          meta: [PERMIT_RISK_LABELS[String(flag.disclosureRisk)] ?? String(flag.disclosureRisk)], status: PERMIT_FLAG_STATUS_LABELS[String(flag.status)] ?? String(flag.status), href: null,
          entityType: PERMIT_FLAG_ENTITY_TYPE,
          actions: !canChange ? [] : [
            ...(['UNKNOWN', 'FLAGGED'].includes(String(flag.status)) ? [rowExtra(EXTRA.FLAG_RESEARCH, 'Mark as researching', PERMIT_FLAG_ENTITY_TYPE, flag.id)] : []),
            rowExtra(EXTRA.FLAG_RESOLVE, 'Close out with proof', PERMIT_FLAG_ENTITY_TYPE, flag.id, 'QUIET'),
            ...(!(flag as { remediationCaseId?: string | null }).remediationCaseId ? [rowExtra(EXTRA.FLAG_REMEDIATE, 'Start a plan', PERMIT_FLAG_ENTITY_TYPE, flag.id)] : []),
          ],
        })),
      }],
      actions: [],
    });
  }
  const stepLabel = (step: InspectionStep) => `${step.stageName}${INSPECTION_STAGE_LABELS[step.stageType] && INSPECTION_STAGE_LABELS[step.stageType] !== step.stageName ? ` (${INSPECTION_STAGE_LABELS[step.stageType]})` : ''}`;
  if (inspections.length) {
    const byPermit = new Map<string, InspectionStep[]>();
    for (const step of inspections) byPermit.set(step.permitRecordId, [...(byPermit.get(step.permitRecordId) ?? []), step]);
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'permit-tracker-inspections', title: 'Inspection steps',
      description: 'Steps tracked on permits that still have inspections open. They record where each stands; nothing here books an inspection with the authority.',
      sections: [...byPermit.entries()].map(([permitId, steps]) => {
        const permit = permits.find((candidate) => candidate.id === permitId);
        return {
          id: `permit-tracker-inspections-${permitId}`, title: permit ? `${PERMIT_CATEGORY_LABELS[permit.category] ?? permit.category} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}` : 'Permit', count: steps.length,
          items: steps.map((step) => ({
            id: step.id, title: stepLabel(step), description: null, status: INSPECTION_STATUS_LABELS[step.status] ?? step.status, href: null,
            meta: [when(step.scheduledDate instanceof Date ? step.scheduledDate.toISOString() : step.scheduledDate) ? `Scheduled ${when(step.scheduledDate instanceof Date ? step.scheduledDate.toISOString() : step.scheduledDate)}` : null,
              when(step.inspectedDate instanceof Date ? step.inspectedDate.toISOString() : step.inspectedDate) ? `Inspected ${when(step.inspectedDate instanceof Date ? step.inspectedDate.toISOString() : step.inspectedDate)}` : null].filter((value): value is string => Boolean(value)),
            entityType: PERMIT_INSPECTION_ENTITY_TYPE,
            actions: canChange ? [
              rowExtra(EXTRA.INSPECTION_UPDATE, 'Update', PERMIT_INSPECTION_ENTITY_TYPE, inspectionEntityId(permitId, step.id)),
              rowExtra(EXTRA.INSPECTION_REMOVE, 'Remove', PERMIT_INSPECTION_ENTITY_TYPE, inspectionEntityId(permitId, step.id), 'QUIET'),
            ] : [],
          })),
        };
      }),
      actions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: 'ANSWERED', reasonCode: undefined, blocks, suggestions: [] };
}

/** Pure: the answer to "check on the permit-record search", from the latest fetch job (or none). A read: it starts nothing and writes nothing. */
export function permitFetchStatusAnswer(job: { status: string; dataSourceName?: string | null; permitsFound?: number | null; permitsInserted?: number | null; errorMessage?: string | null; startedAt: string; completedAt?: string | null } | null, canChange: boolean, propertyId = ''): AskOperationResult {
  const again = { id: 'permit-fetch-status', label: 'Check again', interactionType: 'START_WORKFLOW' as const, message: PERMIT_FETCH_STATUS_MESSAGE, operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'SECONDARY' as const };
  const retry = canChange && propertyId ? [listExtra(EXTRA.FETCH, 'Search again', PERMIT_PROPERTY_ENTITY_TYPE, propertyId, 'SECONDARY')] : [];
  const started = when(job?.startedAt);
  const copy = (title: string, body: string, tone: 'DEFAULT' | 'CAUTION', actions: unknown[], reasonCode?: string): AskOperationResult => ({
    status: 'ANSWERED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'permit-fetch-status', title, body, tone, actions: actions as never[] }, BOUNDARY], suggestions: [],
  });
  if (!job) return copy('No permit-record search has been run', 'Nothing has been looked up for this home yet. You can start a search, or add a permit you know about.', 'DEFAULT', []);
  switch (job.status) {
    case 'QUEUED': return copy('The search is waiting to start', `It was requested${started ? ` ${started}` : ''}. It may take a few minutes depending on the local source.`, 'DEFAULT', [again]);
    case 'RUNNING': return copy('Searching the permitting office’s records', `${job.dataSourceName ? `Looking in ${job.dataSourceName}. ` : ''}It may take a few minutes depending on the local source.`, 'DEFAULT', [again]);
    case 'COMPLETED': {
      const found = job.permitsFound ?? 0; const added = job.permitsInserted ?? 0;
      return copy(found ? `The search found ${found} record${found === 1 ? '' : 's'}` : 'The search finished and found no records',
        found ? `${added} ${added === 1 ? 'was' : 'were'} new and added to your permits; ${Math.max(0, found - added)} you already had. ${job.dataSourceName ? `Source: ${job.dataSourceName}. ` : ''}Records can exist that this source does not publish.`
          : `${job.dataSourceName ? `${job.dataSourceName} had nothing for this address. ` : ''}That is not proof that no permit exists: some records are not published, or are filed under another address.`, 'DEFAULT', []);
    }
    case 'FAILED': return copy('The search could not finish', `${job.errorMessage ? `${job.errorMessage} ` : ''}This does not mean there are no records. ${canChange ? 'You can search again, or add a permit you know about.' : 'A contributor or owner can search again.'}`, 'CAUTION', retry, 'PERMIT_FETCH_FAILED');
    case 'NO_DATA_SOURCE': return copy('Automatic lookup is not available for this address', 'There is no public permit data source set up for this area, so Cozy cannot search for you. You can add the permits you know about by hand.', 'DEFAULT', []);
    default: return copy('The search is in an unknown state', 'Check again in a moment.', 'DEFAULT', [again]);
  }
}

const DISCLOSURE_STATUS_LABELS: Record<string, string> = { PENDING: 'Waiting to start', GENERATING: 'Being prepared', COMPLETED: 'Ready', FAILED: 'Could not be made' };
interface DisclosureRow { id: string; status: string; totalPermits?: number | null; openFlags?: number | null; expiresAt?: string | Date | null; errorMessage?: string | null; createdAt: string | Date }
/** Pure: the permit disclosure reports and where each stands, from the household's own list. A read: it starts nothing. A ready one is downloaded from the answer's own row. */
export function permitDisclosureStatusAnswer(rows: readonly DisclosureRow[], canChange: boolean, propertyId = '', now = new Date()): AskOperationResult {
  const create = canChange && propertyId ? [listExtra(EXTRA.DISCLOSURE_EXPORT, 'Create a report', PERMIT_PROPERTY_ENTITY_TYPE, propertyId, 'PRIMARY')] : [];
  if (!rows.length) {
    return { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'permit-disclosure-status', title: 'No permit disclosure report has been made', body: 'A report is a PDF snapshot of your permit records and flags, made when you ask for it.', tone: 'DEFAULT', actions: create as never[] }, BOUNDARY], suggestions: [] };
  }
  const items = rows.slice(0, 5).map((row) => {
    const expired = row.expiresAt != null && new Date(row.expiresAt) <= now;
    const label = row.status === 'COMPLETED' && expired ? 'Expired' : DISCLOSURE_STATUS_LABELS[row.status] ?? row.status;
    const made = when(row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt);
    return {
      id: row.id, title: `Permit disclosure report${made ? ` · as of ${made}` : ''}`, description: row.status === 'FAILED' ? (row.errorMessage ?? 'The report could not be made.') : null,
      status: label, entityType: PERMIT_DISCLOSURE_ENTITY_TYPE, href: null,
      meta: [row.totalPermits != null ? `${row.totalPermits} permit${row.totalPermits === 1 ? '' : 's'}` : null,
        row.openFlags != null ? (row.openFlags ? `${row.openFlags} flag${row.openFlags === 1 ? '' : 's'} still unresolved at the time` : 'No unresolved flags at the time') : null,
        label === 'Ready' && row.expiresAt ? `Download until ${when(row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt)}` : null].filter((value): value is string => Boolean(value)),
      actions: [],
    };
  });
  const latest = items[0];
  const pending = latest.status === 'Waiting to start' || latest.status === 'Being prepared';
  return {
    status: 'ANSWERED', reasonCode: latest.status === 'Could not be made' ? 'PERMIT_DISCLOSURE_FAILED' : undefined,
    blocks: [
      { type: 'SUMMARY', id: 'permit-disclosure-status', title: pending ? 'Your report is being prepared' : latest.status === 'Ready' ? 'Your latest report is ready' : latest.status === 'Expired' ? 'Your latest report has expired' : 'Your latest report could not be made',
        body: pending ? 'It may take a few minutes. A report is a snapshot of the records as of the time shown, so it does not update if they change.' : latest.status === 'Ready' ? 'Download it below. It is a snapshot as of the time shown; records added since are not in it.' : 'You can create a new one.',
        tone: latest.status === 'Could not be made' ? 'CAUTION' : 'DEFAULT',
        actions: pending ? [{ id: PERMIT_DISCLOSURE_STATUS_ACTION_ID, label: 'Check again', interactionType: 'START_WORKFLOW' as const, message: PERMIT_DISCLOSURE_STATUS_MESSAGE, operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'SECONDARY' as const }] : create as never[] },
      { type: 'GROUPED_LIST', filters: [], id: 'permit-disclosure-list', title: 'Your reports', description: null, sections: [{ id: 'permit-disclosure-recent', title: 'Recent reports', count: items.length, items }], actions: [] },
      BOUNDARY,
    ],
    suggestions: [],
  };
}

registerCapabilityHandler('permits.status', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, propertyId);
  if (envelope.message === PERMIT_DISCLOSURE_STATUS_MESSAGE) return permitDisclosureStatusAnswer(await permitTrackerService.listDisclosureExports(propertyId) as DisclosureRow[], access.role !== 'VIEWER', propertyId);
  if (envelope.message === PERMIT_FETCH_STATUS_MESSAGE) return permitFetchStatusAnswer(await permitFetchService.getLatestFetchStatus(propertyId), access.role !== 'VIEWER', propertyId);
  const [list, summary, flags] = await Promise.all([
    permitTrackerService.listPermits(propertyId, { limit: PERMIT_ASK_LIMIT }),
    permitTrackerService.getPermitSummary(propertyId),
    permitTrackerService.listFlags(propertyId, { status: [...PERMIT_OPEN_FLAG_STATUSES], limit: FLAG_ASK_LIMIT }),
  ]);
  // The steps of the permits that still have inspections open (a few permits at most); the answer is still given without them if they cannot be read.
  const openIds = (list.items as PermitItem[]).filter((permit) => permit.hasOpenInspections).slice(0, INSPECTION_PERMIT_LIMIT).map((permit) => permit.id);
  const inspections: InspectionStep[] = openIds.length
    ? await (prisma as any).permitInspectionMilestone.findMany({ where: { propertyId, permitRecordId: { in: openIds } }, orderBy: [{ permitRecordId: 'asc' }, { sortOrder: 'asc' }], select: { id: true, permitRecordId: true, stageName: true, stageType: true, status: true, scheduledDate: true, inspectedDate: true } }).catch(() => [])
    : [];
  return permitTrackerFromView(list.items as PermitItem[], summary, flags.items, Boolean(list.nextCursor), access.role !== 'VIEWER', propertyId, inspections);
});
