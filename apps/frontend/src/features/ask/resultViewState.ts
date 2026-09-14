import type { AskExecutionResponse } from './types';

export type ResultView = {
  selectedTaskId: string | null;
  expandedRows: string[];
  visibleCounts: Record<string, number>;
  scrollOffset: number | null;
};
export const EMPTY_RESULT_VIEW: ResultView = { selectedTaskId: null, expandedRows: [], visibleCounts: {}, scrollOffset: null };
const PREFIX = 'ctc:ask-result-view:v1:';
export const resultViewKey = (sessionId: string, propertyId: string, resultId: string) => `${PREFIX}${sessionId}:${propertyId}:${resultId}`;

// No response content is stored here. Only bounded UI preferences, after an authorized session load.
export function readResultView(storage: Storage, key: string): ResultView {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return EMPTY_RESULT_VIEW;
    return {
      selectedTaskId: typeof value.selectedTaskId === 'string' ? value.selectedTaskId : null,
      expandedRows: Array.isArray(value.expandedRows) ? value.expandedRows.filter((id: unknown) => typeof id === 'string').slice(0, 100) : [],
      visibleCounts: Object.fromEntries(Object.entries(value.visibleCounts ?? {}).filter(([, count]) => Number.isInteger(count) && Number(count) >= 5 && Number(count) <= 100).map(([key, count]) => [key, Number(count)])),
      scrollOffset: Number.isFinite(value.scrollOffset) ? value.scrollOffset : null,
    };
  } catch { return EMPTY_RESULT_VIEW; }
}
export function writeResultView(storage: Storage, key: string, view: ResultView) {
  try { storage.setItem(key, JSON.stringify(view)); } catch { /* Storage unavailable: keep the in-memory view. */ }
}
export function clearResultViews(storage: Storage, sessionId: string, keepKeys?: Set<string>) {
  if (!keepKeys) storage.removeItem(`ctc:ask-return-execution:${sessionId}`);
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(`${PREFIX}${sessionId}:`) && !keepKeys?.has(key)) storage.removeItem(key);
  }
}
export function reconcileResultView(view: ResultView, execution: AskExecutionResponse): ResultView {
  const sections = execution.blocks.flatMap((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups' ? block.sections : []);
  const ids = new Set(sections.flatMap((section) => section.items.map((item) => item.id)));
  return {
    ...view,
    selectedTaskId: view.selectedTaskId && ids.has(view.selectedTaskId) ? view.selectedTaskId : null,
    expandedRows: view.expandedRows.filter((id) => ids.has(id)),
    visibleCounts: Object.fromEntries(sections.map((section) => [section.id, Math.max(5, Math.min(view.visibleCounts[section.id] ?? 5, section.items.length))])),
  };
}
export function mergeResultExecutions(current: AskExecutionResponse[], incoming: AskExecutionResponse[]): AskExecutionResponse[] {
  return incoming.reduce((all, next) => {
    const same = all.find((item) => item.executionId === next.executionId);
    const latest = next.viewState ? all.filter((item) => item.viewState?.resultId === next.viewState!.resultId)
      .reduce<AskExecutionResponse | undefined>((best, item) => !best || (item.viewState!.revision > best.viewState!.revision) ? item : best, undefined) : undefined;
    if (latest?.viewState && next.viewState && latest.viewState.revision > next.viewState.revision) return all;
    if (same && Date.parse(same.updatedAt) > Date.parse(next.updatedAt)) return all;
    return same ? all.map((item) => item.executionId === next.executionId ? next : item) : [...all, next];
  }, current);
}

export function createResultRequestTracker() {
  const versions = new Map<string, number>();
  let sequence = 0;
  return {
    begin(key: string) { const version = ++sequence; versions.set(key, version); return version; },
    current(key: string, version: number) { return versions.get(key) === version; },
    clear() { versions.clear(); },
  };
}
export const resultRequestKey = (execution: AskExecutionResponse) => `${execution.sessionId}:${execution.viewState?.resultId ?? execution.executionId}`;
