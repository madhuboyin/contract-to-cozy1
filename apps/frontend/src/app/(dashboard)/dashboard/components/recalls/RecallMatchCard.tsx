// apps/frontend/src/app/(dashboard)/dashboard/components/recalls/RecallMatchCard.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { RecallMatchDTO } from '@/types/recalls.types';
import RecallStatusBadge from './RecallStatusBadge';
import ResolveRecallModal from './ResolveRecallModal';

type Props = {
  match: RecallMatchDTO;
  highlighted?: boolean;
  onConfirm: (matchId: string) => Promise<void>;
  onDismiss: (matchId: string) => Promise<void>;
  onResolve: (matchId: string, payload: { resolutionType: any; resolutionNotes?: string }) => Promise<void>;
};

export default function RecallMatchCard({ match, highlighted, onConfirm, onDismiss, onResolve }: Props) {
  const [resolveOpen, setResolveOpen] = useState(false);

  const title = match.recall?.title || 'Recall alert';
  const assetLabel = useMemo(() => {
    const mfg = match.inventoryItem?.manufacturer || '';
    const model = match.inventoryItem?.modelNumber || '';
    const s = `${mfg} ${model}`.trim();
    return s || (match.inventoryItemId ? 'Asset' : 'Unknown asset');
  }, [match]);

  return (
    <div
      className={[
        'rounded-2xl border bg-white p-4 shadow-sm',
        highlighted ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-200',
      ].join(' ')}
      id={`recall-${match.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
            <RecallStatusBadge status={match.status} />
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Confidence: <span className="font-medium">{match.confidencePct}%</span>
            {assetLabel ? (
              <>
                {' '}
                • Asset: <span className="font-medium">{assetLabel}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {match.recall?.recallUrl ? (
            <a
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
              href={match.recall.recallUrl}
              target="_blank"
              rel="noreferrer"
            >
              Details
            </a>
          ) : null}
        </div>
      </div>

      {match.recall?.hazard || match.recall?.remedy || match.rationale ? (
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          {match.rationale ? <p className="text-xs text-slate-600">{match.rationale}</p> : null}
          {match.recall?.hazard ? (
            <p>
              <span className="font-medium">Hazard:</span> {match.recall.hazard}
            </p>
          ) : null}
          {match.recall?.remedy ? (
            <p>
              <span className="font-medium">Recommended:</span> {match.recall.remedy}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {match.status === 'NEEDS_CONFIRMATION' ? (
          <>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white"
              onClick={() => onConfirm(match.id)}
            >
              Confirm match
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
              onClick={() => onDismiss(match.id)}
            >
              Not my model
            </button>
          </>
        ) : null}

        {match.status === 'OPEN' ? (
          <>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white"
              onClick={() => setResolveOpen(true)}
            >
              Mark resolved
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
              onClick={() => onDismiss(match.id)}
            >
              Dismiss
            </button>
          </>
        ) : null}

        {match.status === 'RESOLVED' ? (
          <div className="text-xs text-emerald-700">
            Resolved{match.resolutionType ? ` • ${match.resolutionType.replace('_', ' ')}` : ''}
          </div>
        ) : null}

        {match.status === 'DISMISSED' ? <div className="text-xs text-slate-600">Dismissed</div> : null}
      </div>

      <ResolveRecallModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onSubmit={async (payload) => onResolve(match.id, payload)}
      />
    </div>
  );
}
