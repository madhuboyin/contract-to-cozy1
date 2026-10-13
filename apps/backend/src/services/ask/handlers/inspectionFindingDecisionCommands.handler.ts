// Inspection finding decisions inside Ask (register P2 "Inspection Hub"; FRD v1.340). Reached only by the declared decision actions on a finding in a
// confirmed report's findings list. Monitor goes through dispositionFindingAsWork (the route's own call); the seller's fix-or-disclose plan goes through
// saveFixDisclosureDecisions (the route's own call). Both behind a review that shows the finding and what changes, and a confirmation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import * as hubService from '../../inspectionHub.service';
import {
  INSPECTION_FINDING_DECISION_MESSAGES, INSPECTION_FINDING_ENTITY_TYPE, INSPECTION_FIX_DISCLOSE_LABELS, inspectionFindingDecisionKindFromMessage, inspectionFindingDecisionKinds,
  parseFixDisclosure, type InspectionFindingDecisionKind,
} from '../support/inspectionFindingDecisionCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-finding-decision-unavailable', title, body, tone: 'DEFAULT', actions: [reportsAction] }], suggestions: [],
});

interface FindingWithReport {
  id: string; reportId: string; homeSystem: string; subsystem: string | null; inspectorDescription: string; status: string; workDisposition: string;
  resolutionNotes: string | null; updatedAt: Date; report: { status: string; reportType: string };
}
async function loadFinding(propertyId: string, findingId: string) {
  return (prisma as any).inspectionFinding.findFirst({
    where: { id: findingId, propertyId },
    select: { id: true, reportId: true, homeSystem: true, subsystem: true, inspectorDescription: true, status: true, workDisposition: true, resolutionNotes: true, updatedAt: true, report: { select: { status: true, reportType: true } } },
  }) as Promise<FindingWithReport | null>;
}
const findingVersion = (kind: InspectionFindingDecisionKind, f: FindingWithReport) =>
  sha(`inspection-finding-decision:${kind}:${f.id}:${f.status}:${f.workDisposition}:${f.updatedAt.toISOString()}:${sha(f.resolutionNotes ?? '')}:${f.report.status}`);
const titleOf = (f: FindingWithReport) => `${f.homeSystem}${f.subsystem ? `: ${f.subsystem}` : ''}`;

export async function inspectionFindingDecisionResult(userId: string, propertyId: string, launch: { kind: InspectionFindingDecisionKind; entityId: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'inspection-finding-decision-permission', title: 'A contributor or owner can decide on a finding', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const finding = await loadFinding(propertyId, launch.entityId);
  if (!finding) return unavailable('INSPECTION_FINDING_NOT_FOUND', 'That finding is no longer available', 'Ask could not find that inspection finding. Nothing has changed.');
  const kind = launch.kind;
  if (!inspectionFindingDecisionKinds(finding.report, finding).includes(kind)) {
    return unavailable('INSPECTION_FINDING_DECISION_NOT_AVAILABLE', 'That decision is not available now', 'The finding is already decided that way, or its state no longer allows it. Nothing has changed.');
  }
  const contextVersion = findingVersion(kind, finding);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const plan = parseFixDisclosure(finding.resolutionNotes);
  const isMonitor = kind === 'MONITOR';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `INSPECTION_FINDING_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: {
      inspectionFindingDecisionCommand: { kind, entityId: finding.id }, inspectionFindingDecisionContextVersion: contextVersion,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-decision-review', title: titleOf(finding), body: `${finding.inspectorDescription} Nothing changes until you confirm.`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `inspection-finding-decision-${kind.toLowerCase()}-${sha(finding.id).slice(0, 12)}-1`, version: 1,
      title: isMonitor ? 'Keep an eye on this finding?' : `${INSPECTION_FIX_DISCLOSE_LABELS[kind]} for this finding?`,
      description: isMonitor
        ? 'This keeps the finding on your work list as deferred and brings it back for review in about 90 days. It does not accept the work or contact anyone.'
        : 'This records your plan for the sale. It does not contact a buyer, an agent or a contractor, and it keeps an earlier cost estimate and note if you set one.',
      fields: [
        { label: 'Finding', value: titleOf(finding) },
        ...(isMonitor
          ? [{ label: 'Work', value: 'Deferred, review in about 90 days' }]
          : [{ label: 'Plan', value: `${plan ? (INSPECTION_FIX_DISCLOSE_LABELS[plan.decision] ?? plan.decision) : 'None recorded'} → ${INSPECTION_FIX_DISCLOSE_LABELS[kind]}` }]),
      ],
      editableFields: [], confirmLabel: isMonitor ? 'Keep an eye on it' : 'Record the plan',
      consentText: 'I authorize this change to the shared inspection record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('inspection-finding-decision.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = inspectionFindingDecisionKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'INSPECTION_FINDING_DECISION_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== INSPECTION_FINDING_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_INSPECTION_FINDING_DECISION_NOT_DIRECTLY_ROUTABLE', 'Open the report’s findings first', 'A decision is made from a finding in your inspection report. Nothing has changed.');
  }
  return inspectionFindingDecisionResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmInspectionFindingDecision(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.inspectionFindingDecisionCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as InspectionFindingDecisionKind | undefined;
  if (!kind || !(kind in INSPECTION_FINDING_DECISION_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  try {
    const finding = await loadFinding(propertyId, command.entityId);
    if (!finding) throw stale('That finding is no longer available.');
    if (parameters.inspectionFindingDecisionContextVersion !== findingVersion(kind, finding)) throw stale('This finding changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (!inspectionFindingDecisionKinds(finding.report, finding).includes(kind)) throw stale('That decision is not available for this finding now.');
    if (kind === 'MONITOR') {
      await hubService.dispositionFindingAsWork(finding.id, finding.reportId, propertyId, userId, { disposition: 'MONITOR' });
    } else {
      const earlier = parseFixDisclosure(finding.resolutionNotes);
      await hubService.saveFixDisclosureDecisions(finding.reportId, propertyId, [{
        findingId: finding.id, decision: kind,
        ...(earlier?.estimatedFixCostCents !== undefined ? { estimatedFixCostCents: earlier.estimatedFixCostCents } : {}),
        ...(earlier?.sellerNote !== undefined ? { sellerNote: earlier.sellerNote } : {}),
      }]);
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `INSPECTION_FINDING_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inspection-finding-decision-${kind.toLowerCase()}-${command.entityId}`, title: kind === 'MONITOR' ? 'Now keeping an eye on it' : 'Plan recorded', status: 'COMPLETED',
      description: kind === 'MONITOR' ? 'It will come back for review in about 90 days. Nothing was sent to anyone.' : 'It is on the inspection record. Nothing was sent to anyone.', details: [],
      actions: [{ ...reportsAction, label: 'See my inspection reports', style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `inspection-finding-decision-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'INSPECTION_FINDING', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('inspection-finding-decision.command', confirmInspectionFindingDecision);
