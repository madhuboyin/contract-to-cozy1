// Cross-domain semantic FRD §15 `IN_DOMAIN_NOT_UNDERSTOOD`: the message is clearly about the authorised home, yet no producer
// yielded a validated plan. The recovery states the subject evidence that WAS verified, offers at most three materially
// distinct questions Ask can answer, and asks one focused question. It never shows home facts, never claims a capability is
// absent, and is counted as an understanding-coverage defect (RECOVERY_OUTCOMES.IN_DOMAIN_NOT_UNDERSTOOD).
//
// Pure: the caller decides where it runs (only after every deterministic and provider path has produced nothing).
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { collectCrossDomainRecoveryEvidence } from '../semantic/crossDomain/crossDomainPlanBuilder';
import { RECOVERY_OUTCOMES } from './recoveryOutcomes';

/** FRD §15: no more than three materially distinct candidate jobs. */
export const IN_DOMAIN_RECOVERY_MAX_CANDIDATES = 3;
const MAX_QUOTED_SPANS = 3;
const MAX_QUOTED_SPAN_LENGTH = 32;

interface RecoveryArea {
  readonly areaId: string;
  /** Homeowner wording for the verified subject. */
  readonly label: string;
  /** Fragments of a registry semantic id (never prompt text); the area owns a lexeme when its id contains one. */
  readonly idFragments: readonly string[];
  /** Prompts Ask answers deterministically today; a test proves each one still parses to a validated plan (FRD §20). */
  readonly candidates: readonly string[];
}

const AREAS: readonly RecoveryArea[] = Object.freeze([
  { areaId: 'warranty', label: 'warranties', idFragments: ['warrant', 'coverage'], candidates: ['Which items have no warranty?', 'Which items are having warranty?'] },
  { areaId: 'maintenance', label: 'maintenance', idFragments: ['maintenance'], candidates: ['What maintenance is due next month?', 'Show plumbing and electrical tasks'] },
  { areaId: 'inventory', label: 'items and rooms', idFragments: ['inventory', 'room'], candidates: ['Which appliances have overdue maintenance?', 'How many appliances are not having warranty?'] },
  { areaId: 'claims', label: 'claims', idFragments: ['claim'], candidates: ['Which claims are still open?', 'Show the documents for my water-damage claim'] },
  { areaId: 'insurance', label: 'insurance', idFragments: ['insurance', 'polic'], candidates: ['What is my insurance deductible?'] },
  { areaId: 'tax', label: 'property tax', idFragments: ['tax'], candidates: ['Which property tax bills are still unpaid?', "Compare this year's tax bill with last year's"] },
  { areaId: 'projects', label: 'projects and quotes', idFragments: ['project', 'permit', 'quote'], candidates: ['Which active projects still need a permit?'] },
  { areaId: 'risk', label: 'recalls and inspections', idFragments: ['recall', 'inspection', 'environment', 'risk'], candidates: ['Do I have recalls and which items are affected?', 'Which inspection findings still need action?'] },
  { areaId: 'buyer', label: 'your home purchase', idFragments: ['buyer'], candidates: ['What buyer deadlines are due before closing?'] },
  { areaId: 'seller', label: 'selling your home', idFragments: ['sale', 'listing'], candidates: ['What do I still need to finish before listing the house?'] },
  { areaId: 'events', label: 'repairs and spending', idFragments: ['home_event', 'repair', 'actual_cost'], candidates: ['How much did I spend on repairs last year?'] },
  { areaId: 'saved', label: 'saved items', idFragments: ['saved'], candidates: ['Show my saved items'] },
]);

/** Subject words too generic to prove the message is about a specific part of the home. */
const WEAK_SUBJECT_PHRASES: ReadonlySet<string> = new Set(['thing', 'things', 'home', 'house', 'sell', 'bill', 'bills', 'property', 'tax', 'taxes', 'assessed', 'assessment', 'assessments']);
const SUBJECT_ROLES: ReadonlySet<string> = new Set(['ENTITY', 'FIELD', 'RELATION', 'CATEGORY']);

export interface InDomainNotUnderstoodAssessment {
  readonly areaIds: readonly string[];
  /** Verified subject words, as the homeowner would read them. */
  readonly subjectPhrases: readonly string[];
  readonly candidatePrompts: readonly string[];
  /** The homeowner's own words that no registered meaning accounted for (bounded). */
  readonly unrecognisedText: readonly string[];
  readonly unresolvedSpanCount: number;
}

/**
 * Returns an assessment only when the message carries verified subject evidence (a registered entity, field, relation or
 * category that is specific enough to name a part of the home). Anything else stays with the existing generic recovery.
 */
export function assessInDomainNotUnderstood(rawText: string): InDomainNotUnderstoodAssessment | null {
  const { lexemes, unresolvedSpans } = collectCrossDomainRecoveryEvidence(rawText);
  const subjects = lexemes.filter((l) => SUBJECT_ROLES.has(l.role) && !WEAK_SUBJECT_PHRASES.has(l.phrase));
  if (subjects.length === 0) return null;

  const scores = new Map<string, number>();
  for (const subject of subjects) {
    const area = AREAS.find((a) => a.idFragments.some((fragment) => subject.semanticId.includes(fragment)));
    if (area) scores.set(area.areaId, (scores.get(area.areaId) ?? 0) + 1);
  }
  if (scores.size === 0) return null;
  const ranked = AREAS.filter((a) => scores.has(a.areaId)).sort((a, b) => (scores.get(b.areaId) ?? 0) - (scores.get(a.areaId) ?? 0));

  // Materially distinct: round-robin across areas so one area cannot fill all three slots.
  const candidatePrompts: string[] = [];
  for (let depth = 0; candidatePrompts.length < IN_DOMAIN_RECOVERY_MAX_CANDIDATES; depth += 1) {
    let added = false;
    for (const area of ranked) {
      const prompt = area.candidates[depth];
      if (prompt && candidatePrompts.length < IN_DOMAIN_RECOVERY_MAX_CANDIDATES) { candidatePrompts.push(prompt); added = true; }
    }
    if (!added) break;
  }

  const seen = new Set<string>();
  const subjectPhrases = subjects.map((s) => s.phrase).filter((phrase) => (seen.has(phrase) ? false : (seen.add(phrase), true))).slice(0, 3);
  const unrecognisedText = unresolvedSpans
    .map((span) => span.text.trim())
    .filter((text) => text.length > 0 && text.length <= MAX_QUOTED_SPAN_LENGTH)
    .slice(0, MAX_QUOTED_SPANS);
  return { areaIds: ranked.map((a) => a.areaId), subjectPhrases, candidatePrompts, unrecognisedText, unresolvedSpanCount: unresolvedSpans.length };
}

export function buildInDomainNotUnderstoodResult(assessment: InDomainNotUnderstoodAssessment): AskOperationResult {
  const entry = RECOVERY_OUTCOMES.IN_DOMAIN_NOT_UNDERSTOOD;
  const labels = AREAS.filter((a) => assessment.areaIds.includes(a.areaId)).map((a) => a.label).slice(0, 2);
  const subject = assessment.subjectPhrases.map((phrase) => `“${phrase}”`).join(', ');
  const unrecognised = assessment.unrecognisedText.length > 0
    ? ` I didn’t recognise ${assessment.unrecognisedText.map((text) => `“${text}”`).join(', ')}.`
    : '';
  const options = assessment.candidatePrompts.map((prompt) => `• ${prompt}`).join('\n');
  const body = [
    `This looks like a question about your ${labels.join(' or ')} (I picked up ${subject}), but I couldn’t tell what you want to know about it.${unrecognised}`,
    options ? `Did you mean one of these?\n${options}` : '',
    'Or tell me in a few words what you’d like to know.',
  ].filter(Boolean).join('\n\n');
  return {
    status: 'READY_WITH_LIMITATIONS',
    reasonCode: entry.reasonCode,
    // recoveryArea is a bounded area id (never message text) used only for coverage-gap telemetry.
    parameters: { sources: [], recoveryArea: assessment.areaIds[0] ?? 'unknown' },
    blocks: [{ type: 'SUMMARY', id: 'recovery-in-domain-not-understood', title: entry.copy?.title ?? 'I couldn’t tell what you want to know', body, tone: 'CAUTION', actions: [] } as AskPresentationBlock],
    suggestions: [],
  };
}

/** The handler-facing entry: the specific recovery when the evidence supports it, otherwise null (caller keeps its existing generic reply). */
export function inDomainNotUnderstoodResult(rawText: string): AskOperationResult | null {
  const assessment = assessInDomainNotUnderstood(rawText);
  return assessment ? buildInDomainNotUnderstoodResult(assessment) : null;
}
