import { createHash } from 'node:crypto';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand, AskIntentClassification } from './askTrust.contract';
import {
  ASK_DEFAULT_LANGUAGE,
  requireCertifiedAskLanguage,
  type AskLanguageCode,
} from './askLanguageRegistry';

export const ASK_LANGUAGE_CONTRACT_VERSION = requireCertifiedAskLanguage(ASK_DEFAULT_LANGUAGE).normalizationContractVersion;

const CONTRACTIONS: Record<string, string> = {
  "what's": 'what is', "that's": 'that is', "can't": 'cannot', "don't": 'do not',
  "didn't": 'did not', "i've": 'i have', "i'm": 'i am', "we've": 'we have',
};

const ALIASES: Record<string, string> = {
  house: 'home', property: 'home', profile: 'record', info: 'information', facts: 'information',
  fields: 'details', unfilled: 'missing', incomplete: 'missing', remaining: 'pending', outstanding: 'pending',
  chores: 'maintenance', upkeep: 'maintenance', fridge: 'refrigerator', bids: 'quotes', proposals: 'quotes',
  estimate: 'quote', estimates: 'quotes', expenses: 'costs', expense: 'cost',
};

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'could', 'do', 'for', 'from', 'help', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'please', 'the', 'this', 'to', 'want', 'what', 'which', 'with', 'would']);

export interface NormalizedAskMessage {
  original: string;
  normalized: string;
  language: AskLanguageCode;
  contractVersion: string;
}

type AskLanguageNormalizer = (original: string) => string;

function normalizeEnglish(original: string): string {
  let normalized = original.normalize('NFKC').toLowerCase();
  for (const [source, target] of Object.entries(CONTRACTIONS)) normalized = normalized.split(source).join(target);
  return normalized
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$%.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
}

// Explicit adapter registry, not language detection. A future language must be
// registered, independently certified, and given its own normalizer here.
const LANGUAGE_NORMALIZERS: Readonly<Record<string, AskLanguageNormalizer>> = Object.freeze({
  en: normalizeEnglish,
});

export function normalizeAskMessage(
  original: string,
  language: AskLanguageCode = ASK_DEFAULT_LANGUAGE,
): NormalizedAskMessage {
  const registration = requireCertifiedAskLanguage(language);
  const normalizer = LANGUAGE_NORMALIZERS[language];
  if (!normalizer) {
    const error = new Error(`Ask language has no normalization adapter: ${language}`);
    (error as Error & { code?: string }).code = 'ASK_LANGUAGE_ADAPTER_MISSING';
    throw error;
  }
  return {
    original,
    normalized: normalizer(original),
    language,
    contractVersion: registration.normalizationContractVersion,
  };
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokens(value: string, language: AskLanguageCode = ASK_DEFAULT_LANGUAGE): string[] {
  return normalizeAskMessage(value, language).normalized.split(' ').map(stem).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function trigrams(value: string, language: AskLanguageCode = ASK_DEFAULT_LANGUAGE): Set<string> {
  const compact = `  ${normalizeAskMessage(value, language).normalized} `;
  return new Set(Array.from({ length: Math.max(0, compact.length - 2) }, (_, index) => compact.slice(index, index + 3)));
}

function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

export function askSemanticTextSimilarity(
  left: string,
  right: string,
  language: AskLanguageCode = ASK_DEFAULT_LANGUAGE,
): number {
  const leftTokens = new Set(tokens(left, language));
  const rightTokens = new Set(tokens(right, language));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const lexical = overlap / Math.sqrt(Math.max(1, leftTokens.size * rightTokens.size));
  return Number(((lexical * 0.62) + (dice(trigrams(left, language), trigrams(right, language)) * 0.38)).toFixed(4));
}

export interface AskSemanticCandidate {
  operationId: AskOperationId;
  language: AskLanguageCode;
  semanticVersion: string;
  score: number;
  confidenceBand: AskConfidenceBand;
  reasonCodes: string[];
}

export function askOperationSemanticIndexVersion(language: AskLanguageCode): string {
  const registration = requireCertifiedAskLanguage(language);
  return createHash('sha256')
    .update([
      registration.semanticIndexNamespace,
      ...Object.values(ASK_OPERATION_DEFINITIONS)
        .filter((entry) => entry.semantic.supportedLanguages.includes(language))
        .map((entry) => `${entry.operationId}@${entry.semantic.languagePacks[language]?.semanticVersion ?? 'missing'}`)
        .sort(),
    ].join('|'))
    .digest('hex').slice(0, 16);
}

export const ASK_OPERATION_SEMANTIC_INDEX_VERSION = askOperationSemanticIndexVersion(ASK_DEFAULT_LANGUAGE);

export function retrieveAskOperationCandidates(message: string, options: {
  eligibleOperationIds?: Iterable<AskOperationId>;
  topK?: number;
  language?: AskLanguageCode;
} = {}): AskSemanticCandidate[] {
  const language = options.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  const queryTokens = tokens(message, language);
  const querySet = new Set(queryTokens);
  const eligible = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
  return Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => !eligible || eligible.has(definition.operationId))
    .filter((definition) => definition.semantic.supportedLanguages.includes(language))
    .map((definition): AskSemanticCandidate => {
      const semantic = definition.semantic.languagePacks[language]!;
      const documents = [semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples];
      const documentTokens = new Set(documents.flatMap((document) => tokens(document, language)));
      const overlap = [...querySet].filter((token) => documentTokens.has(token)).length;
      const lexical = overlap / Math.sqrt(Math.max(1, querySet.size * documentTokens.size));
      const phrase = Math.max(...documents.map((document) => dice(trigrams(message, language), trigrams(document, language))));
      const negative = Math.max(...semantic.hardNegativeExamples.map((example) => dice(trigrams(message, language), trigrams(example, language))));
      const exactConcept = documents.some((document) => normalizeAskMessage(document, language).normalized === normalizeAskMessage(message, language).normalized);
      const score = Math.max(0, Math.min(0.99, (lexical * 0.62) + (phrase * 0.38) + (exactConcept ? 0.2 : 0) - (negative >= 0.72 ? 0.35 : 0)));
      return {
        operationId: definition.operationId,
        language,
        semanticVersion: semantic.semanticVersion,
        score: Number(score.toFixed(4)),
        confidenceBand: score >= 0.52 ? 'HIGH' : score >= 0.3 ? 'MEDIUM' : 'LOW',
        reasonCodes: [overlap ? 'SEMANTIC_TOKEN_OVERLAP' : 'SEMANTIC_PARAPHRASE', phrase >= 0.55 ? 'PHRASE_SIMILARITY' : 'CONTRACT_SIMILARITY', ...(negative >= 0.72 ? ['HARD_NEGATIVE_PENALTY'] : [])],
      };
    })
    .filter((candidate) => candidate.score > 0.08)
    .sort((left, right) => right.score - left.score || left.operationId.localeCompare(right.operationId))
    .slice(0, options.topK ?? 3);
}

export function classifyAskCandidates(candidates: AskSemanticCandidate[], options: {
  minimumConfidence?: number;
  ambiguityMargin?: number;
  normalizedMessage?: string;
} = {}): AskIntentClassification {
  const minimum = options.minimumConfidence ?? 0.3;
  const margin = options.ambiguityMargin ?? 0.1;
  const strongest = candidates[0];
  const runnerUp = candidates[1];
  const ambiguous = Boolean(strongest && runnerUp && strongest.score >= minimum && runnerUp.score >= minimum && strongest.score - runnerUp.score < margin);
  const multiIntent = Boolean(
    strongest && runnerUp
    && strongest.score >= minimum && runnerUp.score >= minimum
    && strongest.confidenceBand === 'HIGH' && runnerUp.confidenceBand === 'HIGH'
    && options.normalizedMessage && /\b(?:and|also|plus|then)\b/.test(options.normalizedMessage),
  );
  const resolved = Boolean(strongest && strongest.score >= minimum && !ambiguous && !multiIntent);
  return {
    schemaVersion: '1.0',
    selectedOperationId: resolved ? strongest!.operationId : null,
    candidateOperationIds: candidates.map((candidate) => candidate.operationId),
    outcome: multiIntent ? 'MULTI_INTENT' : ambiguous ? 'AMBIGUOUS' : resolved ? 'RESOLVED' : 'UNSUPPORTED',
    confidenceBand: strongest?.confidenceBand ?? 'LOW',
    extractedEntities: [],
    missingSlots: [],
    reasonCodes: multiIntent ? ['MULTIPLE_DISTINCT_INTENTS'] : ambiguous ? ['CANDIDATE_MARGIN_AMBIGUOUS'] : resolved ? strongest!.reasonCodes : ['INSUFFICIENT_SEMANTIC_CONFIDENCE'],
  };
}
