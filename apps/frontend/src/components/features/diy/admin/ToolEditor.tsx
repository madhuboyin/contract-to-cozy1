'use client';
import type { DiyTemplateToolInput, DiyToolAction } from '@/types';

interface Props {
  tools: DiyTemplateToolInput[];
  onChange: (tools: DiyTemplateToolInput[]) => void;
}

const TOOL_ACTIONS: { value: DiyToolAction; label: string }[] = [
  { value: 'ALREADY_OWNED', label: 'Already Owned' },
  { value: 'RENT', label: 'Rent' },
  { value: 'BUY', label: 'Buy' },
];

const emptyTool = (): DiyTemplateToolInput => ({
  name: '',
  isRequired: true,
  defaultToolAction: 'ALREADY_OWNED',
});

function centsToDisplay(cents?: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function displayToCents(val: string) {
  const n = parseFloat(val);
  return isNaN(n) ? undefined : Math.round(n * 100);
}

export default function ToolEditor({ tools, onChange }: Props) {
  function add() {
    onChange([...tools, emptyTool()]);
  }

  function remove(i: number) {
    onChange(tools.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...tools];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  }

  function update(i: number, patch: Partial<DiyTemplateToolInput>) {
    onChange(tools.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }

  return (
    <div className="space-y-2">
      {tools.map((tool, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex-1 text-sm font-medium text-neutral-700">
              {tool.name || <span className="text-neutral-400 font-normal">Untitled tool</span>}
            </span>
            <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 text-xs">↑</button>
            <button disabled={i === tools.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 text-xs">↓</button>
            <button onClick={() => remove(i)} className="rounded p-1 text-red-400 hover:text-red-600 text-xs">×</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Name *</label>
              <input
                type="text"
                value={tool.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="e.g. Cordless Drill"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Canonical ID</label>
              <input
                type="text"
                value={tool.canonicalId ?? ''}
                onChange={(e) => update(i, { canonicalId: e.target.value || undefined })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="e.g. cordless_drill"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Default Action *</label>
              <select
                value={tool.defaultToolAction}
                onChange={(e) => update(i, { defaultToolAction: e.target.value as DiyToolAction })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {TOOL_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Description</label>
              <input
                type="text"
                value={tool.description ?? ''}
                onChange={(e) => update(i, { description: e.target.value || undefined })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Rent Daily Price ($)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={centsToDisplay(tool.rentDailyPriceCents)}
                onChange={(e) => update(i, { rentDailyPriceCents: displayToCents(e.target.value) })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="25.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Buy Estimate ($)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={centsToDisplay(tool.buyEstimatePriceCents)}
                onChange={(e) => update(i, { buyEstimatePriceCents: displayToCents(e.target.value) })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="80.00"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={tool.isRequired}
              onChange={(e) => update(i, { isRequired: e.target.checked })}
              className="rounded"
            />
            Required tool
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 py-2 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
      >
        + Add Tool
      </button>
    </div>
  );
}
