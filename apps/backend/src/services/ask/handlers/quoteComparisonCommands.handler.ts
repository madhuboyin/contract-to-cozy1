// Manage the proposals of a quote comparison inside Ask (register P0 "Quote Comparison"; FRD v1.309).
//
// Reached only by declared actions on the Quote Comparison review: "Add a proposal" (summary action on the workspace), and per-proposal Select,
// Reject / Return to consideration, and Remove (row actions). Every write goes through the canonical quoteComparison.service functions the desktop
// routes call (createQuoteProposal, selectQuoteForDecision, setQuoteProposalDisposition, deleteQuoteProposal), after the same project-compliance
// applicability check the controller runs, behind a review card and a confirmation. Nothing is accepted, booked or sent to a provider here.
//
// Not here (separate slices): editing a proposal, importing one from a document, clarifications, the workspace transition, and continuing into
// finalization. Selecting only records the homeowner's shortlist choice for the next stage; the canonical service refuses a proposal that is not
// comparison-ready or not part of a comparable set, and Ask says so before offering the confirmation.
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
import { humanDate, money } from '../askFormatting';
import {
  createQuoteProposal, deleteQuoteProposal, getWorkspaceComparability, selectQuoteForDecision, setQuoteProposalDisposition,
} from '../../quoteComparison.service';
import { assertProjectComplianceDecisionsApplicable } from '../../projectCompliance/context';
import { emitServiceQuoteDecisionAnalytics, ServiceQuoteDecisionEvent } from '../../serviceQuoteDecisionAnalytics.service';
import {
  parseQuoteAddAnswer, QUOTE_ADD_CAPTURE_KEY, QUOTE_COMMAND_MESSAGES, QUOTE_ENTITY_TYPE, QUOTE_WORKSPACE_ENTITY_TYPE, quoteAddProposalInput,
  quoteCommandKindFromMessage, type QuoteAddInput, type QuoteCommandKind,
} from '../support/quoteComparisonCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface QuoteCommandLaunch { kind: QuoteCommandKind; entityId: string; sourceExecutionId: string | null }

const backToReview = { id: 'quote-comparison-back', label: 'Back to the comparison', interactionType: 'START_WORKFLOW' as const, message: 'Compare my service quotes', operationId: 'QUOTE_COMPARISON_REVIEW' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'quote-command-permission', title: 'A contributor or owner can change a quote comparison', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_QUOTE_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'quote-command-not-routable', title: 'Open the comparison first', body: 'Proposals are added, selected or removed from the quote comparison. Nothing has changed.', tone: 'DEFAULT', actions: [backToReview] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'quote-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToReview] }],
  suggestions: [],
});

type WorkspaceRow = { id: string; outcome: string; journeyStage: string; serviceCategory: string | null; scopeSummary: string | null; updatedAt: Date; selectedQuoteId: string | null };
type QuoteRow = { id: string; vendorName: string; quoteAmount: unknown; currency: string | null; decision: string | null; isSelected: boolean; readinessStage: string | null; updatedAt: Date; workspaceId: string };

const workspaceSelect = { id: true, outcome: true, journeyStage: true, serviceCategory: true, scopeSummary: true, updatedAt: true, selectedQuoteId: true };

async function loadWorkspace(propertyId: string, workspaceId: string): Promise<WorkspaceRow | null> {
  return database.quoteComparisonWorkspace.findFirst({ where: { id: workspaceId, propertyId }, select: workspaceSelect });
}
async function loadQuote(propertyId: string, quoteId: string): Promise<{ quote: QuoteRow; workspace: WorkspaceRow } | null> {
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspace: { propertyId } },
    select: { id: true, vendorName: true, quoteAmount: true, currency: true, decision: true, isSelected: true, readinessStage: true, updatedAt: true, workspaceId: true,
      workspace: { select: workspaceSelect } },
  });
  if (!quote) return null;
  const { workspace, ...rest } = quote;
  return { quote: rest as QuoteRow, workspace: workspace as WorkspaceRow };
}

/** Bound to the workspace's and the proposal's last change, so a confirmation opened before either changed is refused as out of date. */
export const quoteCommandContextVersion = (workspace: WorkspaceRow, quote?: QuoteRow | null) =>
  sha(`quote-command:${workspace.id}:${workspace.updatedAt.toISOString()}:${quote ? `${quote.id}:${quote.updatedAt.toISOString()}:${quote.decision}:${quote.isSelected}` : ''}`);

const closedMessage = 'This quote decision is closed. Start a new comparison to evaluate revised proposals.';
const lockedStages = ['FINALIZATION', 'BOOKING', 'SCHEDULED', 'COMPLETED', 'CLOSED'];

function addCapture(workspace: WorkspaceRow, contextVersion: string, entered?: QuoteAddInput): AskCaptureRequest {
  const text = (key: string, label: string, max: number, required = false, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  return {
    requirementId: 'quote-comparison-add-inputs', captureKey: QUOTE_ADD_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Add a proposal', question: 'What did the provider quote?',
    helpText: 'Enter what is on the quote. Nothing is saved until you confirm, and a proposal is not compared until its scope facts are confirmed.',
    inputSchema: { type: 'GROUP', fields: [
      text('vendorName', 'Provider', 300, true),
      { key: 'quoteAmount', label: 'Total quoted ($)', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'scopeSummary', label: 'What the quote covers', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
      { key: 'quoteDate', label: 'Quote date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'expirationDate', label: 'Quote expires', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      text('warranty', 'Warranty', 500),
      { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ? Object.fromEntries(Object.entries(entered).filter(([, value]) => value !== null && value !== undefined && value !== '')) : {},
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this proposal; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function quoteCommandResult(userId: string, propertyId: string, launch: QuoteCommandLaunch, supplied?: QuoteAddInput): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };

  if (launch.kind === 'ADD') {
    const workspace = await loadWorkspace(propertyId, launch.entityId);
    if (!workspace) return unavailable('QUOTE_WORKSPACE_NOT_FOUND', 'That comparison is no longer available', 'Ask could not find that quote comparison for this home. Nothing has changed.');
    if (workspace.outcome !== 'OPEN') return unavailable('QUOTE_WORKSPACE_CLOSED', 'This quote decision is closed', `${closedMessage} Nothing has changed.`);
    const contextVersion = quoteCommandContextVersion(workspace);
    const parameters = { quoteCommandLaunch: { kind: 'ADD', entityId: workspace.id, sourceExecutionId: launch.sourceExecutionId } };
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_ADD_INPUT_REQUIRED', contextVersion, parameters,
        blocks: [{ type: 'SUMMARY', id: 'quote-add-input', title: 'Add a proposal', body: 'Nothing has been saved yet. Enter what is on the quote, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [addCapture(workspace, contextVersion)], suggestions: [],
      };
    }
    const detail = (label: string, value: string | null) => (value ? [{ label, value }] : []);
    const date = (value: string | null) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_ADD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { quoteAdd: supplied, quoteCommand: { kind: 'ADD', entityId: workspace.id }, quoteCommandContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'quote-add-review', title: 'Review this proposal', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `quote-add-${sha(`${propertyId}:${workspace.id}:${supplied.vendorName}:${supplied.quoteAmount}`).slice(0, 12)}-1`, version: 1,
        title: `Add ${supplied.vendorName}'s proposal?`,
        description: 'This records the proposal in the quote comparison. It does not select a provider, accept the quote or contact anyone.',
        fields: [
          { label: 'Provider', value: supplied.vendorName }, { label: 'Total quoted', value: money(supplied.quoteAmount) },
          ...detail('Covers', supplied.scopeSummary), ...detail('Quote date', date(supplied.quoteDate)), ...detail('Expires', date(supplied.expirationDate)),
          ...detail('Warranty', supplied.warranty), ...detail('Notes', supplied.notes),
        ],
        editableFields: [], confirmLabel: 'Add proposal', consentText: 'I authorize adding this proposal to the shared quote comparison.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [addCapture(workspace, contextVersion, supplied)], suggestions: [],
    };
  }

  const loaded = await loadQuote(propertyId, launch.entityId);
  if (!loaded) return unavailable('QUOTE_NOT_FOUND', 'That proposal is no longer available', 'Ask could not find that proposal. It may have been removed. Nothing has changed.');
  const { quote, workspace } = loaded;
  if (workspace.outcome !== 'OPEN') return unavailable('QUOTE_WORKSPACE_CLOSED', 'This quote decision is closed', `${closedMessage} Nothing has changed.`);
  if (launch.kind !== 'SELECT' && lockedStages.includes(workspace.journeyStage)) {
    return unavailable('QUOTE_PROPOSALS_LOCKED', 'Proposal controls are locked', 'Proposals cannot be changed after final-term review begins. Nothing has changed.');
  }
  const contextVersion = quoteCommandContextVersion(workspace, quote);
  const amount = Number(quote.quoteAmount);
  const fields = [{ label: 'Provider', value: quote.vendorName }, ...(Number.isFinite(amount) ? [{ label: 'Total quoted', value: money(amount) }] : [])];
  let title: string; let description: string; let confirmLabel: string; let tone: 'DEFAULT' | 'CAUTION' = 'DEFAULT';
  if (launch.kind === 'SELECT') {
    if (quote.readinessStage !== 'COMPARISON_READY') {
      return unavailable('QUOTE_NOT_COMPARISON_READY', 'This proposal cannot be selected yet',
        'Only a comparison-ready proposal can be selected: its scope facts must be confirmed first. Confirming a proposal’s facts is not currently available in Ask. Nothing has changed.');
    }
    const comparability = await getWorkspaceComparability(propertyId, workspace.id);
    if (comparability.status !== 'COMPARABLE' || !comparability.eligibleQuoteIds.includes(quote.id)) {
      return unavailable('QUOTE_NOT_COMPARABLE', 'This proposal is not part of a comparable set yet',
        `${comparability.reasons.join(' ') || 'The recorded proposals are not safely comparable.'} Nothing has changed.`);
    }
    title = `Select ${quote.vendorName}'s proposal?`;
    description = 'This records your choice for the next decision stage and clears any earlier choice. It does not accept the quote, book anyone or contact the provider.';
    confirmLabel = 'Select proposal';
  } else if (launch.kind === 'REJECT') {
    title = `Reject ${quote.vendorName}'s proposal?`;
    description = quote.isSelected
      ? 'This is the selected proposal: rejecting it clears the selection. You can return it to consideration later.'
      : 'It stays in the record and can be returned to consideration later.';
    confirmLabel = 'Reject proposal'; tone = 'CAUTION';
  } else if (launch.kind === 'RESTORE') {
    title = `Return ${quote.vendorName}'s proposal to consideration?`;
    description = 'The proposal is considered again with the others.';
    confirmLabel = 'Return to consideration';
  } else {
    title = `Remove ${quote.vendorName}'s proposal?`;
    description = 'The proposal and its recorded facts are deleted from this comparison. This cannot be undone.';
    confirmLabel = 'Remove proposal'; tone = 'CAUTION';
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_COMMAND_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { quoteCommand: { kind: launch.kind, entityId: quote.id }, quoteCommandContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'quote-command-review', title, body: description, tone, actions: [] }],
    confirmation: {
      confirmationId: `quote-command-${sha(`${propertyId}:${launch.kind}:${quote.id}`).slice(0, 12)}-1`, version: 1, title, description, fields,
      editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared quote comparison.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('quote-comparison.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = quoteCommandKindFromMessage(envelope.message);
  const entityType = kind === 'ADD' ? QUOTE_WORKSPACE_ENTITY_TYPE : QUOTE_ENTITY_TYPE;
  if (!kind || launch?.operationId !== 'QUOTE_COMPARISON_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== entityType || !launch.entityId) return notRoutable();
  return quoteCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmQuoteCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.quoteCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as QuoteCommandKind | undefined;
  if (!kind || !(kind in QUOTE_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = command.entityId;

  // Re-read the records the confirmation was prepared against; refuse if either changed while it was open.
  let workspace: WorkspaceRow | null;
  let quote: QuoteRow | null = null;
  if (kind === 'ADD') {
    workspace = await loadWorkspace(propertyId, entityId);
  } else {
    const loaded = await loadQuote(propertyId, entityId);
    workspace = loaded?.workspace ?? null;
    quote = loaded?.quote ?? null;
    if (!quote) throw stale('That proposal is no longer available.');
  }
  if (!workspace) throw stale('That comparison is no longer available.');
  if (parameters.quoteCommandContextVersion !== quoteCommandContextVersion(workspace, quote)) {
    throw stale('This comparison changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }

  try {
    // The same applicability gate the desktop routes run before every change.
    await assertProjectComplianceDecisionsApplicable(propertyId, userId, 'QUOTE_COMPARISON',
      { serviceCategory: (workspace.serviceCategory ?? 'UNSPECIFIED') as never }, ['quoteComparison', 'providerBooking']);

    let title: string; let description: string; let artifactType = 'QUOTE_COMPARISON_QUOTE'; let artifactId = entityId;
    const details: Array<{ label: string; value: string }> = [];
    if (kind === 'ADD') {
      const checked = parseQuoteAddAnswer(parameters.quoteAdd);
      if (!checked.success) throw stale('The proposal to add is invalid.');
      const created = await createQuoteProposal(propertyId, workspace.id, quoteAddProposalInput(checked.data) as never);
      emitServiceQuoteDecisionAnalytics({
        eventName: ServiceQuoteDecisionEvent.INTAKE_RECORDED, userId, propertyId, workspaceId: workspace.id,
        metadata: {
          intakeType: 'manual_quote', surface: 'ask', readinessStage: created.readinessStage, readinessScore: created.readinessScore,
          missingFactCount: Array.isArray(created.missingFactsJson) ? created.missingFactsJson.length : 0,
        },
      });
      artifactId = created.id;
      title = 'Proposal added';
      description = created.readinessStage === 'COMPARISON_READY'
        ? 'The proposal is comparison-ready.'
        : 'The proposal is saved. It is not compared until its scope facts are confirmed.';
      details.push({ label: 'Provider', value: checked.data.vendorName }, { label: 'Total quoted', value: money(checked.data.quoteAmount) });
    } else if (kind === 'SELECT') {
      await selectQuoteForDecision(propertyId, workspace.id, entityId, userId);
      title = 'Proposal selected'; description = 'Your choice is recorded for the next decision stage. Nothing was accepted or booked.';
      details.push({ label: 'Provider', value: quote!.vendorName });
    } else if (kind === 'REJECT' || kind === 'RESTORE') {
      await setQuoteProposalDisposition(propertyId, workspace.id, entityId, userId, kind === 'REJECT' ? 'REJECTED' : 'UNDECIDED');
      title = kind === 'REJECT' ? 'Proposal rejected' : 'Proposal returned to consideration';
      description = kind === 'REJECT' ? 'It stays in the record and can be returned later.' : 'It is considered with the others again.';
      details.push({ label: 'Provider', value: quote!.vendorName });
    } else {
      await deleteQuoteProposal(propertyId, workspace.id, entityId, userId);
      title = 'Proposal removed'; description = 'The proposal was deleted from this comparison.';
      details.push({ label: 'Provider', value: quote!.vendorName });
    }

    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `QUOTE_COMMAND_${kind}_COMPLETED`,
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `quote-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details,
        actions: [{ ...backToReview, label: 'See the comparison', style: 'PRIMARY' as const }],
      }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `quote-command-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    // The canonical service refuses with an APIError and a readable message (closed, locked, not comparable); carry it to the homeowner as is.
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('quote-comparison.command', confirmQuoteCommand);
