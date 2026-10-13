// Coverage Intelligence inside Ask (register P0 "Coverage Intelligence"; FRD v1.317): generate the policy review, start a comparison, and record the
// keep / change / shop / defer decision. Every write goes through the canonical coverage services after the same owner-only authorization they apply:
// getOrCreateCoverageReview, getOrCreateCoverageComparison and recordCoverageDecisionWithEffects (the Home Action resolution, guided-journey and
// capability completion, and analytics the decision route runs, shared rather than copied). A decision is the homeowner's own record: it does not change a
// policy, contact an insurer or bind coverage. Not here: adding a quote or another policy term to a comparison (document evidence), and the property-level
// coverage analysis run and simulation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { getOrCreateCoverageComparison } from '../../coverageComparison.service';
import { getOrCreateCoverageReview } from '../../coverageReview.service';
import { recordCoverageDecisionWithEffects } from '../../coverageDecisionOperations';
import {
  COVERAGE_COMMAND_ACTION_IDS, COVERAGE_COMMAND_MESSAGES, COVERAGE_COMPARISON_ENTITY_TYPE, COVERAGE_DECISIONS, COVERAGE_DECISION_CAPTURE_KEY,
  COVERAGE_DECISION_OPTION_LABELS, COVERAGE_PROPERTY_ENTITY_TYPE, coverageCommandKindFromMessage, coverageCommandTargetsProperty, parseCoverageDecisionAnswer,
  type CoverageCommandKind, type CoverageDecisionInput,
} from '../support/coverageCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface CoverageCommandLaunch { kind: CoverageCommandKind; entityId: string; sourceExecutionId: string | null }

const backToComparison = { id: 'coverage-back', label: 'Back to the comparison', interactionType: 'START_WORKFLOW' as const, message: 'Show my coverage comparison', operationId: 'COVERAGE_COMPARISON_STATUS' as const, style: 'SECONDARY' as const };
const backToReview = { id: 'coverage-back-review', label: 'See the review', interactionType: 'START_WORKFLOW' as const, message: 'Show my coverage review', operationId: 'COVERAGE_REVIEW_STATUS' as const, style: 'PRIMARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'coverage-command-permission', title: 'A contributor or owner can change coverage records', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const ownerOnly = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'COVERAGE_COMMAND_OWNER_ONLY',
  blocks: [{ type: 'SUMMARY', id: 'coverage-command-owner-only', title: 'Only the home\'s primary owner can do this', body: 'Coverage review and comparison are kept for the home\'s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_COVERAGE_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'coverage-command-not-routable', title: 'Open your coverage first', body: 'A coverage step starts from your coverage review or comparison. Nothing has changed.', tone: 'DEFAULT', actions: [backToComparison] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'coverage-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToComparison] }], suggestions: [],
});

async function isPrimaryOwner(userId: string, propertyId: string): Promise<boolean> {
  return Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
}
type ComparisonRow = {
  id: string; status: string; updatedAt: Date; equivalenceStatus: string;
  options: Array<{ id: string; label: string; optionType: string; equivalenceStatus: string; carrierName: string | null }>;
  decisions: Array<{ id: string; decision: string }>;
};
async function loadComparison(propertyId: string, comparisonId: string): Promise<ComparisonRow | null> {
  return database.coverageComparison.findFirst({
    where: { id: comparisonId, propertyId },
    select: {
      id: true, status: true, updatedAt: true, equivalenceStatus: true,
      options: { select: { id: true, label: true, optionType: true, equivalenceStatus: true, carrierName: true }, orderBy: { createdAt: 'asc' } },
      decisions: { select: { id: true, decision: true }, orderBy: { decidedAt: 'desc' }, take: 1 },
    },
  });
}
const comparisonVersion = (comparison: ComparisonRow) => sha(`coverage-decision:${comparison.id}:${comparison.updatedAt.toISOString()}:${comparison.status}:${comparison.options.map((o) => `${o.id}${o.equivalenceStatus}`).join(',')}`);

function decisionCapture(comparison: ComparisonRow, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const alternatives = comparison.options.filter((option) => option.optionType !== 'CURRENT_POLICY');
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    requirementId: 'coverage-decision-inputs', captureKey: COVERAGE_DECISION_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Your coverage decision',
    question: 'What do you want to do about your coverage?',
    helpText: 'This is your own record. It does not change a policy, contact an insurer or bind coverage. Switching to an option that is not equivalent needs the reason you accept the difference.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'decision', label: 'Decision', required: true, inputSchema: { type: 'SINGLE_SELECT', options: COVERAGE_DECISIONS.map((value) => ({ label: COVERAGE_DECISION_OPTION_LABELS[value], value })) } },
      ...(alternatives.length ? [{ key: 'selectedOptionId', label: 'Which option (to switch)', required: false,
        inputSchema: { type: 'SINGLE_SELECT', options: alternatives.map((option) => ({ label: `${option.label}${option.carrierName ? ` (${option.carrierName})` : ''}`, value: option.id })) } }] : []),
      { key: 'rationale', label: 'Why', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Records your decision after confirmation', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function coverageCommandResult(userId: string, propertyId: string, launch: CoverageCommandLaunch, supplied?: CoverageDecisionInput): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!(await isPrimaryOwner(userId, propertyId))) return ownerOnly();
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirm = (contextVersion: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, parameters: Record<string, unknown>,
    capture?: AskCaptureRequest): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'COVERAGE_COMMAND_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { coverageCommand: { kind, entityId: launch.entityId }, coverageContextVersion: contextVersion, ...parameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'coverage-command-review', title, body: description, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `coverage-${sha(`${propertyId}:${kind}:${launch.entityId}:${JSON.stringify(parameters)}`).slice(0, 12)}-1`, version: 1, title, description, fields, editableFields: [],
      confirmLabel, consentText: 'I authorize this change to the shared coverage record.', expiresAt: expiresAt.toISOString(),
    },
    ...(capture ? { captureRequests: [capture] } : {}),
    suggestions: [],
  });

  if (kind === 'START') {
    const contextVersion = sha(`coverage-start:${propertyId}`);
    return confirm(contextVersion, 'Start a coverage comparison?', 'This opens a comparison against your verified current policy so quotes or other policy terms can be lined up with it. It does not contact an insurer or change your policy.', 'Start comparison', [], {});
  }
  if (kind === 'REVIEW') {
    const contextVersion = sha(`coverage-review:${propertyId}`);
    return confirm(contextVersion, 'Review my coverage?', 'This prepares a short list of questions from the confirmed facts on your policy, replacing the earlier review. It reaches no conclusion about what a claim would pay and contacts no one.', 'Prepare review', [], {});
  }
  // DECIDE
  const comparison = await loadComparison(propertyId, launch.entityId);
  if (!comparison) return unavailable('COVERAGE_COMPARISON_NOT_FOUND', 'That comparison is no longer available', 'Ask could not find that coverage comparison. Nothing has changed.');
  if (comparison.status !== 'DRAFT' || comparison.decisions.length) {
    return unavailable('COVERAGE_DECISION_ALREADY_RECORDED', 'A decision is already recorded', 'This comparison already has a decision, which is not changed here. Nothing has changed.');
  }
  const contextVersion = comparisonVersion(comparison);
  const launchParameters = { coverageCommandLaunch: { kind, entityId: comparison.id, sourceExecutionId: launch.sourceExecutionId } };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'COVERAGE_DECISION_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'coverage-decision-input', title: 'Your coverage decision', body: 'Choose what you want to do. Nothing is saved until you review and confirm.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [decisionCapture(comparison, contextVersion)], suggestions: [],
    };
  }
  const selected = supplied.selectedOptionId ? comparison.options.find((option) => option.id === supplied.selectedOptionId) : null;
  if (supplied.selectedOptionId && !selected) return unavailable('COVERAGE_OPTION_NOT_FOUND', 'That option is not part of this comparison', 'Choose one of the compared options. Nothing has changed.');
  if (supplied.decision === 'CHANGE' && selected && selected.equivalenceStatus !== 'EQUIVALENT' && !supplied.rationale) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'COVERAGE_TRADEOFF_REASON_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'coverage-decision-tradeoff', title: 'Say why you accept the difference', body: 'This option is not equivalent to your current protection, so record why you accept the difference. Nothing has been saved.', tone: 'CAUTION', actions: [] }],
      captureRequests: [decisionCapture(comparison, contextVersion, supplied as unknown as Record<string, unknown>)], suggestions: [],
    };
  }
  return confirm(contextVersion, `Record "${COVERAGE_DECISION_OPTION_LABELS[supplied.decision]}"?`,
    'This is your own record of the decision, saved to your home timeline. It does not change a policy, contact an insurer or bind coverage.', 'Record decision',
    [{ label: 'Decision', value: COVERAGE_DECISION_OPTION_LABELS[supplied.decision] }, ...(selected ? [{ label: 'Option', value: selected.label }] : []),
      ...(supplied.rationale ? [{ label: 'Why', value: supplied.rationale }] : [])],
    { coverageDecision: supplied }, decisionCapture(comparison, contextVersion, supplied as unknown as Record<string, unknown>));
}

registerCapabilityHandler('coverage.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = coverageCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'COVERAGE_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  const entityType = coverageCommandTargetsProperty(kind) ? COVERAGE_PROPERTY_ENTITY_TYPE : COVERAGE_COMPARISON_ENTITY_TYPE;
  if (launch.entityType !== entityType) return notRoutable();
  return coverageCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmCoverageCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.coverageCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as CoverageCommandKind | undefined;
  if (!kind || !(kind in COVERAGE_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The step to take is invalid.');
  const propertyId = execution.propertyId;
  if (!(await isPrimaryOwner(userId, propertyId))) throw stale('Only the home\'s primary owner can do this.', 'ASK_PERMISSION_REQUIRED');
  try {
    let title: string; let description: string; let artifactType = 'COVERAGE_COMPARISON'; let artifactId = command.entityId;
    const actions: Array<Record<string, unknown>> = [];
    if (kind === 'START') {
      const result = await getOrCreateCoverageComparison(propertyId, userId, {});
      if (result.state === 'BASELINE_REQUIRED' || !result.comparison) throw stale('A verified current policy is needed before a comparison can start.');
      artifactId = result.comparison.id;
      title = 'Comparison started'; description = 'It is set up against your verified policy. Nothing was sent to an insurer.';
      actions.push({ ...backToComparison, label: 'See the comparison', style: 'PRIMARY' });
    } else if (kind === 'REVIEW') {
      const review = await getOrCreateCoverageReview(propertyId, userId, { triggerType: 'ASK_REQUEST' });
      artifactType = 'COVERAGE_REVIEW'; artifactId = (review as { id?: string }).id ?? artifactId;
      title = 'Coverage review ready'; description = 'The questions are prepared from the confirmed facts on your policy. It reaches no conclusion about what a claim would pay.';
      actions.push(backToReview);
    } else {
      const comparison = await loadComparison(propertyId, command.entityId);
      if (!comparison) throw stale('That comparison is no longer available.');
      if (parameters.coverageContextVersion !== comparisonVersion(comparison)) {
        throw stale('This comparison changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const checked = parseCoverageDecisionAnswer(parameters.coverageDecision);
      if (!checked.success) throw stale('The decision to record is invalid.');
      const result = await recordCoverageDecisionWithEffects(propertyId, comparison.id, userId, {
        decision: checked.data.decision, selectedOptionId: checked.data.selectedOptionId, rationale: checked.data.rationale,
        sourceActionId: `ask:${execution.id}:coverage-decision`,
      });
      artifactType = 'COVERAGE_DECISION'; artifactId = result.decision.id;
      title = result.idempotentReplay ? 'Decision already recorded' : 'Decision recorded';
      description = 'It is saved to your home timeline. Your policy was not changed and no insurer was contacted.';
      actions.push({ ...backToComparison, label: 'See the comparison', style: 'PRIMARY' });
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `COVERAGE_COMMAND_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `coverage-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: actions as never }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `coverage-command-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('coverage.command', confirmCoverageCommand);
