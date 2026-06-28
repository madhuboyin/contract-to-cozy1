'use client';
import { useState } from 'react';
import type { DiyTemplateMaterialInput } from '@/types';

interface Props {
  materials: DiyTemplateMaterialInput[];
  onChange: (materials: DiyTemplateMaterialInput[]) => void;
}

const UNITS = ['each', 'sq ft', 'linear ft', 'oz', 'gal', 'pack'];

const emptyMaterial = (): DiyTemplateMaterialInput => ({
  name: '',
  unit: 'each',
  quantityFormula: '1',
  unitPriceCents: 0,
  isOptional: false,
});

const FORMULA_TOKENS = [
  { token: 'ceiling_sqft', desc: 'Room ceiling area' },
  { token: 'floor_sqft', desc: 'Room floor area' },
  { token: 'perimeter_ft', desc: 'Room perimeter' },
  { token: 'wall_sqft', desc: 'Total wall area (excl. windows/doors)' },
];

export default function MaterialEditor({ materials, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);

  function add() {
    const next = [...materials, emptyMaterial()];
    onChange(next);
    setExpanded(next.length - 1);
  }

  function remove(i: number) {
    onChange(materials.filter((_, idx) => idx !== i));
    if (expanded === i) setExpanded(null);
    else if (expanded !== null && expanded > i) setExpanded(expanded - 1);
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...materials];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
    setExpanded(i + dir);
  }

  function update(i: number, patch: Partial<DiyTemplateMaterialInput>) {
    onChange(materials.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }

  function centsToDisplay(cents: number) {
    return cents ? (cents / 100).toFixed(2) : '';
  }

  function displayToCents(val: string) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }

  return (
    <div className="space-y-2">
      {materials.map((mat, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 bg-white">
          <div
            className="flex cursor-pointer items-center gap-3 px-4 py-3"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="flex-1 truncate text-sm font-medium text-neutral-800">
              {mat.name || <span className="text-neutral-400 font-normal">Untitled material</span>}
            </span>
            <span className="text-xs text-neutral-400">{mat.quantityFormula} {mat.unit}</span>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30">↑</button>
              <button disabled={i === materials.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30">↓</button>
              <button onClick={() => remove(i)} className="rounded p-1 text-red-400 hover:text-red-600">×</button>
            </div>
            <span className="text-neutral-400 text-xs">{expanded === i ? '▲' : '▼'}</span>
          </div>

          {expanded === i && (
            <div className="border-t border-neutral-100 px-4 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Name *</label>
                  <input
                    type="text"
                    maxLength={150}
                    value={mat.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. HVAC Filter 16×25×1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Description</label>
                  <input
                    type="text"
                    value={mat.description ?? ''}
                    onChange={(e) => update(i, { description: e.target.value || undefined })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Brand notes or spec"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Unit *</label>
                  <select
                    value={mat.unit}
                    onChange={(e) => update(i, { unit: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-neutral-600">Quantity Formula *</label>
                    <button
                      type="button"
                      onClick={() => setShowFormulaHelp(!showFormulaHelp)}
                      className="text-xs text-blue-500 hover:underline"
                    >?</button>
                  </div>
                  <input
                    type="text"
                    value={mat.quantityFormula}
                    onChange={(e) => update(i, { quantityFormula: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder='e.g. "1" or "floor_sqft * 0.1"'
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Unit Price ($) *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={centsToDisplay(mat.unitPriceCents)}
                    onChange={(e) => update(i, { unitPriceCents: displayToCents(e.target.value) })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="12.50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Purchase Note</label>
                <input
                  type="text"
                  value={mat.purchaseNote ?? ''}
                  onChange={(e) => update(i, { purchaseNote: e.target.value || undefined })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Where to buy or brand recommendations"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mat.isOptional}
                  onChange={(e) => update(i, { isOptional: e.target.checked })}
                  className="rounded"
                />
                Optional material
              </label>
            </div>
          )}
        </div>
      ))}

      {showFormulaHelp && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800">
          <p className="font-semibold mb-2">Quantity formula tokens</p>
          {FORMULA_TOKENS.map(({ token, desc }) => (
            <div key={token} className="flex gap-2">
              <code className="font-mono">{token}</code>
              <span className="text-blue-600">— {desc}</span>
            </div>
          ))}
          <p className="mt-2 text-blue-600">If room data is unavailable, a conservative default is used per token.</p>
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 py-2 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
      >
        + Add Material
      </button>
    </div>
  );
}
