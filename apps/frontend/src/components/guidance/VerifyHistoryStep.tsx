'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getGuidanceSymptomTypes,
  getAssetResolutionContext,
  recordGuidanceToolStatus,
} from '@/lib/api/guidanceApi';
import {
  createHomeEvent,
} from '@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi';
import { formatCurrency } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LookbackEntry = {
  occurredAt: string;
  title: string;
  cost: number | null;
  /** ISO date string for the date picker */
  dateValue: string;
};

type VerifyHistoryStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  /** InventoryItem id — used to load symptom types and asset history */
  inventoryItemId: string | null;
  /** Asset category key (e.g. HVAC, APPLIANCE) — drives symptom list */
  assetCategory?: string | null;
  /** Human-readable asset name for display */
  assetName?: string;
  /** Called after the step is successfully completed */
  onComplete: () => void;
};

// ---------------------------------------------------------------------------
// Helper: format a past date for display
// ---------------------------------------------------------------------------
function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VerifyHistoryStep({
  propertyId,
  journeyId,
  stepId: _stepId,
  stepKey,
  inventoryItemId,
  assetCategory,
  assetName = 'this item',
  onComplete,
}: VerifyHistoryStepProps) {
  const queryClient = useQueryClient();

  // ---- 1. Load symptom types for this asset category (FRD-FR-04) ----
  const symptomQuery = useQuery({
    queryKey: ['guidance', 'symptom-types', propertyId, assetCategory ?? 'DEFAULT'],
    queryFn: () => getGuidanceSymptomTypes(propertyId, assetCategory ?? undefined),
    staleTime: 10 * 60_000,
  });

  // ---- 2. Load 2-year lookback context (FRD-FR-03) ----
  const contextQuery = useQuery({
    queryKey: ['guidance', 'asset-context', propertyId, inventoryItemId],
    queryFn: () => getAssetResolutionContext(propertyId, inventoryItemId!),
    enabled: Boolean(inventoryItemId),
    staleTime: 5 * 60_000,
  });

  // ---- Local form state ----
  const [selectedSymptom, setSelectedSymptom] = React.useState<string>('');
  const [customSymptom, setCustomSymptom] = React.useState('');
  const [showLookbackForm, setShowLookbackForm] = React.useState(false);
  const [lookbackEntries, setLookbackEntries] = React.useState<LookbackEntry[]>([
    { occurredAt: '', title: '', cost: null, dateValue: '' },
  ]);
  const [submitState, setSubmitState] = React.useState<'idle' | 'saving' | 'done'>('idle');

  const symptomTypes = symptomQuery.data?.symptomTypes ?? [];
  const assetContext = contextQuery.data ?? null;

  // Show lookback form if the resolver says it's required and no history yet
  React.useEffect(() => {
    if (assetContext && assetContext.lookbackRequired && !assetContext.hasHistory) {
      setShowLookbackForm(true);
    }
  }, [assetContext]);

  // ---- Mutation: create retrospective home events ----
  const createEventMutation = useMutation({
    mutationFn: async (entry: LookbackEntry) => {
      if (!entry.title.trim() || !entry.occurredAt) return null;
      return createHomeEvent(propertyId, {
        type: 'REPAIR',
        title: entry.title.trim(),
        occurredAt: entry.occurredAt,
        amount: entry.cost ?? undefined,
        inventoryItemId: inventoryItemId ?? undefined,
        guidanceJourneyId: journeyId,
        isRetrospective: true,
        idempotencyKey: `guidance:verify_history:${journeyId}:${entry.occurredAt}`,
      });
    },
  });

  // ---- Submit handler ----
  async function handleSubmit() {
    const symptomValue = customSymptom.trim() || selectedSymptom;
    if (!symptomValue) return;

    setSubmitState('saving');
    try {
      // Save any lookback entries the user filled in
      if (showLookbackForm) {
        const filledEntries = lookbackEntries.filter((e) => e.title.trim() && e.occurredAt);
        await Promise.all(filledEntries.map((e) => createEventMutation.mutateAsync(e)));
      }

      // Record step completion via guidance tool-completion API
      await recordGuidanceToolStatus(propertyId, {
        journeyId,
        stepKey,
        sourceToolKey: 'history-verify',
        status: 'COMPLETED',
        producedData: {
          symptomKey: symptomValue,
          lookbackProvided: showLookbackForm,
          entriesRecorded: showLookbackForm
            ? lookbackEntries.filter((e) => e.title.trim() && e.occurredAt).length
            : 0,
        },
      });

      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setSubmitState('done');
      onComplete();
    } catch (err) {
      console.error('[VerifyHistoryStep] submit failed', err);
      setSubmitState('idle');
    }
  }

  // ---- Entry helpers ----
  function updateEntry(idx: number, patch: Partial<LookbackEntry>) {
    setLookbackEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    );
  }

  function addEntry() {
    setLookbackEntries((prev) => [
      ...prev,
      { occurredAt: '', title: '', cost: null, dateValue: '' },
    ]);
  }

  function removeEntry(idx: number) {
    setLookbackEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---- Done state ----
  if (submitState === 'done') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        History verified. Moving to the next step.
      </div>
    );
  }

  const symptomChosen = Boolean(selectedSymptom || customSymptom.trim());

  return (
    <div className="space-y-4">
      {/* ---- Existing history banner ---- */}
      {assetContext && assetContext.hasHistory && assetContext.recentEvents.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-semibold text-sky-800">Recent history for {assetName}</p>
          <ul className="space-y-1">
            {assetContext.recentEvents.slice(0, 3).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between text-xs text-sky-700">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {ev.title}
                </span>
                <span className="shrink-0 text-sky-600">
                  {ev.amount != null ? formatCurrency(ev.amount) + ' · ' : ''}
                  {formatEventDate(ev.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Symptom picker (FRD-FR-04) ---- */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">
          What symptom best describes the issue with {assetName}?
        </p>

        {symptomQuery.isLoading ? (
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">Loading symptom types…</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {symptomTypes.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSelectedSymptom(s.key);
                  setCustomSymptom('');
                }}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedSymptom === s.key
                    ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))] text-white'
                    : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))] hover:border-[hsl(var(--mobile-brand-strong))]/60',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder="Or describe it yourself…"
          value={customSymptom}
          onChange={(e) => {
            setCustomSymptom(e.target.value);
            if (e.target.value.trim()) setSelectedSymptom('');
          }}
          className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
        />
      </div>

      {/* ---- Lookback toggle (FRD-FR-03) ---- */}
      {assetContext && !assetContext.hasHistory && (
        <button
          type="button"
          onClick={() => setShowLookbackForm((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
        >
          <span>Add past repair or service events (last 2 years)</span>
          {showLookbackForm ? (
            <ChevronUp className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" />
          )}
        </button>
      )}

      {/* ---- Lookback form entries ---- */}
      {showLookbackForm && (
        <div className="space-y-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
            Tell us about any repairs, services, or replacements for {assetName} over the last 2 years.
            This helps us give you better guidance.
          </p>

          {lookbackEntries.map((entry, idx) => (
            <div key={idx} className="space-y-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
                  Event {idx + 1}
                </p>
                {lookbackEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="text-xs text-rose-500 hover:text-rose-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="What happened? e.g. Replaced compressor"
                value={entry.title}
                onChange={(e) => updateEntry(idx, { title: e.target.value })}
                className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-xs text-[hsl(var(--mobile-text-muted))]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={entry.dateValue}
                    onChange={(e) =>
                      updateEntry(idx, {
                        dateValue: e.target.value,
                        occurredAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : '',
                      })
                    }
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[hsl(var(--mobile-text-muted))]">
                    Cost (optional)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 450"
                    min={0}
                    value={entry.cost ?? ''}
                    onChange={(e) =>
                      updateEntry(idx, {
                        cost: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-1.5 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addEntry}
            className="text-xs font-medium text-[hsl(var(--mobile-brand-strong))] hover:underline"
          >
            + Add another event
          </button>
        </div>
      )}

      {/* ---- Submit ---- */}
      <Button
        className="min-h-[44px] w-full"
        disabled={!symptomChosen || submitState === 'saving'}
        onClick={handleSubmit}
      >
        {submitState === 'saving' ? 'Saving…' : 'Confirm & continue'}
      </Button>
    </div>
  );
}
