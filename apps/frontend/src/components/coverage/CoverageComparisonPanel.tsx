'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import {
  addCoverageComparisonOption,
  getCoverageComparisonWorkspace,
  recordCoverageDecision,
  type CoverageComparisonDTO,
  type CoverageComparisonFactDTO,
} from '@/lib/api/coverageAnalysisApi';
import type { Document } from '@/types';

const FIELD_LABELS: Record<string, string> = {
  ANNUAL_PREMIUM: 'Annual premium',
  ALL_PERIL_DEDUCTIBLE: 'All-peril deductible',
  DWELLING_LIMIT: 'Dwelling limit',
  PERSONAL_PROPERTY_LIMIT: 'Personal property limit',
  LIABILITY_LIMIT: 'Liability limit',
  POLICY_FORM: 'Policy form',
  VALUATION_BASIS: 'Valuation basis',
  ENDORSEMENTS: 'Endorsements',
};

type DecisionKind = 'KEEP' | 'CHANGE' | 'SHOP' | 'DEFER' | 'PROFESSIONAL_REVIEW';

function money(value: string | number | null | undefined, currency = 'USD') {
  if (value == null || value === '') return 'Unknown';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Unknown';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function factValue(fact: CoverageComparisonFactDTO | undefined) {
  if (!fact) return 'Unknown';
  if (fact.valueType === 'AMOUNT') return money(fact.amountValue, fact.currency ?? 'USD');
  if (fact.valueType === 'BOOLEAN') return fact.booleanValue ? 'Yes' : 'No';
  if (fact.valueType === 'JSON') {
    return Array.isArray(fact.jsonValue) ? fact.jsonValue.join(', ') || 'None listed' : 'Structured detail';
  }
  return fact.textValue || 'Unknown';
}

function statusCopy(status: string) {
  if (status === 'EQUIVALENT') return 'Equivalent on every confirmed field in the reviewed set';
  if (status === 'NON_EQUIVALENT') return 'Not coverage-equivalent';
  if (status === 'BASELINE') return 'Current verified policy';
  return 'Equivalence cannot be determined';
}

export default function CoverageComparisonPanel({
  propertyId,
  guidanceJourneyId,
  guidanceStepKey,
  sourceActionId,
}: {
  propertyId: string;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  sourceActionId?: string | null;
}) {
  const [comparison, setComparison] = useState<CoverageComparisonDTO | null>(null);
  const [state, setState] = useState<'LOADING' | 'BASELINE_REQUIRED' | 'READY' | 'ERROR'>('LOADING');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [sourceDocumentId, setSourceDocumentId] = useState('');
  const [sourcePage, setSourcePage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [decision, setDecision] = useState<DecisionKind>('KEEP');
  const [rationale, setRationale] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [workspace, documentResponse] = await Promise.all([
        getCoverageComparisonWorkspace(propertyId, {
          guidanceJourneyId,
          guidanceStepKey,
          sourceActionId,
        }),
        api.listDocuments(propertyId),
      ]);
      setComparison(workspace.comparison);
      setState(workspace.state);
      if (documentResponse.success) setDocuments(documentResponse.data.documents);
    } catch (loadError: any) {
      setError(loadError?.message ?? 'Unable to load the comparison.');
      setState('ERROR');
    }
  }, [guidanceJourneyId, guidanceStepKey, propertyId, sourceActionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const alternatives = useMemo(
    () => comparison?.options.filter((option) => option.optionType !== 'CURRENT_POLICY') ?? [],
    [comparison]
  );
  const latestDecision = comparison?.decisions[0] ?? null;

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function addQuoteOption() {
    if (!comparison || !sourceDocumentId || !label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const confirmationStatus = confirmed ? 'CONFIRMED' as const : 'PENDING' as const;
      const page = sourcePage ? Number(sourcePage) : null;
      const amountKeys = [
        'ANNUAL_PREMIUM',
        'ALL_PERIL_DEDUCTIBLE',
        'DWELLING_LIMIT',
        'PERSONAL_PROPERTY_LIMIT',
        'LIABILITY_LIMIT',
      ];
      const facts: CoverageComparisonFactDTO[] = amountKeys.flatMap((factKey) => {
        const value = values[factKey];
        return value
          ? [{
              factKey,
              valueType: 'AMOUNT' as const,
              amountValue: Number(value),
              currency: 'USD',
              confirmationStatus,
              sourcePage: page,
            }]
          : [];
      });
      for (const factKey of ['POLICY_FORM', 'VALUATION_BASIS']) {
        if (values[factKey]?.trim()) {
          facts.push({
            factKey,
            valueType: 'TEXT',
            textValue: values[factKey].trim(),
            confirmationStatus,
            sourcePage: page,
          });
        }
      }
      if (values.ENDORSEMENTS?.trim()) {
        facts.push({
          factKey: 'ENDORSEMENTS',
          valueType: 'JSON',
          jsonValue: values.ENDORSEMENTS.split(',').map((value) => value.trim()).filter(Boolean),
          confirmationStatus,
          sourcePage: page,
        });
      }
      await addCoverageComparisonOption(propertyId, comparison.id, {
        optionType: 'QUOTE_DOCUMENT',
        label: label.trim(),
        carrierName: carrierName.trim() || null,
        sourceDocumentId,
        facts,
      });
      setShowAdd(false);
      setLabel('');
      setCarrierName('');
      setSourceDocumentId('');
      setSourcePage('');
      setConfirmed(false);
      setValues({});
      await load();
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Unable to add this option.');
    } finally {
      setSaving(false);
    }
  }

  async function saveDecision() {
    if (!comparison) return;
    setSaving(true);
    setError(null);
    try {
      await recordCoverageDecision(propertyId, comparison.id, {
        decision,
        selectedOptionId: decision === 'CHANGE' ? selectedOptionId || null : null,
        rationale: rationale.trim() || null,
        guidanceJourneyId,
        guidanceStepKey,
        sourceActionId,
      });
      await load();
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Unable to record this decision.');
    } finally {
      setSaving(false);
    }
  }

  if (state === 'LOADING') {
    return <section className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading policy choices…</section>;
  }
  if (state === 'BASELINE_REQUIRED') {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card p-5">
        <h2 className="font-semibold">Confirm the current policy first</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A verified current term is required as the comparison baseline. An uploaded quote cannot
          be called equivalent without confirmed current protection facts.
        </p>
      </section>
    );
  }
  if (!comparison) {
    return <section className="rounded-xl border border-border bg-card p-4 text-sm text-destructive">{error ?? 'Comparison unavailable.'}</section>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision rule</p>
        <h2 className="mt-1 text-lg font-semibold">Compare protection before price</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Premium is shown for context but never determines equivalence or a “best” option. Unknown
          material facts block a recommendation.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {comparison.options.map((option) => (
          <section
            key={option.id}
            className={`rounded-xl border p-4 ${
              option.equivalenceStatus === 'NON_EQUIVALENT'
                ? 'border-amber-400 bg-amber-50/60'
                : option.equivalenceStatus === 'EQUIVALENT'
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{option.label}</h3>
                <p className="text-xs text-muted-foreground">
                  {option.carrierName || 'Carrier not entered'} · {option.sourceDocument?.name || 'No source name'}
                </p>
              </div>
              <span className="rounded-full border px-2 py-1 text-[11px] font-semibold">
                {statusCopy(option.equivalenceStatus)}
              </span>
            </div>
            <p className="mt-3 text-sm"><span className="font-medium">Observed annual premium:</span> {money(option.annualPremium, option.currency)}</p>
            {option.tradeoffsJson.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold">Protection tradeoffs</h4>
                <ul className="mt-1 space-y-1 text-sm">
                  {option.tradeoffsJson.map((tradeoff) => (
                    <li key={tradeoff.factKey}>
                      <span className="font-medium">{FIELD_LABELS[tradeoff.factKey] ?? tradeoff.factKey}:</span>{' '}
                      {factValue(tradeoff.baseline)} → {factValue(tradeoff.option)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {option.materialUnknownsJson.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold">Unknown material facts</h4>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                  {option.materialUnknownsJson.map((unknown) => (
                    <li key={`${unknown.factKey}-${unknown.missingFrom}`}>
                      {FIELD_LABELS[unknown.factKey] ?? unknown.factKey} ({unknown.missingFrom.toLowerCase()})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>

      {comparison.status === 'DRAFT' && (
        <section className="rounded-xl border border-border bg-card p-5">
          {!showAdd ? (
            <button type="button" onClick={() => setShowAdd(true)} className="rounded-md border border-border px-3 py-2 text-sm font-medium">
              Add a quote document
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Add confirmed quote facts</h3>
                <p className="text-sm text-muted-foreground">
                  Transcribe only what the linked quote document states. Blank fields remain unknown.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Option label<input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
                <label className="text-sm">Carrier<input value={carrierName} onChange={(event) => setCarrierName(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
                <label className="text-sm sm:col-span-2">Source document
                  <select value={sourceDocumentId} onChange={(event) => setSourceDocumentId(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2">
                    <option value="">Choose an uploaded document</option>
                    {documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">Source page<input type="number" min="1" value={sourcePage} onChange={(event) => setSourcePage(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
                {['ANNUAL_PREMIUM', 'ALL_PERIL_DEDUCTIBLE', 'DWELLING_LIMIT', 'PERSONAL_PROPERTY_LIMIT', 'LIABILITY_LIMIT'].map((key) => (
                  <label key={key} className="text-sm">{FIELD_LABELS[key]}<input type="number" min="0" value={values[key] ?? ''} onChange={(event) => setValue(key, event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
                ))}
                {['POLICY_FORM', 'VALUATION_BASIS'].map((key) => (
                  <label key={key} className="text-sm">{FIELD_LABELS[key]}<input value={values[key] ?? ''} onChange={(event) => setValue(key, event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
                ))}
                <label className="text-sm sm:col-span-2">Endorsements (comma separated)<input value={values.ENDORSEMENTS ?? ''} onChange={(event) => setValue('ENDORSEMENTS', event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
                I checked these values against the selected document. Without this confirmation,
                the fields remain pending and equivalence stays indeterminate.
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={saving || !label.trim() || !sourceDocumentId} onClick={() => void addQuoteOption()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Add option</button>
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Record your decision</h3>
        {latestDecision ? (
          <div className="mt-2 text-sm">
            <p><span className="font-medium">Recorded:</span> {latestDecision.decision.toLowerCase().replace(/_/g, ' ')}</p>
            {latestDecision.rationale && <p className="mt-1 text-muted-foreground">{latestDecision.rationale}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Saved to the Home Record and Home Timeline.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">Decision
              <select value={decision} onChange={(event) => setDecision(event.target.value as DecisionKind)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2">
                <option value="KEEP">Keep current policy</option>
                <option value="CHANGE">Change to an option</option>
                <option value="SHOP">Keep shopping</option>
                <option value="DEFER">Defer the decision</option>
                <option value="PROFESSIONAL_REVIEW">Seek licensed professional review</option>
              </select>
            </label>
            {decision === 'CHANGE' && (
              <label className="block text-sm">Selected option
                <select value={selectedOptionId} onChange={(event) => setSelectedOptionId(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2">
                  <option value="">Choose an option</option>
                  {alternatives.map((option) => <option key={option.id} value={option.id}>{option.label} — {statusCopy(option.equivalenceStatus)}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm">Rationale
              <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" placeholder="Optional unless changing to a non-equivalent or unresolved option." />
            </label>
            <button type="button" disabled={saving || (decision === 'CHANGE' && !selectedOptionId)} onClick={() => void saveDecision()} className="rounded-md bg-teal-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Record decision</button>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        This comparison organizes confirmed facts and tradeoffs. It does not recommend a carrier,
        determine claim coverage, bind insurance, or replace a licensed insurance professional.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
