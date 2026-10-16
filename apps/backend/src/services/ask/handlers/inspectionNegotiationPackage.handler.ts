// A negotiation package from a confirmed pre-purchase inspection report (register P2 "Inspection Hub"; FRD v1.341). Reached only by the declared action on
// a report row. One choice per open finding (ask for a credit, request a repair, accept as is), then InspectionHubService.generateNegotiationPackage, the
// page's own pure calculation. Nothing is saved or sent, which is also what the route does, so there is no confirmation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import * as hubService from '../../inspectionHub.service';
import {
  INSPECTION_REPORT_ENTITY_TYPE, NEGOTIATION_DECISION_LABELS, NEGOTIATION_DECISIONS, NEGOTIATION_MAX_FINDINGS, NEGOTIATION_PACKAGE_CAPTURE_KEY, NEGOTIATION_PACKAGE_MESSAGE,
  inspectionReportNegotiationEligible, negotiationFieldKey, parseNegotiationAnswer,
} from '../support/inspectionReportCommand';
import { collectionDescriptor } from '../support/collectionDescriptor';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const stop = (status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string, title: string, body: string): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-negotiation-unavailable', title, body, tone: status === 'BLOCKED' ? 'CAUTION' : 'DEFAULT', actions: [reportsAction] }], suggestions: [],
});
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const clip = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

interface OpenFinding { id: string; homeSystem: string; subsystem: string | null; severity: string; inspectorDescription: string; updatedAt: Date }

export const negotiationVersion = (reportId: string, findings: ReadonlyArray<{ id: string; updatedAt: Date }>) =>
  sha(`inspection-negotiation:${reportId}:${findings.map((f) => `${f.id}:${f.updatedAt.toISOString()}`).join('|')}`);

function captureRequest(contextVersion: string, findings: OpenFinding[], entered?: Record<string, unknown>): AskCaptureRequest {
  const options = NEGOTIATION_DECISIONS.map((value) => ({ label: NEGOTIATION_DECISION_LABELS[value], value }));
  return {
    requirementId: 'inspection-negotiation-inputs', captureKey: NEGOTIATION_PACKAGE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'What do you want to do about each finding?', question: 'Choose one for every open finding.',
    helpText: 'This builds a summary for your own negotiation. Nothing is saved or sent to anyone.',
    inputSchema: {
      type: 'GROUP',
      fields: findings.map((finding, index) => ({
        key: negotiationFieldKey(index), label: `${finding.severity.toLowerCase()}: ${finding.homeSystem}${finding.subsystem ? ` / ${finding.subsystem}` : ''} — ${clip(finding.inspectorDescription)}`,
        required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options },
      })),
    } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? Object.fromEntries(findings.map((_, index) => [negotiationFieldKey(index), 'accept_as_is'])),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to build this summary; nothing is saved', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function negotiationPackageResult(
  userId: string, propertyId: string,
  launch: { entityId: string; sourceExecutionId: string | null },
  submitted?: { answer: Record<string, unknown>; expectedContextVersion: string; findingIds: string[] },
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return stop('BLOCKED', 'ASK_PERMISSION_REQUIRED', 'A contributor or owner can build a negotiation package', 'Your role can view this home but not change it. Nothing has changed.');
  const report = await (prisma as any).inspectionReport.findFirst({ where: { id: launch.entityId, propertyId }, select: { id: true, reportType: true, status: true, inspectionDate: true } });
  if (!report) return stop('NOT_APPLICABLE', 'INSPECTION_REPORT_NOT_FOUND', 'That report is no longer available', 'Ask could not find that inspection report.');
  if (!inspectionReportNegotiationEligible(report)) {
    return stop('NOT_APPLICABLE', 'INSPECTION_NEGOTIATION_NOT_AVAILABLE', 'A negotiation package needs a confirmed pre-purchase report', 'Nothing has changed.');
  }
  const where = { reportId: report.id, propertyId, status: 'OPEN' };
  const [findings, sourceTotal] = await Promise.all([
    (prisma as any).inspectionFinding.findMany({
      where, orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }], take: NEGOTIATION_MAX_FINDINGS,
      select: { id: true, homeSystem: true, subsystem: true, severity: true, inspectorDescription: true, updatedAt: true },
    }) as Promise<OpenFinding[]>,
    (prisma as any).inspectionFinding.count({ where }),
  ]);
  if (findings.length === 0) {
    return { status: 'ANSWERED', reasonCode: 'INSPECTION_NEGOTIATION_NO_OPEN_FINDINGS', blocks: [{ type: 'EMPTY_STATE', id: 'inspection-negotiation-empty', title: 'No open findings to negotiate', body: 'Every finding in this report has been decided. Nothing has changed.', actions: [reportsAction] }], suggestions: [] };
  }
  const contextVersion = negotiationVersion(report.id, findings);
  const formResult = (note?: string, entered?: Record<string, unknown>): AskOperationResult => ({
    status: 'NEEDS_CONTEXT', reasonCode: 'INSPECTION_NEGOTIATION_INPUT_REQUIRED', contextVersion,
    parameters: { negotiationLaunch: { entityId: report.id, findingIds: findings.map((f) => f.id), sourceExecutionId: launch.sourceExecutionId } },
    blocks: [{
      type: 'SUMMARY', id: 'inspection-negotiation-input', title: `Negotiation package, ${humanDate(report.inspectionDate) ?? 'undated'}`,
      body: note ?? `${sourceTotal} open finding${sourceTotal === 1 ? '' : 's'}${sourceTotal > findings.length ? ` (showing the ${findings.length} most serious)` : ''}. Nothing is saved or sent.`, tone: note ? 'CAUTION' : 'DEFAULT', actions: [],
    }],
    captureRequests: [captureRequest(contextVersion, findings, entered)], suggestions: [],
  });
  if (!submitted) return formResult();
  if (submitted.expectedContextVersion !== contextVersion || submitted.findingIds.join('|') !== findings.map((f) => f.id).join('|')) {
    return formResult('The findings changed while this form was open. Choose again.');
  }
  const parsed = parseNegotiationAnswer(submitted.answer, findings.length);
  if (!parsed.success) return formResult('Choose one option for every finding.', submitted.answer);
  const decisions: Record<string, (typeof NEGOTIATION_DECISIONS)[number]> = {};
  findings.forEach((finding, index) => { decisions[finding.id] = parsed.decisions[index]; });
  const pkg = await hubService.generateNegotiationPackage(report.id, propertyId, findings.map((f) => f.id), decisions);
  type Item = { findingId: string; homeSystem: string; subsystem: string | null; severity: string; inspectorDescription: string; estimatedCostCentsLow: number | null; estimatedCostCentsHigh: number | null };
  const row = (item: Item, status: string) => {
    const low = item.estimatedCostCentsLow; const high = item.estimatedCostCentsHigh;
    const cost = low != null && high != null ? (low === high ? `Est. ${dollars(low)}` : `Est. ${dollars(low)} to ${dollars(high)}`) : null;
    return { id: item.findingId, title: `${item.homeSystem}${item.subsystem ? `: ${item.subsystem}` : ''}`, description: item.inspectorDescription, meta: [item.severity.toLowerCase(), cost].filter((v): v is string => Boolean(v)), status, href: null, entityType: 'INSPECTION_FINDING', actions: [] as never[] };
  };
  const credit = pkg.negotiateCredit as Item[]; const repair = pkg.requestRepair as Item[]; const asIs = pkg.acceptAsIs as Item[];
  const section = (id: string, title: string, items: Item[], status: string) => (items.length ? [{ id, title, count: items.length, items: items.map((i) => row(i, status)) }] : []);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'inspection-negotiation-summary', title: `Credit to ask for: about ${dollars(pkg.requestedCreditTotalCents)}`,
    body: `${credit.length} finding${credit.length === 1 ? '' : 's'} for a credit (the middle of each estimate), ${repair.length} for repair, ${asIs.length} accepted as is. This is a summary for your own negotiation. Nothing was saved or sent, and an estimate is not a quote.`,
    tone: 'DEFAULT', actions: [reportsAction],
  }];
  const sections = [...section('credit', 'Ask for a credit', credit, 'Credit'), ...section('repair', 'Request a repair', repair, 'Repair'), ...section('as-is', 'Accept as is', asIs, 'As is')];
  if (sections.length) blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'inspection-negotiation-lists', title: 'Your package', description: null, sections,
    collection: collectionDescriptor({ sourceTotal, fetchedCount: findings.length, sections, nextPageAvailable: false }), actions: [] });
  return { status: 'ANSWERED', reasonCode: 'INSPECTION_NEGOTIATION_PACKAGE_READY', contextVersion, blocks, suggestions: [] };
}

registerCapabilityHandler('inspection-negotiation-package.build', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== NEGOTIATION_PACKAGE_MESSAGE || launch?.operationId !== 'INSPECTION_NEGOTIATION_PACKAGE' || launch.surface === 'ASK_REFRESH'
    || launch.entityType !== INSPECTION_REPORT_ENTITY_TYPE || !launch.entityId) {
    return stop('NOT_APPLICABLE', 'ASK_INSPECTION_NEGOTIATION_NOT_DIRECTLY_ROUTABLE', 'Open your inspection reports first', 'A negotiation package is built from a pre-purchase report in your list. Nothing has changed.');
  }
  return negotiationPackageResult(envelope.userId, envelope.propertyId!, { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});
