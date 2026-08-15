import { createHash } from 'node:crypto';

export const ASK_LOCAL_EMBEDDING_VERSION = 'local-synonym-subword-embedding-3.0';
const DIMENSIONS = 384;

export type AskSemanticEmbedding = Float32Array;

// Language-level synonym groups are deliberately operation-agnostic. The
// operation index still comes exclusively from registered semantic contracts;
// these groups only let equivalent homeowner vocabulary share a hashed feature.
// New operations therefore add examples/hard negatives to their own contract
// and never require an embedding-engine branch or operation identifier here.
const SEMANTIC_SYNONYM_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = Object.freeze([
  ['home', ['home', 'house', 'property', 'residence', 'place']],
  ['record', ['record', 'recorded', 'profile', 'documentation', 'dossier', 'file', 'details', 'information']],
  ['complete', ['complete', 'healthy', 'good shape', 'filled in', 'nothing missing']],
  ['missing', ['missing', 'pending', 'unfilled', 'outstanding', 'left to add']],
  ['maintenance', ['maintenance', 'upkeep', 'chores', 'household work', 'service work']],
  ['cost', ['cost', 'costs', 'expense', 'expenses', 'bills', 'spending', 'money going', 'outlay', 'budget']],
  ['owning', ['owning', 'ownership', 'keeping this place', 'keep this place', 'housing']],
  ['coverage', ['coverage', 'protection', 'protections', 'insurance', 'warranty']],
  ['uncovered', ['uncovered', 'unprotected', 'exposed', 'without protection', 'coverage gap']],
  ['repair', ['repair', 'fix', 'mend', 'nursing along', 'keep running', 'postpone fixing']],
  ['replace', ['replace', 'replacement', 'buying another', 'new one', 'take its place']],
  ['hvac', ['hvac', 'furnace', 'heater', 'heating', 'heating unit', 'heating system', 'air conditioner', 'heat pump', 'cooling system']],
  ['mortgage', ['mortgage', 'home loan', 'housing debt', 'cost of debt', 'borrowing cost']],
  ['rate', ['rate', 'rates', 'interest', 'interest rate', 'percentage']],
  ['financial-result', ['numbers', 'finances', 'financial result', 'bottom line', 'economics', 'break even']],
  ['monitor', ['monitor', 'watch', 'keep an eye', 'alert', 'notify', 'ping', 'holler', 'let me know', 'warn']],
  ['save', ['save', 'savings', 'trim', 'lower', 'reduce', 'cut']],
  ['priority', ['priority', 'focus first', 'attention first', 'start first', 'do next']],
  ['capability', ['tool', 'workflow', 'feature', 'built in', 'supported', 'available']],
  ['sell', ['sell', 'selling', 'put on market', 'go on the market']],
  ['rent', ['rent', 'renting', 'landlord', 'lease out']],
  ['invite', ['invite', 'join', 'add member', 'household access']],
  ['guided', ['guided', 'step by step', 'walk me through', 'sequence']],
  ['quote', ['quote', 'bid', 'proposal', 'estimate', 'offer']],
  ['create', ['create', 'start', 'open', 'set up', 'fresh workspace', 'new workspace']],
  ['contractor', ['contractor', 'builder', 'builders', 'vendor', 'trade professional']],
  ['compare', ['compare', 'comparison', 'side by side', 'differ', 'difference', 'evaluate', 'review']],
  ['change', ['change', 'changed', 'altered', 'different', 'update', 'new lately']],
  ['undo', ['undo', 'retract', 'unlink', 'remove', 'dispute', 'incorrect', 'wrong']],
  ['continue', ['continue', 'resume', 'bring me back', 'pick up', 'where we left off']],
  ['scenario', ['scenario', 'alternative', 'another option', 'recalculate']],
  ['abandon', ['abandon', 'drop', 'cancel', 'stop tracking']],
  ['preference', ['preference', 'assumption', 'ownership horizon', 'priority setting']],
  ['outcome', ['outcome', 'result', 'turn out', 'turned out', 'ended up', 'what happened', 'concluded']],
  ['inventory', ['inventory', 'appliance', 'equipment', 'installed item', 'dryer', 'clothes dryer', 'laundry dryer']],
  ['tax-appeal', ['property tax appeal', 'contest assessment', 'challenge assessed value']],
  ['permit', ['permit', 'approval', 'inspection clearance', 'hoa approval']],
  ['renovation', ['renovation', 'remodel', 'building project']],
  ['emergency', ['emergency', 'gas smell', 'carbon monoxide', 'co alarm', 'smoke alarm']],
]);

function containsPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

export function askSemanticConcepts(normalized: string): string[] {
  return SEMANTIC_SYNONYM_GROUPS
    .filter(([, phrases]) => phrases.some((phrase) => containsPhrase(normalized, phrase)))
    .map(([concept]) => concept);
}

export function askSemanticConceptSimilarity(left: string, right: string): number {
  const leftConcepts = new Set(askSemanticConcepts(left));
  const rightConcepts = new Set(askSemanticConcepts(right));
  if (!leftConcepts.size || !rightConcepts.size) return 0;
  const leftWeight = leftConcepts.size;
  const rightWeight = rightConcepts.size;
  const shared = [...leftConcepts].filter((concept) => rightConcepts.has(concept))
    .length;
  return shared / Math.sqrt(leftWeight * rightWeight);
}

function hashFeature(feature: string): { index: number; sign: number } {
  let hash = 2166136261;
  for (let index = 0; index < feature.length; index += 1) {
    hash ^= feature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return { index: (hash >>> 1) % DIMENSIONS, sign: hash & 1 ? 1 : -1 };
}

function addFeature(vector: AskSemanticEmbedding, feature: string, weight: number): void {
  const hashed = hashFeature(feature);
  vector[hashed.index] += hashed.sign * weight;
}

function semanticFeatures(normalized: string): Array<[string, number]> {
  const words = normalized.split(/\s+/).filter(Boolean);
  const features: Array<[string, number]> = words.map((word) => [`w:${word}`, 1.8]);
  for (const concept of askSemanticConcepts(normalized)) features.push([`synonym:${concept}`, 8]);
  for (let index = 0; index < words.length - 1; index += 1) features.push([`b:${words[index]}_${words[index + 1]}`, 1.15]);
  const compact = `  ${normalized.replace(/\s+/g, ' ')} `;
  for (const size of [3, 4, 5]) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      features.push([`c${size}:${compact.slice(index, index + size)}`, size === 3 ? 0.28 : size === 4 ? 0.42 : 0.55]);
    }
  }
  return features;
}

export function embedAskSemanticText(normalized: string): AskSemanticEmbedding {
  const vector = new Float32Array(DIMENSIONS);
  for (const [feature, weight] of semanticFeatures(normalized)) addFeature(vector, feature, weight);
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  if (magnitude === 0) return vector;
  const scale = 1 / Math.sqrt(magnitude);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= scale;
  return vector;
}

export function askEmbeddingCosine(left: AskSemanticEmbedding, right: AskSemanticEmbedding): number {
  let similarity = 0;
  for (let index = 0; index < DIMENSIONS; index += 1) similarity += left[index] * right[index];
  return Math.max(0, Math.min(1, similarity));
}

export function askEmbeddingIndexVersion(parts: readonly string[]): string {
  return createHash('sha256').update([ASK_LOCAL_EMBEDDING_VERSION, ...parts].join('|')).digest('hex').slice(0, 16);
}
