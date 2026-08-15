import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand, AskIntentClassification } from './askTrust.contract';
import {
  ASK_DEFAULT_LANGUAGE,
  requireCertifiedAskLanguage,
  type AskLanguageCode,
} from './askLanguageRegistry';
import { askEmbeddingCosine, askEmbeddingIndexVersion, embedAskSemanticText, type AskSemanticEmbedding } from './askSemanticEmbedding';
import { calibrateAskRoutingConfidence, type AskRetrievalPath } from './askRoutingCalibration';

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

function editDistance(left: string, right: string): number {
  const prior = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        prior[rightIndex] + 1,
        prior[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    prior.splice(0, prior.length, ...current);
  }
  return prior[right.length];
}

function tokenAffinity(left: string, right: string): number {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 4) return 0;
  const affinity = 1 - (editDistance(left, right) / Math.max(left.length, right.length));
  return affinity >= 0.72 ? affinity : 0;
}

function softLexicalSimilarity(left: readonly string[], right: readonly string[]): number {
  if (!left.length || !right.length) return 0;
  const forward = left.reduce((total, token) => total + Math.max(...right.map((candidate) => tokenAffinity(token, candidate))), 0);
  return forward / Math.sqrt(left.length * right.length);
}

export function askSemanticTextSimilarity(
  left: string,
  right: string,
  language: AskLanguageCode = ASK_DEFAULT_LANGUAGE,
): number {
  const leftTokens = [...new Set(tokens(left, language))];
  const rightTokens = [...new Set(tokens(right, language))];
  const lexical = softLexicalSimilarity(leftTokens, rightTokens);
  return Number(((lexical * 0.62) + (dice(trigrams(left, language), trigrams(right, language)) * 0.38)).toFixed(4));
}

export interface AskSemanticCandidate {
  operationId: AskOperationId;
  language: AskLanguageCode;
  semanticVersion: string;
  score: number;
  rawScore: number;
  lexicalScore: number;
  embeddingScore: number | null;
  confidenceBand: AskConfidenceBand;
  minimumExecutionConfidence: number;
  ambiguityMargin: number;
  calibrationVersion: string;
  retrievalPath: AskRetrievalPath;
  reasonCodes: string[];
}

export function askOperationSemanticIndexVersion(language: AskLanguageCode): string {
  const registration = requireCertifiedAskLanguage(language);
  return askEmbeddingIndexVersion([
      registration.semanticIndexNamespace,
      ...Object.values(ASK_OPERATION_DEFINITIONS)
        .filter((entry) => entry.semantic.supportedLanguages.includes(language))
        .map((entry) => `${entry.operationId}@${entry.semantic.languagePacks[language]?.semanticVersion ?? 'missing'}`)
        .sort(),
    ]);
}

export const ASK_OPERATION_SEMANTIC_INDEX_VERSION = askOperationSemanticIndexVersion(ASK_DEFAULT_LANGUAGE);

interface IndexedOperationDocuments {
  operationId: AskOperationId;
  documents: string[];
  documentEmbeddings: AskSemanticEmbedding[];
  hardNegativeEmbeddings: AskSemanticEmbedding[];
}

const embeddingIndexCache = new Map<string, IndexedOperationDocuments[]>();

function operationEmbeddingIndex(language: AskLanguageCode): IndexedOperationDocuments[] {
  const version = askOperationSemanticIndexVersion(language);
  const existing = embeddingIndexCache.get(version);
  if (existing) return existing;
  const index = Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => definition.semantic.supportedLanguages.includes(language))
    .map((definition) => {
      const semantic = definition.semantic.languagePacks[language]!;
      const documents = [semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples];
      return {
        operationId: definition.operationId,
        documents,
        documentEmbeddings: documents.map((document) => embedAskSemanticText(normalizeAskMessage(document, language).normalized)),
        hardNegativeEmbeddings: semantic.hardNegativeExamples.map((document) => embedAskSemanticText(normalizeAskMessage(document, language).normalized)),
      };
    });
  embeddingIndexCache.set(version, index);
  return index;
}

export function retrieveAskOperationCandidates(message: string, options: {
  eligibleOperationIds?: Iterable<AskOperationId>;
  topK?: number;
  language?: AskLanguageCode;
  embeddingEnabled?: boolean;
  minimumConfidence?: number;
  ambiguityMargin?: number;
} = {}): AskSemanticCandidate[] {
  const language = options.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  const queryTokens = tokens(message, language);
  const querySet = new Set(queryTokens);
  const embeddingEnabled = options.embeddingEnabled !== false;
  const retrievalPath: AskRetrievalPath = embeddingEnabled ? 'HYBRID_LOCAL_EMBEDDING' : 'LEXICAL_LOCAL';
  const queryEmbedding = embeddingEnabled ? embedAskSemanticText(normalizeAskMessage(message, language).normalized) : null;
  const embeddingIndex = embeddingEnabled
    ? new Map(operationEmbeddingIndex(language).map((entry) => [entry.operationId, entry]))
    : new Map<AskOperationId, IndexedOperationDocuments>();
  const eligible = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
  return Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => !eligible || eligible.has(definition.operationId))
    .filter((definition) => definition.semantic.supportedLanguages.includes(language))
    .map((definition): AskSemanticCandidate => {
      const semantic = definition.semantic.languagePacks[language]!;
      const documents = [semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples];
      const documentTokens = new Set(documents.flatMap((document) => tokens(document, language)));
      const overlap = [...querySet].filter((token) => documentTokens.has(token)).length;
      const lexical = Math.max(...documents.map((document) => softLexicalSimilarity(queryTokens, [...new Set(tokens(document, language))])));
      const phrase = Math.max(...documents.map((document) => dice(trigrams(message, language), trigrams(document, language))));
      const negative = Math.max(...semantic.hardNegativeExamples.map((example) => dice(trigrams(message, language), trigrams(example, language))));
      const exactConcept = documents.some((document) => normalizeAskMessage(document, language).normalized === normalizeAskMessage(message, language).normalized);
      const indexed = embeddingIndex.get(definition.operationId);
      const embedding = queryEmbedding && indexed
        ? Math.max(...indexed.documentEmbeddings.map((document) => askEmbeddingCosine(queryEmbedding, document)))
        : null;
      const embeddingNegative = queryEmbedding && indexed
        ? Math.max(...indexed.hardNegativeEmbeddings.map((document) => askEmbeddingCosine(queryEmbedding, document)))
        : 0;
      const negativePenalty = Math.max(negative, embeddingNegative) >= 0.72 ? 0.3 : 0;
      const rawScore = Math.max(0, Math.min(0.99,
        embedding == null
          ? (lexical * 0.62) + (phrase * 0.38) + (exactConcept ? 0.2 : 0) - negativePenalty
          : (lexical * 0.28) + (phrase * 0.22) + (embedding * 0.5) + (exactConcept ? 0.15 : 0) - negativePenalty,
      ));
      const calibration = calibrateAskRoutingConfidence({
        definition,
        language,
        routingPath: retrievalPath,
        rawScore,
        minimumConfidenceOverride: options.minimumConfidence,
        ambiguityMarginOverride: options.ambiguityMargin,
      });
      return {
        operationId: definition.operationId,
        language,
        semanticVersion: semantic.semanticVersion,
        score: calibration.calibratedConfidence,
        rawScore: calibration.rawScore,
        lexicalScore: Number(lexical.toFixed(4)),
        embeddingScore: embedding == null ? null : Number(embedding.toFixed(4)),
        confidenceBand: calibration.confidenceBand,
        minimumExecutionConfidence: calibration.minimumExecutionConfidence,
        ambiguityMargin: calibration.ambiguityMargin,
        calibrationVersion: calibration.calibrationVersion,
        retrievalPath,
        reasonCodes: [overlap ? 'SEMANTIC_TOKEN_OVERLAP' : 'SEMANTIC_PARAPHRASE', phrase >= 0.55 ? 'PHRASE_SIMILARITY' : 'CONTRACT_SIMILARITY', ...(embedding != null ? ['LOCAL_EMBEDDING_SIMILARITY'] : ['EMBEDDING_DISABLED']), ...(negativePenalty ? ['HARD_NEGATIVE_PENALTY'] : [])],
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
  const strongest = candidates[0];
  const runnerUp = candidates[1];
  const minimum = Math.max(options.minimumConfidence ?? 0, strongest?.minimumExecutionConfidence ?? 0.42);
  const runnerMinimum = Math.max(options.minimumConfidence ?? 0, runnerUp?.minimumExecutionConfidence ?? minimum);
  const contentTokenCount = options.normalizedMessage ? tokens(options.normalizedMessage).length : Number.POSITIVE_INFINITY;
  const margin = Math.max(
    options.ambiguityMargin ?? strongest?.ambiguityMargin ?? 0.1,
    contentTokenCount <= 3 ? 0.2 : 0,
  );
  const ambiguous = Boolean(strongest && runnerUp && strongest.score >= minimum && runnerUp.score >= runnerMinimum && strongest.score - runnerUp.score < margin);
  const multiIntent = Boolean(
    strongest && runnerUp
    && strongest.score >= minimum && runnerUp.score >= runnerMinimum
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
