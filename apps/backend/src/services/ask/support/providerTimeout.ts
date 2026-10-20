// Sole Homeowner Interface Phase 9 (FR-PERF-001): every provider behind a destination has a bounded time. A provider that does not answer in time is
// reported as unavailable for that read and the page is partial; it never holds the whole page, and it never turns into a zero.
export class ProviderTimeoutError extends Error {}

/** The time a Record, Work or Saved provider gets. Search has its own, shorter limit (ASK_SEARCH_PROVIDER_TIMEOUT_MS). */
export const ASK_PROVIDER_TIMEOUT_MS = 4000;

export function withProviderTimeout<T>(work: Promise<T>, ms: number = ASK_PROVIDER_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderTimeoutError('timed out')), ms);
    work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
