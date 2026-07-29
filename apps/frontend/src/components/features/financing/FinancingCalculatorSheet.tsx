'use client';
// apps/frontend/src/components/features/financing/FinancingCalculatorSheet.tsx
import React, { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import type {
  FinancingResultSet,
  FinancingOptionType,
  FinancingEntryPoint,
  EquityPosition,
} from '@/types';
import { usd } from './FinancingUtils';
import OptionComparisonTable from './OptionComparisonTable';

interface FinancingCalculatorSheetProps {
  propertyId: string;
  initialCostCents?: number;
  projectDescription?: string;
  entryPoint?: FinancingEntryPoint;
  sourceEntityType?: string;
  sourceEntityId?: string;
  equity?: EquityPosition | null;
  onScenarioSaved?: (scenarioId: string) => void;
}

export default function FinancingCalculatorSheet({
  propertyId,
  initialCostCents,
  projectDescription,
  entryPoint = 'DIRECT',
  sourceEntityType,
  sourceEntityId,
  equity,
  onScenarioSaved,
}: FinancingCalculatorSheetProps) {
  const [costStr, setCostStr] = useState(
    initialCostCents ? String(Math.round(initialCostCents / 100)) : '',
  );
  const [results, setResults] = useState<FinancingResultSet | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<FinancingOptionType | undefined>();

  const [saveTitle, setSaveTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const costCents = Math.round(parseFloat(costStr.replace(/[^0-9.]/g, '')) * 100) || 0;

  async function calculate() {
    if (!costCents) return;
    setCalculating(true);
    setCalcError(null);
    setResults(null);
    setSaved(false);
    setSelectedOption(undefined);
    try {
      const r = await api.calculateFinancing(propertyId, costCents);
      setResults(r);
    } catch (err: any) {
      setCalcError(err?.message ?? 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  }

  async function saveScenario() {
    if (!results || !saveTitle.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const scenario = await api.createFinancingScenario(propertyId, {
        title: saveTitle.trim(),
        projectDescription,
        projectCostCents: costCents,
        entryPoint,
        sourceEntityType,
        sourceEntityId,
        ...(selectedOption && { selectedOption } as any),
      });
      setSaved(true);
      onScenarioSaved?.(scenario.id);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save scenario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Project context */}
      {projectDescription && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Project
          </p>
          <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{projectDescription}</p>
        </div>
      )}

      {/* Cost input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Project cost estimate</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <Input
              className="pl-7"
              placeholder="10,000"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && calculate()}
            />
          </div>
          <Button onClick={calculate} disabled={!costCents || calculating} className="shrink-0">
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calculate'}
          </Button>
        </div>
        {calcError && (
          <p className="text-xs text-red-500">{calcError}</p>
        )}
      </div>

      {/* Equity context */}
      {results && (
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3 text-sm dark:border-slate-700/50 dark:bg-slate-900/40">
          {results.helocEligible ? (
            <p className="text-slate-700 dark:text-slate-300">
              You have ~<strong>{usd(results.helocCapacityCents)}</strong> in usable equity —
              HELOC and Home Equity Loan options are available.
            </p>
          ) : equity ? (
            <p className="text-slate-500">
              Your current equity position doesn&apos;t meet lender HELOC requirements (need ≥ 20%
              equity and LTV ≤ 85%).
            </p>
          ) : (
            <p className="text-slate-500">
              <a
                href={`/dashboard/properties/${propertyId}/tools/financing/profile`}
                className="underline"
              >
                Add your mortgage details
              </a>{' '}
              to see HELOC options.
            </p>
          )}
        </div>
      )}

      {/* Option comparison */}
      {results && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Financing options for {usd(costCents)}
          </p>
          <OptionComparisonTable
            results={results}
            selectedOption={selectedOption}
            onSelect={setSelectedOption}
          />
        </div>
      )}

      {/* Save scenario */}
      {results && !saved && (
        <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Label className="text-sm font-medium">Save this scenario</Label>
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "HVAC Replacement — July 2026"'
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={saveScenario}
              disabled={!saveTitle.trim() || saving}
              variant="outline"
              className="shrink-0"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      )}

      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Scenario saved. View it under Saved Scenarios.
        </div>
      )}

      {/* Disclaimer */}
      {results && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-relaxed text-slate-500">
            {results.disclaimer} Rates updated{' '}
            {new Date(results.ratesAsOf).toLocaleDateString()}.
          </p>
        </div>
      )}
    </div>
  );
}
