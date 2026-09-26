import type { AskExecutionResponse } from './types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-004/006 (FRD v1.111): the follow-up chips docked above the composer. They come
// only from the latest answer's own declared suggestions.
export const FOLLOW_UP_LIMIT = 4;

export function followUpSuggestions(
  latest: Pick<AskExecutionResponse, 'suggestions' | 'correctionCapabilities'> | undefined,
  askedKeys: ReadonlySet<string>,
  keyOf: (suggestion: string) => string,
): string[] {
  if (!latest) return [];
  const retryOffered = Boolean(latest.correctionCapabilities?.retryResponse);
  const seen = new Set<string>();
  const shown: string[] = [];
  for (const suggestion of latest.suggestions) {
    const text = suggestion.trim();
    const key = keyOf(text);
    if (!text || askedKeys.has(key) || seen.has(key)) continue;
    // A retry the answer already offers as its primary action is not repeated as a chip.
    if (retryOffered && /^try again\b/i.test(text)) continue;
    seen.add(key);
    shown.push(text);
    if (shown.length >= FOLLOW_UP_LIMIT) break;
  }
  return shown;
}
