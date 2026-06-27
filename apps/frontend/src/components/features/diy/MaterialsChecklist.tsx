'use client';
import { useState } from 'react';
import { CheckSquare2, Square } from 'lucide-react';
import type { DiyProjectMaterial } from '@/types';

interface Props {
  materials: DiyProjectMaterial[];
  onToggle?: (id: string, purchased: boolean) => void;
}

export default function MaterialsChecklist({ materials, onToggle }: Props) {
  const [purchased, setPurchased] = useState<Record<string, boolean>>(
    Object.fromEntries(materials.map((m) => [m.id, m.isPurchased])),
  );

  function handleToggle(id: string) {
    const next = !purchased[id];
    setPurchased((p) => ({ ...p, [id]: next }));
    onToggle?.(id, next);
  }

  const totalCents = materials.reduce((sum, m) => sum + m.totalEstimateCents, 0);

  return (
    <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <p className="text-sm font-semibold">Materials</p>
        <p className="text-sm text-[hsl(var(--mobile-text-muted))]">
          Est. ${Math.round(totalCents / 100).toLocaleString()}
        </p>
      </div>
      <ul className="divide-y">
        {materials.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => handleToggle(m.id)} className="shrink-0">
              {purchased[m.id]
                ? <CheckSquare2 className="h-5 w-5 text-green-500" />
                : <Square className="h-5 w-5 text-neutral-300" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${purchased[m.id] ? 'line-through text-neutral-400' : ''}`}>{m.name}</p>
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
                {Number(m.quantity)} {m.unit}
                {m.purchaseNote && ` · ${m.purchaseNote}`}
              </p>
            </div>
            <p className="shrink-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
              ${Math.round(m.totalEstimateCents / 100).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
