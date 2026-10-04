// Plan §9 Phase 1: the string-compatibility boundary. A legacy `suggestions` string becomes a typed candidate ONLY through an
// explicit, reviewed mapping entry here; an operation id is never inferred from arbitrary text. The table starts empty and
// each Phase 3 domain adds its own entries while it migrates, then deletes them when the domain is done (Phase 5 removes the
// module). Strings with no entry keep rendering through the historical string path.
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';

export interface ExplicitSuggestionMapping {
  /** Exact legacy suggestion text (compared after trim; case- and punctuation-sensitive on purpose). */
  text: string;
  operationId: string;
  outcomeKey: string;
  interactionType: SuggestedNextAction['interactionType'];
}

export const EXPLICIT_SUGGESTION_MAPPINGS: readonly ExplicitSuggestionMapping[] = [];

export function mapExplicitSuggestionStrings(
  suggestions: readonly string[],
  mappings: readonly ExplicitSuggestionMapping[] = EXPLICIT_SUGGESTION_MAPPINGS,
): { mapped: ExplicitSuggestionMapping[]; unmapped: string[] } {
  const byText = new Map(mappings.map((mapping) => [mapping.text.trim(), mapping]));
  const mapped: ExplicitSuggestionMapping[] = [];
  const unmapped: string[] = [];
  for (const suggestion of suggestions) {
    const entry = byText.get(suggestion.trim());
    if (entry) mapped.push(entry);
    else unmapped.push(suggestion);
  }
  return { mapped, unmapped };
}
