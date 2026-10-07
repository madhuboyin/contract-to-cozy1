import { normalizeAskMessage } from './askSemanticRouter';

export function suggestionKey(value: string): string {
  return normalizeAskMessage(value).normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

