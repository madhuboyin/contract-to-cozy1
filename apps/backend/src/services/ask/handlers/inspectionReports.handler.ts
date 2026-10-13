// Inspection reports inside Ask (register P2 "Inspection Hub"; FRD v1.339). Two reads. INSPECTION_REPORTS lists the home's reports with their state and the
// next step for each; INSPECTION_REPORT_COMPARE compares a confirmed report with the confirmed one before it, with the page's own comparison.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import * as hubService from '../../inspectionHub.service';
import {
  INSPECTION_REPORT_ACTION_IDS, INSPECTION_REPORT_ENTITY_TYPE, INSPECTION_REPORT_MESSAGES, INSPECTION_REPORT_STATUS_LABELS, INSPECTION_REPORT_TYPE_LABELS,
  inspectionReportCanConfirm, previousConfirmedReportId, inspectionReportNegotiationEligible, NEGOTIATION_PACKAGE_ACTION_ID, NEGOTIATION_PACKAGE_MESSAGE,
} from '../support/inspectionReportCommand';
import { INSPECTION_FINDINGS_OF_REPORT_ACTION_ID, INSPECTION_FINDINGS_OF_REPORT_MESSAGE } from '../support/inspectionFindingDecisionCommand';

const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-report-unavailable', title, body, tone: 'DEFAULT', actions: [reportsAction] }], suggestions: [],
});
const dateOf = (value: Date | null | undefined) => (value ? humanDate(value) ?? null : null);

interface ReportRow {
  id: string; reportType: string; inspectionDate: Date; inspectorName: string | null; inspectorCompany: string | null; status: string;
  totalFindings: number; openFindings: number; safetyFindings: number; majorFindings: number;
}

export function inspectionReportsFromRows(rows: ReportRow[], canChange: boolean): AskOperationResult {
  const reports = rows.filter((row) => row.status !== 'ARCHIVED');
  if (reports.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'NO_INSPECTION_REPORTS',
      blocks: [{ type: 'EMPTY_STATE', id: 'inspection-reports-empty', title: 'No inspection reports yet', body: 'No inspection report has been added for this home. A report is read and its findings are listed here once it has been uploaded.', actions: [] }],
      suggestions: [],
    };
  }
  const waiting = reports.filter((row) => inspectionReportCanConfirm(row.status)).length;
  const rowFor = (row: ReportRow) => {
    const type = INSPECTION_REPORT_TYPE_LABELS[row.reportType] ?? 'Inspection';
    const meta = [dateOf(row.inspectionDate), row.inspectorName ?? row.inspectorCompany].filter((value): value is string => Boolean(value));
    const counts = row.status === 'PROCESSING' ? null : `${row.totalFindings} finding${row.totalFindings === 1 ? '' : 's'}${row.openFindings ? `, ${row.openFindings} open` : ''}${row.safetyFindings ? `, ${row.safetyFindings} safety` : ''}`;
    const actions = [
      ...(canChange && inspectionReportCanConfirm(row.status) ? [{
        id: INSPECTION_REPORT_ACTION_IDS.CONFIRM, label: 'Review and confirm', message: INSPECTION_REPORT_MESSAGES.CONFIRM,
        interactionType: 'MUTATE_RECORD' as const, operationId: 'INSPECTION_REPORT_COMMAND' as const, style: 'PRIMARY' as const,
      }] : []),
      ...(canChange && inspectionReportNegotiationEligible(row) ? [{
        id: NEGOTIATION_PACKAGE_ACTION_ID, label: 'Build a negotiation package', message: NEGOTIATION_PACKAGE_MESSAGE,
        interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'INSPECTION_NEGOTIATION_PACKAGE' as const, style: 'SECONDARY' as const,
      }] : []),
      ...(row.status === 'CONFIRMED' ? [{
        id: INSPECTION_FINDINGS_OF_REPORT_ACTION_ID, label: 'See its findings', message: INSPECTION_FINDINGS_OF_REPORT_MESSAGE,
        interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'INSPECTION_REPORT_FINDINGS' as const, style: 'SECONDARY' as const,
      }] : []),
      ...(previousConfirmedReportId(reports, row.id) ? [{
        id: INSPECTION_REPORT_ACTION_IDS.COMPARE, label: 'Compare with the previous report', message: INSPECTION_REPORT_MESSAGES.COMPARE,
        interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'INSPECTION_REPORT_COMPARE' as const, style: 'SECONDARY' as const,
      }] : []),
    ];
    return {
      id: row.id, title: type, description: counts, meta, status: INSPECTION_REPORT_STATUS_LABELS[row.status] ?? row.status, href: null,
      entityType: INSPECTION_REPORT_ENTITY_TYPE, actions,
    };
  };
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'inspection-reports-summary', title: `${reports.length} inspection report${reports.length === 1 ? '' : 's'}`,
      body: waiting
        ? `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting for your review. A report's findings are trusted, and written back to the home, only after you confirm it.`
        : 'Confirmed reports feed your open findings. Adding a new report is done where reports are uploaded.',
      tone: 'DEFAULT', actions: [],
    },
    { type: 'GROUPED_LIST', filters: [], id: 'inspection-reports', title: 'Reports', description: 'Newest first.', sections: [{ id: 'inspection-reports-all', title: 'Inspection reports', count: reports.length, items: reports.map(rowFor) }], actions: [] },
  ];
  return { status: 'ANSWERED', reasonCode: 'INSPECTION_REPORTS_FOUND', blocks, suggestions: [] };
}

registerCapabilityHandler('inspection-reports.list', async (envelope, deps) => {
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const rows = await (prisma as any).inspectionReport.findMany({
    where: { propertyId: envelope.propertyId!, status: { not: 'ARCHIVED' } }, orderBy: { inspectionDate: 'desc' }, take: 25,
    select: { id: true, reportType: true, inspectionDate: true, inspectorName: true, inspectorCompany: true, status: true, totalFindings: true, openFindings: true, safetyFindings: true, majorFindings: true },
  });
  return inspectionReportsFromRows(rows as ReportRow[], access.role !== HouseholdRole.VIEWER);
});

// ── compare ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Finding = { id: string; homeSystem: string; subsystem: string | null; severity: string; inspectorDescription: string };
const findingRow = (finding: Finding, status: string) => ({
  id: finding.id, title: `${finding.homeSystem}${finding.subsystem ? `: ${finding.subsystem}` : ''}`, description: finding.inspectorDescription, meta: [finding.severity.toLowerCase()],
  status, href: null, entityType: 'INSPECTION_FINDING', actions: [] as never[],
});

export function inspectionComparisonResult(comparison: {
  reportA: { reportType: string; inspectionDate: Date }; reportB: { reportType: string; inspectionDate: Date };
  resolved: Finding[]; persisted: Finding[]; newFindings: Finding[]; worsened: Array<{ a: Finding; b: Finding }>;
}): AskOperationResult {
  const label = (r: { reportType: string; inspectionDate: Date }) => `${INSPECTION_REPORT_TYPE_LABELS[r.reportType] ?? 'Inspection'}, ${dateOf(r.inspectionDate) ?? 'undated'}`;
  const section = (id: string, title: string, rows: ReturnType<typeof findingRow>[]) => (rows.length ? [{ id, title, count: rows.length, items: rows }] : []);
  const sections = [
    ...section('worsened', 'Got worse', comparison.worsened.map(({ b }) => findingRow(b, 'Worse'))),
    ...section('new', 'New since the earlier report', comparison.newFindings.map((f) => findingRow(f, 'New'))),
    ...section('persisted', 'Still open', comparison.persisted.map((f) => findingRow(f, 'Open'))),
    ...section('resolved', 'Resolved', comparison.resolved.map((f) => findingRow(f, 'Resolved'))),
  ];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'inspection-comparison-summary', title: 'What changed between the two reports',
    body: `${label(comparison.reportB)} compared with ${label(comparison.reportA)}: ${comparison.resolved.length} resolved, ${comparison.persisted.length} still open, ${comparison.newFindings.length} new, ${comparison.worsened.length} worse. The earlier report is the one before it; comparing other pairs is not available in Ask yet.`,
    tone: comparison.worsened.length || comparison.newFindings.length ? 'CAUTION' : 'DEFAULT', actions: [reportsAction],
  }];
  if (sections.length) blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'inspection-comparison', title: 'By outcome', description: null, sections, actions: [] });
  return { status: 'ANSWERED', reasonCode: 'INSPECTION_REPORTS_COMPARED', blocks, suggestions: [] };
}

registerCapabilityHandler('inspection-report-compare.view', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== INSPECTION_REPORT_MESSAGES.COMPARE || launch?.entityType !== INSPECTION_REPORT_ENTITY_TYPE || !launch.entityId) {
    return unavailable('INSPECTION_REPORT_TARGET_REQUIRED', 'Choose a report first', 'A comparison is opened from a report in your inspection reports. Nothing has changed.');
  }
  const propertyId = envelope.propertyId!;
  await ensurePropertyAccess(envelope.userId, propertyId);
  const reports = await (prisma as any).inspectionReport.findMany({ where: { propertyId, status: 'CONFIRMED' }, select: { id: true, status: true, inspectionDate: true } });
  const earlier = previousConfirmedReportId(reports, launch.entityId);
  if (!earlier) return unavailable('INSPECTION_REPORT_NO_EARLIER_REPORT', 'There is no earlier confirmed report to compare with', 'A comparison needs two confirmed reports. Nothing has changed.');
  const comparison = await hubService.compareReports(propertyId, earlier, launch.entityId);
  return inspectionComparisonResult(comparison as never);
});
