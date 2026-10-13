// A comparable sale for a property tax appeal inside Ask (register P2 "Property Tax"; FRD v1.355). Reached only by the declared action on the appeal
// readiness answer. The write is propertyTaxAppealReadinessService.upsertComparable, the route's own call, behind a review and a confirmation. The same
// address and sale date replace the earlier entry. Cozy does not verify the sale and files nothing; the review says so.
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
import { propertyTaxAppealReadinessService } from '../../propertyTax/propertyTaxAppealReadiness.service';
import { COMPARABLE_CAPTURE_KEY, COMPARABLE_MESSAGE, comparableKey, parseComparableAnswer, type ComparableAnswer } from '../support/propertyTaxComparableCommand';
import { evidenceKindFromMessage } from '../support/propertyTaxEvidenceCommand';
import { confirmEvidence, evidenceCommandResult } from './propertyTaxEvidenceCommands.handler';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const database = prisma as any;
const back = { id: 'property-tax-comparable-back', label: 'Back to my appeal', interactionType: 'START_WORKFLOW' as const, message: 'Show my property tax appeal readiness', operationId: 'PROPERTY_TAX_APPEAL_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'property-tax-comparable-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

async function versionOf(propertyId: string) {
  const rows = await database.propertyTaxAppealComparable.findMany({ where: { propertyId }, select: { comparableKey: true, updatedAt: true }, orderBy: { comparableKey: 'asc' } }) as Array<{ comparableKey: string; updatedAt: Date }>;
  return sha(`property-tax-comparables:${rows.map((row) => `${row.comparableKey}:${row.updatedAt.toISOString()}`).join('|')}`);
}

function formCapture(contextVersion: string, entered: Record<string, unknown> = {}): AskCaptureRequest {
  const area = (key: string, label: string, max: number) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 1, max } });
  return {
    requirementId: 'property-tax-comparable-inputs', captureKey: COMPARABLE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Add a comparable sale', question: 'What sold, when and for how much?',
    helpText: 'Enter a sale you can point to in public records. Cozy does not verify it, and nothing is filed. The same address and sale date replace the earlier entry.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'address', label: 'Address of the sale', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 300 } },
      { key: 'saleDate', label: 'Sale date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'salePrice', label: 'Sale price ($)', required: true, inputSchema: { type: 'NUMBER' as const, min: 1, max: 1_000_000_000 } },
      { key: 'propertyClass', label: 'Property class (for example, single family)', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 120 } },
      area('livingAreaSqFt', 'Living area (sq ft)', 1_000_000), area('lotSizeSqFt', 'Lot size (sq ft)', 10_000_000),
      { key: 'condition', label: 'Condition', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 300 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function comparableCommandResult(userId: string, propertyId: string, launch: { sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-tax-comparable-permission', title: 'A contributor or owner can add a comparable', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const coverage: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, 'ASSESSED_VALUE');
  if (coverage.status === 'NOT_COVERED') return unavailable('PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE', 'Reviewed appeal rules are not available for this property', 'A comparable is recorded against a reviewed appeal rule. Nothing has changed.');
  const contextVersion = await versionOf(propertyId);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_TAX_COMPARABLE_INPUT_REQUIRED', contextVersion,
      parameters: { comparableLaunch: { sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'property-tax-comparable-input', title: 'Add a comparable sale', body: 'Nothing has been saved yet; you will review it first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(contextVersion)], suggestions: [],
    };
  }
  const parsed = parseComparableAnswer(supplied);
  if (!parsed.success) return unavailable('PROPERTY_TAX_COMPARABLE_INPUT_INVALID', 'Check the details', parsed.reason === 'FUTURE' ? 'A comparable must be a sale that already happened. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  const d = parsed.data;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PROPERTY_TAX_COMPARABLE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { comparableForm: supplied, comparableContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'property-tax-comparable-review', title: 'Add this comparable sale?', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `property-tax-comparable-${sha(JSON.stringify(supplied)).slice(0, 12)}-1`, version: 1, title: 'Add this comparable sale?',
      description: 'This adds the sale to your appeal evidence. Cozy does not verify it or compute an adjustment for it, and nothing is filed. Adding the same address and sale date again replaces this entry. Use only sales you can point to in public records.',
      fields: [
        { label: 'Address', value: d.address }, { label: 'Sale date', value: humanDate(new Date(`${d.saleDate}T12:00:00.000Z`)) ?? d.saleDate }, { label: 'Sale price', value: money(d.salePrice) },
        { label: 'Property class', value: d.propertyClass },
        ...(d.livingAreaSqFt ? [{ label: 'Living area', value: `${d.livingAreaSqFt.toLocaleString('en-US')} sq ft` }] : []),
        ...(d.lotSizeSqFt ? [{ label: 'Lot size', value: `${d.lotSizeSqFt.toLocaleString('en-US')} sq ft` }] : []),
        ...(d.condition ? [{ label: 'Condition', value: d.condition }] : []),
      ],
      editableFields: [], confirmLabel: 'Add the comparable', consentText: 'I authorize adding this comparable sale to my property tax appeal evidence.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(contextVersion, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('property-tax.comparable-command', async (envelope) => {
  const launch = envelope.launchContext;
  // FRD v1.367: appeal evidence from a link is the same operation's second kind of record, reached by its own declared messages.
  const evidenceKind = evidenceKindFromMessage(envelope.message);
  if (evidenceKind && launch?.operationId === 'PROPERTY_TAX_COMPARABLE_COMMAND' && launch.surface !== 'ASK_REFRESH') {
    return evidenceCommandResult(envelope.userId, envelope.propertyId!, { kind: evidenceKind, sourceExecutionId: launch.sourceExecutionId ?? null });
  }
  if (envelope.message !== COMPARABLE_MESSAGE || launch?.operationId !== 'PROPERTY_TAX_COMPARABLE_COMMAND' || launch.surface === 'ASK_REFRESH') {
    return unavailable('ASK_PROPERTY_TAX_COMPARABLE_NOT_DIRECTLY_ROUTABLE', 'Open your appeal first', 'A comparable is added from your appeal readiness. Nothing has changed.');
  }
  return comparableCommandResult(envelope.userId, envelope.propertyId!, { sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmComparable(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  if (ctx.parameters.evidenceKind) return confirmEvidence(ctx);
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  try {
    if (parameters.comparableContextVersion !== await versionOf(propertyId)) throw stale('Your comparables changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const parsed = parseComparableAnswer(parameters.comparableForm);
    if (!parsed.success) throw stale('The comparable to save is invalid.');
    const d: ComparableAnswer = parsed.data;
    const access = await ensurePropertyAccess(userId, propertyId);
    await propertyTaxAppealReadinessService.upsertComparable({
      propertyId, userId, role: access.role, comparableKey: comparableKey(d.address, d.saleDate, sha), address: d.address, saleDate: d.saleDate, salePrice: d.salePrice,
      propertyClass: d.propertyClass,
      ...(d.livingAreaSqFt ? { livingAreaSqFt: d.livingAreaSqFt } : {}), ...(d.lotSizeSqFt ? { lotSizeSqFt: d.lotSizeSqFt } : {}), ...(d.condition ? { condition: d.condition } : {}),
    });
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PROPERTY_TAX_COMPARABLE_ADDED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `property-tax-comparable-${propertyId}`, title: 'Comparable added', status: 'COMPLETED', description: 'It is part of your appeal evidence. Cozy has not verified it and nothing was filed.', details: [], actions: [{ ...back, style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'property-tax-comparable-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The comparable was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_TAX_APPEAL_COMPARABLE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('property-tax.comparable-command', confirmComparable);
