import type { AskCapabilityPrompt, AskDiscoveryClaim } from './types';

// Explore with Cozy / capability explorer measurement (capability discovery plan, Phase 4). These helpers keep the events bounded: a count
// is reported only as a bucket, and nothing here accepts a message, a label or a search phrase.
export type ResultBucket = '0' | '1' | '2-5' | '6+';

export function bucketResultCount(count: number): ResultBucket {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count === 1) return '1';
  return count <= 5 ? '2-5' : '6+';
}

/** Visibility events fire once per key for the life of the workspace: a re-render, a remount or a re-expanded panel is not a new impression. */
export function createOnceGate() {
  const seen = new Set<string>();
  return (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

/**
 * The claim an explorer entry makes about itself so the server can join its capability lifecycle to this selection. Only a reviewed entry (it
 * carries the operation the server declared) chosen from More ideas or a landing prompt built from one makes a claim; the server still ignores
 * it unless the operation and message match the entry exactly.
 */
export function discoveryClaimFor(prompt: Pick<AskCapabilityPrompt, 'id' | 'operationId'>, source: string): AskDiscoveryClaim | undefined {
  if (!prompt.operationId) return undefined;
  if (source === 'EXPLORER') return { entryId: prompt.id, surface: 'EXPLORER' };
  if (source === 'DISCOVERY') return { entryId: prompt.id, surface: 'LANDING_PROMPT' };
  return undefined;
}
