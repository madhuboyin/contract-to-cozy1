// Confirming a jurisdiction profile, recording a sourced requirement determination and deciding an HOA document reading, from Ask. Three kinds of the existing
// RENOVATION_READINESS_COMMAND, each a declared action with a form, a review card and a confirmation, through the same services the routes call
// (upsertAuthorityProfile, determineRequirement, reviewHoaDocumentExtraction) and the routes' own schemas re-run at confirm time. Contributor floor, as the routes.
//
// Each records what the household REPORTS about what an authority, an association or a professional decided. Ask does not open the source, contact the
// authority or read the document, and every review says so. Not here: waiving a condition (the desktop has no such control; see support/renovationAuthorityWrites).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { listAuthorityProfiles, determineRequirement, upsertAuthorityProfile } from '../../renovationRequirement.service';
import { reviewHoaDocumentExtraction } from '../../renovationComplianceWorkflow.service';
import { DetermineRenovationRequirementSchema, UpsertRenovationAuthorityProfileSchema } from '../../../validators/renovationRequirement.validators';
import { ReviewHoaDocumentExtractionSchema } from '../../../validators/renovationComplianceWorkflow.validators';
import {
  DETERMINATIONS, DETERMINATION_LABELS, HOA_DECISIONS, HOA_DECISION_LABELS, SOURCE_TYPES, SOURCE_TYPE_LABELS, TRUTH_LAYERS, TRUTH_LAYER_LABELS,
  authorityProfileInput, determinationInput, hoaReadingInput, hoaReadingProblem,
} from '../support/renovationAuthorityWrites';
import { READINESS_FORM_CAPTURE_KEYS, parseReadinessFormAnswer, type ReadinessCommandKind, type ReadinessFormValues } from '../support/renovationReadinessCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export type AuthorityWriteKind = 'AUTHORITY_PROFILE' | 'DETERMINE_REQUIREMENT' | 'REVIEW_HOA_READING';
export const isAuthorityWriteKind = (kind: ReadinessCommandKind): kind is AuthorityWriteKind => kind === 'AUTHORITY_PROFILE' || kind === 'DETERMINE_REQUIREMENT' || kind === 'REVIEW_HOA_READING';
export interface AuthorityWriteLaunch { kind: AuthorityWriteKind; entityId: string; sourceExecutionId: string | null }

const REPORTED = 'Ask records what you report: who confirmed it and from what source. It does not open the source, contact the authority or read the document.';
const backToReadiness = { id: 'renovation-readiness-back', label: 'Back to readiness', interactionType: 'START_WORKFLOW' as const, message: 'Show my renovation permit readiness', operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'renovation-authority-unavailable', title, body, tone: 'DEFAULT', actions: [backToReadiness] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const titleCase = (value: string | null | undefined) => (value ?? 'unknown').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const clean = (entered: Record<string, unknown>) => Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));

const shortText = (key: string, label: string, max: number, required = false, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
const select = (key: string, label: string, options: Array<{ label: string; value: string }>, required = true) => ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options } });
const capture = (kind: AuthorityWriteKind, contextVersion: string, title: string, question: string, helpText: string, fields: unknown[], entered: Record<string, unknown>): AskCaptureRequest => ({
  requirementId: `renovation-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: READINESS_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
  title, question, helpText, inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: clean(entered), allowNotSure: false, sensitivity: 'STANDARD',
  destinationLabel: 'Used to prepare this record; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
});

const loadCase = async (propertyId: string, caseId: string) => database.renovationCase.findFirst({ where: { id: caseId, propertyId, archivedAt: null }, select: { id: true, name: true, currentScopeVersionId: true } }) as Promise<{ id: string; name: string; currentScopeVersionId: string | null } | null>;
const loadRequirement = async (propertyId: string, id: string) => database.renovationRequirement.findFirst({
  where: { id, propertyId, recordStatus: 'CURRENT' }, select: { id: true, renovationCaseId: true, family: true, question: true, determination: true, isBlocking: true, updatedAt: true },
}) as Promise<{ id: string; renovationCaseId: string; family: string; question: string; determination: string; isBlocking: boolean; updatedAt: Date } | null>;
const loadReading = async (propertyId: string, id: string) => database.hoaApprovalDocumentReview.findFirst({
  where: { id, propertyId }, select: { id: true, renovationCaseId: true, status: true, extractedDecisionStatus: true, extractedConditions: true, extractedExpirationDate: true, extractedReferenceNumber: true, updatedAt: true },
}) as Promise<{ id: string; renovationCaseId: string; status: string; extractedDecisionStatus: string | null; extractedConditions: unknown; extractedExpirationDate: Date | null; extractedReferenceNumber: string | null; updatedAt: Date } | null>;
const candidates = (reading: { extractedConditions: unknown }): Array<{ title?: string; description?: string }> => (Array.isArray(reading.extractedConditions) ? reading.extractedConditions as Array<{ title?: string; description?: string }> : []);

const profileVersion = (caseId: string, latest: { id: string; version: number; status: string } | null) => sha(`authority:PROFILE:${caseId}:${latest?.id ?? 'none'}:${latest?.version ?? 0}:${latest?.status ?? ''}`);
const requirementVersion = (requirement: { id: string; determination: string; updatedAt: Date }) => sha(`requirement:DETERMINE:${requirement.id}:${requirement.determination}:${requirement.updatedAt.toISOString()}`);
const readingVersion = (reading: { id: string; status: string; updatedAt: Date }) => sha(`hoa:REVIEW:${reading.id}:${reading.status}:${reading.updatedAt.toISOString()}`);

export async function authorityWriteResult(userId: string, propertyId: string, role: HouseholdRole, launch: AuthorityWriteLaunch, supplied?: ReadinessFormValues): Promise<AskOperationResult> {
  void role;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `renovation-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  const review = (id: string, title: string, version: string, kind: AuthorityWriteKind, entityId: string, fields: Array<{ label: string; value: string }>, description: string, confirmLabel: string, form: AskCaptureRequest): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: `RENOVATION_${kind}_CONFIRMATION_REQUIRED`, contextVersion: version,
    parameters: { readinessForm: supplied, readinessCommand: { kind, entityId }, readinessContextVersion: version, ...base },
    blocks: [{ type: 'SUMMARY', id: `renovation-${kind.toLowerCase()}-review`, title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(id, { title, description, confirmLabel, fields }), captureRequests: [form], suggestions: [],
  });
  const inputNeeded = (kind: AuthorityWriteKind, version: string, title: string, body: string, form: AskCaptureRequest): AskOperationResult => ({
    status: 'NEEDS_CONTEXT', reasonCode: `RENOVATION_${kind}_INPUT_REQUIRED`, contextVersion: version,
    parameters: { readinessCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
    blocks: [{ type: 'SUMMARY', id: `renovation-${kind.toLowerCase()}-input`, title, body, tone: 'DEFAULT', actions: [] }], captureRequests: [form], suggestions: [],
  });
  const row = (label: string, value: string | null | undefined) => (value ? [{ label, value }] : []);

  if (launch.kind === 'AUTHORITY_PROFILE') {
    const renovationCase = await loadCase(propertyId, launch.entityId);
    if (!renovationCase) return unavailable('RENOVATION_CASE_NOT_FOUND', 'That renovation case is no longer available', 'Ask could not find that case. Nothing has changed.');
    if (!renovationCase.currentScopeVersionId) return unavailable('RENOVATION_SCOPE_MISSING', 'This case has no scope to confirm a jurisdiction for', 'A jurisdiction profile belongs to the case’s current scope, and this case does not have one. Nothing has changed.');
    const profiles = await listAuthorityProfiles(propertyId, renovationCase.id) as Array<{ id: string; version: number; status: string; municipality?: string | null; authorityName?: string | null; authorityWebsite?: string | null; confirmedByName?: string | null; confirmedByOrg?: string | null }>;
    const latest = profiles[0] ?? null;
    const version = profileVersion(renovationCase.id, latest);
    const fields = [
      shortText('municipality', 'City or municipality', 160), shortText('authorityName', 'Permitting authority', 240, true, 'For example the city building department.'),
      shortText('authorityWebsite', 'Authority website', 1000, true, 'The page you relied on, starting with https://.'),
      shortText('confirmedByName', 'Confirmed by (name or title)', 240, false, 'Give a name or an organization.'), shortText('confirmedByOrg', 'Confirming organization', 240),
    ];
    const prefill = latest ? { municipality: latest.municipality ?? '', authorityName: latest.authorityName ?? '', authorityWebsite: latest.authorityWebsite ?? '', confirmedByName: latest.confirmedByName ?? '', confirmedByOrg: latest.confirmedByOrg ?? '' } : {};
    const form = (entered: Record<string, unknown>) => capture('AUTHORITY_PROFILE', version, `Confirm the jurisdiction for ${renovationCase.name}`, 'Which authority governs this work, and who confirmed it?',
      'Record who confirmed the authority and the source used. Nothing is saved until you confirm.', fields, entered);
    if (!supplied) return inputNeeded('AUTHORITY_PROFILE', version, `Confirm the jurisdiction for ${renovationCase.name}`, latest ? 'The last confirmed profile is filled in. Nothing is saved yet.' : 'Nothing has been saved yet.', form(prefill));
    const parsed = parseReadinessFormAnswer('AUTHORITY_PROFILE', supplied);
    if (!parsed.success) return unavailable('RENOVATION_AUTHORITY_PROFILE_INVALID', 'Check the jurisdiction details', 'Give the authority, its website (starting with https://), and who confirmed it.');
    const v = parsed.data as Record<string, any>;
    return review(`profile-${sha(`${renovationCase.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, `Confirm the jurisdiction for ${renovationCase.name}?`, version, 'AUTHORITY_PROFILE', renovationCase.id,
      [{ label: 'Case', value: renovationCase.name }, { label: 'Authority', value: String(v.authorityName) }, ...row('Municipality', v.municipality), { label: 'Source', value: String(v.authorityWebsite) }, ...row('Confirmed by', v.confirmedByName || v.confirmedByOrg)],
      `This records that this authority governs the work, confirmed by the person or organization below, from the website below. ${REPORTED} It replaces the case’s earlier confirmed profile, which stays on record as out of date.`,
      latest ? 'Update the jurisdiction' : 'Confirm the jurisdiction', form(supplied));
  }

  if (launch.kind === 'DETERMINE_REQUIREMENT') {
    const requirement = await loadRequirement(propertyId, launch.entityId);
    if (!requirement) return unavailable('RENOVATION_REQUIREMENT_NOT_FOUND', 'That requirement is no longer available', 'Ask could not find that requirement. Nothing has changed.');
    if (requirement.determination !== 'UNDETERMINED') return unavailable('RENOVATION_REQUIREMENT_ALREADY_DETERMINED', 'That requirement already has a determination', 'Only a requirement still needing research can be determined here. Nothing has changed.');
    const version = requirementVersion(requirement);
    const family = titleCase(requirement.family);
    const form = (entered: Record<string, unknown>) => capture('DETERMINE_REQUIREMENT', version, `Record a determination: ${family}`, 'What did the authority or professional decide, and where is it from?',
      'Advisor results are research candidates. Only a sourced determination establishes a requirement. Nothing is saved until you confirm.', [
        select('determination', 'What was decided', DETERMINATIONS.map((value) => ({ label: DETERMINATION_LABELS[value], value }))),
        select('truthLayer', 'Who established it', TRUTH_LAYERS.map((value) => ({ label: TRUTH_LAYER_LABELS[value], value }))),
        select('sourceType', 'Kind of source', SOURCE_TYPES.map((value) => ({ label: SOURCE_TYPE_LABELS[value], value }))),
        shortText('sourceUrl', 'Source link', 1000, true, 'The page or record you relied on, starting with https://.'), shortText('sourceSection', 'Section or page', 1000),
        shortText('confirmedByName', 'Confirmed by (name or title)', 240, false, 'Give a name or an organization.'), shortText('confirmedByOrg', 'Confirming organization', 240),
        shortText('exactNextAction', 'What happens next', 2000, false, 'Leave blank for the usual next step.'),
      ], entered);
    if (!supplied) return inputNeeded('DETERMINE_REQUIREMENT', version, `Record a determination: ${family}`, `${requirement.question} Nothing has been saved yet.`, form({}));
    const parsed = parseReadinessFormAnswer('DETERMINE_REQUIREMENT', supplied);
    if (!parsed.success) return unavailable('RENOVATION_DETERMINATION_INVALID', 'Check the determination details', 'Choose what was decided and who established it, give the source link (starting with https://), and name who confirmed it.');
    const v = parsed.data as Record<string, any>;
    const notApplicable = v.determination === 'DOES_NOT_APPLY';
    return review(`determine-${sha(`${requirement.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, `Record that this ${notApplicable ? 'does not apply' : 'applies'}?`, version, 'DETERMINE_REQUIREMENT', requirement.id,
      [{ label: 'Requirement', value: family }, { label: 'Decided', value: DETERMINATION_LABELS[v.determination] }, { label: 'Established by', value: TRUTH_LAYER_LABELS[v.truthLayer] }, { label: 'Source', value: `${SOURCE_TYPE_LABELS[v.sourceType]}: ${v.sourceUrl}` },
        ...row('Section', v.sourceSection), ...row('Confirmed by', v.confirmedByName || v.confirmedByOrg)],
      `${REPORTED} ${notApplicable ? 'The readiness check treats a requirement recorded as not applying as satisfied, so it stops blocking this case from starting. If you are not sure, do not record this.' : 'It is recorded as applying to this case and stays with it until its approvals are in place.'} The time you confirm is recorded as when the source was checked.`,
      'Record the determination', form(supplied));
  }

  // REVIEW_HOA_READING
  const reading = await loadReading(propertyId, launch.entityId);
  if (!reading) return unavailable('RENOVATION_HOA_READING_NOT_FOUND', 'That reading is no longer available', 'Ask could not find that HOA document reading. Nothing has changed.');
  if (reading.status !== 'NEEDS_REVIEW') return unavailable('RENOVATION_HOA_READING_ALREADY_DECIDED', 'That reading has already been decided', 'It was confirmed or rejected before, and cannot be decided again. Nothing has changed.');
  const found = candidates(reading);
  const version = readingVersion(reading);
  const options = found.map((entry, index) => ({ label: `${entry.title ?? 'Condition'}: ${(entry.description ?? '').slice(0, 140)}`.trim(), value: String(index) }));
  const form = (entered: Record<string, unknown>) => capture('REVIEW_HOA_READING', version, 'Review this reading of an HOA document', 'Do these details match the document?',
    'Extracted decisions and conditions are candidates until a homeowner reviews them. Check them against the document first. Nothing is saved until you confirm.', [
      select('decision', 'Your review', HOA_DECISIONS.map((value) => ({ label: HOA_DECISION_LABELS[value], value }))),
      ...(options.length ? [{ key: 'selectedConditions', label: 'Conditions to keep', helpText: 'Leave blank to keep all of them.', required: false, inputSchema: { type: 'MULTI_SELECT' as const, options, maxItems: 50 } }] : []),
      { key: 'reviewNotes', label: 'What you checked', required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 5000 } },
      shortText('sourceReference', 'Where in the document (optional)', 1000),
    ], entered);
  const summaryBody = `Candidate decision: ${titleCase(reading.extractedDecisionStatus)}${reading.extractedReferenceNumber ? `. Reference ${reading.extractedReferenceNumber}` : ''}${reading.extractedExpirationDate ? `. Candidate expiration ${humanDate(reading.extractedExpirationDate) ?? ''}` : ''}. ${found.length} candidate condition${found.length === 1 ? '' : 's'}.`;
  if (!supplied) return inputNeeded('REVIEW_HOA_READING', version, 'Review this reading of an HOA document', `${summaryBody} Nothing has been saved yet.`, form({}));
  const parsed = parseReadinessFormAnswer('REVIEW_HOA_READING', supplied);
  if (!parsed.success) return unavailable('RENOVATION_HOA_READING_INVALID', 'Check your review', 'Choose to confirm or reject, and say what you checked.');
  const v = parsed.data as any;
  const problem = hoaReadingProblem(v, { extractedDecisionStatus: reading.extractedDecisionStatus, conditionCount: found.length });
  if (problem) return unavailable('RENOVATION_HOA_READING_SELECTION_INVALID', 'Check the conditions you kept', problem);
  const kept = v.decision === 'CONFIRMED' ? (v.selectedConditions?.length ? new Set<number>(v.selectedConditions).size : found.length) : 0;
  return review(`hoa-${sha(`${reading.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, v.decision === 'CONFIRMED' ? 'Confirm what was read from this HOA document?' : 'Reject this reading?', version, 'REVIEW_HOA_READING', reading.id,
    [{ label: 'Your review', value: HOA_DECISION_LABELS[v.decision] }, ...(v.decision === 'CONFIRMED' ? [{ label: 'Candidate decision', value: titleCase(reading.extractedDecisionStatus) }, { label: 'Conditions kept', value: String(kept) }] : []), { label: 'What you checked', value: v.reviewNotes }],
    v.decision === 'CONFIRMED'
      ? `This records the candidate decision above as the association’s documented decision on the HOA approval, and adds the conditions you kept as blocking items to resolve before closeout. Ask has not read the document: these are candidates read from it automatically, so check them against the document first. A reading can be decided only once.`
      : 'Nothing from this reading is recorded on the HOA approval. The reading is marked rejected, and it can be decided only once.',
    v.decision === 'CONFIRMED' ? 'Confirm the reading' : 'Reject the reading', form(supplied));
}

export async function confirmAuthorityWrite(ctx: ConfirmCapabilityContext, kind: AuthorityWriteKind, entityId: string): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  const role = ctx.access.role as HouseholdRole;
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner can change this record.', 'ASK_PERMISSION_REQUIRED');
  const checked = parseReadinessFormAnswer(kind, parameters.readinessForm);
  if (!checked.success) throw stale('The details to save are invalid.');
  const form = checked.data as Record<string, any>;
  let title: string; let description: string; let caseName: string | null = null;
  try {
    if (kind === 'AUTHORITY_PROFILE') {
      const renovationCase = await loadCase(propertyId, entityId);
      if (!renovationCase || !renovationCase.currentScopeVersionId) throw stale('That renovation case or its scope is no longer available.');
      const profiles = await listAuthorityProfiles(propertyId, renovationCase.id) as Array<{ id: string; version: number; status: string }>;
      if (parameters.readinessContextVersion !== profileVersion(renovationCase.id, profiles[0] ?? null)) throw stale('The jurisdiction changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const input = authorityProfileInput(form as never);
      const routeCheck = UpsertRenovationAuthorityProfileSchema.safeParse(input);
      if (!routeCheck.success) throw stale(routeCheck.error.issues[0]?.message ?? 'The details to save are invalid.');
      await upsertAuthorityProfile(propertyId, renovationCase.id, userId, routeCheck.data, role);
      caseName = renovationCase.name; title = 'Jurisdiction confirmed'; description = 'It is recorded on this case as you reported it. Ask did not check the website.';
    } else if (kind === 'DETERMINE_REQUIREMENT') {
      const requirement = await loadRequirement(propertyId, entityId);
      if (!requirement) throw stale('That requirement is no longer available.');
      if (parameters.readinessContextVersion !== requirementVersion(requirement)) throw stale('This requirement changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (requirement.determination !== 'UNDETERMINED') throw stale('That requirement already has a determination.');
      const routeCheck = DetermineRenovationRequirementSchema.safeParse(determinationInput(form as never, requirement));
      if (!routeCheck.success) throw stale(routeCheck.error.issues[0]?.message ?? 'The details to save are invalid.');
      await determineRequirement(propertyId, requirement.renovationCaseId, requirement.id, userId, routeCheck.data, role);
      caseName = (await loadCase(propertyId, requirement.renovationCaseId))?.name ?? null;
      title = 'Determination recorded'; description = 'It is recorded as you reported it, with its source. Ask did not check the source.';
    } else {
      const reading = await loadReading(propertyId, entityId);
      if (!reading) throw stale('That reading is no longer available.');
      if (parameters.readinessContextVersion !== readingVersion(reading)) throw stale('This reading changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (reading.status !== 'NEEDS_REVIEW') throw stale('That reading has already been decided.');
      const problem = hoaReadingProblem(form as never, { extractedDecisionStatus: reading.extractedDecisionStatus, conditionCount: candidates(reading).length });
      if (problem) throw stale(problem);
      const routeCheck = ReviewHoaDocumentExtractionSchema.safeParse(hoaReadingInput(form as never));
      if (!routeCheck.success) throw stale(routeCheck.error.issues[0]?.message ?? 'The details to save are invalid.');
      await reviewHoaDocumentExtraction(propertyId, reading.renovationCaseId, reading.id, userId, routeCheck.data, role);
      caseName = (await loadCase(propertyId, reading.renovationCaseId))?.name ?? null;
      title = form.decision === 'CONFIRMED' ? 'Reading confirmed' : 'Reading rejected';
      description = form.decision === 'CONFIRMED' ? 'The documented decision and the conditions you kept are on the HOA approval, and the conditions now block closeout until resolved.' : 'Nothing from this reading was recorded on the HOA approval.';
    }
  } catch (error) {
    // The services' refusals are written for a person; Ask codes pass through.
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    if (error instanceof Error && (error as { statusCode?: unknown }).statusCode) throw stale(error.message);
    throw error;
  }
  const toRequirements = kind !== 'REVIEW_HOA_READING';
  const next = { ...backToReadiness, label: toRequirements ? 'See requirements' : 'See approvals', message: `${toRequirements ? 'Show the requirements for my renovation' : 'Show the compliance status for my renovation'} ${(caseName ?? '').slice(0, 120)}.`.replace(' .', '.') };
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `RENOVATION_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `renovation-${kind.toLowerCase()}-${entityId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...next, style: 'PRIMARY' as const }] }], suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'LIMITATION', id: `renovation-${kind.toLowerCase()}-refresh-failed`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  return { result, artifactId: entityId, artifactType: 'RENOVATION_READINESS_ITEM', refreshedExecutions: refresh.refreshedExecutions };
}
