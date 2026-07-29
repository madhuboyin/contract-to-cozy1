'use client';

import React from 'react';
import { CheckCircle2, DollarSign, Zap, Volume2, Shield, Clock, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { recordGuidanceToolStatus, type PrimaryPriority, type HomeOwnershipYears, type MustHave } from '@/lib/api/guidanceApi';

type ReplacementPrioritiesCaptureProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  toolKey: string;
  assetName?: string;
  onComplete: () => void;
};

const PRIORITY_OPTIONS: { value: PrimaryPriority; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: 'lowest_cost',          label: 'Lowest upfront cost',  Icon: DollarSign },
  { value: 'energy_savings',       label: 'Lowest energy bills',  Icon: Zap },
  { value: 'quiet_operation',      label: 'Quietest operation',   Icon: Volume2 },
  { value: 'long_term_reliability',label: 'Best reliability',     Icon: Shield },
  { value: 'fast_availability',    label: 'Fastest availability', Icon: Clock },
];

const TENURE_OPTIONS: { value: HomeOwnershipYears; label: string }[] = [
  { value: 'under_3', label: 'Less than 3 yrs' },
  { value: '3_to_7',  label: '3 – 7 years' },
  { value: '7_plus',  label: '7+ years' },
];

const MUST_HAVE_OPTIONS: { value: MustHave; label: string }[] = [
  { value: 'energy_star', label: 'Energy Star certified' },
  { value: 'smart_home',  label: 'Smart home / WiFi' },
  { value: 'specific_brand', label: 'Specific brand only' },
];

export function ReplacementPrioritiesCapture({
  propertyId,
  journeyId,
  stepId: _stepId,
  stepKey,
  toolKey,
  assetName = 'this item',
  onComplete,
}: ReplacementPrioritiesCaptureProps) {
  const queryClient = useQueryClient();

  const [budget, setBudget] = React.useState('');
  const [priority, setPriority] = React.useState<PrimaryPriority | null>(null);
  const [tenure, setTenure] = React.useState<HomeOwnershipYears | null>(null);
  const [mustHaves, setMustHaves] = React.useState<MustHave[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function toggleMustHave(value: MustHave) {
    setMustHaves((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function buildProducedData(skipped: boolean) {
    const budgetNum = budget.trim() ? Number(budget.trim()) : null;
    return {
      proofType: 'replacement_priorities',
      proofId: `${journeyId}:${stepKey}`,
      budgetMax: Number.isFinite(budgetNum) && budgetNum! > 0 ? budgetNum : null,
      primaryPriority: priority,
      homeOwnershipYears: tenure,
      mustHaves,
      skipped,
    };
  }

  async function handleSave(skipped: boolean) {
    setSaving(true);
    setError(null);
    try {
      await recordGuidanceToolStatus(propertyId, {
        journeyId,
        stepKey,
        sourceToolKey: toolKey,
        status: skipped ? 'SKIPPED' : 'COMPLETED',
        producedData: buildProducedData(skipped),
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setCompleted(true);
      onComplete();
    } catch {
      setError('Unable to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (completed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Priorities saved. Generating your tailored recommendations now.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Budget */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">
          What&apos;s your budget for replacing {assetName}?
          <span className="ml-1 font-normal text-slate-400">(optional)</span>
        </p>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 1200"
            className="h-11 w-full rounded-xl border border-black/10 bg-white pl-7 pr-4 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
          />
        </div>
      </div>

      {/* Primary priority */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">
          What matters most?
          <span className="ml-1 font-normal text-slate-400">(pick one, optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {PRIORITY_OPTIONS.map(({ value, label, Icon }) => {
            const selected = priority === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setPriority(selected ? null : value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all ${
                  selected
                    ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-300'
                    : 'border-black/10 bg-white text-slate-700 hover:border-emerald-200 hover:bg-slate-50'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-emerald-600' : 'text-slate-400'}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Home tenure */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">
          How long do you plan to stay?
          <span className="ml-1 font-normal text-slate-400">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {TENURE_OPTIONS.map(({ value, label }) => {
            const selected = tenure === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTenure(selected ? null : value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  selected
                    ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-300'
                    : 'border-black/10 bg-white text-slate-700 hover:border-emerald-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Must-haves */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">
          Any must-haves?
          <span className="ml-1 font-normal text-slate-400">(select all that apply)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {MUST_HAVE_OPTIONS.map(({ value, label }) => {
            const selected = mustHaves.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleMustHave(value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  selected
                    ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-300'
                    : 'border-black/10 bg-white text-slate-700 hover:border-emerald-200'
                }`}
              >
                {selected && <span className="mr-1">✓</span>}{label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-2 pt-1">
        <Button
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl"
          disabled={saving}
          onClick={() => handleSave(false)}
        >
          {saving ? 'Saving…' : 'Generate recommendations'}
          {!saving && <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          className="w-full rounded-2xl text-slate-500 hover:text-slate-700"
          disabled={saving}
          onClick={() => handleSave(true)}
        >
          Skip — use defaults
        </Button>
      </div>
    </div>
  );
}
