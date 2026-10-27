// The findings of one confirmed inspection report, with the decisions each allows (register P2 "Inspection Hub"; FRD v1.340). A read launched from a
// report row. The decisions themselves are INSPECTION_FINDING_DECISION_COMMAND (inspectionFindingDecisionCommands.handler.ts).
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { INSPECTION_REPORT_ENTITY_TYPE, INSPECTION_REPORT_TYPE_LABELS } from '../support/inspectionReportCommand';
import {
  INSPECTION_FINDING_DECISION_ACTION_IDS, INSPECTION_FINDING_DECISION_MESSAGES, INSPECTION_FINDING_ENTITY_TYPE, INSPECTION_FINDINGS_OF_REPORT_MESSAGE, INSPECTION_FIX_DISCLOSE_LABELS,
  inspectionFindingDecisionKinds, parseFixDisclosure, type InspectionFindingDecisionKind,
} from '../support/inspectionFindingDecisionCommand';
import { collectionDescriptor } from '../support/collectionDescriptor';

const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const SEVERITY_LABELS: Record<string, string> = { SAFETY: 'Safety', MAJOR: 'Major', MINOR: 'Minor', MONITOR: 'Monitor', INFORMATIONAL: 'Informational' };
const STATUS_LABELS: Record<string, string> = { OPEN: 'Open', ACCEPTED_AS_IS: 'Accepted as is', RESOLVED: 'Resolved', DISMISSED: 'Dismissed' };
const DISPOSITION_LABELS: Record<string, string> = { ACCEPTED: 'Tracked as work', MONITOR: 'Being monitored', DUPLICATE: 'Duplicate', ALREADY_RESOLVED: 'Already resolved', NOT_APPLICABLE: 'Not applicable', CORRECTION_REQUESTED: 'Correction requested' };
const DECISION_BUTTONS: Record<InspectionFindingDecisionKind, { label: string; style: 'PRIMARY' | 'SECONDARY' | 'QUIET' }> = {
  MONITOR: { label: 'Keep an eye on it', style: 'SECONDARY' },
  ALREADY_RESOLVED: { label: 'Already resolved', style: 'QUIET' },
  NOT_APPLICABLE: { label: 'Not applicable', style: 'QUIET' },
  DUPLICATE: { label: 'Duplicate', style: 'QUIET' },
  EDIT: { label: 'Edit details', style: 'SECONDARY' },
  CORRECT: { label: 'Correct extraction', style: 'QUIET' },
  FIX: { label: 'Plan to fix', style: 'SECONDARY' },
  DISCLOSE_PRICE_ADJUST: { label: 'Disclose with a price adjustment', style: 'QUIET' },
  DISCLOSE_CREDIT: { label: 'Disclose with a credit', style: 'QUIET' },
};
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export interface FindingRow {
  id: string; homeSystem: string; subsystem: string | null; severity: string; inspectorDescription: string; status: string; workDisposition: string;
  resolutionNotes: string | null; estimatedCostCentsLow: number | null; estimatedCostCentsHigh: number | null;
}

export function inspectionReportFindingsFromRows(
  report: { reportType: string; status: string; inspectionDate: Date }, findings: FindingRow[], canChange: boolean, sourceTotal = findings.length,
): AskOperationResult {
  const type = INSPECTION_REPORT_TYPE_LABELS[report.reportType] ?? 'Inspection';
  const when = humanDate(report.inspectionDate) ?? 'undated';
  if (findings.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'INSPECTION_REPORT_NO_FINDINGS',
      blocks: [{ type: 'EMPTY_STATE', id: 'inspection-report-findings-empty', title: 'No findings in this report', body: `${type}, ${when}, has no findings listed.`, actions: [reportsAction] }], suggestions: [],
    };
  }
  const row = (finding: FindingRow) => {
    const plan = parseFixDisclosure(finding.resolutionNotes);
    const description = [
      finding.inspectorDescription,
      plan ? `Plan: ${INSPECTION_FIX_DISCLOSE_LABELS[plan.decision] ?? plan.decision}${plan.estimatedFixCostCents ? `, about ${dollars(plan.estimatedFixCostCents)} to fix` : ''}.` : null,
    ].filter(Boolean).join(' ');
    const low = finding.estimatedCostCentsLow;
    const high = finding.estimatedCostCentsHigh;
    const cost = low != null && high != null ? (low === high ? `Est. ${dollars(low)}` : `Est. ${dollars(low)} to ${dollars(high)}`) : null;
    const meta = [SEVERITY_LABELS[finding.severity] ?? finding.severity, cost, DISPOSITION_LABELS[finding.workDisposition] ?? null].filter((value): value is string => Boolean(value));
    return {
      id: finding.id, title: `${finding.homeSystem}${finding.subsystem ? `: ${finding.subsystem}` : ''}`, description, meta, status: STATUS_LABELS[finding.status] ?? finding.status, href: null,
      entityType: INSPECTION_FINDING_ENTITY_TYPE,
      actions: canChange ? inspectionFindingDecisionKinds(report, finding).map((kind) => ({
        id: INSPECTION_FINDING_DECISION_ACTION_IDS[kind], label: DECISION_BUTTONS[kind].label, message: INSPECTION_FINDING_DECISION_MESSAGES[kind],
        interactionType: 'MUTATE_RECORD' as const, operationId: 'INSPECTION_FINDING_DECISION_COMMAND' as const, style: DECISION_BUTTONS[kind].style,
      })) : [],
    };
  };
  const open = findings.filter((f) => f.status === 'OPEN' || f.status === 'ACCEPTED_AS_IS');
  const closed = findings.filter((f) => f.status !== 'OPEN' && f.status !== 'ACCEPTED_AS_IS');
  const sections = [
    ...(open.length ? [{ id: 'inspection-report-findings-open', title: 'Still open', count: open.length, items: open.map(row) }] : []),
    ...(closed.length ? [{ id: 'inspection-report-findings-closed', title: 'Resolved or dismissed', count: closed.length, items: closed.map(row) }] : []),
  ];
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'inspection-report-findings-summary', title: `${type}, ${when}`,
      body: `${findings.length} finding${findings.length === 1 ? '' : 's'}, ${open.length} still open.${report.status === 'REVIEW_PENDING' ? ' This report is not confirmed yet; you can correct a finding’s details before you confirm it.' : report.reportType === 'PRE_LISTING' ? ' Because this is a pre-listing report, you can record whether you plan to fix or disclose each one.' : ''}`,
      tone: 'DEFAULT', actions: [reportsAction],
    },
    { type: 'GROUPED_LIST', filters: [], id: 'inspection-report-findings', title: 'Findings', description: 'Most serious first.', sections,
      collection: collectionDescriptor({ sourceTotal, fetchedCount: findings.length, sections, nextPageAvailable: false }), actions: [] },
  ];
  return { status: 'ANSWERED', reasonCode: 'INSPECTION_REPORT_FINDINGS_FOUND', blocks, suggestions: [] };
}

registerCapabilityHandler('inspection-report-findings.view', async (envelope, deps) => {
  const launch = envelope.launchContext;
  const notFound = (reasonCode: string, title: string, body: string): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-report-findings-unavailable', title, body, tone: 'DEFAULT', actions: [reportsAction] }], suggestions: [],
  });
  if (envelope.message !== INSPECTION_FINDINGS_OF_REPORT_MESSAGE || launch?.entityType !== INSPECTION_REPORT_ENTITY_TYPE || !launch.entityId) {
    return notFound('INSPECTION_REPORT_TARGET_REQUIRED', 'Choose a report first', 'A report’s findings are opened from your inspection reports. Nothing has changed.');
  }
  const propertyId = envelope.propertyId!;
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, propertyId));
  const report = await (prisma as any).inspectionReport.findFirst({ where: { id: launch.entityId, propertyId }, select: { id: true, reportType: true, status: true, inspectionDate: true } });
  if (!report) return notFound('INSPECTION_REPORT_NOT_FOUND', 'That report is no longer available', 'Ask could not find that inspection report.');
  if (report.status !== 'CONFIRMED' && report.status !== 'REVIEW_PENDING') return notFound('INSPECTION_REPORT_NOT_CONFIRMED', 'Review the report first', 'A report’s findings are listed once it has been analyzed and is ready for your review.');
  const where = { reportId: report.id };
  const [findings, sourceTotal] = await Promise.all([
    (prisma as any).inspectionFinding.findMany({
      where, orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }], take: 50,
      select: { id: true, homeSystem: true, subsystem: true, severity: true, inspectorDescription: true, status: true, workDisposition: true, resolutionNotes: true, estimatedCostCentsLow: true, estimatedCostCentsHigh: true },
    }),
    (prisma as any).inspectionFinding.count({ where }),
  ]);
  return inspectionReportFindingsFromRows(report, findings as FindingRow[], access.role !== HouseholdRole.VIEWER, sourceTotal);
});
