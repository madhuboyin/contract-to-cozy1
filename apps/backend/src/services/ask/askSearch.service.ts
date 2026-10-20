import { ProviderTimeoutError, withProviderTimeout } from './support/providerTimeout';
import type { HouseholdRole } from '@prisma/client';
import { logger } from '../../lib/logger';
import type { AskAccountRole } from './askAccountEligibility';
import { loadOperatingMode } from './askRecordContext';
import { authorizeAskWork } from './askWork.service';
import { ASK_SEARCH_PROVIDERS } from './search/askSearchProviders';
import {
  ASK_SEARCH_CONTRACT_VERSION, ASK_SEARCH_GROUPS, ASK_SEARCH_MAX_QUERY, ASK_SEARCH_MIN_QUERY, ASK_SEARCH_PER_GROUP, ASK_SEARCH_PER_PROVIDER, ASK_SEARCH_PROVIDER_TIMEOUT_MS,
  type AskSearchContext, type AskSearchGroup, type AskSearchProvider, type AskSearchProviderState, type AskSearchProviderStatus, type AskSearchResponse, type AskSearchResult,
} from './askSearch.contract';

export class AskSearchInvalidRequestError extends Error {
  code = 'ASK_INVALID_REQUEST';
}

const GROUP_LABELS: Record<AskSearchGroup, string> = { RECORD: 'Home record', WORK: 'Work', SAVED: 'Saved', HISTORY: 'Conversations', CAPABILITY: 'Things Ask can do' };
const NOT_APPLICABLE_REASONS = {
  RESTRICTED: 'Your household role cannot search this.',
  NOT_APPLICABLE: 'This does not apply to this home right now.',
  CONTEXT_REQUIRED: 'More about this home is needed before this can be searched.',
} as const;

export function normalizeSearchQuery(query: string | null | undefined): string {
  const trimmed = (query ?? '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < ASK_SEARCH_MIN_QUERY) throw new AskSearchInvalidRequestError('query is too short.');
  if (trimmed.length > ASK_SEARCH_MAX_QUERY) throw new AskSearchInvalidRequestError('query is too long.');
  return trimmed;
}

/** Title matches first, then the most recently changed. */
function rank(results: AskSearchResult[], query: string): AskSearchResult[] {
  const needle = query.toLowerCase();
  const score = (result: AskSearchResult) => (result.title.toLowerCase() === needle ? 0 : result.title.toLowerCase().startsWith(needle) ? 1 : result.title.toLowerCase().includes(needle) ? 2 : 3);
  return [...results].sort((a, b) => score(a) - score(b) || (b.asOf ?? '').localeCompare(a.asOf ?? '') || a.resultKey.localeCompare(b.resultKey));
}

/**
 * Federated search (FR-SEARCH-001..004). Every provider applies its owner's own authorization at query time, runs in parallel under a
 * time limit, and is reported on its own: one that fails or times out leaves the others intact and is named in the response. Nothing is
 * indexed or stored, and the query text is never logged: telemetry carries counts, timings and its length only.
 */
export async function composeAskSearch(
  context: AskSearchContext,
  rawQuery: string,
  providers: readonly AskSearchProvider[] = ASK_SEARCH_PROVIDERS,
  options: { timeoutMs?: number; groupFilter?: AskSearchGroup | null } = {},
): Promise<AskSearchResponse> {
  const query = normalizeSearchQuery(rawQuery);
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? ASK_SEARCH_PROVIDER_TIMEOUT_MS;
  const selected = providers.filter((provider) => !options.groupFilter || provider.group === options.groupFilter);
  const outcomes = await Promise.all(selected.map(async (provider) => {
    const status = (state: AskSearchProviderState, reason: string | null, returned = 0, more = false): AskSearchProviderStatus => ({ providerId: provider.id, group: provider.group, label: provider.label, state, reason, returned, more });
    if (provider.unavailableReason) return { provider, results: [] as AskSearchResult[], status: status('UNAVAILABLE', provider.unavailableReason) };
    const applicability = provider.applicability ? provider.applicability(context) : 'APPLICABLE';
    if (applicability !== 'APPLICABLE') return { provider, results: [], status: status(applicability, NOT_APPLICABLE_REASONS[applicability]) };
    if (!provider.search) return { provider, results: [], status: status('UNAVAILABLE', 'No search is registered for this source.') };
    try {
      const output = await withProviderTimeout(provider.search(context, query, ASK_SEARCH_PER_PROVIDER), timeoutMs);
      // Every group is held to the selected home, conversations included: "all homes" history search is deferred, so no result may come from another one.
      const results = output.results.filter((result) => result.propertyId === context.propertyId);
      return { provider, results, status: status('AVAILABLE', null, results.length, output.more) };
    } catch (error) {
      const timedOut = error instanceof ProviderTimeoutError;
      logger.warn({ providerId: provider.id, timedOut, errorName: error instanceof Error ? error.name : 'unknown' }, 'Ask search provider did not answer');
      return { provider, results: [], status: status(timedOut ? 'TIMED_OUT' : 'FAILED', timedOut ? 'This took too long to search.' : 'This could not be searched right now.') };
    }
  }));

  const groups = ASK_SEARCH_GROUPS.flatMap((group) => {
    const inGroup = outcomes.filter((outcome) => outcome.provider.group === group);
    if (inGroup.length === 0) return [];
    const ranked = rank(inGroup.flatMap((outcome) => outcome.results), query);
    return [{ group, label: GROUP_LABELS[group], results: ranked.slice(0, ASK_SEARCH_PER_GROUP), more: ranked.length > ASK_SEARCH_PER_GROUP || inGroup.some((outcome) => outcome.status.more) }];
  });
  const providerStatuses = outcomes.map((outcome) => outcome.status);
  const totalResults = groups.reduce((sum, group) => sum + group.results.length, 0);
  const partial = providerStatuses.some((entry) => entry.state !== 'AVAILABLE' && entry.state !== 'NOT_APPLICABLE');
  // Counts and timings only: no query text, no result titles, no ids.
  logger.info({
    event: 'ask_search', queryLength: query.length, durationMs: Date.now() - started, totalResults,
    providers: { available: providerStatuses.filter((s) => s.state === 'AVAILABLE').length, failed: providerStatuses.filter((s) => s.state === 'FAILED').length, timedOut: providerStatuses.filter((s) => s.state === 'TIMED_OUT').length, unavailable: providerStatuses.filter((s) => s.state === 'UNAVAILABLE').length },
  }, 'Ask search served');
  return { contractVersion: ASK_SEARCH_CONTRACT_VERSION, propertyId: context.propertyId, generatedAt: context.now.toISOString(), partial, totalResults, groups, providers: providerStatuses };
}

export async function searchAsk(userId: string, propertyId: string, query: string, accountRole?: AskAccountRole, groupFilter: AskSearchGroup | null = null): Promise<AskSearchResponse> {
  normalizeSearchQuery(query);
  if (groupFilter && !ASK_SEARCH_GROUPS.includes(groupFilter)) throw new AskSearchInvalidRequestError('group is not valid.');
  const { role } = await authorizeAskWork(userId, propertyId, accountRole);
  const operatingMode = await loadOperatingMode(userId, propertyId);
  return composeAskSearch({ userId, propertyId, role: role as HouseholdRole, operatingMode, now: new Date() }, query, ASK_SEARCH_PROVIDERS, { groupFilter });
}

/** Startup validation: unique ids, a label on every provider, and each either searchable or reported unavailable with a reason. */
export function validateAskSearchProviders(providers: readonly AskSearchProvider[] = ASK_SEARCH_PROVIDERS): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const provider of providers) {
    if (ids.has(provider.id)) issues.push(`Duplicate search provider id: ${provider.id}`);
    ids.add(provider.id);
    if (!provider.label.trim()) issues.push(`${provider.id} has no label`);
    if (!provider.unavailableReason && !provider.search) issues.push(`${provider.id} is neither searchable nor reported unavailable`);
    if (provider.unavailableReason !== undefined && !provider.unavailableReason.trim()) issues.push(`${provider.id} is unavailable but gives no reason`);
  }
  return issues;
}
