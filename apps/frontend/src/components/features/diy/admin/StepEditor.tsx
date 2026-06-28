'use client';
import { useState } from 'react';
import type { DiyTemplateStepInput } from '@/types';

interface Props {
  steps: DiyTemplateStepInput[];
  onChange: (steps: DiyTemplateStepInput[]) => void;
}

const emptyStep = (): DiyTemplateStepInput => ({
  title: '',
  description: '',
  estimatedMinutes: undefined,
  safetyNote: undefined,
  tipNote: undefined,
  imageUrl: undefined,
  isOptional: false,
});

export default function StepEditor({ steps, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  function add() {
    const next = [...steps, emptyStep()];
    onChange(next);
    setExpanded(next.length - 1);
  }

  function remove(i: number) {
    const next = steps.filter((_, idx) => idx !== i);
    onChange(next);
    if (expanded === i) setExpanded(null);
    else if (expanded !== null && expanded > i) setExpanded(expanded - 1);
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...steps];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
    setExpanded(i + dir);
  }

  function update(i: number, patch: Partial<DiyTemplateStepInput>) {
    const next = steps.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 bg-white">
          <div
            className="flex cursor-pointer items-center gap-3 px-4 py-3"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">
              {i + 1}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-neutral-800">
              {step.title || <span className="text-neutral-400 font-normal">Untitled step</span>}
            </span>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                title="Move up"
              >↑</button>
              <button
                disabled={i === steps.length - 1}
                onClick={() => move(i, 1)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                title="Move down"
              >↓</button>
              <button
                onClick={() => remove(i)}
                className="rounded p-1 text-red-400 hover:text-red-600"
                title="Remove"
              >×</button>
            </div>
            <span className="text-neutral-400 text-xs">{expanded === i ? '▲' : '▼'}</span>
          </div>

          {expanded === i && (
            <div className="border-t border-neutral-100 px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Title *</label>
                <input
                  type="text"
                  maxLength={120}
                  value={step.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Short step label"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Description *</label>
                <textarea
                  rows={4}
                  value={step.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Full instruction text (markdown supported)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Est. Minutes</label>
                  <input
                    type="number"
                    min={1}
                    value={step.estimatedMinutes ?? ''}
                    onChange={(e) => update(i, { estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step.isOptional}
                      onChange={(e) => update(i, { isOptional: e.target.checked })}
                      className="rounded"
                    />
                    Optional step
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Safety Note</label>
                <textarea
                  rows={2}
                  value={step.safetyNote ?? ''}
                  onChange={(e) => update(i, { safetyNote: e.target.value || undefined })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Shown as a warning callout if set"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Tip Note</label>
                <textarea
                  rows={2}
                  value={step.tipNote ?? ''}
                  onChange={(e) => update(i, { tipNote: e.target.value || undefined })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Shown as a green tip callout if set"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Image URL</label>
                <input
                  type="text"
                  value={step.imageUrl ?? ''}
                  onChange={(e) => update(i, { imageUrl: e.target.value || undefined })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="S3 URL for step illustration"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 py-2 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
      >
        + Add Step
      </button>
    </div>
  );
}
