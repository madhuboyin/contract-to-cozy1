'use client';
import { createContext, useEffect, useRef, useState } from 'react';
import type { AskExecutionResponse } from './types';
import { EMPTY_RESULT_VIEW, readResultView, reconcileResultView, resultViewKey, writeResultView, type ResultView } from './resultViewState';

export type ResultViewControls = {
  maintenanceHref?: string;
  view: ResultView;
  change: (update: (view: ResultView) => ResultView) => void;
  detailIdFor: (blockId: string) => string | null;
  openDetail: (blockId: string, entityId: string) => void;
  closeDetail: () => void;
};
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
  }, [key, execution, enabled]);
  const change = (update: (view: ResultView) => ResultView) => {
    const next = update(current.current);
    current.current = next;
    setView(next);
    if (enabled) writeResultView(window.sessionStorage, key, next);
  };
  useEffect(() => {
    if (!enabled) return;
    const restore = (event: PopStateEvent) => {
      const target = event.state?.askDetail;
      const closing = current.current.detailTarget;
      change((previous) => reconcileResultView({
        ...previous,
        detailTarget: target?.key === key ? { blockId: target.blockId, entityId: target.entityId } : null,
        detailTaskId: target?.key === key ? target.entityId : null,
      }, execution));
      if (closing && target?.key !== key) {
        const addressedSession = new URL(window.location.href).searchParams.get('sessionId');
        if (!addressedSession || addressedSession === execution.sessionId) {
          window.requestAnimationFrame(() => {
            const trigger = Array.from(document.querySelectorAll<HTMLElement>('[data-ask-detail-trigger]'))
              .find((element) => element.dataset.askDetailBlock === closing.blockId
                && element.dataset.askDetailTrigger === closing.entityId);
            trigger?.focus({ preventScroll: true });
          });
        }
      }
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  // The listener is keyed to this authoritative result, not to every view edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, execution, enabled]);
  const detailIdFor = (blockId: string) => view.detailTarget?.blockId === blockId ? view.detailTarget.entityId : null;
  const openDetail = (blockId: string, entityId: string) => {
    const target = { key, blockId, entityId };
    if (window.history.state?.askDetail?.key !== key
      || window.history.state.askDetail.blockId !== blockId
      || window.history.state.askDetail.entityId !== entityId) {
      window.history.pushState({ ...window.history.state, askDetail: target }, '', window.location.href);
    }
    change((previous) => ({ ...previous, selectedTaskId: entityId, detailTaskId: entityId, detailTarget: { blockId, entityId } }));
  };
  const closeDetail = () => {
    change((previous) => ({ ...previous, detailTarget: null, detailTaskId: null }));
    if (window.history.state?.askDetail?.key === key) window.history.back();
  };
  const maintenanceHref = execution.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups');
  return { view, change, detailIdFor, openDetail, closeDetail, maintenanceHref: maintenanceHref?.type === 'GROUPED_LIST' ? maintenanceHref.actions[0]?.href : undefined };
}
