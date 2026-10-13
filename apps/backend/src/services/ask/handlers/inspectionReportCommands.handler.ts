// Review and confirm an inspection report inside Ask (register P2 "Inspection Hub"; FRD v1.339). Reached only by the declared Review and confirm action
// on a report waiting for review. The review shows what confirming does, from the page's own write-back preview; the confirmation runs applyWriteBacks,
// the confirm route's own call. Confirming makes the report's findings trusted and turns actionable findings into candidate work. It accepts no work.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { applyWriteBacks, getWriteBackPreview } from '../../inspectionWriteBack.service';
import { archiveReport } from '../../inspectionHub.service';
import {
  INSPECTION_REPORT_ENTITY_TYPE, INSPECTION_REPORT_MESSAGES, INSPECTION_REPORT_TYPE_LABELS, inspectionReportCanArchive, inspectionReportCanConfirm, inspectionReportKindFromMessage,
  type InspectionReportKind,
} from '../support/inspectionReportCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-report-command-unavailable', title, body, tone: 'DEFAULT', actions: [reportsAction] }], suggestions: [],
});

async function loadReport(propertyId: string, reportId: string) {
  return (prisma as any).inspectionReport.findFirst({
    where: { id: reportId, propertyId },
    select: { id: true, reportType: true, inspectionDate: true, inspectorName: true, status: true, updatedAt: true },
  }) as Promise<{ id: string; reportType: string; inspectionDate: Date; inspectorName: string | null; status: string; updatedAt: Date } | null>;
}
async function reviewFindings(reportId: string) {
  return (prisma as any).inspectionFinding.findMany({
    where: { reportId, status: { in: ['OPEN', 'ACCEPTED_AS_IS'] } }, orderBy: { id: 'asc' }, select: { id: true, severity: true, status: true, updatedAt: true },
  }) as Promise<Array<{ id: string; severity: string; status: string; updatedAt: Date }>>;
}
const reportVersion = (report: { id: string; status: string; updatedAt: Date }, findings: Array<{ id: string; status: string; updatedAt: Date }>) =>
  sha(`inspection-report:${report.id}:${report.status}:${report.updatedAt.toISOString()}:${findings.map((f) => `${f.id}:${f.status}:${f.updatedAt.toISOString()}`).join('|')}`);

export async function inspectionReportCommandResult(
  userId: string, propertyId: string, launch: { entityId: string; sourceExecutionId: string | null; kind?: 'CONFIRM' | 'ARCHIVE' },
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'inspection-report-permission', title: 'A contributor or owner can confirm a report', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const report = await loadReport(propertyId, launch.entityId);
  if (!report) return unavailable('INSPECTION_REPORT_NOT_FOUND', 'That report is no longer available', 'Ask could not find that inspection report. Nothing has changed.');
  if (launch.kind === 'ARCHIVE') return archiveReview(report, propertyId, launch.sourceExecutionId);
  if (!inspectionReportCanConfirm(report.status)) {
    return unavailable('INSPECTION_REPORT_NOT_REVIEWABLE', report.status === 'CONFIRMED' ? 'That report is already confirmed' : 'That report is not ready to confirm',
      report.status === 'PROCESSING' ? 'It is still being read. Nothing has changed.' : 'Nothing has changed.');
  }
  const [findings, preview] = await Promise.all([reviewFindings(report.id), getWriteBackPreview(report.id, propertyId)]);
  const contextVersion = reportVersion(report, findings);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const bySeverity = (severity: string) => findings.filter((f) => f.severity === severity).length;
  const typeLabel = INSPECTION_REPORT_TYPE_LABELS[report.reportType] ?? 'Inspection';
  const when = humanDate(report.inspectionDate) ?? 'undated';
  const writes = [
    { label: 'Home condition records', value: `${preview.digitalTwinUpdates} updated` },
    { label: 'Possible permit flags', value: `${preview.permitFlagsToCreate} added` },
    { label: 'Possible coverage gaps', value: `${preview.coverageGapsToFlag} flagged` },
  ];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_REPORT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      inspectionReportCommand: { kind: 'CONFIRM', entityId: report.id }, inspectionReportContextVersion: contextVersion,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'inspection-report-review', title: `${typeLabel}, ${when}`,
      body: `${findings.length} finding${findings.length === 1 ? '' : 's'} will be trusted: ${bySeverity('SAFETY')} safety, ${bySeverity('MAJOR')} major, ${bySeverity('MINOR')} minor. Nothing changes until you confirm.`,
      tone: bySeverity('SAFETY') ? 'CAUTION' : 'DEFAULT', actions: [],
    }],
    confirmation: {
      confirmationId: `inspection-report-confirm-${sha(report.id).slice(0, 12)}-1`, version: 1, title: 'Confirm this inspection report?',
      description: 'Confirming makes the report’s findings trusted across your home, updates the home’s condition records, flags possible permit and coverage issues, and turns actionable findings into candidate work for you to accept or dismiss. It accepts no work, contacts nobody, and cannot be undone here.',
      fields: [{ label: 'Report', value: `${typeLabel}, ${when}` }, { label: 'Findings to trust', value: String(findings.length) }, ...writes],
      editableFields: [], confirmLabel: 'Confirm the report',
      consentText: 'I have reviewed this inspection report and authorize these changes to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function archiveReview(report: { id: string; reportType: string; inspectionDate: Date; status: string; updatedAt: Date }, propertyId: string, sourceExecutionId: string | null): Promise<AskOperationResult> {
  if (!inspectionReportCanArchive(report.status)) {
    return unavailable('INSPECTION_REPORT_NOT_ARCHIVABLE', report.status === 'ARCHIVED' ? 'That report is already archived' : 'That report is still being read',
      report.status === 'PROCESSING' ? 'Wait until it has been read. Nothing has changed.' : 'Nothing has changed.');
  }
  const [open, findings] = await Promise.all([
    (prisma as any).inspectionFinding.count({ where: { reportId: report.id, status: 'OPEN' } }) as Promise<number>,
    reviewFindings(report.id),
  ]);
  const contextVersion = reportVersion(report, findings);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const typeLabel = INSPECTION_REPORT_TYPE_LABELS[report.reportType] ?? 'Inspection';
  const when = humanDate(report.inspectionDate) ?? 'undated';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_REPORT_ARCHIVE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      inspectionReportCommand: { kind: 'ARCHIVE', entityId: report.id }, inspectionReportContextVersion: contextVersion,
      sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'inspection-report-archive-review', title: `Archive ${typeLabel}, ${when}?`, body: 'Nothing changes until you confirm.', tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `inspection-report-archive-${sha(report.id).slice(0, 12)}-1`, version: 1, title: 'Archive this inspection report?',
      description: `Archiving removes the report from your inspection reports and from the counts that include it. Its ${open} open finding${open === 1 ? '' : 's'} stay on file but you will not see the report here again, and Ask cannot restore it. Nothing is deleted and nobody is contacted.`,
      fields: [{ label: 'Report', value: `${typeLabel}, ${when}` }, { label: 'Status', value: report.status === 'CONFIRMED' ? 'Confirmed' : 'Waiting for review' }, { label: 'Open findings', value: String(open) }],
      editableFields: [], confirmLabel: 'Archive the report',
      consentText: 'I understand this report will no longer be listed and Ask cannot restore it.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('inspection-report.command', async (envelope) => {
  const launch = envelope.launchContext;
  const messageKind: InspectionReportKind | null = inspectionReportKindFromMessage(envelope.message);
  if (!messageKind || (messageKind !== 'CONFIRM' && messageKind !== 'ARCHIVE') || launch?.operationId !== 'INSPECTION_REPORT_COMMAND'
    || launch.surface === 'ASK_REFRESH' || launch.entityType !== INSPECTION_REPORT_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_INSPECTION_REPORT_NOT_DIRECTLY_ROUTABLE', 'Open your inspection reports first', 'A report is confirmed from your list of inspection reports. Nothing has changed.');
  }
  return inspectionReportCommandResult(envelope.userId, envelope.propertyId!, { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null, kind: messageKind });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmInspectionReport(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.inspectionReportCommand as { kind?: unknown; entityId?: unknown } | undefined;
  if ((command?.kind !== 'CONFIRM' && command?.kind !== 'ARCHIVE') || typeof command.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let written = 0;
  const archiving = command.kind === 'ARCHIVE';
  try {
    const report = await loadReport(propertyId, command.entityId);
    if (!report) throw stale('That report is no longer available.');
    if (archiving ? !inspectionReportCanArchive(report.status) : !inspectionReportCanConfirm(report.status)) throw stale(archiving ? 'That report can no longer be archived.' : 'That report is no longer waiting for review.');
    const findings = await reviewFindings(report.id);
    if (parameters.inspectionReportContextVersion !== reportVersion(report, findings)) throw stale('This report changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (archiving) await archiveReport(report.id, propertyId);
    else written = (await applyWriteBacks(report.id, propertyId, userId)).writeBackCount;
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  if (archiving) {
    const archived: AskOperationResult = {
      status: 'COMPLETED', reasonCode: 'INSPECTION_REPORT_ARCHIVED',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `inspection-report-archived-${command.entityId}`, title: 'Inspection report archived', status: 'COMPLETED',
        description: 'It no longer appears in your inspection reports. Nothing was deleted and nobody was contacted.', details: [], actions: [{ ...reportsAction, style: 'PRIMARY' as const }],
      }],
      suggestions: [],
    };
    const archiveRefresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (archiveRefresh.attemptedAndFailed) {
      archived.blocks.push({ type: 'LIMITATION', id: `inspection-report-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The report was archived. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
    }
    return { result: archived, artifactType: 'INSPECTION_REPORT', artifactId: command.entityId, refreshedExecutions: archiveRefresh.refreshedExecutions };
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INSPECTION_REPORT_CONFIRMED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inspection-report-confirmed-${command.entityId}`, title: 'Inspection report confirmed', status: 'COMPLETED',
      description: `Its findings are now trusted${written ? ` and ${written} record${written === 1 ? ' was' : 's were'} written back to the home` : ''}. No work was accepted and nothing was sent.`, details: [],
      actions: [{ id: 'inspection-reports-back', label: 'See my open findings', interactionType: 'START_WORKFLOW' as const, message: 'Show my open inspection findings', operationId: 'INSPECTION_FINDINGS' as const, style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `inspection-report-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The report was confirmed. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'INSPECTION_REPORT', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('inspection-report.command', confirmInspectionReport);
