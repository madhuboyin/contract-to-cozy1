// More permit steps inside Ask (register "Permits"; FRD v1.488): look for permit records at the local office, check for possible unpermitted work, record
// work you may not have a permit for, mark a flag as being researched, start a plan to fix a flag, and add, update or remove an inspection step.
// Pure: the declared action ids and messages, the forms and their validation, and the bodies the canonical permit service takes.
//
// These are extra actions of the existing PERMIT_TRACKER_COMMAND (no new operation or registry entry), so they keep its contributor floor, which is also
// the floor of the routes they mirror. Not here: recording an OFFICIAL status (it needs authority evidence), a flag's closing statuses (confirmed,
// fixed, dismissed: the service requires evidence documents or a matched permit), photo readiness checks and the disclosure export.
import { z } from 'zod';
import { PERMIT_WORK_TYPES } from './permitTrackerCommand';

export const PERMIT_EXTRA_ACTION_IDS = {
  FETCH: 'permit-fetch-records',
  SCAN: 'permit-flags-scan',
  FLAG_ADD: 'permit-flag-add',
  FLAG_RESEARCH: 'permit-flag-research',
  FLAG_REMEDIATE: 'permit-flag-remediate',
  INSPECTION_ADD: 'permit-inspection-add',
  INSPECTION_UPDATE: 'permit-inspection-update',
  INSPECTION_REMOVE: 'permit-inspection-remove',
  FLAG_RESOLVE: 'permit-flag-resolve',
  OFFICIAL_STATUS: 'permit-official-status',
  DISCLOSURE_EXPORT: 'permit-disclosure-export',
} as const;
export type PermitExtraActionId = typeof PERMIT_EXTRA_ACTION_IDS[keyof typeof PERMIT_EXTRA_ACTION_IDS];
export const isPermitExtraActionId = (value: string | null | undefined): value is PermitExtraActionId =>
  Object.values(PERMIT_EXTRA_ACTION_IDS).includes(value as PermitExtraActionId);
export const PERMIT_EXTRA_MESSAGES: Record<PermitExtraActionId, string> = {
  'permit-fetch-records': 'Look for permit records from my local permit office.',
  'permit-flags-scan': 'Check my home for possible unpermitted work.',
  'permit-flag-add': 'Record work I may not have a permit for.',
  'permit-flag-research': 'Mark this possible unpermitted work as being researched.',
  'permit-flag-remediate': 'Start a plan to sort out this possible unpermitted work.',
  'permit-inspection-add': 'Add an inspection step to this permit.',
  'permit-inspection-update': 'Update this inspection step.',
  'permit-inspection-remove': 'Remove this inspection step.',
  'permit-flag-resolve': 'Close out this possible unpermitted work with evidence.',
  'permit-official-status': 'Record the permitting office’s official status for this permit with evidence.',
  'permit-disclosure-export': 'Create a permit disclosure report.',
};
export const PERMIT_DISCLOSURE_STATUS_ACTION_ID = 'permit-disclosure-status';
export const PERMIT_DISCLOSURE_STATUS_MESSAGE = 'Check on my permit disclosure report.';
export const PERMIT_DISCLOSURE_ENTITY_TYPE = 'PERMIT_DISCLOSURE_EXPORT';
/** A read, not a command: it is answered by the Permit Tracker read (PERMIT_TRACKER_STATUS) and writes nothing. */
export const PERMIT_FETCH_STATUS_ACTION_ID = 'permit-fetch-status';
export const PERMIT_FETCH_STATUS_MESSAGE = 'Check on the permit-record search.';
export const PERMIT_FLAG_ENTITY_TYPE = 'PERMIT_UNPERMITTED_FLAG';
export const PERMIT_INSPECTION_ENTITY_TYPE = 'PERMIT_INSPECTION_MILESTONE';
export const PERMIT_EXTRA_CAPTURE_KEY = 'PERMIT_EXTRA_INPUTS';
/** Which entity each action is launched on: the property (list level), a permit, a flag or an inspection step. */
export const PERMIT_EXTRA_TARGETS: Record<PermitExtraActionId, 'PROPERTY' | 'PERMIT' | 'FLAG' | 'INSPECTION'> = {
  'permit-fetch-records': 'PROPERTY', 'permit-flags-scan': 'PROPERTY', 'permit-flag-add': 'PROPERTY', 'permit-flag-research': 'FLAG', 'permit-flag-remediate': 'FLAG',
  'permit-inspection-add': 'PERMIT', 'permit-inspection-update': 'INSPECTION', 'permit-inspection-remove': 'INSPECTION',
  'permit-flag-resolve': 'FLAG', 'permit-official-status': 'PERMIT', 'permit-disclosure-export': 'PROPERTY',
};
/** Inspection steps are addressed as "<permitId>:<milestoneId>", because the canonical calls take both. */
export const inspectionEntityId = (permitId: string, milestoneId: string) => `${permitId}:${milestoneId}`;
export function parseInspectionEntityId(entityId: string | null | undefined): { permitId: string; milestoneId: string } | null {
  const match = /^([^:\s]{1,80}):([^:\s]{1,80})$/.exec(entityId ?? '');
  return match ? { permitId: match[1], milestoneId: match[2] } : null;
}

export const INSPECTION_STAGE_TYPES = ['PLAN_REVIEW', 'PRE_CONSTRUCTION', 'FOUNDATION', 'FRAMING', 'ROUGH_IN', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'INSULATION', 'FINAL', 'OTHER'] as const;
export const INSPECTION_STAGE_LABELS: Record<string, string> = {
  PLAN_REVIEW: 'Plan review', PRE_CONSTRUCTION: 'Before construction', FOUNDATION: 'Foundation', FRAMING: 'Framing', ROUGH_IN: 'Rough-in', ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing', MECHANICAL: 'Mechanical', INSULATION: 'Insulation', FINAL: 'Final', OTHER: 'Other',
};
export const INSPECTION_STATUSES = ['NOT_SCHEDULED', 'SCHEDULED', 'PASSED', 'FAILED', 'PARTIAL', 'CANCELLED'] as const;
export const INSPECTION_STATUS_LABELS: Record<string, string> = {
  NOT_SCHEDULED: 'Not scheduled', SCHEDULED: 'Scheduled', PASSED: 'Passed', FAILED: 'Failed', PARTIAL: 'Partly passed', CANCELLED: 'Cancelled',
};
export const FLAG_RISKS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const FLAG_RISK_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
export const FLAG_ORIGINS = ['CURRENT_OWNER', 'PRIOR_OWNER', 'UNKNOWN'] as const;
export const FLAG_ORIGIN_LABELS: Record<string, string> = { CURRENT_OWNER: 'Done while I owned it', PRIOR_OWNER: 'Done by a previous owner', UNKNOWN: 'Not sure who' };
export const FLAG_STAGES = ['COMPLETED', 'ALREADY_STARTED', 'UNKNOWN'] as const;
export const FLAG_STAGE_LABELS: Record<string, string> = { COMPLETED: 'Finished', ALREADY_STARTED: 'Started, not finished', UNKNOWN: 'Not sure' };

const blank = (value: unknown) => (value === '' || value === null || value === undefined ? undefined : value);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const exactDate = z.union([day, z.object({ precision: z.literal('EXACT_DATE'), value: day }).strict().transform((value) => value.value)]);
const optionalDay = z.preprocess(blank, exactDate.optional());

const FlagAddSchema = z.object({
  workType: z.enum(PERMIT_WORK_TYPES),
  disclosureRisk: z.enum(FLAG_RISKS),
  workOrigin: z.enum(FLAG_ORIGINS),
  workStage: z.enum(FLAG_STAGES),
  workStartedAt: optionalDay,
  workCompletedAt: optionalDay,
  flagReason: optionalText(2000),
}).strict().refine((v) => !v.workStartedAt || !v.workCompletedAt || v.workStartedAt <= v.workCompletedAt, { message: 'Dates out of order', path: ['workCompletedAt'] });
const InspectionAddSchema = z.object({ stageName: z.string().trim().min(1).max(100), stageType: z.enum(INSPECTION_STAGE_TYPES), scheduledDate: optionalDay }).strict();
const InspectionUpdateSchema = z.object({ status: z.enum(INSPECTION_STATUSES), scheduledDate: optionalDay, inspectedDate: optionalDay, inspectorNotes: optionalText(1000) }).strict();
// Closing a flag and recording an official status are evidence-led: the service refuses them without the evidence below, and Ask asks for the same things first.
export const FLAG_OUTCOMES = ['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED', 'REMEDIATED', 'DISMISSED'] as const;
export const FLAG_OUTCOME_LABELS: Record<string, string> = {
  CONFIRMED_PERMITTED: 'It was permitted (an authority record matches)', CONFIRMED_UNPERMITTED: 'It was not permitted (the authority confirmed)',
  REMEDIATED: 'It has been fixed (permit and evidence of the fix)', DISMISSED: 'It does not apply (a false match)',
};
export const OFFICIAL_STATUSES = ['APPLIED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED', 'FINALED', 'EXPIRED', 'VOIDED'] as const;
export const OFFICIAL_SOURCE_TYPES = ['AUTHORITY_OPEN_DATA', 'AUTHORITY_PORTAL', 'AUTHORITY_DOCUMENT', 'AUTHORITY_EMAIL', 'AUTHORITY_REPRESENTATIVE', 'OTHER'] as const;
export const OFFICIAL_SOURCE_LABELS: Record<string, string> = {
  AUTHORITY_OPEN_DATA: 'The authority’s public data', AUTHORITY_PORTAL: 'The authority’s online portal', AUTHORITY_DOCUMENT: 'A document from the authority',
  AUTHORITY_EMAIL: 'An email from the authority', AUTHORITY_REPRESENTATIVE: 'Someone at the authority told me', OTHER: 'Another source',
};
export const OFFICIAL_TRUTH_LAYERS = ['AUTHORITY_CONFIRMED', 'SOURCE_OBSERVED'] as const;
export const OFFICIAL_TRUTH_LABELS: Record<string, string> = { AUTHORITY_CONFIRMED: 'The authority confirmed it', SOURCE_OBSERVED: 'I saw it in the authority’s record' };
export const OFFICIAL_STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied', UNDER_REVIEW: 'Under review', CORRECTION_REQUESTED: 'Corrections requested', RESUBMITTED: 'Resubmitted', ISSUED: 'Issued',
  INSPECTION_PENDING: 'Inspection pending', INSPECTION_FAILED: 'Inspection failed', FINALED: 'Finaled (closed out)', EXPIRED: 'Expired', VOIDED: 'Voided',
};
const FlagResolveSchema = z.object({
  outcome: z.enum(FLAG_OUTCOMES), evidence: z.preprocess(blank, z.string().trim().min(1).max(100).optional()), matchedPermit: z.preprocess(blank, z.string().trim().min(1).max(100).optional()),
  sourceReference: optionalText(1000), observedAt: optionalDay, notes: optionalText(4000),
}).strict();
const OfficialStatusSchema = z.object({
  status: z.enum(OFFICIAL_STATUSES), truthLayer: z.enum(OFFICIAL_TRUTH_LAYERS), sourceType: z.enum(OFFICIAL_SOURCE_TYPES), sourceReference: z.string().trim().min(1).max(1000),
  observedAt: exactDate, evidence: z.preprocess(blank, z.string().trim().min(1).max(100).optional()), authorityReferenceNumber: optionalText(240),
  issueDate: optionalDay, expirationDate: optionalDay, finaledDate: optionalDay,
}).strict();
export type PermitFlagResolveForm = z.infer<typeof FlagResolveSchema>;
export type PermitOfficialStatusForm = z.infer<typeof OfficialStatusSchema>;

/** What is still missing before the service would accept the outcome (the same rules as its retroactive-disposition policy), in plain words. Empty means ready to review. */
export function flagResolveProblems(form: PermitFlagResolveForm, flag: { remediationCaseId: string | null }): string[] {
  const problems: string[] = [];
  const municipal = Boolean(form.evidence && form.sourceReference && form.observedAt);
  if (form.outcome === 'CONFIRMED_PERMITTED' && !form.matchedPermit && !municipal) problems.push('Pick the permit that matches this work, or give the authority’s determination with a record as evidence, where you got it and the date.');
  if (form.outcome === 'CONFIRMED_UNPERMITTED' && !municipal) problems.push('A written determination from the permitting office is needed: pick the record that shows it, say where you got it and give the date. “No permit found” is not enough.');
  if (form.outcome === 'REMEDIATED') {
    if (!flag.remediationCaseId) problems.push('Start a plan for this work first; a fix is recorded against that plan.');
    if (!form.matchedPermit) problems.push('Pick the permit that covers the fix.');
    if (!form.evidence) problems.push('Pick a record that shows the fix was done.');
  }
  if (form.outcome === 'DISMISSED') {
    if (!form.notes) problems.push('Say why this does not apply.');
    if (!form.evidence) problems.push('Pick a record that shows why.');
  }
  return problems;
}
/** What the canonical updateFlag takes. */
export function flagResolveBody(form: PermitFlagResolveForm, existingEvidenceIds: readonly string[]) {
  const authority = form.outcome === 'CONFIRMED_PERMITTED' || form.outcome === 'CONFIRMED_UNPERMITTED';
  const municipal = authority && Boolean(form.evidence && form.sourceReference && form.observedAt);
  return {
    status: form.outcome,
    evidenceDocumentIds: [...new Set([...existingEvidenceIds, ...(form.evidence ? [form.evidence] : [])])],
    ...(form.matchedPermit ? { resolvedByPermitId: form.matchedPermit } : {}),
    ...(municipal ? { researchChannel: 'MUNICIPAL_AUTHORITY' as const, authorityOutcome: form.outcome, authorityObservedAt: form.observedAt } : {}),
    ...(form.sourceReference ? { researchSourceReference: form.sourceReference } : {}),
    ...(form.notes ? { resolutionNotes: form.notes } : {}),
  };
}
/** What is still missing before an official status may be recorded, in plain words. The household's own word is recorded elsewhere; this is the authority's. */
export function officialStatusProblems(form: PermitOfficialStatusForm): string[] {
  const problems: string[] = [];
  if (form.status === 'FINALED' && !form.finaledDate) problems.push('Give the date the authority finaled it.');
  if (form.status === 'ISSUED' && !form.issueDate) problems.push('Give the date the authority issued it.');
  const publicSource = form.sourceType === 'AUTHORITY_OPEN_DATA' || form.sourceType === 'AUTHORITY_PORTAL';
  if (!publicSource && !form.evidence) problems.push('Pick the record that shows it (a letter, email or printout from the authority).');
  return problems;
}
export function officialStatusBody(form: PermitOfficialStatusForm) {
  return {
    status: form.status, truthLayer: form.truthLayer, sourceType: form.sourceType, sourceReference: form.sourceReference, observedAt: noonIso(form.observedAt),
    ...(form.evidence ? { evidenceDocumentId: form.evidence } : {}), ...(form.authorityReferenceNumber ? { authorityReferenceNumber: form.authorityReferenceNumber } : {}),
    ...(form.issueDate ? { issueDate: noonIso(form.issueDate) } : {}), ...(form.expirationDate ? { expirationDate: noonIso(form.expirationDate) } : {}), ...(form.finaledDate ? { finaledDate: noonIso(form.finaledDate) } : {}),
  };
}
const noonIso = (date: string) => `${date}T12:00:00.000Z`;

export type PermitFlagAddForm = z.infer<typeof FlagAddSchema>;
export type PermitInspectionAddForm = z.infer<typeof InspectionAddSchema>;
export type PermitInspectionUpdateForm = z.infer<typeof InspectionUpdateSchema>;

/** Which actions open a form; the form is chosen by the action. */
export const PERMIT_EXTRA_FORM_ACTIONS = ['permit-flag-add', 'permit-inspection-add', 'permit-inspection-update', 'permit-flag-resolve', 'permit-official-status'] as const;
export const permitExtraNeedsForm = (actionId: PermitExtraActionId) => (PERMIT_EXTRA_FORM_ACTIONS as readonly string[]).includes(actionId);

export function parsePermitExtraForm(actionId: PermitExtraActionId, answer: unknown): { success: true; data: Record<string, any> } | { success: false } {
  const schema = actionId === 'permit-flag-add' ? FlagAddSchema : actionId === 'permit-inspection-add' ? InspectionAddSchema : actionId === 'permit-inspection-update' ? InspectionUpdateSchema : actionId === 'permit-flag-resolve' ? FlagResolveSchema : actionId === 'permit-official-status' ? OfficialStatusSchema : null;
  if (!schema) return { success: false };
  const parsed = schema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data as Record<string, any> } : { success: false };
}

const noon = (date: string) => `${date}T12:00:00.000Z`;
/** What the canonical createManualFlag takes: Desktop's own defaults (nothing searched yet, no evidence, no research channel). */
export const permitFlagCreateBody = (form: PermitFlagAddForm) => ({
  workType: form.workType, disclosureRisk: form.disclosureRisk, workOrigin: form.workOrigin, workStage: form.workStage,
  ...(form.workStartedAt ? { workStartedAt: form.workStartedAt } : {}), ...(form.workCompletedAt ? { workCompletedAt: form.workCompletedAt } : {}),
  ...(form.flagReason ? { flagReason: form.flagReason } : {}),
  recordSearchOutcome: 'NOT_SEARCHED' as const, evidenceDocumentIds: [] as string[], researchChannel: 'NONE' as const,
});
export const permitInspectionCreateBody = (form: PermitInspectionAddForm) => ({
  stageName: form.stageName, stageType: form.stageType, status: form.scheduledDate ? 'SCHEDULED' as const : 'NOT_SCHEDULED' as const, isRequired: true,
  ...(form.scheduledDate ? { scheduledDate: noon(form.scheduledDate) } : {}),
});
export const permitInspectionUpdateBody = (form: PermitInspectionUpdateForm) => ({
  status: form.status, ...(form.scheduledDate ? { scheduledDate: noon(form.scheduledDate) } : {}), ...(form.inspectedDate ? { inspectedDate: noon(form.inspectedDate) } : {}),
  ...(form.inspectorNotes ? { inspectorNotes: form.inspectorNotes } : {}),
});
