'use client';

import { useContext, useState, type ReactNode } from 'react';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import { CapitalWindowDetail } from '../CapitalWindowDetail';
import { ActionLink } from './context';
import type { AskBlockRenderer } from './types';

type Block = Extract<AskPresentationBlock, { type: 'TABLE' }>;

// TABLE-block row-click-to-detail platform capability (FRD Appendix D /
// capability-card audit). TABLE blocks previously had no detail mechanism
// anywhere in this codebase -- GroupedListBlock.tsx's own comment flagged this
// gap when reserve-allocations shipped without it. capital-timeline-table is
// the first (and so far only) TABLE block to get one, still routed by block
// id the same way GROUPED_LIST's own bespoke exceptions are (see that file)
// rather than a generic entityType-driven dispatch -- one instance doesn't
// yet justify a second routing mechanism. Every other TABLE block keeps
// today's plain, non-clickable rendering.
export const TableBlock: AskBlockRenderer<'TABLE'> = (props) => {
  const { block, propertyId, onAccessLost } = props;
  const renderAction = (action: AskAction) => <ActionLink action={action} />;
  if (block.id === 'capital-timeline-table') {
    return <CapitalTimelineTableBlock block={block} propertyId={propertyId} onAccessLost={onAccessLost} renderAction={renderAction} />;
  }
  return <AdaptiveTableBlock block={block} renderAction={renderAction} />;
};

function CapitalTimelineTableBlock({ block, propertyId, onAccessLost, renderAction }: {
  block: Block;
  propertyId?: string;
  onAccessLost: () => void;
  renderAction: (action: AskAction) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const openDetail = (rowId: string) => {
    if (controls) controls.openDetail(block.id, rowId);
    else setLocalDetailId(rowId);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ask-detail-trigger="${CSS.escape(closingId ?? '')}"][data-ask-detail-block="${CSS.escape(block.id)}"]`)?.focus());
  };

  return <AdaptiveTableBlock block={block} renderAction={renderAction} rowDetail={{
    activeRowId: detailId,
    onRowClick: openDetail,
    renderDetail: (rowId) => {
      const row = block.rows.find((candidate) => candidate.id === rowId);
      if (!row) return null;
      const fallbackTitle = (block.columns[0] ? row.values[block.columns[0].key] : undefined) || 'Capital window';
      return <CapitalWindowDetail key={rowId} windowId={rowId} expectedPropertyId={propertyId} fallbackTitle={fallbackTitle} onAccessLost={onAccessLost} onClose={closeDetail} />;
    },
  }} />;
}
