// Inspection finding decisions inside Ask (register P2 "Inspection Hub"; FRD v1.340). Pure: declared messages, action ids and the state rules.
//
// Accept as work, dismiss and resolve already exist (INSPECTION_FINDING_UPDATE). Added here: keep an eye on a finding (the page's Monitor disposition),
// and, for a pre-listing report, the seller's plan for a finding: fix it, disclose it with a price adjustment, or disclose it with a credit.
import { z } from 'zod';

export const INSPECTION_FINDING_ENTITY_TYPE = 'INSPECTION_FINDING';
export const INSPECTION_FINDING_DECISION_MESSAGES = {
  MONITOR: 'Keep an eye on this inspection finding.',
  ALREADY_RESOLVED: 'Mark this inspection finding as already resolved.',
  NOT_APPLICABLE: 'Mark this inspection finding as not applicable to my home.',
  DUPLICATE: 'Mark this inspection finding as a duplicate of other work.',
  DISMISS: 'Dismiss this inspection finding from the report under review.',
  EDIT: 'Edit the details of this inspection finding.',
  CORRECT: 'Correct the extracted details of this inspection finding.',
  FIX: 'Plan to fix this inspection finding before listing.',
  DISCLOSE_PRICE_ADJUST: 'Disclose this inspection finding and adjust the price.',
  DISCLOSE_CREDIT: 'Disclose this inspection finding and offer a credit.',
} as const;
export type InspectionFindingDecisionKind = keyof typeof INSPECTION_FINDING_DECISION_MESSAGES;
export const INSPECTION_FINDING_DECISION_ACTION_IDS = {
  MONITOR: 'inspection-finding-monitor', ALREADY_RESOLVED: 'inspection-finding-already-resolved', NOT_APPLICABLE: 'inspection-finding-not-applicable', DUPLICATE: 'inspection-finding-duplicate', DISMISS: 'inspection-finding-dismiss', EDIT: 'inspection-finding-edit', CORRECT: 'inspection-finding-correct', FIX: 'inspection-finding-fix', DISCLOSE_PRICE_ADJUST: 'inspection-finding-disclose-price', DISCLOSE_CREDIT: 'inspection-finding-disclose-credit',
} as const;
/** The two kinds that open a form (v1.446): edit a finding's details on a report not yet confirmed, or correct a wrong extraction on a confirmed one. */
export const INSPECTION_FINDING_EDIT_KINDS = ['EDIT', 'CORRECT'] as const;
export const isInspectionFindingEditKind = (kind: string): kind is (typeof INSPECTION_FINDING_EDIT_KINDS)[number] => (INSPECTION_FINDING_EDIT_KINDS as readonly string[]).includes(kind);
export const INSPECTION_FINDING_EDIT_CAPTURE_KEY = 'INSPECTION_FINDING_EDIT_INPUTS';
/** The Duplicate decision's form (v1.456): the page asks for a raw work-item id; Ask offers the home's other open work to pick from. */
export const INSPECTION_FINDING_DUPLICATE_CAPTURE_KEY = 'INSPECTION_FINDING_DUPLICATE_INPUTS';
export const InspectionFindingDuplicateSchema = z.object({ target: z.string().trim().min(1).max(100) }).strict();
export const INSPECTION_SEVERITIES = ['SAFETY', 'MAJOR', 'MINOR', 'MONITOR', 'INFORMATIONAL'] as const;
export const INSPECTION_SEVERITY_LABELS: Record<string, string> = { SAFETY: 'Safety', MAJOR: 'Major', MINOR: 'Minor', MONITOR: 'Monitor', INFORMATIONAL: 'Informational' };
export const INSPECTION_HOME_SYSTEMS = ['ROOF', 'EXTERIOR', 'FOUNDATION', 'BASEMENT_CRAWLSPACE', 'STRUCTURAL', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'INTERIOR', 'ATTIC_INSULATION', 'APPLIANCES', 'GARAGE', 'SITE_GRADING'] as const;
export const INSPECTION_HOME_SYSTEM_LABELS: Record<string, string> = {
  ROOF: 'Roof', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation', BASEMENT_CRAWLSPACE: 'Basement / Crawlspace', STRUCTURAL: 'Structural', ELECTRICAL: 'Electrical', PLUMBING: 'Plumbing', HVAC: 'HVAC',
  INTERIOR: 'Interior', ATTIC_INSULATION: 'Attic / Insulation', APPLIANCES: 'Appliances', GARAGE: 'Garage', SITE_GRADING: 'Site / Grading',
};
const blank = (value: unknown) => (value === '' || value === undefined || value === null ? undefined : value);
/** The page's edit sheet: severity, home system, interpretation and the cost range in dollars. A blank keeps what is saved (the page cannot clear a field either). */
export const InspectionFindingEditSchema = z.object({
  severity: z.preprocess(blank, z.enum(INSPECTION_SEVERITIES).optional()),
  homeSystem: z.preprocess(blank, z.enum(INSPECTION_HOME_SYSTEMS).optional()),
  aiInterpretation: z.preprocess(blank, z.string().trim().min(1).max(2000).optional()),
  costLow: z.preprocess(blank, z.coerce.number().min(0).max(10_000_000).optional()),
  costHigh: z.preprocess(blank, z.coerce.number().min(0).max(10_000_000).optional()),
}).strict();
export type InspectionFindingEditAnswer = z.infer<typeof InspectionFindingEditSchema>;

export const INSPECTION_FINDINGS_OF_REPORT_MESSAGE = 'Show the findings in this inspection report.';
export const INSPECTION_FINDINGS_OF_REPORT_ACTION_ID = 'inspection-report-findings';
export const inspectionFindingDecisionKindFromMessage = (message: string): InspectionFindingDecisionKind | null =>
  ((Object.entries(INSPECTION_FINDING_DECISION_MESSAGES) as Array<[InspectionFindingDecisionKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const INSPECTION_FIX_DISCLOSE_LABELS: Record<string, string> = { FIX: 'Plan to fix', DISCLOSE_PRICE_ADJUST: 'Disclose with a price adjustment', DISCLOSE_CREDIT: 'Disclose with a credit' };

/** The seller's recorded plan, stored by the page as JSON in the finding's resolution notes; null when none, or when the notes are something else. */
export function parseFixDisclosure(notes: string | null | undefined): { decision: string; estimatedFixCostCents?: number; sellerNote?: string } | null {
  if (!notes) return null;
  try {
    const value = JSON.parse(notes) as Record<string, unknown>;
    if (value && typeof value === 'object' && typeof value.fixDisclosure === 'string') {
      return {
        decision: value.fixDisclosure,
        ...(typeof value.estimatedFixCostCents === 'number' ? { estimatedFixCostCents: value.estimatedFixCostCents } : {}),
        ...(typeof value.sellerNote === 'string' ? { sellerNote: value.sellerNote } : {}),
      };
    }
  } catch { /* ordinary notes */ }
  return null;
}

interface FindingState { status: string; workDisposition: string; resolutionNotes: string | null; severity?: string }
interface ReportState { status: string; reportType: string }
/**
 * The decisions a finding allows now. Monitor: an open finding on a confirmed report not already accepted or monitored. Fix or disclose: a pre-listing
 * report, an open or resolved finding, and no resolution notes of its own, because saving a plan replaces the notes field (the page does the same; Ask
 * does not overwrite someone's notes).
 */
export function inspectionFindingDecisionKinds(report: ReportState, finding: FindingState): InspectionFindingDecisionKind[] {
  // Before the report is confirmed the page lets a finding's details be edited or the finding dismissed (a dismissed finding cannot be either); nothing else is decided yet.
  if (report.status === 'REVIEW_PENDING') return finding.status !== 'DISMISSED' ? ['EDIT', 'DISMISS'] : [];
  if (report.status !== 'CONFIRMED') return [];
  const kinds: InspectionFindingDecisionKind[] = [];
  if (finding.status === 'OPEN' && finding.workDisposition !== 'MONITOR' && finding.workDisposition !== 'ACCEPTED') kinds.push('MONITOR');
  // The page's Duplicate: an open finding, not already marked duplicate. An informational finding never becomes work, so there is nothing to merge (the page would record the label and merge nothing).
  const duplicable = finding.status === 'OPEN' && finding.workDisposition !== 'DUPLICATE' && finding.severity !== 'INFORMATIONAL';
  // Already resolved and not applicable close the finding and write its resolution note, as the page's own buttons do, so a finding that already carries notes (a plan included) is left alone.
  if (finding.status === 'OPEN' && !finding.resolutionNotes) kinds.push('ALREADY_RESOLVED', 'NOT_APPLICABLE');
  if (duplicable) kinds.push('DUPLICATE');
  if (report.reportType === 'PRE_LISTING' && (finding.status === 'OPEN' || finding.status === 'RESOLVED')) {
    const plan = parseFixDisclosure(finding.resolutionNotes);
    if (!finding.resolutionNotes || plan) {
      for (const kind of ['FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT'] as const) if (plan?.decision !== kind) kinds.push(kind);
    }
  }
  // The page's "Correct extraction" on an open finding: fix a wrongly extracted detail.
  if (finding.status === 'OPEN') kinds.push('CORRECT');
  return kinds;
}

// ── open-items filters (FRD v1.341) ────────────────────────────────────────────────────────────────────────────
const SEVERITY_WORDS: Array<[RegExp, string, string]> = [
  [/\bsafety\b/i, 'SAFETY', 'safety'], [/\bmajor\b/i, 'MAJOR', 'major'], [/\bminor\b/i, 'MINOR', 'minor'],
  [/\bmonitor(?:ing)?\b/i, 'MONITOR', 'monitor'], [/\binformational\b/i, 'INFORMATIONAL', 'informational'],
];
const SYSTEM_WORDS: Array<[RegExp, string, string]> = [
  [/\broof(?:ing)?\b/i, 'ROOF', 'roof'], [/\bexterior\b/i, 'EXTERIOR', 'exterior'], [/\bfoundation\b/i, 'FOUNDATION', 'foundation'],
  [/\b(?:basement|crawl ?space)\b/i, 'BASEMENT_CRAWLSPACE', 'basement or crawlspace'], [/\bstructural\b/i, 'STRUCTURAL', 'structural'],
  [/\belectrical\b/i, 'ELECTRICAL', 'electrical'], [/\bplumbing\b/i, 'PLUMBING', 'plumbing'], [/\bhvac\b|\bheating\b|\bcooling\b/i, 'HVAC', 'HVAC'],
  [/\binterior\b/i, 'INTERIOR', 'interior'], [/\battic\b|\binsulation\b/i, 'ATTIC_INSULATION', 'attic and insulation'],
  [/\bappliances?\b/i, 'APPLIANCES', 'appliance'], [/\bgarage\b/i, 'GARAGE', 'garage'], [/\bgrading\b|\bdrainage\b/i, 'SITE_GRADING', 'site grading'],
];
/** The severity and home-system filters the page's open-items list offers, read from what the person typed. A message with neither is unfiltered. */
export function inspectionFindingFilters(message: string): { severity: string | null; homeSystem: string | null; label: string } {
  const sev = SEVERITY_WORDS.find(([pattern]) => pattern.test(message));
  const sys = SYSTEM_WORDS.find(([pattern]) => pattern.test(message));
  return { severity: sev?.[1] ?? null, homeSystem: sys?.[1] ?? null, label: [sev?.[2], sys?.[2]].filter(Boolean).join(' ') };
}
