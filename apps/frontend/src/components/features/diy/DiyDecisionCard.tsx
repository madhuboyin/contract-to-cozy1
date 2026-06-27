'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { DiyDecisionResult } from '@/types';
import { VERDICT_LABELS, VERDICT_COLOR } from './DiyUtils';

interface Props {
  result: DiyDecisionResult;
}

export default function DiyDecisionCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false);

  const savings = result.savingsEstimateCents > 0
    ? `$${Math.round(result.savingsEstimateCents / 100).toLocaleString()}`
    : null;

  return (
    <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-[hsl(var(--mobile-text-muted))] mb-1">DIY Assessment</p>
          <span className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${VERDICT_COLOR[result.verdict]}`}>
            {VERDICT_LABELS[result.verdict]}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{result.score}</p>
          <p className="text-xs text-[hsl(var(--mobile-text-muted))]">/ 100</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="mx-4 h-1.5 rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))]"
          style={{ width: `${result.score}%` }}
        />
      </div>

      {/* Blockers */}
      {result.blockers.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
          {result.blockers.map((b, i) => (
            <p key={i} className="text-xs text-red-800">{b}</p>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <p className="mx-4 mt-3 text-sm text-[hsl(var(--mobile-text-secondary))]">{result.reasoning}</p>

      {/* Savings */}
      {savings && (
        <p className="mx-4 mt-1 text-sm font-medium text-green-700">
          You could save ~{savings} vs hiring
        </p>
      )}

      {/* Factors toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mx-4 mt-3 mb-1 flex items-center gap-1 text-xs text-[hsl(var(--mobile-brand-strong))]"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? 'Hide' : 'Show'} factors
      </button>

      {expanded && (
        <div className="border-t mx-4 mb-4 pt-3 space-y-2">
          {result.factors.map((f) => (
            <div key={f.code} className="flex items-start gap-2">
              {f.effect === 'positive' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />}
              {f.effect === 'negative' && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
              {f.effect === 'neutral' && <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />}
              <div className="min-w-0">
                <p className="text-xs font-medium">{f.label} <span className="text-[hsl(var(--mobile-text-muted))]">(+{f.contributionPoints})</span></p>
                <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
