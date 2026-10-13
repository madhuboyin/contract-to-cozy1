// Record, change and finalize an accepted price inside Ask (register P0 "Price Finalization"; FRD v1.311).
//
// Reached only by declared actions: "Record the accepted price" on a Negotiation Shield review, "Record the final price" on a Quote Comparison with a
// selected proposal, "Record an accepted price" on the price records answer, and Change terms / Finalize on a draft. Every write goes through the same
// priceFinalizationOperations functions the desktop routes call (the project-compliance applicability gate, the property-context version stamp, the
// analytics event and, on finalize, the guided-journey completion are shared, not copied), behind a review card and a confirmation.
//
// The record is the home's primary owner's: the service refuses any other household member, so Ask says so instead of offering a form it would reject.
// Finalizing records the accepted price and terms; it does not book work, pay anyone or contact a vendor. Finalizing a record that came from a Quote
// Comparison also marks that comparison's selected proposal accepted and its others rejected (what the page does), and the review card says so.
//
// Idempotency: the canonical create reuses an open draft for the same review, comparison or scope, so Ask looks for one first and offers to change it
// instead of showing a form whose values the create would silently discard.
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
import { money } from '../askFormatting';
import { priceFinalizationService } from '../../priceFinalization.service';
import {
  createPriceFinalizationDraftWithEffects, finalizePriceFinalizationWithEffects, updatePriceFinalizationDraftWithEffects,
} from '../../priceFinalizationOperations';
import { NEGOTIATION_SHIELD_CASE_ENTITY_TYPE } from '../support/negotiationShieldStart';
import { QUOTE_WORKSPACE_ENTITY_TYPE } from '../support/quoteComparisonCommand';
import {
  PRICE_COMMAND_ACTION_IDS, PRICE_COMMAND_MESSAGES, PRICE_FINALIZATION_ENTITY_TYPE, PRICE_FORM_CAPTURE_KEYS, parsePriceFormAnswer, priceCommandEntityType,
  priceCommandKindFromMessage, priceFormKindForCommand, priceStartInput, priceTermChanges, type PriceCommandKind, type PriceFormData, type PriceFormKind,
  type PriceTermsInput,
} from '../support/priceFinalizationCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface PriceCommandLaunch { kind: PriceCommandKind; entityId: string; sourceExecutionId: string | null }

const backToRecords = { id: 'price-finalization-back', label: 'Back to price records', interactionType: 'START_WORKFLOW' as const, message: 'Show my price finalizations', operationId: 'PRICE_FINALIZATIONS_LIST' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'price-command-permission', title: 'A contributor or owner can record a price', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const primaryOwnerOnly = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'PRICE_FINALIZATION_PRIMARY_OWNER_ONLY',
  blocks: [{ type: 'SUMMARY', id: 'price-command-primary-owner', title: 'Only the home\'s primary owner can record prices', body: 'Price Finalization records are kept for the home\'s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_PRICE_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'price-command-not-routable', title: 'Open a price record or a review first', body: 'A price is recorded from a negotiation review, a quote comparison or your price records. Nothing has changed.', tone: 'DEFAULT', actions: [backToRecords] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string, actions: unknown[] = [backToRecords]): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'price-command-unavailable', title, body, tone: 'DEFAULT', actions: actions as never }],
  suggestions: [],
});

async function isPrimaryOwner(userId: string, propertyId: string): Promise<boolean> {
  const row = await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } });
  return Boolean(row);
}

type PriceRecord = Awaited<ReturnType<typeof priceFinalizationService.getDetail>>;
async function loadRecord(userId: string, propertyId: string, id: string): Promise<PriceRecord | null> {
  try { return await priceFinalizationService.getDetail(propertyId, userId, id); } catch (error) {
    if (error instanceof APIError && (error.statusCode === 404 || error.code === 'PROPERTY_ACCESS_DENIED')) return null;
    throw error;
  }
}
const termsOf = (record: PriceRecord): PriceTermsInput => ({
  vendorName: record.vendorName, quotePrice: record.quotePrice, acceptedPrice: record.acceptedPrice, scopeSummary: record.scopeSummary,
  paymentTerms: record.paymentTerms, warrantyTerms: record.warrantyTerms, timelineTerms: record.timelineTerms, notes: record.notes,
});

/** Bound to the record's last change (or, for a start, to the source and any open draft), so a confirmation opened before it changed is refused. */
export const priceCommandContextVersion = (parts: Array<string | number | null | undefined>) => sha(`price-command:${parts.map((part) => String(part ?? '')).join(':')}`);
const recordVersion = (record: PriceRecord) => priceCommandContextVersion([record.id, record.updatedAt, record.status, record.acceptedPrice, record.vendorName]);

const SOURCE_LABELS: Record<string, string> = { MANUAL: 'Entered by hand', NEGOTIATION_SHIELD: 'A negotiation review', QUOTE_COMPARISON: 'A quote comparison', SERVICE_PRICE_RADAR: 'A price check' };

function formCapture(kind: PriceFormKind, contextVersion: string, entered?: Record<string, unknown>, vendor?: string | null): AskCaptureRequest {
  const base = { classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, allowNotSure: false, sensitivity: 'FINANCIAL' as const, confirmationText: null, expectedContextVersion: contextVersion };
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  if (kind === 'FINALIZE') {
    return { ...base, requirementId: 'price-finalization-finalize-inputs', captureKey: PRICE_FORM_CAPTURE_KEYS.FINALIZE, title: 'Finalize the accepted price',
      question: `What price did you accept${vendor ? ` from ${vendor}` : ''}?`,
      helpText: 'Finalizing records the price and terms you accepted. It does not book work, pay anyone or contact the vendor. You will review it before it is saved.',
      inputSchema: { type: 'GROUP', fields: [{ key: 'acceptedPrice', label: 'Accepted price ($)', required: true, inputSchema: { type: 'NUMBER', min: 0.01, max: 100_000_000 } }] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered), destinationLabel: 'Records the accepted price after confirmation' };
  }
  const text = (key: string, label: string, max: number, required = false) => ({ key, label, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const isStart = kind === 'START';
  return {
    ...base, requirementId: isStart ? 'price-finalization-start-inputs' : 'price-finalization-edit-inputs', captureKey: PRICE_FORM_CAPTURE_KEYS[kind],
    title: isStart ? 'Record an accepted price' : 'Change the accepted terms',
    question: isStart ? 'Who is doing the work, and at what price?' : 'What should change?',
    helpText: 'Enter what you agreed. Only a vendor is needed to start; an accepted price is needed to finalize. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      text('vendorName', 'Vendor', 160, isStart),
      { key: 'quotePrice', label: 'Quoted price ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'acceptedPrice', label: 'Accepted price ($)', required: false, inputSchema: { type: 'NUMBER', min: 0.01, max: 100_000_000 } },
      { key: 'scopeSummary', label: 'Scope of work', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'paymentTerms', label: 'Payment terms', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'warrantyTerms', label: 'Warranty', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'timelineTerms', label: 'Timeline', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
      { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), destinationLabel: 'Used to prepare this record; nothing is saved until you confirm',
  };
}

export async function priceCommandResult(userId: string, propertyId: string, launch: PriceCommandLaunch, supplied?: PriceFormData): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!(await isPrimaryOwner(userId, propertyId))) return primaryOwnerOnly();
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { priceCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const row = (label: string, value: string | null) => (value ? [{ label, value }] : []);
  const dollars = (value: number | null) => (value === null ? null : money(value));

  // ── a start ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (kind === 'START_NS' || kind === 'START_QUOTE' || kind === 'START_MANUAL') {
    let sourceKey: string; let openDraft: { id: string; vendorName: string | null } | null = null; let sourceTitle: string | null = null;
    let quoteDraft: { vendor: string; price: number | null } | null = null;
    if (kind === 'START_NS') {
      const review = await database.negotiationShieldCase.findFirst({ where: { id: launch.entityId, propertyId }, select: { id: true, title: true } });
      if (!review) return unavailable('NEGOTIATION_SHIELD_CASE_NOT_FOUND', 'That review is no longer available', 'Ask could not find that negotiation review for this home. Nothing has changed.');
      sourceTitle = review.title; sourceKey = `ns:${review.id}`;
      openDraft = await database.priceFinalization.findFirst({ where: { propertyId, status: 'DRAFT', negotiationShieldCaseId: review.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, vendorName: true } });
    } else if (kind === 'START_QUOTE') {
      const workspace = await database.quoteComparisonWorkspace.findFirst({
        where: { id: launch.entityId, propertyId }, select: { id: true, outcome: true, selectedQuote: { select: { id: true, vendorName: true, quoteAmount: true } } },
      });
      if (!workspace) return unavailable('QUOTE_WORKSPACE_NOT_FOUND', 'That comparison is no longer available', 'Ask could not find that quote comparison for this home. Nothing has changed.');
      if (!workspace.selectedQuote) {
        return unavailable('PRICE_FINALIZATION_QUOTE_SELECTION_REQUIRED', 'Select a proposal first', 'A price is recorded from the proposal you select in the comparison. Nothing has changed.');
      }
      quoteDraft = { vendor: workspace.selectedQuote.vendorName, price: Number(workspace.selectedQuote.quoteAmount) };
      sourceTitle = workspace.selectedQuote.vendorName; sourceKey = `qc:${workspace.id}:${workspace.selectedQuote.id}`;
      openDraft = await database.priceFinalization.findFirst({ where: { propertyId, status: 'DRAFT', quoteComparisonWorkspaceId: workspace.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, vendorName: true } });
    } else {
      sourceKey = `manual:${propertyId}`;
    }
    if (openDraft) {
      return unavailable('PRICE_FINALIZATION_DRAFT_EXISTS', 'There is already an open price record for this',
        `A draft${openDraft.vendorName ? ` for ${openDraft.vendorName}` : ''} is already open. Change its terms or finalize it instead of starting another. Nothing has changed.`,
        [{ id: PRICE_COMMAND_ACTION_IDS.EDIT, label: 'Change its terms', interactionType: 'START_WORKFLOW' as const, message: PRICE_COMMAND_MESSAGES.EDIT,
          operationId: 'PRICE_FINALIZATION_COMMAND' as const, entityType: PRICE_FINALIZATION_ENTITY_TYPE, entityId: openDraft.id, style: 'PRIMARY' as const }, backToRecords]);
    }
    const contextVersion = priceCommandContextVersion(['start', sourceKey]);
    if (kind === 'START_QUOTE') {
      return {
        status: 'NEEDS_CONFIRMATION', reasonCode: 'PRICE_START_CONFIRMATION_REQUIRED', contextVersion,
        parameters: { priceCommand: { kind, entityId: launch.entityId }, priceCommandContextVersion: contextVersion, ...base },
        blocks: [{ type: 'SUMMARY', id: 'price-start-review', title: 'Review starting final terms', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
        confirmation: {
          confirmationId: `price-start-${sha(`${propertyId}:${sourceKey}`).slice(0, 12)}-1`, version: 1, title: `Start final terms with ${quoteDraft!.vendor}?`,
          description: 'This opens a draft price record prefilled from the proposal you selected, and moves the comparison to final terms. It does not accept the quote, book work or contact anyone.',
          fields: [{ label: 'Vendor', value: quoteDraft!.vendor }, ...row('Quoted price', dollars(quoteDraft!.price))],
          editableFields: [], confirmLabel: 'Start final terms', consentText: 'I authorize starting final terms for this selected proposal in the shared record.', expiresAt: expiresAt.toISOString(),
        },
        suggestions: [],
      };
    }
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'PRICE_START_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'price-start-input', title: sourceTitle ? `Record the accepted price: ${sourceTitle}` : 'Record an accepted price', body: 'Nothing has been saved yet. Enter what you agreed, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('START', contextVersion)], suggestions: [],
      };
    }
    const input = supplied as PriceTermsInput;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'PRICE_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { priceStart: input, priceCommand: { kind, entityId: launch.entityId }, priceCommandContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'price-start-review', title: 'Review this price record', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `price-start-${sha(`${propertyId}:${sourceKey}:${input.vendorName}:${input.acceptedPrice}`).slice(0, 12)}-1`, version: 1, title: `Record ${input.vendorName}'s price?`,
        description: 'This opens a draft price record in the shared home record. It does not book work, pay anyone or contact the vendor; finalizing is a separate step.',
        fields: [{ label: 'Vendor', value: input.vendorName ?? '' }, ...row('Quoted price', dollars(input.quotePrice)), ...row('Accepted price', dollars(input.acceptedPrice)),
          ...row('Scope', input.scopeSummary), ...row('Payment', input.paymentTerms), ...row('Warranty', input.warrantyTerms), ...row('Timeline', input.timelineTerms), ...row('Notes', input.notes),
          ...(sourceTitle ? [{ label: 'From', value: kind === 'START_NS' ? `Negotiation review: ${sourceTitle}` : sourceTitle }] : [])],
        editableFields: [], confirmLabel: 'Record price', consentText: 'I authorize adding this price record to the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [formCapture('START', contextVersion, input as unknown as Record<string, unknown>)], suggestions: [],
    };
  }

  // ── a change or a finalize of an existing record ────────────────────────────────────────────────────────────────────────────────────────────
  const record = await loadRecord(userId, propertyId, launch.entityId);
  if (!record) return unavailable('PRICE_FINALIZATION_NOT_FOUND', 'That price record is no longer available', 'Ask could not find that price record. Nothing has changed.');
  if (record.status === 'FINALIZED') return unavailable('PRICE_FINALIZATION_ALREADY_FINALIZED', 'This price is already finalized', 'A finalized record is not changed here. Nothing has changed.');
  if (record.status === 'ARCHIVED') return unavailable('PRICE_FINALIZATION_ARCHIVED', 'This price record is archived', 'An archived record is not changed here. Nothing has changed.');
  const contextVersion = recordVersion(record);
  const source = SOURCE_LABELS[record.sourceType] ?? record.sourceType;
  const confirmationBase = (title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, parameters: Record<string, unknown>,
    capture?: AskCaptureRequest, tone: 'DEFAULT' | 'CAUTION' = 'DEFAULT'): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PRICE_COMMAND_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { priceCommand: { kind, entityId: record.id }, priceCommandContextVersion: contextVersion, ...parameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'price-command-review', title, body: description, tone, actions: [] }],
    confirmation: {
      confirmationId: `price-command-${sha(`${propertyId}:${kind}:${record.id}:${JSON.stringify(parameters)}`).slice(0, 12)}-1`, version: 1, title, description, fields,
      editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared price record.', expiresAt: expiresAt.toISOString(),
    },
    ...(capture ? { captureRequests: [capture] } : {}),
    suggestions: [],
  });

  if (kind === 'EDIT') {
    const before = termsOf(record);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'PRICE_EDIT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'price-edit-input', title: `Change the terms${record.vendorName ? `: ${record.vendorName}` : ''}`, body: 'The form shows what is recorded. Change what is wrong, then review the changes before they are saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('EDIT', contextVersion, before as unknown as Record<string, unknown>)], suggestions: [],
      };
    }
    const changes = priceTermChanges(before, supplied as PriceTermsInput);
    if (!changes.length) return unavailable('PRICE_EDIT_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
    const show = (change: { field: string; before: string | null; after: string | null }, side: 'before' | 'after') => {
      const raw = change[side];
      if (raw === null) return 'None';
      return change.field === 'quotePrice' || change.field === 'acceptedPrice' ? money(Number(raw)) : raw;
    };
    return confirmationBase(`Save these changes to ${record.vendorName ?? 'this price record'}?`, 'The draft is updated. Nothing is finalized, booked or sent to the vendor.', 'Save changes',
      changes.map((change) => ({ label: change.label, value: `${show(change, 'before')} → ${show(change, 'after')}` })), { priceEdit: supplied },
      formCapture('EDIT', contextVersion, supplied as unknown as Record<string, unknown>));
  }

  // FINALIZE
  const suggested = record.acceptedPrice ?? record.quotePrice ?? null;
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PRICE_FINALIZE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'price-finalize-input', title: `Finalize${record.vendorName ? `: ${record.vendorName}` : ''}`, body: 'Confirm the price you accepted, then review before it is recorded as final.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('FINALIZE', contextVersion, suggested !== null ? { acceptedPrice: suggested } : undefined, record.vendorName)], suggestions: [],
    };
  }
  const { acceptedPrice } = supplied as { acceptedPrice: number };
  const crossTool = record.sourceType === 'QUOTE_COMPARISON' || record.quoteComparisonWorkspaceId;
  return confirmationBase(`Finalize ${money(acceptedPrice)}${record.vendorName ? ` with ${record.vendorName}` : ''}?`,
    `This records the accepted price and terms as final. It does not book work, pay anyone or contact the vendor.${crossTool ? ' The proposal you selected in the quote comparison is marked accepted and the others are marked rejected.' : ''}`,
    'Finalize price',
    [...row('Vendor', record.vendorName), { label: 'Accepted price', value: money(acceptedPrice) }, ...row('Quoted price', dollars(record.quotePrice)),
      ...row('Scope', record.scopeSummary), ...row('Payment', record.paymentTerms), ...row('Warranty', record.warrantyTerms), ...row('Timeline', record.timelineTerms), { label: 'Source', value: source }],
    { priceFinalize: { acceptedPrice } }, formCapture('FINALIZE', contextVersion, { acceptedPrice }, record.vendorName), crossTool ? 'CAUTION' : 'DEFAULT');
}

registerCapabilityHandler('price-finalization.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = priceCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'PRICE_FINALIZATION_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  if (launch.entityType !== priceCommandEntityType(kind, NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, QUOTE_WORKSPACE_ENTITY_TYPE)) return notRoutable();
  return priceCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmPriceCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.priceCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as PriceCommandKind | undefined;
  if (!kind || !(kind in PRICE_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = command.entityId;
  if (!(await isPrimaryOwner(userId, propertyId))) throw stale('Only the home\'s primary owner can record prices.', 'ASK_PERMISSION_REQUIRED');

  try {
    let title: string; let description: string; let recordId = entityId; let vendor: string | null = null; let acceptedPrice: number | null = null;
    const actions: Array<Record<string, unknown>> = [];
    const followUps = (id: string, hasPrice: boolean) => {
      actions.push({ id: PRICE_COMMAND_ACTION_IDS.FINALIZE, label: hasPrice ? 'Finalize this price' : 'Finalize with a price', interactionType: 'START_WORKFLOW', message: PRICE_COMMAND_MESSAGES.FINALIZE,
        operationId: 'PRICE_FINALIZATION_COMMAND', entityType: PRICE_FINALIZATION_ENTITY_TYPE, entityId: id, style: 'PRIMARY' });
      actions.push({ id: PRICE_COMMAND_ACTION_IDS.EDIT, label: 'Change the terms', interactionType: 'START_WORKFLOW', message: PRICE_COMMAND_MESSAGES.EDIT,
        operationId: 'PRICE_FINALIZATION_COMMAND', entityType: PRICE_FINALIZATION_ENTITY_TYPE, entityId: id, style: 'SECONDARY' });
    };

    if (kind === 'START_NS' || kind === 'START_MANUAL' || kind === 'START_QUOTE') {
      const expected = kind === 'START_QUOTE'
        ? null
        : parsePriceFormAnswer('START', parameters.priceStart);
      if (kind !== 'START_QUOTE' && (!expected || !expected.success)) throw stale('The price record to start is invalid.');
      // A start is bound to its source and the absence of an open draft: a draft opened since the review makes this a refused confirmation.
      const probe = kind === 'START_NS'
        ? { negotiationShieldCaseId: entityId } : kind === 'START_QUOTE' ? { quoteComparisonWorkspaceId: entityId } : null;
      if (probe) {
        const open = await database.priceFinalization.findFirst({ where: { propertyId, status: 'DRAFT', ...probe }, select: { id: true } });
        if (open) throw stale('A price record is already open for this. Change or finalize it instead.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const payload = kind === 'START_QUOTE'
        ? { sourceType: 'QUOTE_COMPARISON', quoteComparisonWorkspaceId: entityId }
        : priceStartInput(kind, (expected as { success: true; data: PriceTermsInput }).data, kind === 'START_NS' ? entityId : undefined);
      const { detail } = await createPriceFinalizationDraftWithEffects(propertyId, userId, payload as never);
      recordId = detail.id; vendor = detail.vendorName; acceptedPrice = detail.acceptedPrice;
      title = 'Price record started';
      description = 'A draft is saved. Nothing is finalized, booked or sent to the vendor.';
      followUps(detail.id, detail.acceptedPrice !== null && detail.acceptedPrice > 0);
    } else {
      const record = await loadRecord(userId, propertyId, entityId);
      if (!record) throw stale('That price record is no longer available.');
      if (parameters.priceCommandContextVersion !== recordVersion(record)) {
        throw stale('This price record changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      if (record.status !== 'DRAFT') throw stale('This price record is no longer a draft.');
      vendor = record.vendorName;
      if (kind === 'EDIT') {
        const checked = parsePriceFormAnswer('EDIT', parameters.priceEdit);
        if (!checked.success) throw stale('The changes to save are invalid.');
        const next = checked.data as PriceTermsInput;
        const changed = new Set(priceTermChanges(termsOf(record), next).map((change) => change.field));
        if (!changed.size) throw stale('There is nothing to change.');
        const update: Record<string, unknown> = {};
        for (const field of changed) update[field] = next[field];
        const { detail } = await updatePriceFinalizationDraftWithEffects(propertyId, userId, record.id, update as never);
        vendor = detail.vendorName; acceptedPrice = detail.acceptedPrice;
        title = 'Terms changed'; description = 'The draft is updated. Nothing is finalized, booked or sent to the vendor.';
        followUps(detail.id, detail.acceptedPrice !== null && detail.acceptedPrice > 0);
      } else {
        const checked = parsePriceFormAnswer('FINALIZE', parameters.priceFinalize);
        if (!checked.success) throw stale('The accepted price to record is invalid.');
        const price = (checked.data as { acceptedPrice: number }).acceptedPrice;
        const { detail } = await finalizePriceFinalizationWithEffects(propertyId, userId, record.id, { acceptedPrice: price } as never);
        vendor = detail.vendorName; acceptedPrice = detail.acceptedPrice;
        title = 'Price finalized'; description = 'The accepted price and terms are recorded as final. Nothing was booked, paid or sent to the vendor.';
      }
    }

    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `PRICE_COMMAND_${kind}_COMPLETED`,
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `price-command-${kind.toLowerCase()}-${recordId}`, title, status: 'COMPLETED', description,
        details: [...(vendor ? [{ label: 'Vendor', value: vendor }] : []), ...(acceptedPrice ? [{ label: 'Accepted price', value: money(acceptedPrice) }] : [])],
        actions: (actions.length ? actions : [{ ...backToRecords, label: 'See price records', style: 'PRIMARY' as const }]) as never,
      }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `price-command-refresh-failed-${recordId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'PRICE_FINALIZATION', artifactId: recordId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('price-finalization.command', confirmPriceCommand);
