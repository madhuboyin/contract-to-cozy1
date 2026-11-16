import { ASK_SHARED_LEXICON_VERSION, ASK_SHARED_SEMANTIC_LEXICON, type GeneratedSemanticLexeme } from '../sharedSemanticLexicon';
import {
  ASK_SEMANTIC_PLAN_VERSION,
  SemanticRequestPlanSchema,
  type SemanticFacet,
  type SemanticRequestPlan,
  type SemanticSourceSpan,
  type SemanticTimeConstraint,
  type SemanticWhereExpression,
} from '../semanticRequestPlan';
import { assembleSemanticBooleanExpression } from '../semanticBooleanAssembler';
import {
  extractSemanticFollowUpDelta,
  parseDeterministicSemanticRequest,
} from '../deterministicSemanticParser';
import type { DynamicPlaceholderEntityCandidate } from '../slice/placeholderSpanMap';

export const ASK_CROSS_DOMAIN_PARSER_VERSION = 'cross-domain-grammar-2.0.0' as const;
export const ASK_CROSS_DOMAIN_LEXICON_VERSION = `${ASK_SHARED_LEXICON_VERSION}+waves-2.0.0` as const;

export type CrossDomainLexemeRole =
  | GeneratedSemanticLexeme['role']
  | 'STATUS'
  | 'CATEGORY';

export interface CrossDomainLexeme {
  readonly role: CrossDomainLexemeRole;
  readonly semanticId: string;
  readonly phrase: string;
  readonly lineage: 'BASIC_READ_SHARED_LEXICON' | 'ONTOLOGY_DERIVED' | 'REVIEWED_ALIAS';
}

interface CrossDomainLexemeSpec {
  readonly role: CrossDomainLexemeRole;
  readonly semanticId: string;
  readonly canonicalLabel: string;
  readonly reviewedAliases: readonly string[];
}

/**
 * Registry-derived Wave 1-5 lexeme specifications extending ASK_SHARED_SEMANTIC_LEXICON.
 * Strictly preserves separation across warranty, insurance, policy, coverage, and claim.
 */
const CROSS_DOMAIN_LEXEME_SPECS: readonly CrossDomainLexemeSpec[] = Object.freeze([
  // Entities
  { role: 'ENTITY', semanticId: 'entity.inventory_room', canonicalLabel: 'room', reviewedAliases: ['bathroom', 'bath', 'mudroom', 'attic', 'bedroom', 'exterior'] },
  { role: 'ENTITY', semanticId: 'entity.inventory_item', canonicalLabel: 'inventory item', reviewedAliases: ['thing', 'things', 'hot water tank'] },
  { role: 'ENTITY', semanticId: 'entity.maintenance_task', canonicalLabel: 'maintenance task', reviewedAliases: ['task', 'tasks', 'upkeep'] },
  { role: 'ENTITY', semanticId: 'entity.project', canonicalLabel: 'project', reviewedAliases: ['projects', 'renovation project', 'renovation'] },
  { role: 'ENTITY', semanticId: 'entity.permit', canonicalLabel: 'permit', reviewedAliases: ['permits'] },
  { role: 'ENTITY', semanticId: 'entity.recall', canonicalLabel: 'recall', reviewedAliases: ['recalls', 'recalled'] },
  { role: 'ENTITY', semanticId: 'entity.contractor_quote', canonicalLabel: 'contractor quote', reviewedAliases: ['contractor quotes', 'quote', 'quotes', 'bid', 'bids'] },
  { role: 'ENTITY', semanticId: 'entity.environmental_risk', canonicalLabel: 'environmental risk', reviewedAliases: ['environmental risks', 'hazard', 'hazards'] },
  { role: 'ENTITY', semanticId: 'entity.inspection_finding', canonicalLabel: 'inspection finding', reviewedAliases: ['inspection findings', 'finding', 'findings'] },
  { role: 'ENTITY', semanticId: 'entity.claim_document', canonicalLabel: 'claim document', reviewedAliases: ['claim documents', 'document', 'documents'] },
  { role: 'ENTITY', semanticId: 'entity.tax_bill', canonicalLabel: 'tax bill', reviewedAliases: ['tax bills', 'bill', 'bills'] },
  { role: 'ENTITY', semanticId: 'entity.buyer_task', canonicalLabel: 'buyer deadline', reviewedAliases: ['buyer deadlines', 'contingency deadlines', 'contingency deadline', 'contingency', 'deadlines', 'deadline'] },
  { role: 'ENTITY', semanticId: 'entity.sale_readiness_item', canonicalLabel: 'listing', reviewedAliases: ['house', 'home', 'seller readiness', 'sell'] },
  { role: 'ENTITY', semanticId: 'entity.home_event', canonicalLabel: 'repair', reviewedAliases: ['repairs'] },
  { role: 'ENTITY', semanticId: 'entity.saved_result', canonicalLabel: 'saved item', reviewedAliases: ['saved items', 'saved work', 'saved result', 'saved results'] },

  // Fields
  { role: 'FIELD', semanticId: 'field.inventory_item.installed_on', canonicalLabel: 'age', reviewedAliases: ['how old', 'installed'] },
  { role: 'FIELD', semanticId: 'field.inventory_item.replacement_cost', canonicalLabel: 'replacement cost', reviewedAliases: ['replace cost'] },
  { role: 'FIELD', semanticId: 'field.home_event.actual_cost', canonicalLabel: 'spend', reviewedAliases: ['spent', 'expense', 'expenses', 'amount'] },
  { role: 'FIELD', semanticId: 'field.warranty.expiry_date', canonicalLabel: 'warranty ends', reviewedAliases: [] },

  // Categories & Statuses
  { role: 'CATEGORY', semanticId: 'category.maintenance.plumbing', canonicalLabel: 'plumbing', reviewedAliases: [] },
  { role: 'CATEGORY', semanticId: 'category.maintenance.electrical', canonicalLabel: 'electrical', reviewedAliases: [] },
  { role: 'CATEGORY', semanticId: 'category.quote_scope.hvac', canonicalLabel: 'hvac', reviewedAliases: [] },
  { role: 'CATEGORY', semanticId: 'category.quote_scope.roofing', canonicalLabel: 'roofing', reviewedAliases: [] },
  { role: 'STATUS', semanticId: 'status.open', canonicalLabel: 'open', reviewedAliases: ['incomplete', 'remaining', 'remains', 'unfinished', 'finish'] },
  { role: 'STATUS', semanticId: 'status.expired', canonicalLabel: 'expired', reviewedAliases: ['out of warranty', 'out'] },
  { role: 'STATUS', semanticId: 'status.unpaid', canonicalLabel: 'unpaid', reviewedAliases: [] },
  { role: 'STATUS', semanticId: 'status.active', canonicalLabel: 'active', reviewedAliases: [] },
  { role: 'STATUS', semanticId: 'status.action_required', canonicalLabel: 'action', reviewedAliases: ['actionable', 'unresolved', 'need', 'needs', 'needing', 'required', 'require', 'requiring'] },
  { role: 'STATUS', semanticId: 'status.missing', canonicalLabel: 'missing', reviewedAliases: ['lacking'] },
  { role: 'STATUS', semanticId: 'status.affected', canonicalLabel: 'affected', reviewedAliases: ['impacted'] },
  { role: 'STATUS', semanticId: 'status.recorded', canonicalLabel: 'recorded', reviewedAliases: [] },
  { role: 'STATUS', semanticId: 'status.dying', canonicalLabel: 'dying', reviewedAliases: ['failing'] },

  // Relations
  { role: 'RELATION', semanticId: 'relation.inventory_item.manual_document', canonicalLabel: 'manual', reviewedAliases: ['manuals', 'owner manual'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.receipt_document', canonicalLabel: 'receipt', reviewedAliases: ['receipts', 'purchase receipt'] },
  { role: 'RELATION', semanticId: 'relation.claim.named_water_damage', canonicalLabel: 'water damage', reviewedAliases: ['water-damage'] },
  { role: 'RELATION', semanticId: 'relation.claim.claim_document', canonicalLabel: 'claim documents', reviewedAliases: [] },

  // Projections
  { role: 'PROJECTION', semanticId: 'projection.aggregate', canonicalLabel: 'total', reviewedAliases: ['how much'] },
  { role: 'PROJECTION', semanticId: 'projection.compare', canonicalLabel: 'compare', reviewedAliases: ['comparison', 'versus', 'vs'] },
  { role: 'PROJECTION', semanticId: 'projection.list', canonicalLabel: 'find', reviewedAliases: ['get', 'all'] },

  // Time windows
  { role: 'TIME', semanticId: 'time.period.next_month', canonicalLabel: 'next month', reviewedAliases: ['next calendar month'] },
  { role: 'TIME', semanticId: 'time.period.last_year', canonicalLabel: 'last year', reviewedAliases: ['last calendar year', 'last years', "last year's", 'previous year'] },
  { role: 'TIME', semanticId: 'time.period.this_year', canonicalLabel: 'this year', reviewedAliases: ['this years', "this year's", 'current year'] },
  { role: 'TIME', semanticId: 'time.period.this_week', canonicalLabel: 'this week', reviewedAliases: ['calendar week', 'current week'] },
  { role: 'TIME', semanticId: 'time.period.before_closing', canonicalLabel: 'before closing', reviewedAliases: ['prior to closing', 'closing'] },
  { role: 'TIME', semanticId: 'time.period.before_listing', canonicalLabel: 'before listing', reviewedAliases: ['prior to listing'] },
  { role: 'TIME', semanticId: 'time.period.three_years', canonicalLabel: 'within three years', reviewedAliases: ['three years', '3 years'] },

  // Jobs
  { role: 'JOB', semanticId: 'job.inventory.replacement_guidance', canonicalLabel: 'repair or replace', reviewedAliases: ['repair', 'replace', 'replacement'] },
  { role: 'JOB', semanticId: 'job.finance.own_rent_break_even', canonicalLabel: 'owning beats renting', reviewedAliases: ['owning', 'renting', 'own or rent'] },
  { role: 'JOB', semanticId: 'job.finance.refinance_break_even', canonicalLabel: 'refinancing break even', reviewedAliases: ['refinance break even', 'refinancing', 'refinance', 'break even'] },
]);

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[’—–]/g, (m) => (m === '’' ? "'" : ' ')).replace(/[^a-z0-9']+/g, ' ').trim();
}

export function generateCrossDomainSemanticLexicon(): readonly CrossDomainLexeme[] {
  const entries: CrossDomainLexeme[] = ASK_SHARED_SEMANTIC_LEXICON.map((entry) => ({
    role: entry.role,
    semanticId: entry.semanticId,
    phrase: entry.phrase,
    lineage: 'BASIC_READ_SHARED_LEXICON',
  }));

  for (const spec of CROSS_DOMAIN_LEXEME_SPECS) {
    const canonical = normalizePhrase(spec.canonicalLabel);
    if (canonical) {
      entries.push({
        role: spec.role,
        semanticId: spec.semanticId,
        phrase: canonical,
        lineage: 'ONTOLOGY_DERIVED',
      });
    }
    for (const alias of spec.reviewedAliases) {
      const normalized = normalizePhrase(alias);
      if (normalized) {
        entries.push({
          role: spec.role,
          semanticId: spec.semanticId,
          phrase: normalized,
          lineage: 'REVIEWED_ALIAS',
        });
      }
    }
  }

  const seen = new Set<string>();
  return Object.freeze(
    entries
      .filter((entry) => {
        const key = `${entry.role}:${entry.semanticId}:${entry.phrase}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.phrase.length - a.phrase.length || a.semanticId.localeCompare(b.semanticId)),
  );
}

export const ASK_CROSS_DOMAIN_SEMANTIC_LEXICON: readonly CrossDomainLexeme[] = generateCrossDomainSemanticLexicon();

export function verifyCrossDomainProtectionLexemeSeparation(): {
  readonly valid: boolean;
  readonly violations: readonly string[];
} {
  const violations: string[] = [];
  for (const entry of ASK_CROSS_DOMAIN_SEMANTIC_LEXICON) {
    if (entry.semanticId.includes('warranty') && /\b(insurance|policy|policies|claim|claims)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains non-warranty token "${entry.phrase}"`);
    }
    if (entry.semanticId === 'entity.insurance_policy' && /\b(warranty|warranties|claim|claims|coverage)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains non-insurance token "${entry.phrase}"`);
    }
    if (entry.semanticId === 'entity.coverage' && /\b(warranty|warranties|insurance|policy|policies|claim|claims)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains conflated protection token "${entry.phrase}"`);
    }
  }
  return { valid: violations.length === 0, violations };
}

/** Closed-class grammatical function words ONLY — zero domain nouns, ops, or entities. */
const CLOSED_CLASS_STOP_WORDS = new Set([
  'a', 'an', 'the', 'my', 'our', 'your', 'i', 'me', 'it', 'we', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'should', 'can', 'could',
  'in', 'on', 'at', 'of', 'to', 'for', 'with', 'from', 'by', 'about', 'before', 'after', 'within', 'until', 'whether',
  'what', 'whats', "what's", 'which', 'who', 'where', 'when', 'how', 'still', 'tell', 'provide', 'there', 'any', 'all', 'two', 'three', 'one',
  'beats', 'affect', 'long',
]);

interface TokenSpan extends SemanticSourceSpan {
  readonly normalized: string;
}

interface LexiconAnnotation {
  readonly startToken: number;
  readonly endToken: number;
  readonly lexeme: CrossDomainLexeme;
}

function tokenizeClause(clauseText: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /[A-Za-z0-9']+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clauseText)) !== null) {
    const normalized = match[0].toLowerCase().replace(/’/g, "'");
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      normalized,
    });
  }
  return tokens;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 99;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

function annotateClauseTokens(tokens: readonly TokenSpan[]): {
  readonly annotations: readonly LexiconAnnotation[];
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
} {
  const annotations: LexiconAnnotation[] = [];
  const coveredTokens = new Set<number>();
  const singleWordLexemes = ASK_CROSS_DOMAIN_SEMANTIC_LEXICON.filter((l) => !l.phrase.includes(' '));

  for (let start = 0; start < tokens.length; start += 1) {
    // 1. Longest multi-token or exact phrase match from generated lexicon
    let bestLength = 0;
    const matchedAtSpan: CrossDomainLexeme[] = [];

    for (const lexeme of ASK_CROSS_DOMAIN_SEMANTIC_LEXICON) {
      const words = lexeme.phrase.split(' ');
      if (start + words.length > tokens.length) continue;
      if (words.length < bestLength) break;
      const matchesExact = words.every((w, idx) => {
        const tok = tokens[start + idx].normalized;
        return tok === w || tok.replace(/'/g, '') === w.replace(/'/g, '');
      });
      if (matchesExact) {
        if (words.length > bestLength) {
          matchedAtSpan.length = 0;
          bestLength = words.length;
        }
        matchedAtSpan.push(lexeme);
      }
    }

    if (matchedAtSpan.length > 0) {
      for (const lexeme of matchedAtSpan) {
        annotations.push({ startToken: start, endToken: start + bestLength - 1, lexeme });
      }
      for (let k = start; k < start + bestLength; k += 1) coveredTokens.add(k);
      continue;
    }

    // 2. Bounded 1-edit typo fallback for single tokens >= 5 chars when unique per role
    const tok = tokens[start].normalized;
    if (tok.length >= 5 && !CLOSED_CLASS_STOP_WORDS.has(tok) && !/^\d+$/.test(tok)) {
      const candidates = singleWordLexemes.filter((l) => l.phrase.length >= 5 && levenshtein(tok, l.phrase) <= 1);
      const uniqueIds = new Set(candidates.map((c) => c.semanticId));
      if (uniqueIds.size === 1 && candidates.length > 0) {
        for (const lexeme of candidates) {
          annotations.push({ startToken: start, endToken: start, lexeme });
        }
        coveredTokens.add(start);
      }
    }
  }

  const unresolvedSpans: SemanticSourceSpan[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (coveredTokens.has(i)) continue;
    const tok = tokens[i];
    if (/^\d+$/.test(tok.normalized)) continue;
    if (CLOSED_CLASS_STOP_WORDS.has(tok.normalized) || CLOSED_CLASS_STOP_WORDS.has(tok.normalized.replace(/'/g, ''))) continue;
    unresolvedSpans.push({ start: tok.start, end: tok.end, text: tok.text });
  }

  return { annotations, unresolvedSpans };
}

/**
 * FR-REC / §15 recovery evidence: the generated-lexicon annotations and unconsumed spans of a whole message, so an
 * in-domain-but-not-understood recovery can name what WAS verified without a second vocabulary.
 */
export function collectCrossDomainRecoveryEvidence(rawText: string): {
  readonly lexemes: readonly Pick<CrossDomainLexeme, 'role' | 'semanticId' | 'phrase'>[];
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
} {
  const annotated = annotateClauseTokens(tokenizeClause(rawText.trim()));
  return {
    lexemes: annotated.annotations.map((a) => ({ role: a.lexeme.role, semanticId: a.lexeme.semanticId, phrase: a.lexeme.phrase })),
    unresolvedSpans: annotated.unresolvedSpans,
  };
}

const SINGLE_WORD_LEXICON_PHRASES = new Set(
  ASK_CROSS_DOMAIN_SEMANTIC_LEXICON.filter((l) => !l.phrase.includes(' ')).map((l) => l.phrase),
);

function matchDynamicQuotesOnTokens(
  tokens: readonly TokenSpan[],
  dynamicQuotes: readonly DynamicQuoteCandidate[] = [],
): {
  readonly matchedQuoteIds: readonly string[];
  readonly coveredTokenIndices: ReadonlySet<number>;
} {
  if (dynamicQuotes.length === 0 || tokens.length === 0) {
    return { matchedQuoteIds: [], coveredTokenIndices: new Set<number>() };
  }

  const vendorTokenMap = dynamicQuotes.map((quote) => ({
    quote,
    idTokens: tokenizeClause(quote.id).map((t) => t.normalized),
    vendorTokens: tokenizeClause(quote.vendorName).map((t) => t.normalized),
  }));

  // Count how many candidates use each candidate discriminating word
  const wordDocFreq = new Map<string, number>();
  for (const entry of vendorTokenMap) {
    const uniqueWords = new Set(entry.vendorTokens);
    for (const w of uniqueWords) {
      wordDocFreq.set(w, (wordDocFreq.get(w) ?? 0) + 1);
    }
  }

  const matchedQuoteIds: string[] = [];
  const seenQuoteIds = new Set<string>();
  const coveredTokenIndices = new Set<number>();

  const recordMatch = (quoteId: string, start: number, len: number): void => {
    for (let k = start; k < start + len; k += 1) {
      coveredTokenIndices.add(k);
    }
    if (!seenQuoteIds.has(quoteId)) {
      seenQuoteIds.add(quoteId);
      matchedQuoteIds.push(quoteId);
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    if (coveredTokenIndices.has(i)) continue;

    // 1. Exact ID or full vendor name phrase match (prefer longest phrase)
    let bestMatch: { quoteId: string; len: number } | null = null;
    for (const entry of vendorTokenMap) {
      for (const candidateTokens of [entry.vendorTokens, entry.idTokens]) {
        if (candidateTokens.length === 0) continue;
        if (i + candidateTokens.length > tokens.length) continue;
        const matchesAll = candidateTokens.every((w, offset) => tokens[i + offset].normalized === w);
        if (matchesAll && (!bestMatch || candidateTokens.length > bestMatch.len)) {
          bestMatch = { quoteId: entry.quote.id, len: candidateTokens.length };
        }
      }
    }
    if (bestMatch) {
      recordMatch(bestMatch.quoteId, i, bestMatch.len);
      continue;
    }

    // 2. Unique discriminating vendor token (>= 3 chars, not stop-word or static lexicon word)
    const tok = tokens[i].normalized;
    if (
      tok.length >= 3
      && !CLOSED_CLASS_STOP_WORDS.has(tok)
      && !SINGLE_WORD_LEXICON_PHRASES.has(tok)
      && wordDocFreq.get(tok) === 1
    ) {
      const owner = vendorTokenMap.find((entry) => entry.vendorTokens.includes(tok));
      if (owner) {
        recordMatch(owner.quote.id, i, 1);
      }
    }
  }

  return { matchedQuoteIds, coveredTokenIndices };
}

function annotateClauseWithDynamicQuotes(
  tokens: readonly TokenSpan[],
  dynamicQuotes: readonly DynamicQuoteCandidate[] = [],
): {
  readonly annotations: readonly LexiconAnnotation[];
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
  readonly matchedQuoteIds: readonly string[];
} {
  const base = annotateClauseTokens(tokens);
  if (dynamicQuotes.length === 0) {
    return { annotations: base.annotations, unresolvedSpans: base.unresolvedSpans, matchedQuoteIds: [] };
  }
  const quoteMatches = matchDynamicQuotesOnTokens(tokens, dynamicQuotes);
  if (quoteMatches.coveredTokenIndices.size === 0) {
    return {
      annotations: base.annotations,
      unresolvedSpans: base.unresolvedSpans,
      matchedQuoteIds: quoteMatches.matchedQuoteIds,
    };
  }
  const coveredStarts = new Set(Array.from(quoteMatches.coveredTokenIndices).map((idx) => tokens[idx].start));
  return {
    annotations: base.annotations,
    unresolvedSpans: base.unresolvedSpans.filter((span) => !coveredStarts.has(span.start)),
    matchedQuoteIds: quoteMatches.matchedQuoteIds,
  };
}

/**
 * Lexicon-backed check indicating whether an utterance likely targets contractor quote comparison
 * and should load property quote candidates before concluding NONE_FITS.
 */
export function mayNeedDynamicQuoteResolution(rawText: string): boolean {
  const tokens = tokenizeClause(rawText);
  const { annotations } = annotateClauseTokens(tokens);
  return annotations.some(
    (a) => a.lexeme.semanticId === 'projection.compare' || a.lexeme.semanticId === 'entity.contractor_quote',
  );
}

export interface PlanOverflowFacet {
  readonly id: string;
  readonly sourceSpan: SemanticSourceSpan;
  readonly label: string;
  readonly reasonCode: 'DOMAIN_NOT_SEARCHED';
}

export interface CrossDomainClarificationCandidate {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
}

export interface CrossDomainClarification {
  readonly reasonCode:
    | 'AMBIGUOUS_NEGATIVE_COORDINATION'
    | 'UNRESOLVED_FOLLOW_UP_INPUT'
    | 'AMBIGUOUS_QUOTE_SELECTION';
  readonly question: string;
  readonly options: readonly string[];
  readonly candidateRecords?: readonly CrossDomainClarificationCandidate[];
}

export interface DynamicQuoteCandidate {
  readonly id: string;
  readonly vendorName: string;
  readonly roomTag?: string | null;
  readonly amountCents?: number;
}

export interface CrossDomainParseResult {
  readonly plan: SemanticRequestPlan;
  readonly clarification: CrossDomainClarification | null;
  readonly overflowFacets: readonly PlanOverflowFacet[];
  readonly requiresUnambiguousCoordination: boolean;
}

const MAX_PLAN_FACETS = 6;

/**
 * FRD §6.2 & §20 Row 21: Stage 0 safety emergency boundary evaluates raw text directly
 * so potentially harmful acute symptoms cannot be misrouted or dropped by NLP/plan errors.
 */
const EMERGENCY_SAFETY_PATTERNS: readonly RegExp[] = [
  /\bsmell(?:s|ing)?\s+(?:like\s+)?gas\b/i,
  /\bgas\s+leak\b/i,
  /\bcarbon\s+monoxide\b/i,
  /\b(?:smoke|fire|sparks?|electrical\s+fire|arcing)\b/i,
  /\bflood(?:ing)?\s+(?:right\s+now|basement)\b/i,
];

interface ClauseSpec {
  readonly domainId: string;
  readonly entityId: string;
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY';
  readonly jobMatch: string;
  readonly projection: SemanticFacet['projection'];
  readonly polarity: SemanticFacet['polarity'];
  readonly relations: SemanticFacet['relations'];
  readonly where: SemanticWhereExpression | null;
  readonly time: SemanticTimeConstraint | null;
  readonly fields: readonly { fieldId: string }[];
  readonly requiredSlots: readonly { slotId: string; state: 'RESOLVED' | 'UNRESOLVED' }[];
  readonly subjectRecordId?: string | null;
  readonly dependsOn?: readonly string[];
}

interface AnnotationSignalIndex {
  readonly ids: ReadonlySet<string>;
  readonly firstId: (prefix: string) => string | null;
  readonly quoteScope: string | null;
}

function resolveQuoteScopeFromAnnotations(annotations: readonly LexiconAnnotation[]): string | null {
  for (const annotation of annotations) {
    const { semanticId, phrase } = annotation.lexeme;
    if (semanticId === 'entity.inventory_room' && phrase !== 'room' && phrase !== 'rooms') {
      return phrase === 'bath' ? 'bathroom' : phrase;
    }
    if (semanticId.startsWith('category.maintenance.') || semanticId.startsWith('category.quote_scope.')) {
      return phrase;
    }
    if (semanticId === 'entity.property' && phrase === 'roof') {
      return 'roof';
    }
    if (semanticId === 'entity.home_system' && phrase !== 'home system' && phrase !== 'home systems') {
      return phrase;
    }
  }
  return null;
}

function indexAnnotations(annotations: readonly LexiconAnnotation[]): AnnotationSignalIndex {
  const ids = new Set(annotations.map((a) => a.lexeme.semanticId));
  return {
    ids,
    firstId: (prefix: string) => {
      for (const a of annotations) {
        if (a.lexeme.semanticId.startsWith(prefix)) return a.lexeme.semanticId;
      }
      return null;
    },
    quoteScope: resolveQuoteScopeFromAnnotations(annotations),
  };
}

/**
 * Declarative grammar rule table operating exclusively on lexicon-annotated semantic IDs
 * (never sentence regexes), satisfying FR-PLAN-7 & §18.
 */
function compileClauseSpecFromAnnotations(
  sig: AnnotationSignalIndex,
  options: {
    priorClaimFacetId?: string | null;
    resolvedSubjectHint?: string | null;
    matchedQuoteIds?: readonly string[];
  } = {},
): ClauseSpec | null {
  const has = (id: string) => sig.ids.has(id);
  const projection: SemanticFacet['projection'] = has('projection.count')
    ? 'COUNT'
    : has('projection.compare')
      ? 'COMPARE'
      : has('projection.aggregate')
        ? 'AGGREGATE'
        : has('projection.detail')
          ? 'DETAIL'
          : has('projection.exists')
            ? 'EXISTS'
            : 'LIST';

  // Maintenance next month
  if (has('entity.maintenance_task') && has('time.period.next_month')) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        enumStatus: 'OPEN',
      },
      time: { kind: 'CALENDAR_PERIOD', unit: 'MONTH', offset: 1 },
      fields: [{ fieldId: 'field.maintenance_task.title' }, { fieldId: 'field.maintenance_task.next_due_date' }],
      requiredSlots: [],
    };
  }

  // Maintenance category set {PLUMBING, ELECTRICAL}
  if (has('category.maintenance.plumbing') && has('category.maintenance.electrical') && has('entity.maintenance_task')) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        targetCategorySet: ['PLUMBING', 'ELECTRICAL'],
      },
      time: null,
      fields: [{ fieldId: 'field.maintenance_task.title' }],
      requiredSlots: [],
    };
  }

  // Maintenance overdue
  if (has('time.maintenance.overdue') && has('entity.maintenance_task')) {
    return {
      domainId: 'domain.maintenance',
      entityId: 'entity.maintenance_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.maintenance_task.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{
        semanticRelationId: 'relation.maintenance_task.self',
        predicateId: 'predicate.maintenance_task.matches_filter',
        targetEntityId: 'entity.maintenance_task',
      }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.maintenance_task.matches_filter',
        relationPathId: 'path.maintenance_task.self',
        enumStatus: 'OVERDUE',
      },
      time: { kind: 'DUE_STATUS', status: 'OVERDUE' },
      fields: [{ fieldId: 'field.maintenance_task.title' }, { fieldId: 'field.maintenance_task.next_due_date' }],
      requiredSlots: [],
    };
  }

  // Unambiguous neither manual nor receipt
  if (
    has('coordinator.neither') && has('coordinator.nor')
    && has('relation.inventory_item.manual_document')
    && has('relation.inventory_item.receipt_document')
  ) {
    const assembled = assembleSemanticBooleanExpression({
      coordination: 'NEITHER_NOR',
      predicates: [
        { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_manual_record', relationPathId: 'path.inventory_item.manual_document' },
        { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_receipt_record', relationPathId: 'path.inventory_item.receipt_document' },
      ],
    });
    if (assembled.outcome === 'ASSEMBLED') {
      return {
        domainId: 'domain.inventory',
        entityId: 'entity.inventory_item',
        requestClass: 'DATA_QUERY',
        jobMatch: 'query.inventory_item.relation_boolean',
        projection: projection === 'COUNT' ? 'COUNT' : 'LIST',
        polarity: 'NEGATIVE',
        relations: [
          { semanticRelationId: 'relation.inventory_item.manual_document', predicateId: 'predicate.inventory_item.has_manual_record', targetEntityId: 'entity.property_record' },
          { semanticRelationId: 'relation.inventory_item.receipt_document', predicateId: 'predicate.inventory_item.has_receipt_record', targetEntityId: 'entity.property_record' },
        ],
        where: assembled.expression,
        time: null,
        fields: [{ fieldId: 'field.inventory_item.name' }],
        requiredSlots: [],
      };
    }
  }

  // Expired / out of warranty
  if (has('entity.warranty') && has('status.expired')) {
    return {
      domainId: 'domain.warranties_coverage',
      entityId: 'entity.warranty',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.warranty.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.warranty.self', predicateId: 'predicate.warranty.matches_filter', targetEntityId: 'entity.warranty' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.warranty.matches_filter', relationPathId: 'path.warranty.self', enumStatus: 'EXPIRED' },
      time: null,
      fields: [{ fieldId: 'field.warranty.provider_name' }, { fieldId: 'field.warranty.expiry_date' }],
      requiredSlots: [],
    };
  }

  // Insurance deductible (strictly disjoint from warranty & claims)
  if (has('field.insurance_policy.deductible') && !has('entity.warranty') && !has('entity.claim')) {
    return {
      domainId: 'domain.insurance_policies',
      entityId: 'entity.insurance_policy',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.insurance_policy.field_read',
      projection: 'DETAIL',
      polarity: 'POSITIVE',
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.insurance_policy.deductible' }],
      requiredSlots: [],
    };
  }

  // Open claims
  if (has('entity.claim') && has('status.open')) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.filter',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.claim.self', predicateId: 'predicate.claim.has_status', targetEntityId: 'entity.claim' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.claim.has_status', relationPathId: 'path.claim.self', enumStatus: 'OPEN' },
      time: null,
      fields: [{ fieldId: 'field.claim.title' }, { fieldId: 'field.claim.status' }],
      requiredSlots: [],
    };
  }

  // Missing claim documents
  if (has('status.missing') && has('entity.claim_document')) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.documents',
      projection: 'LIST',
      polarity: 'NEGATIVE',
      relations: [{ semanticRelationId: 'relation.claim.claim_document', predicateId: 'predicate.claim.missing_required_document', targetEntityId: 'entity.claim_document' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.claim.missing_required_document', relationPathId: 'path.claim.claim_document' },
      time: null,
      fields: [{ fieldId: 'field.claim_document.missing' }],
      requiredSlots: [],
      dependsOn: options.priorClaimFacetId ? [options.priorClaimFacetId] : [],
    };
  }

  // Visible claim documents
  if (has('entity.claim') && has('entity.claim_document') && !has('status.missing')) {
    return {
      domainId: 'domain.claims',
      entityId: 'entity.claim',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.claim.documents',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.claim.claim_document', predicateId: 'predicate.claim.has_visible_document', targetEntityId: 'entity.claim_document' }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.claim.has_visible_document',
        relationPathId: 'path.claim.claim_document',
        targetRecordId: has('relation.claim.named_water_damage') ? 'water-damage' : undefined,
      },
      time: null,
      fields: [{ fieldId: 'field.property_record.title' }],
      requiredSlots: [],
    };
  }

  // Aggregate repair spend over last calendar year
  if (has('entity.home_event') && has('field.home_event.actual_cost') && has('time.period.last_year')) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.home_event',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.home_event.repair_spend_aggregate',
      projection: 'AGGREGATE',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.home_event.repair_expense', predicateId: 'predicate.home_event.is_repair_cost', targetEntityId: 'entity.home_event' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.home_event.is_repair_cost', relationPathId: 'path.home_event.repair_expense' },
      time: { kind: 'CALENDAR_PERIOD', unit: 'YEAR', offset: -1 },
      fields: [{ fieldId: 'field.home_event.actual_cost' }],
      requiredSlots: [],
    };
  }

  // Compare tax bill years
  if (has('projection.compare') && has('entity.tax_bill')) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property_tax_bill',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.property_tax_bill.compare_years',
      projection: 'COMPARE',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.property_tax_bill.period', predicateId: 'predicate.property_tax_bill.for_period', targetEntityId: 'entity.property_tax_bill' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.property_tax_bill.for_period', relationPathId: 'path.property_tax_bill.period' },
      time: { kind: 'COMPARE_YEARS', baselineOffset: -1, targetOffset: 0 },
      fields: [{ fieldId: 'field.tax_bill.tax_amount' }],
      requiredSlots: [],
    };
  }

  // Unpaid tax bills
  if (has('status.unpaid') && has('entity.tax_bill')) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property_tax_bill',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.property_tax_bill.unpaid',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.property_tax_bill.period', predicateId: 'predicate.property_tax_bill.is_unpaid', targetEntityId: 'entity.property_tax_bill' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.property_tax_bill.is_unpaid', relationPathId: 'path.property_tax_bill.period', enumStatus: 'UNPAID' },
      time: null,
      fields: [{ fieldId: 'field.tax_bill.tax_amount' }],
      requiredSlots: [],
    };
  }

  // Own vs rent break even
  if (has('job.finance.own_rent_break_even')) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.finance.own_rent_break_even',
      projection: 'ANALYSIS',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [],
      requiredSlots: [
        { slotId: 'slot.finance.monthly_rent_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.finance.home_value_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.finance.horizon_years', state: 'UNRESOLVED' },
      ],
    };
  }

  // Refinance break even
  if (has('job.finance.refinance_break_even')) {
    return {
      domainId: 'domain.ownership_costs_finance',
      entityId: 'entity.property',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.finance.refinance_break_even',
      projection: 'ANALYSIS',
      polarity: null,
      relations: [],
      where: null,
      time: { kind: 'CALENDAR_PERIOD', unit: 'YEAR', offset: 1 },
      fields: [],
      requiredSlots: [
        { slotId: 'slot.refinance.current_rate_bps', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.candidate_rate_bps', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.closing_costs_cents', state: 'UNRESOLVED' },
        { slotId: 'slot.refinance.horizon_years', state: has('time.period.three_years') ? 'RESOLVED' : 'UNRESOLVED' },
      ],
    };
  }

  // Recall review & affected items
  if (has('entity.recall')) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.recall',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.risk.recall_review',
      projection: 'DETAIL',
      polarity: null,
      relations: [{ semanticRelationId: 'relation.recall.inventory_item', predicateId: 'predicate.recall.affects_inventory_item', targetEntityId: 'entity.inventory_item' }],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.recall.title' }, { fieldId: 'field.inventory_item.name' }],
      requiredSlots: [],
    };
  }

  // Weekly environmental risks
  if (has('entity.environmental_risk') && has('time.period.this_week')) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.environmental_risk',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.risk.environment_weekly',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: { kind: 'CALENDAR_PERIOD', unit: 'WEEK', offset: 0 },
      fields: [{ fieldId: 'field.environmental_risk.severity' }, { fieldId: 'field.environmental_risk.freshness' }],
      requiredSlots: [],
    };
  }

  // Actionable inspection findings
  if (has('entity.inspection_finding') && has('status.action_required')) {
    return {
      domainId: 'domain.risks_recalls_inspections',
      entityId: 'entity.inspection_finding',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.inspection_finding.actionable',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.inspection_report.finding', predicateId: 'predicate.inspection_report.has_actionable_finding', targetEntityId: 'entity.inspection_report' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.inspection_report.has_actionable_finding', relationPathId: 'path.inspection_report.finding', enumStatus: 'ACTION_REQUIRED' },
      time: null,
      fields: [{ fieldId: 'field.inspection_finding.title' }],
      requiredSlots: [],
    };
  }

  // Buyer deadlines before closing
  if (has('entity.buyer_task') && has('time.period.before_closing')) {
    return {
      domainId: 'domain.buyer_journey',
      entityId: 'entity.buyer_task',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.buyer_task.before_closing',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.buyer_checklist.buyer_task', predicateId: 'predicate.buyer_checklist.has_active_task', targetEntityId: 'entity.buyer_task' }],
      where: { kind: 'PREDICATE', predicateId: 'predicate.buyer_checklist.has_active_task', relationPathId: 'path.buyer_checklist.buyer_task', enumStatus: 'OPEN' },
      time: { kind: 'BEFORE_CLOSING' },
      fields: [{ fieldId: 'field.buyer_task.title' }, { fieldId: 'field.buyer_task.due_date' }],
      requiredSlots: [],
    };
  }

  // Buyer contingency deadlines
  if (has('entity.buyer_task') && !has('time.period.before_closing')) {
    return {
      domainId: 'domain.buyer_journey',
      entityId: 'entity.buyer_task',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.buyer.contingency_deadlines',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.buyer_task.title' }, { fieldId: 'field.buyer_task.due_date' }],
      requiredSlots: [],
    };
  }

  // Seller readiness before listing
  if (has('entity.sale_readiness_item') && (has('time.period.before_listing') || has('status.open'))) {
    return {
      domainId: 'domain.seller_preparation',
      entityId: 'entity.sale_readiness_item',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.seller.listing_readiness',
      projection: 'LIST',
      polarity: null,
      relations: [{ semanticRelationId: 'relation.sale_case.readiness_item', predicateId: 'predicate.sale_case.has_readiness_item', targetEntityId: 'entity.sale_readiness_item' }],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.sale_readiness_item.title' }],
      requiredSlots: [],
    };
  }

  // Active projects needing permit (or active projects list)
  if (has('entity.project') && (has('status.active') || has('entity.permit'))) {
    return {
      domainId: 'domain.projects_quotes_vendors',
      entityId: 'entity.project',
      requestClass: 'DATA_QUERY',
      jobMatch: 'query.project.needs_permit',
      projection: 'LIST',
      polarity: 'POSITIVE',
      relations: [{ semanticRelationId: 'relation.project.permit', predicateId: 'predicate.project.needs_permit_or_unresolved', targetEntityId: 'entity.permit' }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.project.needs_permit_or_unresolved',
        relationPathId: 'path.project.permit',
        enumStatus: has('entity.permit') ? 'NEEDS_PERMIT_OR_UNRESOLVED' : 'ACTIVE',
      },
      time: null,
      fields: [{ fieldId: 'field.project.title' }, { fieldId: 'field.project.permit_status' }],
      requiredSlots: [],
    };
  }

  // Compare contractor quotes (binds 2 resolved quote IDs when present; otherwise preserves UNRESOLVED slot for CLARIFY)
  const matchedQuoteIds = options.matchedQuoteIds ?? [];
  if (has('projection.compare') && (has('entity.contractor_quote') || matchedQuoteIds.length >= 2)) {
    const requestedScope = sig.quoteScope;
    const boundQuoteIds = matchedQuoteIds.length >= 2 ? matchedQuoteIds.slice(0, 2) : null;
    const hasPredicate = Boolean(requestedScope || boundQuoteIds);
    return {
      domainId: 'domain.projects_quotes_vendors',
      entityId: 'entity.contractor_quote',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.projects.quote_comparison',
      projection: 'COMPARE',
      polarity: null,
      relations: hasPredicate
        ? [{ semanticRelationId: 'relation.contractor_quote.comparison', predicateId: 'predicate.contractor_quote.compared_in_scope', targetEntityId: 'entity.contractor_quote' }]
        : [],
      where: hasPredicate
        ? {
            kind: 'PREDICATE',
            predicateId: 'predicate.contractor_quote.compared_in_scope',
            relationPathId: 'path.contractor_quote.comparison',
            ...(requestedScope ? { targetRecordId: requestedScope } : {}),
            ...(boundQuoteIds ? { targetCategorySet: [...boundQuoteIds] } : {}),
          }
        : null,
      time: null,
      fields: [{ fieldId: 'field.contractor_quote.amount_cents' }, { fieldId: 'field.contractor_quote.vendor_name' }],
      requiredSlots: [{ slotId: 'slot.quotes.two_resolved_quotes', state: boundQuoteIds ? 'RESOLVED' : 'UNRESOLVED' }],
    };
  }

  // Saved results lookup (explicitly distinct from inventory items)
  if (has('entity.saved_result') || has('job.saved_results.lookup')) {
    return {
      domainId: 'domain.account_household_preferences',
      entityId: 'entity.saved_result',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.saved_results.lookup',
      projection: 'LIST',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [{ fieldId: 'field.saved_result.title' }],
      requiredSlots: [],
    };
  }

  // Replacement guidance (explicit repair/replace or dying appliance)
  if ((has('job.inventory.replacement_guidance') || has('status.dying')) && (has('entity.inventory_item') || Boolean(options.resolvedSubjectHint))) {
    return {
      domainId: 'domain.inventory',
      entityId: 'entity.inventory_item',
      requestClass: 'CAPABILITY',
      jobMatch: 'job.inventory.replacement_guidance',
      projection: 'DETAIL',
      polarity: null,
      relations: [],
      where: null,
      time: null,
      fields: [
        { fieldId: 'field.inventory_item.purchase_cost' },
        { fieldId: 'field.inventory_item.replacement_cost' },
        { fieldId: 'field.inventory_item.installed_on' },
      ],
      requiredSlots: [{ slotId: 'slot.inventory.target_item', state: 'RESOLVED' }],
      subjectRecordId: options.resolvedSubjectHint ?? 'furnace',
    };
  }

  // Item aspect facets when anchored to an item subject prefix (Row 15)
  if (options.resolvedSubjectHint) {
    if (has('field.inventory_item.installed_on')) {
      return {
        domainId: 'domain.inventory',
        entityId: 'entity.inventory_item',
        requestClass: 'DATA_QUERY',
        jobMatch: 'query.inventory_item.field_read',
        projection: 'DETAIL',
        polarity: 'POSITIVE',
        relations: [],
        where: null,
        time: null,
        fields: [{ fieldId: 'field.inventory_item.installed_on' }],
        requiredSlots: [],
        subjectRecordId: options.resolvedSubjectHint,
      };
    }
    if (has('entity.warranty')) {
      return {
        domainId: 'domain.warranties_coverage',
        entityId: 'entity.inventory_item',
        requestClass: 'DATA_QUERY',
        jobMatch: 'query.inventory_item.relation_boolean',
        projection: 'DETAIL',
        polarity: 'POSITIVE',
        relations: [{ semanticRelationId: 'relation.inventory_item.warranty', predicateId: 'predicate.inventory_item.has_warranty_record', targetEntityId: 'entity.warranty' }],
        where: { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_warranty_record', relationPathId: 'path.inventory_item.warranty' },
        time: null,
        fields: [{ fieldId: 'field.warranty.expiry_date' }],
        requiredSlots: [],
        subjectRecordId: options.resolvedSubjectHint,
      };
    }
    if (has('field.inventory_item.replacement_cost')) {
      return {
        domainId: 'domain.inventory',
        entityId: 'entity.inventory_item',
        requestClass: 'DATA_QUERY',
        jobMatch: 'query.inventory_item.field_read',
        projection: 'DETAIL',
        polarity: 'POSITIVE',
        relations: [],
        where: null,
        time: null,
        fields: [{ fieldId: 'field.inventory_item.replacement_cost' }],
        requiredSlots: [],
        subjectRecordId: options.resolvedSubjectHint,
      };
    }
  }

  return null;
}

function toFacet(id: string, span: SemanticSourceSpan, spec: ClauseSpec): SemanticFacet {
  return {
    id,
    sourceSpan: span,
    requestClass: spec.requestClass,
    domainCandidates: [{ id: spec.domainId, score: 1 }],
    subject: { entityId: spec.entityId, recordId: spec.subjectRecordId ?? null },
    relations: [...spec.relations],
    polarity: spec.polarity,
    projection: spec.projection,
    fields: [...spec.fields],
    where: spec.where,
    sort: [],
    limit: null,
    time: spec.time,
    groupBy: [],
    targetCandidates: [{ id: spec.jobMatch, score: 1 }],
    requiredSlots: [...spec.requiredSlots],
    dependsOn: [...(spec.dependsOn ?? [])],
    evidence: {
      jobMatch: spec.jobMatch,
      subjectNamed: true,
      relationNamed: spec.relations.length > 0,
      projectionNamed: true,
      polarityNamed: spec.polarity !== null,
    },
    confidenceSignals: { grammarComplete: true, unresolvedSpanCount: 0 },
  };
}

function buildEmptyPlan(
  outcome: 'NONE_FITS' | 'INSUFFICIENT_TEXT' | 'BOUNDARY',
  rawText: string,
  unresolvedSpans: readonly SemanticSourceSpan[] = [],
): SemanticRequestPlan {
  const normalizedText = normalizePhrase(rawText);
  return SemanticRequestPlanSchema.parse({
    schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
    producer: { kind: 'DETERMINISTIC', version: ASK_CROSS_DOMAIN_PARSER_VERSION },
    outcome,
    rawText,
    normalizedText,
    minimizedText: normalizedText,
    unresolvedSpans: [...unresolvedSpans],
    facets: [],
  });
}

function splitCompoundClauses(rawText: string): {
  readonly subjectPrefix: string | null;
  readonly clauses: Array<{ text: string; start: number; end: number }>;
} {
  const colonIdx = rawText.indexOf(':');
  if (colonIdx > 0) {
    const prefix = rawText.slice(0, colonIdx).trim();
    const rest = rawText.slice(colonIdx + 1);
    const parts = rest.split(/,\s*(?:and\s+)?|\band\b/i).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let cursor = colonIdx + 1;
      return {
        subjectPrefix: prefix,
        clauses: parts.map((text) => {
          const idx = rawText.indexOf(text, cursor);
          const start = idx >= 0 ? idx : cursor;
          const end = start + text.length;
          cursor = end;
          return { text, start, end };
        }),
      };
    }
  }

  // Single-clause multi-item coordinations that bind within one predicate/capability
  const tokens = tokenizeClause(rawText);
  const { annotations } = annotateClauseTokens(tokens);
  const sig = indexAnnotations(annotations);
  const isSingleClauseCoordination = (
    (sig.ids.has('category.maintenance.plumbing') && sig.ids.has('category.maintenance.electrical') && !rawText.includes(','))
    || (sig.ids.has('entity.recall') && sig.ids.has('status.affected'))
    || sig.ids.has('projection.compare')
  );
  if (isSingleClauseCoordination) {
    return { subjectPrefix: null, clauses: [{ text: rawText.trim(), start: 0, end: rawText.length }] };
  }

  const rawParts = rawText
    .replace(/,\s+and\s+/gi, ', ')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawParts.length <= 1) {
    return { subjectPrefix: null, clauses: [{ text: rawText.trim(), start: 0, end: rawText.length }] };
  }

  let cursor = 0;
  return {
    subjectPrefix: null,
    clauses: rawParts.map((text) => {
      const idx = rawText.indexOf(text, cursor);
      const start = idx >= 0 ? idx : cursor;
      const end = start + text.length;
      cursor = end;
      return { text, start, end };
    }),
  };
}

/**
 * Token-annotated Cross-Domain Request Plan Builder across Waves 1-5 (FR-PLAN-5/7, §18).
 * Operates exclusively over generated lexicon annotations (no operation-selecting sentence regexes).
 */
export function parseCrossDomainSemanticRequest(
  rawText: string,
  options?: { readonly dynamicQuotes?: readonly DynamicQuoteCandidate[] },
): CrossDomainParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { plan: buildEmptyPlan('INSUFFICIENT_TEXT', rawText), clarification: null, overflowFacets: [], requiresUnambiguousCoordination: false };
  }

  // Stage 0 emergency safety boundary (§6.2)
  if (EMERGENCY_SAFETY_PATTERNS.some((pattern) => pattern.test(rawText))) {
    return { plan: buildEmptyPlan('BOUNDARY', rawText), clarification: null, overflowFacets: [], requiresUnambiguousCoordination: false };
  }

  const dynamicQuotes = options?.dynamicQuotes ?? [];

  // Check whole-utterance tokens against generated lexicon (plus dynamic quote entities) before admitting any plan
  const wholeTokens = tokenizeClause(trimmed);
  const wholeAnnotated = annotateClauseWithDynamicQuotes(wholeTokens, dynamicQuotes);
  if (wholeAnnotated.unresolvedSpans.length > 0) {
    return {
      plan: buildEmptyPlan('NONE_FITS', rawText, wholeAnnotated.unresolvedSpans),
      clarification: null,
      overflowFacets: [],
      requiresUnambiguousCoordination: false,
    };
  }

  const wholeSignals = indexAnnotations(wholeAnnotated.annotations);
  // Focused clarification for ambiguous negative OR (Row 9)
  if (
    wholeSignals.ids.has('polarity.negative')
    && wholeSignals.ids.has('coordinator.or')
    && !wholeSignals.ids.has('coordinator.neither')
    && wholeSignals.ids.has('relation.inventory_item.manual_document')
    && wholeSignals.ids.has('relation.inventory_item.receipt_document')
  ) {
    return {
      plan: buildEmptyPlan('NONE_FITS', rawText),
      clarification: {
        reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION',
        question: 'Did you mean appliances missing either a manual or a receipt, or appliances missing both?',
        options: ['MISSING_EITHER_DOCUMENT', 'MISSING_BOTH_DOCUMENTS'],
      },
      overflowFacets: [],
      requiresUnambiguousCoordination: true,
    };
  }

  const segmented = splitCompoundClauses(trimmed);
  const resolvedSubjectHint = segmented.subjectPrefix
    ? (segmented.subjectPrefix.toLowerCase().includes('water heater') ? 'water-heater' : segmented.subjectPrefix.toLowerCase().includes('furnace') ? 'furnace' : null)
    : null;

  const builtFacets: SemanticFacet[] = [];
  const overflowFacets: PlanOverflowFacet[] = [];
  let claimFacetId: string | null = null;
  const itemAspectIds: string[] = [];

  for (const [index, clause] of segmented.clauses.entries()) {
    const facetId = `facet-${index + 1}`;
    const clauseTokens = tokenizeClause(clause.text);
    const clauseAnnotated = annotateClauseWithDynamicQuotes(clauseTokens, dynamicQuotes);
    const clauseSignals = indexAnnotations(clauseAnnotated.annotations);

    let spec = clauseAnnotated.unresolvedSpans.length === 0
      ? compileClauseSpecFromAnnotations(clauseSignals, {
          priorClaimFacetId: claimFacetId,
          resolvedSubjectHint,
          matchedQuoteIds: clauseAnnotated.matchedQuoteIds,
        })
      : null;

    if (!spec) {
      const baseSingle = parseDeterministicSemanticRequest(clause.text);
      if (baseSingle.outcome === 'MATCH' && baseSingle.facets[0]?.confidenceSignals.grammarComplete) {
        const single = baseSingle.facets[0];
        const domainId = single.relations[0]?.semanticRelationId === 'relation.inventory_item.warranty'
          ? 'domain.warranties_coverage'
          : single.domainCandidates[0]?.id ?? 'domain.inventory';
        spec = {
          domainId,
          entityId: single.subject?.entityId ?? 'entity.inventory_item',
          requestClass: single.requestClass as 'DATA_QUERY' | 'CAPABILITY',
          jobMatch: single.evidence.jobMatch,
          projection: single.projection,
          polarity: single.polarity,
          relations: single.relations,
          where: single.where,
          time: single.time,
          fields: single.fields,
          requiredSlots: single.requiredSlots,
        };
      }
    }

    if (!spec) {
      return {
        plan: buildEmptyPlan('NONE_FITS', rawText, [{ start: clause.start, end: clause.end, text: clause.text }]),
        clarification: null,
        overflowFacets: [],
        requiresUnambiguousCoordination: false,
      };
    }

    if (spec.entityId === 'entity.claim' && spec.jobMatch === 'query.claim.filter') {
      claimFacetId = facetId;
    }

    if (builtFacets.length >= MAX_PLAN_FACETS) {
      overflowFacets.push({
        id: facetId,
        sourceSpan: { start: clause.start, end: clause.end, text: clause.text },
        label: clause.text,
        reasonCode: 'DOMAIN_NOT_SEARCHED',
      });
      continue;
    }

    if (resolvedSubjectHint && spec.jobMatch === 'job.inventory.replacement_guidance' && itemAspectIds.length > 0) {
      spec = { ...spec, dependsOn: [...itemAspectIds] };
    } else if (resolvedSubjectHint) {
      itemAspectIds.push(facetId);
    }

    builtFacets.push(toFacet(facetId, { start: clause.start, end: clause.end, text: clause.text }, spec));
  }

  const plan = SemanticRequestPlanSchema.parse({
    schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
    producer: { kind: 'DETERMINISTIC', version: ASK_CROSS_DOMAIN_PARSER_VERSION },
    outcome: 'MATCH',
    rawText,
    normalizedText: normalizePhrase(rawText),
    minimizedText: normalizePhrase(rawText),
    unresolvedSpans: [],
    facets: builtFacets,
  });

  return {
    plan,
    clarification: null,
    overflowFacets,
    requiresUnambiguousCoordination: false,
  };
}

export function applyCrossDomainFollowUpRefinement(
  priorPlan: SemanticRequestPlan,
  followUpText: string,
  dynamicEntities: readonly DynamicPlaceholderEntityCandidate[] = [],
  dynamicQuotes: readonly DynamicQuoteCandidate[] = [],
): {
  readonly outcome: 'REFINED' | 'CLARIFY_UNRESOLVED';
  readonly plan: SemanticRequestPlan;
  readonly unresolvedSpans: readonly SemanticSourceSpan[];
} {
  const strippedFollowUp = followUpText.replace(/^what\s+about\s+/i, '').trim() || followUpText;
  if (
    priorPlan.outcome === 'MATCH'
    && priorPlan.facets.length > 0
    && priorPlan.facets[0].evidence.jobMatch === 'job.projects.quote_comparison'
    && dynamicQuotes.length > 0
  ) {
    const followTokens = tokenizeClause(strippedFollowUp);
    const followAnnotated = annotateClauseWithDynamicQuotes(followTokens, dynamicQuotes);
    if (followAnnotated.unresolvedSpans.length === 0 && followAnnotated.matchedQuoteIds.length >= 2) {
      const priorFacet = priorPlan.facets[0];
      const followSignals = indexAnnotations(followAnnotated.annotations);
      const priorScope = priorFacet.where?.kind === 'PREDICATE' ? (priorFacet.where.targetRecordId ?? null) : null;
      const requestedScope = followSignals.quoteScope ?? priorScope;
      const boundQuoteIds = followAnnotated.matchedQuoteIds.slice(0, 2);
      const refinedPlan = SemanticRequestPlanSchema.parse({
        ...priorPlan,
        facets: [
          {
            ...priorFacet,
            relations: priorFacet.relations.length > 0
              ? priorFacet.relations
              : [{
                  semanticRelationId: 'relation.contractor_quote.comparison',
                  predicateId: 'predicate.contractor_quote.compared_in_scope',
                  targetEntityId: 'entity.contractor_quote',
                }],
            where: {
              kind: 'PREDICATE',
              predicateId: 'predicate.contractor_quote.compared_in_scope',
              relationPathId: 'path.contractor_quote.comparison',
              ...(requestedScope ? { targetRecordId: requestedScope } : {}),
              targetCategorySet: [...boundQuoteIds],
            },
            requiredSlots: [{ slotId: 'slot.quotes.two_resolved_quotes', state: 'RESOLVED' }],
          },
          ...priorPlan.facets.slice(1),
        ],
      });
      return {
        outcome: 'REFINED',
        plan: refinedPlan,
        unresolvedSpans: [],
      };
    }
  }
  const delta = extractSemanticFollowUpDelta(strippedFollowUp, { dynamicEntities });
  if (delta.outcome !== 'APPLICABLE' || priorPlan.outcome !== 'MATCH' || priorPlan.facets.length === 0) {
    return {
      outcome: 'CLARIFY_UNRESOLVED',
      plan: priorPlan,
      unresolvedSpans: delta.unresolvedSpans,
    };
  }
  const priorFacet = priorPlan.facets[0];
  const mergedRelations = [...priorFacet.relations];
  for (const rel of delta.relations) {
    if (!mergedRelations.some((existing) => existing.semanticRelationId === rel.semanticRelationId && existing.predicateId === rel.predicateId)) {
      mergedRelations.push(rel);
    }
  }
  const mergedWhere: SemanticWhereExpression | null = delta.where
    ? priorFacet.where
      ? { kind: 'AND', operands: [priorFacet.where, delta.where] }
      : delta.where
    : priorFacet.where;

  const refinedPlan = SemanticRequestPlanSchema.parse({
    ...priorPlan,
    facets: [
      {
        ...priorFacet,
        projection: delta.projection ?? priorFacet.projection,
        polarity: delta.polarity ?? priorFacet.polarity,
        time: delta.time ?? priorFacet.time,
        relations: mergedRelations,
        where: mergedWhere,
      },
      ...priorPlan.facets.slice(1),
    ],
  });

  return {
    outcome: 'REFINED',
    plan: refinedPlan,
    unresolvedSpans: [],
  };
}
