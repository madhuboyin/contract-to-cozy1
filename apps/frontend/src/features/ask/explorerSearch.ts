import type { AskCapabilityGroup, AskCapabilityPrompt } from './types';

// Capability explorer search (capability discovery plan, Phase 4). Client-side over the corpus the server already authorized, so it can only
// ever rank prompts the homeowner may see. It reads homeowner wording only: the prompt label and question, the group label and
// description, and the server's approved aliases. It never reads an operation id, and it never infers a capability from arbitrary text.
// Ranking is deterministic: exact, then prefix, then token matches, ties broken by the server's group and prompt order.

export interface ExplorerSearchResult {
  prompt: AskCapabilityPrompt;
  group: Pick<AskCapabilityGroup, 'id' | 'label'>;
}

export const EXPLORER_SEARCH_MIN_LENGTH = 2;

export const normalizeSearchText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const tokensOf = (value: string): string[] => normalizeSearchText(value).split(' ').filter(Boolean);

// Lower numbers rank first.
const EXACT = 0;
const PREFIX = 1;
const PRIMARY_TOKENS = 2;
const GROUP_TOKENS = 3;

function tierFor(query: string, queryTokens: string[], prompt: AskCapabilityPrompt, group: AskCapabilityGroup): number | null {
  const phrases = [prompt.label, prompt.question, ...(prompt.aliases ?? [])].filter((phrase): phrase is string => Boolean(phrase)).map(normalizeSearchText);
  if (phrases.some((phrase) => phrase === query)) return EXACT;
  if (phrases.some((phrase) => phrase.startsWith(query))) return PREFIX;
  const primaryTokens = phrases.flatMap((phrase) => phrase.split(' '));
  const matchesAll = (pool: string[]) => queryTokens.every((token) => pool.some((candidate) => candidate === token || candidate.startsWith(token)));
  if (matchesAll(primaryTokens)) return PRIMARY_TOKENS;
  const groupTokens = [...tokensOf(group.label), ...tokensOf(group.description)];
  if (matchesAll([...primaryTokens, ...groupTokens])) return GROUP_TOKENS;
  return null;
}

export function searchExplorerGroups(groups: AskCapabilityGroup[], rawQuery: string): ExplorerSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < EXPLORER_SEARCH_MIN_LENGTH) return [];
  const queryTokens = query.split(' ');
  const ranked: Array<{ result: ExplorerSearchResult; tier: number; order: number }> = [];
  let order = 0;
  for (const group of groups) {
    for (const prompt of group.prompts) {
      const tier = tierFor(query, queryTokens, prompt, group);
      if (tier !== null) ranked.push({ result: { prompt, group: { id: group.id, label: group.label } }, tier, order });
      order += 1;
    }
  }
  return ranked.sort((a, b) => a.tier - b.tier || a.order - b.order).map(({ result }) => result);
}
