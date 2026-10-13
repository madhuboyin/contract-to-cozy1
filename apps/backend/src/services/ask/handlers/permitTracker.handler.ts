// The Permit Tracker read inside Ask (register P0 "Permits", slice PM-A; FRD v1.313).
//
// Reads what the Permit Tracker page's list, summary and flags endpoints read (permitTrackerService.listPermits, getPermitSummary, listFlags), with the
// page's own read-only behavior and none of its effects (the route also attaches a project-compliance envelope and emits TOOL_USED analytics; Ask does
// neither). Official versus reported status is kept apart: a reported "issued" is never shown as an issued permit. Not here: add or change a permit,
// inspections, flags, remediation, readiness checks and the disclosure export (later slices; the last two need their own designs). Ask links to no page.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { permitTrackerService } from '../../permitTracker.service';
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

const when = (iso: string | null | undefined) => (iso ? humanDate(new Date(iso)) : null);

/** Pure: the answer from the three reads, exported for tests. */
export function permitTrackerFromView(permits: readonly PermitItem[], summary: PermitSummary, flags: readonly FlagItem[], hasMorePermits = false): AskOperationResult {
  if (!permits.length && !flags.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PERMIT_TRACKER_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'permit-tracker-summary', title: 'No permits are recorded for this home',
        body: 'Nothing is recorded here, which is not the same as nothing having been permitted: records may exist with the permitting office that have not been added. Adding a permit is not currently available in Ask.',
        tone: 'DEFAULT', actions: [],
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
    tone: summary.openFlags || openInspections ? 'CAUTION' : 'DEFAULT', actions: [],
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
        })),
      }],
      actions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: 'ANSWERED', reasonCode: undefined, blocks, suggestions: [] };
}

registerCapabilityHandler('permits.status', async (envelope) => {
  const propertyId = envelope.propertyId!;
  const [list, summary, flags] = await Promise.all([
    permitTrackerService.listPermits(propertyId, { limit: PERMIT_ASK_LIMIT }),
    permitTrackerService.getPermitSummary(propertyId),
    permitTrackerService.listFlags(propertyId, { status: [...PERMIT_OPEN_FLAG_STATUSES], limit: FLAG_ASK_LIMIT }),
  ]);
  return permitTrackerFromView(list.items as PermitItem[], summary, flags.items, Boolean(list.nextCursor));
});
