import type { AskExecutionResponse, SuggestedNextAction } from './types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-004/006 (FRD v1.111): the follow-up chips docked above the composer. They come
// only from the latest answer's own declared suggestions.
export const FOLLOW_UP_LIMIT = 4;

export function isRetrySuggestion(value: string): boolean {
  return /^(?:try\s+(?:this\s+)?again|retry\b|ask\s+(?:this\s+)?question\s+again\b)/i.test(value.trim());
}

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
    if (retryOffered && isRetrySuggestion(text)) continue;
    seen.add(key);
    shown.push(text);
    if (shown.length >= FOLLOW_UP_LIMIT) break;
  }
  return shown;
}

/**
 * A curated starter (a last-resort, recommendation-class DISCOVERY action) can be put off or marked not relevant. This only decides whether to SHOW the
 * control; the server is the authority on what is dismissible and refuses anything else, in which case the control is withdrawn.
 */
export function isDismissibleStarterAction(action: SuggestedNextAction): boolean {
  return action.provenance.source === 'CAPABILITY_RECOMMENDATION' && action.priority.tier === 'DISCOVERY';
}

/** One compact follow-up as rendered: a server-authored typed action, or a historical plain-text suggestion. */
export type FollowUpItem =
  | { kind: 'ACTION'; key: string; label: string; action: SuggestedNextAction }
  | { kind: 'TEXT'; key: string; label: string; text: string };

/**
 * Plan §9 Phase 1: prefer the typed offered actions and fall back to the historical string suggestions only when the answer
 * carries no typed actions at all (an execution persisted before the typed contract). The frontend renders the server's order
 * and never invents or re-ranks actions; it only hides one whose presentation lifetime has passed (the server then recovers on
 * selection) and caps the row at the display limit.
 */
export function followUpItems(
  latest: Pick<AskExecutionResponse, 'suggestions' | 'correctionCapabilities' | 'suggestedNextActions' | 'suggestedNextActionsGoverned'> | undefined,
  askedKeys: ReadonlySet<string>,
  keyOf: (suggestion: string) => string,
  now: number = Date.now(),
): FollowUpItem[] {
  if (!latest) return [];
  const typed = latest.suggestedNextActions ?? [];
  if (typed.length === 0) {
    // A governed result with no eligible typed actions is an intentional empty/degraded row. Never revive its
    // handler-authored strings and send an application-authored choice back through semantic routing.
    if (latest.suggestedNextActionsGoverned === true) return [];
    return followUpSuggestions(latest, askedKeys, keyOf).map((text) => ({ kind: 'TEXT' as const, key: `text:${keyOf(text)}`, label: text, text }));
  }
  const seen = new Set<string>();
  const items: FollowUpItem[] = [];
  for (const action of typed) {
    if (seen.has(action.id)) continue;
    const expiresAt = Date.parse(action.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= now) continue;
    seen.add(action.id);
    items.push({ kind: 'ACTION', key: `action:${action.id}`, label: action.label, action });
    if (items.length >= FOLLOW_UP_LIMIT) break;
  }
  return items;
}
