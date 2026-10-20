import { ASK_SEARCH_PROVIDER_TIMEOUT_MS } from '../askSearch.contract';
import { ASK_PROVIDER_TIMEOUT_MS } from '../support/providerTimeout';

// Sole Homeowner Interface Phase 9 (FR-PERF-001): numeric latency and payload budgets for every destination read.
// SERVER time for one read of a realistic home (see tests/certification/askPerformance.test.js for the data size), excluding the network.
// The certification test measures against these numbers and fails when they are exceeded, so a slow read shows up as a regression.
// Production runs on a Raspberry Pi; ASK_CERT_BUDGET_FACTOR scales them when measuring slower hardware.
export type AskBudgetId = 'RECORD_INDEX' | 'RECORD_SECTION_PAGE' | 'WORK_PAGE' | 'SAVED_PAGE' | 'SEARCH' | 'NOTIFICATIONS_PAGE' | 'INTAKE_STATE';

export interface AskPerformanceBudget {
  id: AskBudgetId;
  label: string;
  p50Ms: number;
  p95Ms: number;
  /** The most one response may weigh as JSON. */
  maxPayloadBytes: number;
  /** The longest any single provider behind it may hold the read before it is reported as unavailable. */
  providerTimeoutMs: number | null;
}

export const ASK_PERFORMANCE_BUDGETS: readonly AskPerformanceBudget[] = Object.freeze([
  { id: 'RECORD_INDEX', label: 'Record index (all sections with counts)', p50Ms: 400, p95Ms: 1200, maxPayloadBytes: 60_000, providerTimeoutMs: ASK_PROVIDER_TIMEOUT_MS },
  { id: 'RECORD_SECTION_PAGE', label: 'Record section page (50 rows)', p50Ms: 200, p95Ms: 700, maxPayloadBytes: 150_000, providerTimeoutMs: null },
  { id: 'WORK_PAGE', label: 'Work page (25 rows, every provider)', p50Ms: 400, p95Ms: 1200, maxPayloadBytes: 120_000, providerTimeoutMs: ASK_PROVIDER_TIMEOUT_MS },
  { id: 'SAVED_PAGE', label: 'Saved page (25 rows, every type)', p50Ms: 400, p95Ms: 1200, maxPayloadBytes: 120_000, providerTimeoutMs: ASK_PROVIDER_TIMEOUT_MS },
  { id: 'SEARCH', label: 'Search your home (every provider)', p50Ms: 600, p95Ms: 2000, maxPayloadBytes: 80_000, providerTimeoutMs: ASK_SEARCH_PROVIDER_TIMEOUT_MS },
  { id: 'NOTIFICATIONS_PAGE', label: 'Notifications inbox (25 items)', p50Ms: 150, p95Ms: 500, maxPayloadBytes: 80_000, providerTimeoutMs: null },
  { id: 'INTAKE_STATE', label: 'Add a file: state of one file', p50Ms: 100, p95Ms: 400, maxPayloadBytes: 30_000, providerTimeoutMs: null },
]);

/** The browser budgets (milliseconds from navigation). The chrome must not wait for slow domain data. */
export const ASK_CLIENT_BUDGETS = Object.freeze({
  destinationChromeVisibleMs: 1500,
  /** How long domain data may take before the page shows a loading state instead of a blank. */
  slowDataLoadingStateMs: 500,
});

export function percentile(sortedAscending: readonly number[], fraction: number): number {
  if (sortedAscending.length === 0) return 0;
  const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(fraction * sortedAscending.length) - 1));
  return sortedAscending[index];
}
