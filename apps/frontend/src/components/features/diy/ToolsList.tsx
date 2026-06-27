'use client';
import type { DiyProjectTool, DiyToolAction } from '@/types';

interface Props {
  tools: DiyProjectTool[];
  onActionChange?: (id: string, action: DiyToolAction) => void;
}

const ACTIONS: { value: DiyToolAction; label: string }[] = [
  { value: 'ALREADY_OWNED', label: 'I own it' },
  { value: 'RENT', label: 'Rent' },
  { value: 'BUY', label: 'Buy' },
];

export default function ToolsList({ tools, onActionChange }: Props) {
  return (
    <div className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] overflow-hidden">
      <div className="p-4 border-b">
        <p className="text-sm font-semibold">Tools Needed</p>
      </div>
      <ul className="divide-y">
        {tools.map((t) => (
          <li key={t.id} className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t.name}</p>
              {!t.isRequired && (
                <span className="text-xs text-[hsl(var(--mobile-text-muted))] bg-neutral-100 rounded-full px-2 py-0.5">Optional</span>
              )}
            </div>
            <div className="flex gap-2">
              {ACTIONS.map((a) => {
                const active = (t.userToolAction ?? t.defaultToolAction) === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => onActionChange?.(t.id, a.value)}
                    className={`flex-1 rounded-xl border py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))]/10 text-[hsl(var(--mobile-brand-strong))]'
                        : 'border-neutral-200 text-neutral-500'
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            {t.rentDailyPriceCents && (t.userToolAction ?? t.defaultToolAction) === 'RENT' && (
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
                ~${Math.round(t.rentDailyPriceCents / 100)}/day to rent
              </p>
            )}
            {t.buyEstimatePriceCents && (t.userToolAction ?? t.defaultToolAction) === 'BUY' && (
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
                ~${Math.round(t.buyEstimatePriceCents / 100)} to buy
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
