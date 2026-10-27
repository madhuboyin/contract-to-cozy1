// Inspection finding decisions inside Ask (register P2 "Inspection Hub"; FRD v1.340). Reached only by the declared decision actions on a finding in a
// confirmed report's findings list. Monitor goes through dispositionFindingAsWork (the route's own call); the seller's fix-or-disclose plan goes through
// saveFixDisclosureDecisions (the route's own call). Both behind a review that shows the finding and what changes, and a confirmation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import * as hubService from '../../inspectionHub.service';
import {
  INSPECTION_FINDING_DECISION_MESSAGES, INSPECTION_FINDING_ENTITY_TYPE, INSPECTION_FIX_DISCLOSE_LABELS, inspectionFindingDecisionKindFromMessage, inspectionFindingDecisionKinds,
  INSPECTION_FINDING_EDIT_CAPTURE_KEY, INSPECTION_HOME_SYSTEMS, INSPECTION_HOME_SYSTEM_LABELS, INSPECTION_SEVERITIES, INSPECTION_SEVERITY_LABELS, InspectionFindingEditSchema,
  isInspectionFindingEditKind, parseFixDisclosure, type InspectionFindingDecisionKind,
} from '../support/inspectionFindingDecisionCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const reportsAction = { id: 'inspection-reports-back', label: 'Back to my inspection reports', interactionType: 'START_WORKFLOW' as const, message: 'Show my inspection reports', operationId: 'INSPECTION_REPORTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'inspection-finding-decision-unavailable', title, body, tone: 'DEFAULT', actions: [reportsAction] }], suggestions: [],
});

interface FindingWithReport {
  id: string; reportId: string; homeSystem: string; subsystem: string | null; inspectorDescription: string; status: string; workDisposition: string; severity: string; aiInterpretation: string | null;
  estimatedCostCentsLow: number | null; estimatedCostCentsHigh: number | null; resolutionNotes: string | null; updatedAt: Date; report: { status: string; reportType: string };
}
async function loadFinding(propertyId: string, findingId: string) {
  return (prisma as any).inspectionFinding.findFirst({
    where: { id: findingId, propertyId },
    select: { id: true, reportId: true, homeSystem: true, subsystem: true, inspectorDescription: true, status: true, workDisposition: true, severity: true, aiInterpretation: true, estimatedCostCentsLow: true, estimatedCostCentsHigh: true, resolutionNotes: true, updatedAt: true, report: { select: { status: true, reportType: true } } },
  }) as Promise<FindingWithReport | null>;
}
const findingVersion = (kind: InspectionFindingDecisionKind, f: FindingWithReport) =>
  sha(`inspection-finding-decision:${kind}:${f.id}:${f.status}:${f.workDisposition}:${f.updatedAt.toISOString()}:${sha(f.resolutionNotes ?? '')}:${f.report.status}`);
const CLOSING_COPY = {
  ALREADY_RESOLVED: { title: 'Mark this finding as already resolved?', confirm: 'Mark as resolved', becomes: 'Resolved, and any work item for it is closed as not needed',
    description: 'This closes the finding as resolved before any work was accepted, and closes the work item Ask created for it, if there is one. It records the change on the inspection record only and contacts no one.' },
  NOT_APPLICABLE: { title: 'Mark this finding as not applicable?', confirm: 'Mark as not applicable', becomes: 'Dismissed, and any work item for it is closed as not needed',
    description: 'This dismisses the finding as not applying to your home and closes the work item Ask created for it, if there is one. It records the change on the inspection record only and contacts no one.' },
} as const;
const titleOf = (f: FindingWithReport) => `${f.homeSystem}${f.subsystem ? `: ${f.subsystem}` : ''}`;

// ── Edit and correct (FRD v1.446): the page's edit sheet, as a seeded form, a review of exactly what changes, and a confirmation ────────────────────────────────────
const dollars = (cents: number | null) => (cents == null ? 'Not set' : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
/** What the answer changes about the finding, in the service's own units, plus the before and after for the review. Blank or unchanged values are not changes. */
function editChanges(finding: FindingWithReport, answer: { severity?: string; homeSystem?: string; aiInterpretation?: string; costLow?: number; costHigh?: number }) {
  const patch: { severity?: string; homeSystem?: string; aiInterpretation?: string; estimatedCostCentsLow?: number; estimatedCostCentsHigh?: number } = {};
  const rows: Array<{ label: string; value: string }> = [];
  if (answer.severity && answer.severity !== finding.severity) { patch.severity = answer.severity; rows.push({ label: 'Severity', value: `${INSPECTION_SEVERITY_LABELS[finding.severity] ?? finding.severity} → ${INSPECTION_SEVERITY_LABELS[answer.severity]}` }); }
  if (answer.homeSystem && answer.homeSystem !== finding.homeSystem) { patch.homeSystem = answer.homeSystem; rows.push({ label: 'Home system', value: `${INSPECTION_HOME_SYSTEM_LABELS[finding.homeSystem] ?? finding.homeSystem} → ${INSPECTION_HOME_SYSTEM_LABELS[answer.homeSystem]}` }); }
  if (answer.aiInterpretation && answer.aiInterpretation !== (finding.aiInterpretation ?? '')) { patch.aiInterpretation = answer.aiInterpretation; rows.push({ label: 'Interpretation', value: answer.aiInterpretation.length > 240 ? `${answer.aiInterpretation.slice(0, 240)}…` : answer.aiInterpretation }); }
  const low = answer.costLow !== undefined ? Math.round(answer.costLow * 100) : undefined;
  const high = answer.costHigh !== undefined ? Math.round(answer.costHigh * 100) : undefined;
  if (low !== undefined && low !== finding.estimatedCostCentsLow) { patch.estimatedCostCentsLow = low; rows.push({ label: 'Estimated cost, low', value: `${dollars(finding.estimatedCostCentsLow)} → ${dollars(low)}` }); }
  if (high !== undefined && high !== finding.estimatedCostCentsHigh) { patch.estimatedCostCentsHigh = high; rows.push({ label: 'Estimated cost, high', value: `${dollars(finding.estimatedCostCentsHigh)} → ${dollars(high)}` }); }
  const effLow = patch.estimatedCostCentsLow ?? finding.estimatedCostCentsLow;
  const effHigh = patch.estimatedCostCentsHigh ?? finding.estimatedCostCentsHigh;
  return { patch, rows, rangeInverted: effLow != null && effHigh != null && effLow > effHigh };
}
const centsToDollars = (cents: number | null) => (cents == null ? undefined : cents / 100);

function editCapture(finding: FindingWithReport, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'inspection-finding-edit-inputs', captureKey: INSPECTION_FINDING_EDIT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Edit: ${titleOf(finding)}`, question: 'What should this finding say?',
    helpText: 'A blank keeps what is saved. This changes the finding on the inspection record only; nothing is sent to anyone.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'severity', label: 'Severity', required: false, inputSchema: { type: 'SINGLE_SELECT', options: INSPECTION_SEVERITIES.map((value) => ({ label: INSPECTION_SEVERITY_LABELS[value], value })) } },
      { key: 'homeSystem', label: 'Home system', required: false, inputSchema: { type: 'SINGLE_SELECT', options: INSPECTION_HOME_SYSTEMS.map((value) => ({ label: INSPECTION_HOME_SYSTEM_LABELS[value], value })) } },
      { key: 'aiInterpretation', label: 'Interpretation', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'costLow', label: 'Estimated cost, low ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 10_000_000 } },
      { key: 'costHigh', label: 'Estimated cost, high ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 10_000_000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered ?? {
      severity: finding.severity, homeSystem: finding.homeSystem, aiInterpretation: finding.aiInterpretation ?? undefined,
      costLow: centsToDollars(finding.estimatedCostCentsLow), costHigh: centsToDollars(finding.estimatedCostCentsHigh),
    }).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

function editResult(finding: FindingWithReport, kind: 'EDIT' | 'CORRECT', contextVersion: string, expiresAt: Date, launch: { entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): AskOperationResult {
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `INSPECTION_FINDING_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { inspectionFindingDecisionLaunch: { kind, entityId: finding.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'inspection-finding-edit-input', title: titleOf(finding), body: `${finding.inspectorDescription} Nothing has been saved yet.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [editCapture(finding, contextVersion)], suggestions: [],
    };
  }
  const parsed = InspectionFindingEditSchema.safeParse(supplied);
  if (!parsed.success) return unavailable('INSPECTION_FINDING_EDIT_INPUT_INVALID', 'Check the details', 'Fill in what changes. Nothing has changed.');
  const { patch, rows, rangeInverted } = editChanges(finding, parsed.data);
  if (rangeInverted) return unavailable('INSPECTION_FINDING_EDIT_RANGE_INVERTED', 'The low cost is higher than the high cost', 'Check the range. Nothing has changed.');
  if (!Object.keys(patch).length) return unavailable('INSPECTION_FINDING_EDIT_UNCHANGED', 'Nothing would change', 'That is already what is saved. Nothing has changed.');
  const marks = kind === 'CORRECT' && finding.workDisposition === 'PENDING_REVIEW';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `INSPECTION_FINDING_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: {
      inspectionFindingDecisionCommand: { kind, entityId: finding.id }, inspectionFindingDecisionContextVersion: contextVersion, inspectionFindingEditForm: supplied,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-edit-review', title: titleOf(finding), body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `inspection-finding-decision-${kind.toLowerCase()}-${sha(`${finding.id}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1,
      title: kind === 'EDIT' ? 'Save these changes to the finding?' : 'Correct this finding?',
      description: `${kind === 'EDIT' ? 'This changes the finding as the report was analyzed, before you confirm the report.' : 'This corrects the extracted details on the confirmed report.'}${marks ? ' It also marks the finding as correction requested, as the page does.' : ''} Nothing is sent to anyone.`,
      fields: rows, editableFields: [], confirmLabel: kind === 'EDIT' ? 'Save changes' : 'Save correction',
      consentText: 'I authorize this change to the shared inspection record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [editCapture(finding, contextVersion, supplied)], suggestions: [],
  };
}

export async function inspectionFindingDecisionResult(userId: string, propertyId: string, launch: { kind: InspectionFindingDecisionKind; entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
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
  if (isInspectionFindingEditKind(kind)) return editResult(finding, kind, contextVersion, expiresAt, launch, supplied);
  const plan = parseFixDisclosure(finding.resolutionNotes);
  const isMonitor = kind === 'MONITOR';
  const closing = kind === 'ALREADY_RESOLVED' || kind === 'NOT_APPLICABLE';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `INSPECTION_FINDING_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: {
      inspectionFindingDecisionCommand: { kind, entityId: finding.id }, inspectionFindingDecisionContextVersion: contextVersion,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-decision-review', title: titleOf(finding), body: `${finding.inspectorDescription} Nothing changes until you confirm.`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `inspection-finding-decision-${kind.toLowerCase()}-${sha(finding.id).slice(0, 12)}-1`, version: 1,
      title: isMonitor ? 'Keep an eye on this finding?' : closing ? CLOSING_COPY[kind].title : `${INSPECTION_FIX_DISCLOSE_LABELS[kind]} for this finding?`,
      description: isMonitor
        ? 'This keeps the finding on your work list as deferred and brings it back for review in about 90 days. It does not accept the work or contact anyone.'
        : closing ? CLOSING_COPY[kind].description
        : 'This records your plan for the sale. It does not contact a buyer, an agent or a contractor, and it keeps an earlier cost estimate and note if you set one.',
      fields: [
        { label: 'Finding', value: titleOf(finding) },
        ...(isMonitor
          ? [{ label: 'Work', value: 'Deferred, review in about 90 days' }]
          : closing ? [{ label: 'Finding becomes', value: CLOSING_COPY[kind].becomes }]
          : [{ label: 'Plan', value: `${plan ? (INSPECTION_FIX_DISCLOSE_LABELS[plan.decision] ?? plan.decision) : 'None recorded'} → ${INSPECTION_FIX_DISCLOSE_LABELS[kind]}` }]),
      ],
      editableFields: [], confirmLabel: isMonitor ? 'Keep an eye on it' : closing ? CLOSING_COPY[kind].confirm : 'Record the plan',
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
  let markFailed = false;
  try {
    const finding = await loadFinding(propertyId, command.entityId);
    if (!finding) throw stale('That finding is no longer available.');
    if (parameters.inspectionFindingDecisionContextVersion !== findingVersion(kind, finding)) throw stale('This finding changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (!inspectionFindingDecisionKinds(finding.report, finding).includes(kind)) throw stale('That decision is not available for this finding now.');
    if (kind === 'MONITOR' || kind === 'ALREADY_RESOLVED' || kind === 'NOT_APPLICABLE') {
      await hubService.dispositionFindingAsWork(finding.id, finding.reportId, propertyId, userId, { disposition: kind });
    } else if (isInspectionFindingEditKind(kind)) {
      const answer = InspectionFindingEditSchema.safeParse(parameters.inspectionFindingEditForm);
      if (!answer.success) throw stale('The details to save are invalid.');
      const { patch, rangeInverted } = editChanges(finding, answer.data);
      if (rangeInverted || !Object.keys(patch).length) throw stale('There is nothing valid to save.');
      await hubService.updateFinding(finding.id, finding.reportId, propertyId, patch);
      // The page's "Correct extraction" also marks the finding correction requested. The details are saved first; if the mark fails they stay saved and that is said.
      if (kind === 'CORRECT' && finding.workDisposition === 'PENDING_REVIEW') {
        try { await hubService.dispositionFindingAsWork(finding.id, finding.reportId, propertyId, userId, { disposition: 'CORRECTION_REQUESTED' }); } catch { markFailed = true; }
      }
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
      type: 'WORKFLOW_PROGRESS', id: `inspection-finding-decision-${kind.toLowerCase()}-${command.entityId}`, title: isInspectionFindingEditKind(kind) ? 'Finding updated' : kind === 'MONITOR' ? 'Now keeping an eye on it' : kind === 'ALREADY_RESOLVED' ? 'Marked as resolved' : kind === 'NOT_APPLICABLE' ? 'Marked as not applicable' : 'Plan recorded', status: 'COMPLETED',
      description: kind === 'MONITOR' ? 'It will come back for review in about 90 days. Nothing was sent to anyone.' : 'It is on the inspection record. Nothing was sent to anyone.', details: [],
      actions: [{ ...reportsAction, label: 'See my inspection reports', style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  if (markFailed) result.blocks.push({ type: 'LIMITATION', id: `inspection-finding-decision-mark-failed-${command.entityId}`, severity: 'CAUTION', title: 'Details saved; not marked as correction requested', body: 'The corrected details are saved. Marking the finding as correction requested did not go through; it keeps its earlier status.' });
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `inspection-finding-decision-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'INSPECTION_FINDING', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('inspection-finding-decision.command', confirmInspectionFindingDecision);
