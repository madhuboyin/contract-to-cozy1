import { createHash } from 'node:crypto';

export const ASK_LOCAL_EMBEDDING_VERSION = 'local-concept-subword-embedding-2.0';
const DIMENSIONS = 384;

export type AskSemanticEmbedding = Float32Array;

// A small, governed concept layer gives the offline embedding meaning beyond
// shared spelling.  It deliberately contains bounded home-domain concepts,
// not user data, and can be versioned/certified with the operation corpus.
// Phrase alternatives map to the same feature even when they share no tokens
// (for example "housing budget" and "ownership costs").
const SEMANTIC_CONCEPTS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ['property-record', /\b(?:home|house|property|address)\b.*\b(?:record|profile|details?|information|documentation)\b|\b(?:documentation|record|profile)\b.*\b(?:home|house|property|address)\b/i],
  ['record-completeness', /\b(?:complete|completeness|missing|pending|unfilled|outstanding|healthy|health)\b.*\b(?:record|profile|details?|documentation|information)\b/i],
  ['maintenance-work', /\b(?:maintenance|upkeep|chores?|service work|household work)\b/i],
  ['maintenance-change', /\b(?:change|edit|move|reschedule|reassign|who owns|priority|due date)\b.*\b(?:task|job|maintenance|work)\b/i],
  ['maintenance-create', /\b(?:create|add|put|schedule|set up)\b.*\b(?:task|job|maintenance|upkeep list)\b/i],
  ['maintenance-complete', /\b(?:task|job|work|service)\b.*\b(?:done|complete|finished)\b|\b(?:done|complete|finished)\b.*\b(?:task|job|work|service)\b/i],
  ['maintenance-complete-command', /\b(?:mark|set|complete|finish)\b.*\b(?:task|job|work|service)\b|\b(?:task|job)\b.*\b(?:is|as)\b.*\b(?:done|complete|finished)\b/i],
  ['incident-status', /\b(?:filed|submitted|open|pending|recorded|recent|storm)\b.*\b(?:claim|incident)\b|\b(?:claim|incident)\b.*\b(?:stand|status|filed|open|pending|recorded)\b/i],
  ['ownership-cost', /\b(?:ownership costs?|housing budget|home budget|housing expenses?|home expenses?|property bills?|bills? eat|cost of owning)\b/i],
  ['coverage-gap', /\b(?:coverage gaps?|uncovered|unprotected|protections? leave|exposed|without (?:insurance|warranty|protection))\b/i],
  ['repair-replace', /\b(?:repair or replace|fix or replace|repair vs\.? replace|new one smarter|postpone fixing|worth (?:repairing|replacing))\b/i],
  ['replacement-decision', /\b(?:old|aging|economical|keeping|lifespan|new one|take its place)\b.*\b(?:appliance|dishwasher|refrigerator|fridge|equipment|one)\b|\b(?:appliance|dishwasher|refrigerator|fridge|equipment)\b.*\b(?:old|aging|economical|replace|new one)\b/i],
  ['hvac-system', /\b(?:hvac|furnace|heater|heating|heating system|air conditioner|a\/?c|heat pump|central air|cooling system)\b/i],
  ['mortgage-rate', /\b(?:mortgage|refinanc|borrowing costs?|home-loan rates?|interest rates?)\b/i],
  ['monitor-alert', /\b(?:monitor|watch|keep an eye|alert|notify|ping|let me know|remind|warn)\b/i],
  ['savings', /\b(?:save money|savings?|trim|lower|reduce|cut)\b.*\b(?:bills?|costs?|expenses?)\b/i],
  ['home-priority', /\b(?:focus first|attention first|where should i (?:focus|start)|next best|top priority|do next)\b/i],
  ['capability-discovery', /\b(?:built-in|supported|available)\b.*\b(?:tool|workflow|feature|help)\b|\bwhich\b.*\bworkflow\b/i],
  ['refinance-analysis', /\b(?:replac\w*|refinanc\w*|change)\b.*\b(?:home loan|mortgage)\b.*\b(?:improve|worth|numbers?|sense)\b|\brefinanc\w*\b.*\b(?:now|worth|sense|good|option)\b/i],
  ['sell-rent', /\b(?:landlord|rent(?:ing)? out)\b.*\b(?:market|sell|hold)\b|\b(?:sell|market)\b.*\b(?:rent|landlord|hold)\b/i],
  ['household-invite', /\b(?:invite|join|add|let)\b.*\b(?:partner|spouse|member|household workspace)\b/i],
  ['guided-plan', /\b(?:guided|sequence|step-by-step|walk me through)\b.*\b(?:plan|steps?|project|journey)\b/i],
  ['quote-workspace', /\b(?:open|create|start|fresh)\b.*\b(?:workspace|comparison)\b.*\b(?:quotes?|bids?|proposals?|estimates?)\b/i],
  ['quote-review', /\b(?:differ|difference|best|cheapest|evaluate|review|compare)\b.*\b(?:quote|bid|proposal|estimate)\b|\b(?:quote|bid|proposal|estimate)\b.*\b(?:differ|difference|best|cheapest|evaluate|review|compare)\b/i],
  ['home-change', /\b(?:what changed|anything new|recent changes?|updates?|altered|different|happened lately)\b/i],
  ['undo-outcome', /\b(?:retract|undo|unlink|remove|dispute|not right|wrong|incorrect)\b.*\b(?:outcome|report|said|reported|repair|replace)\b/i],
  ['decision-continue', /\b(?:continue|resume|bring me back|where.*stand|active)\b.*\b(?:decision|review)\b/i],
  ['decision-start', /\b(?:should|can we|is it|worth)\b.*\b(?:repair|fix|replace|new one|postpone fixing)\b|\b(?:repair or replace|fix or replace)\b/i],
  ['decision-scenario', /\b(?:additional|another|new|recalculate)\b.*\b(?:quote|bid|scenario|decision)\b/i],
  ['decision-abandon', /\b(?:drop|abandon|cancel|stop)\b.*\b(?:decision|review|tracking)\b/i],
  ['preference-save', /\b(?:save|keep|remember|record)\b.*\b(?:preference|upfront|reliability|sell)\b/i],
  ['preference-forget', /\b(?:forget|erase|remove|stop using)\b.*\b(?:preference|assumption|ownership horizon)\b/i],
  ['outcome-report', /\b(?:we|i)\b.*\b(?:ended up|installed|repaired|replaced|finished)\b/i],
  ['outcome-view', /\b(?:how|what)\b.*\b(?:turn out|outcome|happened|end up)\b/i],
  ['inventory-item', /\b(?:inventory|appliance|equipment|refrigerator|fridge|washer|dryer|dishwasher|water heater)\b/i],
  ['inventory-lookup', /\b(?:pull up|show|find|list|what.*recorded|what.*know)\b.*\b(?:inventory|appliance|equipment|refrigerator|fridge|washer|dryer|dishwasher|water heater)\b/i],
  ['quote-comparison', /\b(?:quote|bid|proposal|estimate)\b.*\b(?:compare|comparison|review|best|difference)\b|\bcompare\b.*\b(?:quote|bid|proposal|estimate)\b/i],
  ['property-tax-appeal', /\b(?:property tax|assessment|assessed value)\b.*\b(?:appeal|challenge|contest|too high)\b|\b(?:appeal|challenge|contest)\b.*\b(?:property tax|assessment|assessed value)\b/i],
  ['renovation-readiness', /\b(?:approvals?|permits?|inspections?|hoa)\b.*\b(?:block\w*|ready|start\w*|remodel|renovation)\b|\b(?:remodel|renovation)\b.*\b(?:approvals?|permits?|block\w*|ready|start\w*)\b/i],
  ['major-event', /\b(?:ready|prepare|walk me through|checklist)\b.*\b(?:go on the market|home sale|move out|moving|major renovation)\b/i],
  ['emergency', /\b(?:co|carbon monoxide|gas|smoke)\b.*\b(?:detector|alarm|smell|sounding|ill|dizzy)\b/i],
]);

const CONCEPT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  'inventory-item': 1, 'hvac-system': 1, 'maintenance-work': 1, 'mortgage-rate': 1,
  'repair-replace': 2, 'monitor-alert': 2,
});

export function askSemanticConcepts(normalized: string): string[] {
  return SEMANTIC_CONCEPTS.filter(([, pattern]) => pattern.test(normalized)).map(([concept]) => concept);
}

export function askSemanticConceptSimilarity(left: string, right: string): number {
  const leftConcepts = new Set(askSemanticConcepts(left));
  const rightConcepts = new Set(askSemanticConcepts(right));
  if (!leftConcepts.size || !rightConcepts.size) return 0;
  const leftWeight = [...leftConcepts].reduce((total, concept) => total + (CONCEPT_WEIGHTS[concept] ?? 3), 0);
  const rightWeight = [...rightConcepts].reduce((total, concept) => total + (CONCEPT_WEIGHTS[concept] ?? 3), 0);
  const shared = [...leftConcepts].filter((concept) => rightConcepts.has(concept))
    .reduce((total, concept) => total + (CONCEPT_WEIGHTS[concept] ?? 3), 0);
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
  for (const concept of askSemanticConcepts(normalized)) features.push([`concept:${concept}`, 12]);
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
