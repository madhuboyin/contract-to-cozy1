// Appeal evidence inside Ask, from a link (FRD v1.367). Reached only by the declared actions on the appeal readiness answer, through the property tax
// comparable command's capability and confirm registrations (one operation, two kinds of evidence record). The write is
// propertyTaxAppealReadinessService.upsertEvidence, the route's own call, behind a review and a confirmation. The evidence service and the reviewed rules are
// the primary account holder's, so a contributor who is not is told before a form. Saving is confirming, as on the desktop: the review says so, says Cozy did
// not read the link, and that nothing is filed.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { propertyTaxAppealReadinessService } from '../../propertyTax/propertyTaxAppealReadiness.service';
import {
  EVIDENCE_CAPTURE_KEY, EVIDENCE_DECISION_LABELS, EVIDENCE_KIND_SPEC, EVIDENCE_MESSAGES, parseEvidenceAnswer, type EvidenceDraft, type EvidenceKind,
} from '../support/propertyTaxEvidenceCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const database = prisma as any;
const back = { id: 'property-tax-comparable-back', label: 'Back to my appeal', interactionType: 'START_WORKFLOW' as const, message: 'Show my property tax appeal readiness', operationId: 'PROPERTY_TAX_APPEAL_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'property-tax-evidence-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

export interface EvidenceLaunch { kind: EvidenceKind; sourceExecutionId: string | null }

interface ExistingEvidence { id: string; updatedAt: Date; title: string; factsJson: unknown; sourceUrl: string | null }
async function existingEvidence(propertyId: string, evidenceKey: string): Promise<ExistingEvidence | null> {
  return database.propertyTaxAppealEvidence.findUnique({
    where: { propertyId_evidenceKey: { propertyId, evidenceKey } }, select: { id: true, updatedAt: true, title: true, factsJson: true, sourceUrl: true },
  });
}
/** Bound to the reviewed rule, the evidence row this would replace (or its absence) and its last update, so a rule release or a desktop edit stales a review. */
const versionOf = (propertyId: string, evidenceKey: string, ruleProfileId: string, existing: ExistingEvidence | null) =>
  sha(`tax-evidence:${propertyId}:${evidenceKey}:${ruleProfileId}:${existing ? `${existing.id}:${existing.updatedAt.toISOString()}` : 'none'}`);

async function isPrimaryOwner(userId: string, propertyId: string) {
  return Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
}

function formCapture(kind: EvidenceKind, contextVersion: string, decisions: readonly string[], entered: Record<string, unknown> = {}): AskCaptureRequest {
  const spec = EVIDENCE_KIND_SPEC[kind];
  const text = (key: string, label: string, max: number, required = true, help?: string) => ({ key, label, helpText: help, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const source = text('sourceUrl', 'Link to the notice or record (https)', 2_000, true, 'A web address you can open. Cozy does not read it.');
  const fields: unknown[] = spec.type === 'FACTUAL_ERROR' ? [
    text('claimedClassification', 'The tax class you say is correct', 120),
    { key: 'officialRecordMismatch', label: 'Does the official record show a different class?', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes, the official record shows a different class', value: 'YES' }, { label: 'No, it matches', value: 'NO' }] } },
    text('description', 'What you found (optional)', 2_000, false), source,
  ] : spec.type === 'EXEMPTION_DECISION' ? [
    text('programName', 'Exemption program', 200),
    { key: 'decisionType', label: 'What the notice says', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: decisions.map((value) => ({ label: EVIDENCE_DECISION_LABELS[value] ?? value, value })) } },
    { key: 'noticeDate', label: 'Notice date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    text('description', 'Anything to add (optional)', 2_000, false), source,
  ] : [
    text('description', 'The condition as of the valuation date', 2_000, true, 'State what was true of the property on the valuation date.'), source,
  ];
  return {
    requirementId: 'property-tax-evidence-inputs', captureKey: EVIDENCE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.type === 'CONDITION' ? 'Add supporting condition evidence' : spec.type === 'FACTUAL_ERROR' ? 'Add tax class evidence' : 'Add the exemption decision',
    question: 'What does the record say, and where can it be seen?',
    helpText: 'Enter only what the source shows. Saving it counts it as confirmed, and it replaces the evidence you saved earlier for this. Cozy does not read the link and nothing is filed.',
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '')), allowNotSure: false, sensitivity: 'FINANCIAL',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

const factsLine = (facts: unknown): string => {
  const record = facts && typeof facts === 'object' ? facts as Record<string, unknown> : {};
  return Object.entries(record).map(([key, value]) => `${key}: ${String(value)}`).join('; ');
};

export async function evidenceCommandResult(userId: string, propertyId: string, launch: EvidenceLaunch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-tax-evidence-permission', title: 'A contributor or owner can add evidence', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  if (!(await isPrimaryOwner(userId, propertyId))) {
    return { status: 'BLOCKED', reasonCode: 'PROPERTY_TAX_EVIDENCE_OWNER_ONLY', blocks: [{ type: 'SUMMARY', id: 'property-tax-evidence-owner-only', title: 'Only the home\'s primary owner can do this', body: 'Property tax appeal evidence is kept for the home\'s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const spec = EVIDENCE_KIND_SPEC[launch.kind];
  const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, spec.ground);
  if (readiness.status === 'NOT_COVERED') return unavailable('PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE', 'Reviewed appeal rules are not available for this property', 'Evidence is recorded against a reviewed appeal rule. Nothing has changed.');
  if (!readiness.ruleProfile || (readiness.reviewedGrounds ?? []).every((ground: { code: string }) => ground.code !== spec.ground)) {
    return unavailable('PROPERTY_TAX_GROUND_NOT_COVERED', 'The reviewed rule does not cover this ground', 'The active reviewed appeal rule does not list this ground, so evidence for it is not recorded. Nothing has changed.');
  }
  const accepted: string[] = Array.isArray(readiness.ground?.requirements?.acceptedDecisionTypes) ? readiness.ground.requirements.acceptedDecisionTypes.map(String) : Object.keys(EVIDENCE_DECISION_LABELS);
  const existing = await existingEvidence(propertyId, spec.evidenceKey);
  const contextVersion = versionOf(propertyId, spec.evidenceKey, readiness.ruleProfile.id, existing);
  const launchParameters = { evidenceLaunch: { kind: launch.kind, sourceExecutionId: launch.sourceExecutionId } };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_TAX_EVIDENCE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'property-tax-evidence-input', title: `Add ${spec.label}`, body: 'Nothing has been saved yet; you will review it first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(launch.kind, contextVersion, accepted)], suggestions: [],
    };
  }
  const parsed = parseEvidenceAnswer(launch.kind, supplied, accepted);
  if (!parsed.success) {
    const reason = {
      URL: ['Use a web address', 'The source must be an http or https address you can open. Nothing has changed.'],
      NO_MISMATCH: ['That does not support a factual-error claim', 'If the official record matches the class you stated, there is no factual error to record. Nothing has changed.'],
      FUTURE: ['Check the notice date', 'A notice cannot be dated in the future. Nothing has changed.'],
      DECISION: ['Choose what the notice says', 'Choose one of the decisions the reviewed rule accepts. Nothing has changed.'],
      INVALID: ['Check the details', 'Fill in what the form asks for. Nothing has changed.'],
    }[parsed.reason];
    return unavailable(`PROPERTY_TAX_EVIDENCE_${parsed.reason === 'INVALID' ? 'INPUT_INVALID' : parsed.reason}`, reason[0], reason[1]);
  }
  const d: EvidenceDraft = parsed.data;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const optional = d.type === 'CONDITION';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PROPERTY_TAX_EVIDENCE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { evidenceKind: launch.kind, evidenceForm: supplied, evidenceContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'property-tax-evidence-review', title: `Save this ${spec.label}?`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `property-tax-evidence-${sha(`${launch.kind}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1, title: `Save this ${spec.label}?`,
      description: `${optional
        ? 'This is optional supporting evidence. It does not by itself satisfy the assessed-value ground, which needs qualified comparables.'
        : 'This is the evidence the reviewed rule asks for on this ground.'} Saving counts it as confirmed. Cozy did not read the link and nothing is filed.${existing ? ' It replaces the evidence you saved earlier for this.' : ''}`,
      fields: [
        ...d.summary, ...(d.description && d.type !== 'CONDITION' ? [{ label: 'Notes', value: d.description }] : []), { label: 'Source', value: d.sourceUrl },
        ...(existing ? [{ label: 'Replaces', value: `${factsLine(existing.factsJson)}${existing.sourceUrl ? ` (${existing.sourceUrl})` : ''}` }] : []),
      ],
      editableFields: [], confirmLabel: 'Save the evidence', consentText: 'I authorize saving this evidence to my property tax appeal.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(launch.kind, contextVersion, accepted, supplied)], suggestions: [],
  };
}

export async function confirmEvidence(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  const kind = parameters.evidenceKind as EvidenceKind | undefined;
  if (!kind || !(kind in EVIDENCE_MESSAGES)) throw stale('The evidence to save is invalid.');
  const spec = EVIDENCE_KIND_SPEC[kind];
  try {
    if (!(await isPrimaryOwner(userId, propertyId))) throw stale('Only the home\'s primary owner can do this.', 'ASK_PERMISSION_REQUIRED');
    const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, spec.ground);
    if (!readiness.ruleProfile) throw stale('Reviewed appeal rules are no longer available. Review it again and try again.');
    const existing = await existingEvidence(propertyId, spec.evidenceKey);
    if (parameters.evidenceContextVersion !== versionOf(propertyId, spec.evidenceKey, readiness.ruleProfile.id, existing)) {
      throw stale('Your evidence changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const accepted: string[] = Array.isArray(readiness.ground?.requirements?.acceptedDecisionTypes) ? readiness.ground.requirements.acceptedDecisionTypes.map(String) : Object.keys(EVIDENCE_DECISION_LABELS);
    const parsed = parseEvidenceAnswer(kind, parameters.evidenceForm, accepted);
    if (!parsed.success) throw stale('The evidence to save is invalid.');
    const d = parsed.data;
    const access = await ensurePropertyAccess(userId, propertyId);
    await propertyTaxAppealReadinessService.upsertEvidence({
      propertyId, userId, role: access.role, evidenceKey: d.evidenceKey, ground: d.ground, type: d.type, title: d.title,
      ...(d.description ? { description: d.description } : {}), facts: d.facts, sourceUrl: d.sourceUrl,
    });
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PROPERTY_TAX_EVIDENCE_SAVED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `property-tax-evidence-${propertyId}`, title: 'Evidence saved', status: 'COMPLETED', description: 'It counts as confirmed in your appeal readiness. Cozy did not read the link and nothing was filed.', details: [], actions: [{ ...back, style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'property-tax-evidence-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The evidence was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_TAX_APPEAL_EVIDENCE', artifactId: spec.evidenceKey, refreshedExecutions: refresh.refreshedExecutions };
}
