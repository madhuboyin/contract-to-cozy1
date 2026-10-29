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
  type PermitExtraActionId,
} from '../support/permitTrackerExtra';
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

registerCapabilityHandler('permits.status', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, propertyId);
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
