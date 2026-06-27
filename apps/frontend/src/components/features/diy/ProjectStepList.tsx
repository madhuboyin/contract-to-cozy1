'use client';
import { useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, AlertTriangle, Lightbulb } from 'lucide-react';
import type { DiyProjectStep, DiyStepStatus } from '@/types';
import { formatMinutes } from './DiyUtils';
import SafetyWarningBanner from './SafetyWarningBanner';

interface Props {
  steps: DiyProjectStep[];
  onUpdateStep: (stepId: string, status: DiyStepStatus, notes?: string) => Promise<void>;
  disabled?: boolean;
}

export default function ProjectStepList({ steps, onUpdateStep, disabled }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(steps[0]?.id ?? null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [noteValues, setNoteValues] = useState<Record<string, string>>({});

  async function handleStatus(step: DiyProjectStep, next: DiyStepStatus) {
    setPendingId(step.id);
    try {
      await onUpdateStep(step.id, next, noteValues[step.id]);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const isOpen = expandedId === step.id;
        const isDone = step.status === 'COMPLETED';
        const isSkipped = step.status === 'SKIPPED';
        const isPending = pendingId === step.id;

        return (
          <div
            key={step.id}
            className={`rounded-2xl border bg-[hsl(var(--mobile-card-bg))] overflow-hidden ${isDone ? 'opacity-70' : ''}`}
          >
            {/* Header row */}
            <button
              type="button"
              className="w-full flex items-center gap-3 p-4 text-left"
              onClick={() => setExpandedId(isOpen ? null : step.id)}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-neutral-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Step {step.stepNumber}</p>
                <p className={`text-sm font-medium ${isDone || isSkipped ? 'line-through text-[hsl(var(--mobile-text-muted))]' : ''}`}>
                  {step.title}
                </p>
              </div>
              {step.estimatedMinutes && (
                <span className="text-xs text-[hsl(var(--mobile-text-muted))] shrink-0">{formatMinutes(step.estimatedMinutes)}</span>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t pt-3">
                <p className="text-sm text-[hsl(var(--mobile-text-secondary))] whitespace-pre-wrap">{step.description}</p>

                {step.safetyNote && <SafetyWarningBanner message={step.safetyNote} level="high" />}

                {step.tipNote && (
                  <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{step.tipNote}</p>
                  </div>
                )}

                {/* Notes */}
                <textarea
                  rows={2}
                  placeholder="Add a note…"
                  value={noteValues[step.id] ?? step.notes ?? ''}
                  onChange={(e) => setNoteValues((prev) => ({ ...prev, [step.id]: e.target.value }))}
                  className="w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--mobile-brand-strong))]"
                  disabled={disabled || isDone}
                />

                {/* Actions */}
                {!isDone && !isSkipped && (
                  <div className="flex gap-2">
                    {step.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={isPending || disabled}
                        onClick={() => handleStatus(step, 'IN_PROGRESS')}
                        className="flex-1 rounded-xl border border-[hsl(var(--mobile-brand-strong))] py-2 text-sm font-medium text-[hsl(var(--mobile-brand-strong))] disabled:opacity-50"
                      >
                        {isPending ? 'Saving…' : 'Start step'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isPending || disabled}
                      onClick={() => handleStatus(step, 'COMPLETED')}
                      className="flex-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : 'Mark done'}
                    </button>
                    {step.isOptional && (
                      <button
                        type="button"
                        disabled={isPending || disabled}
                        onClick={() => handleStatus(step, 'SKIPPED')}
                        className="rounded-xl border px-3 py-2 text-sm text-neutral-500 disabled:opacity-50"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
