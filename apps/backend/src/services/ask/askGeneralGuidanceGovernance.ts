// BICC-ANS-013 / ANS-014 / GATE-007 / GATE-011 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md): the governance layer over the authored
// general-guidance catalogue. General guidance is authored content, never model-generated, so it is validated by deterministic lint and human review, not
// by a judge (BICC-EVAL-014). This module holds the contract and the lint; it records what a human still has to do and never claims a review happened.
import type { AskGeneralGuidanceEntry } from './askGeneralGuidanceCatalog';

export type GuidanceReviewStatus = 'PENDING' | 'APPROVED';

export interface GuidanceGovernance {
  /** The stable topic family; the frozen taxonomy and the held-out coverage measure group by it. */
  topicFamily: string;
  /** A role until a person is named (owner decision 2026-11-22). */
  owner: string;
  /** Where the guidance comes from. 'UNRECORDED' is a recorded gap, not a claim. */
  evidenceBasis: string;
  scope: string;
  exclusions: readonly string[];
  /** The professional or safety boundary the entry must keep visible. */
  boundary: string;
  /** A human safety/professional-boundary review. PENDING until a person approves it. */
  safetyReview: { status: GuidanceReviewStatus; reviewer: string; reviewedOn: string | null };
  /** An editorial review by a person other than the author. PENDING until a person approves it. */
  editorialReview: { status: GuidanceReviewStatus; reviewer: string; reviewedOn: string | null };
  lastAuthored: string;
  nextReview: string;
}

export const GUIDANCE_ROLES = Object.freeze({ owner: 'Ask Product Owner', safetyReviewer: 'Home Safety/Policy Reviewer', editor: 'Ask Evaluation Reviewer' } as const);

/** D02: topics that authored general guidance never covers. They are named so coverage can never claim them. */
export const EXCLUDED_GUIDANCE_TOPICS = Object.freeze([
  { topic: 'personalized-legal-advice', reason: 'Legal interpretation is a professional boundary.' },
  { topic: 'personalized-medical-advice', reason: 'Medical advice is outside Ask.' },
  { topic: 'personalized-tax-advice', reason: 'Tax filing and personalized tax advice are outside Ask (registered tax operations are separate).' },
  { topic: 'personalized-lending-advice', reason: 'Lending decisions are outside authored guidance (registered Loan Estimate and refinance operations are separate).' },
  { topic: 'insurance-coverage-determination', reason: 'Whether a loss is covered depends on the policy and the insurer.' },
  { topic: 'structural-gas-electrical-fire-diagnosis', reason: 'Diagnosis of safety-critical conditions needs a qualified professional; emergencies use the emergency boundary.' },
] as const);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Claims authored general guidance must never make: it is not about the person's own home and never diagnoses, guarantees or certifies.
const PROHIBITED_CLAIMS: ReadonlyArray<readonly [string, RegExp]> = [
  ['a claim about the person\'s own home ("your home", "you have a ..."); general second-person instructions are allowed', /\b(?:your (?:home|house|property|roof|furnace|boiler|water heater|basement|attic|system|unit|policy|alarms?)|you (?:probably |likely )?have (?:a|an|some) )/i],
  ['a diagnosis', /\b(?:diagnos(?:e|is|ed)|you probably have|is definitely|must be (?:a|the))\b/i],
  ['a guarantee', /\b(?:guarantee[sd]?|always safe|never fails?|will not fail)\b/i],
  ['a code-compliance or certification determination', /\b(?:code[- ]compliant|meets code|passes inspection|is up to code)\b/i],
  ['a coverage determination', /\b(?:is covered|will be covered|your policy covers)\b/i],
  ['a model-generated marker', /\b(?:as an ai|language model|i think)\b/i],
];

export interface GuidanceLintResult { errors: string[]; warnings: string[] }

const overlap = (a: readonly string[], b: readonly string[]): number => {
  const left = new Set(a.map((k) => k.toLowerCase())); const right = new Set(b.map((k) => k.toLowerCase()));
  let shared = 0; for (const k of left) if (right.has(k)) shared += 1;
  return left.size && right.size ? shared / Math.min(left.size, right.size) : 0;
};

export function lintGuidanceCatalog(catalog: readonly AskGeneralGuidanceEntry[], options: { now?: Date } = {}): GuidanceLintResult {
  const errors: string[] = []; const warnings: string[] = [];
  const now = options.now ?? new Date();
  const ids = new Set<string>();
  for (const entry of catalog) {
    const label = `Entry ${entry.id}`;
    if (ids.has(entry.id)) errors.push(`${label}: duplicate id.`);
    ids.add(entry.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) errors.push(`${label}: id must be a stable kebab-case identifier.`);
    if (!entry.title.trim() || !entry.guidance.trim()) errors.push(`${label}: title and guidance are required.`);
    if (!entry.keywords.length) errors.push(`${label}: keywords are required.`);
    for (const [name, pattern] of PROHIBITED_CLAIMS) if (pattern.test(entry.guidance)) errors.push(`${label}: guidance makes ${name}.`);
    const g = entry.governance;
    if (!g) { errors.push(`${label}: governance metadata is required (ANS-014).`); continue; }
    for (const field of ['topicFamily', 'owner', 'evidenceBasis', 'scope', 'boundary'] as const) if (!String(g[field] ?? '').trim()) errors.push(`${label}: governance.${field} is required.`);
    if (!g.exclusions.length) errors.push(`${label}: governance.exclusions must name what the entry does not cover.`);
    for (const date of [g.lastAuthored, g.nextReview]) if (!ISO_DATE.test(date)) errors.push(`${label}: dates must be ISO (YYYY-MM-DD).`);
    if (ISO_DATE.test(g.lastAuthored) && ISO_DATE.test(g.nextReview) && g.nextReview <= g.lastAuthored) errors.push(`${label}: nextReview must be after lastAuthored.`);
    if (ISO_DATE.test(g.nextReview) && new Date(`${g.nextReview}T00:00:00Z`).getTime() < now.getTime()) errors.push(`${label}: review is overdue (nextReview ${g.nextReview}).`);
    for (const review of [g.safetyReview, g.editorialReview]) {
      if (review.status === 'APPROVED' && (!review.reviewedOn || !ISO_DATE.test(review.reviewedOn))) errors.push(`${label}: an APPROVED review needs a review date.`);
      if (review.status === 'PENDING' && review.reviewedOn) errors.push(`${label}: a PENDING review cannot carry a review date.`);
    }
    // Recorded human gaps are warnings: the gate that needs them (GATE-007/GATE-011) is not met until they are cleared.
    if (g.evidenceBasis === 'UNRECORDED') warnings.push(`${label}: evidence basis is UNRECORDED.`);
    if (g.safetyReview.status !== 'APPROVED') warnings.push(`${label}: safety/professional-boundary review is pending.`);
    if (g.editorialReview.status !== 'APPROVED') warnings.push(`${label}: editorial review by a person other than the author is pending.`);
  }
  // Duplicate and conflict checks: two entries that share most of their keywords will fight for the same questions.
  for (let i = 0; i < catalog.length; i += 1) for (let j = i + 1; j < catalog.length; j += 1) {
    if (overlap(catalog[i].keywords, catalog[j].keywords) >= 0.7) errors.push(`Entries ${catalog[i].id} and ${catalog[j].id}: keyword overlap is too high; they would conflict.`);
  }
  return { errors, warnings };
}

export interface GuidanceCoverageReport {
  topicFamilies: Array<{ topicFamily: string; entries: string[] }>;
  excludedTopics: ReadonlyArray<{ topic: string; reason: string }>;
  entryCount: number;
  approvedForPublication: number;
  pendingHumanReview: number;
}

/** What the catalogue covers, what it deliberately excludes, and how much still needs a human. Excluded topics are never reported as covered. */
export function guidanceCatalogueReport(catalog: readonly AskGeneralGuidanceEntry[]): GuidanceCoverageReport {
  const families = new Map<string, string[]>();
  for (const entry of catalog) { const family = entry.governance?.topicFamily ?? 'UNGOVERNED'; families.set(family, [...(families.get(family) ?? []), entry.id]); }
  const approved = catalog.filter((entry) => entry.governance?.safetyReview.status === 'APPROVED' && entry.governance?.editorialReview.status === 'APPROVED').length;
  return {
    topicFamilies: [...families.entries()].map(([topicFamily, entries]) => ({ topicFamily, entries })).sort((a, b) => a.topicFamily.localeCompare(b.topicFamily)),
    excludedTopics: EXCLUDED_GUIDANCE_TOPICS,
    entryCount: catalog.length,
    approvedForPublication: approved,
    pendingHumanReview: catalog.length - approved,
  };
}
