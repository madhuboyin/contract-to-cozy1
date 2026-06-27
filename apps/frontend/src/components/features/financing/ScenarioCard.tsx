'use client';
// apps/frontend/src/components/features/financing/ScenarioCard.tsx
import React from 'react';
import Link from 'next/link';
import { ChevronRight, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FinancingScenarioSummary } from '@/types';
import { usd, OPTION_LABELS } from './FinancingUtils';

interface ScenarioCardProps {
  scenario: FinancingScenarioSummary;
  propertyId: string;
  onArchive?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  SAVED: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  DRAFT: 'border-amber-200/70 bg-amber-50/85 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300',
  ARCHIVED: 'border-slate-200/70 bg-slate-50/85 text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/50',
};

export default function ScenarioCard({ scenario, propertyId, onArchive }: ScenarioCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {scenario.title}
          </p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[scenario.status] ?? ''}`}
          >
            {scenario.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {usd(scenario.projectCostCents)}
          {scenario.selectedOption
            ? ` · ${OPTION_LABELS[scenario.selectedOption]}`
            : ''}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {new Date(scenario.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {onArchive && scenario.status !== 'ARCHIVED' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
            onClick={() => onArchive(scenario.id)}
            title="Archive scenario"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400" asChild>
          <Link href={`/dashboard/financing/scenarios/${scenario.id}?propertyId=${propertyId}`}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
