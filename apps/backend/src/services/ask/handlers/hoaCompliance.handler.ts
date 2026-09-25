// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { hoaComplianceService } from '../../hoaCompliance.service';
import { humanDate, readableCode } from '../askFormatting';

// HOA Compliance capability-card slice (FRD v1.66): the seventeenth new operation for a capability with none (the v1.47
// "needs a product decision" label did not hold once the page was traced). Reads HoaComplianceService getAssociation,
// listApprovalRecords and listViolations -- the three GETs the HOA Compliance page makes; the routes admit any household
// role and the service scopes by property only. The routes also attach a project-compliance envelope and emit TOOL_USED
// analytics; Ask does neither. Like the page, a status the household reported is kept apart from a decision on record,
// and a decision from an uploaded document is labelled "Documented", not "Association". Adds each approval's expiration
// date, which the page never shows. Association contact email and phone, record notes and violation descriptions stay
// on the page. Read-only.
type HoaAssociationView = Awaited<ReturnType<typeof hoaComplianceService.getAssociation>>;
type HoaApprovalView = Awaited<ReturnType<typeof hoaComplianceService.listApprovalRecords>>[number];
type HoaViolationView = Awaited<ReturnType<typeof hoaComplianceService.listViolations>>[number];
// The page's own labels (components/features/hoa/HoaUtils).
const HOA_WORK_TYPE_LABELS: Record<string, string> = {
  EXTERIOR_PAINT: 'Exterior Paint', FENCE: 'Fence', ROOFING: 'Roofing', ROOM_ADDITION: 'Room Addition', DECK_PATIO: 'Deck / Patio',
  LANDSCAPING: 'Landscaping', SOLAR: 'Solar', WINDOWS_DOORS: 'Windows & Doors', DRIVEWAY: 'Driveway', SHED_OUTBUILDING: 'Shed / Outbuilding',
  POOL: 'Pool', SATELLITE_ANTENNA: 'Satellite / Antenna', OTHER: 'Other',
};
const HOA_APPROVAL_STATUS_LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Not Submitted', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', CORRECTION_REQUESTED: 'Correction Requested',
  RESUBMITTED: 'Resubmitted', APPROVED: 'Approved', APPROVED_WITH_CONDITIONS: 'Approved (Conditions)', DENIED: 'Denied', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn',
};
const HOA_VIOLATION_STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Reported', EVALUATED: 'Under Review', ACTIVE: 'Needs Attention', ACTIONED: 'Action Taken', MITIGATED: 'Mitigated',
  RESOLVED: 'Resolved', SUPPRESSED: 'Dismissed', EXPIRED: 'Expired',
};
const HOA_DUES_FREQUENCY_LABELS: Record<string, string> = { MONTHLY: 'monthly', QUARTERLY: 'quarterly', ANNUAL: 'a year' };
const HOA_OPEN_VIOLATION_STATUSES = new Set(['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED']);
const hoaCents = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
const hoaDate = (value: Date | string | null | undefined) => (value ? humanDate(new Date(value)) : null);

export function hoaComplianceFromView(
  view: { association: HoaAssociationView; approvals: readonly HoaApprovalView[]; violations: readonly HoaViolationView[] },
  propertyId: string,
  now: Date = new Date(),
): AskOperationResult {
  const pageHref = `/dashboard/hoa?propertyId=${encodeURIComponent(propertyId)}`;
  const guidanceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/guidance-overview`;
  const openAction = { id: 'open-hoa-compliance', label: 'Open HOA Compliance', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'hoa-compliance-boundary', title: 'A reported status is not an approval',
    body: 'Statuses marked "You reported" are what the household entered. Only a decision on record from the association (or its documents) shows what was approved, and the association\'s own records control. Confirm with the association before starting work.',
    severity: 'INFO', suggestions: [],
  };
  const { association, approvals, violations } = view;
  if (!association && !approvals.length && !violations.length) {
    return {
      status: 'ANSWERED', reasonCode: 'HOA_COMPLIANCE_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'hoa-compliance-summary', title: 'No HOA recorded for this home',
        body: 'HOA Compliance keeps your association, dues, approval requests and any violation notices in one place. If this home has an HOA, open it to add the association.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Is my renovation ready to start?'],
    };
  }
  const open = violations.filter((violation) => HOA_OPEN_VIOLATION_STATUSES.has(String(violation.status)));
  const past = violations.filter((violation) => !HOA_OPEN_VIOLATION_STATUSES.has(String(violation.status)));
  const decided = (record: HoaApprovalView) => Boolean(record.decisionStatus) && record.decisionTruthLayer !== 'DOCUMENTED';
  const associationApproved = approvals.filter((record) => decided(record) && ['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(String(record.decisionStatus))).length;
  const awaiting = approvals.filter((record) => !record.decisionStatus && ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'CORRECTION_REQUESTED'].includes(String(record.reportedStatus))).length;
  const violationRow = (violation: HoaViolationView) => ({
    id: violation.id,
    title: violation.summary || violation.title,
    description: `Opened ${hoaDate(violation.openedAt) ?? 'on an unknown date'}`,
    meta: [
      violation.cureDeadline ? `Cure by ${hoaDate(violation.cureDeadline)}` : null,
      violation.fineAmountCents != null ? `Fine ${hoaCents(violation.fineAmountCents)}` : null,
      violation.resolvedAt ? `Resolved ${hoaDate(violation.resolvedAt)}` : null,
    ].filter((value): value is string => Boolean(value)),
    status: HOA_VIOLATION_STATUS_LABELS[String(violation.status)] ?? readableCode(String(violation.status)),
    href: violation.journeyId ? `${guidanceHref}?journeyId=${encodeURIComponent(violation.journeyId)}` : guidanceHref,
  });
  const approvalRow = (record: HoaApprovalView) => {
    const expired = record.expirationDate && new Date(record.expirationDate).getTime() <= now.getTime();
    return {
      id: record.id,
      title: HOA_WORK_TYPE_LABELS[String(record.workType)] ?? readableCode(String(record.workType)),
      description: record.description ?? null,
      meta: [
        `You reported: ${HOA_APPROVAL_STATUS_LABELS[String(record.reportedStatus)] ?? readableCode(String(record.reportedStatus))}`,
        record.decisionStatus
          ? `${record.decisionTruthLayer === 'DOCUMENTED' ? 'Documented (association not confirmed)' : 'Association'}: ${HOA_APPROVAL_STATUS_LABELS[String(record.decisionStatus)] ?? readableCode(String(record.decisionStatus))}`
          : 'No association decision on record',
        record.submittedDate ? `Submitted ${hoaDate(record.submittedDate)}` : null,
        record.approvalConditions ? `Conditions: ${record.approvalConditions}` : null,
        record.expirationDate ? `${expired ? 'Expired' : 'Expires'} ${hoaDate(record.expirationDate)}` : null,
      ].filter((value): value is string => Boolean(value)),
      status: record.decisionStatus && record.decisionTruthLayer !== 'DOCUMENTED'
        ? HOA_APPROVAL_STATUS_LABELS[String(record.decisionStatus)] ?? readableCode(String(record.decisionStatus))
        : 'Not confirmed',
      href: pageHref,
    };
  };
  const dues = association?.duesAmountCents != null
    ? `Dues are ${hoaCents(association.duesAmountCents)} ${HOA_DUES_FREQUENCY_LABELS[String(association.duesFrequency)] ?? ''}`.trim()
      + (association.nextDueDate ? `, next due ${hoaDate(association.nextDueDate)}.` : '.')
    : null;
  const sections = [
    open.length ? { id: 'hoa-open-violations', title: 'Open violations', count: open.length, items: open.map(violationRow) } : null,
    approvals.length ? { id: 'hoa-approvals', title: 'Approval requests', count: approvals.length, items: approvals.map(approvalRow) } : null,
    past.length ? { id: 'hoa-past-violations', title: 'Past violations', count: past.length, items: past.map(violationRow) } : null,
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'hoa-compliance-summary',
    title: association ? association.name : 'HOA records',
    body: [
      association?.managementCompany ? `Managed by ${association.managementCompany}.` : null,
      association ? dues : 'No association details are recorded yet.',
      approvals.length ? `${approvals.length} approval request${approvals.length === 1 ? '' : 's'}: ${associationApproved} approved by the association, ${awaiting} awaiting a decision.` : null,
      open.length ? `${open.length} open violation${open.length === 1 ? '' : 's'}.` : 'No open violations.',
    ].filter(Boolean).join(' '),
    tone: open.length ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  if (sections.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'hoa-compliance-items', title: 'HOA records',
      description: 'Open a violation for its guidance and next steps, or HOA Compliance to update a request.',
      sections, actions: [],
    });
  }
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'HOA_COMPLIANCE_READY', blocks, suggestions: ['Is my renovation ready to start?'] };
}

async function hoaComplianceResult(propertyId: string): Promise<AskOperationResult> {
  const [association, approvals, violations] = await Promise.all([
    hoaComplianceService.getAssociation(propertyId),
    hoaComplianceService.listApprovalRecords(propertyId),
    hoaComplianceService.listViolations(propertyId),
  ]);
  return hoaComplianceFromView({ association, approvals, violations }, propertyId);
}

registerCapabilityHandler('hoa-compliance.status', async (envelope) => hoaComplianceResult(envelope.propertyId!));
