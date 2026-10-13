// Confirmed tax facts from a tax notice or bill already in Home Records, inside Ask (FRD v1.370). Reached only by the declared action on the appeal
// readiness answer, through the property tax command's capability and confirm registrations. The write is
// propertyTaxDocumentIntakeService.confirmFromRecord: one transaction that creates (or reuses) the intake, stages the values, confirms them, creates the
// canonical records and links, and marks the record verified (owner rulings D-T3, D-T4, D-T6). The primary account holder only. Ask did not read the
// document and says so: the values are the person's own reading, reviewed in full and confirmed once.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { propertyTaxDocumentIntakeService } from '../../propertyTax/propertyTaxDocumentIntake.service';
import {
  DOCUMENT_FACTS_AFFIRMATION, DOCUMENT_FACTS_CAPTURE_KEY, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, parseDocumentFactsAnswer,
} from '../support/propertyTaxDocumentFactsCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const database = prisma as any;
const back = { id: 'property-tax-comparable-back', label: 'Back to my appeal', interactionType: 'START_WORKFLOW' as const, message: 'Show my property tax appeal readiness', operationId: 'PROPERTY_TAX_APPEAL_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'property-tax-document-facts-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

interface DocumentOption { id: string; title: string; currentVersionId: string | null; createdAt: Date; intakeId: string | null; intakeStatus: string | null; intakeUpdatedAt: Date | null }

async function isPrimaryOwner(userId: string, propertyId: string) {
  return Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
}

/** Tax documents on file that can still be confirmed: TAX_DOCUMENT only (D-T3), active, clean scan, and not already confirmed or rejected. */
async function documentOptions(propertyId: string): Promise<DocumentOption[]> {
  const records = await database.propertyRecord.findMany({
    where: { propertyId, recordType: 'TAX_DOCUMENT', lifecycleStatus: 'ACTIVE', currentVersion: { is: { scanStatus: 'CLEAN' } } },
    orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, currentVersionId: true, createdAt: true },
  }) as Array<{ id: string; title: string; currentVersionId: string | null; createdAt: Date }>;
  if (!records.length) return [];
  const intakes = await database.propertyTaxDocumentIntake.findMany({
    where: { propertyId, documentId: { in: records.map((record) => record.id) } }, select: { id: true, documentId: true, status: true, updatedAt: true },
  }) as Array<{ id: string; documentId: string; status: string; updatedAt: Date }>;
  const byDocument = new Map(intakes.map((intake) => [intake.documentId, intake]));
  return records.flatMap((record) => {
    const intake = byDocument.get(record.id);
    if (intake && (intake.status === 'CONFIRMED' || intake.status === 'REJECTED')) return [];
    return [{ ...record, intakeId: intake?.id ?? null, intakeStatus: intake?.status ?? null, intakeUpdatedAt: intake?.updatedAt ?? null }];
  });
}
const optionVersion = (propertyId: string, option: DocumentOption) =>
  sha(`tax-doc-facts:${propertyId}:${option.id}:${option.currentVersionId ?? 'none'}:${option.intakeId ?? 'none'}:${option.intakeStatus ?? 'none'}:${option.intakeUpdatedAt?.toISOString() ?? 'none'}`);
const listVersion = (propertyId: string, options: DocumentOption[]) => sha(`tax-doc-list:${propertyId}:${options.map((option) => optionVersion(propertyId, option)).join('|')}`);

function formCapture(options: DocumentOption[], contextVersion: string, entered: Record<string, unknown> = {}): AskCaptureRequest {
  const money = (key: string, label: string) => ({ key, label: `${label} ($)`, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const ratio = (key: string, label: string) => ({ key, label, required: false, helpText: 'A decimal between 0 and 1, for example 0.06.', inputSchema: { type: 'NUMBER' as const, min: 0, max: 1 } });
  const text = (key: string, label: string, max: number, required = false) => ({ key, label, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  return {
    requirementId: 'property-tax-document-facts-inputs', captureKey: DOCUMENT_FACTS_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Confirm tax facts from a document on file', question: 'Which document is it, and what does it state?',
    helpText: 'Enter only values you can see on the document; leave the rest blank. Ask did not read it. Nothing is saved until you review and confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'sourceRecordId', label: 'Tax document', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((option) => ({ label: `${option.title} (added ${humanDate(option.createdAt) ?? 'earlier'})`, value: option.id })) } },
      { key: 'kind', label: 'What kind of document is it?', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: DOCUMENT_KINDS.map((value) => ({ label: DOCUMENT_KIND_LABELS[value], value })) } },
      { key: 'taxYear', label: 'Tax year', required: true, inputSchema: { type: 'NUMBER' as const, min: 1900, max: new Date().getFullYear() + 2 } },
      text('parcelId', 'Parcel ID', 120), { key: 'valuationDate', label: 'Valuation date', required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      text('classification', 'Classification', 200), money('totalAssessedValue', 'Assessed value'), money('taxableValue', 'Taxable value'), ratio('assessmentRatio', 'Assessment ratio'),
      money('billAmount', 'Bill amount'), ratio('effectiveTaxRate', 'Effective tax rate'), text('exemptions', 'Exemptions (separate with commas)', 500),
      { key: 'affirmed', label: DOCUMENT_FACTS_AFFIRMATION, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes, I affirm this', value: 'YES' }] } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '')), allowNotSure: false, sensitivity: 'FINANCIAL',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function documentFactsResult(userId: string, propertyId: string, launch: { sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-tax-document-facts-permission', title: 'A contributor or owner can confirm tax facts', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  if (!(await isPrimaryOwner(userId, propertyId))) {
    return { status: 'BLOCKED', reasonCode: 'PROPERTY_TAX_DOCUMENT_FACTS_OWNER_ONLY', blocks: [{ type: 'SUMMARY', id: 'property-tax-document-facts-owner-only', title: 'Only the home\'s primary owner can do this', body: 'Property tax records are kept for the home\'s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const options = await documentOptions(propertyId);
  if (!options.length) {
    return unavailable('PROPERTY_TAX_DOCUMENT_NONE_ON_FILE', 'No tax document is waiting in your home records',
      'This uses a tax notice or bill that is already in your home records as the type tax document and not yet confirmed. Ask cannot upload a file: add it to your home records (or retype it there), then ask again. Nothing has changed.');
  }
  const contextVersion = listVersion(propertyId, options);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_TAX_DOCUMENT_FACTS_INPUT_REQUIRED', contextVersion,
      parameters: { documentFactsLaunch: { sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'property-tax-document-facts-input', title: 'Confirm tax facts from a document on file', body: 'Nothing has been saved yet; you will review every value first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(options, contextVersion)], suggestions: [],
    };
  }
  const parsed = parseDocumentFactsAnswer(supplied);
  if (!parsed.success) {
    const reason = {
      AFFIRMATION: ['Affirm to continue', 'Confirming needs your affirmation of the statement shown. Nothing has changed.'],
      NO_FACTS: ['Enter at least one value', 'Enter a parcel, assessment or bill value from the document. Nothing has changed.'],
      FUTURE_DATE: ['Check the valuation date', 'A valuation date cannot be in the future. Nothing has changed.'],
      INVALID: ['Check the details', 'Fill in what the form asks for; a ratio is between 0 and 1. Nothing has changed.'],
    }[parsed.reason];
    return unavailable(`PROPERTY_TAX_DOCUMENT_FACTS_${parsed.reason === 'INVALID' ? 'INPUT_INVALID' : parsed.reason}`, reason[0], reason[1]);
  }
  const d = parsed.data;
  const chosen = options.find((option) => option.id === d.sourceRecordId);
  if (!chosen) return unavailable('PROPERTY_TAX_DOCUMENT_NOT_OFFERED', 'Choose a document from the list', 'That document is not an active, scanned tax document that is still waiting to be confirmed. Nothing has changed.');
  const reviewVersion = optionVersion(propertyId, chosen);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PROPERTY_TAX_DOCUMENT_FACTS_CONFIRMATION_REQUIRED', contextVersion: reviewVersion,
    parameters: { documentFactsForm: supplied, documentFactsContextVersion: reviewVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'property-tax-document-facts-review', title: 'Confirm these tax facts?', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `property-tax-document-facts-${sha(JSON.stringify(supplied)).slice(0, 12)}-1`, version: 1, title: 'Confirm these tax facts?',
      description: `${DOCUMENT_FACTS_AFFIRMATION} The values are your own reading of the document. Nothing is filed.`,
      fields: [{ label: 'Document', value: chosen.title }, { label: 'Kind', value: DOCUMENT_KIND_LABELS[d.kind] }, ...d.summary],
      editableFields: [], confirmLabel: 'Confirm the tax facts', consentText: 'I affirm this use of my tax document and these confirmed values.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(options, contextVersion, supplied)], suggestions: [],
  };
}

export async function confirmDocumentFacts(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  let intakeId = propertyId;
  try {
    if (!(await isPrimaryOwner(userId, propertyId))) throw stale('Only the home\'s primary owner can do this.', 'ASK_PERMISSION_REQUIRED');
    const parsed = parseDocumentFactsAnswer(parameters.documentFactsForm);
    if (!parsed.success) throw stale('The tax facts to confirm are invalid.');
    const d = parsed.data;
    const chosen = (await documentOptions(propertyId)).find((option) => option.id === d.sourceRecordId);
    if (!chosen) throw stale('That document is no longer waiting to be confirmed. Review it again and try again.');
    if (parameters.documentFactsContextVersion !== optionVersion(propertyId, chosen)) {
      throw stale('This document changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const intake: any = await propertyTaxDocumentIntakeService.confirmFromRecord({
      propertyId, userId, recordId: d.sourceRecordId, kind: d.kind, affirmed: true,
      fields: d.fields as Array<{ fieldKey: string; value: unknown }> as never, expectedIntakeUpdatedAt: chosen.intakeUpdatedAt,
    });
    intakeId = intake?.id ?? intakeId;
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PROPERTY_TAX_DOCUMENT_FACTS_CONFIRMED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `property-tax-document-facts-${intakeId}`, title: 'Tax facts confirmed', status: 'COMPLETED',
      description: 'The values you reviewed are your confirmed tax facts, and the document is marked verified. Cozy did not read the document and nothing was filed.', details: [], actions: [{ ...back, style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'property-tax-document-facts-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The facts were saved. The answer you were viewing could not refresh automatically, so ask for it again to see them.' });
  }
  return { result, artifactType: 'PROPERTY_TAX_DOCUMENT_INTAKE', artifactId: intakeId, refreshedExecutions: refresh.refreshedExecutions };
}
