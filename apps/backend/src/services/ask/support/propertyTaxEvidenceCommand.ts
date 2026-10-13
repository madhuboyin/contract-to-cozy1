// Appeal evidence inside Ask, from a link (FRD v1.367; design docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md slice 1). Pure: the declared
// messages, action ids, the three evidence shapes readiness reads and their validation. Only the shapes the desktop form saves are here:
//   - a factual error about the tax class (FACTUAL_ERROR; the TAX_CLASS ground),
//   - an exemption decision (EXEMPTION_DECISION; the EXEMPTION ground),
//   - optional supporting condition evidence (CONDITION; any ground).
// The ASSESSED_VALUE ground needs qualified comparables, not an evidence row; a condition statement never satisfies it, which the review says.
// A source is a web address. Saving is confirming, as on the desktop, so the review is the person's one chance to check the values. Cozy does not read the
// source and files nothing.
import { z } from 'zod';
import { isHttpUrl } from '../../propertyTax/propertyTaxUrl';

export const EVIDENCE_MESSAGES = {
  CLASS: 'Add class evidence to my property tax appeal.',
  EXEMPTION: 'Add an exemption decision to my property tax appeal.',
  CONDITION_VALUE: 'Add supporting condition evidence to my property tax appeal for the assessed value.',
  CONDITION_CLASS: 'Add supporting condition evidence to my property tax appeal for the tax class.',
  CONDITION_EXEMPTION: 'Add supporting condition evidence to my property tax appeal for the exemption.',
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_MESSAGES;
export const EVIDENCE_ACTION_IDS = {
  CLASS: 'property-tax-evidence-class', EXEMPTION: 'property-tax-evidence-exemption', CONDITION: 'property-tax-evidence-condition',
} as const;
export const EVIDENCE_CAPTURE_KEY = 'PROPERTY_TAX_EVIDENCE_ADD';
export const evidenceKindFromMessage = (message: string): EvidenceKind | null =>
  ((Object.entries(EVIDENCE_MESSAGES) as Array<[EvidenceKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

export type AppealGround = 'ASSESSED_VALUE' | 'TAX_CLASS' | 'EXEMPTION';
type EvidenceType = 'FACTUAL_ERROR' | 'EXEMPTION_DECISION' | 'CONDITION';
export const EVIDENCE_KIND_SPEC: Record<EvidenceKind, { ground: AppealGround; type: EvidenceType; evidenceKey: string; title: string; label: string }> = {
  // The desktop saves one row per ground under `<ground>-primary`, so Ask replaces what the desktop saved and the reverse. A condition statement on another
  // ground has its own key so it never overwrites that ground's required evidence.
  CLASS: { ground: 'TAX_CLASS', type: 'FACTUAL_ERROR', evidenceKey: 'tax_class-primary', title: 'Tax class factual record', label: 'tax class evidence' },
  EXEMPTION: { ground: 'EXEMPTION', type: 'EXEMPTION_DECISION', evidenceKey: 'exemption-primary', title: 'Exemption decision notice', label: 'exemption decision' },
  CONDITION_VALUE: { ground: 'ASSESSED_VALUE', type: 'CONDITION', evidenceKey: 'assessed_value-primary', title: 'Condition or valuation evidence', label: 'condition evidence' },
  CONDITION_CLASS: { ground: 'TAX_CLASS', type: 'CONDITION', evidenceKey: 'tax_class-condition', title: 'Condition or valuation evidence', label: 'condition evidence' },
  CONDITION_EXEMPTION: { ground: 'EXEMPTION', type: 'CONDITION', evidenceKey: 'exemption-condition', title: 'Condition or valuation evidence', label: 'condition evidence' },
};
export const conditionKindForGround = (ground: AppealGround): EvidenceKind =>
  ground === 'TAX_CLASS' ? 'CONDITION_CLASS' : ground === 'EXEMPTION' ? 'CONDITION_EXEMPTION' : 'CONDITION_VALUE';
export const EVIDENCE_DECISION_LABELS: Record<string, string> = { DENIED: 'Denied', REVOKED: 'Revoked', REDUCED: 'Reduced', OMITTED: 'Omitted' };

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
// Exactly one source (FRD v1.368): a web address, or a Home Record on file (eligibility is the service's, propertyTaxEvidenceSource.ts).
const sourceUrl = z.preprocess(blank, z.string().trim().max(2_000).optional());
const sourceRecordId = z.preprocess(blank, z.string().trim().min(1).max(160).optional());
const description = z.preprocess(blank, z.string().trim().max(2_000).optional());
const schemas = {
  FACTUAL_ERROR: z.object({ sourceUrl, sourceRecordId, description, claimedClassification: z.string().trim().min(1).max(120), officialRecordMismatch: z.enum(['YES', 'NO']) }).strict(),
  EXEMPTION_DECISION: z.object({ sourceUrl, sourceRecordId, description, programName: z.string().trim().min(1).max(200), decisionType: z.string().trim().min(1).max(40), noticeDate: exactDate }).strict(),
  CONDITION: z.object({ sourceUrl, sourceRecordId, description: z.string().trim().min(3).max(2_000) }).strict(),
};

export interface EvidenceDraft {
  evidenceKey: string; ground: AppealGround; type: EvidenceType; title: string;
  description: string | null; facts: Record<string, unknown>; sourceUrl: string | null; sourceRecordId: string | null; summary: Array<{ label: string; value: string }>;
}
export type EvidenceParse = { success: true; data: EvidenceDraft } | { success: false; reason: 'INVALID' | 'URL' | 'SOURCE' | 'NO_MISMATCH' | 'FUTURE' | 'DECISION' };

/** Validates a submitted form (or a stored confirmation parameter). `acceptedDecisions` is the reviewed rule's list for the exemption ground. */
export function parseEvidenceAnswer(kind: EvidenceKind, answer: unknown, acceptedDecisions: readonly string[] = Object.keys(EVIDENCE_DECISION_LABELS), today = new Date().toISOString().slice(0, 10)): EvidenceParse {
  const spec = EVIDENCE_KIND_SPEC[kind];
  const parsed = schemas[spec.type].safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const d = parsed.data as Record<string, any>;
  const hasUrl = typeof d.sourceUrl === 'string' && d.sourceUrl.length > 0;
  const hasRecord = typeof d.sourceRecordId === 'string' && d.sourceRecordId.length > 0;
  if (hasUrl === hasRecord) return { success: false, reason: 'SOURCE' };
  if (hasUrl && !isHttpUrl(d.sourceUrl)) return { success: false, reason: 'URL' };
  const common = {
    evidenceKey: spec.evidenceKey, ground: spec.ground, type: spec.type, title: spec.title,
    sourceUrl: hasUrl ? d.sourceUrl as string : null, sourceRecordId: hasRecord ? d.sourceRecordId as string : null,
  };
  if (spec.type === 'FACTUAL_ERROR') {
    // The desktop used to store this as true without asking. A "no" means nothing supports a factual-error claim, so nothing is stored.
    if (d.officialRecordMismatch !== 'YES') return { success: false, reason: 'NO_MISMATCH' };
    return { success: true, data: { ...common, description: d.description ?? null, facts: { claimedClassification: d.claimedClassification, officialRecordMismatch: true },
      summary: [{ label: 'Class you say is correct', value: d.claimedClassification }, { label: 'The official record shows a different class', value: 'Yes' }] } };
  }
  if (spec.type === 'EXEMPTION_DECISION') {
    if (!acceptedDecisions.includes(d.decisionType)) return { success: false, reason: 'DECISION' };
    if (d.noticeDate > today) return { success: false, reason: 'FUTURE' };
    return { success: true, data: { ...common, description: d.description ?? null, facts: { programName: d.programName, decisionType: d.decisionType, noticeDate: d.noticeDate },
      summary: [{ label: 'Program', value: d.programName }, { label: 'Decision', value: EVIDENCE_DECISION_LABELS[d.decisionType] ?? d.decisionType }, { label: 'Notice date', value: d.noticeDate }] } };
  }
  return { success: true, data: { ...common, description: d.description, facts: { conditionAsOfValuationDate: d.description }, summary: [{ label: 'Condition as of the valuation date', value: d.description }] } };
}
