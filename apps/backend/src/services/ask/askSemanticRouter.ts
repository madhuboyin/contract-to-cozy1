import { createHash } from 'node:crypto';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand, AskIntentClassification } from './askTrust.contract';

export const ASK_LANGUAGE_CONTRACT_VERSION = 'en-normalization-1.0';

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
  language: 'en';
  contractVersion: typeof ASK_LANGUAGE_CONTRACT_VERSION;
}

export function normalizeAskMessage(original: string): NormalizedAskMessage {
  let normalized = original.normalize('NFKC').toLowerCase();
  for (const [source, target] of Object.entries(CONTRACTIONS)) normalized = normalized.split(source).join(target);
  normalized = normalized
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$%.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
  return { original, normalized, language: 'en', contractVersion: ASK_LANGUAGE_CONTRACT_VERSION };
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokens(value: string): string[] {
  return normalizeAskMessage(value).normalized.split(' ').map(stem).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function trigrams(value: string): Set<string> {
  const compact = `  ${normalizeAskMessage(value).normalized} `;
  return new Set(Array.from({ length: Math.max(0, compact.length - 2) }, (_, index) => compact.slice(index, index + 3)));
}

function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

export interface AskSemanticCandidate {
  operationId: AskOperationId;
  semanticVersion: string;
  score: number;
  confidenceBand: AskConfidenceBand;
  reasonCodes: string[];
}

export const ASK_OPERATION_SEMANTIC_INDEX_VERSION = createHash('sha256')
  .update(Object.values(ASK_OPERATION_DEFINITIONS).map((entry) => `${entry.operationId}@${entry.semantic.semanticVersion}`).sort().join('|'))
  .digest('hex').slice(0, 16);

export function retrieveAskOperationCandidates(message: string, options: {
  eligibleOperationIds?: Iterable<AskOperationId>;
  topK?: number;
} = {}): AskSemanticCandidate[] {
  const queryTokens = tokens(message);
  const querySet = new Set(queryTokens);
  const eligible = options.eligibleOperationIds ? new Set(options.eligibleOperationIds) : null;
  return Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => !eligible || eligible.has(definition.operationId))
    .map((definition): AskSemanticCandidate => {
      const semantic = definition.semantic;
      const documents = [semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples];
      const documentTokens = new Set(documents.flatMap(tokens));
      const overlap = [...querySet].filter((token) => documentTokens.has(token)).length;
      const lexical = overlap / Math.sqrt(Math.max(1, querySet.size * documentTokens.size));
      const phrase = Math.max(...documents.map((document) => dice(trigrams(message), trigrams(document))));
      const negative = Math.max(...semantic.hardNegativeExamples.map((example) => dice(trigrams(message), trigrams(example))));
      const exactConcept = documents.some((document) => normalizeAskMessage(document).normalized === normalizeAskMessage(message).normalized);
      const score = Math.max(0, Math.min(0.99, (lexical * 0.62) + (phrase * 0.38) + (exactConcept ? 0.2 : 0) - (negative >= 0.72 ? 0.35 : 0)));
      return {
        operationId: definition.operationId,
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
  const multiIntent = Boolean(ambiguous && options.normalizedMessage && /\b(?:and|also|plus|then)\b/.test(options.normalizedMessage));
  const resolved = Boolean(strongest && strongest.score >= minimum && !ambiguous);
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
