// Save, dismiss, stop pursuing and record the outcome of a savings or benefit opportunity inside Ask (register P1 "Savings & Benefits"; FRD v1.323).
// Reached only by declared actions on the savings answer's rows. Every write goes through the canonical savingsBenefitsCanonical.service the routes call
// (createCanonicalAction, updateCanonicalAction, recordCanonicalActionOutcome), behind a review card and a confirmation. The service serves the home's
// primary owner only, and Ask says so. Not here: recording a sensitive eligibility fact, a partner handoff, a quote request and a complaint (personal data
// leaves the household there, which needs its own decision).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { createCanonicalAction, getCanonicalOpportunityDetail, recordCanonicalActionOutcome, updateCanonicalAction } from '../../savingsBenefitsCanonical.service';
import {
  SAVINGS_COMMAND_MESSAGES, SAVINGS_OUTCOME_CAPTURE_KEY, SAVINGS_OUTCOME_INVALID_MESSAGES, SAVINGS_OUTCOME_STAGES, SAVINGS_OUTCOME_STAGE_LABELS,
  parseSavingsOutcomeAnswer, parseSavingsRowId, savingsCommandEntityType, savingsCommandKindFromMessage,
  type SavingsCommandKind, type SavingsFamily, type SavingsOutcomeForm, type SavingsTarget,
} from '../support/savingsBenefitCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface SavingsCommandLaunch { kind: SavingsCommandKind; entityId: string; sourceExecutionId: string | null }

const backToSavings = { id: 'savings-benefit-back', label: 'Back to my savings', interactionType: 'START_WORKFLOW' as const, message: 'Show my savings opportunities', operationId: 'SAVINGS_OPPORTUNITIES' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'savings-command-permission', title: 'A contributor or owner can change savings records', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const primaryOwnerOnly = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY',
  blocks: [{ type: 'SUMMARY', id: 'savings-command-primary-owner', title: 'Only the home’s primary owner can change savings records', body: 'Savings and benefit actions are kept for the home’s primary account holder, so they can’t be changed here. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'savings-command-not-routable', title: 'Open your savings first', body: 'An opportunity is saved, dismissed or followed up from your savings list. Nothing has changed.', tone: 'DEFAULT', actions: [backToSavings] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'savings-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToSavings] }], suggestions: [],
});

const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));

interface Opportunity { family: SavingsFamily; id: string; title: string; status: string; updatedAt: Date }
async function loadOpportunity(userId: string, propertyId: string, target: SavingsTarget): Promise<Opportunity | null> {
  try {
    const detail: any = await getCanonicalOpportunityDetail(propertyId, target.opportunityId, userId);
    if (detail.family !== target.family) return null;
    const o = detail.opportunity;
    return {
      family: detail.family, id: o.id, status: String(o.status), updatedAt: o.updatedAt instanceof Date ? o.updatedAt : new Date(o.updatedAt),
      title: detail.family === 'BENEFIT' ? String(o.program?.name ?? 'This benefit') : String(o.headline ?? 'This savings opportunity'),
    };
  } catch { return null; }
}
interface ActionRow { id: string; state: string; updatedAt: Date; actionType: string }
async function loadOpenAction(propertyId: string, target: SavingsTarget): Promise<ActionRow | null> {
  return database.savingsBenefitAction.findFirst({
    where: { propertyId, state: 'STARTED', ...(target.family === 'BENEFIT' ? { hiddenAssetMatchId: target.opportunityId } : { homeSavingsOpportunityId: target.opportunityId }) },
    orderBy: { createdAt: 'desc' }, select: { id: true, state: true, updatedAt: true, actionType: true },
  });
}
const opportunityVersion = (kind: SavingsCommandKind, o: Opportunity) => sha(`savings:${kind}:${o.id}:${o.status}:${o.updatedAt.toISOString()}`);
const actionVersion = (kind: SavingsCommandKind, a: ActionRow) => sha(`savings:${kind}:${a.id}:${a.state}:${a.updatedAt.toISOString()}`);

function outcomeCapture(family: SavingsFamily, contextVersion: string, title: string, entered: Record<string, unknown> = {}): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const amount = (key: string, label: string, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const date = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } });
  const text = (key: string, label: string, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } });
  return {
    requirementId: 'savings-benefit-outcome-inputs', captureKey: SAVINGS_OUTCOME_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Record what happened with ${title}`, question: 'What happened?',
    helpText: 'Say only what you know. Savings count as realized only when you record that you received them, with what backs it. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'stage', label: 'What happened', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: SAVINGS_OUTCOME_STAGES.map((value) => ({ label: SAVINGS_OUTCOME_STAGE_LABELS[value], value })) } },
      ...(family === 'BENEFIT'
        ? [amount('amountReceived', 'Amount you received ($)', 'Needed when you received it.')]
        : [amount('observedMonthlyValue', 'Monthly saving you saw ($)', 'Either the monthly or the yearly figure.'), amount('observedAnnualValue', 'Yearly saving you saw ($)'),
          date('observationStartedOn', 'Observed from'), date('observationEndedOn', 'Observed to')]),
      text('evidenceNote', 'What backs it', 'For example an award letter, a bill or a confirmation. Needed when you received it.'),
      text('denialReason', 'Why it was denied'), text('closureReason', 'Why you are closing it'),
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this record; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function savingsCommandResult(userId: string, propertyId: string, launch: SavingsCommandLaunch, supplied?: SavingsOutcomeForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!await isPrimaryOwner(userId, propertyId)) return primaryOwnerOnly();
  const kind = launch.kind;
  const target = parseSavingsRowId(launch.entityId);
  if (!target) return notRoutable();
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const fieldRow = (label: string, value: string | null) => (value ? [{ label, value }] : []);

  const opportunity = await loadOpportunity(userId, propertyId, target);
  if (!opportunity) return unavailable('SAVINGS_OPPORTUNITY_NOT_FOUND', 'That opportunity is no longer available', 'Ask could not find that savings opportunity. Nothing has changed.');
  const familyLabel = opportunity.family === 'BENEFIT' ? 'benefit or rebate' : 'recurring-cost saving';

  if (kind === 'SAVE' || kind === 'DISMISS') {
    const contextVersion = opportunityVersion(kind, opportunity);
    const save = kind === 'SAVE';
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: `SAVINGS_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
      parameters: { savingsCommand: { kind, entityId: launch.entityId }, savingsContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'savings-command-review', title: `${save ? 'Save' : 'Dismiss'}: ${opportunity.title}`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `savings-${kind.toLowerCase()}-${sha(`${propertyId}:${opportunity.id}`).slice(0, 12)}-1`, version: 1,
        title: `${save ? 'Save' : 'Dismiss'} this ${familyLabel}?`,
        description: save
          ? 'It stays in your savings list so you can come back to it. Nothing is applied for or sent anywhere.'
          : 'It leaves your list of things to review. Nothing is applied for or sent anywhere.',
        fields: [{ label: 'Opportunity', value: opportunity.title }, { label: 'Type', value: familyLabel }],
        editableFields: [], confirmLabel: save ? 'Save it' : 'Dismiss it',
        consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  const action = await loadOpenAction(propertyId, target);
  if (!action) return unavailable('SAVINGS_ACTION_NOT_OPEN', 'There is nothing under way to follow up', 'No action in progress was found for this opportunity. Nothing has changed.');
  const contextVersion = actionVersion(kind, action);
  if (kind === 'STOP') {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'SAVINGS_STOP_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { savingsCommand: { kind, entityId: launch.entityId }, savingsContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'savings-command-review', title: `Stop pursuing: ${opportunity.title}`, body: 'Nothing changes until you confirm.', tone: 'CAUTION', actions: [] }],
      confirmation: {
        confirmationId: `savings-stop-${sha(`${propertyId}:${action.id}`).slice(0, 12)}-1`, version: 1, title: 'Stop pursuing this?',
        description: 'The action is marked cancelled. It cannot be reopened; you can start again from the opportunity if it is still available.',
        fields: [{ label: 'Opportunity', value: opportunity.title }], editableFields: [], confirmLabel: 'Stop pursuing',
        consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  // OUTCOME
  const launchParameters = { savingsCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'SAVINGS_OUTCOME_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'savings-outcome-input', title: opportunity.title, body: 'Nothing has been saved yet. Say what happened, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [outcomeCapture(opportunity.family, contextVersion, opportunity.title)], suggestions: [],
    };
  }
  const day = (value: unknown) => (typeof value === 'string' ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
  const cash = (value: unknown) => (typeof value === 'number' ? money(value) : null);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'SAVINGS_OUTCOME_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { savingsOutcome: supplied, savingsCommand: { kind, entityId: launch.entityId }, savingsContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'savings-outcome-review', title: `Review: ${opportunity.title}`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `savings-outcome-${sha(`${propertyId}:${action.id}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1,
      title: `Record this outcome for ${opportunity.title}?`,
      description: supplied.stage === 'RECEIVED'
        ? 'This counts the saving as realized, as you reported it. Cozy does not verify it against the provider.'
        : 'This is recorded as you reported it and moves the action forward. Nothing is submitted to anyone.',
      fields: [
        { label: 'What happened', value: SAVINGS_OUTCOME_STAGE_LABELS[supplied.stage] ?? supplied.stage },
        ...fieldRow('Amount received', cash(supplied.amountReceived)), ...fieldRow('Monthly saving', cash(supplied.observedMonthlyValue)), ...fieldRow('Yearly saving', cash(supplied.observedAnnualValue)),
        ...fieldRow('Observed', supplied.observationStartedOn && supplied.observationEndedOn ? `${day(supplied.observationStartedOn)} to ${day(supplied.observationEndedOn)}` : null),
        ...fieldRow('Backed by', typeof supplied.evidenceNote === 'string' ? supplied.evidenceNote : null), ...fieldRow('Reason denied', typeof supplied.denialReason === 'string' ? supplied.denialReason : null),
        ...fieldRow('Reason closed', typeof supplied.closureReason === 'string' ? supplied.closureReason : null),
      ],
      editableFields: [], confirmLabel: 'Record outcome', consentText: 'I authorize this record in the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [outcomeCapture(opportunity.family, contextVersion, opportunity.title, supplied as Record<string, unknown>)], suggestions: [],
  };
}

registerCapabilityHandler('savings-benefit.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = savingsCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'SAVINGS_BENEFIT_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  if (launch.entityType !== savingsCommandEntityType(kind)) return notRoutable();
  return savingsCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmSavingsCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.savingsCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as SavingsCommandKind | undefined;
  if (!kind || !(kind in SAVINGS_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const target = parseSavingsRowId(command.entityId);
  if (!target) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  if (!await isPrimaryOwner(userId, propertyId)) throw stale('Only the home’s primary owner can change savings records.', 'ASK_PERMISSION_REQUIRED');
  const role = ctx.access.role as HouseholdRole;
  let title: string; let description: string; let artifactId = target.opportunityId;
  try {
    const opportunity = await loadOpportunity(userId, propertyId, target);
    if (!opportunity) throw stale('That opportunity is no longer available.');
    if (kind === 'SAVE' || kind === 'DISMISS') {
      if (parameters.savingsContextVersion !== opportunityVersion(kind, opportunity)) throw stale('This opportunity changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const actionType = kind === 'SAVE' ? 'SAVE' : 'DISMISS';
      const created: any = await createCanonicalAction(propertyId, opportunity.id, userId, {
        idempotencyKey: `ask-${actionType.toLowerCase()}-${opportunity.id}`, family: opportunity.family, actionType, followUpAt: null,
      } as never);
      artifactId = created?.id ?? opportunity.id;
      title = kind === 'SAVE' ? 'Saved for later' : 'Dismissed'; description = kind === 'SAVE' ? 'It stays in your savings list.' : 'It leaves your list of things to review.';
    } else {
      const action = await loadOpenAction(propertyId, target);
      if (!action) throw stale('Nothing under way was found for this opportunity.');
      if (parameters.savingsContextVersion !== actionVersion(kind, action)) throw stale('This opportunity changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      artifactId = action.id;
      if (kind === 'STOP') {
        await updateCanonicalAction(propertyId, action.id, userId, { state: 'CANCELLED' } as never, role);
        title = 'Stopped'; description = 'The action is marked cancelled.';
      } else {
        const checked = parseSavingsOutcomeAnswer(opportunity.family, parameters.savingsOutcome);
        if (!checked.success) throw stale(SAVINGS_OUTCOME_INVALID_MESSAGES[checked.reason]);
        const v = checked.data;
        const common = {
          stage: v.stage, idempotencyKey: `ask-outcome-${action.id}-${sha(JSON.stringify(v)).slice(0, 24)}`, currency: 'USD',
          ...(typeof v.evidenceNote === 'string' && v.evidenceNote ? { evidenceNote: v.evidenceNote } : {}),
          ...(typeof v.denialReason === 'string' && v.denialReason ? { denialReason: v.denialReason } : {}),
          ...(typeof v.closureReason === 'string' && v.closureReason ? { closureReason: v.closureReason } : {}),
        };
        const input = opportunity.family === 'BENEFIT'
          ? { ...common, ...(typeof v.amountReceived === 'number' ? { amountReceived: v.amountReceived } : {}) }
          : {
            ...common,
            ...(typeof v.observedMonthlyValue === 'number' ? { observedMonthlyValue: v.observedMonthlyValue } : {}),
            ...(typeof v.observedAnnualValue === 'number' ? { observedAnnualValue: v.observedAnnualValue } : {}),
            ...(v.observationStartedOn ? { observationStartedAt: new Date(`${v.observationStartedOn}T00:00:00.000Z`) } : {}),
            ...(v.observationEndedOn ? { observationEndedAt: new Date(`${v.observationEndedOn}T00:00:00.000Z`) } : {}),
          };
        await recordCanonicalActionOutcome(propertyId, action.id, userId, input as never, role);
        title = 'Outcome recorded'; description = v.stage === 'RECEIVED' ? 'It now counts as a realized saving, as you reported it.' : 'It is on the record for this opportunity.';
      }
    }
  } catch (error) {
    // The services' refusals (governance rules, state transitions) are written for a person; their codes are not Ask codes.
    if (error instanceof Error && (!(error as { code?: unknown }).code || error.name === 'SavingsOutcomeGovernanceError')) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SAVINGS_BENEFIT_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `savings-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToSavings, label: 'See my savings', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `savings-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'SAVINGS_BENEFIT_ACTION', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('savings-benefit.command', confirmSavingsCommand);
