import type { AskExecutionResponse } from './types';

export type ResultView = {
  selectedTaskId: string | null;
  detailTaskId: string | null;
  expandedRows: string[];
  visibleCounts: Record<string, number>;
  presentationModes: Record<string, 'AUTO' | 'TABLE' | 'CARDS'>;
  comparisonLayouts: Record<string, 'STRIP' | 'GRID'>;
  scrollOffset: number | null;
};
export const EMPTY_RESULT_VIEW: ResultView = { selectedTaskId: null, detailTaskId: null, expandedRows: [], visibleCounts: {}, presentationModes: {}, comparisonLayouts: {}, scrollOffset: null };
const PREFIX = 'ctc:ask-result-view:v1:';
export const resultViewKey = (sessionId: string, propertyId: string, resultId: string) => `${PREFIX}${sessionId}:${propertyId}:${resultId}`;

// No response content is stored here. Only bounded UI preferences, after an authorized session load.
export function readResultView(storage: Storage, key: string): ResultView {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return EMPTY_RESULT_VIEW;
    return {
      selectedTaskId: typeof value.selectedTaskId === 'string' ? value.selectedTaskId : null,
      detailTaskId: typeof value.detailTaskId === 'string' ? value.detailTaskId : null,
      expandedRows: Array.isArray(value.expandedRows) ? value.expandedRows.filter((id: unknown) => typeof id === 'string').slice(0, 100) : [],
      visibleCounts: Object.fromEntries(Object.entries(value.visibleCounts ?? {}).filter(([, count]) => Number.isInteger(count) && Number(count) >= 5 && Number(count) <= 100).map(([key, count]) => [key, Number(count)])),
      presentationModes: Object.fromEntries(Object.entries(value.presentationModes ?? {})
        .filter(([key, mode]) => key.length <= 120 && ['AUTO', 'TABLE', 'CARDS'].includes(String(mode)))
        .slice(0, 50)) as ResultView['presentationModes'],
      comparisonLayouts: Object.fromEntries(Object.entries(value.comparisonLayouts ?? {})
        .filter(([key, mode]) => key.length <= 120 && ['STRIP', 'GRID'].includes(String(mode)))
        .slice(0, 50)) as ResultView['comparisonLayouts'],
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
// B07 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
// this used to only recognize the 'maintenance-groups' block id, so any
// other GROUPED_LIST-shaped result (Buyer, or any future operation) always
// got an empty ids set here -- selectedTaskId was silently nulled out on
// every hydration, regardless of whether the item was still there.
// Generalized across every GROUPED_LIST block in the result, not just one
// named block id. Never substitutes a different item for a missing one --
// the exact id must still be present, or selection clears to null.
export function reconcileResultView(view: ResultView, execution: AskExecutionResponse): ResultView {
  const sections = execution.blocks.flatMap((block) => block.type === 'GROUPED_LIST' ? block.sections : []);
  const ids = new Set(sections.flatMap((section) => section.items.map((item) => item.id)));
  const tableIds = new Set(execution.blocks.filter((block) => block.type === 'TABLE').map((block) => block.id));
  const comparisonIds = new Set(execution.blocks.filter((block) => block.type === 'COMPARISON').map((block) => block.id));
  return {
    ...view,
    selectedTaskId: view.selectedTaskId && ids.has(view.selectedTaskId) ? view.selectedTaskId : null,
    detailTaskId: view.detailTaskId && ids.has(view.detailTaskId) ? view.detailTaskId : null,
    expandedRows: view.expandedRows.filter((id) => ids.has(id)),
    visibleCounts: Object.fromEntries(sections.map((section) => [section.id, Math.max(5, Math.min(view.visibleCounts[section.id] ?? 5, section.items.length))])),
    presentationModes: Object.fromEntries(Object.entries(view.presentationModes ?? {}).filter(([blockId]) => tableIds.has(blockId))),
    comparisonLayouts: Object.fromEntries(Object.entries(view.comparisonLayouts ?? {}).filter(([blockId]) => comparisonIds.has(blockId))),
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
