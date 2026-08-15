import { createHash } from 'node:crypto';

export const ASK_LOCAL_EMBEDDING_VERSION = 'local-subword-embedding-1.0';
const DIMENSIONS = 384;

export type AskSemanticEmbedding = Float32Array;

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
