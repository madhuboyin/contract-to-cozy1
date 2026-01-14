// components/orchestration/ConfidencePopover.tsx
'use client';

import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DecisionTraceStepDTO } from '@/types';

type Props = {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number; // 0 → 100
  explanation?: string[];
  steps?: DecisionTraceStepDTO[];
};

function normalize(s: string) {
  return (s || '').toLowerCase();
}

function bucketExplanation(lines: string[]) {
  const up: string[] = [];
  const down: string[] = [];

  for (const raw of lines) {
    const t = normalize(raw);

    // Heuristics: treat these as "limiters"
    const isLimiter =
      t.includes('missing') ||
      t.includes('unknown') ||
      t.includes('insufficient') ||
      t.includes('not enough') ||
      t.includes('uncertain') ||
      t.includes('could not') ||
      t.includes('no data') ||
      t.includes('low confidence');

    if (isLimiter) down.push(raw);
    else up.push(raw);
  }

  return { up, down };
}

function suggestImprovements(lines: string[], level: Props['level']) {
  // Only suggest improvements for MEDIUM/LOW
  if (level === 'HIGH') return [];

  const t = normalize(lines.join(' | '));
  const suggestions: string[] = [];

  if (t.includes('coverage') || t.includes('warranty') || t.includes('insurance') || t.includes('no coverage')) {
    suggestions.push('Add your warranty/insurance details to improve coverage matching.');
  }
  if (t.includes('age') || t.includes('install') || t.includes('unknown')) {
    suggestions.push('Confirm the system install year (or approximate age).');
  }
  if (t.includes('system') && (t.includes('identified') || t.includes('uncertain') || t.includes('match'))) {
    suggestions.push('Confirm which system/component this recommendation applies to.');
  }

  // Fallback when we have no keywords
  if (suggestions.length === 0) {
    suggestions.push('Add missing details (coverage, age, or system info) to improve confidence.');
  }

  // Cap to keep popover compact
  return suggestions.slice(0, 2);
}

export const ConfidencePopover: React.FC<Props> = ({ level, score, explanation = [] }) => {
  const percent = Math.round(score);

  const { up, down } = useMemo(() => bucketExplanation(explanation), [explanation]);
  const improvements = useMemo(() => suggestImprovements(explanation, level), [explanation, level]);

  const levelHint =
    level === 'HIGH'
      ? 'Good enough to act on.'
      : level === 'MEDIUM'
        ? 'Reasonable, but could be improved.'
        : 'Consider verifying details before acting.';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-900"
        >
          <Info className="h-3.5 w-3.5" />
          How confident is this recommendation?
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 text-sm space-y-3">
        <div>
          <div className="font-semibold text-gray-900">Confidence: {level}</div>
          <div className="text-xs text-muted-foreground">
            Score: {percent}% • {levelHint}
          </div>
        </div>

        {explanation.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Confidence is derived from risk severity, asset age, exposure, coverage, and whether this is already scheduled.
          </div>
        ) : (
          <div className="space-y-3">
            {up.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-900">What increased confidence</div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                  {up.slice(0, 3).map((e, idx) => (
                    <li key={`up-${idx}`}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {down.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-900">What reduced confidence</div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                  {down.slice(0, 3).map((e, idx) => (
                    <li key={`down-${idx}`}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {improvements.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-900">Improve confidence</div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                  {improvements.map((s, idx) => (
                    <li key={`imp-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Optional future hook (Phase 2.2) */}
        {/* <div className="text-[11px] text-muted-foreground">
          Tip: You can see step-by-step decision logic in “See how this was decided.”
        </div> */}
      </PopoverContent>
    </Popover>
  );
};
