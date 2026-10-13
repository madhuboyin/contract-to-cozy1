// Inspection finding decisions inside Ask (register P2 "Inspection Hub"; FRD v1.340). Pure: declared messages, action ids and the state rules.
//
// Accept as work, dismiss and resolve already exist (INSPECTION_FINDING_UPDATE). Added here: keep an eye on a finding (the page's Monitor disposition),
// and, for a pre-listing report, the seller's plan for a finding: fix it, disclose it with a price adjustment, or disclose it with a credit.
export const INSPECTION_FINDING_ENTITY_TYPE = 'INSPECTION_FINDING';
export const INSPECTION_FINDING_DECISION_MESSAGES = {
  MONITOR: 'Keep an eye on this inspection finding.',
  FIX: 'Plan to fix this inspection finding before listing.',
  DISCLOSE_PRICE_ADJUST: 'Disclose this inspection finding and adjust the price.',
  DISCLOSE_CREDIT: 'Disclose this inspection finding and offer a credit.',
} as const;
export type InspectionFindingDecisionKind = keyof typeof INSPECTION_FINDING_DECISION_MESSAGES;
export const INSPECTION_FINDING_DECISION_ACTION_IDS = {
  MONITOR: 'inspection-finding-monitor', FIX: 'inspection-finding-fix', DISCLOSE_PRICE_ADJUST: 'inspection-finding-disclose-price', DISCLOSE_CREDIT: 'inspection-finding-disclose-credit',
} as const;
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

interface FindingState { status: string; workDisposition: string; resolutionNotes: string | null }
interface ReportState { status: string; reportType: string }
/**
 * The decisions a finding allows now. Monitor: an open finding on a confirmed report not already accepted or monitored. Fix or disclose: a pre-listing
 * report, an open or resolved finding, and no resolution notes of its own, because saving a plan replaces the notes field (the page does the same; Ask
 * does not overwrite someone's notes).
 */
export function inspectionFindingDecisionKinds(report: ReportState, finding: FindingState): InspectionFindingDecisionKind[] {
  if (report.status !== 'CONFIRMED') return [];
  const kinds: InspectionFindingDecisionKind[] = [];
  if (finding.status === 'OPEN' && finding.workDisposition !== 'MONITOR' && finding.workDisposition !== 'ACCEPTED') kinds.push('MONITOR');
  if (report.reportType === 'PRE_LISTING' && (finding.status === 'OPEN' || finding.status === 'RESOLVED')) {
    const plan = parseFixDisclosure(finding.resolutionNotes);
    if (!finding.resolutionNotes || plan) {
      for (const kind of ['FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT'] as const) if (plan?.decision !== kind) kinds.push(kind);
    }
  }
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
