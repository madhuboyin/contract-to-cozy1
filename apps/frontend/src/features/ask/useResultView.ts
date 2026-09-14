'use client';
import { createContext, useEffect, useRef, useState } from 'react';
import type { AskExecutionResponse } from './types';
import { EMPTY_RESULT_VIEW, readResultView, reconcileResultView, resultViewKey, writeResultView, type ResultView } from './resultViewState';

export type ResultViewControls = { maintenanceHref?: string; view: ResultView; change: (update: (view: ResultView) => ResultView) => void };
export const ResultViewContext = createContext<ResultViewControls | null>(null);

export function useResultView(execution: AskExecutionResponse, enabled = true): ResultViewControls {
  const key = resultViewKey(execution.sessionId, execution.property?.id ?? 'general', execution.viewState?.resultId ?? execution.executionId);
  const [view, setView] = useState<ResultView>(EMPTY_RESULT_VIEW);
  const current = useRef(view);
  const hydratedKey = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const previous = hydratedKey.current === key ? current.current : readResultView(window.sessionStorage, key);
    const restored = reconcileResultView(previous, execution);
    hydratedKey.current = key;
    current.current = restored;
    setView(restored);
    writeResultView(window.sessionStorage, key, restored);
  }, [key, execution.updatedAt, execution.blocks, enabled]);
  const change = (update: (view: ResultView) => ResultView) => {
    const next = update(current.current);
    current.current = next;
    setView(next);
    if (enabled) writeResultView(window.sessionStorage, key, next);
  };
  const maintenanceHref = execution.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups');
  return { view, change, maintenanceHref: maintenanceHref?.type === 'GROUPED_LIST' ? maintenanceHref.actions[0]?.href : undefined };
}
